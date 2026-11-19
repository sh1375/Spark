#!/usr/bin/env python3
"""Spark Server Manager v3.1 single-screen curses UI.

The renderer owns the terminal for the entire session. Operational Bash functions
run in a child PTY so their output and interactive prompts stay inside the lower
log pane instead of tearing down/rebuilding the UI.
"""

from __future__ import annotations

import argparse
import codecs
import concurrent.futures
import curses
import errno
import fcntl
import glob
import locale
import os
import pty
import re
import select
import shutil
import signal
import struct
import subprocess
import sys
import termios
import textwrap
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple, Union

SPARK_UI_VERSION = "3.1.0+20260910.1"
STATE_DIR = Path("/var/lib/spark-manager")
STEP_DIR = STATE_DIR / "steps"
LOG_DIR = Path("/var/log/spark-manager")
BACKUP_DIR = Path("/var/backups/spark")
SPARK_ROOT = Path("/opt/spark")
SUPABASE_ROOT = Path("/opt/spark-supabase")
CRASH_LOG = LOG_DIR / "ui-crash.log"

ANSI_CSI = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")
ANSI_OSC = re.compile(r"\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)")
ANSI_ESC = re.compile(r"\x1b[@-_]")
CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


@dataclass(frozen=True)
class Action:
    action_id: str
    label: str
    description: str
    risk: str = "safe"
    special: str = ""


CATEGORIES: List[Tuple[str, List[Action]]] = [
    ("Overview", [
        Action("diagnostic-full", "Full validation", "Run the complete production validation suite."),
        Action("resources", "Resource snapshot", "CPU, memory, disk, processes, Docker and listening sockets."),
        Action("version-info", "Version & security", "Show OS, runtime, Spark and pinned Supabase versions."),
        Action("@recent-logs", "Recent manager logs", "Browse persistent Spark Manager logs in the lower pane.", special="logs"),
    ]),
    ("Installation", [
        Action("install-01", "02  Installation config", "Detect local host settings; no DNS/domain/certificate input is required.", "confirm"),
        Action("install-02", "03  Latest packages / Docker / Node / npm", "Install the latest packages available at installation time without Node/npm version pinning.", "controlled"),
        Action("install-03", "04  Spark repository", "Clone/update the Spark repository and manager.", "controlled"),
        Action("install-04", "05  Pinned Supabase source", "Install or validate the reviewed Supabase source pin.", "confirm"),
        Action("install-05", "06  Supabase secrets", "Generate only missing/default Supabase secrets.", "controlled"),
        Action("install-06", "07  Supabase environment", "Apply production Supabase environment configuration.", "controlled"),
        Action("install-07", "08  Edge Functions sync", "Synchronize Edge Functions and the pinned main router.", "controlled"),
        Action("install-08", "09  Provider / worker env", "Configure provider and avatar-worker runtime environment.", "controlled"),
        Action("install-09", "10  Compose hardening", "Apply Docker Compose production hardening.", "controlled"),
        Action("install-10", "11  Start Supabase", "Validate and start the Supabase stack.", "controlled"),
        Action("install-11", "13  Frontend deployment", "Build and deploy the production frontend.", "controlled"),
        Action("install-12", "14  Nginx bootstrap", "Create the bootstrap Nginx configuration.", "controlled"),
        Action("install-13", "15  External TLS boundary", "Keep DNS/TLS external to Spark; no local certificate is required.", "controlled"),
        Action("install-14", "16  Host-agnostic Nginx", "Enable wildcard-host same-origin Nginx routing for any URL or IP.", "controlled"),
        Action("install-15", "17  Schedulers", "Install local Spark scheduler services and timers.", "controlled"),
        Action("install-17", "19  External certificate lifecycle", "Keep certificate renewal outside Spark installation.", "controlled"),
        Action("install-18", "20  Production firewall", "Apply the production UFW policy after safety checks.", "confirm"),
        Action("install-all", "Run all 17 install steps", "Execute the complete guided installation sequence.", "confirm"),
    ]),
    ("Diagnostics", [
        Action("diagnostic-full", "Full validation", "Run all production validation checks."),
        Action("diagnostic-installation-status", "Installation status (17 steps)", "Probe the actual server state for every numbered step and show saved History separately."),
        Action("diagnostic-frontend", "Frontend", "Check the public frontend endpoint."),
        Action("diagnostic-api", "API / Auth / Functions", "Check API health and the password-login function route."),
        Action("diagnostic-docker", "Docker status", "Show the Supabase Compose service state."),
        Action("@docker-logs", "Docker service logs", "Choose a service and display its recent timestamped logs.", special="docker"),
        Action("diagnostic-nginx", "Nginx status & logs", "Show Nginx unit state and recent journal entries."),
        Action("diagnostic-schedulers", "Schedulers status & logs", "Validate scheduler timers and show service logs."),
        Action("diagnostic-exposure", "DB/API exposure", "Verify internal DB/API ports are not publicly bound."),
        Action("diagnostic-dns-ssl", "DNS & SSL", "Validate DNS plus application/API certificates."),
        Action("diagnostic-ports", "Listening ports & UFW", "Display listening sockets and the effective UFW policy."),
        Action("@recent-logs", "Recent manager logs", "Browse persistent manager log files without leaving the dashboard.", special="logs"),
    ]),
    ("Application", [
        Action("app-update", "Update Spark", "Fast-forward only application/runtime update with staging and rollback; database is never inspected or modified.", "confirm"),
        Action("diagnostic-full", "Post-deploy validation", "Run the complete validation suite."),
        Action("version-info", "Active versions", "Show current Spark/Supabase/runtime versions."),
    ]),
    ("System", [
        Action("linux-update", "Update Linux packages", "Run apt update/upgrade and report reboot state.", "controlled"),
        Action("resources", "Resource monitor", "Show a detailed resource snapshot."),
        Action("diagnostic-ports", "Network / firewall", "Show listening ports and UFW policy."),
    ]),
    ("Security", [
        Action("admin-open", "Access & credentials", "Show credentials and open/close Database 5432 or Supabase Studio 8443.", "confirm"),
        Action("admin-close", "Close Supabase Studio", "Close the external Supabase Studio HTTPS/8443 listener.", "controlled"),
        Action("diagnostic-exposure", "Public exposure check", "Verify DB/Kong/Supavisor ports are internal only."),
        Action("version-info", "Version & security", "Inspect runtime versions and repository state."),
    ]),
    ("Services", [
        Action("service-status", "All service status", "Nginx, Docker Compose and Spark timers."),
        Action("service-functions", "Restart Functions + Worker", "Recreate Edge Functions and Avatar Worker.", "controlled"),
        Action("service-nginx", "Reload Nginx", "Validate configuration and reload Nginx.", "controlled"),
        Action("service-supabase", "Restart Supabase stack", "Force-recreate the complete Supabase stack.", "confirm"),
        Action("service-timers", "Restart scheduler timers", "Restart all Spark scheduler timers.", "controlled"),
    ]),
    ("Backups", [
        Action("backup-create", "Create manual backup", "Create PostgreSQL plus runtime/config backup.", "controlled"),
        Action("backup-list", "List backups", "Show retained backup directories."),
        Action("@recent-logs", "Recent manager logs", "Browse manager logs in the dashboard.", special="logs"),
    ]),
    ("Cleanup / Remove", [
    Action("cleanup-database", "Delete Database data", "Stop Supabase and delete only the detected PostgreSQL data bind. The operation refuses to guess the data path.", "confirm"),
    Action("cleanup-supabase", "Delete Supabase runtime", "Delete the complete local Supabase runtime, volumes/data, runtime configuration and runtime secrets.", "confirm"),
    Action("cleanup-frontend", "Delete deployed Frontend", "Delete /var/www/spark only; the local Spark source repository remains.", "confirm"),
    Action("cleanup-source", "Delete Spark source", "Delete the local /opt/spark repository; GitHub and the installed Spark Manager remain.", "confirm"),
    Action("cleanup-logs", "Delete Manager logs", "Delete Spark Manager logs only; system journal and Docker logs are not changed.", "confirm"),
    Action("cleanup-backups", "Backup cleanup / free space", "Safely prune old Spark backups with a configurable retention period, or explicitly delete all retained backups.", "confirm"),
    Action("cleanup-history", "Reset install history", "Clear installation-step DONE markers only. Runtime data and live service state are not changed.", "confirm"),
    Action("cleanup-full", "Delete complete Spark project", "Remove Spark-specific runtime, data, configuration, certificates, schedulers, TURN, source, logs and backups while keeping the Manager and shared OS packages.", "confirm"),
    Action("cleanup-manager", "Uninstall Spark Manager", "Remove the installed Spark Manager and /usr/local/bin/spark only; the project runtime is left untouched.", "confirm"),
]),
("Certificates", [
        Action("cert-list", "List certificates", "Show Certbot-managed certificates."),
        Action("cert-dry-run", "Renewal dry-run", "Validate certificate renewal without changing certificates."),
        Action("cert-renew", "Run certbot renew", "Run the production certificate renewal command.", "controlled"),
    ]),
    ("Node / npm", [
        Action("npm-versions", "Node / npm versions", "Show installed Node and npm versions."),
        Action("npm-update", "Update npm 12.2", "Update global npm to the Spark-supported npm 12.2 baseline.", "controlled"),
        Action("npm-ci", "npm ci", "Clean dependency install in /opt/spark.", "controlled"),
        Action("npm-audit", "npm audit", "Run the full dependency security audit."),
        Action("npm-audit-prod", "npm audit --omit=dev", "Audit production dependencies only."),
        Action("npm-outdated", "npm outdated", "Show outdated npm dependencies."),
        Action("npm-fix-dry", "audit fix --dry-run", "Preview npm audit fixes without modifying the repository."),
    ]),
    ("Manager", [
        Action("manager-update", "Update Spark Manager", "Download and atomically install the latest manager.", "controlled"),
        Action("@recent-logs", "Recent manager logs", "Browse persistent manager logs.", special="logs"),
    ]),
]


def strip_ansi(text: str) -> str:
    text = ANSI_OSC.sub("", text)
    text = ANSI_CSI.sub("", text)
    text = ANSI_ESC.sub("", text)
    return CONTROL.sub("", text)


def run_quiet(args: Sequence[str], timeout: float = 1.0) -> str:
    try:
        result = subprocess.run(list(args), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, timeout=timeout, check=False)
        return result.stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        return ""


def read_mem_percent() -> int:
    values: Dict[str, int] = {}
    try:
        for line in Path("/proc/meminfo").read_text().splitlines():
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            values[key] = int(value.strip().split()[0])
        total = values.get("MemTotal", 0)
        avail = values.get("MemAvailable", 0)
        if total:
            return max(0, min(100, round((total - avail) * 100 / total)))
    except (OSError, ValueError):
        pass
    return 0


def collect_status() -> Dict[str, str]:
    status: Dict[str, str] = {}
    try:
        load1 = os.getloadavg()[0]
    except OSError:
        load1 = 0.0
    cores = os.cpu_count() or 1
    status["load"] = f"{load1:.2f} / {cores} CPU"
    status["memory"] = f"{read_mem_percent()}% used"
    try:
        disk = shutil.disk_usage("/")
        status["disk"] = f"{round(disk.used * 100 / disk.total)}% used"
    except OSError:
        status["disk"] = "unknown"
    try:
        uptime = int(float(Path("/proc/uptime").read_text().split()[0]))
        days, rem = divmod(uptime, 86400)
        hours, mins = divmod(rem, 3600)[0], divmod(rem % 3600, 60)[0]
        status["uptime"] = f"{days}d {hours}h {mins}m"
    except (OSError, ValueError, IndexError):
        status["uptime"] = "unknown"

    step_files = list(STEP_DIR.glob("*.ok")) if STEP_DIR.exists() else []
    completed_set = set()
    for path in step_files:
        try:
            n = int(path.stem)
            if 1 <= n <= 18 and n != 16:
                completed_set.add(n)
        except ValueError:
            pass
    status["steps"] = f"{len(completed_set)}/17"
    status["step_set"] = ",".join(str(n) for n in sorted(completed_set))
    try:
        status["backups"] = str(sum(1 for p in BACKUP_DIR.iterdir() if p.is_dir()))
    except OSError:
        status["backups"] = "0"
    sockets = run_quiet(["ss", "-lnt"], timeout=0.8)
    status["db_access"] = "OPEN" if re.search(r"(?:^|:)5432\s", sockets, re.M) else "CLOSED"
    status["studio"] = "OPEN" if re.search(r"(?:^|:)8443\s", sockets, re.M) else "CLOSED"
    status["admin"] = status["studio"]
    status["nginx"] = run_quiet(["systemctl", "is-active", "nginx"], timeout=0.8) or "unknown"
    status["docker"] = run_quiet(["systemctl", "is-active", "docker"], timeout=0.8) or "unknown"
    commit = run_quiet(["git", "-C", str(SPARK_ROOT), "rev-parse", "--short=12", "HEAD"], timeout=0.8)
    if not commit:
        try:
            state_file = STATE_DIR / "application-active.env"
            for line in state_file.read_text().splitlines():
                if line.startswith("commit="):
                    value = line.split("=", 1)[1].strip()
                    if re.fullmatch(r"[0-9a-f]{40}", value):
                        commit = value[:12]
                    break
        except OSError:
            pass
    status["commit"] = commit or "n/a"
    return status


class TaskProcess:
    def __init__(self, spark_path: str, action_id: str, args: Sequence[str], rows: int, cols: int):
        self.spark_path = spark_path
        self.action_id = action_id
        self.args = list(args)
        self.master_fd, slave_fd = pty.openpty()
        self._set_winsize(rows, cols)
        env = os.environ.copy()
        env["TERM"] = env.get("TERM") or "xterm-256color"
        env["SPARK_UI_BACKEND"] = "1"
        self.proc = subprocess.Popen([spark_path, "--backend-action", action_id, *self.args], stdin=slave_fd, stdout=slave_fd, stderr=slave_fd, env=env, close_fds=True, start_new_session=True)
        os.close(slave_fd)
        flags = fcntl.fcntl(self.master_fd, fcntl.F_GETFL)
        fcntl.fcntl(self.master_fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)
        self.decoder = codecs.getincrementaldecoder("utf-8")("replace")
        self.closed = False

    def _set_winsize(self, rows: int, cols: int) -> None:
        try:
            fcntl.ioctl(self.master_fd, termios.TIOCSWINSZ, struct.pack("HHHH", max(8, rows), max(40, cols), 0, 0))
        except OSError:
            pass

    def resize(self, rows: int, cols: int) -> None:
        self._set_winsize(rows, cols)

    def read_available(self) -> str:
        if self.closed:
            return ""
        chunks: List[bytes] = []
        while True:
            try:
                ready, _, _ = select.select([self.master_fd], [], [], 0)
                if not ready:
                    break
                data = os.read(self.master_fd, 65536)
                if not data:
                    break
                chunks.append(data)
            except BlockingIOError:
                break
            except OSError as exc:
                if exc.errno == errno.EIO:
                    break
                raise
        return self.decoder.decode(b"".join(chunks)) if chunks else ""

    def write(self, data: bytes) -> None:
        if self.closed or self.proc.poll() is not None:
            return
        try:
            os.write(self.master_fd, data)
        except OSError:
            pass

    def interrupt(self) -> None:
        if self.proc.poll() is None:
            try:
                os.killpg(self.proc.pid, signal.SIGINT)
            except OSError:
                pass

    def poll(self) -> Optional[int]:
        return self.proc.poll()

    def finish(self) -> int:
        rc = self.proc.poll()
        if rc is None:
            rc = self.proc.wait(timeout=0.2)
        try:
            self.decoder.decode(b"", final=True)
        except Exception:
            pass
        if not self.closed:
            try:
                os.close(self.master_fd)
            except OSError:
                pass
            self.closed = True
        return int(rc)


class SparkUI:
    def __init__(self, stdscr: "curses._CursesWindow", spark_path: str):
        self.stdscr = stdscr
        self.spark_path = spark_path
        self.category_index = 0
        self.action_index = 0
        self.category_scroll = 0
        self.action_scroll = 0
        self.focus = 1
        self.filter_mode = False
        self.filter_query = ""
        self.log_lines: List[str] = []
        self.log_partial = ""
        self.log_scroll = 0
        self.max_log_lines = 6000
        self.task: Optional[TaskProcess] = None
        self.task_label = ""
        self.last_task_status = "READY"
        self.status: Dict[str, str] = collect_status()
        self.status_future: Optional[concurrent.futures.Future] = None
        self.executor = concurrent.futures.ThreadPoolExecutor(max_workers=1, thread_name_prefix="spark-status")
        self.next_status_refresh = time.monotonic() + 2.5
        self.next_clock_tick = 0.0
        self.clock_text = ""
        self.dirty = True
        self.running = True
        self.message = "Ready"
        self.last_size: Tuple[int, int] = (0, 0)
        self.windows: Dict[str, "curses._CursesWindow"] = {}
        self.modal_open = False
        self._init_curses()
        self._load_latest_log(silent=True)

    def _init_curses(self) -> None:
        try:
            curses.curs_set(0)
        except curses.error:
            pass
        curses.noecho()
        curses.cbreak()
        self.stdscr.keypad(True)
        self.stdscr.timeout(100)
        if curses.has_colors():
            curses.start_color()
            default_bg = curses.COLOR_BLACK
            try:
                curses.use_default_colors()
                default_bg = -1
            except curses.error:
                pass
            curses.init_pair(1, curses.COLOR_CYAN, default_bg)
            curses.init_pair(2, curses.COLOR_GREEN, default_bg)
            curses.init_pair(3, curses.COLOR_YELLOW, default_bg)
            curses.init_pair(4, curses.COLOR_RED, default_bg)
            curses.init_pair(5, curses.COLOR_BLACK, curses.COLOR_CYAN)
            curses.init_pair(6, curses.COLOR_WHITE, curses.COLOR_BLUE)
            curses.init_pair(7, curses.COLOR_WHITE, default_bg)

    def color(self, pair: int) -> int:
        return curses.color_pair(pair) if curses.has_colors() else 0

    def append_log(self, text: str, prefix: str = "") -> None:
        if not text:
            return
        clean = strip_ansi(text).replace("\t", "    ")
        clean = clean.replace("\r\n", "\n").replace("\r", "\n")
        combined = self.log_partial + clean
        parts = combined.split("\n")
        self.log_partial = parts.pop() if parts else ""
        for line in parts:
            line = line.rstrip()
            if prefix and line:
                line = prefix + line
            if line or (self.log_lines and self.log_lines[-1] != ""):
                self.log_lines.append(line)
        if len(self.log_lines) > self.max_log_lines:
            self.log_lines = self.log_lines[-self.max_log_lines:]
        self.dirty = True

    def finalize_partial(self) -> None:
        if self.log_partial:
            self.log_lines.append(self.log_partial.rstrip())
            self.log_partial = ""
            self.dirty = True

    def current_actions(self) -> List[Action]:
        actions = CATEGORIES[self.category_index][1]
        query = self.filter_query.strip().lower()
        if not query:
            return actions
        def fuzzy_match(action: Action) -> bool:
            hay = f"{action.label} {action.description} {action.action_id}".lower()
            pos = 0
            for ch in query:
                pos = hay.find(ch, pos)
                if pos < 0:
                    return False
                pos += 1
            return True
        return [a for a in actions if fuzzy_match(a)]

    def selected_action(self) -> Optional[Action]:
        actions = self.current_actions()
        if not actions:
            return None
        self.action_index = max(0, min(self.action_index, len(actions) - 1))
        return actions[self.action_index]

    def layout(self) -> None:
        h, w = self.stdscr.getmaxyx()
        self.last_size = (h, w)
        self.windows.clear()
        if h < 22 or w < 88:
            return
        header_h = 3
        footer_h = 2
        top_h = max(10, min(13, (h - header_h - footer_h) // 2))
        log_h = h - header_h - footer_h - top_h
        cat_w = max(20, min(28, w // 6))
        act_w = max(38, min(66, w * 2 // 5))
        detail_w = w - cat_w - act_w
        if detail_w < 30:
            deficit = 30 - detail_w
            act_w = max(34, act_w - deficit)
            detail_w = w - cat_w - act_w
        self.windows["header"] = curses.newwin(header_h, w, 0, 0)
        self.windows["categories"] = curses.newwin(top_h, cat_w, header_h, 0)
        self.windows["actions"] = curses.newwin(top_h, act_w, header_h, cat_w)
        self.windows["details"] = curses.newwin(top_h, detail_w, header_h, cat_w + act_w)
        self.windows["log"] = curses.newwin(log_h, w, header_h + top_h, 0)
        self.windows["status"] = curses.newwin(1, w, h - 2, 0)
        self.windows["footer"] = curses.newwin(1, w, h - 1, 0)
        if self.task:
            self.task.resize(max(8, log_h - 2), max(40, w - 2))
        self.dirty = True

    @staticmethod
    def safe_add(win: "curses._CursesWindow", y: int, x: int, text: str, attr: int = 0) -> None:
        try:
            h, w = win.getmaxyx()
            if y < 0 or y >= h or x < 0 or x >= w:
                return
            width = max(0, w - x - 1)
            if width > 0:
                win.addnstr(y, x, text, width, attr)
        except curses.error:
            pass

    def draw_box(self, win: "curses._CursesWindow", title: str, focused: bool = False) -> None:
        win.erase()
        try:
            win.box()
        except curses.error:
            pass
        attr = self.color(1) | (curses.A_BOLD if focused else 0)
        self.safe_add(win, 0, 2, f" {title} ", attr)

    def draw_header(self) -> None:
        win = self.windows["header"]
        win.erase()
        _, w = win.getmaxyx()
        title = f" SPARK SERVER MANAGER  v{SPARK_UI_VERSION} "
        host = os.uname().nodename.split(".")[0]
        right = f"{host}  {self.clock_text} "
        self.safe_add(win, 0, 0, " " * max(0, w - 1), self.color(6) | curses.A_BOLD)
        self.safe_add(win, 0, 1, title, self.color(6) | curses.A_BOLD)
        self.safe_add(win, 0, max(1, w - len(right) - 1), right, self.color(6))
        commit = self.status.get("commit", "n/a")
        summary = f" commit {commit}  |  history {self.status.get('steps','0/18')}  |  db5432 {self.status.get('db_access','CLOSED')}  |  studio8443 {self.status.get('studio','CLOSED')}  |  nginx {self.status.get('nginx','?')}  |  load {self.status.get('load','?')}  mem {self.status.get('memory','?')}  disk {self.status.get('disk','?')}"
        self.safe_add(win, 1, 1, summary, self.color(7))
        self.safe_add(win, 2, 0, "-" * max(0, w - 1), self.color(1))
        win.noutrefresh()

    def draw_categories(self) -> None:
        win = self.windows["categories"]
        self.draw_box(win, "SECTIONS", self.focus == 0 and not self.task)
        h, _ = win.getmaxyx()
        visible = max(1, h - 2)
        if self.category_index < self.category_scroll:
            self.category_scroll = self.category_index
        if self.category_index >= self.category_scroll + visible:
            self.category_scroll = self.category_index - visible + 1
        for row, idx in enumerate(range(self.category_scroll, min(len(CATEGORIES), self.category_scroll + visible)), start=1):
            name = CATEGORIES[idx][0]
            selected = idx == self.category_index
            attr = self.color(5) | curses.A_BOLD if selected else self.color(7)
            self.safe_add(win, row, 1, f"{'>' if selected else ' '} {name}", attr)
        win.noutrefresh()

    def action_badge(self, action: Action) -> str:
        if action.action_id.startswith("install-") and action.action_id != "install-all":
            try:
                n = int(action.action_id.rsplit("-", 1)[1])
                completed = {int(x) for x in self.status.get("step_set", "").split(",") if x}
                return "HIST" if n in completed else ""
            except ValueError:
                return ""
        if action.action_id in ("admin-open", "admin-close"):
            return self.status.get("admin", "")
        return ""

    def draw_actions(self) -> None:
        win = self.windows["actions"]
        title = "ACTIONS" + (f" /{self.filter_query}" if self.filter_query else "")
        self.draw_box(win, title, self.focus == 1 and not self.task)
        actions = self.current_actions()
        h, w = win.getmaxyx()
        visible = max(1, h - 2)
        if not actions:
            self.safe_add(win, 2, 2, "No matching actions", self.color(3))
            win.noutrefresh()
            return
        self.action_index = min(self.action_index, len(actions) - 1)
        if self.action_index < self.action_scroll:
            self.action_scroll = self.action_index
        if self.action_index >= self.action_scroll + visible:
            self.action_scroll = self.action_index - visible + 1
        for row, idx in enumerate(range(self.action_scroll, min(len(actions), self.action_scroll + visible)), start=1):
            action = actions[idx]
            selected = idx == self.action_index
            badge = self.action_badge(action)
            badge_text = f" [{badge}]" if badge else ""
            label = action.label[:max(1, w - 5 - len(badge_text))]
            attr = self.color(5) | curses.A_BOLD if selected else self.color(7)
            self.safe_add(win, row, 1, f"{'>' if selected else ' '} {label}{badge_text}", attr)
        win.noutrefresh()

    def draw_details(self) -> None:
        win = self.windows["details"]
        self.draw_box(win, "DETAILS / LIVE STATUS", False)
        h, w = win.getmaxyx()
        action = self.selected_action()
        y = 1
        if action:
            self.safe_add(win, y, 2, action.label, self.color(1) | curses.A_BOLD)
            y += 1
            for line in textwrap.wrap(action.description, width=max(10, w - 4))[:2]:
                self.safe_add(win, y, 2, line, self.color(7)); y += 1
            risk_attr = {"safe": self.color(2), "controlled": self.color(3), "confirm": self.color(4)}.get(action.risk, self.color(7))
            self.safe_add(win, y, 2, f"Risk: {action.risk}", risk_attr | curses.A_BOLD); y += 1
        if y < h - 1:
            self.safe_add(win, y, 1, "-" * max(1, w - 3), self.color(1)); y += 1
        for label, value in [("Nginx", self.status.get("nginx", "?")), ("Docker", self.status.get("docker", "?")), ("DB 5432", self.status.get("db_access", "?")), ("Studio 8443", self.status.get("studio", "?")), ("History", self.status.get("steps", "?")), ("Backups", self.status.get("backups", "?")), ("Uptime", self.status.get("uptime", "?"))]:
            if y >= h - 1:
                break
            attr = self.color(2) if value in ("active", "OPEN") else self.color(7)
            self.safe_add(win, y, 2, f"{label:<12} {value}", attr); y += 1
        win.noutrefresh()

    def log_view_lines(self, width: int, height: int) -> List[str]:
        raw = list(self.log_lines)
        if self.log_partial:
            raw.append(self.log_partial)
        wrapped: List[str] = []
        width = max(10, width)
        for line in raw:
            if not line:
                wrapped.append(""); continue
            while len(line) > width:
                wrapped.append(line[:width]); line = line[width:]
            wrapped.append(line)
        end = max(0, len(wrapped) - self.log_scroll)
        return wrapped[max(0, end - height):end]

    def draw_log(self) -> None:
        win = self.windows["log"]
        task_state = f"RUNNING: {self.task_label}" if self.task else f"OUTPUT: {self.last_task_status}"
        self.draw_box(win, task_state, self.focus == 2 and not self.task)
        h, w = win.getmaxyx()
        for row, line in enumerate(self.log_view_lines(max(10, w - 4), max(1, h - 2)), start=1):
            attr = self.color(7)
            lower = line.lower()
            if "error" in lower or "failed" in lower or "✗" in line:
                attr = self.color(4)
            elif "warning" in lower or "warn" in lower:
                attr = self.color(3)
            elif "success" in lower or "✓" in line or " rc=0 " in f" {line} ":
                attr = self.color(2)
            self.safe_add(win, row, 2, line, attr)
        if self.log_scroll:
            self.safe_add(win, 0, max(2, w - 20), f" +{self.log_scroll} lines ", self.color(3))
        win.noutrefresh()

    def draw_status_bar(self) -> None:
        win = self.windows["status"]
        win.erase(); w = win.getmaxyx()[1]
        if self.task:
            text, attr = f" TASK ACTIVE | keyboard input -> {self.task_label} | Ctrl-C cancels | PgUp/PgDn scroll output ", self.color(3) | curses.A_BOLD
        elif self.filter_mode:
            text, attr = f" FILTER: {self.filter_query}_   Esc clear   Enter run selected ", self.color(1) | curses.A_BOLD
        else:
            text, attr = f" {self.message} ", self.color(7)
        self.safe_add(win, 0, 0, " " * max(0, w - 1), attr); self.safe_add(win, 0, 0, text, attr); win.noutrefresh()

    def draw_footer(self) -> None:
        win = self.windows["footer"]
        win.erase(); w = win.getmaxyx()[1]
        text = " PgUp/PgDn Scroll  Ctrl-C Cancel task  input/Enter -> task " if self.task else " Tab/Left/Right Pane  Up/Down Move  Enter Run  / Filter  L Logs  R Refresh  ? Help  Q Quit "
        self.safe_add(win, 0, 0, " " * max(0, w - 1), self.color(6)); self.safe_add(win, 0, 1, text, self.color(6) | curses.A_BOLD); win.noutrefresh()

    def draw_small_terminal(self) -> None:
        self.stdscr.erase(); h, w = self.stdscr.getmaxyx()
        for i, line in enumerate(["Spark Server Manager requires a larger terminal.", f"Current: {w}x{h}", "Minimum: 88 columns x 22 rows", "Resize the terminal; the UI will recover automatically."]):
            try: self.stdscr.addnstr(2 + i, 2, line, max(1, w - 4), self.color(3) | (curses.A_BOLD if i == 0 else 0))
            except curses.error: pass
        self.stdscr.noutrefresh(); curses.doupdate()

    def render(self) -> None:
        h, w = self.stdscr.getmaxyx()
        if (h, w) != self.last_size: self.layout()
        if h < 22 or w < 88:
            self.draw_small_terminal(); self.dirty = False; return
        self.draw_header(); self.draw_categories(); self.draw_actions(); self.draw_details(); self.draw_log(); self.draw_status_bar(); self.draw_footer(); curses.doupdate(); self.dirty = False

    def refresh_status_async(self, force: bool = False) -> None:
        now = time.monotonic()
        if self.status_future and self.status_future.done():
            try: self.status = self.status_future.result(); self.dirty = True
            except Exception as exc: self.message = f"Status refresh failed: {exc}"
            self.status_future = None; self.next_status_refresh = now + 3.0
        if (force or now >= self.next_status_refresh) and self.status_future is None:
            self.status_future = self.executor.submit(collect_status); self.next_status_refresh = now + 3.0

    def tick_clock(self) -> None:
        now = time.monotonic()
        if now >= self.next_clock_tick:
            new = time.strftime("%Y-%m-%d %H:%M:%S")
            if new != self.clock_text: self.clock_text = new; self.dirty = True
            self.next_clock_tick = now + 0.5

    def pump_task(self) -> None:
        if not self.task: return
        try: output = self.task.read_available()
        except Exception as exc: self.append_log(f"\n[UI] PTY read error: {exc}\n"); output = ""
        if output: self.append_log(output)
        rc = self.task.poll()
        if rc is not None:
            for _ in range(3):
                extra = self.task.read_available()
                if not extra: break
                self.append_log(extra)
            self.finalize_partial(); rc = self.task.finish(); label = self.task_label; self.task = None; self.task_label = ""
            self.last_task_status = "SUCCESS" if rc == 0 else f"FAILED rc={rc}"
            self.message = f"{label}: {self.last_task_status}"
            self.append_log(f"\n[UI] {label} finished with exit code {rc}.\n")
            self.refresh_status_async(force=True); self.dirty = True

    def move_selection(self, delta: int) -> None:
        if self.focus == 0:
            self.category_index = (self.category_index + delta) % len(CATEGORIES); self.action_index = 0; self.action_scroll = 0; self.filter_query = ""
        elif self.focus == 1:
            actions = self.current_actions()
            if actions: self.action_index = (self.action_index + delta) % len(actions)
        else: self.log_scroll = max(0, self.log_scroll + (-delta))
        self.dirty = True

    def start_action(self, action: Action, extra: Sequence[str] = ()) -> None:
        if self.task:
            self.message = "A task is already running."; self.dirty = True; return
        if action.special == "logs": self.choose_recent_log(); return
        if action.special == "docker":
            service = self.choose_docker_service()
            if not service: return
            action_id, extra, label = "diagnostic-docker-logs", [service], f"Docker logs: {service}"
        else: action_id, label = action.action_id, action.label
        log_h = self.windows.get("log").getmaxyx()[0] if self.windows.get("log") else 10
        width = self.stdscr.getmaxyx()[1]
        self.append_log(f"\n----- {label} | {time.strftime('%Y-%m-%d %H:%M:%S')} -----\n")
        try:
            self.task = TaskProcess(self.spark_path, action_id, extra, max(8, log_h - 2), max(40, width - 2)); self.task_label = label; self.last_task_status = "RUNNING"; self.log_scroll = 0; self.message = f"Running: {label}"; self.dirty = True
        except Exception as exc:
            self.task = None; self.last_task_status = "FAILED TO START"; self.append_log(f"[UI] Failed to start task: {exc}\n"); self.message = f"Failed to start {label}"

    def forward_task_key(self, key: Union[int, str]) -> None:
        if not self.task: return
        if key == curses.KEY_PPAGE: self.log_scroll = min(len(self.log_lines), self.log_scroll + 5); self.dirty = True; return
        if key == curses.KEY_NPAGE: self.log_scroll = max(0, self.log_scroll - 5); self.dirty = True; return
        if key == 3 or key == "\x03": self.message = "Sending Ctrl-C to running task..."; self.task.interrupt(); self.dirty = True; return
        mapping = {curses.KEY_UP: b"\x1b[A", curses.KEY_DOWN: b"\x1b[B", curses.KEY_RIGHT: b"\x1b[C", curses.KEY_LEFT: b"\x1b[D", curses.KEY_BACKSPACE: b"\x7f", curses.KEY_DC: b"\x1b[3~", curses.KEY_HOME: b"\x1b[H", curses.KEY_END: b"\x1b[F"}
        if isinstance(key, int):
            if key in mapping: self.task.write(mapping[key])
            elif key in (10, 13, curses.KEY_ENTER): self.task.write(b"\n")
            elif 0 <= key < 256: self.task.write(bytes([key]))
            return
        if key in ("\n", "\r"): self.task.write(b"\n")
        elif key in ("\x7f", "\b"): self.task.write(b"\x7f")
        else: self.task.write(key.encode("utf-8", "replace"))

    def modal_select(self, title: str, items: Sequence[str], hint: str = "Enter select  Esc cancel") -> Optional[str]:
        if not items: self.message = "No items available."; self.dirty = True; return None
        h, w = self.stdscr.getmaxyx(); mh = min(max(8, len(items) + 4), max(8, h - 4)); mw = min(max(50, max(len(x) for x in items) + 6), max(50, w - 8)); y = max(0, (h - mh) // 2); x = max(0, (w - mw) // 2)
        win = curses.newwin(mh, mw, y, x); win.keypad(True); win.timeout(-1); index = 0; scroll = 0; self.modal_open = True
        try:
            while True:
                win.erase()
                try: win.box()
                except curses.error: pass
                self.safe_add(win, 0, 2, f" {title} ", self.color(1) | curses.A_BOLD); visible = max(1, mh - 3)
                if index < scroll: scroll = index
                if index >= scroll + visible: scroll = index - visible + 1
                for row, idx in enumerate(range(scroll, min(len(items), scroll + visible)), start=1):
                    attr = self.color(5) | curses.A_BOLD if idx == index else self.color(7); self.safe_add(win, row, 1, ("> " if idx == index else "  ") + items[idx], attr)
                self.safe_add(win, mh - 1, 2, f" {hint} ", self.color(3)); win.noutrefresh(); curses.doupdate(); key = win.get_wch()
                if key in (curses.KEY_UP, "k"): index = (index - 1) % len(items)
                elif key in (curses.KEY_DOWN, "j"): index = (index + 1) % len(items)
                elif key == curses.KEY_PPAGE: index = max(0, index - visible)
                elif key == curses.KEY_NPAGE: index = min(len(items) - 1, index + visible)
                elif key in (10, 13, curses.KEY_ENTER, "\n", "\r"): return items[index]
                elif key in (27, "\x1b", "q", "Q"): return None
        finally:
            self.modal_open = False; del win; self.dirty = True

    def modal_text(self, title: str, lines: Sequence[str]) -> None:
        h, w = self.stdscr.getmaxyx(); mh = min(max(10, h - 6), h - 2); mw = min(max(60, w - 14), w - 2); y = max(0, (h - mh) // 2); x = max(0, (w - mw) // 2)
        win = curses.newwin(mh, mw, y, x); win.keypad(True); win.timeout(-1); offset = 0; self.modal_open = True
        try:
            wrapped: List[str] = []; width = max(20, mw - 4)
            for line in lines: wrapped.extend(textwrap.wrap(line, width=width) or [""])
            while True:
                win.erase()
                try: win.box()
                except curses.error: pass
                self.safe_add(win, 0, 2, f" {title} ", self.color(1) | curses.A_BOLD); visible = mh - 2
                for row, line in enumerate(wrapped[offset:offset + visible], start=1): self.safe_add(win, row, 2, line, self.color(7))
                self.safe_add(win, mh - 1, 2, " Up/Down/PgUp/PgDn scroll  Esc/Q close ", self.color(3)); win.noutrefresh(); curses.doupdate(); key = win.get_wch()
                if key in (curses.KEY_UP, "k"): offset = max(0, offset - 1)
                elif key in (curses.KEY_DOWN, "j"): offset = min(max(0, len(wrapped) - visible), offset + 1)
                elif key == curses.KEY_PPAGE: offset = max(0, offset - visible)
                elif key == curses.KEY_NPAGE: offset = min(max(0, len(wrapped) - visible), offset + visible)
                elif key in (27, "\x1b", "q", "Q", 10, 13, curses.KEY_ENTER, "\n", "\r"): return
        finally:
            self.modal_open = False; del win; self.dirty = True

    def choose_docker_service(self) -> Optional[str]:
        try:
            result = subprocess.run([self.spark_path, "--backend-list-docker-services"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=4, check=False); services = [x.strip() for x in result.stdout.splitlines() if x.strip()]
        except (OSError, subprocess.TimeoutExpired): services = []
        return self.modal_select("DOCKER SERVICES", services)

    def _recent_log_paths(self) -> List[Path]:
        try:
            paths = [Path(p) for p in glob.glob(str(LOG_DIR / "*.log"))]
            return sorted(paths, key=lambda p: p.stat().st_mtime, reverse=True)[:40]
        except OSError: return []

    def _load_latest_log(self, silent: bool = False) -> None:
        paths = self._recent_log_paths()
        if not paths:
            if not silent: self.message = "No manager logs found."
            return
        self.load_log_file(paths[0], silent=silent)

    def load_log_file(self, path: Path, silent: bool = False) -> None:
        try: data = path.read_text(errors="replace")
        except OSError as exc: self.message = f"Cannot read log: {exc}"; return
        self.log_lines = [f"[log] {path.name}", ""] + strip_ansi(data).splitlines()[-1000:]; self.log_partial = ""; self.log_scroll = 0; self.last_task_status = "LOG VIEW"
        if not silent: self.message = f"Loaded {path.name}"
        self.dirty = True

    def choose_recent_log(self) -> None:
        paths = self._recent_log_paths()
        if not paths: self.message = "No manager logs found."; self.dirty = True; return
        selected = self.modal_select("RECENT SPARK LOGS", [p.name for p in paths])
        if selected:
            for p in paths:
                if p.name == selected: self.load_log_file(p); break

    def show_help(self) -> None:
        self.modal_text("HELP", [
            "Spark Server Manager v2 keeps the dashboard, menus, status and task output in one curses screen.",
            "Navigation: Tab or Left/Right switches panes. Up/Down moves the current selection. Enter runs the selected action.",
            "Filtering: press / and type a fuzzy subsequence; Backspace edits; Esc clears the filter.",
            "Logs: press L to browse persistent manager logs. Diagnostics > Docker service logs opens an in-dashboard service chooser.",
            "Running tasks: the lower pane becomes the task terminal. Printable keys and Enter are routed to the child PTY, so existing confirmations such as MIGRATE, OPEN, RESTART and installation prompts continue to work without leaving the dashboard.",
            "Cleanup / Remove actions are destructive and require their exact confirmation phrase before any deletion runs.",
            "While a task runs, PgUp/PgDn scrolls output and Ctrl-C sends SIGINT to the task process group.",
            "The UI refreshes only when state changes and uses curses noutrefresh/doupdate so unchanged cells are not repainted continuously.",
        ])

    def handle_idle_key(self, key: Union[int, str]) -> None:
        if key == curses.KEY_RESIZE: self.layout(); return
        if self.filter_mode:
            if key in (27, "\x1b"): self.filter_mode = False; self.filter_query = ""; self.action_index = 0; self.action_scroll = 0
            elif key in (10, 13, curses.KEY_ENTER, "\n", "\r"):
                self.filter_mode = False; action = self.selected_action(); self.start_action(action) if action else None
            elif key in (curses.KEY_BACKSPACE, 127, "\x7f", "\b"): self.filter_query = self.filter_query[:-1]; self.action_index = 0; self.action_scroll = 0
            elif isinstance(key, str) and key.isprintable(): self.filter_query += key; self.action_index = 0; self.action_scroll = 0
            self.dirty = True; return
        if key in ("q", "Q"): self.running = False
        elif key == "?": self.show_help()
        elif key in ("l", "L"): self.choose_recent_log()
        elif key in ("r", "R"): self.refresh_status_async(force=True); self.message = "Refreshing status..."; self.dirty = True
        elif key == "/": self.filter_mode = True; self.filter_query = ""; self.focus = 1; self.dirty = True
        elif key in (curses.KEY_UP, "k"): self.move_selection(-1)
        elif key in (curses.KEY_DOWN, "j"): self.move_selection(1)
        elif key == curses.KEY_PPAGE: self.log_scroll = min(len(self.log_lines), self.log_scroll + 5); self.dirty = True
        elif key == curses.KEY_NPAGE: self.log_scroll = max(0, self.log_scroll - 5); self.dirty = True
        elif key in (9, "\t"): self.focus = (self.focus + 1) % 3; self.dirty = True
        elif key in (curses.KEY_LEFT, "h"): self.focus = max(0, self.focus - 1); self.dirty = True
        elif key == curses.KEY_RIGHT: self.focus = min(2, self.focus + 1); self.dirty = True
        elif key in (10, 13, curses.KEY_ENTER, "\n", "\r"):
            if self.focus == 0: self.focus = 1; self.action_index = 0; self.action_scroll = 0
            elif self.focus == 1:
                action = self.selected_action(); self.start_action(action) if action else None
            self.dirty = True

    def run(self) -> int:
        self.layout()
        try:
            while self.running:
                self.tick_clock(); self.refresh_status_async(); self.pump_task()
                if self.dirty and not self.modal_open: self.render()
                try: key = self.stdscr.get_wch()
                except curses.error: continue
                if self.task:
                    if key == curses.KEY_RESIZE: self.layout()
                    else: self.forward_task_key(key)
                else: self.handle_idle_key(key)
        finally:
            if self.task and self.task.poll() is None: self.task.interrupt(); time.sleep(0.1)
            self.executor.shutdown(wait=False, cancel_futures=True)
        return 0


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--spark", default="/usr/local/bin/spark")
    parser.add_argument("--self-test", action="store_true")
    return parser.parse_args(argv)


def self_test() -> int:
    assert SPARK_UI_VERSION == "3.1.0+20260910.1"
    assert len(CATEGORIES) >= 9
    ids = {a.action_id for _, actions in CATEGORIES for a in actions if not a.special}
    required = {"diagnostic-full", "diagnostic-installation-status", "app-update", "install-all", "manager-update", "admin-open", "cleanup-database", "cleanup-full", "cleanup-manager"}
    if not required.issubset(ids): raise RuntimeError("action registry is incomplete")
    import curses as _curses
    import pty as _pty
    return 0


def main(argv: Sequence[str]) -> int:
    locale.setlocale(locale.LC_ALL, "")
    args = parse_args(argv)
    if args.self_test: return self_test()
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    try: os.chmod(LOG_DIR, 0o700)
    except OSError: pass
    try: return curses.wrapper(lambda stdscr: SparkUI(stdscr, args.spark).run())
    except Exception as exc:
        try:
            with CRASH_LOG.open("a", encoding="utf-8") as fh:
                import traceback
                fh.write(f"\n[{time.strftime('%Y-%m-%dT%H:%M:%S%z')}] Spark UI crash\n")
                traceback.print_exc(file=fh)
        except OSError: pass
        print(f"Spark UI failed: {exc}", file=sys.stderr)
        print(f"Crash log: {CRASH_LOG}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
