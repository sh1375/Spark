load_config() {
  if [[ -f "$MANAGER_CONF" ]]; then
    source "$MANAGER_CONF"
  fi
}

save_config() {
  umask 077
  local tmp
  tmp="$(mktemp)"
  {
    printf 'APP_DOMAIN=%q\n' "${APP_DOMAIN:-}"
    printf 'WWW_DOMAIN=%q\n' "${WWW_DOMAIN:-}"
    printf 'API_DOMAIN=%q\n' "${API_DOMAIN:-}"
    printf 'TURN_PUBLIC_IP=%q\n' "${TURN_PUBLIC_IP:-}"
    printf 'TURN_PRIVATE_IP=%q\n' "${TURN_PRIVATE_IP:-}"
    printf 'LE_EMAIL=%q\n' "${LE_EMAIL:-}"
    printf 'SUPABASE_REF=%q\n' "${SUPABASE_REF:-}"
    printf 'SUPABASE_COMMIT=%q\n' "${SUPABASE_COMMIT:-}"
  } >"$tmp"
  install -m 0600 "$tmp" "$MANAGER_CONF"
  rm -f "$tmp"
}

load_config
[[ -f "$MANAGER_CONF" ]] && save_config

pause() {
  printf '\n'
  read -r -p "Press Enter to continue..." _
}

clear_screen() {
  command -v clear >/dev/null 2>&1 && clear || printf '\033c'
}

title() {
  clear_screen
  printf '%s%sSpark Server Manager%s  v%s\n' "$C_BOLD" "$C_CYAN" "$C_RESET" "$SPARK_MANAGER_VERSION"
  printf '%s%s%s\n\n' "$C_BLUE" "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "$C_RESET"
}

ok() { printf '%s✓%s %s\n' "$C_GREEN" "$C_RESET" "$*"; }
warn() { printf '%s!%s %s\n' "$C_YELLOW" "$C_RESET" "$*"; }
fail() { printf '%s✗%s %s\n' "$C_RED" "$C_RESET" "$*"; }
info() { printf '%s•%s %s\n' "$C_CYAN" "$C_RESET" "$*"; }

new_log() {
  local name="${1//[^A-Za-z0-9_.-]/_}"
  CURRENT_LOG="${LOG_DIR}/$(date +%Y%m%d-%H%M%S)-${name}.log"
  : >"$CURRENT_LOG"
  chmod 600 "$CURRENT_LOG"
}

show_failure_log() {
  local log="${1:-$CURRENT_LOG}"
  [[ -f "$log" ]] || return 0
  printf '\n%sLast error output:%s\n' "$C_RED" "$C_RESET"
  tail -n 80 "$log" || true
  printf '\nLog: %s\n' "$log"
}

run_logged() {
  local label="$1"
  shift
  info "$label"
  if "$@" >>"$CURRENT_LOG" 2>&1; then
    ok "$label"
    return 0
  fi
  fail "$label"
  show_failure_log "$CURRENT_LOG"
  return 1
}

run_visible() {
  local label="$1"
  shift
  info "$label"
  set +e
  "$@" 2>&1 | tee -a "$CURRENT_LOG"
  local rc=${PIPESTATUS[0]}
  set -e
  if (( rc == 0 )); then
    ok "$label"
  else
    fail "$label"
  fi
  return "$rc"
}

run_report() {
  local label="$1"
  shift
  info "$label"
  set +e
  "$@" 2>&1 | tee -a "$CURRENT_LOG"
  local rc=${PIPESTATUS[0]}
  set -e
  if (( rc == 0 )); then
    ok "$label"
  else
    warn "$label completed with findings (exit=$rc)"
  fi
  return 0
}

mark_step() {
  local step="$1"
  printf '%s\n' "$(date -Is)" >"${STEP_DIR}/${step}.ok"
  chmod 600 "${STEP_DIR}/${step}.ok"
}

unmark_step() {
  rm -f "${STEP_DIR}/${1}.ok"
}

step_badge() {
  if [[ -f "${STEP_DIR}/${1}.ok" ]]; then
    printf '%s[✓]%s' "$C_GREEN" "$C_RESET"
  else
    printf '[ ]'
  fi
}

installation_step_name() {
  case "$1" in
    1) printf 'Configuration' ;;
    2) printf 'Base packages / Docker / Node' ;;
    3) printf 'Spark repository' ;;
    4) printf 'Supabase source pin' ;;
    5) printf 'Supabase secrets' ;;
    6) printf 'Supabase environment' ;;
    7) printf 'Edge Functions sync' ;;
    8) printf 'Provider / worker environment' ;;
    9) printf 'Docker Compose' ;;
    10) printf 'Supabase runtime' ;;
    11) printf 'Frontend deployment' ;;
    12) printf 'Nginx bootstrap / web server' ;;
    13) printf 'TLS certificates' ;;
    14) printf 'Production Nginx' ;;
    15) printf 'Schedulers' ;;
    17) printf 'Certbot renewal' ;;
    18) printf 'Firewall / UFW' ;;
    *) return 1 ;;
  esac
}

installation_migrations_current() {
  local local_versions remote_versions pending
  [[ -d "${SPARK_ROOT}/supabase/migrations" ]] || return 1
  [[ -f "${SUPABASE_ROOT}/docker-compose.yml" ]] || return 1

  local_versions="$(find "${SPARK_ROOT}/supabase/migrations" -maxdepth 1 -type f -name '*.sql' -printf '%f\n' \
    | sed -nE 's/^([0-9]{14})_.*/\1/p' | sort -u)"
  [[ -n "$local_versions" ]] || return 1

  remote_versions="$(compose exec -T db psql -U postgres -d postgres -Atqc \
    'select version from supabase_migrations.schema_migrations order by version;' 2>/dev/null \
    | tr -d '\r' | sort -u)" || return 1

  pending="$(comm -23 \
    <(printf '%s\n' "$local_versions") \
    <(printf '%s\n' "$remote_versions"))"
  [[ -z "$pending" ]]
}

spark_nginx_gzip_profile_present() {
  command -v nginx >/dev/null 2>&1 || return 1
  local rendered
  rendered="$(nginx -T 2>/dev/null)" || return 1
  grep -Eq '^[[:space:]]*gzip[[:space:]]+on;' <<<"$rendered" || return 1
  grep -Eq '^[[:space:]]*gzip_vary[[:space:]]+on;' <<<"$rendered" || return 1
  grep -Eq '^[[:space:]]*gzip_proxied[[:space:]]+any;' <<<"$rendered" || return 1
  grep -Eq '^[[:space:]]*gzip_comp_level[[:space:]]+6;' <<<"$rendered" || return 1
  grep -Eq '^[[:space:]]*gzip_min_length[[:space:]]+1024;' <<<"$rendered" || return 1
  grep -Eq '^[[:space:]]*gzip_http_version[[:space:]]+1\.1;' <<<"$rendered" || return 1
  grep -Eq 'application/javascript' <<<"$rendered" || return 1
  grep -Eq 'text/css' <<<"$rendered" || return 1
}

spark_apply_nginx_gzip_profile() {
  local file="${1:-/etc/nginx/nginx.conf}" backup_dir backup tmp
  [[ -f "$file" ]] || { fail "Nginx configuration not found: $file"; return 1; }
  command -v python3 >/dev/null 2>&1 || { fail "python3 is required to patch Nginx gzip settings."; return 1; }

  backup_dir="${BACKUP_DIR:-/var/backups/spark}"
  install -d -m 0700 "$backup_dir"
  backup="${backup_dir}/nginx.conf.pre-gzip-$(date +%Y%m%d-%H%M%S).bak"
  cp -a "$file" "$backup" || return 1
  tmp="$(mktemp)"

  if ! python3 - "$file" "$tmp" <<'PY_NGINX_GZIP'
from pathlib import Path
import re
import sys

source = Path(sys.argv[1])
target = Path(sys.argv[2])
text = source.read_text(encoding="utf-8")

profile = """\
\t# Spark performance profile: compress text-based frontend assets.
\t# Images and WOFF2 fonts are intentionally excluded because they are already compressed.
\tgzip on;
\tgzip_vary on;
\tgzip_proxied any;
\tgzip_comp_level 6;
\tgzip_min_length 1024;
\tgzip_buffers 16 8k;
\tgzip_http_version 1.1;
\tgzip_types
\t\ttext/plain
\t\ttext/css
\t\tapplication/json
\t\tapplication/javascript
\t\tapplication/manifest+json
\t\ttext/xml
\t\tapplication/xml
\t\tapplication/xml+rss
\t\timage/svg+xml;

"""

section = re.compile(
    r"(?ms)(^[ \t]*##\r?\n[ \t]*# Gzip Settings\r?\n[ \t]*##\r?\n).*?"
    r"(?=^[ \t]*##\r?\n[ \t]*# Virtual Host Configs\r?\n[ \t]*##)"
)
match = section.search(text)
if match:
    updated = text[:match.start()] + match.group(1) + "\n" + profile + text[match.end():]
else:
    anchor = re.search(r"(?m)^[ \t]*default_type[ \t]+application/octet-stream;[ \t]*\r?$", text)
    if not anchor:
        raise SystemExit("Unable to locate the Nginx http gzip section or default_type anchor")
    insertion = "\n\n\t##\n\t# Gzip Settings\n\t##\n\n" + profile.rstrip("\n")
    updated = text[:anchor.end()] + insertion + text[anchor.end():]

target.write_text(updated, encoding="utf-8")
PY_NGINX_GZIP
  then
    rm -f "$tmp"
    fail "Unable to render Spark Nginx gzip profile."
    return 1
  fi

  cat "$tmp" >"$file"
  rm -f "$tmp"

  if [[ "$file" == "/etc/nginx/nginx.conf" ]] && command -v nginx >/dev/null 2>&1; then
    if ! nginx -t >/dev/null 2>&1; then
      cp -a "$backup" "$file"
      fail "Rendered Nginx gzip profile failed nginx -t; original nginx.conf restored."
      return 1
    fi
  fi

  info "Nginx gzip performance profile applied (backup: $backup)"
}

installation_nginx_present() {
  command -v nginx >/dev/null 2>&1 || return 1
  nginx -t >/dev/null 2>&1 || return 1
  systemctl is-active --quiet nginx || return 1
  spark_nginx_gzip_profile_present || return 1
  [[ -L /etc/nginx/sites-enabled/spark || -L /etc/nginx/sites-enabled/spark-bootstrap ]]
}

installation_step_probe() {
  case "$1" in
    1) test_values ;;
    2) test_base_packages ;;
    3) test_spark_repo ;;
    4) test_supabase_source ;;
    5) test_supabase_secrets ;;
    6) test_supabase_env ;;
    7) test_function_sync ;;
    8) test_provider_env ;;
    9) test_compose_security ;;
    10) test_supabase_health ;;
    11) test_frontend_deploy ;;
    12) installation_nginx_present ;;
    13) test_certificates ;;
    14) test_nginx_production ;;
    15) test_schedulers ;;
    17) test_certbot_hook ;;
    18) test_firewall ;;
    *) return 1 ;;
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

  for n in {1..15} 17 18; do
    printf -v formatted '%02d' "$n"
    name="$(installation_step_name "$n")"

    if installation_step_probe "$n" >/dev/null 2>&1; then
      actual='INSTALLED'
      installed+=("$formatted")
    else
      actual='NOT INSTALLED'
      missing+=("$formatted")
    fi

    if [[ -f "${STEP_DIR}/${n}.ok" ]]; then
      history='DONE'
    else
      history='-'
    fi

    printf '%-4s %-15s %-9s %s\n' "$formatted" "$actual" "$history" "$name"
  done

  printf '%s\n' '----------------------------------------------------------------------------'
  printf 'Installed     : %s\n' "${installed[*]:-none}"
  printf 'Not installed : %s\n' "${missing[*]:-none}"
  printf 'Total         : %d/18\n' "${#installed[@]}"
  printf '\nActual = current state detected on this server. History = the Manager previously recorded this step as successful.\n'
}

confirm_word() {
  local message="$1" _legacy_word="${2:-}" answer
  printf '%s\n' "$message"
  printf '%s\n' '0) Confirm and continue'
  printf '%s\n' 'Press Enter or enter any other value to cancel'
  read -r -p "Selection: " answer
  [[ "$answer" == "0" ]]
}

prompt_default() {
  local var_name="$1" prompt="$2" default="${3:-}" input_value
  if [[ -n "$default" ]]; then
    read -r -p "${prompt} [${default}]: " input_value
    input_value="${input_value:-$default}"
  else
    read -r -p "${prompt}: " input_value
  fi
  printf -v "$var_name" '%s' "$input_value"
}

valid_ipv4() {
  python3 - "$1" <<'PY'
import ipaddress,sys
try:
    ip=ipaddress.ip_address(sys.argv[1])
    raise SystemExit(0 if ip.version == 4 else 1)
except ValueError:
    raise SystemExit(1)
PY
}

valid_domain() {
  [[ "$1" =~ ^([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$ ]]
}

valid_email() {
  [[ "$1" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]
}

require_file() {
  [[ -f "$1" ]] || { echo "Required file missing: $1" >>"$CURRENT_LOG"; return 1; }
}

require_dir() {
  [[ -d "$1" ]] || { echo "Required directory missing: $1" >>"$CURRENT_LOG"; return 1; }
}

ensure_values() {
  local changed=0
  if [[ -z "${APP_DOMAIN:-}" ]]; then APP_DOMAIN="shahrmeeting.ir"; changed=1; fi
  if [[ -z "${WWW_DOMAIN:-}" ]]; then WWW_DOMAIN="www.${APP_DOMAIN}"; changed=1; fi
  if [[ -z "${API_DOMAIN:-}" ]]; then API_DOMAIN="api.${APP_DOMAIN}"; changed=1; fi
  (( changed )) && save_config
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

env_get() {
  local file="$1" key="$2"
  [[ -f "$file" ]] || return 0
  python3 - "$file" "$key" <<'PY'
import sys
path,key=sys.argv[1:3]
value=""
for raw in open(path, encoding="utf-8"):
    line=raw.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k,v=line.split("=",1)
    if k.strip()==key:
        value=v.strip().strip('"').strip("'")
        break
print(value)
PY
}

env_set() {
  local file="$1" key="$2" value="$3"
  FILE="$file" KEY="$key" VALUE="$value" python3 - <<'PY'
import os
from pathlib import Path
path=Path(os.environ["FILE"])
key=os.environ["KEY"]
value=os.environ["VALUE"]
lines=path.read_text(encoding="utf-8").splitlines() if path.exists() else []
out=[]
replaced=False
for line in lines:
    stripped=line.lstrip()
    if stripped and not stripped.startswith("#") and "=" in stripped and stripped.split("=",1)[0].strip()==key:
        if not replaced:
            out.append(f"{key}={value}")
            replaced=True
        continue
    out.append(line)
if not replaced:
    if out and out[-1] != "":
        out.append("")
    out.append(f"{key}={value}")
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text("\n".join(out)+"\n", encoding="utf-8")
PY
}

env_has_nonempty() {
  [[ -n "$(env_get "$1" "$2")" ]]
}

require_manager_values() {
  local missing=()
  local key
  for key in APP_DOMAIN WWW_DOMAIN API_DOMAIN TURN_PUBLIC_IP TURN_PRIVATE_IP LE_EMAIL; do
    [[ -n "${!key:-}" ]] || missing+=("$key")
  done
  if ((${#missing[@]})); then
    fail "Required configuration values are missing: ${missing[*]}"
    info "Run installation step 01 first."
    return 1
  fi
}


install_manager_from_dir() {
  local source_dir="$1"
  local stage backup module
  [[ -f "${source_dir}/spark" ]] || { fail "Spark Manager entrypoint was not found: ${source_dir}/spark"; return 1; }
  for module in core install-base install-platform-a install-platform-b install-platform-c tests-backup update admin; do
    [[ -f "${source_dir}/lib/${module}.sh" ]] || { fail "Spark Manager module was not found: ${module}.sh"; return 1; }
  done
  bash -n "${source_dir}/spark" || return 1
  for module in "${source_dir}"/lib/*.sh; do bash -n "$module" || return 1; done

  install -d -m 0755 /usr/local/lib
  stage="$(mktemp -d /usr/local/lib/spark-manager.new.XXXXXX)"
  backup="/usr/local/lib/spark-manager.previous.$$"
  install -d -m 0755 "${stage}/lib"
  install -m 0755 "${source_dir}/spark" "${stage}/spark"
  for module in "${source_dir}"/lib/*.sh; do install -m 0644 "$module" "${stage}/lib/$(basename "$module")"; done

  if [[ -d /usr/local/lib/spark-manager ]]; then
    mv /usr/local/lib/spark-manager "$backup"
  fi
  if ! mv "$stage" /usr/local/lib/spark-manager; then
    [[ -d "$backup" ]] && mv "$backup" /usr/local/lib/spark-manager
    rm -rf "$stage"
    return 1
  fi
  ln -sfn /usr/local/lib/spark-manager/spark "$CLI_PATH"
  rm -rf "$backup"
}

compose() {
  docker compose -f "${SUPABASE_ROOT}/docker-compose.yml" "$@"
}

db_password_encoded() {
  local password
  password="$(env_get "${SUPABASE_ROOT}/.env" POSTGRES_PASSWORD)"
  [[ -n "$password" ]] || return 1
  PASSWORD="$password" python3 - <<'PY'
import os,urllib.parse
print(urllib.parse.quote(os.environ["PASSWORD"], safe=""))
PY
}

db_url() {
  local encoded
  encoded="$(db_password_encoded)" || return 1
  printf 'postgresql://postgres:%s@127.0.0.1:5433/postgres\n' "$encoded"
}

# Apply the English-only policy after the base helpers are defined. This keeps
# all operational modules on the same shared prompts/status helpers while the
# Python UI provides a final rendering guard for direct legacy output.
if [[ -r "${SCRIPT_DIR}/lib/english-ui.sh" ]]; then
  source "${SCRIPT_DIR}/lib/english-ui.sh"
fi
