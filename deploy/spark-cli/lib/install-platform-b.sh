write_nginx_bootstrap() {
  cat >/etc/nginx/sites-available/spark-bootstrap <<EOF
server {
    listen 80;
    server_name ${APP_DOMAIN} ${WWW_DOMAIN} ${API_DOMAIN};
    server_tokens off;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/acme;
    }

    location / {
        return 404;
    }
}
EOF
}

install_step_12() {
  title
  new_log "install-12-nginx-bootstrap"
  require_manager_values || return 1
  spark_apply_nginx_gzip_profile || return 1
  mkdir -p /var/www/acme
  chown -R www-data:www-data /var/www/acme
  if [[ -L /etc/nginx/sites-enabled/spark ]]; then
    warn "Nginx Production It is already active; Bootstrap It is not replaced."
    if run_logged "Nginx syntax" nginx -t; then mark_step 12; return 0; else return 1; fi
  fi
  write_nginx_bootstrap
  ln -sfn /etc/nginx/sites-available/spark-bootstrap /etc/nginx/sites-enabled/spark-bootstrap
  rm -f /etc/nginx/sites-enabled/default
  run_logged "Nginx syntax" nginx -t || return 1
  run_logged "Reload Nginx" systemctl reload nginx || return 1
  if systemctl is-active --quiet nginx; then mark_step 12; ok "Bootstrap Nginx is active."; else return 1; fi
}

cert_live_dir_for_domain() {
  local domain="$1" dir
  for dir in "/etc/letsencrypt/live/${domain}" /etc/letsencrypt/live/"${domain}"-*; do
    [[ -d "$dir" ]] || continue
    [[ -f "$dir/fullchain.pem" && -f "$dir/privkey.pem" ]] || continue
    openssl x509 -in "$dir/fullchain.pem" -noout -checkend 0 >/dev/null 2>&1 || continue
    if openssl x509 -in "$dir/fullchain.pem" -noout -ext subjectAltName 2>/dev/null \
      | grep -Eq "(^|[[:space:],])DNS:${domain}([[:space:],]|$)"; then
      printf '%s\n' "$dir"
      return 0
    fi
  done
  return 1
}

test_certificates() {
  certbot certificates || return 1
  cert_live_dir_for_domain "$APP_DOMAIN" >/dev/null || return 1
  cert_live_dir_for_domain "$API_DOMAIN" >/dev/null || return 1
}

install_step_13() {
  title
  new_log "install-13-certificates"
  require_manager_values || return 1
  test_values || { fail "Domain settings are not valid; First step 01 – Configuration correct the."; return 1; }
  run_logged "Certificate domain Frontend" certbot certonly --webroot -w /var/www/acme -d "$APP_DOMAIN" -d "$WWW_DOMAIN" --email "$LE_EMAIL" --agree-tos --non-interactive --keep-until-expiring || return 1
  run_logged "Certificate domain API" certbot certonly --webroot -w /var/www/acme -d "$API_DOMAIN" --email "$LE_EMAIL" --agree-tos --non-interactive --keep-until-expiring || return 1
  if run_logged "test Certificates" test_certificates; then
    mark_step 13
  else
    unmark_step 13
    return 1
  fi
}

write_nginx_production() {
  local app_cert_dir api_cert_dir
  app_cert_dir="$(cert_live_dir_for_domain "$APP_DOMAIN")" || {
    fail "Certificate Valid for ${APP_DOMAIN} not found."
    return 1
  }
  api_cert_dir="$(cert_live_dir_for_domain "$API_DOMAIN")" || {
    fail "Certificate Valid for ${API_DOMAIN} not found."
    return 1
  }

  cat >/etc/nginx/sites-available/spark <<EOF
# Per-IP protection for authentication endpoints. The burst is intentionally
# generous for corporate NATs while still bounding brute-force floods.
limit_req_zone \$binary_remote_addr zone=spark_auth_limit:10m rate=10r/s;

map \$http_upgrade \$spark_connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 80;
    server_name ${APP_DOMAIN} ${WWW_DOMAIN} ${API_DOMAIN};

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/acme;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name ${APP_DOMAIN} ${WWW_DOMAIN};
    server_tokens off;

    ssl_certificate ${app_cert_dir}/fullchain.pem;
    ssl_certificate_key ${app_cert_dir}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;

    root /var/www/spark;
    index index.html;

    # Compress textual frontend assets. Hashed JS/CSS are the dominant mobile
    # payload; fonts/images are already compressed and intentionally excluded.
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

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(self), microphone=(self), geolocation=(), display-capture=(self)" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://accounts.google.com; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://${API_DOMAIN} wss://${API_DOMAIN} https://meet.${APP_DOMAIN} wss://meet.${APP_DOMAIN} https://accounts.google.com https://oauth2.googleapis.com; media-src 'self' blob:; worker-src 'self' blob:; frame-src 'self' https://accounts.google.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self' https://accounts.google.com; object-src 'none'; manifest-src 'self'; upgrade-insecure-requests" always;

    # Do not use add_header for cache directives here: defining add_header in a
    # child location would suppress inherited security headers on Nginx 1.24.
    location /assets/ {
        try_files \$uri =404;
        expires 30d;
    }

    location = /sw.js {
        try_files \$uri =404;
        expires -1;
        etag on;
    }

    location = /pwa-bootstrap.js {
        try_files \$uri =404;
        expires -1;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
        expires -1;
    }
}

server {
    listen 443 ssl http2;
    server_name ${API_DOMAIN};
    server_tokens off;

    ssl_certificate ${api_cert_dir}/fullchain.pem;
    ssl_certificate_key ${api_cert_dir}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;

    client_max_body_size 50m;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "no-referrer" always;

    location ^~ /realtime/v1/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$spark_connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600s;
    }

    location ^~ /functions/v1/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    location ~ ^/auth/v1/(token|signup|recover|otp|verify|resend)$ {
        limit_req zone=spark_auth_limit burst=30 nodelay;
        limit_req_status 429;
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    location /auth/v1/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    location ^~ /rest/v1/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location ^~ /storage/v1/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location ^~ /graphql/v1 {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        return 404;
    }
}
EOF
}

test_nginx_production() {
  local app_headers sw_headers api_headers
  nginx -t || return 1
  systemctl is-active --quiet nginx || return 1
  [[ -L /etc/nginx/sites-enabled/spark ]] || return 1
  [[ ! -e /etc/nginx/sites-enabled/spark-bootstrap ]] || return 1

  app_headers="$(curl --noproxy '*' -sSI --connect-timeout 5 --max-time 10 --resolve "${APP_DOMAIN}:443:127.0.0.1" "https://${APP_DOMAIN}/")" || {
    echo "ERROR: local frontend HTTPS validation request failed" >>"$CURRENT_LOG"
    return 1
  }
  printf '\n=== Local frontend response headers ===\n%s\n' "$app_headers" >>"$CURRENT_LOG"
  grep -Eqi '^Strict-Transport-Security:[[:space:]]*max-age=31536000; includeSubDomains' <<<"$app_headers" || { echo "ERROR: missing/invalid HSTS header on frontend" >>"$CURRENT_LOG"; return 1; }
  grep -Eqi '^X-Content-Type-Options:[[:space:]]*nosniff' <<<"$app_headers" || { echo "ERROR: missing X-Content-Type-Options on frontend" >>"$CURRENT_LOG"; return 1; }
  grep -Eqi '^X-Frame-Options:[[:space:]]*SAMEORIGIN' <<<"$app_headers" || { echo "ERROR: missing X-Frame-Options on frontend" >>"$CURRENT_LOG"; return 1; }
  grep -Eqi '^Referrer-Policy:[[:space:]]*strict-origin-when-cross-origin' <<<"$app_headers" || { echo "ERROR: missing Referrer-Policy on frontend" >>"$CURRENT_LOG"; return 1; }
  grep -Eqi '^Permissions-Policy:[[:space:]]*camera=\(self\), microphone=\(self\)' <<<"$app_headers" || { echo "ERROR: missing/invalid Permissions-Policy on frontend" >>"$CURRENT_LOG"; return 1; }
  grep -Eqi '^Content-Security-Policy:' <<<"$app_headers" || { echo "ERROR: missing Content-Security-Policy on frontend" >>"$CURRENT_LOG"; return 1; }
  if grep -Eqi '^Server:[[:space:]]*[^[:space:]]*/[0-9]' <<<"$app_headers"; then
    echo "ERROR: web server version is exposed on frontend response" >>"$CURRENT_LOG"
    return 1
  fi

  sw_headers="$(curl --noproxy '*' -sSI --connect-timeout 5 --max-time 10 --resolve "${APP_DOMAIN}:443:127.0.0.1" "https://${APP_DOMAIN}/sw.js")" || {
    echo "ERROR: local service-worker HTTPS validation request failed" >>"$CURRENT_LOG"
    return 1
  }
  printf '\n=== Local service worker response headers ===\n%s\n' "$sw_headers" >>"$CURRENT_LOG"
  grep -Eqi '^Cache-Control:[[:space:]]*no-cache' <<<"$sw_headers" || { echo "ERROR: service worker is not served with Cache-Control: no-cache" >>"$CURRENT_LOG"; return 1; }
  grep -Eqi '^Content-Security-Policy:' <<<"$sw_headers" || { echo "ERROR: missing Content-Security-Policy on service worker" >>"$CURRENT_LOG"; return 1; }
  if grep -Eqi '^Server:[[:space:]]*[^[:space:]]*/[0-9]' <<<"$sw_headers"; then
    echo "ERROR: web server version is exposed on service-worker response" >>"$CURRENT_LOG"
    return 1
  fi

  api_headers="$(curl --noproxy '*' -sSI --connect-timeout 5 --max-time 10 --resolve "${API_DOMAIN}:443:127.0.0.1" "https://${API_DOMAIN}/")" || true
  printf '\n=== Local API response headers ===\n%s\n' "$api_headers" >>"$CURRENT_LOG"
  grep -Eqi '^Strict-Transport-Security:' <<<"$api_headers" || { echo "ERROR: missing HSTS header on API" >>"$CURRENT_LOG"; return 1; }
  grep -Eqi '^X-Content-Type-Options:[[:space:]]*nosniff' <<<"$api_headers" || { echo "ERROR: missing X-Content-Type-Options on API" >>"$CURRENT_LOG"; return 1; }
  if grep -Eqi '^Server:[[:space:]]*[^[:space:]]*/[0-9]' <<<"$api_headers"; then
    echo "ERROR: web server version is exposed on API response" >>"$CURRENT_LOG"
    return 1
  fi
}

wait_for_nginx_production() {
  local attempt
  for attempt in $(seq 1 20); do
    if test_nginx_production; then
      (( attempt > 1 )) && echo "Nginx production validation succeeded on attempt ${attempt}" >>"$CURRENT_LOG"
      return 0
    fi
    echo "Nginx production validation attempt ${attempt}/20 has not converged yet" >>"$CURRENT_LOG"
    sleep 0.5
  done
  echo "ERROR: Nginx production did not converge after reload validation window" >>"$CURRENT_LOG"
  return 1
}

restore_previous_nginx_production() {
  local old="$1"
  if [[ -n "$old" && -f "$old" ]]; then
    cp -a "$old" /etc/nginx/sites-available/spark
    ln -sfn /etc/nginx/sites-available/spark /etc/nginx/sites-enabled/spark
  else
    rm -f /etc/nginx/sites-enabled/spark /etc/nginx/sites-available/spark
  fi
  if nginx -t >>"$CURRENT_LOG" 2>&1; then
    systemctl reload nginx >>"$CURRENT_LOG" 2>&1 || true
  fi
}

install_step_14() {
  title
  new_log "install-14-nginx-production"
  require_manager_values || return 1
  test_certificates >>"$CURRENT_LOG" 2>&1 || { fail "Certificateare not ready; stage 13 – TLS certificates run the."; return 1; }
  spark_apply_nginx_gzip_profile || return 1
  local old=""
  if [[ -f /etc/nginx/sites-available/spark ]]; then
    old="$(mktemp)"
    cp -a /etc/nginx/sites-available/spark "$old"
  fi

  if ! write_nginx_production; then
    restore_previous_nginx_production "$old"
    rm -f "$old"
    return 1
  fi
  ln -sfn /etc/nginx/sites-available/spark /etc/nginx/sites-enabled/spark
  rm -f /etc/nginx/sites-enabled/spark-bootstrap


  if ! run_logged "Nginx production syntax" nginx -t; then
    restore_previous_nginx_production "$old"
    rm -f "$old"
    return 1
  fi

  if ! run_logged "Reload Nginx" systemctl reload nginx; then
    restore_previous_nginx_production "$old"
    rm -f "$old"
    return 1
  fi

  if run_logged "test Nginx Production" wait_for_nginx_production; then
    rm -f "$old"
    mark_step 14
  else
    warn "Validation New version Nginx It was unsuccessful; config previous restore will be."
    restore_previous_nginx_production "$old"
    rm -f "$old"
    unmark_step 14
    return 1
  fi
}

scheduler_timer_units() {
  printf '%s\n' \
    spark-daily-report.timer \
    spark-minutes-reminder.timer \
    spark-decision-due.timer \
    spark-notification-outbox.timer
}

scheduler_service_units() {
  printf '%s\n' \
    spark-daily-report.service \
    spark-minutes-reminder.service \
    spark-decision-due.service \
    spark-notification-outbox.service
}

remove_scheduler_units() {
  local unit

  while IFS= read -r unit; do
    [[ -n "$unit" ]] || continue
    systemctl disable --now "$unit" >/dev/null 2>&1 || true
    rm -f "/etc/systemd/system/${unit}"
  done < <(scheduler_timer_units)

  while IFS= read -r unit; do
    [[ -n "$unit" ]] || continue
    systemctl stop "$unit" >/dev/null 2>&1 || true
    rm -f "/etc/systemd/system/${unit}"
  done < <(scheduler_service_units)

  systemctl daemon-reload
  systemctl reset-failed >/dev/null 2>&1 || true
}

write_scheduler_units() {
  cat >/etc/systemd/system/spark-daily-report.service <<'EOF'
[Unit]
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
EnvironmentFile=/opt/spark-supabase/.env
ExecStart=/usr/bin/curl --fail --silent --show-error -X POST http://127.0.0.1:8000/functions/v1/send-daily-meetings -H content-type:application/json -H x-cron-secret:${DAILY_REPORT_CRON_SECRET} --data '{"scheduled":true}'
EOF
  cat >/etc/systemd/system/spark-daily-report.timer <<'EOF'
[Unit]
Description=Spark daily management report scheduler — exact minute clock

[Timer]
OnCalendar=*-*-* *:*:00 Asia/Tehran
Persistent=true
AccuracySec=1s
RandomizedDelaySec=0
Unit=spark-daily-report.service

[Install]
WantedBy=timers.target
EOF

  cat >/etc/systemd/system/spark-minutes-reminder.service <<'EOF'
[Unit]
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
EnvironmentFile=/opt/spark-supabase/.env
ExecStart=/usr/bin/curl --fail --silent --show-error -X POST http://127.0.0.1:8000/functions/v1/process-minutes-reminders -H content-type:application/json -H x-cron-secret:${MINUTES_REMINDER_CRON_SECRET} --data '{}'
EOF
  cat >/etc/systemd/system/spark-minutes-reminder.timer <<'EOF'
[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
Persistent=true

[Install]
WantedBy=timers.target
EOF

  cat >/etc/systemd/system/spark-decision-due.service <<'EOF'
[Unit]
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
EnvironmentFile=/opt/spark-supabase/.env
ExecStart=/usr/bin/curl --fail --silent --show-error -X POST http://127.0.0.1:8000/functions/v1/process-decision-due-overdue -H content-type:application/json -H x-cron-secret:${DECISION_DUE_CRON_SECRET} --data '{}'
EOF
  cat >/etc/systemd/system/spark-decision-due.timer <<'EOF'
[Timer]
OnBootSec=2min
OnUnitActiveSec=10min
Persistent=true

[Install]
WantedBy=timers.target
EOF

  cat >/etc/systemd/system/spark-notification-outbox.service <<'EOF'
[Unit]
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
EnvironmentFile=/opt/spark-supabase/.env
ExecStart=/usr/bin/curl --fail --silent --show-error -X POST http://127.0.0.1:8000/functions/v1/process-notification-outbox -H content-type:application/json -H x-cron-secret:${NOTIFICATION_OUTBOX_CRON_SECRET} --data '{}'
EOF
  cat >/etc/systemd/system/spark-notification-outbox.timer <<'EOF'
[Timer]
OnBootSec=2min
OnUnitActiveSec=1min
Persistent=true

[Install]
WantedBy=timers.target
EOF
}

test_schedulers() {
  local t
  grep -Fq 'OnCalendar=*-*-* *:*:00 Asia/Tehran' /etc/systemd/system/spark-daily-report.timer || return 1
  grep -Fq 'AccuracySec=1s' /etc/systemd/system/spark-daily-report.timer || return 1
  for t in spark-daily-report.timer spark-minutes-reminder.timer spark-decision-due.timer spark-notification-outbox.timer; do
    systemctl is-enabled --quiet "$t" || return 1
    systemctl is-active --quiet "$t" || return 1
  done
  systemctl list-timers 'spark-*' --no-pager || return 1
}

install_step_15() {
  title
  new_log "install-15-schedulers"

  run_logged "delete SchedulerThe previous ones" remove_scheduler_units || return 1
  run_logged "recreate Schedulers" write_scheduler_units || return 1
  run_logged "systemd daemon-reload" systemctl daemon-reload || return 1

  local t
  while IFS= read -r t; do
    [[ -n "$t" ]] || continue
    run_logged "Activation ${t}" systemctl enable --now "$t" || return 1
  done < <(scheduler_timer_units)

  if run_logged "test Schedulers" test_schedulers; then
    mark_step 15
  else
    unmark_step 15
    return 1
  fi
}