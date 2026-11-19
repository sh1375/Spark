# Spark Manager English-only operator text policy.
# This module is sourced by core.sh after the base helper definitions. It keeps
# operational logic unchanged while replacing the shared prompts/status helpers
# with English-only equivalents. The Python UI also applies a final rendering
# guard for legacy module output that bypasses these helpers.

manager_contains_arabic_script() {
  local text="${1:-}"
  LC_ALL=C.UTF-8 grep -qP '[\x{0600}-\x{06FF}\x{0750}-\x{077F}\x{08A0}-\x{08FF}]' <<<"$text" 2>/dev/null
}

manager_ascii_tokens() {
  local text="${1:-}"
  printf '%s\n' "$text" \
    | LC_ALL=C grep -oE '[A-Za-z0-9_./:@%+=,#?()-]+' \
    | paste -sd ' ' -
}

manager_english_message() {
  local text="${1:-}" fallback="${2:-Operation message}" tokens
  if ! manager_contains_arabic_script "$text"; then
    printf '%s' "$text"
    return 0
  fi
  tokens="$(manager_ascii_tokens "$text")"
  if [[ -n "$tokens" ]]; then
    printf '%s: %s' "$fallback" "$tokens"
  else
    printf '%s' "$fallback"
  fi
}

pause() {
  printf '\n'
  read -r -p "Press Enter to continue..." _
}

ok() {
  local message
  message="$(manager_english_message "$*" "Operation completed")"
  printf '%s✓%s %s\n' "$C_GREEN" "$C_RESET" "$message"
}

warn() {
  local message
  message="$(manager_english_message "$*" "Warning")"
  printf '%s!%s %s\n' "$C_YELLOW" "$C_RESET" "$message"
}

fail() {
  local message
  message="$(manager_english_message "$*" "Operation failed")"
  printf '%s✗%s %s\n' "$C_RED" "$C_RESET" "$message"
}

info() {
  local message
  message="$(manager_english_message "$*" "Information")"
  printf '%s•%s %s\n' "$C_CYAN" "$C_RESET" "$message"
}

show_failure_log() {
  local log="${1:-$CURRENT_LOG}"
  [[ -f "$log" ]] || return 0
  printf '\n%sLast error output:%s\n' "$C_RED" "$C_RESET"
  tail -n 80 "$log" || true
  printf '\nLog: %s\n' "$log"
}

run_report() {
  local label="$1" display
  shift
  display="$(manager_english_message "$label" "Diagnostic check")"
  info "$display"
  set +e
  "$@" 2>&1 | tee -a "$CURRENT_LOG"
  local rc=${PIPESTATUS[0]}
  set -e
  if (( rc == 0 )); then
    ok "$display"
  else
    warn "$display completed with findings (exit=$rc)"
  fi
  return 0
}

installation_status_report() {
  local n name actual history formatted
  local installed=() missing=()
  [[ -n "${CURRENT_LOG:-}" ]] || new_log "installation-status"

  printf 'Spark installation status — actual server probe\n'
  printf '%s\n' '----------------------------------------------------------------------------'
  printf '%-4s %-15s %-9s %s\n' 'No.' 'Actual' 'History' 'Component'
  printf '%s\n' '----------------------------------------------------------------------------'

  for n in $(seq 1 18); do
    printf -v formatted '%02d' "$n"
    name="$(installation_step_name "$n")"
    if installation_step_probe "$n" >/dev/null 2>&1; then
      actual='INSTALLED'
      installed+=("$formatted")
    else
      actual='NOT INSTALLED'
      missing+=("$formatted")
    fi
    if [[ -f "${STEP_DIR}/${n}.ok" ]]; then history='DONE'; else history='-'; fi
    printf '%-4s %-15s %-9s %s\n' "$formatted" "$actual" "$history" "$name"
  done

  printf '%s\n' '----------------------------------------------------------------------------'
  printf 'Installed     : %s\n' "${installed[*]:-none}"
  printf 'Not installed : %s\n' "${missing[*]:-none}"
  printf 'Total         : %d/18\n' "${#installed[@]}"
  printf '\nActual = current state detected on this server. History = the Manager previously recorded this step as successful.\n'
}

confirm_word() {
  local message="${1:-}" _legacy_word="${2:-}" answer rendered
  rendered="$(manager_english_message "$message" "Confirm this operation")"
  printf '%s\n' "$rendered"
  printf '%s\n' '0) Confirm and continue'
  printf '%s\n' 'Press Enter or enter any other value to cancel'
  read -r -p "Selection: " answer
  [[ "$answer" == "0" ]]
}

configure_values_interactive() {
  ensure_values
  local v
  while true; do
    prompt_default v "Primary domain" "${APP_DOMAIN:-shahrmeeting.ir}"
    valid_domain "$v" && { APP_DOMAIN="$v"; break; }
    fail "The domain is invalid."
  done
  while true; do
    prompt_default v "www domain" "${WWW_DOMAIN:-www.$APP_DOMAIN}"
    valid_domain "$v" && { WWW_DOMAIN="$v"; break; }
    fail "The domain is invalid."
  done
  while true; do
    prompt_default v "API domain" "${API_DOMAIN:-api.$APP_DOMAIN}"
    valid_domain "$v" && { API_DOMAIN="$v"; break; }
    fail "The domain is invalid."
  done
  while true; do
    prompt_default v "Server public IPv4" "${TURN_PUBLIC_IP:-}"
    valid_ipv4 "$v" && { TURN_PUBLIC_IP="$v"; break; }
    fail "The IPv4 address is invalid."
  done
  while true; do
    prompt_default v "Server private IPv4 (use the public IPv4 when NAT is not used)" "${TURN_PRIVATE_IP:-$TURN_PUBLIC_IP}"
    valid_ipv4 "$v" && { TURN_PRIVATE_IP="$v"; break; }
    fail "The IPv4 address is invalid."
  done
  while true; do
    prompt_default v "Let's Encrypt email" "${LE_EMAIL:-}"
    valid_email "$v" && { LE_EMAIL="$v"; break; }
    fail "The email address is invalid."
  done
  save_config
  ok "Configuration saved to ${MANAGER_CONF} (mode 600)."
}

require_manager_values() {
  local missing=() key
  for key in APP_DOMAIN WWW_DOMAIN API_DOMAIN TURN_PUBLIC_IP TURN_PRIVATE_IP LE_EMAIL; do
    [[ -n "${!key:-}" ]] || missing+=("$key")
  done
  if ((${#missing[@]})); then
    fail "Required configuration values are missing: ${missing[*]}"
    info "Run installation step 01 first."
    return 1
  fi
}
