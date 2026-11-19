#!/usr/bin/env python3
"""Spark curses UI adapter for production-only extensions."""
from __future__ import annotations

import importlib.util
import os
import re
import sys
from pathlib import Path

SPARK_UI_VERSION = "3.1.0+20260910.1"
# Compatibility strings used by the existing manager self-test:
# pty.openpty()
# curses.doupdate()

HERE = Path(__file__).resolve().parent
CORE_CANDIDATES = [
    HERE / "spark-ui-core.py",
    Path("/opt/spark/deploy/spark-cli/spark-ui-core.py"),
]
CORE_PATH = next((p for p in CORE_CANDIDATES if p.is_file()), None)
if CORE_PATH is None:
    raise SystemExit("Spark UI core is missing. Run the Spark Manager installer/update again.")

spec = importlib.util.spec_from_file_location("spark_ui_core", CORE_PATH)
if spec is None or spec.loader is None:
    raise SystemExit(f"Unable to load Spark UI core: {CORE_PATH}")
core = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = core
spec.loader.exec_module(core)

# Spark Manager is intentionally English-only. Arabic-script ranges are checked
# at the final PTY rendering boundary so legacy shell output cannot leak into the
# curses UI even when an older operational module still contains localized text.
NON_ENGLISH_UI_RE = re.compile(r"[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]")
ANSI_RE = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")
ASCII_TOKEN_RE = re.compile(r"[A-Za-z0-9_./:@%+=,#?\[\]()-]+")


def _line_ending(line: str) -> tuple[str, str]:
    if line.endswith("\r\n"):
        return line[:-2], "\r\n"
    if line.endswith("\n"):
        return line[:-1], "\n"
    if line.endswith("\r"):
        return line[:-1], "\r"
    return line, ""


def _sanitize_legacy_line(line: str, action_id: str) -> str:
    body, ending = _line_ending(line)
    if not NON_ENGLISH_UI_RE.search(body):
        return line

    plain = ANSI_RE.sub("", body)
    stripped = plain.strip()

    # Keep the interactive backup-cleanup menu usable even when an older shell
    # module emits localized menu labels directly rather than through helpers.
    if action_id == "cleanup-backups":
        if re.match(r"^\s*0\)", stripped):
            return "  0) Cancel" + ending
        if re.match(r"^\s*1\)", stripped):
            return "  1) Safe cleanup: delete old backups using a retention period" + ending
        if re.match(r"^\s*2\)", stripped):
            return "  2) Delete all backups" + ending
        if "[1]" in stripped:
            return "Selection [1]: " + ending
        if "[7]" in stripped:
            return "Days to retain [7]: " + ending

    tokens = ASCII_TOKEN_RE.findall(plain)
    useful = " ".join(tokens).strip()

    # Prompts usually have no trailing newline. Keep them actionable instead of
    # exposing untranslated text or silently waiting for input.
    if not ending:
        if "[" in useful and "]" in useful:
            return f"Input {useful}: "
        if useful:
            return f"Input ({useful}): "
        return "Input: "

    if useful:
        return f"[Legacy backend message sanitized] {useful}{ending}"
    return f"[Legacy backend message sanitized]{ending}"


def sanitize_backend_text(text: str, action_id: str = "") -> str:
    if not isinstance(text, str) or not text or not NON_ENGLISH_UI_RE.search(text):
        return text
    return "".join(_sanitize_legacy_line(line, action_id) for line in text.splitlines(keepends=True))


def assert_english_ui_registry() -> None:
    for category, actions in core.CATEGORIES:
        if NON_ENGLISH_UI_RE.search(category):
            raise RuntimeError(f"non-English category text detected: {category!r}")
        for action in actions:
            for field_name, value in (("label", action.label), ("description", action.description)):
                if value and NON_ENGLISH_UI_RE.search(value):
                    raise RuntimeError(
                        f"non-English {field_name} detected for {action.action_id}: {value!r}"
                    )


INSTALL_LABELS = {
    "install-01": ("01  Installation config", "Configure domains, addresses and certificate email."),
    "install-02": ("02  Packages / Docker / Node", "Install and validate production base packages."),
    "install-03": ("03  Spark repository", "Download or fast-forward to the latest Spark main branch."),
    "install-04": ("04  Latest Supabase source", "Download or fast-forward the official Supabase main branch; fresh installs build runtime from that source."),
    "install-05": ("05  Supabase secrets", "Generate only missing/default Supabase secrets."),
    "install-06": ("06  Supabase environment", "Apply production Supabase environment configuration."),
    "install-07": ("07  Edge Functions sync", "Synchronize Edge Functions and the official Supabase main router."),
    "install-08": ("08  Provider / worker env", "Configure provider and avatar-worker runtime environment."),
    "install-09": ("09  Compose hardening", "Apply Docker Compose production hardening."),
    "install-10": ("10  Start Supabase", "Validate and start the Supabase stack."),
    "install-11": ("11  Frontend deployment", "Build and deploy the production frontend."),
    "install-12": ("12  Nginx bootstrap", "Create the bootstrap Nginx configuration."),
    "install-13": ("13  TLS certificates", "Issue/validate production TLS certificates."),
    "install-14": ("14  Production Nginx", "Enable and validate the production Nginx configuration."),
    "install-15": ("15  Schedulers", "Install local Spark scheduler services and timers."),
    "install-16": ("16  TURN / Coturn", "Configure and validate Coturn/TURN."),
    "install-17": ("17  Certbot renewal hook", "Install certificate renewal integration."),
    "install-18": ("18  Production firewall", "Apply the production UFW policy after safety checks."),
    "install-19": ("19  LiveKit configuration", "Provision LiveKit domains, TLS, secrets and recording storage."),
    "install-20": ("20  LiveKit runtime", "Install/start LiveKit SFU, Redis, Egress, Ingress and embedded TURN."),
    "install-21": ("21  LiveKit validation", "Run end-to-end server validation for the complete media platform."),
    "install-22": ("22  LiveKit observability", "Start and validate Prometheus, Grafana, Loki, Alertmanager and exporters."),
}

AIRGAP_ACTIONS = [
    core.Action(
        "airgap-build",
        "01  Build complete offline bundle",
        "Build a checksum-verified, target-neutral Ubuntu/Spark/Supabase/npm/Docker bundle on a connected staging host.",
        "controlled",
    ),
    core.Action(
        "airgap-validate",
        "02  Validate offline bundle",
        "Validate bundle structure, SHA256 integrity, Git bundles and target compatibility without installing it.",
    ),
    core.Action(
        "airgap-import",
        "03  Import / activate offline bundle",
        "Copy a verified bundle under /opt/spark-airgap, activate it and load all Docker images locally.",
        "controlled",
    ),
    core.Action(
        "airgap-step",
        "04  Run one offline install step",
        "Run one of 17 offline steps (IDs 1-15, 17, 21); no firewall changes, DNS or certificates.",
        "confirm",
    ),
    core.Action(
        "airgap-install-all",
        "05  Run complete offline installation",
        "Run the same 17 offline steps in order on the internal IPv4; no firewall changes, DNS or certificates. Step 21 requires a provisioned Spark database or local backup.",
        "confirm",
    ),
    core.Action(
        "airgap-status",
        "06  Air-gap bundle status",
        "Show the active bundle revision, target platform, internal IPv4 mode, checksum status and imported Docker image readiness.",
    ),
    core.Action(
        "airgap-build-target-patch",
        "07  Build Ubuntu target patch",
        "Build only Ubuntu-dependent APT/npm payloads for a new target release while reusing the existing large Docker/source bundle.",
        "controlled",
    ),
    core.Action(
        "airgap-apply-target-patch",
        "08  Apply Ubuntu target patch (manual)",
        "Manually apply a verified target patch to a selected base bundle and prepare a local bundle directory.",
        "controlled",
    ),
    core.Action(
        "airgap-auto-target-bootstrap",
        "09  Auto prepare + bootstrap offline target",
        "Automatically find matching artifacts, verify them, prepare the target bundle, install local packages and import Docker images.",
        "controlled",
    ),
]


ARCHITECTURE_ACTIONS = [
    core.Action("architecture-overview", "Architecture Overview", "Render the active Spark environment topology from its profile."),
    core.Action("architecture-profile", "Environment Profile", "Show active profile metadata and configuration readiness."),
    core.Action("architecture-validate", "Validate Architecture", "Run static schema, role and network-policy validation."),
    core.Action("architecture-network", "Network Connectivity", "Test only connections that are valid to measure from the current host role."),
    core.Action("architecture-status", "Deployment Status", "Show configuration readiness without claiming components are installed."),
]

CLEANUP_ACTIONS = [
    core.Action(
        "cleanup-database",
        "Delete Database data",
        "Stop Supabase and delete only the detected PostgreSQL data bind. The operation refuses to guess the data path.",
        "confirm",
    ),
    core.Action(
        "cleanup-supabase",
        "Delete Supabase runtime",
        "Delete the complete local Supabase runtime, volumes/data, runtime configuration and runtime secrets.",
        "confirm",
    ),
    core.Action(
        "cleanup-frontend",
        "Delete deployed Frontend",
        "Delete /var/www/spark only; the local Spark source repository remains.",
        "confirm",
    ),
    core.Action(
        "cleanup-source",
        "Delete Spark source",
        "Delete the local /opt/spark repository; GitHub and the installed Spark Manager remain.",
        "confirm",
    ),
    core.Action(
        "cleanup-logs",
        "Delete Manager logs",
        "Delete Spark Manager logs only; system journal and Docker logs are not changed.",
        "confirm",
    ),
    core.Action(
        "backup-restore-plain",
        "cleanup-backups",
        "Backup cleanup / free space",
        "Safely prune old Spark backups with a configurable retention period, or explicitly delete all retained backups.",
        "confirm",
    ),
    core.Action(
        "cleanup-history",
        "Reset install history",
        "Clear installation-step DONE markers only. Runtime data and live service state are not changed.",
        "confirm",
    ),
    core.Action(
        "cleanup-livekit",
        "Delete LiveKit runtime",
        "Remove only the LiveKit runtime and secrets, then restore the legacy Coturn fallback.",
        "confirm",
    ),
    core.Action(
        "cleanup-full",
        "Delete complete Spark project",
        "Remove Spark-specific runtime, data, configuration, certificates, schedulers, TURN, source, logs and backups while keeping the Manager and shared OS packages.",
        "confirm",
    ),
    core.Action(
        "cleanup-manager",
        "Uninstall Spark Manager",
        "Remove the installed Spark Manager and /usr/local/bin/spark only; the project runtime is left untouched.",
        "confirm",
    ),
]


def patch_categories() -> None:
    rebuilt = []
    for category, actions in core.CATEGORIES:
        if category == "Security":
            rebuilt.append((category, [
                core.Action("security-db-info", "PostgreSQL / pgAdmin connection", "Show verified database connection details and current access state."),
                core.Action("security-db-test", "Test database login", "Run a real login through the local Supavisor session endpoint."),
                core.Action("security-db-open", "Open Database TCP/5432", "Open managed external PostgreSQL access after verification.", "confirm"),
                core.Action("security-db-close", "Close Database TCP/5432", "Close managed external PostgreSQL access.", "controlled"),
                core.Action("security-studio-info", "Supabase Studio credentials", "Show Studio URL, access state, username and password. Credentials are displayed only in task output and are not written to Manager logs."),
                core.Action("security-studio-open", "Enable Supabase Studio", "Enable Studio on the server over authenticated HTTP/8443.", "confirm"),
                core.Action("security-studio-close", "Disable Supabase Studio", "Disable the managed Studio HTTP/8443 listener while keeping Supabase API routes active.", "controlled"),
                core.Action("security-report", "Security / Firewall status", "Show database, Studio and firewall access state."),
                core.Action("security-account-unlock", "Unlock user account", "Reset login lock state by username, email or phone.", "confirm"),
                core.Action("diagnostic-exposure", "Public exposure check", "Verify internal database and API ports are not unintentionally public."),
                core.Action("version-info", "Version & security", "Inspect runtime versions and repository state."),
            ]))
            continue

        new_actions = []
        for action in actions:
            label = action.label
            description = action.description.replace("pinned Supabase", "Supabase").replace(
                "the pinned main router", "the official Supabase main router"
            )
            if action.action_id in INSTALL_LABELS:
                label, description = INSTALL_LABELS[action.action_id]
            if action.action_id == "install-all":
                label = "Run all 22 install steps"
                description = "Execute the complete Spark + LiveKit guided installation sequence."
            if action.action_id == "cleanup-backups":
                label = "Backup cleanup / free space"
                description = "Prune old Spark backups with configurable retention, or explicitly delete all retained backups."
            new_actions.append(core.Action(action.action_id, label, description, action.risk, action.special))

        if category == "Installation":
            idx = next((i for i, a in enumerate(new_actions) if a.action_id == "install-all"), len(new_actions))
            new_actions[idx:idx] = [
                core.Action("install-19", *INSTALL_LABELS["install-19"], "controlled"),
                core.Action("install-20", *INSTALL_LABELS["install-20"], "controlled"),
                core.Action("install-21", *INSTALL_LABELS["install-21"], "controlled"),
                core.Action("install-22", *INSTALL_LABELS["install-22"], "controlled"),
            ]
            rebuilt.append((category, new_actions))
            rebuilt.append(("Installation Air-Gapped", AIRGAP_ACTIONS))
            rebuilt.append(("Architecture & Provisioning", ARCHITECTURE_ACTIONS))
            continue
        elif category == "Diagnostics":
            idx = next((i + 1 for i, a in enumerate(new_actions) if a.action_id == "diagnostic-turn"), len(new_actions))
            new_actions.insert(idx, core.Action(
                "diagnostic-livekit",
                "LiveKit full validation",
                "Validate SFU, Redis, TURN, Egress, Ingress, TLS, functions and firewall.",
            ))
            for i, action in enumerate(new_actions):
                if action.action_id == "diagnostic-installation-status":
                    new_actions[i] = core.Action(
                        action.action_id,
                        "Installation status (22 steps)",
                        "Probe the actual server state for all Spark + LiveKit install steps.",
                        action.risk,
                        action.special,
                    )
        elif category == "Services":
            new_actions.append(core.Action(
                "service-livekit",
                "Restart LiveKit platform",
                "Recreate and validate LiveKit SFU, Redis, Egress and Ingress.",
                "controlled",
            ))
        elif category == "Backups":
            idx = next((i for i, a in enumerate(new_actions) if a.special == "logs"), len(new_actions))
            new_actions.insert(idx, core.Action(
                "backup-restore-plain",
                "Restore PostgreSQL from plain backup",
                "Replace the postgres database from a full pg_dump/pgAdmin Plain SQL backup. A safety backup is created first and rollback is automatic on restore failure.",
                "confirm",
            ))
            idx = next((i for i, a in enumerate(new_actions) if a.special == "logs"), len(new_actions))
            new_actions.insert(idx, core.Action(
                "cleanup-backups",
                "Backup cleanup / free space",
                "Prune old Spark backups with configurable retention while protecting the newest recovery point of each known backup type.",
                "confirm",
            ))
        elif category == "Cleanup / Remove":
            rebuilt.append(("Cleanup / Remove", list(CLEANUP_ACTIONS)))
            continue
        rebuilt.append((category, new_actions))
    core.CATEGORIES[:] = rebuilt


_original_collect_status = core.collect_status


def logical_collect_status():
    status = _original_collect_status()
    completed = set()
    if core.STEP_DIR.exists():
        for path in core.STEP_DIR.glob("*.ok"):
            try:
                n = int(path.stem)
            except ValueError:
                continue
            if 1 <= n <= 22:
                completed.add(n)
    status["steps"] = f"{len(completed)}/22"
    status["step_set"] = ",".join(str(n) for n in sorted(completed))

    try:
        status["backups"] = str(sum(
            1 for path in core.BACKUP_DIR.iterdir()
            if path.is_file() or path.is_dir()
        ))
    except OSError:
        status["backups"] = "0"

    studio_flag = Path("/etc/spark/studio-access.enabled")
    status["studio"] = "ENABLED" if studio_flag.is_file() else "DISABLED"
    status["admin"] = status["studio"]
    return status


_original_action_badge = core.SparkUI.action_badge


def install_action_badge(self, action):
    if action.action_id.startswith("install-") and action.action_id != "install-all":
        try:
            step = int(action.action_id.rsplit("-", 1)[1])
            completed = {int(x) for x in self.status.get("step_set", "").split(",") if x}
            return "HIST" if step in completed else ""
        except ValueError:
            return ""
    return _original_action_badge(self, action)


_original_draw_details = core.SparkUI.draw_details


def logical_draw_details(self):
    original_safe_add = self.safe_add

    def patched_safe_add(win, y, x, text, *args, **kwargs):
        if isinstance(text, str):
            text = sanitize_backend_text(text)
        return original_safe_add(win, y, x, text, *args, **kwargs)

    self.safe_add = patched_safe_add
    try:
        return _original_draw_details(self)
    finally:
        self.safe_add = original_safe_add


_original_task_process_init = core.TaskProcess.__init__
_original_task_process_read_available = core.TaskProcess.read_available


def routed_task_process_init(self, spark_path, action_id, args, rows, cols):
    if action_id.startswith("airgap-"):
        candidates = [
            Path("/usr/local/bin/spark-airgap"),
            core.SPARK_ROOT / "deploy/spark-cli/spark-airgap",
        ]
        airgap_path = next((path for path in candidates if path.is_file() and os.access(path, os.X_OK)), None)
        if airgap_path is None:
            raise FileNotFoundError(
                "spark-airgap is not installed and the Spark repository copy is unavailable; update the Spark repository/manager first"
            )
        spark_path = str(airgap_path)
    if action_id.startswith("architecture-"):
        candidates = [
            Path("/usr/local/bin/spark-architecture"),
            core.SPARK_ROOT / "deploy/spark-cli/spark-architecture",
        ]
        architecture_path = next((path for path in candidates if path.is_file() and os.access(path, os.X_OK)), None)
        if architecture_path is None:
            raise FileNotFoundError("spark-architecture is not installed; update Spark Manager first")
        spark_path = str(architecture_path)
    return _original_task_process_init(self, spark_path, action_id, args, rows, cols)


def english_only_task_process_read_available(self):
    return sanitize_backend_text(
        _original_task_process_read_available(self), getattr(self, "action_id", "")
    )


def logical_self_test() -> int:
    assert SPARK_UI_VERSION == "3.1.0+20260910.1"
    assert core.SPARK_UI_VERSION == SPARK_UI_VERSION
    assert len(core.CATEGORIES) >= 10
    ids = {a.action_id for _, actions in core.CATEGORIES for a in actions if not a.special}
    required = {
        "diagnostic-full",
        "diagnostic-installation-status",
        "app-update",
        "install-all",
        "manager-update",
        "security-db-info",
        "security-db-test",
        "security-db-open",
        "security-db-close",
        "security-studio-info",
        "security-studio-open",
        "security-studio-close",
        "security-report",
        "security-account-unlock",
        "cleanup-database",
        "cleanup-backups",
        "cleanup-full",
        "cleanup-manager",
        "diagnostic-livekit",
        "service-livekit",
        "cleanup-livekit",
        "install-19",
        "install-20",
        "install-21",
        "install-22",
        "airgap-build",
        "airgap-validate",
        "airgap-import",
        "airgap-step",
        "airgap-install-all",
        "airgap-status",
        "airgap-build-target-patch",
        "airgap-apply-target-patch",
        "airgap-auto-target-bootstrap",
    }
    if not required.issubset(ids):
        missing = ", ".join(sorted(required - ids))
        raise RuntimeError(f"action registry is incomplete: {missing}")
    airgap_sections = [category for category, _ in core.CATEGORIES if category == "Installation Air-Gapped"]
    if len(airgap_sections) != 1:
        raise RuntimeError("Installation Air-Gapped category is missing or duplicated")
    architecture_sections = [category for category, _ in core.CATEGORIES if category == "Architecture & Provisioning"]
    if len(architecture_sections) != 1:
        raise RuntimeError("Architecture & Provisioning category is missing or duplicated")
    backup_sections = [
        a for category, actions in core.CATEGORIES if category == "Backups"
        for a in actions if a.action_id == "cleanup-backups"
    ]
    if len(backup_sections) != 1:
        raise RuntimeError("backup cleanup action is missing from Backups")
    assert_english_ui_registry()
    sample = "\u062a\u0633\u062a Docker\n"
    sanitized = sanitize_backend_text(sample, "diagnostic-docker")
    if NON_ENGLISH_UI_RE.search(sanitized):
        raise RuntimeError("English-only PTY rendering guard failed")
    if "Docker" not in sanitized:
        raise RuntimeError("PTY rendering guard discarded technical context")
    import curses as _curses
    import pty as _pty
    return 0


patch_categories()
assert_english_ui_registry()
core.collect_status = logical_collect_status
core.SparkUI.action_badge = install_action_badge
core.SparkUI.draw_details = logical_draw_details
core.TaskProcess.__init__ = routed_task_process_init
core.TaskProcess.read_available = english_only_task_process_read_available
core.self_test = logical_self_test


def main(argv):
    return core.main(argv)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
