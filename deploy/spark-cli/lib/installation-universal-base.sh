#!/usr/bin/env bash
# Final installation contract for Spark.
#
# Goals:
# - no installation-time dependency on a specific Node.js/npm version;
# - always install the latest available connected packages;
# - no DNS/domain/certificate prerequisite;
# - frontend/API remain same-origin and accept any Host header that reaches Nginx.

eval "$(declare -f install_step_2 | sed '1s/install_step_2/install_step_2_universal_base/')"
eval "$(declare -f install_step_6 | sed '1s/install_step_6/install_step_6_universal_base/')"
eval "$(declare -f install_step_11 | sed '1s/install_step_11/install_step_11_universal_base/')"

spark_universal_is_airgap() {
  [[ "${SPARK_AIRGAP_CONTEXT:-0}" == "1" ]] && return 0
  declare -F airgap_is_active >/dev/null 2>&1 && airgap_is_active
}

spark_universal_local_ipv4() {
  local ip
  ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}')"
  [[ -n "$ip" ]] || ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [[ "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || return 1
  printf '%s\n' "$ip"
}

spark_universal_apply_compat_values() {
  local ip
  ip="${AIRGAP_SERVER_IP:-${TURN_PRIVATE_IP:-}}"
  [[ -n "$ip" ]] || ip="$(spark_universal_local_ipv4)" || return 1
  AIRGAP_SERVER_IP="$ip"
  TURN_PRIVATE_IP="$ip"
  TURN_PUBLIC_IP="${TURN_PUBLIC_IP:-$ip}"

  # Compatibility-only values for legacy helpers. They are never used to bind
  # the frontend/API public origin or Nginx server_name.
  APP_DOMAIN="$ip"
  WWW_DOMAIN="$ip"
  API_DOMAIN="$ip"
  LE_EMAIL=""
}

configure_values_interactive() {
  spark_universal_apply_compat_values || {
    fail "Unable to detect a local IPv4 address for installation."
    return 1
  }
  save_config
  info "Installation is host-agnostic. No DNS name or certificate email is required."
  info "Detected local IPv4 for internal service compatibility: $AIRGAP_SERVER_IP"
}

test_values() {
  spark_universal_apply_compat_values
}

require_manager_values() {
  test_values || {
    fail "Internal IP settings are not valid. Run installation step 01."
    return 1
  }
}

install_step_1() {
  title
  new_log "install-01-host-agnostic"
  configure_values_interactive || return 1
  # configure_values_interactive derives and persists the only required local
  # values; avoid immediately running the same validation a second time.
  mark_step 1
  ok "Host-agnostic installation configuration is ready."
}

spark_latest_node_major() {
  curl -fsSL --connect-timeout 15 --max-time 30 https://nodejs.org/dist/index.json |
    python3 -c 'import json,sys,re; data=json.load(sys.stdin)
for item in data:
 v=str(item.get("version",""))
 m=re.fullmatch(r"v(\d+)\.\d+\.\d+",v)
 if m:
  print(m.group(1)); break
else: raise SystemExit(1)'
}

test_base_packages() {
  local cmd
  for cmd in docker nginx rsync jq python3 git openssl curl node npm; do
    command -v "$cmd" >/dev/null 2>&1 || return 1
  done
  docker compose version >/dev/null 2>&1 || return 1
  node --version >/dev/null 2>&1 || return 1
  npm --version >/dev/null 2>&1 || return 1
  systemctl is-active --quiet docker || return 1
  systemctl is-active --quiet nginx || return 1
}

spark_install_latest_connected_packages() {
  local node_major
  node_major="$(spark_latest_node_major)" || {
    fail "Unable to resolve the latest Node.js release."
    return 1
  }
  info "Latest Node.js release track detected: ${node_major}.x"

  run_logged "Update Linux package indexes" apt-get update || return 1
  # Full OS upgrades belong to Linux System maintenance. Installation only
  # installs/upgrades the packages Spark actually requires so first startup is fast.
  run_logged "Install latest required base packages" apt-get install -y \
    ca-certificates curl git gnupg jq openssl ufw rsync python3 python3-yaml nginx certbot || return 1

  run_logged "Configure latest Docker repository" bash -c '
    set -Eeuo pipefail
    . /etc/os-release
    codename="${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}"
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    printf "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu %s stable\n" "$codename" >/etc/apt/sources.list.d/docker.list
  ' || return 1

  run_logged "Configure latest NodeSource track" env NODE_MAJOR="$node_major" bash -c '
    set -Eeuo pipefail
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
    chmod a+r /etc/apt/keyrings/nodesource.gpg
    printf "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_%s.x nodistro main\n" "$NODE_MAJOR" >/etc/apt/sources.list.d/nodesource.list
  ' || return 1

  run_logged "Install latest Docker and Node.js packages" bash -c \
    'apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin nodejs' || return 1
  run_logged "Install latest npm CLI" npm install -g npm@latest || return 1
  run_logged "Enable Docker and Nginx" systemctl enable --now docker nginx || return 1
}

install_step_2() {
  title
  new_log "install-02-latest-packages"

  if spark_universal_is_airgap; then
    install_step_2_universal_base || return 1
  else
    run_logged "Validate supported Ubuntu target" check_supported_ubuntu || return 1
    spark_install_latest_connected_packages || return 1
  fi

  if run_logged "Validate required tools without version pinning" test_base_packages; then
    mark_step 2
  else
    unmark_step 2
    return 1
  fi
}

spark_universal_env_valid() {
  local file="${SUPABASE_ROOT}/.env"
  [[ -f "$file" ]] || return 1
  test_extended_supabase_env_secrets_only || return 1
  [[ "$(env_get "$file" SUPABASE_PUBLIC_URL)" == "http://127.0.0.1:8000" ]] || return 1
  [[ "$(env_get "$file" API_EXTERNAL_URL)" == "http://127.0.0.1:8000/auth/v1" ]] || return 1
  [[ "$(env_get "$file" SITE_URL)" == "http://127.0.0.1" ]] || return 1
  [[ "$(env_get "$file" PHONE_LOGIN_ALLOWED_ORIGINS)" == "same-origin" ]] || return 1
}

test_complete_supabase_env() {
  if [[ "${SPARK_UNIVERSAL_ENV_BOOTSTRAP:-0}" == "1" ]]; then
    test_extended_supabase_env_secrets_only
    return
  fi
  spark_universal_env_valid
}

spark_universal_rewrite_public_env() {
  local file="${SUPABASE_ROOT}/.env"
  env_set "$file" SUPABASE_PUBLIC_URL "http://127.0.0.1:8000"
  env_set "$file" API_EXTERNAL_URL "http://127.0.0.1:8000/auth/v1"
  env_set "$file" SITE_URL "http://127.0.0.1"
  env_set "$file" ADDITIONAL_REDIRECT_URLS "http://127.0.0.1/*"
  env_set "$file" PROXY_DOMAIN "127.0.0.1"
  env_set "$file" CERTBOT_EMAIL ""
  env_set "$file" PHONE_LOGIN_ALLOWED_ORIGINS "same-origin"
  chmod 600 "$file"
}

install_step_6() {
  spark_universal_apply_compat_values || return 1
  SPARK_UNIVERSAL_ENV_BOOTSTRAP=1 install_step_6_universal_base || return 1
  spark_universal_rewrite_public_env || return 1
  if run_logged "Validate host-agnostic Supabase environment" spark_universal_env_valid; then
    mark_step 6
  else
    unmark_step 6
    return 1
  fi
}

application_prepare_frontend_env() {
  local root="$1" anon
  anon="$(env_get "${SUPABASE_ROOT}/.env" ANON_KEY)"
  [[ -n "$anon" ]] || { fail "ANON_KEY not available; frontend build stopped."; return 1; }
  env_set "${root}/.env.production" VITE_SUPABASE_URL "http://127.0.0.1"
  env_set "${root}/.env.production" VITE_SUPABASE_ANON_KEY "$anon"
  chmod 600 "${root}/.env.production"
}

application_frontend_health() {
  curl --noproxy '*' -fIsS --connect-timeout 5 --max-time 10 \
    -H 'Host: spark.local' http://127.0.0.1/ >/dev/null
}

install_step_11() {
  title
  new_log "install-11-frontend-same-origin"

  if spark_universal_is_airgap; then
    install_step_11_universal_base || return 1
    return 0
  fi

  local anon
  anon="$(env_get "${SUPABASE_ROOT}/.env" ANON_KEY)"
  [[ -n "$anon" ]] || { fail "ANON_KEY is missing."; return 1; }
  env_set "${SPARK_ROOT}/.env.production" VITE_SUPABASE_URL "http://127.0.0.1"
  env_set "${SPARK_ROOT}/.env.production" VITE_SUPABASE_ANON_KEY "$anon"
  chmod 600 "${SPARK_ROOT}/.env.production"
  run_logged "Install current application dependency lock" bash -c "cd '$SPARK_ROOT' && npm ci" || return 1
  run_logged "Build current same-origin application" bash -c "cd '$SPARK_ROOT' && npm run build" || return 1
  run_logged "Validate frontend build security" test_frontend_build_security || return 1
  mkdir -p /var/www/spark
  run_logged "Deploy frontend" rsync -a --delete "${SPARK_ROOT}/dist/" /var/www/spark/ || return 1
  chown -R www-data:www-data /var/www/spark
  if run_logged "Validate frontend artifacts" test_frontend_deploy; then mark_step 11; else unmark_step 11; return 1; fi
}

spark_universal_write_nginx() {
  cat >/etc/nginx/sites-available/spark <<'EOF_NGINX'
limit_req_zone $binary_remote_addr zone=spark_auth_limit:10m rate=10r/s;

map $http_upgrade $spark_connection_upgrade {
    default upgrade;
    '' close;
}
map $http_x_forwarded_proto $spark_forwarded_proto {
    default $http_x_forwarded_proto;
    '' $scheme;
}
map $http_x_forwarded_host $spark_forwarded_host {
    default $http_x_forwarded_host;
    '' $host;
}

server {
    listen 80 default_server;
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
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://accounts.google.com; img-src 'self' data: blob: http: https:; font-src 'self' data:; connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com; media-src 'self' blob:; worker-src 'self' blob:; frame-src 'self' https://accounts.google.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self' https://accounts.google.com; object-src 'none'; manifest-src 'self'" always;

    location ^~ /realtime/v1/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $spark_connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $spark_forwarded_host;
        proxy_set_header X-Forwarded-Proto $spark_forwarded_proto;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 3600s;
    }

    location ^~ /functions/v1/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $spark_forwarded_host;
        proxy_set_header X-Forwarded-Proto $spark_forwarded_proto;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location ~ ^/auth/v1/(token|signup|recover|otp|verify|resend)$ {
        limit_req zone=spark_auth_limit burst=30 nodelay;
        limit_req_status 429;
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $spark_forwarded_host;
        proxy_set_header X-Forwarded-Proto $spark_forwarded_proto;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /auth/v1/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $spark_forwarded_host;
        proxy_set_header X-Forwarded-Proto $spark_forwarded_proto;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location ^~ /rest/v1/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $spark_forwarded_host;
        proxy_set_header X-Forwarded-Proto $spark_forwarded_proto;
    }

    location ^~ /storage/v1/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $spark_forwarded_host;
        proxy_set_header X-Forwarded-Proto $spark_forwarded_proto;
    }

    location ^~ /graphql/v1 {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $spark_forwarded_host;
        proxy_set_header X-Forwarded-Proto $spark_forwarded_proto;
    }

    location /assets/ { try_files $uri =404; expires 30d; }
    location = /sw.js { try_files $uri =404; expires -1; etag on; }
    location = /pwa-bootstrap.js { try_files $uri =404; expires -1; }
    location / { try_files $uri $uri/ /index.html; expires -1; }
}
EOF_NGINX

  ln -sfn /etc/nginx/sites-available/spark /etc/nginx/sites-enabled/spark
  rm -f /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/spark-bootstrap /etc/nginx/sites-enabled/spark-livekit
}

spark_universal_auth_health() {
  local anon
  anon="$(env_get "${SUPABASE_ROOT}/.env" ANON_KEY)"
  [[ -n "$anon" ]] || return 1
  curl --noproxy '*' -fsS --connect-timeout 5 --max-time 10 \
    -H 'Host: arbitrary.spark.example' \
    -H "apikey: $anon" \
    -H "Authorization: Bearer $anon" \
    http://127.0.0.1/auth/v1/health >/dev/null
}

spark_universal_test_nginx() {
  systemctl is-active --quiet nginx || return 1
  curl --noproxy '*' -fIsS --connect-timeout 5 --max-time 10 \
    -H 'Host: arbitrary.spark.example' http://127.0.0.1/ >/dev/null
}

install_step_12() {
  title
  new_log "install-12-host-agnostic-nginx"
  spark_apply_nginx_gzip_profile || return 1
  spark_universal_write_nginx || return 1
  run_logged "Nginx syntax" nginx -t || return 1
  run_logged "Reload Nginx" systemctl reload nginx || return 1
  if run_logged "Validate wildcard-host frontend" spark_universal_test_nginx; then mark_step 12; else unmark_step 12; return 1; fi
}

install_step_13() {
  title
  new_log "install-13-external-tls"
  systemctl disable --now certbot.timer >/dev/null 2>&1 || true
  mark_step 13
  ok "No local DNS/TLS prerequisite. TLS may terminate at any upstream proxy/security device."
}

install_step_14() {
  title
  new_log "install-14-host-agnostic-nginx"
  # Step 12 already writes, syntax-checks, reloads and smoke-tests the same
  # host-agnostic configuration. Do not repeat that work in the normal chain.
  if [[ -f "${STEP_DIR}/12.ok" ]]; then
    spark_apply_nginx_gzip_profile || return 1
    run_logged "Nginx syntax" nginx -t || return 1
    run_logged "Reload Nginx" systemctl reload nginx || return 1
    mark_step 14
    ok "Host-agnostic Nginx and gzip profile are active."
    return 0
  fi

  # Standalone execution still self-heals by running the authoritative step.
  install_step_12 || return 1
  mark_step 14
}

install_step_17() {
  title
  new_log "install-17-no-certbot"
  systemctl disable --now certbot.timer >/dev/null 2>&1 || true
  rm -f /etc/systemd/system/certbot.service.d/spark-turn.conf
  systemctl daemon-reload || return 1
  mark_step 17
  ok "Certificate lifecycle is external to Spark installation."
}

test_full_validation() {
  require_manager_values || return 1
  echo "== Frontend wildcard host =="
  curl --noproxy '*' -fIsS -H 'Host: validation.spark.invalid' http://127.0.0.1/ || return 1
  echo "== Same-origin API =="
  spark_universal_auth_health || return 1
  echo "== Docker =="
  compose ps || return 1
  echo "== Scheduler =="
  test_schedulers || return 1
}

# -----------------------------------------------------------------------------
# Host-agnostic Supabase Studio access.
# Studio stays behind Nginx on 8443, but no DNS or Let's Encrypt certificate is
# required. A local self-signed certificate is generated once and reused.
# -----------------------------------------------------------------------------

SPARK_STUDIO_CERT_DIR="${CONFIG_DIR}/studio-tls"

spark_universal_studio_host() {
  printf '%s\n' "${TURN_PUBLIC_IP:-${AIRGAP_SERVER_IP:-${API_DOMAIN:-127.0.0.1}}}"
}

spark_universal_ensure_studio_cert() {
  local ip cert key
  ip="$(spark_universal_local_ipv4)" || ip="127.0.0.1"
  cert="${SPARK_STUDIO_CERT_DIR}/fullchain.pem"
  key="${SPARK_STUDIO_CERT_DIR}/privkey.pem"
  mkdir -p "$SPARK_STUDIO_CERT_DIR"
  chmod 700 "$SPARK_STUDIO_CERT_DIR"
  if [[ -s "$cert" && -s "$key" ]] && openssl x509 -in "$cert" -noout -checkend 86400 >/dev/null 2>&1; then
    return 0
  fi
  openssl req -x509 -nodes -newkey rsa:2048 -sha256 -days 825 \
    -keyout "$key" -out "$cert" \
    -subj '/CN=Spark Supabase Studio' \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:${ip}" >/dev/null 2>&1 || return 1
  chmod 600 "$key"
  chmod 644 "$cert"
}

write_supabase_studio_gateway() {
  spark_universal_ensure_studio_cert || return 1
  cat >/etc/nginx/sites-available/spark-supabase-admin <<EOF_NGINX
server {
    listen 8443 ssl default_server;
    server_name _;
    server_tokens off;

    ssl_certificate ${SPARK_STUDIO_CERT_DIR}/fullchain.pem;
    ssl_certificate_key ${SPARK_STUDIO_CERT_DIR}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$spark_connection_upgrade;
        proxy_set_header Host 127.0.0.1:8000;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 3600s;
    }
}
EOF_NGINX
}

studio_external_is_open() {
  [[ -L /etc/nginx/sites-enabled/spark-supabase-admin ]] || return 1
  ss -lnt 2>/dev/null | grep -Eq '(^|[[:space:]])(0\.0\.0\.0|\*|\[::\]):8443[[:space:]]'
}

spark_universal_studio_health() {
  local dashboard_user dashboard_password
  dashboard_user="$(env_get "${SUPABASE_ROOT}/.env" DASHBOARD_USERNAME)"
  dashboard_password="$(env_get "${SUPABASE_ROOT}/.env" DASHBOARD_PASSWORD)"
  dashboard_user="${dashboard_user:-supabase}"
  [[ -n "$dashboard_password" ]] || return 1
  curl --noproxy '*' -fsSkL --connect-timeout 5 --max-time 15 \
    -u "${dashboard_user}:${dashboard_password}" \
    -H 'Host: studio.spark.local' https://127.0.0.1:8443/ -o /dev/null
}

spark_universal_enable_studio() {
  external_access_requirements || return 1
  [[ "$(docker inspect -f '{{.State.Running}}' supabase-studio 2>/dev/null || true)" == "true" ]] || {
    fail "supabase-studio container is not running."
    return 1
  }
  [[ -e /etc/nginx/sites-enabled/spark ]] || {
    fail "Production Nginx is not active."
    return 1
  }
  if studio_external_is_open && spark_universal_studio_health; then
    return 0
  fi
  firewall_optional_allow_port 8443 || return 1
  write_supabase_studio_gateway || return 1
  ln -sfn /etc/nginx/sites-available/spark-supabase-admin /etc/nginx/sites-enabled/spark-supabase-admin
  if ! nginx -t >>"$CURRENT_LOG" 2>&1 || ! systemctl reload nginx >>"$CURRENT_LOG" 2>&1; then
    rm -f /etc/nginx/sites-enabled/spark-supabase-admin
    firewall_optional_close_port 8443
    return 1
  fi
  if ! spark_universal_studio_health; then
    rm -f /etc/nginx/sites-enabled/spark-supabase-admin
    firewall_optional_close_port 8443
    nginx -t >>"$CURRENT_LOG" 2>&1 && systemctl reload nginx >>"$CURRENT_LOG" 2>&1 || true
    return 1
  fi
}

show_studio_connection_info() {
  local dashboard_user dashboard_password state host
  external_access_requirements || return 1
  dashboard_user="$(env_get "${SUPABASE_ROOT}/.env" DASHBOARD_USERNAME)"
  dashboard_password="$(env_get "${SUPABASE_ROOT}/.env" DASHBOARD_PASSWORD)"
  dashboard_user="${dashboard_user:-supabase}"
  [[ -n "$dashboard_password" ]] || { fail "DASHBOARD_PASSWORD not found."; return 1; }
  host="$(spark_universal_studio_host)"
  state="CLOSED"; studio_external_is_open && state="OPEN"
  printf '\n%s%sSupabase Studio access%s\n' "$C_BOLD" "$C_CYAN" "$C_RESET"
  printf '%s\n' '────────────────────────────────────────────────────────────'
  printf 'State    : %s\n' "$state"
  printf 'URL      : https://%s:8443\n' "$host"
  printf 'Username : %s\n' "$dashboard_user"
  printf 'Password : %s\n' "$dashboard_password"
  printf '%s\n' '────────────────────────────────────────────────────────────'
  warn "Studio uses a local self-signed certificate; direct browsers may show a trust warning."
}

open_supabase_studio_access() {
  local mode="${1:-interactive}" host
  host="$(spark_universal_studio_host)"
  if [[ "$mode" != "auto" ]]; then
    if ! confirm_word "Supabase Studio on https://${host}:8443 opens." "OPEN"; then
      warn "canceled."
      return 1
    fi
  fi
  spark_universal_enable_studio || {
    fail "Supabase Studio listener could not be enabled."
    return 1
  }
  ok "Supabase Studio is running and reachable on HTTPS/8443."
  [[ "$mode" == "auto" ]] || show_studio_connection_info
}

# Step 12 owns both public Nginx routes and the administrative Studio listener.
# Re-declare it here so a fresh install leaves Studio ready without a second
# manual action.
install_step_12() {
  title
  new_log "install-12-host-agnostic-nginx"
  spark_apply_nginx_gzip_profile || return 1
  spark_universal_write_nginx || return 1
  run_logged "Nginx syntax" nginx -t || return 1
  run_logged "Reload Nginx" systemctl reload nginx || return 1
  run_logged "Validate wildcard-host frontend" spark_universal_test_nginx || { unmark_step 12; return 1; }
  if ! open_supabase_studio_access auto; then
    unmark_step 12
    return 1
  fi
  mark_step 12
}
