from __future__ import annotations

from dataclasses import dataclass

from architecture.host_context import HostContext, detect_host_context
from config.loader import load_environment
from core.context import ExecutionContext
from core.result import TaskStatus
from roles.application.workflow import build_application_full_workflow
from roles.database.workflow import build_database_core_install_workflow
from roles.reverse_proxy.workflow import build_reverse_proxy_workflow

from .health import EnvironmentHealth, inspect_environment
from .network import NetworkCheckpoint, evaluate_network


@dataclass(frozen=True)
class FullEnvironmentResult:
    status: str
    local_role: str | None
    local_workflow_status: str | None
    network: tuple[NetworkCheckpoint, ...]
    health: EnvironmentHealth
    remote_actions: tuple[str, ...]

    @property
    def ok(self) -> bool:
        return self.status == "HEALTHY"


def _profile(ctx: ExecutionContext):
    path = ctx.variables.get("environment_profile")
    if not path:
        raise ValueError("environment_profile is required")
    return load_environment(path)


def _workflow_for_role(role: str):
    if role == "database":
        return build_database_core_install_workflow()
    if role == "application":
        return build_application_full_workflow()
    if role == "reverse_proxy":
        return build_reverse_proxy_workflow()
    raise RuntimeError(f"unsupported local role for full environment provisioning: {role}")


def _remote_actions(environment, local: HostContext) -> tuple[str, ...]:
    actions: list[str] = []
    profile = "${SPARK_ENV_PROFILE:-/etc/spark-manager/environments/production.yaml}"
    for name, node in environment.nodes.items():
        hosts = (node.host, *node.secondary_hosts)
        for host in hosts:
            if host in local.addresses:
                continue
            actions.append(f"{node.role}@{host}: spark-architecture install-full --profile {profile} --resume")
    return tuple(actions)


def _local_healthy(role: str, health: EnvironmentHealth, local: HostContext) -> bool:
    checks = health.checks
    if role == "database":
        return all(checks.get(key) == "PASS" for key in ("auth", "rest", "realtime", "storage"))
    if role == "application":
        return all(checks.get(key) == "PASS" for key in ("frontend", "edge_functions"))
    if role == "reverse_proxy":
        return any(checks.get(key) == "PASS" for key in checks if key.startswith("reverse_proxy_"))
    return False


class FullEnvironmentOrchestrator:
    def install(self, ctx: ExecutionContext) -> FullEnvironmentResult:
        environment = _profile(ctx)
        local = ctx.variables.get("host_context") or detect_host_context(environment)
        if not local.detected_role:
            raise RuntimeError("REFUSED: current host does not match any architecture role")
        workflow = _workflow_for_role(local.detected_role)
        local_result = workflow.execute(ctx)
        health = inspect_environment(environment)
        network = evaluate_network(environment, local)
        waiting = any(item.status.startswith("WAITING") for item in network) or health.waiting
        remote = _remote_actions(environment, local)
        if local_result.status != TaskStatus.SUCCESS:
            status = "WAITING_OR_FAILED"
        elif health.healthy and not remote and not waiting:
            status = "HEALTHY"
        elif waiting or remote:
            status = "WAITING_FOR_OPERATOR"
        else:
            status = "DEGRADED"
        return FullEnvironmentResult(status, local.detected_role, local_result.status.value, network, health, remote)

    def status(self, ctx: ExecutionContext) -> FullEnvironmentResult:
        environment = _profile(ctx)
        local = ctx.variables.get("host_context") or detect_host_context(environment)
        health = inspect_environment(environment)
        network = evaluate_network(environment, local)
        remote = _remote_actions(environment, local)
        status = "HEALTHY" if health.healthy and not remote and all(item.status == "PASS" for item in network) else ("WAITING_FOR_OPERATOR" if health.waiting or remote or any(item.status.startswith("WAITING") for item in network) else "DEGRADED")
        return FullEnvironmentResult(status, local.detected_role, None, network, health, remote)

    def repair(self, ctx: ExecutionContext) -> FullEnvironmentResult:
        environment = _profile(ctx)
        local = ctx.variables.get("host_context") or detect_host_context(environment)
        if not local.detected_role:
            raise RuntimeError("REFUSED: current host does not match any architecture role")
        health = inspect_environment(environment)
        if _local_healthy(local.detected_role, health, local):
            network = evaluate_network(environment, local)
            return FullEnvironmentResult("LOCAL_ROLE_HEALTHY", local.detected_role, "SKIPPED", network, health, _remote_actions(environment, local))
        return self.install(ctx)
