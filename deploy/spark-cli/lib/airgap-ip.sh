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
}

test_values() {
  require_manager_values
}

test_base_packages() {
  local cmd
  for cmd in docker nginx rsync jq python3 git openssl curl ip ss systemctl; do
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
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' http://accounts.google.com https://accounts.google.com; style-src 'self' 'unsafe-inline' http://accounts.google.com https://accounts.google.com; img-src 'self' data: blob: http: https:; font-src 'self' data:; connect-src 'self' http://${ip} ws://${ip} http://${ip}:8000 ws://${ip}:8000 http://accounts.google.com https://accounts.google.com http://oauth2.googleapis.com https://oauth2.googleapis.com; media-src 'self' blob:; worker-src 'self' blob:; frame-src 'self' http://accounts.google.com https://accounts.google.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self' http://accounts.google.com https://accounts.google.com; object-src 'none'; manifest-src 'self'" always;

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
  fail "Step 18 (UFW) was removed from offline installation. Use steps 1-15, 17 or 21."
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
    1) printf 'Internal server IPv4' ;;
    13) printf 'Validate HTTP origin (no certificates)' ;;
    17) printf 'Disable external certificate renewal' ;;
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
  if ! _airgap_edge_runtime_probe "$SUPABASE_ROOT"; then
    _airgap_edge_capture_logs "${BACKUP_DIR}/edge-runtime-step21-$(date -u +%Y%m%d-%H%M%S).log"
    return 1
  fi
  if run_visible "Validate offline Edge Function synchronization" test_function_sync; then
    mark_step 21
  else
    unmark_step 21
    return 1
  fi
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
