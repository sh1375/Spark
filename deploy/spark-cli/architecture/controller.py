from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from config.loader import load_environment
from core.context import ExecutionContext
from core.state import StateStore
from roles.application.workflow import build_application_full_workflow
from roles.database.workflow import build_database_core_install_workflow
from roles.environment import FullEnvironmentOrchestrator
from roles.environment.health import inspect_environment
from roles.environment.remote import CentralizedExecutor
from roles.reverse_proxy.workflow import build_reverse_proxy_workflow
from .connectivity import check_connectivity
from .host_context import detect_host_context
from .renderer import render_architecture_overview
from .status import deployment_readiness
from .validator import validate_architecture

DEFAULT_PROFILE = Path("/etc/spark-manager/environments/production.yaml")
BUNDLED_PROFILE = Path(__file__).resolve().parents[1] / "config/environments/example.production.yaml"
REVISION_FILE = Path("/usr/local/lib/spark-manager/.revision")


@dataclass(frozen=True)
class ControllerResult:
    title: str
    lines: tuple[str, ...]
    success: bool = True


def resolve_profile_path() -> Path:
    explicit = os.environ.get("SPARK_ENV_PROFILE")
    if explicit:
        return Path(explicit)
    if DEFAULT_PROFILE.is_file():
        return DEFAULT_PROFILE
    return BUNDLED_PROFILE


def _load():
    path = resolve_profile_path()
    if not path.is_file():
        raise FileNotFoundError(f"environment profile not found: {path}")
    return path, load_environment(path)


def _manager_revision() -> str:
    env = os.environ.get("SPARK_MANAGER_REVISION", "").strip()
    if env:
        return env
    if REVISION_FILE.is_file():
        value = REVISION_FILE.read_text().strip()
        if value:
            return value
    raise RuntimeError("Spark Manager revision marker is missing")


def _context(*, dry_run: bool = False, resume: bool = False) -> ExecutionContext:
    path, config = _load()
    host = detect_host_context(config)
    return ExecutionContext(
        environment=config.name,
        mode=config.mode,
        dry_run=dry_run,
        resume=resume,
        variables={"environment_profile": str(path), "host_context": host},
        state=StateStore(config.runtime.state_root + "/workflows"),
    )


def architecture_revision() -> ControllerResult:
    revision = _manager_revision()
    return ControllerResult("Spark Manager Revision", (f"Revision: {revision}",))


def architecture_show() -> ControllerResult:
    path, config = _load()
    host = detect_host_context(config)
    return ControllerResult("Architecture Overview", tuple([f"Profile: {path}", "", *render_architecture_overview(config, host)]))


def architecture_profile() -> ControllerResult:
    path, config = _load()
    lines = [
        f"Profile: {path}", f"Schema version: {config.schema_version}", f"Environment: {config.name}", f"Mode: {config.mode}",
        f"Nodes: {len(config.nodes)}", f"External services: {len(config.external_services)}", f"Network rules: {len(config.network.rules)}",
        f"Full-environment network rules: {len(config.full_environment.network_rules)}", "Secrets: forbidden by loader policy",
    ]
    return ControllerResult("Environment Profile", tuple(lines))


def architecture_validate() -> ControllerResult:
    path, config = _load()
    report = validate_architecture(config)
    lines = [f"Profile: {path}", ""] + [f"{item.status.value:<14} {item.check}: {item.message}" for item in report.issues]
    return ControllerResult("Validate Architecture", tuple(lines), report.ok)


def architecture_network_check() -> ControllerResult:
    path, config = _load()
    host = detect_host_context(config)
    checks = check_connectivity(config, host)
    lines = [f"Profile: {path}", f"Current role: {host.detected_role or 'UNKNOWN'}", ""]
    if not checks:
        lines.append("NOT_APPLICABLE  No declarative network rules configured")
    for check in checks:
        lines.append(f"{check.status.value:<14} {check.rule_id}: {check.source} -> {check.destination}:{check.port} | {check.message}")
    success = not any(check.status.value == "FAIL" for check in checks)
    return ControllerResult("Network Connectivity", tuple(lines), success)


def architecture_role_health() -> ControllerResult:
    path, config = _load()
    host = detect_host_context(config)
    role = host.detected_role
    if not role:
        return ControllerResult("Role Health", ("REFUSED: current host does not match a configured role",), False)
    health = inspect_environment(config).checks
    if role == "database":
        keys = ("auth", "rest", "realtime", "storage")
    elif role == "application":
        keys = ("frontend", "edge_functions")
    else:
        keys = ("frontend", "auth", "rest", "realtime", "storage", "edge_functions")
    lines = [f"Profile: {path}", f"Current role: {role}"]
    ok = True
    for key in keys:
        item = health.get(key)
        if item is None:
            lines.append(f"WAITING        {key}: no health result")
            ok = False
            continue
        lines.append(f"{item.status.value:<14} {key}: {item.message}")
        if item.status.value == "FAIL":
            ok = False
    return ControllerResult("Role Health", tuple(lines), ok)


def architecture_status() -> ControllerResult:
    path, config = _load()
    host = detect_host_context(config)
    return ControllerResult("Architecture Status", tuple(deployment_readiness(config, host)))


def _run_workflow(builder, title: str, *, dry_run: bool = False, resume: bool = False) -> ControllerResult:
    result = builder().execute(_context(dry_run=dry_run, resume=resume))
    lines = [f"{task_id:<28} {task.status.value.upper():<8} {task.message}" for task_id, task in result.results.items()]
    return ControllerResult(title, tuple(lines), result.ok)


def architecture_install_database(*, dry_run: bool = False, resume: bool = False) -> ControllerResult:
    return _run_workflow(build_database_core_install_workflow, "Install Database Role", dry_run=dry_run, resume=resume)


def architecture_install_application(*, dry_run: bool = False, resume: bool = False) -> ControllerResult:
    return _run_workflow(build_application_full_workflow, "Install Application Role", dry_run=dry_run, resume=resume)


def architecture_install_proxy(*, dry_run: bool = False, resume: bool = False) -> ControllerResult:
    return _run_workflow(build_reverse_proxy_workflow, "Install Reverse Proxy Role", dry_run=dry_run, resume=resume)


def _central(action: str, *, dry_run: bool = False, resume: bool = False) -> ControllerResult:
    path, profile = _load()
    executor = CentralizedExecutor(profile, profile_path=path)
    if action == "plan":
        result = executor.plan()
    elif action == "status":
        result = executor.status()
    elif action == "repair":
        result = executor.repair(dry_run=dry_run)
    else:
        result = executor.install(dry_run=dry_run, resume=resume)
    return ControllerResult(result.title, tuple(result.lines), result.success)


def architecture_full(*, dry_run: bool = False, resume: bool = False, centralized: bool = False) -> ControllerResult:
    if centralized:
        return _central("install", dry_run=dry_run, resume=resume)
    path, config = _load()
    orchestrator = FullEnvironmentOrchestrator(config, profile_path=path)
    result = orchestrator.run(dry_run=dry_run, resume=resume)
    return ControllerResult(result.title, tuple(result.lines), result.success)


def architecture_resume(*, dry_run: bool = False, centralized: bool = False) -> ControllerResult:
    return architecture_full(dry_run=dry_run, resume=True, centralized=centralized)


def architecture_validate_environment() -> ControllerResult:
    path, config = _load()
    host = detect_host_context(config)
    return ControllerResult("Environment Validation", tuple(deployment_readiness(config, host)))


def architecture_repair(*, dry_run: bool = False, centralized: bool = False) -> ControllerResult:
    if centralized:
        return _central("repair", dry_run=dry_run)
    path, config = _load()
    orchestrator = FullEnvironmentOrchestrator(config, profile_path=path)
    result = orchestrator.repair(dry_run=dry_run)
    return ControllerResult(result.title, tuple(result.lines), result.success)


def run_action(action: str, *, dry_run: bool = False, resume: bool = False, centralized: bool = False) -> ControllerResult:
    actions = {
        "architecture-revision": architecture_revision,
        "architecture-overview": architecture_show,
        "architecture-profile": architecture_profile,
        "architecture-validate": architecture_validate,
        "architecture-network": architecture_network_check,
        "architecture-role-health": architecture_role_health,
        "architecture-status": architecture_status,
        "architecture-install-database": lambda: architecture_install_database(dry_run=dry_run, resume=resume),
        "architecture-install-application": lambda: architecture_install_application(dry_run=dry_run, resume=resume),
        "architecture-install-proxy": lambda: architecture_install_proxy(dry_run=dry_run, resume=resume),
        "architecture-install-full": lambda: architecture_full(dry_run=dry_run, resume=resume, centralized=centralized),
        "architecture-resume": lambda: architecture_resume(dry_run=dry_run, centralized=centralized),
        "architecture-validate-environment": architecture_validate_environment,
        "architecture-repair": lambda: architecture_repair(dry_run=dry_run, centralized=centralized),
        "architecture-central-plan": lambda: _central("plan"),
        "architecture-central-status": lambda: _central("status"),
    }
    if action not in actions:
        return ControllerResult("Architecture", (f"Unknown architecture action: {action}",), False)
    try:
        return actions[action]()
    except Exception as exc:
        return ControllerResult("Architecture", (f"ERROR: {exc}",), False)
