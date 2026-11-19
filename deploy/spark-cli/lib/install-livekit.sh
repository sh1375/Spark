# LiveKit installation / lifecycle module for Spark Server Manager.
# Loaded after the core platform modules. It adds install steps 19-22 and
# operational actions without changing the existing Supabase deployment model.

LIVEKIT_ROOT="${LIVEKIT_ROOT:-/opt/spark-livekit}"
LIVEKIT_SOURCE_DIR="${SCRIPT_DIR}/livekit"
LIVEKIT_ENV="${LIVEKIT_ROOT}/.env"
LIVEKIT_TURN_CERT_DIR="${LIVEKIT_ROOT}/certs/turn"
LIVEKIT_RENEW_HOOK="/etc/letsencrypt/renewal-hooks/deploy/spark-livekit-turn.sh"
LIVEKIT_RTC_MIN_PORT="50000"
LIVEKIT_RTC_MAX_PORT="60000"
LIVEKIT_TURN_UDP_PORT="443"
LIVEKIT_TURN_TLS_PORT="5349"
LIVEKIT_ICE_TCP_PORT="7881"
LIVEKIT_INTERNAL_API_PORT="7880"
LIVEKIT_RTMP_PORT="1935"
LIVEKIT_WHIP_UDP_PORT="7885"

livekit_compose() {
  docker compose \
    -f "${LIVEKIT_ROOT}/docker-compose.yml" \
    -f "${LIVEKIT_ROOT}/docker-compose.spark-cli.yml" \
    --env-file "$LIVEKIT_ENV" "$@"
}

livekit_observability_compose() {
  livekit_compose --profile observability "$@"
}

livekit_observability_service_state() {
  local service="$1"
  livekit_observability_compose ps --format json "$service" 2>/dev/null | python3 -c '
import json,sys
raw=sys.stdin.read().strip()
if not raw: raise SystemExit(1)
try: v=json.loads(raw)
except json.JSONDecodeError: v=json.loads(raw.splitlines()[-1])
if isinstance(v,list): v=v[0] if v else {}
print(str(v.get("State","")).lower()+("/"+str(v.get("Health","")).lower() if v.get("Health") else ""))
'
}

livekit_env_value() {
  env_get "$LIVEKIT_ENV" "$1"
}

livekit_is_placeholder() {
  local value="${1:-}"
  [[ "$value" == "replace-me" || "$value" == replace-* ]] && return 0
  is_placeholder_value "$value"
}

livekit_require_env() {
  local key value
  for key in \
    LIVEKIT_DOMAIN LIVEKIT_TURN_DOMAIN LIVEKIT_INGRESS_DOMAIN LIVEKIT_API_KEY LIVEKIT_API_SECRET \
    S3_ACCESS_KEY S3_SECRET_KEY S3_REGION S3_BUCKET \
    LIVEKIT_SERVER_IMAGE LIVEKIT_EGRESS_IMAGE LIVEKIT_INGRESS_IMAGE REDIS_IMAGE CADDY_IMAGE MINIO_IMAGE MINIO_MC_IMAGE \
    PROMETHEUS_IMAGE ALERTMANAGER_IMAGE GRAFANA_IMAGE LOKI_IMAGE ALLOY_IMAGE NODE_EXPORTER_IMAGE BLACKBOX_EXPORTER_IMAGE \
    GRAFANA_ADMIN_USER GRAFANA_ADMIN_PASSWORD; do
    value="$(livekit_env_value "$key")"
    [[ -n "$value" ]] || { echo "Missing LiveKit env: $key" >>"$CURRENT_LOG"; return 1; }
    livekit_is_placeholder "$value" && { echo "Placeholder LiveKit env: $key" >>"$CURRENT_LOG"; return 1; }
  done
  [[ "$(stat -c '%a' "$LIVEKIT_ENV")" == "600" ]] || return 1
}

livekit_domain_resolves_to_public_ip() {
  local domain="$1" resolved
  resolved="$(getent ahostsv4 "$domain" 2>>"$CURRENT_LOG" | awk '{print $1}' | sort -u || true)"
  printf '%s -> %s\n' "$domain" "$resolved" >>"$CURRENT_LOG"
  grep -Fxq "$TURN_PUBLIC_IP" <<<"$resolved"
}

livekit_test_dns() {
  livekit_domain_resolves_to_public_ip "$(livekit_env_value LIVEKIT_DOMAIN)" || return 1
  livekit_domain_resolves_to_public_ip "$(livekit_env_value LIVEKIT_TURN_DOMAIN)" || return 1
  livekit_domain_resolves_to_public_ip "$(livekit_env_value LIVEKIT_INGRESS_DOMAIN)" || return 1
}

livekit_sync_assets() {
  require_dir "$LIVEKIT_SOURCE_DIR" || return 1
  require_file "${LIVEKIT_SOURCE_DIR}/docker-compose.yml" || return 1
  require_file "${LIVEKIT_SOURCE_DIR}/Caddyfile" || return 1
  require_file "${LIVEKIT_SOURCE_DIR}/redis.conf" || return 1
  mkdir -p "$LIVEKIT_ROOT"
  rsync -a --delete \
    --exclude '.env' \
    --exclude 'certs/' \
    "${LIVEKIT_SOURCE_DIR}/" "${LIVEKIT_ROOT}/"
}

livekit_copy_turn_certificate() {
  local cert_dir
  cert_dir="$(cert_live_dir_for_domain "$(livekit_env_value LIVEKIT_TURN_DOMAIN)")" || return 1
  install -d -m 0700 "$LIVEKIT_TURN_CERT_DIR"
  install -m 0600 "${cert_dir}/fullchain.pem" "${LIVEKIT_TURN_CERT_DIR}/fullchain.pem"
  install -m 0600 "${cert_dir}/privkey.pem" "${LIVEKIT_TURN_CERT_DIR}/privkey.pem"
  openssl x509 -in "${LIVEKIT_TURN_CERT_DIR}/fullchain.pem" -noout -checkend 86400 >/dev/null 2>&1
}

livekit_ensure_secret() {
  local key="$1" generator="$2" current
  current="$(livekit_env_value "$key")"
  if [[ -z "$current" ]] || livekit_is_placeholder "$current"; then
    env_set "$LIVEKIT_ENV" "$key" "$(eval "$generator")"
  fi
}

livekit_configure_local_recording_storage() {
  env_set "$LIVEKIT_ENV" S3_REGION "us-east-1"
  env_set "$LIVEKIT_ENV" S3_ENDPOINT "http://127.0.0.1:9000"
  env_set "$LIVEKIT_ENV" S3_BUCKET "spark-conference-recordings"
  livekit_ensure_secret S3_ACCESS_KEY "printf 'SPK%s' \"\$(openssl rand -hex 12)\""
  livekit_ensure_secret S3_SECRET_KEY "openssl rand -hex 32"
}

test_livekit_config() {
  require_file "${LIVEKIT_ROOT}/docker-compose.yml" || { echo "LiveKit config failed: missing docker-compose.yml" >>"$CURRENT_LOG"; return 1; }
  require_file "${LIVEKIT_ROOT}/docker-compose.spark-cli.yml" || { echo "LiveKit config failed: missing docker-compose.spark-cli.yml" >>"$CURRENT_LOG"; return 1; }
  require_file "$LIVEKIT_ENV" || { echo "LiveKit config failed: missing .env" >>"$CURRENT_LOG"; return 1; }
  require_file "${LIVEKIT_TURN_CERT_DIR}/fullchain.pem" || { echo "LiveKit config failed: missing TURN fullchain.pem" >>"$CURRENT_LOG"; return 1; }
  require_file "${LIVEKIT_TURN_CERT_DIR}/privkey.pem" || { echo "LiveKit config failed: missing TURN privkey.pem" >>"$CURRENT_LOG"; return 1; }
  livekit_require_env || { echo "LiveKit config failed: required environment" >>"$CURRENT_LOG"; return 1; }
  livekit_test_dns || { echo "LiveKit config failed: DNS" >>"$CURRENT_LOG"; return 1; }
  [[ "$(livekit_env_value S3_ENDPOINT)" == "http://127.0.0.1:9000" ]] || { echo "LiveKit config failed: local MinIO endpoint" >>"$CURRENT_LOG"; return 1; }
  livekit_compose config --quiet >>"$CURRENT_LOG" 2>&1 || { echo "LiveKit config failed: docker compose config" >>"$CURRENT_LOG"; return 1; }

}


livekit_write_nginx_bootstrap() {
  cat >/etc/nginx/sites-available/spark-livekit <<EOF
server {
    listen 80;
    server_name $(livekit_env_value LIVEKIT_DOMAIN) $(livekit_env_value LIVEKIT_INGRESS_DOMAIN);
    location ^~ /.well-known/acme-challenge/ { root /var/www/acme; }
    location / { return 404; }
}
EOF
  ln -sfn /etc/nginx/sites-available/spark-livekit /etc/nginx/sites-enabled/spark-livekit
}

livekit_issue_certificates() {
  mkdir -p /var/www/acme
  local meet ingress
  meet="$(livekit_env_value LIVEKIT_DOMAIN)"
  ingress="$(livekit_env_value LIVEKIT_INGRESS_DOMAIN)"
  certbot certonly --webroot -w /var/www/acme -d "$meet" --email "$LE_EMAIL" --agree-tos --non-interactive --keep-until-expiring || return 1
  certbot certonly --webroot -w /var/www/acme -d "$ingress" --email "$LE_EMAIL" --agree-tos --non-interactive --keep-until-expiring || return 1
  cert_live_dir_for_domain "$meet" >/dev/null || return 1
  cert_live_dir_for_domain "$ingress" >/dev/null || return 1
}

livekit_patch_frontend_csp() {
  local file=/etc/nginx/sites-available/spark domain
  [[ -f "$file" ]] || return 0
  domain="$(livekit_env_value LIVEKIT_DOMAIN)"
  FILE="$file" LIVEKIT_CSP_DOMAIN="$domain" python3 - <<'PY'
from pathlib import Path
import os
p=Path(os.environ['FILE']); d=os.environ['LIVEKIT_CSP_DOMAIN']
s=p.read_text()
needle="connect-src 'self'"
addition=f" https://{d} wss://{d}"
if addition.strip() not in s:
    if needle not in s: raise SystemExit('CSP connect-src not found')
    s=s.replace(needle, needle+addition, 1)
p.write_text(s)
PY
}

livekit_write_nginx_production() {
  local meet ingress meet_cert ingress_cert
  meet="$(livekit_env_value LIVEKIT_DOMAIN)"
  ingress="$(livekit_env_value LIVEKIT_INGRESS_DOMAIN)"
  meet_cert="$(cert_live_dir_for_domain "$meet")" || return 1
  ingress_cert="$(cert_live_dir_for_domain "$ingress")" || return 1
  cat >/etc/nginx/sites-available/spark-livekit <<EOF
server {
    listen 80;
    server_name ${meet} ${ingress};
    location ^~ /.well-known/acme-challenge/ { root /var/www/acme; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl http2;
    server_name ${meet};
    ssl_certificate ${meet_cert}/fullchain.pem;
    ssl_certificate_key ${meet_cert}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    location / {
        proxy_pass http://127.0.0.1:7880;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
server {
    listen 443 ssl http2;
    server_name ${ingress};
    ssl_certificate ${ingress_cert}/fullchain.pem;
    ssl_certificate_key ${ingress_cert}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    client_max_body_size 0;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 3600s;
    }
}
EOF
  ln -sfn /etc/nginx/sites-available/spark-livekit /etc/nginx/sites-enabled/spark-livekit
  livekit_patch_frontend_csp
}

livekit_prepare_nginx_tls() {
  livekit_write_nginx_bootstrap || return 1
  nginx -t || return 1
  systemctl reload nginx || return 1
  livekit_issue_certificates || return 1
  livekit_write_nginx_production || return 1
  nginx -t || return 1
  systemctl reload nginx || return 1
}

install_step_19() {
  title
  new_log "install-19-livekit-config"
  require_manager_values || return 1
  require_file "${SUPABASE_ROOT}/.env" || return 1
  require_dir "$LIVEKIT_SOURCE_DIR" || return 1

  run_logged "Sync LiveKit deployment assets" livekit_sync_assets || return 1
  [[ -f "$LIVEKIT_ENV" ]] || cp "${LIVEKIT_ROOT}/.env.example" "$LIVEKIT_ENV"
  chmod 600 "$LIVEKIT_ENV"
  # Upgrade existing LiveKit env files created before local MinIO support.
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

  local value
  env_set "$LIVEKIT_ENV" LIVEKIT_DOMAIN "meet.${APP_DOMAIN}"
  env_set "$LIVEKIT_ENV" LIVEKIT_TURN_DOMAIN "$TURN_DOMAIN"
  env_set "$LIVEKIT_ENV" LIVEKIT_INGRESS_DOMAIN "ingress.${APP_DOMAIN}"

  [[ -n "$(livekit_env_value LIVEKIT_REDIS_ADDRESS)" ]] || env_set "$LIVEKIT_ENV" LIVEKIT_REDIS_ADDRESS "127.0.0.1:6379"
  livekit_ensure_secret LIVEKIT_API_KEY "printf 'LK%s' \"\$(openssl rand -hex 12)\""
  livekit_ensure_secret LIVEKIT_API_SECRET "openssl rand -hex 32"
  livekit_configure_local_recording_storage || return 1
  chmod 600 "$LIVEKIT_ENV"

  info "DNS All three domains LiveKit must before proceeding to ${TURN_PUBLIC_IP} point out."
  run_logged "Validate LiveKit DNS" livekit_test_dns || {
    fail "DNS related to meet/turn/ingress still to Public IP This server does not point."
    unmark_step 19
    return 1
  }

  run_logged "Provision LiveKit Nginx + TLS" livekit_prepare_nginx_tls || {
    fail "TLS/Nginx related to LiveKit not ready."
    unmark_step 19
    return 1
  }

  run_logged "Copy TURN TLS certificate for embedded LiveKit TURN" livekit_copy_turn_certificate || {
    fail "Certificate Valid for LiveKit TURN domain not found."
    unmark_step 19
    return 1
  }

  if run_logged "Validate LiveKit config" test_livekit_config; then
    mark_step 19
  else
    unmark_step 19
    return 1
  fi
}

livekit_install_certbot_hook() {
  install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
  cat >"$LIVEKIT_RENEW_HOOK" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
ROOT=/opt/spark-livekit
[[ -f "$ROOT/.env" ]] || exit 0
getenv() { sed -n "s/^$1=//p" "$ROOT/.env" | tail -n1; }
TURN_DOMAIN="$(getenv LIVEKIT_TURN_DOMAIN)"
[[ -n "$TURN_DOMAIN" ]] || exit 0
CERT_DIR=""
for d in "/etc/letsencrypt/live/$TURN_DOMAIN" /etc/letsencrypt/live/"$TURN_DOMAIN"-*; do
  [[ -f "$d/fullchain.pem" && -f "$d/privkey.pem" ]] || continue
  CERT_DIR="$d"; break
done
[[ -n "$CERT_DIR" ]] || exit 1
install -d -m 0700 "$ROOT/certs/turn"
install -m 0600 "$CERT_DIR/fullchain.pem" "$ROOT/certs/turn/fullchain.pem"
install -m 0600 "$CERT_DIR/privkey.pem" "$ROOT/certs/turn/privkey.pem"
docker compose -f "$ROOT/docker-compose.yml" --env-file "$ROOT/.env" restart livekit
EOF
  chmod 0750 "$LIVEKIT_RENEW_HOOK"
}

livekit_firewall_rules() {
  # Signaling/API is reached only through the TLS reverse proxy. Keep the
  # plaintext internal API explicitly closed to remote clients.
  ufw deny "${LIVEKIT_INTERNAL_API_PORT}/tcp"
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow "${LIVEKIT_TURN_UDP_PORT}/udp"
  ufw allow "${LIVEKIT_TURN_TLS_PORT}/tcp"
  ufw allow "${LIVEKIT_ICE_TCP_PORT}/tcp"
  ufw allow "${LIVEKIT_RTC_MIN_PORT}:${LIVEKIT_RTC_MAX_PORT}/udp"
  ufw allow "${LIVEKIT_RTMP_PORT}/tcp"
  ufw allow "${LIVEKIT_WHIP_UDP_PORT}/udp"
}

livekit_service_state() {
  local service="$1"
  livekit_compose ps --format json "$service" 2>/dev/null | python3 -c '
import json,sys
raw=sys.stdin.read().strip()
if not raw: raise SystemExit(1)
try: v=json.loads(raw)
except json.JSONDecodeError: v=json.loads(raw.splitlines()[-1])
if isinstance(v,list): v=v[0] if v else {}
print(str(v.get("State","")).lower()+("/"+str(v.get("Health","")).lower() if v.get("Health") else ""))
'
}

livekit_runtime_ready() {
  local service state
  for service in minio redis livekit egress ingress; do
    state="$(livekit_service_state "$service" 2>/dev/null || true)"
    [[ "$state" == running* ]] || return 1
    [[ "$state" != *unhealthy* && "$state" != *restarting* ]] || return 1
  done
  curl -fsS --connect-timeout 3 http://127.0.0.1:9000/minio/health/ready >/dev/null || return 1
  curl -fsS --connect-timeout 3 http://127.0.0.1:6789/metrics >/dev/null || return 1
  livekit_compose exec -T redis redis-cli -h 127.0.0.1 ping 2>/dev/null | grep -qx PONG || return 1
}

livekit_report_start_failure() {
  local service
  livekit_compose ps 2>&1 | tee -a "$CURRENT_LOG" || true
  for service in minio redis livekit egress ingress; do
    printf '\n--- %s ---\n' "$service" | tee -a "$CURRENT_LOG"
    livekit_compose logs --no-color --tail=100 "$service" 2>&1 | tee -a "$CURRENT_LOG" || true
  done
}

install_step_20() {
  title
  new_log "install-20-livekit-runtime"
  test_livekit_config || { fail "First step 19 LiveKit configuration complete the."; return 1; }

  local coturn_was_active=0
  systemctl is-active --quiet coturn 2>/dev/null && coturn_was_active=1
  if (( coturn_was_active )); then
    info "Coturn legacy to prevent conflict on TURN/TLS It stops; LiveKit embedded TURN It is an alternative."
    run_logged "Stop legacy Coturn" systemctl disable --now coturn || return 1
  fi

  if ! run_logged "Apply LiveKit firewall rules" livekit_firewall_rules; then
    (( coturn_was_active )) && systemctl enable --now coturn >/dev/null 2>&1 || true
    return 1
  fi
  run_logged "Install LiveKit certificate renewal hook" livekit_install_certbot_hook || return 1
  run_logged "Validate LiveKit Docker Compose" livekit_compose config --quiet || return 1
  run_logged "Pull pinned LiveKit images" livekit_compose pull || return 1

  if ! run_logged "Start LiveKit media platform + local MinIO storage" livekit_compose up -d; then
    livekit_compose down >/dev/null 2>&1 || true
    (( coturn_was_active )) && systemctl enable --now coturn >/dev/null 2>&1 || true
    unmark_step 20
    return 1
  fi

  run_logged "Ensure local recording bucket" livekit_compose run --rm minio-init || return 1

  info "waiting readiness services LiveKit + MinIO (Max 90 seconds)..."
  local deadline=$((SECONDS + 90))
  while (( SECONDS < deadline )); do
    if livekit_runtime_ready; then
      run_logged "Reload Supabase Functions with LiveKit secrets" bash -c "cd '$SUPABASE_ROOT' && docker compose up -d --force-recreate functions" || return 1
      mark_step 20
      ok "LiveKit Server/Redis/Egress/Ingress and Local MinIO are ready."
      return 0
    fi
    sleep 3
  done

  unmark_step 20
  warn "LiveKit within the deadline readiness not ready."
  livekit_report_start_failure
  livekit_compose down >/dev/null 2>&1 || true
  (( coturn_was_active )) && systemctl enable --now coturn >/dev/null 2>&1 || true
  return 1
}

livekit_public_tls_probe() {
  local domain="$1" code
  code="$(curl -sS --connect-timeout 8 -o /dev/null -w '%{http_code}' "https://${domain}/" || true)"
  [[ "$code" =~ ^[1-5][0-9][0-9]$ && "$code" != "000" ]]
}

livekit_turn_tls_probe() {
  local domain
  domain="$(livekit_env_value LIVEKIT_TURN_DOMAIN)"
  timeout 12 openssl s_client -connect "${domain}:${LIVEKIT_TURN_TLS_PORT}" -servername "$domain" -verify_return_error </dev/null 2>&1 \
    | grep -Eq 'Verification: OK|Verify return code: 0'
}

livekit_api_smoke() {
  local key secret token body
  key="$(livekit_env_value LIVEKIT_API_KEY)"
  secret="$(livekit_env_value LIVEKIT_API_SECRET)"
  token="$(LIVEKIT_API_KEY_VALUE="$key" LIVEKIT_API_SECRET_VALUE="$secret" python3 - <<'PY'
import base64,hashlib,hmac,json,os,time
def enc(v): return base64.urlsafe_b64encode(v).rstrip(b'=').decode()
now=int(time.time())
h=enc(json.dumps({'alg':'HS256','typ':'JWT'},separators=(',',':')).encode())
p=enc(json.dumps({'iss':os.environ['LIVEKIT_API_KEY_VALUE'],'sub':'spark-cli-health','nbf':now-5,'exp':now+60,'video':{'roomList':True}},separators=(',',':')).encode())
s=enc(hmac.new(os.environ['LIVEKIT_API_SECRET_VALUE'].encode(),f'{h}.{p}'.encode(),hashlib.sha256).digest())
print(f'{h}.{p}.{s}')
PY
)" || return 1
  body="$(curl -fsS --connect-timeout 5 \
    -H "Authorization: Bearer ${token}" \
    -H 'Content-Type: application/json' \
    -X POST http://127.0.0.1:7880/twirp/livekit.RoomService/ListRooms \
    --data '{}')" || return 1
  python3 -c 'import json,sys; json.loads(sys.stdin.read())' <<<"$body"
}

livekit_secret_leak_probe() {
  local secret
  secret="$(livekit_env_value LIVEKIT_API_SECRET)"
  [[ -n "$secret" ]] || return 1
  if [[ -d /var/www/spark ]] && grep -R -F -q -- "$secret" /var/www/spark 2>/dev/null; then
    return 1
  fi
  if [[ -d "${SPARK_ROOT}/dist" ]] && grep -R -F -q -- "$secret" "${SPARK_ROOT}/dist" 2>/dev/null; then
    return 1
  fi
}

livekit_internal_api_exposure_probe() {
  local ufw_status
  ufw_status="$(ufw status verbose 2>/dev/null || true)"
  grep -q 'Status: active' <<<"$ufw_status" || return 1
  grep -Eq 'Default: deny \(incoming\)' <<<"$ufw_status" || return 1
  grep -Eq "^${LIVEKIT_INTERNAL_API_PORT}(/tcp)?[[:space:]]+DENY" <<<"$ufw_status" || return 1
  ! grep -Eq "^${LIVEKIT_INTERNAL_API_PORT}(/tcp)?[[:space:]]+ALLOW" <<<"$ufw_status" || return 1

  # The reverse proxy must still reach the internal API locally.
  curl -fsS --connect-timeout 3 "http://127.0.0.1:${LIVEKIT_INTERNAL_API_PORT}/" >/dev/null || return 1
}

livekit_secret_file_permissions_probe() {
  [[ "$(stat -c '%a' "$LIVEKIT_ENV")" == "600" ]] || return 1
  [[ "$(stat -c '%a' "${LIVEKIT_TURN_CERT_DIR}/fullchain.pem")" == "600" ]] || return 1
  [[ "$(stat -c '%a' "${LIVEKIT_TURN_CERT_DIR}/privkey.pem")" == "600" ]] || return 1
}

test_livekit_full_validation() {
  test_livekit_config || return 1
  if ! livekit_runtime_ready; then
    printf 'LiveKit validation failed: runtime readiness\n' >>"$CURRENT_LOG"
    livekit_report_start_failure
    return 1
  fi

  local sockets
  sockets="$(ss -lntup)" || return 1
  grep -Eq ':7881\b' <<<"$sockets" || return 1
  grep -Eq ':5349\b' <<<"$sockets" || return 1
  grep -Eq ':443\b' <<<"$sockets" || return 1
  grep -Eq ':1935\b' <<<"$sockets" || return 1
  grep -Eq ':7885\b' <<<"$sockets" || return 1
  grep -Eq '127\.0\.0\.1:9000\b' <<<"$sockets" || return 1
  curl -fsS --connect-timeout 3 http://127.0.0.1:9000/minio/health/ready >/dev/null || return 1

  livekit_public_tls_probe "$(livekit_env_value LIVEKIT_DOMAIN)" || return 1
  livekit_public_tls_probe "$(livekit_env_value LIVEKIT_INGRESS_DOMAIN)" || return 1
  turnutils_stunclient "$(livekit_env_value LIVEKIT_TURN_DOMAIN)" -p "$LIVEKIT_TURN_UDP_PORT" >/dev/null 2>&1 || return 1
  livekit_turn_tls_probe || return 1
  livekit_api_smoke || return 1
  livekit_secret_leak_probe || return 1
  livekit_secret_file_permissions_probe || return 1
  livekit_internal_api_exposure_probe || return 1
  ! systemctl is-active --quiet coturn 2>/dev/null || return 1

  local ufw_status
  ufw_status="$(ufw status 2>/dev/null || true)"
  grep -q 'Status: active' <<<"$ufw_status" || return 1
  grep -Eq '443/udp' <<<"$ufw_status" || return 1
  grep -Eq '7881/tcp' <<<"$ufw_status" || return 1
  grep -Eq '50000:60000/udp' <<<"$ufw_status" || return 1
}

install_step_21() {
  title
  new_log "install-21-livekit-validation"
  if run_visible "LiveKit end-to-end server validation" test_livekit_full_validation; then
    mark_step 21
  else
    unmark_step 21
    return 1
  fi
}


livekit_write_observability_targets() {
  local api_url meet_url ingress_url target_file
  api_url="https://${API_DOMAIN}/auth/v1/health"
  meet_url="https://$(livekit_env_value LIVEKIT_DOMAIN)"
  ingress_url="https://$(livekit_env_value LIVEKIT_INGRESS_DOMAIN)"
  target_file="${LIVEKIT_ROOT}/monitoring/targets/blackbox.json"

  install -d -m 0755 "$(dirname "$target_file")"
  cat >"$target_file" <<EOF
[
  {
    "targets": ["${api_url}"],
    "labels": {"probe": "spark-api"}
  },
  {
    "targets": ["${meet_url}"],
    "labels": {"probe": "livekit-public"}
  },
  {
    "targets": ["${ingress_url}"],
    "labels": {"probe": "ingress-public"}
  }
]
EOF
  chmod 0644 "$target_file"
  python3 -m json.tool "$target_file" >/dev/null
}

livekit_observability_config_ready() {
  local file
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
    require_file "${LIVEKIT_ROOT}/$file" || return 1
  done

  python3 -m json.tool "${LIVEKIT_ROOT}/monitoring/targets/blackbox.json" >/dev/null || return 1
  python3 -m json.tool "${LIVEKIT_ROOT}/monitoring/grafana/dashboards/spark-livekit-overview.json" >/dev/null || return 1
  python3 -m json.tool "${LIVEKIT_ROOT}/monitoring/grafana/dashboards/spark-livekit-operations.json" >/dev/null || return 1
  livekit_observability_compose config --quiet >>"$CURRENT_LOG" 2>&1
}

livekit_observability_ready() {
  local service state
  for service in prometheus alertmanager loki alloy node-exporter blackbox-exporter grafana; do
    state="$(livekit_observability_service_state "$service" 2>/dev/null || true)"
    [[ "$state" == running* ]] || return 1
    [[ "$state" != *unhealthy* && "$state" != *restarting* ]] || return 1
  done

  curl -fsS --connect-timeout 3 http://127.0.0.1:9090/-/ready >/dev/null || return 1
  curl -fsS --connect-timeout 3 http://127.0.0.1:9093/-/ready >/dev/null || return 1
  curl -fsS --connect-timeout 3 http://127.0.0.1:3100/ready >/dev/null || return 1
  curl -fsS --connect-timeout 3 http://127.0.0.1:12345/-/ready >/dev/null || return 1
  curl -fsS --connect-timeout 3 http://127.0.0.1:9100/metrics >/dev/null || return 1
  curl -fsS --connect-timeout 3 http://127.0.0.1:9115/metrics >/dev/null || return 1
  curl -fsS --connect-timeout 3 http://127.0.0.1:3000/api/health >/dev/null || return 1

  local listeners
  listeners="$(ss -lnt)" || return 1
  for port in 3000 9090 9093 3100 12345 9100 9115; do
    grep -Eq "127\.0\.0\.1:${port}\b" <<<"$listeners" || return 1
    ! grep -Eq "(0\.0\.0\.0|\[::\]):${port}\b" <<<"$listeners" || return 1
  done

  local result
  result="$(curl -fsSG --connect-timeout 3     --data-urlencode 'query=min(up{job=~"livekit|livekit-egress|livekit-ingress|node|blackbox-exporter|alloy|loki"})'     http://127.0.0.1:9090/api/v1/query)" || return 1
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

livekit_report_observability_failure() {
  local service
  livekit_observability_compose ps 2>&1 | tee -a "$CURRENT_LOG" || true
  for service in prometheus alertmanager loki alloy node-exporter blackbox-exporter grafana; do
    printf '\n--- %s ---\n' "$service" | tee -a "$CURRENT_LOG"
    livekit_observability_compose logs --no-color --tail=100 "$service" 2>&1 | tee -a "$CURRENT_LOG" || true
  done
}

install_step_22() {
  title
  new_log "install-22-livekit-observability"
  test_livekit_full_validation || {
    fail "First step 21 LiveKit validation complete the."
    return 1
  }

  run_logged "Generate observability HTTP targets" livekit_write_observability_targets || return 1
  livekit_observability_config_ready || {
    fail "Configuration Observability not valid."
    unmark_step 22
    return 1
  }

  run_logged "Pull pinned observability images" livekit_observability_compose pull || return 1
  if ! run_logged "Start Prometheus/Grafana/Loki/Alertmanager observability"     livekit_observability_compose up -d prometheus alertmanager loki alloy node-exporter blackbox-exporter grafana; then
    livekit_report_observability_failure
    unmark_step 22
    return 1
  fi

  info "waiting readiness Observability (Max 90 seconds)..."
  local deadline=$((SECONDS + 90))
  while (( SECONDS < deadline )); do
    if livekit_observability_ready; then
      mark_step 22
      ok "Prometheus/Grafana/Loki/Alertmanager and exporters Phase 22 are ready."
      return 0
    fi
    sleep 3
  done

  unmark_step 22
  warn "Observability within the deadline readiness not ready."
  livekit_report_observability_failure
  return 1
}

livekit_status_report() {
  new_log "livekit-status"
  run_report "LiveKit Docker status" livekit_compose ps
  if [[ -f "${STEP_DIR}/22.ok" ]]; then
    run_report "LiveKit observability Docker status" livekit_observability_compose ps
  fi
  run_report "LiveKit listening ports" bash -c "ss -lntup | grep -E ':(443|5349|7880|7881|1935|7885|6787|6788|6789|3000|9090|9093|3100|12345|9100|9115)\\b|:500[0-9]{2}\\b' || true"
  run_report "LiveKit full validation" test_livekit_full_validation
  if [[ -f "${STEP_DIR}/22.ok" ]]; then
    run_report "LiveKit observability" livekit_observability_ready
  fi
}

livekit_restart() {
  new_log "livekit-restart"
  test_livekit_config || { fail "LiveKit config not valid."; return 1; }
  run_visible "Restart LiveKit media platform" livekit_compose up -d --force-recreate || return 1
  if [[ -f "${STEP_DIR}/22.ok" ]]; then
    run_logged "Restart LiveKit observability" livekit_observability_compose up -d --force-recreate || return 1
  fi
  run_logged "Ensure local recording bucket" livekit_compose run --rm minio-init || return 1
  local deadline=$((SECONDS + 60))
  while (( SECONDS < deadline )); do
    if livekit_runtime_ready; then
      if [[ -f "${STEP_DIR}/22.ok" ]]; then
        livekit_observability_ready || { sleep 2; continue; }
      fi
      ok "LiveKit is ready."
      return 0
    fi
    sleep 2
  done
  livekit_report_start_failure
  [[ -f "${STEP_DIR}/22.ok" ]] && livekit_report_observability_failure
  return 1
}

cleanup_livekit_runtime() {
  new_log "cleanup-livekit"
  if ! confirm_word "all LiveKit runtime including Redis volume, files Recording in MinIO, media state and Secrets /opt/spark-livekit is deleted. Spark/Supabase data It is not deleted." "DELETE-LIVEKIT"; then
    warn "delete LiveKit canceled."
    return 1
  fi
  livekit_cleanup_internal
  if [[ -f "${CONFIG_DIR}/functions-extra.env" ]]; then
    local key
    for key in LIVEKIT_URL LIVEKIT_WS_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET RECORDING_STORAGE_BUCKET RECORDING_STORAGE_REGION RECORDING_STORAGE_ACCESS_KEY RECORDING_STORAGE_SECRET_KEY RECORDING_STORAGE_ENDPOINT; do
      FILE="${CONFIG_DIR}/functions-extra.env" KEY="$key" python3 - <<'PY'
import os
from pathlib import Path
p=Path(os.environ['FILE']); key=os.environ['KEY']
if not p.exists(): raise SystemExit(0)
out=[]
for line in p.read_text().splitlines():
    if line.strip().startswith(key+'='): continue
    out.append(line)
p.write_text('\n'.join(out)+'\n')
PY
    done
  fi
  if [[ -f "${SUPABASE_ROOT}/docker-compose.yml" ]]; then
    (cd "$SUPABASE_ROOT" && docker compose up -d --force-recreate functions) >>"$CURRENT_LOG" 2>&1 || true
  fi
  systemctl enable --now coturn >/dev/null 2>&1 || true
  ok "LiveKit runtime was deleted and Coturn legacy Reactivated if available."
}


# Extend the established 18-step manager to 22 without rewriting Supabase modules.
eval "$(declare -f installation_step_name | sed '1s/installation_step_name/installation_step_name_legacy/')"
eval "$(declare -f installation_step_probe | sed '1s/installation_step_probe/installation_step_probe_legacy/')"
eval "$(declare -f create_backup | sed '1s/create_backup/create_backup_legacy/')"

installation_step_name() {
  case "$1" in
    19) printf 'LiveKit configuration / TLS / secrets' ;;
    20) printf 'LiveKit SFU / Redis / Egress / Ingress / TURN' ;;
    21) printf 'LiveKit end-to-end validation' ;;
    22) printf 'LiveKit observability / dashboards / alerts' ;;
    *) installation_step_name_legacy "$1" ;;
  esac
}

installation_step_probe() {
  case "$1" in
    19) test_livekit_config ;;
    20) livekit_runtime_ready ;;
    21) test_livekit_full_validation ;;
    22) livekit_observability_ready ;;
    *) installation_step_probe_legacy "$1" ;;
  esac
}

installation_status_report() {
  local n name actual history formatted
  local installed=() missing=()
  [[ -n "${CURRENT_LOG:-}" ]] || new_log "installation-status"
  printf 'Spark installation status — actual server probe\n'
  printf '%s\n' '----------------------------------------------------------------------------'
  printf '%-4s %-15s %-9s %s\n' 'No.' 'Actual' 'History' 'Component'
  printf '%s\n' '----------------------------------------------------------------------------'
  for n in $(seq 1 22); do
    printf -v formatted '%02d' "$n"
    name="$(installation_step_name "$n")"
    if installation_step_probe "$n" >/dev/null 2>&1; then actual='INSTALLED'; installed+=("$formatted"); else actual='NOT INSTALLED'; missing+=("$formatted"); fi
    [[ -f "${STEP_DIR}/${n}.ok" ]] && history='DONE' || history='-'
    printf '%-4s %-15s %-9s %s\n' "$formatted" "$actual" "$history" "$name"
  done
  printf '%s\n' '----------------------------------------------------------------------------'
  printf 'Installed     : %s\n' "${installed[*]:-none}"
  printf 'Not installed : %s\n' "${missing[*]:-none}"
  printf 'Total         : %d/22\n' "${#installed[@]}"
}

run_all_install() {
  local n formatted
  for n in $(seq 1 22); do
    if ! run_install_step "$n"; then printf -v formatted '%02d' "$n"; fail "Chain execution in step ${formatted} it stopped."; return 1; fi
  done
  ok "all 22 Installation step Spark + LiveKit were successfully implemented."
}

test_full_validation() {
  require_manager_values || return 1
  echo "== Supabase local =="
  test_auth_health_url "http://127.0.0.1:8000/auth/v1/health" || return 1
  echo "== Frontend =="
  curl -fIsS "https://${APP_DOMAIN}" || return 1
  echo "== API =="
  test_auth_health_url "https://${API_DOMAIN}/auth/v1/health" || return 1
  echo "== Docker =="
  compose ps || return 1
  echo "== Scheduler =="
  test_schedulers || return 1
  if [[ -f "$LIVEKIT_ENV" ]]; then
    echo "== LiveKit =="; test_livekit_full_validation || return 1
    if [[ -f "${STEP_DIR}/22.ok" ]]; then
      echo "== LiveKit Observability =="; livekit_observability_ready || return 1
    fi
  else
    echo "== Legacy TURN =="; test_turn || return 1
  fi
  echo "== DB / Studio exposure =="
  test_db_exposure || return 1
}

create_backup() {
  local kind="${1:-manual}" dest
  dest="$(create_backup_legacy "$kind")" || return 1
  if [[ -d "$LIVEKIT_ROOT" ]]; then
    mkdir -p "${dest}/config/livekit"
    [[ -f "$LIVEKIT_ENV" ]] && cp -a "$LIVEKIT_ENV" "${dest}/config/livekit/env"
    [[ -f "${LIVEKIT_ROOT}/docker-compose.yml" ]] && cp -a "${LIVEKIT_ROOT}/docker-compose.yml" "${dest}/config/livekit/docker-compose.yml"
    [[ -f "${LIVEKIT_ROOT}/docker-compose.spark-cli.yml" ]] && cp -a "${LIVEKIT_ROOT}/docker-compose.spark-cli.yml" "${dest}/config/livekit/docker-compose.spark-cli.yml"
    [[ -d "${LIVEKIT_ROOT}/monitoring" ]] && cp -a "${LIVEKIT_ROOT}/monitoring" "${dest}/config/livekit/monitoring"
    [[ -f /etc/nginx/sites-available/spark-livekit ]] && cp -a /etc/nginx/sites-available/spark-livekit "${dest}/config/livekit/nginx-spark-livekit"
    chmod -R go-rwx "${dest}/config/livekit"
  fi
  printf '%s\n' "$dest"
}

livekit_cleanup_firewall_internal() {
  ufw status 2>/dev/null | grep -q 'Status: active' || return 0
  set +e
  ufw --force delete deny 7880/tcp >/dev/null 2>&1
  ufw --force delete allow 443/udp >/dev/null 2>&1
  ufw --force delete allow 7881/tcp >/dev/null 2>&1
  ufw --force delete allow 50000:60000/udp >/dev/null 2>&1
  ufw --force delete allow 1935/tcp >/dev/null 2>&1
  ufw --force delete allow 7885/udp >/dev/null 2>&1
  set -e
}

livekit_unpatch_frontend_csp() {
  local file=/etc/nginx/sites-available/spark domain
  [[ -f "$file" ]] || return 0
  domain="$(livekit_env_value LIVEKIT_DOMAIN 2>/dev/null || true)"
  [[ -n "$domain" ]] || domain="meet.${APP_DOMAIN}"
  FILE="$file" LIVEKIT_CSP_DOMAIN="$domain" python3 - <<'PY'
from pathlib import Path
import os
p=Path(os.environ['FILE']); d=os.environ['LIVEKIT_CSP_DOMAIN']
s=p.read_text()
s=s.replace(f" https://{d} wss://{d}", "")
p.write_text(s)
PY
}

livekit_cleanup_internal() {
  local meet="" ingress=""
  if [[ -f "$LIVEKIT_ENV" ]]; then
    meet="$(livekit_env_value LIVEKIT_DOMAIN)"; ingress="$(livekit_env_value LIVEKIT_INGRESS_DOMAIN)"
    livekit_observability_compose down --volumes --remove-orphans >>"${CURRENT_LOG:-/dev/null}" 2>&1 || true
  fi
  livekit_unpatch_frontend_csp
  livekit_unpatch_frontend_csp
  rm -rf -- "$LIVEKIT_ROOT"
  rm -f "$LIVEKIT_RENEW_HOOK" /etc/nginx/sites-enabled/spark-livekit /etc/nginx/sites-available/spark-livekit
  livekit_cleanup_firewall_internal
  if command -v certbot >/dev/null 2>&1; then
    [[ -n "$meet" ]] && certbot delete --cert-name "$meet" --non-interactive >>"${CURRENT_LOG:-/dev/null}" 2>&1 || true
    [[ -n "$ingress" ]] && certbot delete --cert-name "$ingress" --non-interactive >>"${CURRENT_LOG:-/dev/null}" 2>&1 || true
  fi
  rm -f "${STEP_DIR}/19.ok" "${STEP_DIR}/20.ok" "${STEP_DIR}/21.ok" "${STEP_DIR}/22.ok"
  if command -v nginx >/dev/null 2>&1 && nginx -t >>"${CURRENT_LOG:-/dev/null}" 2>&1; then systemctl reload nginx >>"${CURRENT_LOG:-/dev/null}" 2>&1 || true; fi
}
