linux_update() {
  title
  new_log "linux-update"
  run_visible "apt update" apt update || return 1
  run_visible "apt upgrade" apt upgrade -y || return 1
  run_report "dpkg audit" dpkg --audit
  if [[ -f /var/run/reboot-required ]]; then
    warn "to complete update, reboot is required."
    cat /var/run/reboot-required.pkgs 2>/dev/null || true
  else
    ok "Reboot Mandatory not reported."
  fi
}

npm_menu() {
  while true; do
    title
    printf '%sNode / npm Maintenance%s\n\n' "$C_BOLD" "$C_RESET"
    printf '0) back\n1) show Node/npm version\n2) Update npm global to branch 11\n3) npm ci\n4) npm audit complete\n5) npm audit --omit=dev\n6) npm outdated\n7) npm audit fix --dry-run (without changing the file)\n\n'
    read -r -p "selection: " c
    new_log "npm-maintenance"
    case "$c" in
      0) return ;;
      1) run_report "Versions" bash -c 'node --version; npm --version'; pause ;;
      2) run_visible "Update npm" npm install -g 'npm@12.2.0' || true; pause ;;
      3) run_visible "npm ci" bash -c "cd '$SPARK_ROOT' && npm ci" || true; pause ;;
      4) run_report "npm audit" bash -c "cd '$SPARK_ROOT' && npm audit"; pause ;;
      5) run_report "npm audit production" bash -c "cd '$SPARK_ROOT' && npm audit --omit=dev"; pause ;;
      6) run_report "npm outdated" bash -c "cd '$SPARK_ROOT' && npm outdated"; pause ;;
      7) run_report "npm audit fix dry-run" bash -c "cd '$SPARK_ROOT' && npm audit fix --dry-run"; pause ;;
      *) fail "Invalid option"; sleep 1 ;;
    esac
  done
}

# -----------------------------------------------------------------------------
# Security / operator access
# -----------------------------------------------------------------------------

external_access_requirements() {
  require_manager_values || return 1
  require_file "${SUPABASE_ROOT}/.env" || return 1
  require_file "${SUPABASE_ROOT}/docker-compose.yml" || return 1
}

ufw_is_active() {
  command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q '^Status: active'
}

firewall_optional_allow_port() {
  local port="$1"
  if ufw_is_active; then
    run_logged "UFW allow TCP/${port}" ufw allow "${port}/tcp"
  else
    warn "UFW not active; listener It opens, but the network is limited Firewall/ACL It is external to the server."
  fi
}

firewall_optional_close_port() {
  local port="$1"
  if ufw_is_active; then
    set +e
    ufw --force delete allow "${port}/tcp" >>"$CURRENT_LOG" 2>&1
    set -e
  fi
}

find_systemd_socket_proxyd() {
  local path
  path="$(command -v systemd-socket-proxyd 2>/dev/null || true)"
  if [[ -n "$path" && -x "$path" ]]; then
    printf '%s\n' "$path"
    return 0
  fi
  for path in /usr/lib/systemd/systemd-socket-proxyd /lib/systemd/systemd-socket-proxyd; do
    [[ -x "$path" ]] && { printf '%s\n' "$path"; return 0; }
  done
  return 1
}

pooler_tenant_id() {
  env_get "${SUPABASE_ROOT}/.env" POOLER_TENANT_ID
}

database_pooler_username() {
  local tenant
  tenant="$(pooler_tenant_id)"
  [[ -n "$tenant" ]] || return 1
  printf 'postgres.%s\n' "$tenant"
}

database_external_is_open() {
  systemctl is-active --quiet spark-db-access.socket 2>/dev/null || return 1
  ss -lnt 2>/dev/null | grep -Eq '(^|[[:space:]])(0\.0\.0\.0|\*|\[::\]):5432[[:space:]]' || return 1
}

studio_external_is_open() {
  [[ -L /etc/nginx/sites-enabled/spark-supabase-admin ]] || return 1
  ss -lnt 2>/dev/null | grep -Eq '(^|[[:space:]])(0\.0\.0\.0|\*|\[::\]):8443[[:space:]]' || return 1
}

postgres_client_image() {
  local image
  image="$(docker inspect -f '{{.Config.Image}}' supabase-db 2>/dev/null || true)"
  [[ -n "$image" ]] || return 1
  printf '%s\n' "$image"
}

database_pooler_login_test() {
  local port="${1:-5433}" password username image result
  password="$(env_get "${SUPABASE_ROOT}/.env" POSTGRES_PASSWORD)"
  username="$(database_pooler_username)" || {
    echo "POOLER_TENANT_ID is missing" >&2
    return 1
  }
  image="$(postgres_client_image)" || {
    echo "Unable to resolve the running Postgres image" >&2
    return 1
  }
  [[ -n "$password" ]] || return 1

  result="$(docker run --rm --network host \
    -e PGPASSWORD="$password" \
    --entrypoint psql "$image" \
    -h 127.0.0.1 -p "$port" -U "$username" -d postgres \
    -Atqc 'select 1' 2>>"${CURRENT_LOG:-/dev/null}" || true)"
  [[ "$result" == "1" ]]
}

database_security_state() {
  if ! timeout 3 bash -c '</dev/tcp/127.0.0.1/5433' >/dev/null 2>&1; then
    printf 'BROKEN (local pooler unavailable)'
    return
  fi
  if ! database_pooler_login_test 5433 >/dev/null 2>&1; then
    printf 'BROKEN (pooler login failed)'
    return
  fi
  if database_external_is_open; then
    if database_pooler_login_test 5432 >/dev/null 2>&1; then
      printf 'OPEN / VERIFIED'
    else
      printf 'OPEN / AUTH FAILED'
    fi
  else
    printf 'CLOSED / LOCAL OK'
  fi
}

show_database_connection_info() {
  local password username tenant state public_ip
  external_access_requirements || return 1
  password="$(env_get "${SUPABASE_ROOT}/.env" POSTGRES_PASSWORD)"
  tenant="$(pooler_tenant_id)"
  username="$(database_pooler_username)" || true
  public_ip="${TURN_PUBLIC_IP:-}"
  state="$(database_security_state)"

  [[ -n "$password" ]] || { fail "POSTGRES_PASSWORD not found."; return 1; }
  [[ -n "$tenant" && -n "$username" ]] || {
    fail "POOLER_TENANT_ID in Supabase .env not available; Connection information Supavisor It is incomplete."
    return 1
  }

  printf '\n%s%sPostgreSQL / pgAdmin connection%s\n' "$C_BOLD" "$C_CYAN" "$C_RESET"
  printf '%s\n' '────────────────────────────────────────────────────────────'
  printf 'Mode       : Supavisor Session\n'
  printf 'State      : %s\n' "$state"
  printf 'Database   : postgres\n'
  printf 'Username   : %s\n' "$username"
  printf 'Password   : %s\n' "$password"
  printf 'Local host : 127.0.0.1\n'
  printf 'Local port : 5433\n'
  printf 'Public host: %s\n' "${public_ip:-<server-public-ip>}"
  printf 'Public port: 5432\n'
  printf 'SSL mode   : Disable (this managed TCP proxy is not TLS terminated)\n'
  printf '%s\n' '────────────────────────────────────────────────────────────'
  if database_external_is_open; then
    info "for pgAdmin from Public host, Port=5432 and Username Use above."
  else
    warn "Public DB access is closed. For direct connection pgAdmin First the option Open Database access run the."
    info "Safer method without opening 5432: SSH tunnel to the server and connect to 127.0.0.1:5433 with that Username."
  fi
  warn "Supavisor to tenant-aware username needs; Username simple postgres It is not correct for this path."
  info "JWT_SECRET and SERVICE_ROLE_KEY are not displayed and this output in log It is not written."
}

show_studio_connection_info() {
  local dashboard_user dashboard_password state
  external_access_requirements || return 1
  dashboard_user="$(env_get "${SUPABASE_ROOT}/.env" DASHBOARD_USERNAME)"
  dashboard_password="$(env_get "${SUPABASE_ROOT}/.env" DASHBOARD_PASSWORD)"
  dashboard_user="${dashboard_user:-supabase}"
  [[ -n "$dashboard_password" ]] || { fail "DASHBOARD_PASSWORD not found."; return 1; }
  state="CLOSED"; studio_external_is_open && state="OPEN"
  printf '\n%s%sSupabase Studio access%s\n' "$C_BOLD" "$C_CYAN" "$C_RESET"
  printf '%s\n' '────────────────────────────────────────────────────────────'
  printf 'State    : %s\n' "$state"
  printf 'URL      : https://%s:8443\n' "$API_DOMAIN"
  printf 'Username : %s\n' "$dashboard_user"
  printf 'Password : %s\n' "$dashboard_password"
  printf '%s\n' '────────────────────────────────────────────────────────────'
}

show_operator_credentials() {
  show_database_connection_info || return 1
  printf '\n'
  show_studio_connection_info || return 1
}

write_database_access_units() {
  local proxyd="$1"
  cat >/etc/systemd/system/spark-db-access.socket <<'EOF_SOCKET'
[Unit]
Description=Spark managed external PostgreSQL session access

[Socket]
ListenStream=0.0.0.0:5432
NoDelay=true

[Install]
WantedBy=sockets.target
EOF_SOCKET

  cat >/etc/systemd/system/spark-db-access.service <<EOF_SERVICE
[Unit]
Description=Spark PostgreSQL session proxy to local Supavisor
Requires=docker.service spark-db-access.socket
After=docker.service spark-db-access.socket

[Service]
ExecStart=${proxyd} 127.0.0.1:5433
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
EOF_SERVICE
}

cleanup_database_access_runtime() {
  set +e
  systemctl disable --now spark-db-access.socket >>"$CURRENT_LOG" 2>&1
  systemctl stop spark-db-access.service >>"$CURRENT_LOG" 2>&1
  rm -f /etc/systemd/system/spark-db-access.socket /etc/systemd/system/spark-db-access.service
  systemctl daemon-reload >>"$CURRENT_LOG" 2>&1
  systemctl reset-failed spark-db-access.service spark-db-access.socket >>"$CURRENT_LOG" 2>&1
  set -e
  firewall_optional_close_port 5432
}

open_database_external_access() {
  local proxyd username
  external_access_requirements || return 1
  username="$(database_pooler_username)" || {
    fail "POOLER_TENANT_ID not available; Connection Supavisor Cannot be configured."
    return 1
  }

  if ! timeout 3 bash -c '</dev/tcp/127.0.0.1/5433' >/dev/null 2>&1; then
    fail "Supavisor session endpoint on 127.0.0.1:5433 not available."
    return 1
  fi
  if ! run_logged "Verify local Supavisor login" database_pooler_login_test 5433; then
    fail "Supavisor response TCP Yes, but authentication with Username=${username} failed; Public access was not opened."
    return 1
  fi

  if database_external_is_open && database_pooler_login_test 5432 >/dev/null 2>&1; then
    ok "Database access Already open and login It is confirmed."
    show_database_connection_info
    return 0
  fi

  proxyd="$(find_systemd_socket_proxyd)" || { fail "systemd-socket-proxyd not found."; return 1; }
  if ! confirm_word "Database session access on ${TURN_PUBLIC_IP:-<server-ip>}:5432 opens. Close this port when finished." "OPEN"; then
    warn "canceled."
    return 1
  fi

  cleanup_database_access_runtime
  firewall_optional_allow_port 5432 || return 1
  write_database_access_units "$proxyd"
  run_logged "Reload systemd" systemctl daemon-reload || { cleanup_database_access_runtime; return 1; }
  run_logged "Open managed PostgreSQL TCP/5432" systemctl enable --now spark-db-access.socket || { cleanup_database_access_runtime; return 1; }

  if ! database_external_is_open; then
    fail "Listener managed 5432 not created; rollback done."
    cleanup_database_access_runtime
    return 1
  fi
  if ! run_logged "Verify PostgreSQL login through public listener" database_pooler_login_test 5432; then
    fail "Listener 5432 It opened but login actual PostgreSQL failed; rollback done."
    cleanup_database_access_runtime
    return 1
  fi

  ok "Database access open and authentication Confirmed."
  show_database_connection_info
}

close_database_external_access() {
  cleanup_database_access_runtime
  if ss -lnt 2>/dev/null | grep -Eq '(^|[[:space:]])(0\.0\.0\.0|\*|\[::\]):5432[[:space:]]'; then
    fail "still listener the other on TCP/5432 there is."
    ss -lntp | grep ':5432' | tee -a "$CURRENT_LOG" || true
    return 1
  fi
  ok "External access Database closed; Supavisor internal 127.0.0.1:5433 remained active."
}

resolve_cert_live_dir() {
  local domain="$1" candidate
  for candidate in "/etc/letsencrypt/live/${domain}" /etc/letsencrypt/live/"${domain}"-*; do
    [[ -f "${candidate}/fullchain.pem" && -f "${candidate}/privkey.pem" ]] || continue
    openssl x509 -in "${candidate}/fullchain.pem" -noout -checkend 0 >/dev/null 2>&1 || continue
    if openssl x509 -in "${candidate}/fullchain.pem" -noout -ext subjectAltName 2>/dev/null | grep -Fq "DNS:${domain}"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

write_supabase_studio_gateway() {
  local cert_dir="$1"
  cat >/etc/nginx/sites-available/spark-supabase-admin <<EOF_NGINX
server {
    listen 8443 ssl;
    server_name ${API_DOMAIN};

    ssl_certificate ${cert_dir}/fullchain.pem;
    ssl_certificate_key ${cert_dir}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;

    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$spark_connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 3600s;
    }
}
EOF_NGINX
}

open_supabase_studio_access() {
  local dashboard_user dashboard_password backup="" had_previous=0 cert_dir
  external_access_requirements || return 1
  cert_dir="$(resolve_cert_live_dir "$API_DOMAIN")" || {
    fail "Certificate Valid for ${API_DOMAIN} not found."
    return 1
  }
  [[ -e /etc/nginx/sites-enabled/spark ]] || { fail "Production Nginx not active; First step 14 run the."; return 1; }

  dashboard_user="$(env_get "${SUPABASE_ROOT}/.env" DASHBOARD_USERNAME)"
  dashboard_password="$(env_get "${SUPABASE_ROOT}/.env" DASHBOARD_PASSWORD)"
  dashboard_user="${dashboard_user:-supabase}"
  [[ -n "$dashboard_password" ]] || { fail "DASHBOARD_PASSWORD not available."; return 1; }

  if studio_external_is_open; then
    ok "Supabase Studio already on HTTPS/8443 is open."
    show_studio_connection_info
    return 0
  fi
  if ! confirm_word "Supabase Studio on https://${API_DOMAIN}:8443 opens." "OPEN"; then
    warn "canceled."
    return 1
  fi

  if [[ -f /etc/nginx/sites-available/spark-supabase-admin ]]; then
    backup="$(mktemp)"; cp -a /etc/nginx/sites-available/spark-supabase-admin "$backup"; had_previous=1
  fi
  firewall_optional_allow_port 8443 || { rm -f "$backup"; return 1; }
  write_supabase_studio_gateway "$cert_dir"
  ln -sfn /etc/nginx/sites-available/spark-supabase-admin /etc/nginx/sites-enabled/spark-supabase-admin

  if ! run_logged "Nginx config test" nginx -t || ! run_logged "Reload Nginx" systemctl reload nginx; then
    firewall_optional_close_port 8443
    if (( had_previous )); then cp -a "$backup" /etc/nginx/sites-available/spark-supabase-admin; else rm -f /etc/nginx/sites-available/spark-supabase-admin; fi
    rm -f /etc/nginx/sites-enabled/spark-supabase-admin
    nginx -t >>"$CURRENT_LOG" 2>&1 && systemctl reload nginx >>"$CURRENT_LOG" 2>&1 || true
    rm -f "$backup"
    return 1
  fi

  if ! curl -fsSkL --connect-timeout 5 --max-time 15 --resolve "${API_DOMAIN}:8443:127.0.0.1" \
      -u "${dashboard_user}:${dashboard_password}" "https://${API_DOMAIN}:8443/" -o /dev/null; then
    fail "Studio listener was created but authentication/response It was not valid; rollback is done."
    firewall_optional_close_port 8443
    rm -f /etc/nginx/sites-enabled/spark-supabase-admin
    if (( had_previous )); then cp -a "$backup" /etc/nginx/sites-available/spark-supabase-admin; else rm -f /etc/nginx/sites-available/spark-supabase-admin; fi
    nginx -t >>"$CURRENT_LOG" 2>&1 && systemctl reload nginx >>"$CURRENT_LOG" 2>&1 || true
    rm -f "$backup"
    return 1
  fi
  rm -f "$backup"
  ok "Supabase Studio Open and the answer is confirmed."
  show_studio_connection_info
}

close_supabase_studio_access() {
  rm -f /etc/nginx/sites-enabled/spark-supabase-admin /etc/nginx/sites-available/spark-supabase-admin
  firewall_optional_close_port 8443
  run_logged "Nginx config test" nginx -t || return 1
  run_logged "Reload Nginx" systemctl reload nginx || return 1
  if studio_external_is_open; then
    fail "listener managerial 8443 It is still active."
    return 1
  fi
  ok "External access Supabase Studio closed."
}

security_status_report() {
  local db_state studio_state tenant username
  db_state="$(database_security_state)"
  studio_state="CLOSED"; studio_external_is_open && studio_state="OPEN"
  tenant="$(pooler_tenant_id)"; username="$(database_pooler_username 2>/dev/null || true)"
  printf '\n%s%sSecurity access status%s\n' "$C_BOLD" "$C_CYAN" "$C_RESET"
  printf '%s\n' '────────────────────────────────────────────────────────────'
  printf 'Database       : %s\n' "$db_state"
  printf 'Pooler tenant  : %s\n' "${tenant:-MISSING}"
  printf 'Pooler username: %s\n' "${username:-MISSING}"
  printf 'Studio 8443    : %s\n' "$studio_state"
  if ufw_is_active; then
    printf 'UFW            : ACTIVE\n'
    ufw status | grep -E '(^5432|^8443)' || true
  else
    printf 'UFW            : INACTIVE\n'
  fi
  printf '%s\n' '────────────────────────────────────────────────────────────'
}

security_access_wait() {
  local _
  printf '\n'
  read -r -p "to return to Security Center Enter press..." _
}

open_supabase_admin_access() {
  local choice db_state studio_state
  while true; do
    clear_screen
    db_state="$(database_security_state)"
    studio_state="CLOSED"; studio_external_is_open && studio_state="OPEN"
    printf '%s%sSecurity Center%s\n' "$C_BOLD" "$C_CYAN" "$C_RESET"
    printf '%s\n' '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
    printf 'Database : %-24s  Studio : %s\n\n' "$db_state" "$studio_state"
    printf '0) back\n'
    printf '1) Connection information PostgreSQL / pgAdmin\n'
    printf '2) Real test Login database (Local Supavisor)\n'
    printf '3) open Database on TCP/5432\n'
    printf '4) to close Database on TCP/5432\n'
    printf '5) Connection information Supabase Studio\n'
    printf '6) open Supabase Studio on HTTPS/8443\n'
    printf '7) to close Supabase Studio on HTTPS/8443\n'
    printf '8) Status report Security / Firewall\n\n'
    read -r -p "selection: " choice
    case "$choice" in
      0) return 0 ;;
      1) show_database_connection_info || true; security_access_wait ;;
      2) new_log "database-login-test"; if run_visible "PostgreSQL login through local Supavisor" database_pooler_login_test 5433; then ok "Login The actual database is successful."; fi; security_access_wait ;;
      3) new_log "database-access-open"; open_database_external_access || true; security_access_wait ;;
      4) new_log "database-access-close"; close_database_external_access || true; security_access_wait ;;
      5) show_studio_connection_info || true; security_access_wait ;;
      6) new_log "supabase-studio-open"; open_supabase_studio_access || true; security_access_wait ;;
      7) new_log "supabase-studio-close"; close_supabase_studio_access || true; security_access_wait ;;
      8) security_status_report; security_access_wait ;;
      *) fail "Invalid option"; sleep 1 ;;
    esac
  done
}

close_supabase_admin_access() {
  new_log "supabase-studio-close"
  close_supabase_studio_access
}

resource_status() {
  title
  new_log "resource-status"
  {
    echo "== Time / Uptime =="; date -Is; uptime
    echo; echo "== CPU / Load =="; nproc; cat /proc/loadavg
    echo; echo "== Memory =="; free -h
    echo; echo "== Disk =="; df -hT
    echo; echo "== Inodes =="; df -ih
    echo; echo "== Top CPU =="; ps -eo pid,comm,%cpu,%mem --sort=-%cpu | head -n 15
    echo; echo "== Top Memory =="; ps -eo pid,comm,%cpu,%mem --sort=-%mem | head -n 15
    echo; echo "== Docker =="; docker stats --no-stream 2>/dev/null || true
    echo; echo "== Listening =="; ss -lntup
  } 2>&1 | tee -a "$CURRENT_LOG"
}

service_menu() {
  while true; do
    title
    printf '%sService Management%s\n\n' "$C_BOLD" "$C_RESET"
    printf '0) back\n1) Status All services\n2) Restart Functions + Worker\n3) Reload Nginx\n5) Restart Supabase stack\n6) Restart Scheduler timers\n\n'
    read -r -p "selection: " c
    new_log "service-management"
    case "$c" in
      0) return ;;
      1) run_report "Nginx" systemctl status nginx --no-pager; run_report "Docker" compose ps; run_report "Timers" systemctl list-timers 'spark-*' --no-pager; pause ;;
      2) run_visible "Restart Functions + Worker" bash -c "cd '$SUPABASE_ROOT' && docker compose up -d --force-recreate functions avatar-worker" || true; pause ;;
      3) run_visible "Nginx test/reload" bash -c 'nginx -t && systemctl reload nginx' || true; pause ;;
      5) if confirm_word "all Supabase stack recreate/restart It can and may cause disruption for a few moments." "RESTART"; then run_visible "Restart Supabase stack" bash -c "cd '$SUPABASE_ROOT' && docker compose up -d --force-recreate" || true; fi; pause ;;
      6) run_visible "Restart timers" bash -c 'systemctl restart spark-daily-report.timer spark-minutes-reminder.timer spark-decision-due.timer spark-notification-outbox.timer' || true; pause ;;
      *) fail "Invalid option"; sleep 1 ;;
    esac
  done
}

certificate_menu() {
  while true; do
    title
    printf '%sCertificate Management%s\n\n' "$C_BOLD" "$C_RESET"
    printf '0) back\n1) show Certificates\n2) Renewal dry-run\n3) execution certbot renew\n\n'
    read -r -p "selection: " c
    new_log "certificate-management"
    case "$c" in
      0) return ;;
      1) run_report "Certificates" certbot certificates; pause ;;
      2) run_visible "Renewal dry-run" certbot renew --dry-run || true; pause ;;
      3) run_visible "Certbot renew" certbot renew || true; pause ;;
      *) fail "Invalid option"; sleep 1 ;;
    esac
  done
}

version_info() {
  title
  new_log "version-info"
  {
    echo "Spark Manager: $SPARK_MANAGER_VERSION"
    echo "OS: $(. /etc/os-release; echo "$PRETTY_NAME")"
    echo "Kernel: $(uname -r)"
    command -v docker >/dev/null && docker --version
    command -v docker >/dev/null && docker compose version
    command -v node >/dev/null && node --version
    command -v npm >/dev/null && npm --version
    command -v nginx >/dev/null && nginx -v 2>&1
    command -v certbot >/dev/null && certbot --version
    if [[ -d "${SPARK_ROOT}/.git" ]]; then
      echo "Spark commit: $(git -C "$SPARK_ROOT" rev-parse HEAD)"
      echo "Spark branch: $(git -C "$SPARK_ROOT" branch --show-current)"
      echo "Spark dirty: $(test -z "$(git -C "$SPARK_ROOT" status --porcelain)" && echo no || echo yes)"
    fi
    if [[ -d "${SUPABASE_SOURCE}/.git" ]]; then
      echo "Supabase commit: $(git -C "$SUPABASE_SOURCE" rev-parse HEAD)"
    fi
  } 2>&1 | tee -a "$CURRENT_LOG"
}
