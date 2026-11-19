# External WAF TLS termination support for air-gapped bank deployments.
# Loaded after airgap-runtime.sh so it can safely override only the offline path.

AIRGAP_WAF_CONF="${CONFIG_DIR}/airgap-waf.conf"

# Preserve the standard air-gap implementations before overriding them.
eval "$(declare -f airgap_full_preflight | sed '1s/airgap_full_preflight/airgap_full_preflight_local_tls/')"
eval "$(declare -f install_step_13 | sed '1s/install_step_13/install_step_13_local_tls/')"
eval "$(declare -f install_step_14 | sed '1s/install_step_14/install_step_14_local_tls/')"
eval "$(declare -f airgap_status | sed '1s/airgap_status/airgap_status_local_tls/')"

airgap_waf_conf_value() {
  local key="$1"
  [[ -f "$AIRGAP_WAF_CONF" ]] || return 0
  sed -n "s/^${key}=//p" "$AIRGAP_WAF_CONF" | tail -n1
}

airgap_waf_https_probe() {
  local domain="$1" result verify code
  [[ -n "$domain" ]] || return 1
  result="$(curl --noproxy '*' -sS -o /dev/null --connect-timeout 5 --max-time 10 \
    -w '%{ssl_verify_result} %{http_code}' "https://${domain}/" 2>/dev/null || true)"
  verify="${result%% *}"
  code="${result##* }"
  [[ "$verify" == "0" && "$code" =~ ^[1-5][0-9][0-9]$ && "$code" != "000" ]]
}

airgap_waf_persist_external_mode() {
  local reason="${1:-auto-detected}"
  install -d -m 0700 "$CONFIG_DIR"
  cat >"$AIRGAP_WAF_CONF" <<EOF
TLS_MODE=external_waf
MODE_REASON=${reason}
DETECTED_AT=$(date -Is)
EOF
  chmod 0600 "$AIRGAP_WAF_CONF"
}

airgap_waf_enable_explicit() {
  title
  new_log "airgap-enable-bank-waf"
  require_manager_values || return 1
  airgap_waf_persist_external_mode "operator-selected"
  systemctl disable --now certbot.timer >/dev/null 2>&1 || true

  printf 'Frontend WAF HTTPS : '
  if airgap_waf_https_probe "$APP_DOMAIN"; then printf 'VALID\n'; else printf 'NOT VERIFIED YET\n'; fi
  printf 'API WAF HTTPS      : '
  if airgap_waf_https_probe "$API_DOMAIN"; then printf 'VALID\n'; else printf 'NOT VERIFIED YET\n'; fi

  ok "Bank WAF TLS termination mode is now explicit and persistent."
  info "Steps 13/14 will not request or require local web/API certificates."
  info "Public URLs remain HTTPS; the Spark backend listens on HTTP behind the WAF."
}

airgap_waf_enabled() {
  local mode
  mode="$(airgap_waf_conf_value TLS_MODE)"
  case "$mode" in
    external_waf) return 0 ;;
    local) return 1 ;;
  esac

  # Conservative auto-detection remains as a convenience, but the explicit UI
  # action is authoritative for managed bank deployments where the WAF may not
  # return an application response until the backend has finished installing.
  if cert_live_dir_for_domain "${APP_DOMAIN:-}" >/dev/null 2>&1 \
      && cert_live_dir_for_domain "${API_DOMAIN:-}" >/dev/null 2>&1; then
    return 1
  fi
  if airgap_waf_https_probe "${APP_DOMAIN:-}" && airgap_waf_https_probe "${API_DOMAIN:-}"; then
    airgap_waf_persist_external_mode "auto-detected"
    info "Detected valid external HTTPS termination for ${APP_DOMAIN} and ${API_DOMAIN}; using Bank WAF TLS mode."
    return 0
  fi
  return 1
}

airgap_full_preflight() {
  local root="$1"
  if ! airgap_waf_enabled; then
    airgap_full_preflight_local_tls "$root"
    return
  fi
  airgap_validate_bundle_dir "$root" || return 1
  airgap_validate_target_compatibility "$root" || return 1
  airgap_verify_images "$root" || { fail "One or more Docker images have not been imported."; return 1; }
  ok "External Bank WAF terminates HTTPS; local certificate-pack requirement is disabled for web/API."
}

install_step_13() {
  if ! airgap_waf_enabled; then
    install_step_13_local_tls "$@"
    return
  fi
  title
  new_log "install-13-external-waf"
  require_manager_values || return 1
  systemctl disable --now certbot.timer >/dev/null 2>&1 || true
  mark_step 13
  ok "TLS is terminated by the Bank WAF; no local frontend/API certificate is installed."
}

airgap_waf_write_nginx_production() {
  cat >/etc/nginx/sites-available/spark <<EOF
server_tokens off;

limit_req_zone \$binary_remote_addr zone=spark_auth_limit:10m rate=10r/s;

map \$http_upgrade \$spark_connection_upgrade {
    default upgrade;
    '' close;
}

# Bank WAF terminates HTTPS and forwards plain HTTP to this backend.
server {
    listen 80;
    server_name ${APP_DOMAIN} ${WWW_DOMAIN};

    root /var/www/spark;
    index index.html;

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
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://accounts.google.com; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://${API_DOMAIN} wss://${API_DOMAIN} https://meet.${APP_DOMAIN} wss://meet.${APP_DOMAIN} https://accounts.google.com https://oauth2.googleapis.com; media-src 'self' blob:; worker-src 'self' blob:; frame-src 'self' https://accounts.google.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self' https://accounts.google.com; object-src 'none'; manifest-src 'self'; upgrade-insecure-requests" always;

    location /assets/ { try_files \$uri =404; expires 30d; }
    location = /sw.js { try_files \$uri =404; expires -1; etag on; }
    location = /pwa-bootstrap.js { try_files \$uri =404; expires -1; }
    location / { try_files \$uri \$uri/ /index.html; expires -1; }
}

server {
    listen 80;
    server_name ${API_DOMAIN};
    client_max_body_size 50m;

    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "no-referrer" always;

    location ^~ /realtime/v1/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$spark_connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 3600s;
    }

    location ^~ /functions/v1/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    location ~ ^/auth/v1/(token|signup|recover|otp|verify|resend)$ {
        limit_req zone=spark_auth_limit burst=30 nodelay;
        limit_req_status 429;
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    location /auth/v1/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    location ^~ /rest/v1/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto https;
    }
    location ^~ /storage/v1/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto https;
    }
    location ^~ /graphql/v1 {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto https;
    }
    location / { return 404; }
}

EOF
  ln -sfn /etc/nginx/sites-available/spark /etc/nginx/sites-enabled/spark
  rm -f /etc/nginx/sites-enabled/spark-bootstrap
}

airgap_waf_test_nginx() {
  local app_headers api_headers
  nginx -t || return 1
  systemctl is-active --quiet nginx || return 1
  [[ -L /etc/nginx/sites-enabled/spark ]] || return 1
  app_headers="$(curl --noproxy '*' -sSI --connect-timeout 5 --max-time 10 -H "Host: ${APP_DOMAIN}" http://127.0.0.1/)" || return 1
  grep -Eqi '^X-Content-Type-Options:[[:space:]]*nosniff' <<<"$app_headers" || return 1
  grep -Eqi '^X-Frame-Options:[[:space:]]*SAMEORIGIN' <<<"$app_headers" || return 1
  grep -Eqi '^Content-Security-Policy:' <<<"$app_headers" || return 1
  api_headers="$(curl --noproxy '*' -sSI --connect-timeout 5 --max-time 10 -H "Host: ${API_DOMAIN}" http://127.0.0.1/ || true)"
  grep -Eqi '^X-Content-Type-Options:[[:space:]]*nosniff' <<<"$api_headers" || return 1
}

install_step_14() {
  if ! airgap_waf_enabled; then
    install_step_14_local_tls "$@"
    return
  fi
  title
  new_log "install-14-external-waf-nginx"
  require_manager_values || return 1
  local old=""
  [[ -f /etc/nginx/sites-available/spark ]] && old="$(mktemp)" && cp -a /etc/nginx/sites-available/spark "$old"
  spark_apply_nginx_gzip_profile || return 1
  airgap_waf_write_nginx_production || return 1
  if nginx -t >>"$CURRENT_LOG" 2>&1 && systemctl reload nginx >>"$CURRENT_LOG" 2>&1 && airgap_waf_test_nginx >>"$CURRENT_LOG" 2>&1; then
    [[ -n "$old" ]] && rm -f "$old"
    mark_step 14
    ok "Nginx backend is ready behind external Bank WAF TLS termination."
    return 0
  fi
  restore_previous_nginx_production "$old"
  [[ -n "$old" ]] && rm -f "$old"
  unmark_step 14
  fail "External-WAF Nginx backend validation failed."
  return 1
}

airgap_status() {
  airgap_status_local_tls
  printf 'TLS termination : %s\n' "$(airgap_waf_enabled >/dev/null 2>&1 && echo 'EXTERNAL BANK WAF' || echo 'LOCAL')"
}
