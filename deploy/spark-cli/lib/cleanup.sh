cleanup_unmark_steps() {
  local step
  for step in "$@"; do
    unmark_step "$step"
  done
}

cleanup_find_database_data_bind() {
  local rendered output rc
  [[ -f "${SUPABASE_ROOT}/docker-compose.yml" ]] || {
    fail "docker-compose.yml is missing; the database data path cannot be determined." >&2
    return 1
  }
  rendered="$(mktemp)"
  if ! compose config --format json >"$rendered" 2>>"$CURRENT_LOG"; then
    rm -f "$rendered"
    fail "The current Compose configuration cannot be analyzed; database deletion was stopped to avoid guessing." >&2
    return 1
  fi

  set +e
  output="$(python3 - "$rendered" "$SUPABASE_ROOT" <<'PY'
import json
import os
import sys

path, root = sys.argv[1:3]
root = os.path.realpath(root)
try:
    data = json.load(open(path, encoding="utf-8"))
except Exception:
    raise SystemExit(2)

db = (data.get("services") or {}).get("db") or {}
volumes = db.get("volumes") or []
matches = []
for item in volumes:
    source = target = kind = None
    if isinstance(item, dict):
        source = item.get("source")
        target = item.get("target")
        kind = item.get("type")
    elif isinstance(item, str):
        parts = item.split(":")
        if len(parts) >= 2:
            source, target = parts[0], parts[1]
            kind = "bind"
    if target != "/var/lib/postgresql/data" or not source:
        continue
    if kind not in (None, "bind"):
        raise SystemExit(3)
    source = os.path.realpath(source if os.path.isabs(source) else os.path.join(root, source))
    if source == root or not source.startswith(root + os.sep):
        raise SystemExit(4)
    matches.append(source)

if len(matches) != 1:
    raise SystemExit(5)
print(matches[0])
PY
)"
  rc=$?
  set -e
  rm -f "$rendered"
  if (( rc != 0 )) || [[ -z "$output" ]]; then
    fail "The database mount cannot be identified with certainty; nothing was deleted." >&2
    return 1
  fi
  printf '%s\n' "$output"
}

cleanup_database_data() {
  local db_data
  new_log "cleanup-database"
  db_data="$(cleanup_find_database_data_bind)" || return 1
  info "PostgreSQL data path: ${db_data}"
  if ! confirm_word "This operation deletes all PostgreSQL data and stops Supabase. To rebuild the runtime, run installation step 11 again. Database migrations are handled separately through spark-migrate." "DELETE-DATABASE"; then
    warn "Database deletion cancelled."
    return 1
  fi

  close_database_external_access >/dev/null 2>&1 || true
  close_supabase_studio_access >/dev/null 2>&1 || true
  run_logged "Stop Supabase before database wipe" compose down --remove-orphans || return 1
  [[ -n "$db_data" && "$db_data" != "/" ]] || { fail "The database path is unsafe; deletion was stopped."; return 1; }
  rm -rf -- "$db_data"
  if [[ -e "$db_data" ]]; then
    fail "The database data path could not be deleted."
    return 1
  fi
  cleanup_unmark_steps 11
  rm -f "${STEP_DIR}/12.ok"  # legacy marker from removed install step
  ok "PostgreSQL database data was completely deleted. The runtime is stopped; run installation steps 11 and 12 to rebuild it."
}

cleanup_supabase_runtime() {
  new_log "cleanup-supabase-runtime"
  if ! confirm_word "This operation deletes the complete local Supabase runtime, including the database, Storage/runtime data, Compose configuration, and secrets under /opt/spark-supabase." "DELETE-SUPABASE"; then
    warn "Supabase runtime deletion cancelled."
    return 1
  fi

  close_database_external_access >/dev/null 2>&1 || true
  close_supabase_studio_access >/dev/null 2>&1 || true
  if [[ -f "${SUPABASE_ROOT}/docker-compose.yml" ]]; then
    compose down --volumes --remove-orphans >>"$CURRENT_LOG" 2>&1 || true
  fi
  rm -rf -- "$SUPABASE_ROOT"
  [[ ! -e "$SUPABASE_ROOT" ]] || { fail "${SUPABASE_ROOT} could not be deleted."; return 1; }
  cleanup_unmark_steps 5 6 7 8 9 10 11 12
  ok "Supabase runtime was deleted. The source pin at ${SUPABASE_SOURCE} was preserved."
}

cleanup_frontend_deploy() {
  new_log "cleanup-frontend"
  if ! confirm_word "This operation deletes only the deployed frontend at /var/www/spark. The source repository will remain intact." "DELETE-FRONTEND"; then
    warn "Frontend deletion cancelled."
    return 1
  fi
  rm -rf -- /var/www/spark
  cleanup_unmark_steps 13
  [[ ! -e /var/www/spark ]] || { fail "The frontend deployment could not be deleted."; return 1; }
  ok "Frontend deployment was deleted."
}

cleanup_spark_source() {
  new_log "cleanup-spark-source"
  if ! confirm_word "This operation completely deletes the local Spark source repository at /opt/spark. GitHub and Spark Manager are not affected." "DELETE-SOURCE"; then
    warn "Spark source deletion cancelled."
    return 1
  fi
  rm -rf -- "$SPARK_ROOT"
  cleanup_unmark_steps 4 8 12 13
  [[ ! -e "$SPARK_ROOT" ]] || { fail "${SPARK_ROOT} could not be deleted."; return 1; }
  ok "The local Spark source repository was deleted."
}

cleanup_manager_logs() {
  new_log "cleanup-logs"
  if ! confirm_word "All Spark Manager logs under ${LOG_DIR} will be deleted. System journal entries and Docker logs will not be modified." "DELETE-LOGS"; then
    warn "Log deletion cancelled."
    return 1
  fi
  find "$LOG_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + 2>/dev/null || true
  mkdir -p "$LOG_DIR"
  chmod 700 "$LOG_DIR"
  ok "Spark Manager logs were deleted."
}

cleanup_prune_backups() {
  local days="${1:-7}" candidates_file path bytes total_bytes=0 count=0
  local -a candidates=()

  [[ "$days" =~ ^[0-9]+$ ]] && (( days >= 1 && days <= 3650 )) || {
    fail "Retention must be a number between 1 and 3650 days."
    return 2
  }

  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  candidates_file="$(mktemp)"
  if ! python3 - "$BACKUP_DIR" "$days" >"$candidates_file" <<'PY'
import os
import sys
import time
from pathlib import Path

root = Path(sys.argv[1]).resolve()
days = int(sys.argv[2])
cutoff = time.time() - (days * 86400)

if not root.is_dir():
    raise SystemExit(0)

children = [p for p in root.iterdir() if not p.is_symlink()]
groups = [
    [p for p in children if p.is_dir()],
    [p for p in children if p.is_file() and p.match("postgres-*.dump")],
    [p for p in children if p.is_file() and p.match("storage-*.tar.gz")],
]

candidates = []
for group in groups:
    if not group:
        continue
    newest = max(group, key=lambda p: p.stat().st_mtime)
    for path in group:
        if path == newest:
            continue
        try:
            old = path.stat().st_mtime < cutoff
        except OSError:
            continue
        if old:
            candidates.append(path)

for path in sorted(candidates, key=lambda p: p.stat().st_mtime):
    raw = os.fsencode(str(path))
    sys.stdout.buffer.write(raw + b"\0")
PY
  then
    rm -f "$candidates_file"
    fail "Backup analysis failed; no backups were deleted."
    return 1
  fi

  mapfile -d '' -t candidates <"$candidates_file" || true
  rm -f "$candidates_file"

  if (( ${#candidates[@]} == 0 )); then
    ok "No backups older than ${days} days are eligible for deletion."
    info "The newest directory backup, newest PostgreSQL dump, and newest Storage archive are always protected."
    return 0
  fi

  printf '\nBackups eligible for deletion (older than %s days):\n\n' "$days"
  for path in "${candidates[@]}"; do
    [[ "$path" == "$BACKUP_DIR/"* && "$path" != "$BACKUP_DIR" ]] || {
      fail "Unsafe backup path detected; nothing was deleted: $path"
      return 1
    }
    bytes="$(du -sb -- "$path" 2>/dev/null | awk '{print $1}')"
    [[ "$bytes" =~ ^[0-9]+$ ]] || bytes=0
    total_bytes=$((total_bytes + bytes))
    count=$((count + 1))
    printf '  %-10s %s\n' "$(du -sh -- "$path" 2>/dev/null | awk '{print $1}')" "$path"
  done

  printf '\nCount: %d\n' "$count"
  printf 'Reclaimable space: %s\n' "$(numfmt --to=iec-i --suffix=B "$total_bytes" 2>/dev/null || printf '%s bytes' "$total_bytes")"
  info "Only backups under ${BACKUP_DIR} are inspected; live Supabase/PostgreSQL data is never modified by this action."
  info "The newest backup from each group (directory, PostgreSQL dump, Storage archive) is preserved even when it is old."

  if ! confirm_word "Delete the listed backups?" "PRUNE-BACKUPS"; then
    warn "Backup cleanup cancelled."
    return 1
  fi

  for path in "${candidates[@]}"; do
    [[ "$path" == "$BACKUP_DIR/"* && "$path" != "$BACKUP_DIR" ]] || {
      fail "Unsafe backup path detected; deletion was stopped: $path"
      return 1
    }
    rm -rf -- "$path"
  done

  ok "${count} old backup(s) were deleted."
  info "Approximate reclaimed space: $(numfmt --to=iec-i --suffix=B "$total_bytes" 2>/dev/null || printf '%s bytes' "$total_bytes")"
}

cleanup_backups() {
  local choice days
  new_log "cleanup-backups"
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"

  printf '\nBackup cleanup / free space\n\n'
  printf 'Path: %s\n' "$BACKUP_DIR"
  printf 'Current size: %s\n\n' "$(du -sh -- "$BACKUP_DIR" 2>/dev/null | awk '{print $1}')"
  printf '  0) Cancel\n'
  printf '  1) Safe cleanup: delete old backups using a custom retention period\n'
  printf '  2) Delete all backups\n\n'
  read -r -p "Selection [1]: " choice
  choice="${choice:-1}"

  case "$choice" in
    0)
      warn "Cleanup cancelled."
      return 1
      ;;
    1)
      read -r -p "How many recent days should be retained? [7]: " days
      days="${days:-7}"
      cleanup_prune_backups "$days"
      ;;
    2)
      if ! confirm_word "All Spark backups under ${BACKUP_DIR} will be permanently deleted." "DELETE-BACKUPS"; then
        warn "Backup deletion cancelled."
        return 1
      fi
      find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + 2>/dev/null || true
      mkdir -p "$BACKUP_DIR"
      chmod 700 "$BACKUP_DIR"
      ok "All Spark backups were deleted."
      ;;
    *)
      fail "Invalid option."
      return 2
      ;;
  esac
}

cleanup_install_history() {
  new_log "cleanup-install-history"
  if ! confirm_word "Installation history will be cleared. No services or data will be deleted; only DONE markers will be removed." "RESET-HISTORY"; then
    warn "Installation history reset cancelled."
    return 1
  fi
  find "$STEP_DIR" -maxdepth 1 -type f -name '*.ok' -delete 2>/dev/null || true
  ok "Installation history was cleared. Actual status is still calculated from live server checks."
}

cleanup_stop_schedulers_internal() {
  local unit
  set +e
  for unit in \
    spark-daily-report.timer spark-minutes-reminder.timer spark-decision-due.timer spark-notification-outbox.timer \
    spark-daily-report.service spark-minutes-reminder.service spark-decision-due.service spark-notification-outbox.service; do
    systemctl disable --now "$unit" >>"$CURRENT_LOG" 2>&1
    rm -f "/etc/systemd/system/${unit}"
  done
  systemctl daemon-reload >>"$CURRENT_LOG" 2>&1
  set -e
}

cleanup_nginx_internal() {
  rm -f \
    /etc/nginx/sites-enabled/spark \
    /etc/nginx/sites-enabled/spark-bootstrap \
    /etc/nginx/sites-enabled/spark-supabase-admin \
    /etc/nginx/sites-available/spark \
    /etc/nginx/sites-available/spark-bootstrap \
    /etc/nginx/sites-available/spark-supabase-admin
  if command -v nginx >/dev/null 2>&1 && systemctl is-active --quiet nginx 2>/dev/null; then
    if nginx -t >>"$CURRENT_LOG" 2>&1; then
      systemctl reload nginx >>"$CURRENT_LOG" 2>&1 || true
    else
      warn "Nginx still has a syntax error after removing Spark configuration; reload was skipped."
    fi
  fi
}

cleanup_certificates_internal() {
  local cert
  command -v certbot >/dev/null 2>&1 || return 0
  for cert in "${APP_DOMAIN:-}" "${API_DOMAIN:-}"; do
    [[ -n "$cert" ]] || continue
    certbot delete --cert-name "$cert" --non-interactive >>"$CURRENT_LOG" 2>&1 || true
  done
}

cleanup_firewall_runtime_rules_internal() {
  ufw_is_active || return 0
  set +e
  ufw --force delete allow 5432/tcp >>"$CURRENT_LOG" 2>&1
  ufw --force delete allow 8443/tcp >>"$CURRENT_LOG" 2>&1
  set -e
}

cleanup_full_project() {
  new_log "cleanup-full-project"
  warn "This operation removes all Spark components from this server: source, Supabase runtime/data, frontend, Spark configuration/secrets, Nginx configuration, schedulers, Spark-domain certificates, backups, and logs."
  info "Docker/Nginx/Node/Certbot packages, public SSH/HTTP/HTTPS UFW rules, and Spark Manager itself are preserved so the platform can be installed again."
  if ! confirm_word "First confirmation: completely remove the Spark project from this server." "DELETE-SPARK"; then
    warn "Complete project removal cancelled."
    return 1
  fi
  if ! confirm_word "Final confirmation: database data and backups cannot be recovered after deletion." "CONFIRM-ALL-DATA"; then
    warn "Complete project removal cancelled."
    return 1
  fi

  close_database_external_access >/dev/null 2>&1 || true
  close_supabase_studio_access >/dev/null 2>&1 || true
  cleanup_stop_schedulers_internal
  cleanup_nginx_internal
  cleanup_certificates_internal
  cleanup_firewall_runtime_rules_internal

  if [[ -f "${SUPABASE_ROOT}/docker-compose.yml" ]]; then
    compose down --volumes --remove-orphans >>"$CURRENT_LOG" 2>&1 || true
  fi

  rm -rf -- \
    "$SPARK_ROOT" \
    "$SUPABASE_ROOT" \
    "$SUPABASE_SOURCE" \
    /var/www/spark \
    "$CONFIG_DIR" \
    "$STATE_DIR" \
    "$LOG_DIR" \
    "$BACKUP_DIR"

  mkdir -p "$STATE_DIR" "$STEP_DIR" "$LOG_DIR" "$BACKUP_DIR" "$CONFIG_DIR"
  chmod 700 "$STATE_DIR" "$STEP_DIR" "$LOG_DIR" "$BACKUP_DIR" "$CONFIG_DIR"

  ok "All Spark project components were removed from the server. Spark Manager and shared system packages remain installed."
  info "To reinstall, open Spark Manager and run the Spark installation sequence."
}

cleanup_uninstall_manager() {
  new_log "cleanup-manager"
  if ! confirm_word "Spark Manager will be removed from /usr/local/lib/spark-manager and /usr/local/bin/spark. The deployed project/runtime will not be modified." "UNINSTALL-MANAGER"; then
    warn "Spark Manager removal cancelled."
    return 1
  fi
  rm -f "$CLI_PATH"
  rm -rf /usr/local/lib/spark-manager /usr/local/share/spark-manager
  ok "Spark Manager was removed. Exit the UI after this action completes."
  info "To reinstall Spark Manager, run bootstrap.sh again."
}
