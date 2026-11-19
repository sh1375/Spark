# Air-gap installation overrides. Sourced by lib/airgap.sh.

# Preserve the standard LiveKit runtime step before Air-Gap adds content-store
# integrity checks. The online installer remains unchanged.
eval "$(declare -f install_step_20 | sed '1s/install_step_20/install_step_20_online/')"

airgap_cert_source_dir() {
  local root="$1" domain="$2" src="${1}/certificates/${2}"
  [[ -f "${src}/fullchain.pem" && -f "${src}/privkey.pem" ]] || return 1
  printf '%s\n' "$src"
}

airgap_certificate_has_domain() {
  local cert="$1" domain="$2"
  openssl x509 -in "$cert" -noout -ext subjectAltName 2>/dev/null \
    | grep -Eq "(^|[[:space:],])DNS:${domain}([[:space:],]|$)"
}

airgap_install_certificate() {
  local root="$1" domain="$2" extra_san="${3:-}" src dest
  src="$(airgap_cert_source_dir "$root" "$domain")" || { fail "Certificate pack missing for ${domain}."; return 1; }
  openssl x509 -in "${src}/fullchain.pem" -noout -checkend 86400 >/dev/null 2>&1 || {
    fail "Certificate for ${domain} is expired or expires within 24 hours."
    return 1
  }
  airgap_certificate_has_domain "${src}/fullchain.pem" "$domain" || { fail "Certificate SAN does not contain ${domain}."; return 1; }
  if [[ -n "$extra_san" ]]; then
    airgap_certificate_has_domain "${src}/fullchain.pem" "$extra_san" || { fail "Certificate SAN does not contain ${extra_san}."; return 1; }
  fi
  dest="/etc/letsencrypt/live/${domain}"
  install -d -m 0700 "$dest"
  install -m 0644 "${src}/fullchain.pem" "${dest}/fullchain.pem"
  install -m 0600 "${src}/privkey.pem" "${dest}/privkey.pem"
}

airgap_install_nginx_tls_options() {
  install -d -m 0755 /etc/letsencrypt
  if [[ ! -f /etc/letsencrypt/options-ssl-nginx.conf ]]; then
    cat >/etc/letsencrypt/options-ssl-nginx.conf <<'EOF_TLS'
ssl_session_cache shared:le_nginx_SSL:10m;
ssl_session_timeout 1440m;
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
EOF_TLS
    chmod 0644 /etc/letsencrypt/options-ssl-nginx.conf
  fi
}

airgap_full_preflight() {
  local root="$1" cert_pack
  airgap_validate_bundle_dir "$root" || return 1
  airgap_validate_target_compatibility "$root" || return 1
  cert_pack="$(airgap_meta_from "$root" CERTIFICATE_PACK)"
  [[ "$cert_pack" == "1" ]] || {
    fail "Complete offline installation requires TLS certificate pack for steps 13/19. Rebuild or augment the bundle with certificates."
    return 1
  }
  airgap_verify_images "$root" || { fail "One or more Docker images have not been imported."; return 1; }
}

install_step_2() {
  airgap_is_active || { install_step_2_online; return; }
  title
  new_log "install-02-packages-airgap"
  local root npm_tgz
  root="$(airgap_current_root)" || { fail "No active air-gap bundle."; return 1; }
  airgap_validate_target_compatibility "$root" || return 1
  run_visible "Install bundled Ubuntu/Docker/Node packages" airgap_install_local_debs "$root" || return 1
  npm_tgz="$(find "${root}/npm" -maxdepth 1 -type f -name 'npm-*.tgz' | sort | tail -n1)"
  [[ -n "$npm_tgz" ]] || { fail "Bundled npm package missing."; return 1; }
  run_visible "Install bundled npm" "$AIRGAP_REAL_NPM" install --offline --no-audit --no-fund -g "$npm_tgz" || return 1
  run_logged "Enable Docker and Nginx" systemctl enable --now docker nginx || return 1
  if run_logged "Validate offline base packages" test_base_packages; then mark_step 2; else unmark_step 2; return 1; fi
}

install_step_3() {
  airgap_is_active || { install_step_3_online; return; }
  title
  new_log "install-03-spark-repo-airgap"
  local root commit
  root="$(airgap_current_root)" || { fail "No active air-gap bundle."; return 1; }
  commit="$(airgap_meta_from "$root" SPARK_COMMIT)"
  run_logged "Restore Spark source from local Git bundle" airgap_restore_git_bundle \
    "${root}/sources/spark.git.bundle" "$SPARK_ROOT" main "$commit" "$REPO_URL" || return 1
  [[ "$(git -C "$SPARK_ROOT" rev-parse HEAD)" == "$commit" ]] || return 1
  run_logged "Install Spark Manager from local source" airgap_install_manager_local || return 1
  mark_step 3
}

install_step_4() {
  airgap_is_active || { install_step_4_online; return; }
  title
  new_log "install-04-supabase-source-airgap"
  local root commit branch ref runtime_ref
  root="$(airgap_current_root)" || { fail "No active air-gap bundle."; return 1; }
  commit="$(airgap_meta_from "$root" SUPABASE_COMMIT)"
  branch="$(airgap_meta_from "$root" SUPABASE_BRANCH)"
  ref="$(airgap_meta_from "$root" SUPABASE_REF)"
  [[ "$ref" =~ ^self-hosted/v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { fail "Bundle is missing its stable Supabase pin. Rebuild the bundle."; return 1; }
  if [[ -f "${SUPABASE_ROOT}/.env" ]]; then
    runtime_ref="$(spark_supabase_runtime_ref 2>/dev/null || true)"
    [[ "$runtime_ref" == "$ref" ]] || { fail "Existing Supabase runtime provenance differs from bundle ${ref}; refusing to replace its source/config."; return 1; }
  fi
  [[ -n "$branch" ]] || branch=master
  run_logged "Restore Supabase source from local Git bundle" airgap_restore_git_bundle \
    "${root}/sources/supabase.git.bundle" "$SUPABASE_SOURCE" "$branch" "$commit" "https://github.com/supabase/supabase.git" || return 1
  git -C "$SUPABASE_SOURCE" fetch "${root}/sources/supabase.git.bundle" "refs/tags/${ref}:refs/tags/${ref}" || return 1
  [[ "$(git -C "$SUPABASE_SOURCE" rev-list -n1 "$ref")" == "$commit" ]] || return 1

  if [[ -f "${SUPABASE_ROOT}/.env" ]]; then
    warn "Existing Supabase runtime preserved; only source snapshot was restored."
  else
    rm -rf "$SUPABASE_ROOT"
    mkdir -p "$SUPABASE_ROOT"
    run_logged "Copy bundled Supabase Docker snapshot" cp -a "${SUPABASE_SOURCE}/docker/." "$SUPABASE_ROOT/" || return 1
    run_logged "Create initial Supabase .env" cp "${SUPABASE_ROOT}/.env.example" "${SUPABASE_ROOT}/.env" || return 1
    chmod 0600 "${SUPABASE_ROOT}/.env"
    printf 'ref=%s\n' "$ref" >"${SUPABASE_ROOT}/.supabase-version"
  fi
  [[ "$(git -C "$SUPABASE_SOURCE" rev-parse HEAD)" == "$commit" ]] || return 1
  SUPABASE_REF="$ref"
  SUPABASE_COMMIT="$commit"
  save_config || return 1
  test_supabase_source || return 1
  mark_step 4
}

install_step_10() {
  airgap_is_active || { install_step_10_online; return; }
  title
  new_log "install-10-airgap-runtime"
  local root
  root="$(airgap_current_root)" || { fail "No active air-gap bundle."; return 1; }
  airgap_verify_images "$root" || { fail "Bundled Docker image set is incomplete."; return 1; }
  run_logged "Wire bundled Avatar Worker image" airgap_prepare_avatar_compose "$root" || return 1
  airgap_prepare_runtime_shims "$root"
  install_step_10_online
}

install_step_11() {
  airgap_is_active || { install_step_11_online; return; }
  local root
  root="$(airgap_current_root)" || { fail "No active air-gap bundle."; return 1; }
  airgap_require_file "${root}/npm/frontend-node-modules.tar.gz" || return 1
  airgap_prepare_runtime_shims "$root"
  install_step_11_online
}

install_step_13() {
  airgap_is_active || { install_step_13_online; return; }
  title
  new_log "install-13-certificates-airgap"
  require_manager_values || return 1
  local root
  root="$(airgap_current_root)" || { fail "No active air-gap bundle."; return 1; }
  run_logged "Install frontend TLS certificate from bundle" airgap_install_certificate "$root" "$APP_DOMAIN" "$WWW_DOMAIN" || return 1
  run_logged "Install API TLS certificate from bundle" airgap_install_certificate "$root" "$API_DOMAIN" || return 1
  run_logged "Install TURN TLS certificate from bundle" airgap_install_certificate "$root" "$TURN_DOMAIN" || return 1
  run_logged "Install local Nginx TLS options" airgap_install_nginx_tls_options || return 1
  mark_step 13
  ok "TLS certificates imported from verified offline bundle; no ACME request was made."
}

install_step_17() {
  airgap_is_active || { install_step_17_online; return; }
  title
  new_log "install-17-cert-renewal-airgap"
  require_manager_values || return 1
  mkdir -p /etc/systemd/system/certbot.service.d
  cat >/etc/systemd/system/certbot.service.d/spark-turn.conf <<EOF_CERTBOT
[Service]
ExecStartPost=/usr/bin/install -m 0640 -o turnserver -g turnserver /etc/letsencrypt/live/${TURN_DOMAIN}/fullchain.pem /etc/coturn/certs/fullchain.pem
ExecStartPost=/usr/bin/install -m 0640 -o turnserver -g turnserver /etc/letsencrypt/live/${TURN_DOMAIN}/privkey.pem /etc/coturn/certs/privkey.pem
ExecStartPost=/usr/bin/systemctl try-restart coturn.service
EOF_CERTBOT
  systemctl daemon-reload || return 1
  systemctl disable --now certbot.timer >/dev/null 2>&1 || true
  install -d -m 0700 "$CONFIG_DIR"
  printf 'Certificate renewal is external in air-gapped mode. Import a renewed certificate pack before expiry.\n' \
    >"${CONFIG_DIR}/airgap-certificate-renewal.txt"
  chmod 0600 "${CONFIG_DIR}/airgap-certificate-renewal.txt"
  mark_step 17
  warn "Certbot network renewal/dry-run is intentionally disabled in air-gapped mode; certificate rotation is an offline bundle operation."
}

livekit_prepare_nginx_tls() {
  airgap_is_active || { livekit_prepare_nginx_tls_online; return; }
  local root meet ingress
  root="$(airgap_current_root)" || return 1
  meet="$(livekit_env_value LIVEKIT_DOMAIN)"
  ingress="$(livekit_env_value LIVEKIT_INGRESS_DOMAIN)"
  livekit_write_nginx_bootstrap || return 1
  nginx -t || return 1
  systemctl reload nginx || return 1
  airgap_install_certificate "$root" "$meet" || return 1
  airgap_install_certificate "$root" "$ingress" || return 1
  airgap_install_nginx_tls_options || return 1
  livekit_write_nginx_production || return 1
  nginx -t || return 1
  systemctl reload nginx || return 1
}

livekit_public_tls_probe() {
  if airgap_is_active; then
    local domain="$1" code
    code="$(curl --noproxy '*' -sS --resolve "${domain}:443:127.0.0.1" --connect-timeout 8 -o /dev/null -w '%{http_code}' "https://${domain}/" || true)"
    [[ "$code" =~ ^[1-5][0-9][0-9]$ && "$code" != "000" ]]
    return
  fi
  livekit_public_tls_probe_online "$@"
}

livekit_turn_tls_probe() {
  if airgap_is_active; then
    local domain
    domain="$(livekit_env_value LIVEKIT_TURN_DOMAIN)"
    timeout 12 openssl s_client -connect "127.0.0.1:${LIVEKIT_TURN_TLS_PORT}" -servername "$domain" -verify_return_error </dev/null 2>&1 \
      | grep -Eq 'Verification: OK|Verify return code: 0'
    return
  fi
  livekit_turn_tls_probe_online "$@"
}

airgap_livekit_image_list() {
  local output="$1"
  livekit_compose config --images 2>>"${CURRENT_LOG:-/dev/null}" \
    | sed '/^[[:space:]]*$/d' | sort -u >"$output"
  [[ -s "$output" ]]
}

airgap_probe_image_container_create() {
  local image="$1" cid
  if [[ -n "${CURRENT_LOG:-}" ]]; then
    cid="$("$AIRGAP_REAL_DOCKER" create --pull=never --entrypoint /bin/true "$image" 2>>"$CURRENT_LOG")" || return 1
  else
    cid="$("$AIRGAP_REAL_DOCKER" create --pull=never --entrypoint /bin/true "$image" 2>/dev/null)" || return 1
  fi
  [[ -n "$cid" ]] || return 1
  "$AIRGAP_REAL_DOCKER" rm -f "$cid" >/dev/null 2>&1 || true
}

airgap_verify_image_list_container_create() {
  local list_file="$1" image failed=0
  [[ -f "$list_file" ]] || return 1
  while IFS= read -r image; do
    [[ -n "$image" ]] || continue
    if ! airgap_probe_image_container_create "$image"; then
      [[ -n "${CURRENT_LOG:-}" ]] && echo "Docker container-create probe failed for image: $image" >>"$CURRENT_LOG"
      failed=1
    fi
  done <"$list_file"
  (( failed == 0 ))
}

airgap_livekit_compose_create_probe() {
  local report="$1" rc
  : >"$report"
  if livekit_compose create --no-build --pull never >"$report" 2>&1; then
    [[ -n "${CURRENT_LOG:-}" ]] && cat "$report" >>"$CURRENT_LOG"
    livekit_compose rm -sf >>"${CURRENT_LOG:-/dev/null}" 2>&1 || true
    return 0
  else
    rc=$?
    [[ -n "${CURRENT_LOG:-}" ]] && cat "$report" >>"$CURRENT_LOG"
    livekit_compose rm -sf >>"${CURRENT_LOG:-/dev/null}" 2>&1 || true
    return "$rc"
  fi
}

airgap_livekit_create_failure_is_content_store() {
  local report="$1"
  grep -Eqi 'failed to read config content|content digest sha256:[0-9a-f]+.*not found|NotFound: content digest' "$report"
}

airgap_repair_livekit_container_create() {
  local root="$1" list_file="$2" image removed=0
  while IFS= read -r image; do
    [[ -n "$image" ]] || continue
    if ! airgap_probe_image_container_create "$image"; then
      "$AIRGAP_REAL_DOCKER" image rm -f "$image" >/dev/null 2>&1 || true
      removed=1
    fi
  done <"$list_file"
  if (( removed == 0 )); then
    while IFS= read -r image; do
      [[ -n "$image" ]] || continue
      "$AIRGAP_REAL_DOCKER" image rm -f "$image" >/dev/null 2>&1 || true
    done <"$list_file"
  fi
  airgap_reload_image_archive "$root" || return 1
  airgap_verify_image_list_content "$list_file" || return 1
  airgap_verify_image_list_container_create "$list_file"
}

install_step_20() {
  airgap_is_active || { install_step_20_online; return; }
  local root list report
  root="$(airgap_current_root)" || { fail "No active air-gap bundle."; return 1; }
  list="$(mktemp)"
  report="$(mktemp)"
  new_log "install-20-livekit-image-preflight"
  if ! airgap_livekit_image_list "$list"; then
    rm -f "$list" "$report"
    fail "Unable to resolve LiveKit Docker image list from the offline Compose configuration."
    return 1
  fi
  if ! airgap_verify_image_list_content "$list"; then
    warn "One or more LiveKit images have unreadable Docker content; reloading them from the verified Air-Gap archive."
    livekit_compose down --remove-orphans >>"$CURRENT_LOG" 2>&1 || true
    if ! run_logged "Repair bundled LiveKit Docker image content" airgap_repair_image_list_content "$root" "$list"; then
      rm -f "$list" "$report"
      fail "LiveKit Docker image content remains unreadable after offline reload. Rebuild/import the Air-Gap bundle."
      return 1
    fi
  fi
  livekit_compose down --remove-orphans >>"$CURRENT_LOG" 2>&1 || true
  if ! airgap_livekit_compose_create_probe "$report"; then
    if airgap_livekit_create_failure_is_content_store "$report"; then
      warn "LiveKit container-create detected missing Docker content; refreshing the LiveKit image set from the verified Air-Gap archive."
      if ! run_logged "Repair LiveKit images after container-create failure" airgap_repair_livekit_container_create "$root" "$list"; then
        rm -f "$list" "$report"
        fail "LiveKit images still fail container-create after offline reload. Rebuild/import the Air-Gap bundle."
        return 1
      fi
      if ! airgap_livekit_compose_create_probe "$report"; then
        rm -f "$list" "$report"
        fail "LiveKit Compose container-create still fails after image repair. See the Step 20 preflight log."
        return 1
      fi
    else
      rm -f "$list" "$report"
      fail "LiveKit Compose container-create preflight failed for a non-image-content reason. See the Step 20 preflight log."
      return 1
    fi
  fi
  rm -f "$list" "$report"
  install_step_20_online || return 1
  if ! _airgap_edge_runtime_probe "$SUPABASE_ROOT"; then
    unmark_step 20
    _airgap_edge_capture_logs "${BACKUP_DIR}/edge-runtime-step20-$(date -u +%Y%m%d-%H%M%S).log"
    return 1
  fi
}

AIRGAP_INSTALL_STEPS=(1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 17 21)

airgap_step_supported() {
  local step
  for step in "${AIRGAP_INSTALL_STEPS[@]}"; do [[ "$1" == "$step" ]] && return 0; done
  return 1
}

airgap_prepare_install() {
  local root
  root="$(airgap_current_root)" || { fail "No active air-gap bundle. Import one first."; return 1; }
  export AIRGAP_ROOT="$root" SPARK_AIRGAP_ACTIVE=1 AIRGAP_REAL_DOCKER AIRGAP_REAL_NPM
  export npm_config_offline=true npm_config_audit=false npm_config_fund=false
  unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy
  export NO_PROXY='*' no_proxy='*'
  airgap_prepare_runtime_shims "$root"
}

airgap_run_install_step() {
  local n="$1" step invalidate=0
  airgap_step_supported "$n" || { fail "Offline step must be 1-15, 17 or 21; firewall step 18 was removed."; return 2; }
  for step in "${AIRGAP_INSTALL_STEPS[@]}"; do
    [[ "$step" != "$n" ]] || invalidate=1
    if (( invalidate )); then unmark_step "$step" || return 1; fi
  done
  if ! run_install_step "$n"; then
    unmark_step "$n"
    fail "Offline installation stopped at step ${n}. Correct the reported error and rerun that step."
    return 1
  fi
}

airgap_lock_install() {
  mkdir -p "$STATE_DIR" || return 1
  exec {AIRGAP_INSTALL_LOCK_FD}>"${STATE_DIR}/airgap-install.lock" || return 1
  flock -n "$AIRGAP_INSTALL_LOCK_FD" || {
    fail "Another offline installation is running. Wait for it to finish before starting another action."
    return 1
  }
}

airgap_install_one_step() (
  local n="${1:-}" step
  if [[ -z "$n" ]]; then
    for step in "${AIRGAP_INSTALL_STEPS[@]}"; do
      printf '%02d  %s\n' "$step" "$(installation_step_name "$step")"
    done
    read -r -p "Offline install step (1-15, 17, 21; no firewall step): " n
  fi
  airgap_step_supported "$n" || { fail "Offline step must be 1-15, 17 or 21."; return 2; }
  airgap_lock_install || return 1
  airgap_prepare_install || return 1
  airgap_run_install_step "$n"
)

airgap_install_all() (
  title
  new_log "airgap-install-all"
  local n
  airgap_lock_install || return 1
  airgap_prepare_install || return 1
  info "Running the same 17 offline steps offered by Run one offline install step."
  for n in "${AIRGAP_INSTALL_STEPS[@]}"; do
    airgap_run_install_step "$n" || return 1
  done
  ok "All 17 offline steps completed."
)

airgap_status() {
  title
  new_log "airgap-status"
  local root
  root="$(airgap_current_root 2>/dev/null || true)"
  if [[ -z "$root" ]]; then
    printf 'Air-gap bundle: NOT ACTIVE\n'
    return 0
  fi
  printf 'Air-gap bundle : %s\n' "$root"
  printf 'Bundle ID      : %s\n' "$(airgap_meta_from "$root" BUNDLE_ID)"
  printf 'Created        : %s\n' "$(airgap_meta_from "$root" CREATED_AT)"
  printf 'Target         : Ubuntu %s / %s\n' "$(airgap_meta_from "$root" UBUNTU_VERSION)" "$(airgap_meta_from "$root" ARCH)"
  printf 'Spark commit   : %s\n' "$(airgap_meta_from "$root" SPARK_COMMIT)"
  printf 'Supabase commit: %s\n' "$(airgap_meta_from "$root" SUPABASE_COMMIT)"
  printf 'TLS pack       : %s\n' "$([[ "$(airgap_meta_from "$root" CERTIFICATE_PACK)" == 1 ]] && echo INCLUDED || echo MISSING)"
}
