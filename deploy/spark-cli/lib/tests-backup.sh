test_frontend() {
  curl -fIsS --connect-timeout 8 "https://${APP_DOMAIN}" || return 1
}

supabase_anon_key() {
  env_get "${SUPABASE_ROOT}/.env" ANON_KEY
}

test_auth_health_url() {
  local url="$1" anon
  anon="$(supabase_anon_key)"
  [[ -n "$anon" ]] || {
    echo "ERROR: ANON_KEY is missing from ${SUPABASE_ROOT}/.env"
    return 1
  }
  curl -fsS --connect-timeout 8 \
    -H "apikey: ${anon}" \
    -H "Authorization: Bearer ${anon}" \
    "$url"
}

test_api() {
  test_auth_health_url "https://${API_DOMAIN}/auth/v1/health" || return 1
  printf '\n'
  curl -isS --connect-timeout 8 "https://${API_DOMAIN}/functions/v1/password-login" | sed -n '1,30p' || return 1
}

test_db_exposure() {
  local sockets db_public=0 db_managed=0
  sockets="$(ss -lntp)" || return 1

  if grep -Eq '0\.0\.0\.0:(5433|6543|8000|9000)\b|\[::\]:(5433|6543|8000|9000)\b' <<<"$sockets"; then
    echo "ERROR: internal Supabase port 5433/6543/8000/9000 is publicly bound"
    grep -E ':(5433|6543|8000|9000)\b' <<<"$sockets" || true
    return 1
  fi

  grep -Eq '0\.0\.0\.0:5432\b|\[::\]:5432\b|\*:5432\b' <<<"$sockets" && db_public=1
  systemctl is-active --quiet spark-db-access.socket 2>/dev/null && db_managed=1

  if (( db_public )); then
    if (( db_managed )); then
      echo "Database 5432: MANAGED OPEN (spark-db-access.socket)"
    else
      echo "ERROR: TCP/5432 is publicly bound outside Spark managed access"
      grep -E ':5432\b' <<<"$sockets" || true
      return 1
    fi
  else
    echo "Database 5432: CLOSED"
  fi

  if studio_external_is_open 2>/dev/null; then
    echo "Supabase Studio 8443: MANAGED OPEN"
  else
    echo "Supabase Studio 8443: CLOSED"
  fi
  echo "Internal Supabase ports 5433/6543/8000/9000: PRIVATE"
}

test_ssl_dns() {
  test_dns || return 1
  certbot certificates || return 1
  openssl s_client -connect "${APP_DOMAIN}:443" -servername "$APP_DOMAIN" </dev/null 2>/dev/null | openssl x509 -noout -subject -issuer -dates || return 1
  openssl s_client -connect "${API_DOMAIN}:443" -servername "$API_DOMAIN" </dev/null 2>/dev/null | openssl x509 -noout -subject -issuer -dates || return 1
}

test_full_validation() {
  require_manager_values || return 1
  echo "== Supabase local =="
  test_auth_health_url "http://127.0.0.1:8000/auth/v1/health" || return 1
  echo
  echo "== Frontend =="
  curl -fIsS "https://${APP_DOMAIN}" || return 1
  echo "== API =="
  test_auth_health_url "https://${API_DOMAIN}/auth/v1/health" || return 1
  echo
  curl -isS "https://${API_DOMAIN}/functions/v1/password-login" | sed -n '1,40p' || return 1
  echo "== Docker =="
  compose ps || return 1
  echo "== Scheduler =="
  test_schedulers || return 1
  echo "== DB / Studio exposure =="
  test_db_exposure || return 1
}

docker_logs_menu() {
  new_log "logs-docker"
  if [[ ! -f "${SUPABASE_ROOT}/docker-compose.yml" ]]; then
    fail "Supabase compose not found."
    pause
    return
  fi
  local services service
  mapfile -t services < <(compose config --services)
  title
  printf 'Docker services:\n\n'
  printf '%s\n' "${services[@]}"
  printf '\n'
  read -r -p "name service for display 200 line log (Enter=back): " service
  [[ -z "$service" ]] && return
  if ! printf '%s\n' "${services[@]}" | grep -Fxq "$service"; then
    fail "Service invalid."
    pause
    return
  fi
  run_report "Logs: ${service}" compose logs --tail=200 --timestamps "$service"
  pause
}

scheduler_logs() {
  new_log "logs-schedulers"
  local s
  for s in spark-daily-report spark-minutes-reminder spark-decision-due spark-notification-outbox; do
    printf '\n=== %s ===\n' "$s" | tee -a "$CURRENT_LOG"
    journalctl -u "${s}.service" -n 80 --no-pager 2>&1 | tee -a "$CURRENT_LOG" || true
  done
}

test_menu() {
  while true; do
    title
    printf '%sTest and log menu%s\n\n' "$C_BOLD" "$C_RESET"
    printf ' 0) back\n'
    printf ' 1) Validation complete system\n'
    printf ' 2) status 18 Installation step\n'
    printf ' 3) test Frontend\n'
    printf ' 4) test API / Auth / Function route\n'
    printf ' 5) Docker status\n'
    printf ' 6) Docker service logs\n'
    printf ' 7) Nginx status and logs\n'
    printf ' 8) Scheduler status and logs\n'
    printf '10) DB/API public exposure check\n'
    printf '11) DNS and SSL\n'
    printf '12) Listening ports + UFW\n'
    read -r -p "selection: " choice
    case "$choice" in
      0) return ;;
      1) new_log "test-full"; run_visible "Validation complete" test_full_validation || true; pause ;;
      2) new_log "installation-status"; installation_status_report; pause ;;
      3) new_log "test-frontend"; run_visible "Frontend" test_frontend || true; pause ;;
      4) new_log "test-api"; run_visible "API" test_api || true; pause ;;
      5) new_log "test-docker"; run_visible "Docker status" compose ps || true; pause ;;
      6) docker_logs_menu ;;
      7)
        new_log "test-nginx"
        run_report "Nginx status" systemctl status nginx --no-pager
        journalctl -u nginx -n 120 --no-pager 2>&1 | tee -a "$CURRENT_LOG" || true
        pause ;;
      8) new_log "test-schedulers"; run_report "Scheduler status" test_schedulers; scheduler_logs; pause ;;
      10) new_log "test-exposure"; run_visible "Public exposure check" test_db_exposure || true; pause ;;
      11) new_log "test-dns-ssl"; run_visible "DNS/SSL" test_ssl_dns || true; pause ;;
      12)
        new_log "test-ports-firewall"
        run_report "Listening ports" ss -lntup
        run_report "UFW" ufw status verbose
        pause ;;
      *) fail "Invalid option"; sleep 1 ;;
    esac
  done
}

create_backup() {
  local kind="${1:-manual}" stamp dest plain_tmp
  stamp="$(date +%Y%m%d-%H%M%S)"
  dest="${BACKUP_DIR}/${kind}-${stamp}"
  mkdir -p "$dest"
  chmod 700 "$dest"

  if [[ "$kind" == "manual" ]]; then
    [[ -f "${SUPABASE_ROOT}/docker-compose.yml" ]] || {
      rm -rf "$dest"
      fail "Supabase runtime is not installed at ${SUPABASE_ROOT}."
      return 1
    }
    compose config --services | grep -Fxq db || {
      rm -rf "$dest"
      fail "Supabase Compose does not contain the db service."
      return 1
    }
    compose ps --status running --services | grep -Fxq db || {
      rm -rf "$dest"
      fail "Supabase database container is not running."
      return 1
    }

    plain_tmp="${dest}/postgres.backup.partial"
    info "Backup PostgreSQL database 'postgres' (full Plain SQL, restore-compatible .backup)..." >&2
    if ! compose exec -T db pg_dump -U postgres -d postgres \
      --format=plain --create --clean --if-exists >"$plain_tmp"; then
      rm -rf "$dest"
      fail "Full PostgreSQL backup failed."
      return 1
    fi
    if ! plain_backup_validate "$plain_tmp"; then
      rm -rf "$dest"
      return 1
    fi
    if ! plain_backup_has_create_database "$plain_tmp" || ! plain_backup_has_drop_database "$plain_tmp"; then
      rm -rf "$dest"
      fail "Generated SQL backup is incomplete: database CREATE/DROP statements are missing."
      return 1
    fi
    mv "$plain_tmp" "${dest}/postgres.backup"
    chmod 600 "${dest}/postgres.backup"
    info "Restore-compatible Plain SQL backup: ${dest}/postgres.backup" >&2
  elif [[ -f "${SUPABASE_ROOT}/docker-compose.yml" ]] && compose config --services | grep -Fxq db; then
    if postgres_database_exists; then
      info "Backup PostgreSQL recovery snapshot..." >&2
      if ! compose exec -T db pg_dump -U postgres -d postgres -Fc >"${dest}/postgres.dump"; then
        rm -rf "$dest"
        fail "PostgreSQL recovery snapshot failed."
        return 1
      fi
      chmod 600 "${dest}/postgres.dump"
    elif [[ "$kind" == "pre-restore" ]]; then
      info "Database 'postgres' does not exist yet; recording empty-target safety state." >&2
      : >"${dest}/postgres.absent"
      chmod 600 "${dest}/postgres.absent"
    else
      rm -rf "$dest"
      fail "PostgreSQL database 'postgres' does not exist; recovery snapshot cannot be created."
      return 1
    fi
  fi

  mkdir -p "${dest}/config"
  [[ -f "${SUPABASE_ROOT}/.env" ]] && cp -a "${SUPABASE_ROOT}/.env" "${dest}/config/supabase.env"
  [[ -f "${SUPABASE_ROOT}/docker-compose.yml" ]] && cp -a "${SUPABASE_ROOT}/docker-compose.yml" "${dest}/config/docker-compose.yml"
  [[ -d "$CONFIG_DIR" ]] && tar -C / -czf "${dest}/config/etc-spark.tar.gz" etc/spark
  [[ -f /etc/nginx/sites-available/spark ]] && cp -a /etc/nginx/sites-available/spark "${dest}/config/nginx-spark"
  chmod -R go-rwx "$dest"
  echo "$dest" >"${STATE_DIR}/last-backup-path"
  printf '%s\n' "$dest"
}


plain_backup_validate() {
  local path="$1" magic
  [[ -f "$path" && -r "$path" && -s "$path" ]] || {
    fail "Backup file is missing, unreadable or empty: $path"
    return 1
  }
  magic="$(head -c 5 "$path" 2>/dev/null || true)"
  if [[ "$magic" == "PGDMP" ]]; then
    fail "This is a PostgreSQL custom-format dump. This restore action accepts only plain SQL pg_dump files."
    return 1
  fi
  if ! sed -n '1,120p' "$path" | grep -Fq -- '-- PostgreSQL database dump'; then
    fail "The file does not look like a plain PostgreSQL pg_dump."
    return 1
  fi

  local line
  while IFS= read -r line; do
    [[ "$line" =~ ^CREATE[[:space:]]+DATABASE[[:space:]]+(\"?postgres\"?)([[:space:];]|$) ]] || {
      fail "The dump attempts to create a database other than postgres: $line"
      return 1
    }
  done < <(grep -a -E '^CREATE[[:space:]]+DATABASE[[:space:]]+' "$path" || true)
}

plain_backup_has_create_database() {
  grep -a -Eq '^CREATE[[:space:]]+DATABASE[[:space:]]+\"?postgres\"?([[:space:];]|$)' "$1"
}

plain_backup_has_drop_database() {
  grep -a -Eq '^DROP[[:space:]]+DATABASE([[:space:]]+IF[[:space:]]+EXISTS)?[[:space:]]+\"?postgres\"?([[:space:];]|$)' "$1"
}

postgres_database_exists() {
  restore_ensure_db_writable 180 || return 1
  [[ "$(compose exec -T db psql -X -U postgres -d template1 -Atqc "SELECT 1 FROM pg_database WHERE datname='postgres';" 2>/dev/null || true)" == "1" ]]
}

restore_stop_non_db_services() {
  local -a services=()
  mapfile -t services < <(compose config --services | grep -v '^db$' || true)
  if (( ${#services[@]} )); then
    compose stop "${services[@]}"
  fi
}

restore_restart_supabase_stack() {
  compose up -d
}

restore_wait_postgres_writable() {
  local timeout_seconds="${1:-180}" started now state
  started="$(date +%s)"
  while true; do
    state="$(compose exec -T db psql -X -U postgres -d template1 -Atqc       "SELECT CASE WHEN pg_is_in_recovery() THEN 'recovery' ELSE 'ready' END;" 2>/dev/null || true)"
    if [[ "$state" == 'ready' ]]; then
      return 0
    fi
    now="$(date +%s)"
    if (( now - started >= timeout_seconds )); then
      fail "PostgreSQL did not become writable within ${timeout_seconds}s (state=${state:-unavailable})."
      return 1
    fi
    sleep 2
  done
}

restore_ensure_db_writable() {
  compose up -d db >/dev/null 2>&1 || return 1
  restore_wait_postgres_writable "${1:-180}"
}

restore_terminate_postgres_sessions() {
  restore_ensure_db_writable 180 || return 1
  compose exec -T db psql -X -U postgres -d template1 -v ON_ERROR_STOP=1 -Atqc \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='postgres' AND pid <> pg_backend_pid();" >/dev/null
}

restore_drop_postgres_database() {
  restore_terminate_postgres_sessions || return 1
  compose exec -T db psql -X -U postgres -d template1 -v ON_ERROR_STOP=1 -c \
    'DROP DATABASE IF EXISTS postgres WITH (FORCE);'
}

restore_create_postgres_database() {
  restore_ensure_db_writable 180 || return 1
  compose exec -T db psql -X -U postgres -d template1 -v ON_ERROR_STOP=1 -c \
    'CREATE DATABASE postgres WITH OWNER postgres TEMPLATE template0 ENCODING '\''UTF8'\'';'
}

restore_apply_plain_dump() {
  local path="$1"
  restore_ensure_db_writable 180 || return 1
  if plain_backup_has_create_database "$path"; then
    if ! plain_backup_has_drop_database "$path"; then
      restore_drop_postgres_database || return 1
    else
      restore_terminate_postgres_sessions || return 1
    fi
    compose exec -T db psql -X -U postgres -d template1 -v ON_ERROR_STOP=1 <"$path"
  else
    restore_drop_postgres_database || return 1
    restore_create_postgres_database || return 1
    compose exec -T db psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 <"$path"
  fi
}

restore_validate_database() {
  local result
  result="$(compose exec -T db psql -X -U postgres -d postgres -Atqc \
    "SELECT current_database() || '|' || (to_regnamespace('public') IS NOT NULL)::int || '|' || (to_regnamespace('auth') IS NOT NULL)::int || '|' || (to_regnamespace('storage') IS NOT NULL)::int;" 2>/dev/null || true)"
  [[ "$result" == 'postgres|1|1|1' ]] || {
    fail "Restored database validation failed. Expected postgres with public/auth/storage schemas, got: ${result:-<no result>}"
    return 1
  }
}

restore_custom_safety_dump() {
  local dump="$1"
  [[ -s "$dump" ]] || return 1
  restore_ensure_db_writable 180 || return 1
  restore_drop_postgres_database || return 1
  restore_create_postgres_database || return 1
  restore_wait_postgres_writable 180 || return 1
  compose exec -T db pg_restore -U postgres -d postgres --exit-on-error <"$dump"
}

restore_plain_database_from_file() {
  local path="$1" safety_dir safety_dump safety_absent_marker
  local safety_had_postgres=0 db_access_was_active=0 restore_rc=0 rollback_rc=0
  plain_backup_validate "$path" || return 1
  [[ -f "${SUPABASE_ROOT}/docker-compose.yml" ]] || {
    fail "Supabase runtime is not installed at ${SUPABASE_ROOT}."
    return 1
  }
  compose config --services | grep -Fxq db || {
    fail "Supabase Compose does not contain the db service."
    return 1
  }
  compose ps --status running --services | grep -Fxq db || {
    fail "Supabase database container is not running."
    return 1
  }

  info "Creating mandatory safety backup before replacing the postgres database..."
  safety_dir="$(create_backup pre-restore)" || {
    fail "Safety backup failed. Restore was not started."
    return 1
  }
  safety_dump="${safety_dir}/postgres.dump"
  safety_absent_marker="${safety_dir}/postgres.absent"
  if [[ -s "$safety_dump" ]]; then
    safety_had_postgres=1
  elif [[ -f "$safety_absent_marker" ]]; then
    safety_had_postgres=0
    info "Target database 'postgres' is absent; restore will create it from the supplied backup."
  else
    fail "Safety backup contains neither postgres.dump nor postgres.absent state marker. Restore was not started."
    return 1
  fi
  printf 'Safety backup : %s\n' "$safety_dir"

  if systemctl is-active --quiet spark-db-access.socket 2>/dev/null; then
    db_access_was_active=1
    systemctl stop spark-db-access.socket >/dev/null 2>&1 || true
  fi

  info "Stopping Supabase writers while keeping PostgreSQL online..."
  if ! restore_stop_non_db_services; then
    fail "Unable to stop non-database Supabase services."
    (( db_access_was_active )) && systemctl start spark-db-access.socket >/dev/null 2>&1 || true
    return 1
  fi
  info "Waiting for PostgreSQL to be writable before restore..."
  if ! restore_ensure_db_writable 180; then
    fail "PostgreSQL is not writable; restore was not started."
    (( db_access_was_active )) && systemctl start spark-db-access.socket >/dev/null 2>&1 || true
    return 1
  fi

  info "Replacing database from plain SQL backup. psql will stop on the first SQL error."
  set +e
  restore_apply_plain_dump "$path" >>"${CURRENT_LOG:-/dev/null}" 2>&1
  restore_rc=$?
  set -e

  if (( restore_rc == 0 )); then
    if ! restore_validate_database >>"${CURRENT_LOG:-/dev/null}" 2>&1; then
      restore_rc=1
    fi
  fi

  if (( restore_rc != 0 )); then
    warn "Restore failed. Waiting for PostgreSQL recovery to finish before automatic rollback."
    set +e
    restore_ensure_db_writable 180 >>"${CURRENT_LOG:-/dev/null}" 2>&1
    rollback_rc=$?
    if (( rollback_rc == 0 )); then
      if (( safety_had_postgres == 1 )); then
        restore_custom_safety_dump "$safety_dump" >>"${CURRENT_LOG:-/dev/null}" 2>&1
        rollback_rc=$?
      else
        restore_drop_postgres_database >>"${CURRENT_LOG:-/dev/null}" 2>&1
        rollback_rc=$?
      fi
    fi
    set -e
    (( db_access_was_active )) && systemctl start spark-db-access.socket >/dev/null 2>&1 || true
    if (( rollback_rc == 0 )); then
      restore_restart_supabase_stack >>"${CURRENT_LOG:-/dev/null}" 2>&1 || true
      fail "Plain backup restore failed; the previous database was restored automatically. Safety backup: $safety_dir"
    else
      restore_stop_non_db_services >>"${CURRENT_LOG:-/dev/null}" 2>&1 || true
      fail "Plain backup restore failed and automatic rollback also failed. Non-database Supabase services remain stopped to prevent writes. Safety backup: $safety_dir"
    fi
    return 1
  fi

  if ! restore_restart_supabase_stack >>"${CURRENT_LOG:-/dev/null}" 2>&1; then
    fail "Database restore succeeded but the Supabase stack did not restart cleanly. Database data is preserved."
    (( db_access_was_active )) && systemctl start spark-db-access.socket >/dev/null 2>&1 || true
    return 1
  fi
  (( db_access_was_active )) && systemctl start spark-db-access.socket >/dev/null 2>&1 || true

  unmark_step 21 2>/dev/null || rm -f "${STEP_DIR}/21.ok" 2>/dev/null || true

  ok "PostgreSQL plain .backup restore completed and Supabase was restarted."
  printf 'Source backup : %s\n' "$path"
  printf 'Safety backup : %s\n' "$safety_dir"
  info "Run Installation Air-Gapped -> Step 21 again to validate DB/RPC/Edge Function integration."
}

restore_plain_database_interactive() {
  local path confirmation bytes
  printf '\n%s%sRestore PostgreSQL from plain .backup%s\n' "$C_BOLD" "$C_CYAN" "$C_RESET"
  printf '%s\n' '────────────────────────────────────────────────────────────'
  printf 'This operation REPLACES the complete postgres database.\n'
  printf 'A mandatory safety backup is created automatically before any destructive action.\n'
  printf 'Expected format: plain SQL produced by pg_dump/pgAdmin, normally with a .backup extension.\n'
  printf 'Older valid plain SQL backups remain accepted for backward compatibility.\n\n'
  read -r -p 'Plain .backup path (example /var/backups/spark/manual-YYYYMMDD-HHMMSS/postgres.backup): ' path
  [[ -n "$path" ]] || { fail "Backup path is required."; return 1; }
  plain_backup_validate "$path" || return 1
  bytes="$(stat -c '%s' "$path" 2>/dev/null || printf '0')"
  printf 'File : %s\nSize : %s bytes\n' "$path" "$bytes"
  read -r -p 'Type RESTORE to replace the complete postgres database: ' confirmation
  [[ "$confirmation" == 'RESTORE' ]] || { warn "Restore canceled."; return 1; }
  restore_plain_database_from_file "$path"
}

list_backups() {
  find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%TY-%Tm-%Td %TH:%TM  %p\n' | sort -r | head -n 50
}

backup_menu() {
  while true; do
    title
    printf '%sBackup Management%s\n\n' "$C_BOLD" "$C_RESET"
    printf '0) back\n1) Create complete postgres Plain SQL .backup + config\n2) Restore complete postgres from Plain SQL .backup\n3) List Backups\n\n'
    read -r -p "selection: " c
    case "$c" in
      0) return ;;
      1)
        new_log "backup-manual"
        if run_visible "Create complete postgres Plain SQL .backup" create_backup manual; then ok "Backup was made."; fi
        pause ;;
      2)
        new_log "database-restore-plain"
        restore_plain_database_interactive
        pause ;;
      3) new_log "backup-list"; run_report "Backups" list_backups; pause ;;
      *) fail "Invalid option"; sleep 1 ;;
    esac
  done
}
