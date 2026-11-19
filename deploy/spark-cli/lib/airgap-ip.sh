# Internal-IP-only Air-Gap deployment mode.
# Loaded last by spark-airgap so the normal online installer remains unchanged.
# Public DNS, public IP selection and TLS termination are intentionally owned by
# the bank security / ingress layer and are not prerequisites for this workflow.

AIRGAP_IP_CONF="${CONFIG_DIR}/airgap-ip.conf"
AIRGAP_IP_MODE="internal_ip"

# Preserve the generic implementations we intentionally extend.
eval "$(declare -f save_config | sed '1s/save_config/save_config_standard/')"
eval "$(declare -f patch_compose | sed '1s/patch_compose/patch_compose_standard/')"
eval "$(declare -f install_step_10 | sed '1s/install_step_10/install_step_10_airgap_base/')"
eval "$(declare -f airgap_status | sed '1s/airgap_status/airgap_status_airgap_base/')"
eval "$(declare -f airgap_build_bundle | sed '1s/airgap_build_bundle/airgap_build_bundle_legacy/')"
eval "$(declare -f airgap_import_bundle | sed '1s/airgap_import_bundle/airgap_import_bundle_legacy/')"

# Load the target-local IP independently from manager.conf. core.sh rewrites
# manager.conf during startup, so the dedicated file is the authoritative source.
if [[ -f "$AIRGAP_IP_CONF" ]]; then
  # shellcheck disable=SC1090
  source "$AIRGAP_IP_CONF"
fi

# Compatibility values keep unchanged production helpers working without ever
# resolving a hostname. In this Air-Gap backend these variables all mean the
# same internal server IPv4 address, not public DNS/public addressing.
airgap_ip_apply_compat_values() {
  local ip="${AIRGAP_SERVER_IP:-}"
  [[ -n "$ip" ]] || return 0
  APP_DOMAIN="$ip"
  WWW_DOMAIN="$ip"
  API_DOMAIN="$ip"
  TURN_DOMAIN="$ip"
  TURN_PUBLIC_IP="$ip"
  TURN_PRIVATE_IP="$ip"
  LE_EMAIL="airgap@localhost.invalid"
  TURN_MIN_PORT="${TURN_MIN_PORT:-49160}"
  TURN_MAX_PORT="${TURN_MAX_PORT:-49200}"
}
airgap_ip_apply_compat_values

# New bundles are target-neutral: do not embed manager.conf or TLS certificate
# material. The internal IPv4 is always selected on the isolated target host.
airgap_build_bundle() {
  local dummy_dir rc
  dummy_dir="$(mktemp -d)"
  local MANAGER_CONF="${dummy_dir}/manager.conf"
  read() {
    local rendered="$*" var_name="${*: -1}"
    if [[ "$rendered" == *"TLS certificate pack source"* ]]; then
      printf -v "$var_name" '%s' ""
      return 0
    fi
    builtin read "$@"
  }
  set +e
  airgap_build_bundle_legacy
  rc=$?
  set -e
  unset -f read
  rm -rf "$dummy_dir"
  return "$rc"
}

# Old bundles may contain DNS-era manager.conf. Import the payload, but never
# restore that target configuration. Existing target-local configuration is
# left untouched and step 01 owns the internal IPv4 selection.
airgap_import_bundle() {
  local dummy_dir rc
  dummy_dir="$(mktemp -d)"
  local MANAGER_CONF="${dummy_dir}/manager.conf"
  set +e
  airgap_import_bundle_legacy "$@"
  rc=$?
  set -e
  rm -rf "$dummy_dir"
  return "$rc"
}

save_config() {
  airgap_ip_apply_compat_values
  save_config_standard || return 1
  [[ -n "${AIRGAP_SERVER_IP:-}" ]] || return 0
  umask 077
  local tmp
  tmp="$(mktemp)"
  {
    printf 'AIRGAP_MODE=%q\n' "$AIRGAP_IP_MODE"
    printf 'AIRGAP_SERVER_IP=%q\n' "$AIRGAP_SERVER_IP"
    printf 'TURN_MIN_PORT=%q\n' "${TURN_MIN_PORT:-49160}"
    printf 'TURN_MAX_PORT=%q\n' "${TURN_MAX_PORT:-49200}"
  } >"$tmp"
  install -m 0600 "$tmp" "$AIRGAP_IP_CONF"
  rm -f "$tmp"
}

airgap_ip_detect_default() {
  local candidate
  candidate="$(ip -o -4 addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | \
    awk '$1 ~ /^10\./ || $1 ~ /^192\.168\./ || $1 ~ /^172\.(1[6-9]|2[0-9]|3[01])\./ {print; exit}')"
  if [[ -z "$candidate" ]]; then
    candidate="$(ip -o -4 addr show scope global 2>/dev/null | awk 'NR==1 {split($4,a,"/"); print a[1]}')"
  fi
  printf '%s\n' "$candidate"
}

airgap_ip_is_local() {
  local ip="$1"
  valid_ipv4 "$ip" || return 1
  ip -o -4 addr show 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | grep -Fxq "$ip"
}

require_manager_values() {
  airgap_ip_apply_compat_values
  [[ -n "${AIRGAP_SERVER_IP:-}" ]] || {
    fail "Internal server IPv4 is not configured. Run Air-Gap install step 01 first."
    return 1
  }
  airgap_ip_is_local "$AIRGAP_SERVER_IP" || {
    fail "Configured Air-Gap IPv4 is not assigned to this server: $AIRGAP_SERVER_IP"
    return 1
  }
  [[ "${TURN_MIN_PORT:-}" =~ ^[0-9]+$ && "${TURN_MAX_PORT:-}" =~ ^[0-9]+$ ]] || return 1
  (( TURN_MIN_PORT < TURN_MAX_PORT && TURN_MIN_PORT >= 1024 && TURN_MAX_PORT <= 65535 )) || return 1
}

test_values() {
  require_manager_values
}

test_base_packages() {
  local cmd
  for cmd in docker nginx turnserver turnutils_stunclient rsync jq python3 git openssl curl ip ss systemctl; do
    command -v "$cmd" >/dev/null || return 1
  done
  python3 -c 'import yaml' || return 1
  docker compose version || return 1
  node -e 'const [M,m,p]=process.versions.node.split(".").map(Number); if (!(M===24 && (m>18 || (m===18 && p>=1)))) process.exit(1)' || return 1
  npm --version || return 1
  find_systemd_socket_proxyd >/dev/null || return 1
  systemctl is-active --quiet docker || return 1
  systemctl is-active --quiet nginx
}

install_step_1() {
  title
  new_log "install-01-internal-ip"
  local candidate v
  candidate="${AIRGAP_SERVER_IP:-$(airgap_ip_detect_default)}"
  while true; do
    prompt_default v "Internal server IPv4" "$candidate"
    if airgap_ip_is_local "$v"; then
      AIRGAP_SERVER_IP="$v"
      break
    fi
    fail "IPv4 must be valid and assigned to a local interface on this server."
  done

  prompt_default TURN_MIN_PORT "TURN minimum relay port" "${TURN_MIN_PORT:-49160}"
  prompt_default TURN_MAX_PORT "TURN maximum relay port" "${TURN_MAX_PORT:-49200}"
  [[ "$TURN_MIN_PORT" =~ ^[0-9]+$ && "$TURN_MAX_PORT" =~ ^[0-9]+$ ]] || {
    fail "TURN ports must be numeric."
    return 1
  }
  (( TURN_MIN_PORT < TURN_MAX_PORT && TURN_MIN_PORT >= 1024 && TURN_MAX_PORT <= 65535 )) || {
    fail "TURN relay range is invalid."
    return 1
  }

  airgap_ip_apply_compat_values
  save_config || return 1
  if run_logged "Validate internal-IP Air-Gap configuration" test_values; then
    mark_step 1
    ok "Air-Gap origin is configured for internal IPv4 ${AIRGAP_SERVER_IP}."
    info "No DNS name, public IPv4 or certificate email is required."
  else
    unmark_step 1
    return 1
  fi
}

airgap_ip_base_url() {
  printf 'http://%s' "$AIRGAP_SERVER_IP"
}

test_supabase_env() {
  local file="${SUPABASE_ROOT}/.env" key value base
  base="$(airgap_ip_base_url)"
  [[ "$(env_get "$file" COMPOSE_FILE)" == "docker-compose.yml" ]] || return 1
  [[ "$(env_get "$file" SUPABASE_PUBLIC_URL)" == "$base" ]] || return 1
  [[ "$(env_get "$file" API_EXTERNAL_URL)" == "${base}/auth/v1" ]] || return 1
  [[ "$(env_get "$file" SITE_URL)" == "$base" ]] || return 1
  [[ "$(env_get "$file" PROXY_DOMAIN)" == "$AIRGAP_SERVER_IP" ]] || return 1
  [[ "$(env_get "$file" POSTGRES_HOST)" == "db" ]] || return 1
  [[ "$(env_get "$file" POSTGRES_DB)" == "postgres" ]] || return 1
  [[ "$(env_get "$file" POSTGRES_PORT)" == "5432" ]] || return 1
  [[ "$(env_get "$file" FUNCTIONS_VERIFY_JWT)" == "false" ]] || return 1
  for key in POOLER_TENANT_ID STORAGE_TENANT_ID SEND_SMS_HOOK_SECRET PHONE_RATE_LIMIT_PEPPER PHONE_PASSWORD_RESET_SECRET DAILY_REPORT_CRON_SECRET NOTIFICATION_OUTBOX_CRON_SECRET MINUTES_REMINDER_CRON_SECRET DECISION_DUE_CRON_SECRET; do
    value="$(env_get "$file" "$key")"
    [[ -n "$value" ]] || return 1
    is_placeholder_value "$value" && return 1
  done
  for key in OPENAI_API_KEY SMTP_HOST SMTP_USER SMTP_PASS GOOGLE_PROJECT_ID GOOGLE_PROJECT_NUMBER; do
    value="$(env_get "$file" "$key")"
    is_placeholder_value "$value" && return 1
  done
  return 0
}

install_step_6() {
  title
  new_log "install-06-supabase-env-internal-ip"
  require_manager_values || return 1
  require_file "${SUPABASE_ROOT}/.env" || return 1
  local file="${SUPABASE_ROOT}/.env" base
  base="$(airgap_ip_base_url)"

  env_set "$file" COMPOSE_FILE "docker-compose.yml"
  env_set "$file" SUPABASE_PUBLIC_URL "$base"
  env_set "$file" API_EXTERNAL_URL "${base}/auth/v1"
  env_set "$file" SITE_URL "$base"
  env_set "$file" ADDITIONAL_REDIRECT_URLS "${base}/*"
  env_set "$file" POSTGRES_HOST "db"
  env_set "$file" POSTGRES_DB "postgres"
  env_set "$file" POSTGRES_PORT "5432"
  env_set "$file" POOLER_PROXY_PORT_TRANSACTION "6543"
  env_set "$file" POOLER_DEFAULT_POOL_SIZE "20"
  env_set "$file" POOLER_MAX_CLIENT_CONN "100"
  env_set "$file" POOLER_DB_POOL_SIZE "5"
  env_set "$file" STUDIO_DEFAULT_ORGANIZATION "Spark"
  env_set "$file" STUDIO_DEFAULT_PROJECT "Spark Air-Gap"
  env_set "$file" PGRST_DB_SCHEMAS "public,graphql_public"
  env_set "$file" PGRST_DB_MAX_ROWS "1000"
  env_set "$file" PGRST_DB_EXTRA_SEARCH_PATH "public"
  env_set "$file" API_GW_HTTP_PORT "8000"
  env_set "$file" KONG_HTTP_PORT "8000"
  env_set "$file" KONG_HTTPS_PORT "8443"
  env_set "$file" GLOBAL_S3_BUCKET "spark-storage"
  env_set "$file" REGION "local"
  env_set "$file" MINIO_ROOT_USER "spark-storage"
  env_set "$file" FUNCTIONS_VERIFY_JWT "false"
  env_set "$file" IMGPROXY_AUTO_WEBP "true"
  env_set "$file" PROXY_DOMAIN "$AIRGAP_SERVER_IP"
  env_set "$file" CERTBOT_EMAIL ""
  env_set "$file" PHONE_LOGIN_ALLOWED_ORIGINS "$base"

  env_has_nonempty "$file" SEND_SMS_HOOK_SECRET || env_set "$file" SEND_SMS_HOOK_SECRET "v1,whsec_$(openssl rand -base64 32 | tr -d '\n')"
  env_has_nonempty "$file" PHONE_RATE_LIMIT_PEPPER || env_set "$file" PHONE_RATE_LIMIT_PEPPER "$(openssl rand -hex 32)"
  env_has_nonempty "$file" PHONE_PASSWORD_RESET_SECRET || env_set "$file" PHONE_PASSWORD_RESET_SECRET "$(openssl rand -hex 32)"
  env_has_nonempty "$file" DAILY_REPORT_CRON_SECRET || env_set "$file" DAILY_REPORT_CRON_SECRET "$(openssl rand -hex 32)"
  env_has_nonempty "$file" NOTIFICATION_OUTBOX_CRON_SECRET || env_set "$file" NOTIFICATION_OUTBOX_CRON_SECRET "$(openssl rand -hex 32)"
  env_has_nonempty "$file" MINUTES_REMINDER_CRON_SECRET || env_set "$file" MINUTES_REMINDER_CRON_SECRET "$(openssl rand -hex 32)"
  env_has_nonempty "$file" DECISION_DUE_CRON_SECRET || env_set "$file" DECISION_DUE_CRON_SECRET "$(openssl rand -hex 32)"

  normalize_optional_external_env "$file"
  chmod 600 "$file"
  if run_logged "Validate Supabase internal-IP environment" test_supabase_env; then
    mark_step 6
  else
    unmark_step 6
    return 1
  fi
}

patch_compose() {
  patch_compose_standard || return 1
  COMPOSE_FILE="${SUPABASE_ROOT}/docker-compose.yml" AIRGAP_IP="$AIRGAP_SERVER_IP" python3 - <<'PY'
import os,yaml
from pathlib import Path
p=Path(os.environ['COMPOSE_FILE'])
d=yaml.safe_load(p.read_text(encoding='utf-8'))
s=d['services']
ip=os.environ['AIRGAP_IP']
s['api-gw']['ports']=['127.0.0.1:8000:8000/tcp', f'{ip}:8000:8000/tcp']
p.write_text(yaml.safe_dump(d,sort_keys=False,default_flow_style=False),encoding='utf-8')
PY
}

test_compose_security() {
  local rendered rc=0
  rendered="$(mktemp)"
  (cd "$SUPABASE_ROOT" && docker compose config >"$rendered") || rc=$?
  if (( rc != 0 )); then rm -f "$rendered"; return "$rc"; fi
  AIRGAP_IP="$AIRGAP_SERVER_IP" python3 - "$rendered" <<'PY' || rc=$?
import os,sys,yaml
s=yaml.safe_load(open(sys.argv[1],encoding='utf-8'))['services']
ip=os.environ['AIRGAP_IP']
def ports(name): return s[name].get('ports') or []
def parts(v):
    if isinstance(v,dict): return str(v.get('host_ip','')),str(v.get('published','')),str(v.get('target',''))
    text=str(v); bits=text.rsplit(':',2)
    return tuple(bits) if len(bits)==3 else ('',text,'')
api=[parts(x) for x in ports('api-gw')]
supa=[parts(x) for x in ports('supavisor')]
db=[parts(x) for x in ports('db')]
assert any(h=='127.0.0.1' and p=='8000' for h,p,_ in api), api
assert any(h==ip and p=='8000' for h,p,_ in api), api
assert all(h not in ('0.0.0.0','::','[::]','') for h,_,_ in api), api
assert not db, db
assert any(h=='127.0.0.1' and p=='5433' for h,p,_ in supa), supa
assert any(h=='127.0.0.1' and p=='6543' for h,p,_ in supa), supa
assert 'avatar-worker' in s
PY
  rm -f "$rendered"
  return "$rc"
}

airgap_ip_write_database_access_units() {
  local proxyd="$1"
  cat >/etc/systemd/system/spark-db-access.socket <<EOF_SOCKET
[Unit]
Description=Spark Air-Gap PostgreSQL access on internal IPv4

[Socket]
ListenStream=${AIRGAP_SERVER_IP}:5432
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

database_external_is_open() {
  systemctl is-active --quiet spark-db-access.socket 2>/dev/null || return 1
  ss -lnt 2>/dev/null | awk -v endpoint="${AIRGAP_SERVER_IP}:5432" '$4==endpoint {found=1} END{exit !found}'
}

airgap_ip_database_login_test() {
  local password username image result
  password="$(env_get "${SUPABASE_ROOT}/.env" POSTGRES_PASSWORD)"
  username="$(database_pooler_username)" || return 1
  image="$(postgres_client_image)" || return 1
  [[ -n "$password" ]] || return 1
  result="$(docker run --rm --network host -e PGPASSWORD="$password" --entrypoint psql "$image" \
    -h "$AIRGAP_SERVER_IP" -p 5432 -U "$username" -d postgres -Atqc 'select 1' 2>>"$CURRENT_LOG" || true)"
  [[ "$result" == "1" ]]
}

airgap_ip_provision_database_access() {
  local proxyd
  proxyd="$(find_systemd_socket_proxyd)" || { fail "systemd-socket-proxyd was not found."; return 1; }
  cleanup_database_access_runtime
  airgap_ip_write_database_access_units "$proxyd"
  systemctl daemon-reload || return 1
  systemctl enable --now spark-db-access.socket || return 1
  database_external_is_open || return 1
  airgap_ip_database_login_test || return 1
}

airgap_ip_supabase_health() {
  local url="${1:-}" timeout_s="${2:-5}" anon
  [[ -n "$url" ]] || return 1
  anon="$(env_get "${SUPABASE_ROOT}/.env" ANON_KEY)"
  [[ -n "$anon" ]] || return 1
  curl --noproxy '*' -fsS --connect-timeout "$timeout_s" -H "apikey: ${anon}" "$url" >/dev/null
}

airgap_ip_gateway_bind_present() {
  local cid
  cid="$(cd "$SUPABASE_ROOT" && docker compose ps -q api-gw 2>/dev/null)"
  [[ -n "$cid" ]] || return 1
  docker inspect "$cid" | AIRGAP_IP="$AIRGAP_SERVER_IP" python3 -c '
import json,os,sys
d=json.load(sys.stdin)
ports=((d[0].get("NetworkSettings") or {}).get("Ports") or {}).get("8000/tcp") or []
hosts={(str(x.get("HostIp","")),str(x.get("HostPort",""))) for x in ports}
ip=os.environ["AIRGAP_IP"]
raise SystemExit(0 if ("127.0.0.1","8000") in hosts and (ip,"8000") in hosts else 1)
'
}

airgap_ip_ensure_gateway_bind() {
  local compose_file="${SUPABASE_ROOT}/docker-compose.yml" deadline
  require_file "$compose_file" || return 1

  COMPOSE_FILE="$compose_file" AIRGAP_IP="$AIRGAP_SERVER_IP" python3 - <<'PY'
import os,yaml
from pathlib import Path
p=Path(os.environ['COMPOSE_FILE'])
d=yaml.safe_load(p.read_text(encoding='utf-8'))
services=d.get('services') if isinstance(d,dict) else None
if not isinstance(services,dict) or 'api-gw' not in services:
    raise SystemExit('docker-compose.yml is missing api-gw')
ip=os.environ['AIRGAP_IP']
services['api-gw']['ports']=[
    '127.0.0.1:8000:8000/tcp',
    f'{ip}:8000:8000/tcp',
]
p.write_text(yaml.safe_dump(d,sort_keys=False,default_flow_style=False),encoding='utf-8')
PY

  (cd "$SUPABASE_ROOT" && docker compose config --quiet) || return 1

  (cd "$SUPABASE_ROOT" && docker compose up -d --no-deps --force-recreate api-gw) || return 1
  airgap_ip_gateway_bind_present || {
    echo "ERROR: api-gw container does not publish both 127.0.0.1:8000 and ${AIRGAP_SERVER_IP}:8000" >>"$CURRENT_LOG"
    (cd "$SUPABASE_ROOT" && docker compose ps api-gw) >>"$CURRENT_LOG" 2>&1 || true
    return 1
  }

  deadline=$((SECONDS + 45))
  while (( SECONDS < deadline )); do
    if airgap_ip_supabase_health "http://${AIRGAP_SERVER_IP}:8000/auth/v1/health" 3 >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "ERROR: api-gw is published on ${AIRGAP_SERVER_IP}:8000 but its health endpoint did not become reachable." >>"$CURRENT_LOG"
  (cd "$SUPABASE_ROOT" && docker compose ps api-gw) >>"$CURRENT_LOG" 2>&1 || true
  ss -lntp >>"$CURRENT_LOG" 2>&1 || true
  return 1
}

install_step_10() {
  install_step_10_airgap_base || return 1
  new_log "install-10-airgap-ip-access"
  run_logged "Ensure Supabase gateway bind on ${AIRGAP_SERVER_IP}:8000" airgap_ip_ensure_gateway_bind || { unmark_step 10; return 1; }
  if run_logged "Expose PostgreSQL session endpoint only on ${AIRGAP_SERVER_IP}:5432" airgap_ip_provision_database_access; then
    run_logged "Validate direct Supabase gateway on ${AIRGAP_SERVER_IP}:8000" \
      airgap_ip_supabase_health "http://${AIRGAP_SERVER_IP}:8000/auth/v1/health" 5 || { unmark_step 10; return 1; }
    mark_step 10
  else
    unmark_step 10
    return 1
  fi
}

install_step_11() {
  title
  new_log "install-11-frontend-internal-ip"
  require_manager_values || return 1
  local anon base
  anon="$(env_get "${SUPABASE_ROOT}/.env" ANON_KEY)"
  [[ -n "$anon" ]] || { fail "ANON_KEY is missing."; return 1; }
  base="$(airgap_ip_base_url)"
  env_set "${SPARK_ROOT}/.env.production" VITE_SUPABASE_URL "$base"
  env_set "${SPARK_ROOT}/.env.production" VITE_SUPABASE_ANON_KEY "$anon"
  chmod 600 "${SPARK_ROOT}/.env.production"
  run_logged "Restore bundled frontend node_modules" bash -c "cd '$SPARK_ROOT' && npm ci" || return 1
  run_logged "Production build for internal-IP origin" bash -c "cd '$SPARK_ROOT' && npm run build" || return 1
  run_logged "Validate frontend build secret hygiene" test_frontend_build_security || return 1
  mkdir -p /var/www/spark
  run_logged "Deploy frontend to /var/www/spark" rsync -a --delete "${SPARK_ROOT}/dist/" /var/www/spark/ || return 1
  run_logged "Set web ownership" chown -R www-data:www-data /var/www/spark || return 1
  if run_logged "Validate frontend artifacts" test_frontend_deploy; then mark_step 11; else unmark_step 11; return 1; fi
}

airgap_ip_write_nginx() {
  local ip="$AIRGAP_SERVER_IP"
  cat >/etc/nginx/sites-available/spark <<EOF_NGINX
limit_req_zone \$binary_remote_addr zone=spark_auth_limit:10m rate=10r/s;
map \$http_upgrade \$spark_connection_upgrade {
    default upgrade;
    '' close;
}

# Air-Gap origin: HTTP on the server's internal IPv4 only.
# DNS/public TLS are intentionally outside this server configuration.
server {
    listen ${ip}:80 default_server;
    server_name _;
    server_tokens off;
    root /var/www/spark;
    index index.html;
    client_max_body_size 50m;
    # Compress textual frontend assets. Hashed JS/CSS dominate mobile transfer
    # size; fonts/images are already compressed and intentionally excluded.
    gzip on;
    gzip_comp_level 6;
    gzip_min_length 1024;
    gzip_vary on;
    gzip_proxied any;
    gzip_types
        text/css
        text/plain
        application/javascript
        application/json
        application/manifest+json
        image/svg+xml;


    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(self), microphone=(self), geolocation=(), display-capture=(self)" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' http://accounts.google.com https://accounts.google.com; style-src 'self' 'unsafe-inline' http://accounts.google.com https://accounts.google.com; img-src 'self' data: blob: http: https:; font-src 'self' data:; connect-src 'self' http://${ip} ws://${ip} http://${ip}:8000 ws://${ip}:8000 http://${ip}:7880 ws://${ip}:7880 http://accounts.google.com https://accounts.google.com http://oauth2.googleapis.com https://oauth2.googleapis.com; media-src 'self' blob:; worker-src 'self' blob:; frame-src 'self' http://accounts.google.com https://accounts.google.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self' http://accounts.google.com https://accounts.google.com; object-src 'none'; manifest-src 'self'" always;

    location ^~ /realtime/v1/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$spark_connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto http;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 3600s;
    }
    location ^~ /functions/v1/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto http;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
    location ~ ^/auth/v1/(token|signup|recover|otp|verify|resend)$ {
        limit_req zone=spark_auth_limit burst=30 nodelay;
        limit_req_status 429;
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto http;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
    location ^~ /auth/v1/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto http;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
    location ^~ /rest/v1/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto http;
    }
    location ^~ /storage/v1/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto http;
    }
    location ^~ /graphql/v1 {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto http;
    }
    location ^~ /whip {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto http;
        proxy_read_timeout 3600s;
    }
    location /assets/ { try_files \$uri =404; expires 30d; }
    location = /sw.js { try_files \$uri =404; expires -1; etag on; }
    location = /pwa-bootstrap.js { try_files \$uri =404; expires -1; }
    location / { try_files \$uri \$uri/ /index.html; expires -1; }
}
EOF_NGINX
  ln -sfn /etc/nginx/sites-available/spark /etc/nginx/sites-enabled/spark
  rm -f /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/spark-bootstrap /etc/nginx/sites-enabled/spark-livekit
}

airgap_ip_test_nginx() {
  local app_headers
  nginx -t || return 1
  systemctl is-active --quiet nginx || return 1
  ss -lnt | awk -v endpoint="${AIRGAP_SERVER_IP}:80" '$4==endpoint {found=1} END{exit !found}' || return 1
  app_headers="$(curl --noproxy '*' -sSI --connect-timeout 5 "http://${AIRGAP_SERVER_IP}/")" || return 1
  grep -Eqi '^X-Content-Type-Options:[[:space:]]*nosniff' <<<"$app_headers" || return 1
  grep -Eqi '^X-Frame-Options:[[:space:]]*SAMEORIGIN' <<<"$app_headers" || return 1
  grep -Eqi '^Content-Security-Policy:' <<<"$app_headers" || return 1
  airgap_ip_supabase_health "http://${AIRGAP_SERVER_IP}/auth/v1/health" 5
}

install_step_12() {
  title
  new_log "install-12-nginx-internal-ip"
  require_manager_values || return 1
  spark_apply_nginx_gzip_profile || return 1
  airgap_ip_write_nginx || return 1
  run_logged "Nginx syntax" nginx -t || return 1
  run_logged "Reload Nginx" systemctl reload nginx || return 1
  if run_logged "Validate internal-IP web/API origin" airgap_ip_test_nginx; then mark_step 12; else unmark_step 12; return 1; fi
}

install_step_13() {
  title
  new_log "install-13-no-local-tls"
  require_manager_values || return 1
  systemctl disable --now certbot.timer >/dev/null 2>&1 || true
  mark_step 13
  ok "Local DNS/TLS provisioning is intentionally disabled in Air-Gap internal-IP mode."
  info "The bank security/ingress layer can terminate public TLS later without changing the isolated server prerequisite."
}

install_step_14() {
  title
  new_log "install-14-nginx-internal-ip"
  require_manager_values || return 1
  local old=""
  [[ -f /etc/nginx/sites-available/spark ]] && old="$(mktemp)" && cp -a /etc/nginx/sites-available/spark "$old"
  spark_apply_nginx_gzip_profile || return 1
  airgap_ip_write_nginx || return 1
  if nginx -t >>"$CURRENT_LOG" 2>&1 && systemctl reload nginx >>"$CURRENT_LOG" 2>&1 && airgap_ip_test_nginx >>"$CURRENT_LOG" 2>&1; then
    [[ -n "$old" ]] && rm -f "$old"
    mark_step 14
    ok "Frontend + Supabase API are available on http://${AIRGAP_SERVER_IP}/."
    return 0
  fi
  restore_previous_nginx_production "$old"
  [[ -n "$old" ]] && rm -f "$old"
  unmark_step 14
  return 1
}

test_turn() {
  local escaped_ip deadline
  escaped_ip="${AIRGAP_SERVER_IP//./\\.}"

  deadline=$((SECONDS + 10))
  while (( SECONDS < deadline )); do
    if systemctl is-active --quiet coturn \
      && ss -lunp 2>/dev/null | grep -Eq "${escaped_ip}:3478([[:space:]]|$)" \
      && ss -ltnp 2>/dev/null | grep -Eq "${escaped_ip}:3478([[:space:]]|$)"; then
      return 0
    fi
    sleep 1
  done

  if ! systemctl is-active --quiet coturn; then
    echo "ERROR: coturn.service is not active." >>"$CURRENT_LOG"
  elif ! ss -lunp 2>/dev/null | grep -Eq "${escaped_ip}:3478([[:space:]]|$)"; then
    echo "ERROR: Coturn UDP listener is not bound to ${AIRGAP_SERVER_IP}:3478." >>"$CURRENT_LOG"
  elif ! ss -ltnp 2>/dev/null | grep -Eq "${escaped_ip}:3478([[:space:]]|$)"; then
    echo "ERROR: Coturn TCP listener is not bound to ${AIRGAP_SERVER_IP}:3478." >>"$CURRENT_LOG"
  fi
  ss -lunp >>"$CURRENT_LOG" 2>&1 || true
  ss -ltnp >>"$CURRENT_LOG" 2>&1 || true
  journalctl -u coturn --no-pager -n 80 >>"$CURRENT_LOG" 2>&1 || true
  return 1
}

test_turn_stun_probe() {
  local probe_log
  probe_log="$(mktemp)"
  if ! command -v turnutils_stunclient >/dev/null 2>&1; then
    echo "ERROR: turnutils_stunclient is not installed." >>"$CURRENT_LOG"
    rm -f "$probe_log"
    return 1
  fi
  if timeout 8s turnutils_stunclient -L "$AIRGAP_SERVER_IP" -p 3478 "$AIRGAP_SERVER_IP" >"$probe_log" 2>&1; then
    cat "$probe_log" >>"$CURRENT_LOG"
    rm -f "$probe_log"
    return 0
  fi
  echo "ERROR: STUN binding request through the active firewall to ${AIRGAP_SERVER_IP}:3478 failed." >>"$CURRENT_LOG"
  cat "$probe_log" >>"$CURRENT_LOG" 2>&1 || true
  ufw status verbose >>"$CURRENT_LOG" 2>&1 || true
  ss -lunp >>"$CURRENT_LOG" 2>&1 || true
  journalctl -u coturn --no-pager -n 80 >>"$CURRENT_LOG" 2>&1 || true
  rm -f "$probe_log"
  return 1
}

install_step_16() {
  title
  new_log "install-16-turn-internal-ip"
  require_manager_values || return 1
  local turn_env="${CONFIG_DIR}/turn-secret.env" secret
  secret="$(env_get "$turn_env" TURN_SHARED_SECRET)"
  [[ -n "$secret" ]] || secret="$(openssl rand -base64 48 | tr -d '\n')"
  env_set "$turn_env" TURN_DOMAIN "$AIRGAP_SERVER_IP"
  env_set "$turn_env" TURN_SHARED_SECRET "$secret"
  env_set "$turn_env" TURN_URL "turn:${AIRGAP_SERVER_IP}:3478?transport=udp"
  env_set "$turn_env" TURN_TCP_URL "turn:${AIRGAP_SERVER_IP}:3478?transport=tcp"
  env_set "$turn_env" TURNS_URL ""
  chmod 600 "$turn_env"

  cat >/etc/turnserver.conf <<EOF_TURN
listening-port=3478
listening-ip=${AIRGAP_SERVER_IP}
relay-ip=${AIRGAP_SERVER_IP}
fingerprint
use-auth-secret
static-auth-secret=${secret}
realm=${AIRGAP_SERVER_IP}
server-name=${AIRGAP_SERVER_IP}
min-port=${TURN_MIN_PORT}
max-port=${TURN_MAX_PORT}
no-tls
no-dtls
no-cli
no-loopback-peers
no-multicast-peers
stale-nonce=600
EOF_TURN
  chown root:turnserver /etc/turnserver.conf
  chmod 0640 /etc/turnserver.conf
  if grep -q '^TURNSERVER_ENABLED=' /etc/default/coturn 2>/dev/null; then
    sed -i 's/^TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn
  else
    printf '\nTURNSERVER_ENABLED=1\n' >>/etc/default/coturn
  fi

  if functions_reference_turn_secret; then
    env_set "${CONFIG_DIR}/functions-extra.env" TURN_DOMAIN "$AIRGAP_SERVER_IP"
    env_set "${CONFIG_DIR}/functions-extra.env" TURN_SHARED_SECRET "$secret"
    env_set "${CONFIG_DIR}/functions-extra.env" TURN_URL "turn:${AIRGAP_SERVER_IP}:3478?transport=udp"
    env_set "${CONFIG_DIR}/functions-extra.env" TURN_TCP_URL "turn:${AIRGAP_SERVER_IP}:3478?transport=tcp"
    env_set "${CONFIG_DIR}/functions-extra.env" TURNS_URL ""
    chmod 600 "${CONFIG_DIR}/functions-extra.env"
    if [[ -f "${SUPABASE_ROOT}/docker-compose.yml" ]]; then
      run_logged "Reload Functions for internal-IP TURN env" bash -c "cd '$SUPABASE_ROOT' && docker compose up -d --force-recreate functions" || return 1
    fi
  fi

  run_logged "Enable Coturn service" systemctl enable coturn || return 1
  run_logged "Restart Coturn with internal-IP configuration" systemctl restart coturn || {
    journalctl -u coturn --no-pager -n 80 >>"$CURRENT_LOG" 2>&1 || true
    return 1
  }
  if run_logged "Validate internal TURN listeners" test_turn; then mark_step 16; else unmark_step 16; return 1; fi
}

test_certbot_hook() {
  ! systemctl is-active --quiet certbot.timer 2>/dev/null
}

install_step_17() {
  title
  new_log "install-17-certbot-disabled-airgap-ip"
  systemctl disable --now certbot.timer >/dev/null 2>&1 || true
  rm -f /etc/systemd/system/certbot.service.d/spark-turn.conf
  systemctl daemon-reload || return 1
  install -d -m 0700 "$CONFIG_DIR"
  printf 'Public DNS/TLS lifecycle is external to the Air-Gap server. Origin mode is HTTP on %s.\n' "$AIRGAP_SERVER_IP" >"${CONFIG_DIR}/airgap-certificate-renewal.txt"
  chmod 0600 "${CONFIG_DIR}/airgap-certificate-renewal.txt"
  if test_certbot_hook; then mark_step 17; else unmark_step 17; return 1; fi
}

# Firewall policy belongs to the bank. No offline step mutates UFW.
firewall_optional_allow_port() { :; }
firewall_optional_close_port() { :; }

install_step_18() {
  fail "Step 18 (UFW) was removed from offline installation. Use steps 1-17 or 19-22."
  return 2
}

airgap_full_preflight() {
  local root="$1"
  airgap_validate_bundle_dir "$root" || return 1
  airgap_validate_target_compatibility "$root" || return 1
  if ! airgap_verify_images "$root"; then
    # Validation above authenticates the local archive against the bundle
    # checksums. Recover missing/replaced images locally in either install mode.
    run_logged "Restore pinned Docker images from the verified local bundle" \
      airgap_reload_image_archive "$root" || return 1
    airgap_verify_images "$root" || {
      fail "Docker image verification failed after local archive recovery."
      return 1
    }
  fi
  ok "Air-Gap internal-IP mode does not require DNS, public IP or a TLS certificate pack."
}

# These labels are used by the offline step selector; the online menu retains
# its existing meanings and numbering.
eval "$(declare -f installation_step_name | sed '1s/installation_step_name/installation_step_name_online/')"
installation_step_name() {
  case "$1" in
    1) printf 'Internal server IPv4 / TURN ports' ;;
    13) printf 'Validate HTTP origin (no certificates)' ;;
    17) printf 'Disable external certificate renewal' ;;
    19) printf 'LiveKit internal-IP configuration / secrets' ;;
    21) printf 'Spark database restore / full service validation' ;;
    *) installation_step_name_online "$1" ;;
  esac
}

install_step_21() {
  title
  new_log "install-21-offline-database-validation"
  unmark_step 21
  run_logged "Validate Supabase before database inspection" test_supabase_health || return 1
  run_logged "Validate HTTP frontend/API origin" airgap_ip_test_nginx || return 1
  if ! spark_application_database_provisioned; then
    warn "The bundle contains infrastructure and application code, not your Spark database."
    info "This repository has no baseline migrations. Supply a local plain SQL Spark backup using the existing Restore workflow."
    restore_plain_database_interactive || return 1
    # Restore preserves target secrets: synchronize service-role passwords,
    # restart/validate the stack and re-seed the exact offline Edge cache.
    install_step_10 || return 1
  fi
  spark_application_database_provisioned || { fail "The restored database does not contain the Spark application schema."; return 1; }
  if run_visible "Validate offline Edge Function synchronization" test_function_sync; then
    mark_step 21
  else
    unmark_step 21
    return 1
  fi
}

# LiveKit: internal IPv4 signaling/media without DNS or local TLS.
AIRGAP_LIVEKIT_OVERRIDE="${LIVEKIT_ROOT}/docker-compose.airgap-ip.yml"

livekit_compose() {
  local -a args=(
    -f "${LIVEKIT_ROOT}/docker-compose.yml"
    -f "${LIVEKIT_ROOT}/docker-compose.spark-cli.yml"
  )
  [[ -f "$AIRGAP_LIVEKIT_OVERRIDE" ]] && args+=( -f "$AIRGAP_LIVEKIT_OVERRIDE" )
  docker compose "${args[@]}" --env-file "$LIVEKIT_ENV" "$@"
}

livekit_observability_compose() {
  livekit_compose --profile observability "$@"
}

airgap_ip_write_livekit_override() {
  cat >"$AIRGAP_LIVEKIT_OVERRIDE" <<EOF_YAML
services:
  livekit:
    environment:
      LIVEKIT_CONFIG: |
        port: 7880
        log_level: info
        rtc:
          tcp_port: 7881
          port_range_start: 50000
          port_range_end: 60000
          use_external_ip: false
          node_ip: ${AIRGAP_SERVER_IP}
          ips:
            includes:
              - ${AIRGAP_SERVER_IP}/32
          stun_servers:
            - ${AIRGAP_SERVER_IP}:443
        redis:
          address: \${LIVEKIT_REDIS_ADDRESS:-127.0.0.1:6379}
        keys:
          \${LIVEKIT_API_KEY}: \${LIVEKIT_API_SECRET}
        prometheus_port: 6789
        turn:
          enabled: true
          udp_port: 443
          allow_restricted_peer_cidrs:
            - ${AIRGAP_SERVER_IP}/32
        ingress:
          rtmp_base_url: rtmp://${AIRGAP_SERVER_IP}:1935/live
          whip_base_url: http://${AIRGAP_SERVER_IP}/whip
        room:
          auto_create: false
          empty_timeout: 300
          departure_timeout: 60
          max_participants: 20
  ingress:
    environment:
      LIVEKIT_WS_URL: ws://127.0.0.1:7880
      INGRESS_CONFIG_BODY: |
        ws_url: ws://127.0.0.1:7880
        api_key: \${LIVEKIT_API_KEY}
        api_secret: \${LIVEKIT_API_SECRET}
        redis:
          address: \${LIVEKIT_REDIS_ADDRESS:-127.0.0.1:6379}
        health_port: 9092
        prometheus_port: 6787
        rtmp_port: 1935
        whip_port: 8080
        rtc_config:
          udp_port: 7885
          use_external_ip: false
        log_level: info
  prometheus:
    command:
      - --config.file=/etc/prometheus/prometheus.yml
      - --storage.tsdb.path=/prometheus
      - --storage.tsdb.retention.time=15d
      - --web.listen-address=127.0.0.1:\${SPARK_OBSERVABILITY_PROMETHEUS_PORT:-19090}
      - --web.enable-lifecycle
  alloy:
    user: "473:473"
    group_add:
      - "\${DOCKER_SOCKET_GID:-0}"
EOF_YAML
  chmod 0600 "$AIRGAP_LIVEKIT_OVERRIDE"
}

livekit_test_dns() {
  airgap_ip_is_local "$AIRGAP_SERVER_IP"
}

test_livekit_config() {
  require_file "${LIVEKIT_ROOT}/docker-compose.yml" || return 1
  require_file "${LIVEKIT_ROOT}/docker-compose.spark-cli.yml" || return 1
  require_file "$AIRGAP_LIVEKIT_OVERRIDE" || return 1
  require_file "$LIVEKIT_ENV" || return 1
  livekit_require_env || return 1
  livekit_test_dns || return 1
  [[ "$(livekit_env_value LIVEKIT_DOMAIN)" == "$AIRGAP_SERVER_IP" ]] || return 1
  [[ "$(livekit_env_value LIVEKIT_TURN_DOMAIN)" == "$AIRGAP_SERVER_IP" ]] || return 1
  [[ "$(livekit_env_value LIVEKIT_INGRESS_DOMAIN)" == "$AIRGAP_SERVER_IP" ]] || return 1
  [[ "$(livekit_env_value S3_ENDPOINT)" == "http://127.0.0.1:9000" ]] || return 1
  livekit_compose config --quiet >>"$CURRENT_LOG" 2>&1 || return 1
}

install_step_19() {
  title
  new_log "install-19-livekit-internal-ip"
  require_manager_values || return 1
  require_file "${SUPABASE_ROOT}/.env" || return 1
  require_dir "$LIVEKIT_SOURCE_DIR" || return 1

  run_logged "Sync LiveKit deployment assets" livekit_sync_assets || return 1
  [[ -f "$LIVEKIT_ENV" ]] || cp "${LIVEKIT_ROOT}/.env.example" "$LIVEKIT_ENV"
  chmod 600 "$LIVEKIT_ENV"
  env_set "$LIVEKIT_ENV" MINIO_IMAGE "minio/minio:RELEASE.2025-04-22T22-12-26Z"
  env_set "$LIVEKIT_ENV" MINIO_MC_IMAGE "minio/mc:RELEASE.2025-08-13T08-35-41Z"
  env_set "$LIVEKIT_ENV" PROMETHEUS_IMAGE "prom/prometheus:v3.14.0"
  env_set "$LIVEKIT_ENV" ALERTMANAGER_IMAGE "prom/alertmanager:v0.34.0"
  env_set "$LIVEKIT_ENV" GRAFANA_IMAGE "grafana/grafana:13.2.0"
  env_set "$LIVEKIT_ENV" LOKI_IMAGE "grafana/loki:3.7.0"
  env_set "$LIVEKIT_ENV" ALLOY_IMAGE "grafana/alloy:v1.19.0"
  env_set "$LIVEKIT_ENV" NODE_EXPORTER_IMAGE "prom/node-exporter:v1.12.1"
  env_set "$LIVEKIT_ENV" BLACKBOX_EXPORTER_IMAGE "prom/blackbox-exporter:v0.28.0"
  env_set "$LIVEKIT_ENV" GRAFANA_ADMIN_USER "admin"
  livekit_ensure_secret GRAFANA_ADMIN_PASSWORD "openssl rand -hex 24"

  env_set "$LIVEKIT_ENV" LIVEKIT_DOMAIN "$AIRGAP_SERVER_IP"
  env_set "$LIVEKIT_ENV" LIVEKIT_TURN_DOMAIN "$AIRGAP_SERVER_IP"
  env_set "$LIVEKIT_ENV" LIVEKIT_INGRESS_DOMAIN "$AIRGAP_SERVER_IP"
  [[ -n "$(livekit_env_value LIVEKIT_REDIS_ADDRESS)" ]] || env_set "$LIVEKIT_ENV" LIVEKIT_REDIS_ADDRESS "127.0.0.1:6379"
  livekit_ensure_secret LIVEKIT_API_KEY "printf 'LK%s' \"\$(openssl rand -hex 12)\""
  livekit_ensure_secret LIVEKIT_API_SECRET "openssl rand -hex 32"
  livekit_configure_local_recording_storage || return 1
  chmod 600 "$LIVEKIT_ENV"

  install -d -m 0700 "$LIVEKIT_TURN_CERT_DIR"
  airgap_ip_write_livekit_override || return 1
  if run_logged "Validate LiveKit internal-IP config" test_livekit_config; then
    mark_step 19
    ok "LiveKit signaling origin: ws://${AIRGAP_SERVER_IP}:7880"
  else
    unmark_step 19
    return 1
  fi
}

livekit_install_certbot_hook() {
  rm -f "$LIVEKIT_RENEW_HOOK"
  return 0
}

livekit_firewall_rules() {
  info "Firewall is externally managed; no host firewall rules were changed."
}

livekit_public_tls_probe() {
  local code
  code="$(curl --noproxy '*' -sS -o /dev/null -w '%{http_code}' --connect-timeout 5 "http://${AIRGAP_SERVER_IP}:7880/" || true)"
  [[ "$code" =~ ^[1-5][0-9][0-9]$ && "$code" != "000" ]]
}

livekit_turn_tls_probe() {
  turnutils_stunclient -L "$AIRGAP_SERVER_IP" -p "$LIVEKIT_TURN_UDP_PORT" "$AIRGAP_SERVER_IP" >/dev/null 2>&1
}

livekit_airgap_http_reachable() {
  local url="$1" code
  code="$(curl --noproxy '*' -sS -o /dev/null -w '%{http_code}' --connect-timeout 5 "$url" || true)"
  [[ "$code" =~ ^[1-5][0-9][0-9]$ && "$code" != "000" ]]
}

livekit_internal_api_exposure_probe() {
  livekit_airgap_http_reachable "http://${AIRGAP_SERVER_IP}:${LIVEKIT_INTERNAL_API_PORT}/"
}

livekit_secret_file_permissions_probe() {
  [[ "$(stat -c '%a' "$LIVEKIT_ENV")" == "600" ]] || return 1
  [[ "$(stat -c '%a' "$AIRGAP_LIVEKIT_OVERRIDE")" == "600" ]] || return 1
}

spark_application_database_provisioned() {
  (
    cd "$SUPABASE_ROOT"
    docker compose exec -T db psql -U postgres -d postgres -Atq <<'SQL'
select case when
  to_regclass('public.meetings') is not null
  and to_regclass('public.profiles') is not null
  and to_regclass('public.participants') is not null
then 1 else 0 end;
SQL
  ) 2>>"$CURRENT_LOG" | grep -qx '1'
}

livekit_airgap_listener_probe() {
  local protocol="$1" port="$2" sockets
  case "$protocol" in
    tcp) sockets="$(ss -H -lntp 2>/dev/null || true)" ;;
    udp) sockets="$(ss -H -lunp 2>/dev/null || true)" ;;
    *) return 1 ;;
  esac
  grep -Eq "(${AIRGAP_SERVER_IP//./\\.}|0\.0\.0\.0|\[::\]|\*):${port}\\b" <<<"$sockets"
}

livekit_airgap_minio_listener_probe() {
  ss -H -lntp 2>/dev/null | grep -Eq '127\.0\.0\.1:9000\b'
}

livekit_airgap_validation_check() {
  local label="$1" rc
  shift
  printf '[CHECK] %s\n' "$label" | tee -a "$CURRENT_LOG"
  if "$@" >>"$CURRENT_LOG" 2>&1; then
    printf '[PASS] %s\n' "$label" | tee -a "$CURRENT_LOG"
    return 0
  else
    rc=$?
    printf '[FAIL] %s (rc=%s)\n' "$label" "$rc" | tee -a "$CURRENT_LOG" >&2
    return "$rc"
  fi
}

livekit_airgap_validation_report_failure() {
  {
    printf '\n=== LiveKit Compose state ===\n'
    livekit_compose ps 2>&1 || true
    printf '\n=== Listening sockets ===\n'
    ss -lntup 2>&1 || true
    printf '\n=== UFW status ===\n'
    ufw status verbose 2>&1 || true
  } >>"$CURRENT_LOG"
}

test_livekit_full_validation() {
  local function

  livekit_airgap_validation_check "LiveKit internal-IP configuration" test_livekit_config || { livekit_airgap_validation_report_failure; return 1; }
  livekit_airgap_validation_check "LiveKit runtime readiness" livekit_runtime_ready || { livekit_report_start_failure; livekit_airgap_validation_report_failure; return 1; }
  livekit_airgap_validation_check "LiveKit signaling TCP 7880 listener" livekit_airgap_listener_probe tcp 7880 || { livekit_airgap_validation_report_failure; return 1; }
  livekit_airgap_validation_check "LiveKit ICE TCP 7881 listener" livekit_airgap_listener_probe tcp 7881 || { livekit_airgap_validation_report_failure; return 1; }
  livekit_airgap_validation_check "LiveKit embedded TURN UDP 443 listener" livekit_airgap_listener_probe udp 443 || { livekit_airgap_validation_report_failure; return 1; }
  livekit_airgap_validation_check "LiveKit ingress RTMP TCP 1935 listener" livekit_airgap_listener_probe tcp 1935 || { livekit_airgap_validation_report_failure; return 1; }
  livekit_airgap_validation_check "LiveKit ingress RTC UDP 7885 listener" livekit_airgap_listener_probe udp 7885 || { livekit_airgap_validation_report_failure; return 1; }
  livekit_airgap_validation_check "Local MinIO TCP 9000 listener" livekit_airgap_minio_listener_probe || { livekit_airgap_validation_report_failure; return 1; }
  livekit_airgap_validation_check "Local MinIO readiness" curl -fsS --connect-timeout 3 http://127.0.0.1:9000/minio/health/ready || { livekit_airgap_validation_report_failure; return 1; }
  livekit_airgap_validation_check "LiveKit internal HTTP reachability" livekit_public_tls_probe "$AIRGAP_SERVER_IP" || { livekit_airgap_validation_report_failure; return 1; }
  livekit_airgap_validation_check "LiveKit embedded TURN STUN UDP 443" livekit_turn_tls_probe || { livekit_airgap_validation_report_failure; return 1; }
  livekit_airgap_validation_check "LiveKit RoomService API smoke test" livekit_api_smoke || { livekit_airgap_validation_report_failure; return 1; }

  livekit_airgap_validation_check "LiveKit secret leak scan" livekit_secret_leak_probe || { livekit_airgap_validation_report_failure; return 1; }
  livekit_airgap_validation_check "LiveKit secret file permissions" livekit_secret_file_permissions_probe || { livekit_airgap_validation_report_failure; return 1; }
  livekit_airgap_validation_check "LiveKit internal API exposure" livekit_internal_api_exposure_probe || { livekit_airgap_validation_report_failure; return 1; }
  livekit_airgap_validation_check "Legacy Coturn is disabled" bash -c '! systemctl is-active --quiet coturn 2>/dev/null' || { livekit_airgap_validation_report_failure; return 1; }
  return 0
}

livekit_write_observability_targets() {
  local target_file="${LIVEKIT_ROOT}/monitoring/targets/blackbox.json"
  install -d -m 0755 "$(dirname "$target_file")"
  cat >"${LIVEKIT_ROOT}/monitoring/blackbox.yml" <<'EOF_BLACKBOX'
modules:
  http_2xx:
    prober: http
    timeout: 8s
    http:
      method: GET
      preferred_ip_protocol: ip4
      ip_protocol_fallback: false
      follow_redirects: true
      fail_if_ssl: true
      fail_if_not_ssl: false
EOF_BLACKBOX
  cat >"$target_file" <<EOF_TARGETS
[
  {
    "targets": ["http://${AIRGAP_SERVER_IP}/auth/v1/.well-known/jwks.json"],
    "labels": {"probe": "spark-api"}
  },
  {
    "targets": ["http://${AIRGAP_SERVER_IP}:7880/"],
    "labels": {"probe": "livekit-internal-ip"}
  },
  {
    "targets": ["http://127.0.0.1:9092/"],
    "labels": {"probe": "ingress-health"}
  }
]
EOF_TARGETS
  chmod 0644 "${LIVEKIT_ROOT}/monitoring/blackbox.yml" "$target_file"
  python3 -m json.tool "$target_file" >/dev/null
}


livekit_airgap_select_prometheus_port() {
  local current candidate listeners
  current="$(env_get "$LIVEKIT_ENV" SPARK_OBSERVABILITY_PROMETHEUS_PORT)"
  if [[ "$current" =~ ^[0-9]+$ ]] && (( current >= 1024 && current <= 65535 )); then
    printf '%s\n' "$current"
    return 0
  fi

  listeners="$(ss -H -lnt 2>/dev/null || true)"
  for candidate in 19090 29090 39090 49090; do
    if ! grep -Eq "127\.0\.0\.1:${candidate}\\b" <<<"$listeners"; then
      env_set "$LIVEKIT_ENV" SPARK_OBSERVABILITY_PROMETHEUS_PORT "$candidate"
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  printf 'No free loopback port is available for Spark Prometheus (tried 19090/29090/39090/49090).\n' >>"$CURRENT_LOG"
  return 1
}

livekit_airgap_prepare_observability_runtime() {
  local prometheus_port docker_gid
  [[ -S /var/run/docker.sock ]] || {
    printf 'Docker socket is missing: /var/run/docker.sock\n' >>"$CURRENT_LOG"
    return 1
  }
  prometheus_port="$(livekit_airgap_select_prometheus_port)" || return 1
  docker_gid="$(stat -c '%g' /var/run/docker.sock 2>>"$CURRENT_LOG")" || return 1
  [[ "$docker_gid" =~ ^[0-9]+$ ]] || return 1
  env_set "$LIVEKIT_ENV" DOCKER_SOCKET_GID "$docker_gid"
  airgap_ip_write_livekit_override || return 1
  printf 'Spark Prometheus loopback port: %s\n' "$prometheus_port" >>"$CURRENT_LOG"
  printf 'Docker socket supplementary GID for Alloy: %s\n' "$docker_gid" >>"$CURRENT_LOG"
}

livekit_airgap_sync_observability_assets() {
  local source="${LIVEKIT_SOURCE_DIR}/monitoring" prometheus_port
  [[ -d "$source" ]] || {
    printf 'Manager observability asset directory is missing: %s\n' "$source" >>"$CURRENT_LOG"
    return 1
  }
  prometheus_port="$(env_get "$LIVEKIT_ENV" SPARK_OBSERVABILITY_PROMETHEUS_PORT)"
  [[ "$prometheus_port" =~ ^[0-9]+$ ]] || {
    printf 'Spark Prometheus loopback port is not configured.\n' >>"$CURRENT_LOG"
    return 1
  }

  install -d -m 0755 "${LIVEKIT_ROOT}/monitoring"
  rsync -a --delete "${source}/" "${LIVEKIT_ROOT}/monitoring/" >>"$CURRENT_LOG" 2>&1 || return 1

  # Keep Spark observability loopback-only while avoiding collisions with an
  # existing host Prometheus on the conventional 9090 port.
  sed -i "s#127\.0\.0\.1:9090#127.0.0.1:${prometheus_port}#g"     "${LIVEKIT_ROOT}/monitoring/prometheus.yml"     "${LIVEKIT_ROOT}/monitoring/grafana/provisioning/datasources/datasources.yml" || return 1

  # Grafana probes these standard provisioning directories even when Spark has
  # no plugins/alerting provisioning files yet. Create them to avoid noisy
  # startup errors while the whole provisioning tree remains read-only in the
  # container.
  install -d -m 0755     "${LIVEKIT_ROOT}/monitoring/grafana/provisioning/plugins"     "${LIVEKIT_ROOT}/monitoring/grafana/provisioning/alerting"
}

livekit_airgap_observability_config_ready() {
  local file failed=0
  for file in \
    monitoring/prometheus.yml \
    monitoring/rules/livekit-alerts.yml \
    monitoring/alertmanager.yml \
    monitoring/blackbox.yml \
    monitoring/loki.yml \
    monitoring/alloy.alloy \
    monitoring/grafana/provisioning/datasources/datasources.yml \
    monitoring/grafana/provisioning/dashboards/dashboards.yml \
    monitoring/grafana/dashboards/spark-livekit-overview.json \
    monitoring/grafana/dashboards/spark-livekit-operations.json \
    monitoring/targets/blackbox.json; do
    if [[ ! -f "${LIVEKIT_ROOT}/${file}" ]]; then
      printf 'Missing observability file: %s\n' "${LIVEKIT_ROOT}/${file}" >>"$CURRENT_LOG"
      failed=1
    fi
  done
  (( failed == 0 )) || return 1

  if ! python3 -m json.tool "${LIVEKIT_ROOT}/monitoring/targets/blackbox.json" >/dev/null 2>>"$CURRENT_LOG"; then
    printf 'Invalid JSON: monitoring/targets/blackbox.json\n' >>"$CURRENT_LOG"
    return 1
  fi
  if ! python3 -m json.tool "${LIVEKIT_ROOT}/monitoring/grafana/dashboards/spark-livekit-overview.json" >/dev/null 2>>"$CURRENT_LOG"; then
    printf 'Invalid JSON: spark-livekit-overview.json\n' >>"$CURRENT_LOG"
    return 1
  fi
  if ! python3 -m json.tool "${LIVEKIT_ROOT}/monitoring/grafana/dashboards/spark-livekit-operations.json" >/dev/null 2>>"$CURRENT_LOG"; then
    printf 'Invalid JSON: spark-livekit-operations.json\n' >>"$CURRENT_LOG"
    return 1
  fi

  if ! livekit_observability_compose config --quiet >>"$CURRENT_LOG" 2>&1; then
    printf 'Docker Compose observability configuration validation failed.\n' >>"$CURRENT_LOG"
    return 1
  fi
}


livekit_observability_ready() {
  local service state prometheus_port listeners port result
  prometheus_port="$(env_get "$LIVEKIT_ENV" SPARK_OBSERVABILITY_PROMETHEUS_PORT)"
  [[ "$prometheus_port" =~ ^[0-9]+$ ]] || return 1

  for service in prometheus alertmanager loki alloy node-exporter blackbox-exporter grafana; do
    state="$(livekit_observability_service_state "$service" 2>/dev/null || true)"
    [[ "$state" == running* ]] || return 1
    [[ "$state" != *unhealthy* && "$state" != *restarting* ]] || return 1
  done

  curl -fsS --connect-timeout 3 "http://127.0.0.1:${prometheus_port}/-/ready" >/dev/null || return 1
  curl -fsS --connect-timeout 3 http://127.0.0.1:9093/-/ready >/dev/null || return 1
  curl -fsS --connect-timeout 3 http://127.0.0.1:3100/ready >/dev/null || return 1
  curl -fsS --connect-timeout 3 http://127.0.0.1:12345/-/ready >/dev/null || return 1
  curl -fsS --connect-timeout 3 http://127.0.0.1:9100/metrics >/dev/null || return 1
  curl -fsS --connect-timeout 3 http://127.0.0.1:9115/metrics >/dev/null || return 1
  curl -fsS --connect-timeout 3 http://127.0.0.1:3000/api/health >/dev/null || return 1

  listeners="$(ss -H -lnt 2>/dev/null || true)"
  for port in 3000 "$prometheus_port" 9093 3100 12345 9100 9115; do
    grep -Eq "127\\.0\\.0\\.1:${port}\\b" <<<"$listeners" || return 1
    ! grep -Eq "(0\\.0\\.0\\.0|\\[::\\]|\\*):${port}\\b" <<<"$listeners" || return 1
  done

  result="$(curl -fsSG --connect-timeout 3 \
    --data-urlencode 'query=min(up{job=~"livekit|livekit-egress|livekit-ingress|node|blackbox-exporter|alloy|loki"})' \
    "http://127.0.0.1:${prometheus_port}/api/v1/query")" || return 1
  python3 -c '
import json,sys
payload=json.load(sys.stdin)
if payload.get("status")!="success":
    raise SystemExit(1)
items=payload.get("data",{}).get("result",[])
if not items or float(items[0].get("value",[0,"0"])[1]) < 1:
    raise SystemExit(1)
' <<<"$result"
}

livekit_airgap_observability_image_list() {
  local output="$1"
  livekit_observability_compose config --images 2>>"$CURRENT_LOG" \
    | sed '/^[[:space:]]*$/d' | sort -u >"$output"
  [[ -s "$output" ]]
}

livekit_airgap_observability_images_ready() {
  local list_file="$1" image failed=0
  while IFS= read -r image; do
    [[ -n "$image" ]] || continue
    if ! "$AIRGAP_REAL_DOCKER" image inspect "$image" >/dev/null 2>&1; then
      printf 'Missing observability Docker image: %s\n' "$image" >>"$CURRENT_LOG"
      failed=1
      continue
    fi
    if ! "$AIRGAP_REAL_DOCKER" image save "$image" >/dev/null 2>>"$CURRENT_LOG"; then
      printf 'Unreadable observability Docker image content: %s\n' "$image" >>"$CURRENT_LOG"
      failed=1
    fi
  done <"$list_file"
  (( failed == 0 ))
}

install_step_22() {
  title
  new_log "install-22-livekit-observability-airgap"

  test_livekit_full_validation || {
    fail "Complete Step 21 LiveKit validation first."
    return 1
  }

  run_logged "Prepare Air-Gap observability runtime" livekit_airgap_prepare_observability_runtime || {
    fail "Unable to prepare the local-only observability runtime. See the Step 22 log for the exact port/socket error."
    unmark_step 22
    return 1
  }
  run_logged "Sync bundled observability assets" livekit_airgap_sync_observability_assets || {
    fail "Bundled observability assets are missing from the installed Spark Manager. Update the Manager and retry Step 22."
    unmark_step 22
    return 1
  }
  run_logged "Generate observability HTTP targets" livekit_write_observability_targets || return 1
  if ! run_logged "Validate observability configuration" livekit_airgap_observability_config_ready; then
    fail "Observability configuration is not valid. See the Step 22 log for the exact missing/invalid file or Compose error."
    unmark_step 22
    return 1
  fi

  local image_list root
  image_list="$(mktemp)"
  if ! livekit_airgap_observability_image_list "$image_list"; then
    rm -f "$image_list"
    fail "Unable to resolve the observability Docker image list."
    unmark_step 22
    return 1
  fi

  if ! livekit_airgap_observability_images_ready "$image_list"; then
    root="$(airgap_current_root 2>/dev/null || true)"
    if [[ -n "$root" ]]; then
      warn "One or more observability images are missing/unreadable; attempting an offline reload from the active Air-Gap bundle."
      airgap_reload_image_archive "$root" >>"$CURRENT_LOG" 2>&1 || true
    fi
    if ! livekit_airgap_observability_images_ready "$image_list"; then
      rm -f "$image_list"
      fail "The active Air-Gap bundle does not provide a complete local observability image set. Rebuild/import the bundle with the updated builder; no Internet pull was attempted."
      unmark_step 22
      return 1
    fi
  fi
  rm -f "$image_list"

  if ! run_logged "Start bundled Prometheus/Grafana/Loki/Alertmanager observability" \
    livekit_observability_compose up -d prometheus alertmanager loki alloy node-exporter blackbox-exporter grafana; then
    livekit_report_observability_failure
    unmark_step 22
    return 1
  fi

  info "Waiting for observability readiness (max 90 seconds)..."
  local deadline=$((SECONDS + 90))
  while (( SECONDS < deadline )); do
    if livekit_observability_ready; then
      mark_step 22
      ok "Prometheus/Grafana/Loki/Alertmanager and exporters are ready."
      return 0
    fi
    sleep 3
  done

  unmark_step 22
  warn "Observability did not become ready within the deadline."
  livekit_report_observability_failure
  return 1
}

airgap_status() {
  title
  new_log "airgap-status-internal-ip"
  local root
  root="$(airgap_current_root 2>/dev/null || true)"
  printf 'Air-Gap mode   : INTERNAL-IP ONLY\n'
  printf 'Server IPv4    : %s\n' "${AIRGAP_SERVER_IP:-NOT CONFIGURED}"
  if [[ -n "${AIRGAP_SERVER_IP:-}" ]]; then
    printf 'Web / API      : http://%s/\n' "$AIRGAP_SERVER_IP"
    printf 'Supabase direct: http://%s:8000/\n' "$AIRGAP_SERVER_IP"
    printf 'PostgreSQL     : %s:5432 (Supavisor session)\n' "$AIRGAP_SERVER_IP"
    printf 'LiveKit        : ws://%s:7880\n' "$AIRGAP_SERVER_IP"
    printf 'TURN           : turn:%s:443?transport=udp (LiveKit embedded after step 20)\n' "$AIRGAP_SERVER_IP"
  fi
  if [[ -z "$root" ]]; then
    printf 'Bundle          : NOT ACTIVE\n'
    return 0
  fi
  printf 'Bundle          : %s\n' "$root"
  printf 'Bundle ID       : %s\n' "$(airgap_meta_from "$root" BUNDLE_ID)"
  printf 'Target          : Ubuntu %s / %s\n' "$(airgap_meta_from "$root" UBUNTU_VERSION)" "$(airgap_meta_from "$root" ARCH)"
  printf 'DNS required    : NO\n'
  printf 'Public IP req.  : NO\n'
  printf 'Local TLS req.  : NO\n'
  printf 'Checksums       : '
  if airgap_validate_checksum_manifest "$root" >/dev/null 2>&1; then printf 'OK\n'; else printf 'FAILED\n'; fi
  if [[ -x "$AIRGAP_REAL_DOCKER" ]]; then
    printf 'Docker images   : '
    if airgap_verify_images "$root"; then printf 'READY\n'; else printf 'INCOMPLETE\n'; fi
  fi
}
