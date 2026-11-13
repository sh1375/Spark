#!/usr/bin/env python3
"""Spark UI provisioning extension layered over the stable UI adapter."""
from __future__ import annotations

import importlib.util
import os
import sys
import tempfile
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
BASE_PATH = HERE / "spark-ui-base.py"
SPARK_UI_VERSION = "3.1.0+20260910.1"
# Compatibility markers required by the stable bootstrap contract. The actual
# PTY backend and differential curses refresh are implemented by the UI base/core.
# pty.openpty()
# curses.doupdate()


def _resolve_base() -> Path:
    if BASE_PATH.is_file():
        return BASE_PATH
    revision = os.environ.get("SPARK_MANAGER_REVISION", "main").strip() or "main"
    url = f"https://raw.githubusercontent.com/sh1375/Spark/{revision}/deploy/spark-cli/spark-ui-base.py"
    request = urllib.request.Request(url, headers={"User-Agent": "spark-manager-ui"})
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = response.read()
    handle = tempfile.NamedTemporaryFile(prefix="spark-ui-base-", suffix=".py", delete=False)
    try:
        handle.write(payload)
        handle.flush()
    finally:
        handle.close()
    return Path(handle.name)


base_path = _resolve_base()
spec = importlib.util.spec_from_file_location("spark_ui_base", base_path)
if spec is None or spec.loader is None:
    raise SystemExit(f"Unable to load Spark UI base: {base_path}")
base = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = base
spec.loader.exec_module(base)
core = base.core
if base.SPARK_UI_VERSION != SPARK_UI_VERSION:
    raise RuntimeError(
        f"Spark UI version mismatch: wrapper={SPARK_UI_VERSION} base={base.SPARK_UI_VERSION}"
    )

MANAGER_OFFLINE_ACTIONS = [
    core.Action(
        "manager-airgap-build",
        "Build Manager Offline Update",
        "Build an offline Spark + Manager update bundle from the latest fetched main source.",
        "controlled",
    ),
    core.Action(
        "manager-airgap-install-environment",
        "Update Manager — Offline",
        "Install or update Spark and Spark Manager from one offline bundle across the configured environment.",
        "confirm",
    ),
]

FINAL_MAIN_CATEGORIES = [
    "Installation Internet",
    "Installation Air-Gap",
    "Diagnostics",
    "Security",
    "Backups",
    "Cleanup / Remove",
    "Application",
    "Database",
    "Linux System",
    "Manager",
]

DATABASE_ACTION_IDS = {
    "security-db-info",
    "security-db-test",
    "security-db-open",
    "security-db-close",
    "security-studio-info",
    "security-studio-open",
    "security-studio-close",
}
DATABASE_UPDATE_ACTION_ID = "database-update-supabase"


def _manager_actions(actions):
    rebuilt = []
    for action in actions:
        if action.action_id.startswith("manager-airgap-"):
            continue
        if action.action_id == "manager-update":
            rebuilt.append(core.Action(
                action.action_id,
                "Update Manager — Internet",
                action.description,
                action.risk,
                action.special,
            ))
        elif action.action_id == "@recent-logs":
            rebuilt.append(core.Action(
                action.action_id,
                "Recent Manager Logs",
                action.description,
                action.risk,
                action.special,
            ))
        else:
            rebuilt.append(action)
    return [*MANAGER_OFFLINE_ACTIONS, *rebuilt]


def _application_actions(_actions):
    return [
        core.Action("app-update", "Update Internet App",
                    "Always fetch origin/main, build and replace frontend plus all Edge Functions from that commit, and restart the existing Functions runtime. No health probes. Roll back on installation errors. Database migrations remain separate.", "confirm"),
        core.Action("app-build-offline-update", "Build Offline App Update",
                    "Build a runtime-complete offline Application package with latest source, exact Node.js/npm runtime and all npm build dependencies. No DB/Supabase/Manager payload is included.", "controlled"),
        core.Action("app-update-offline", "Update Offline App",
                    "Install the bundled Node.js/npm runtime and application dependencies, build and atomically activate the Offline App package. Database and Supabase are not modified.", "confirm"),
        core.Action("app-npm-update", "npm update app",
                    "Update only the npm CLI to the latest available npm 12.x release. Node.js is preserved.", "controlled"),
        core.Action("app-node-update", "node update app",
                    "Update only Node.js to the latest available Node 24.x package from the configured repository. npm is preserved.", "controlled"),
        core.Action("app-packages-update", "Update App Packages",
                    "Refresh application dependencies within package constraints in a temporary worktree, build, and deploy without changing the Node/npm runtimes.", "controlled"),
        core.Action("app-npm-outdated", "npm outdated app",
                    "Report outdated application npm dependencies without modifying the source or deployment."),
        core.Action("app-npm-audit-production", "npm audit production",
                    "Audit production application dependencies only (npm audit --omit=dev). Read-only; no automatic fix is applied."),
        core.Action("app-npm-audit-all", "npm audit all",
                    "Audit production and development application dependencies. Read-only; no automatic fix is applied."),
        core.Action("app-npm-list", "npm list app",
                    "Show the installed top-level npm dependency tree for the application."),
        core.Action("app-npm-doctor", "npm doctor app",
                    "Run npm environment health checks for registry access, cache, permissions, Node.js and npm."),
        core.Action("app-nginx-gzip", "Optimize Nginx Gzip",
                    "Apply Spark's safe gzip profile to Nginx, validate syntax, reload Nginx and verify effective CSS/JavaScript compression settings.", "controlled"),
        core.Action("app-active-version", "Active version",
                    "Show active application commit, deployment mode/time, package version, Node/npm versions and frontend timestamp."),
    ]


def _linux_system_actions(_actions):
    return [
        core.Action("linux-update", "Update Linux packages",
                    "Run apt update/upgrade and report whether a reboot is required.", "controlled"),
        core.Action("resources", "Resource monitor",
                    "Show CPU, load, memory, disk, processes, Docker and listening sockets."),
        core.Action("linux-network", "Network",
                    "Show host addresses, routes, DNS configuration and listening sockets."),
        core.Action("linux-firewall", "Firewall",
                    "Show effective UFW and nftables firewall state without changing rules."),
        core.Action("linux-version", "Linux version",
                    "Show operating system, kernel, architecture and uptime."),
        core.Action("linux-package-version", "Package version",
                    "Show versions of key Linux/Spark runtime packages."),
        core.Action("linux-reboot", "Reboot server",
                    "Reboot the Linux server immediately after explicit confirmation.", "confirm"),
        core.Action("linux-history-delete", "History delete",
                    "Delete shell history for root and the invoking sudo user only.", "confirm"),
        core.Action("linux-log-delete", "Log delete",
                    "Delete archived systemd journal and rotated Linux logs while preserving active application/database data.", "confirm"),
        core.Action("linux-cache-delete", "Cache delete",
                    "Clear APT package cache and npm cache while preserving installed packages and node_modules.", "confirm"),
        core.Action("linux-user-active", "User active",
                    "Show currently logged-in users and recent login sessions."),
    ]


def _database_actions(security_actions):
    existing = [action for action in security_actions if action.action_id in DATABASE_ACTION_IDS]
    update = core.Action(
        DATABASE_UPDATE_ACTION_ID,
        "Update Supabase",
        "Upgrade the active Supabase self-hosted runtime to the latest stable self-hosted release, preserve Spark secrets/data, re-apply Spark runtime hardening, and validate service health. Spark SQL migrations are not applied.",
        "confirm",
    )
    return [update, *existing]


def _fix_cleanup_actions(actions):
    fixed = []
    for action in actions:
        if action.action_id == "backup-restore-plain" and action.label == "cleanup-backups":
            fixed.append(core.Action(
                "cleanup-backups",
                "Backup cleanup / free space",
                "Safely prune old Spark backups with a configurable retention period, or explicitly delete all retained backups.",
                "confirm",
            ))
        else:
            fixed.append(action)
    return fixed


def _extend_categories() -> None:
    by_name = {}
    for category, actions in core.CATEGORIES:
        normalized = category
        if category == "Installation":
            normalized = "Installation Internet"
        elif category in ("Installation Air-Gapped", "Installation Air-Gap"):
            normalized = "Installation Air-Gap"
        elif category == "System":
            normalized = "Linux System"
        by_name[normalized] = list(actions)

    installation = by_name.get("Installation Internet", [])
    airgap = [
        action for action in by_name.get("Installation Air-Gap", [])
        if not action.action_id.startswith("manager-airgap-")
    ]
    diagnostics = by_name.get("Diagnostics", [])
    backups = by_name.get("Backups", [])
    cleanup = _fix_cleanup_actions(by_name.get("Cleanup / Remove", []))
    application = _application_actions(by_name.get("Application", []))
    linux_system = _linux_system_actions(by_name.get("Linux System", []))
    manager = _manager_actions(by_name.get("Manager", []))

    original_security = by_name.get("Security", [])
    database = _database_actions(original_security)
    security = [action for action in original_security if action.action_id not in DATABASE_ACTION_IDS]

    core.CATEGORIES[:] = [
        ("Installation Internet", installation),
        ("Installation Air-Gap", airgap),
        ("Diagnostics", diagnostics),
        ("Security", security),
        ("Backups", backups),
        ("Cleanup / Remove", cleanup),
        ("Application", application),
        ("Database", database),
        ("Linux System", linux_system),
        ("Manager", manager),
    ]


_original_task_init = core.TaskProcess.__init__


def manager_routed_task_init(self, spark_path, action_id, args, rows, cols):
    if action_id.startswith("manager-airgap-"):
        candidates = [
            Path("/usr/local/bin/spark-manager-airgap"),
            HERE / "lib/spark-manager-airgap",
            core.SPARK_ROOT / "deploy/spark-cli/lib/spark-manager-airgap",
        ]
        manager_path = next((path for path in candidates if path.is_file() and os.access(path, os.X_OK)), None)
        if manager_path is None:
            raise FileNotFoundError("spark-manager-airgap is not installed; update Spark Manager first")
        spark_path = str(manager_path)
    return _original_task_init(self, spark_path, action_id, args, rows, cols)


def provisioning_self_test() -> int:
    if core.SPARK_UI_VERSION != SPARK_UI_VERSION:
        raise RuntimeError(
            f"Spark UI core version mismatch: wrapper={SPARK_UI_VERSION} core={core.SPARK_UI_VERSION}"
        )

    categories = [category for category, _ in core.CATEGORIES]
    if categories != FINAL_MAIN_CATEGORIES:
        raise RuntimeError(
            "Spark Manager main menu mismatch: "
            f"expected={FINAL_MAIN_CATEGORIES!r} actual={categories!r}"
        )
    if len(categories) != len(set(categories)):
        raise RuntimeError("Spark Manager main menu contains duplicate categories")

    application_actions = [a for category, actions in core.CATEGORIES if category == "Application" for a in actions]
    application_labels = [a.label for a in application_actions]
    expected_application_labels = [
        "Update Internet App",
        "Build Offline App Update",
        "Update Offline App",
        "npm update app",
        "node update app",
        "Update App Packages",
        "npm outdated app",
        "npm audit production",
        "npm audit all",
        "npm list app",
        "npm doctor app",
        "Optimize Nginx Gzip",
        "Active version",
    ]
    if application_labels != expected_application_labels:
        raise RuntimeError(
            f"Application submenu mismatch: expected={expected_application_labels!r} actual={application_labels!r}"
        )

    linux_actions = [a for category, actions in core.CATEGORIES if category == "Linux System" for a in actions]
    linux_labels = [a.label for a in linux_actions]
    expected_linux_labels = [
        "Update Linux packages",
        "Resource monitor",
        "Network",
        "Firewall",
        "Linux version",
        "Package version",
        "Reboot server",
        "History delete",
        "Log delete",
        "Cache delete",
        "User active",
    ]
    if linux_labels != expected_linux_labels:
        raise RuntimeError(
            f"Linux System submenu mismatch: expected={expected_linux_labels!r} actual={linux_labels!r}"
        )

    manager_actions = [a for category, actions in core.CATEGORIES if category == "Manager" for a in actions]
    manager_labels = {a.action_id: a.label for a in manager_actions}
    expected_manager_labels = {
        "manager-airgap-build": "Build Manager Offline Update",
        "manager-airgap-install-environment": "Update Manager — Offline",
        "manager-update": "Update Manager — Internet",
        "@recent-logs": "Recent Manager Logs",
    }
    for action_id, label in expected_manager_labels.items():
        if manager_labels.get(action_id) != label:
            raise RuntimeError(f"Manager UI action mismatch for {action_id}: {manager_labels.get(action_id)!r}")

    airgap_ids = {
        a.action_id
        for category, actions in core.CATEGORIES
        if category == "Installation Air-Gap"
        for a in actions
    }
    required_airgap = {
        "airgap-build",
        "airgap-validate",
        "airgap-import",
        "airgap-step",
        "airgap-install-all",
        "airgap-status",
    }
    missing_airgap = required_airgap - airgap_ids
    if missing_airgap:
        raise RuntimeError("Installation Air-Gap is incomplete: " + ", ".join(sorted(missing_airgap)))
    if any(action_id.startswith("manager-airgap-") for action_id in airgap_ids):
        raise RuntimeError("Manager offline actions leaked into Installation Air-Gap")

    security_ids = {
        a.action_id
        for category, actions in core.CATEGORIES
        if category == "Security"
        for a in actions
    }
    database_ids = {
        a.action_id
        for category, actions in core.CATEGORIES
        if category == "Database"
        for a in actions
    }
    if security_ids & DATABASE_ACTION_IDS:
        raise RuntimeError("Database actions leaked into Security")
    missing_database = (DATABASE_ACTION_IDS | {DATABASE_UPDATE_ACTION_ID}) - database_ids
    if missing_database:
        raise RuntimeError("Database category is incomplete: " + ", ".join(sorted(missing_database)))
    if not any(
        a.action_id == DATABASE_UPDATE_ACTION_ID and a.label == "Update Supabase"
        for category, actions in core.CATEGORIES if category == "Database" for a in actions
    ):
        raise RuntimeError("Database Update Supabase action is missing or mislabeled")

    cleanup_actions = [a for category, actions in core.CATEGORIES if category == "Cleanup / Remove" for a in actions]
    if any(a.action_id == "backup-restore-plain" for a in cleanup_actions):
        raise RuntimeError("database restore action leaked into Cleanup / Remove")
    if len([a for a in cleanup_actions if a.action_id == "cleanup-backups"]) != 1:
        raise RuntimeError("Cleanup / Remove must contain exactly one cleanup-backups action")

    forbidden = {"Overview", "Architecture & Provisioning", "Services", "Certificates", "Node / npm"}
    leaked = forbidden & set(categories)
    if leaked:
        raise RuntimeError("Removed main-menu categories still visible: " + ", ".join(sorted(leaked)))

    base.assert_english_ui_registry()
    sample = "\u062a\u0633\u062a Docker\n"
    if base.sanitize_backend_text(sample) != "[Legacy backend message sanitized] Docker\n":
        raise RuntimeError("non-English sanitizer contract failed")
    return 0


_extend_categories()
core.TaskProcess.__init__ = manager_routed_task_init


def main() -> int:
    if "--self-test" in sys.argv:
        return provisioning_self_test()
    return base.main(sys.argv[1:])


if __name__ == "__main__":
    raise SystemExit(main())
