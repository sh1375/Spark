# Targeted compatibility overrides loaded after the core install modules.

normalize_auth_hook_secret() {
  local supabase_env="${SUPABASE_ROOT}/.env"
  local functions_env="${CONFIG_DIR}/functions-extra.env"
  local secret

  secret="$(env_get "$supabase_env" SEND_SMS_HOOK_SECRET)"
  if [[ -z "$secret" && -f "$functions_env" ]]; then
    secret="$(env_get "$functions_env" SEND_SMS_HOOK_SECRET)"
  fi
  if [[ -z "$secret" ]]; then
    secret="$(openssl rand -base64 32 | tr -d '\n')"
  fi
  if [[ "$secret" != v1,whsec_* ]]; then
    secret="v1,whsec_${secret}"
  fi

  env_set "$supabase_env" SEND_SMS_HOOK_SECRET "$secret"
  if [[ -f "$functions_env" ]]; then
    env_set "$functions_env" SEND_SMS_HOOK_SECRET "$secret"
    chmod 600 "$functions_env"
  fi
  chmod 600 "$supabase_env"
}

# GoTrue v2.189+ rejects HTTP hook URLs whose host is not localhost/loopback.
# Route Spark's SMS Auth Hook through the public HTTPS API.
patch_compose() {
  local compose_file="${SUPABASE_ROOT}/docker-compose.yml"
  COMPOSE_FILE="$compose_file" SPARK_ROOT_ENV="$SPARK_ROOT" python3 - <<'PY'
import os,yaml
from pathlib import Path

path=Path(os.environ["COMPOSE_FILE"])
data=yaml.safe_load(path.read_text(encoding="utf-8"))
if not isinstance(data,dict) or not isinstance(data.get("services"),dict):
    raise SystemExit("docker-compose.yml has no services mapping")
services=data["services"]
required=["api-gw","db","supavisor","auth","functions"]
missing=[x for x in required if x not in services]
if missing:
    raise SystemExit(f"Refusing to guess service names. Missing: {missing}")

services["api-gw"]["ports"]=["127.0.0.1:8000:8000/tcp"]
services["db"].pop("ports",None)
services["supavisor"]["ports"]=[
    "127.0.0.1:5433:5432/tcp",
    "127.0.0.1:6543:6543/tcp",
]

def env_to_dict(v):
    if v is None: return {}
    if isinstance(v,dict): return dict(v)
    if isinstance(v,list):
        out={}
        for item in v:
            if isinstance(item,str):
                if "=" in item:
                    k,val=item.split("=",1); out[k]=val
                else:
                    out[item]=None
            elif isinstance(item,dict):
                out.update(item)
        return out
    raise SystemExit("Unsupported environment format")

auth_service=services["auth"]
auth_env=env_to_dict(auth_service.get("environment"))
auth_env.update({
    "GOTRUE_HOOK_SEND_SMS_ENABLED":"true",
    "GOTRUE_HOOK_SEND_SMS_URI":"http://host.docker.internal:8000/functions/v1/auth-send-sms-hook",
    "GOTRUE_HOOK_SEND_SMS_SECRETS":"${SEND_SMS_HOOK_SECRET}",
})
auth_service["environment"]=auth_env
extra_hosts=auth_service.get("extra_hosts") or []
if isinstance(extra_hosts,str):
    extra_hosts=[extra_hosts]
elif not isinstance(extra_hosts,list):
    raise SystemExit("Unsupported auth extra_hosts format")
host_gateway="host.docker.internal:host-gateway"
if host_gateway not in extra_hosts:
    extra_hosts.append(host_gateway)
auth_service["extra_hosts"]=extra_hosts

fn=services["functions"]
env_file=fn.get("env_file",[])
if isinstance(env_file,str): env_file=[env_file]
elif env_file is None: env_file=[]
elif not isinstance(env_file,list): raise SystemExit("Unsupported functions env_file format")
if "/etc/spark/functions-extra.env" not in env_file:
    env_file.append("/etc/spark/functions-extra.env")
fn["env_file"]=env_file
fn_env=env_to_dict(fn.get("environment"))
for key in [
    "SEND_SMS_HOOK_SECRET","PHONE_RATE_LIMIT_PEPPER","PHONE_PASSWORD_RESET_SECRET",
    "PHONE_LOGIN_ALLOWED_ORIGINS","DAILY_REPORT_CRON_SECRET",
    "NOTIFICATION_OUTBOX_CRON_SECRET","MINUTES_REMINDER_CRON_SECRET",
    "DECISION_DUE_CRON_SECRET",
]:
    fn_env[key]="${"+key+"}"
fn["environment"]=fn_env

services["avatar-worker"]={
    "build":{
        "context":os.path.join(os.environ["SPARK_ROOT_ENV"],"worker"),
        "dockerfile":"Dockerfile",
    },
    "restart":"unless-stopped",
    "env_file":["/etc/spark/avatar-worker.env"],
    "depends_on":{"api-gw":{"condition":"service_healthy"}},
    "read_only":True,
    "tmpfs":["/tmp:size=64m,mode=1777"],
    "security_opt":["no-new-privileges:true"],
    "cap_drop":["ALL"],
}

path.write_text(yaml.safe_dump(data,sort_keys=False,default_flow_style=False),encoding="utf-8")
PY
}

install_step_9() {
  title
  new_log "install-09-compose"
  require_file "${SUPABASE_ROOT}/docker-compose.yml" || return 1
  require_file "${CONFIG_DIR}/functions-extra.env" || return 1
  require_file "${CONFIG_DIR}/avatar-worker.env" || return 1
  require_manager_values || return 1
  local backup="${SUPABASE_ROOT}/docker-compose.yml.before-spark"
  local safety="${SUPABASE_ROOT}/docker-compose.yml.pre-manager-$(date +%Y%m%d%H%M%S)"
  cp -a "${SUPABASE_ROOT}/docker-compose.yml" "$safety"
  [[ -f "$backup" ]] || cp -a "${SUPABASE_ROOT}/docker-compose.yml" "$backup"

  run_logged "Normalize Auth Hook secret" normalize_auth_hook_secret || {
    cp -a "$safety" "${SUPABASE_ROOT}/docker-compose.yml"
    return 1
  }
  if ! run_logged "Implement controlled changes Docker Compose" patch_compose; then
    cp -a "$safety" "${SUPABASE_ROOT}/docker-compose.yml"
    return 1
  fi
  if ! run_logged "docker compose config" bash -c "cd '$SUPABASE_ROOT' && docker compose config --quiet"; then
    warn "Compose became invalid; Previous file restore completed."
    cp -a "$safety" "${SUPABASE_ROOT}/docker-compose.yml"
    return 1
  fi
  if run_logged "test binds Loopback and Avatar Worker" test_compose_security; then
    rm -f "$safety"
    mark_step 9
  else
    warn "Security validation failed; Previous file restore completed."
    cp -a "$safety" "${SUPABASE_ROOT}/docker-compose.yml"
    rm -f "$safety"
    unmark_step 9
    return 1
  fi
}

repair_supabase_bootstrap() {
  local has_internal_db
  has_internal_db="$(cd "$SUPABASE_ROOT" && docker compose exec -T db psql -U postgres -d postgres -Atqc "select 1 from pg_database where datname='_supabase'" 2>/dev/null || true)"

  (cd "$SUPABASE_ROOT" && docker compose exec -T db psql \
    -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_functions_admin') THEN
    CREATE USER supabase_functions_admin NOINHERIT CREATEROLE LOGIN NOREPLICATION;
  END IF;
END
$$;
SQL
  ) || return 1

  (cd "$SUPABASE_ROOT" && docker compose exec -T db sh -lc \
    'psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f /docker-entrypoint-initdb.d/init-scripts/99-roles.sql') || return 1

  (cd "$SUPABASE_ROOT" && docker compose exec -T db psql \
    -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
ALTER SCHEMA auth OWNER TO supabase_auth_admin;
ALTER ROLE supabase_auth_admin SET search_path = auth;
GRANT USAGE, CREATE ON SCHEMA auth TO supabase_auth_admin;

-- Supabase's own ownership migration assigns these helper functions to
-- supabase_auth_admin. GoTrue's initial migration uses CREATE OR REPLACE and
-- therefore fails if a pre-existing copy is owned by another role.
DO $$
BEGIN
  IF to_regprocedure('auth.uid()') IS NOT NULL THEN
    ALTER FUNCTION auth.uid() OWNER TO supabase_auth_admin;
  END IF;
  IF to_regprocedure('auth.role()') IS NOT NULL THEN
    ALTER FUNCTION auth.role() OWNER TO supabase_auth_admin;
  END IF;
  IF to_regprocedure('auth.email()') IS NOT NULL THEN
    ALTER FUNCTION auth.email() OWNER TO supabase_auth_admin;
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS storage AUTHORIZATION supabase_storage_admin;
ALTER SCHEMA storage OWNER TO supabase_storage_admin;
ALTER ROLE supabase_storage_admin SET search_path = storage;
GRANT USAGE, CREATE ON SCHEMA storage TO supabase_storage_admin;

CREATE SCHEMA IF NOT EXISTS _realtime AUTHORIZATION supabase_admin;
ALTER SCHEMA _realtime OWNER TO supabase_admin;
GRANT USAGE, CREATE ON SCHEMA _realtime TO supabase_admin;

CREATE SCHEMA IF NOT EXISTS graphql_public AUTHORIZATION supabase_admin;
ALTER SCHEMA graphql_public OWNER TO supabase_admin;
GRANT USAGE ON SCHEMA graphql_public TO postgres, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA graphql_public TO authenticator;
ALTER DEFAULT PRIVILEGES FOR USER supabase_admin IN SCHEMA graphql_public
  GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR USER supabase_admin IN SCHEMA graphql_public
  GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR USER supabase_admin IN SCHEMA graphql_public
  GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;

ALTER ROLE supabase_admin SET search_path = "$user", public, auth, extensions;
SQL
  ) || return 1

  if [[ "$has_internal_db" != "1" ]]; then
    (cd "$SUPABASE_ROOT" && docker compose exec -T db sh -lc \
      'psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f /docker-entrypoint-initdb.d/migrations/97-_supabase.sql') || return 1
  fi

  (cd "$SUPABASE_ROOT" && docker compose exec -T db sh -lc \
    'psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f /docker-entrypoint-initdb.d/migrations/99-pooler.sql') || return 1
}

supabase_bootstrap_ready() {
  (cd "$SUPABASE_ROOT" && docker compose exec -T db psql -U postgres -d postgres -Atqc \
    "select case when
      exists(select 1 from pg_database where datname='_supabase')
      and exists(select 1 from pg_roles where rolname='supabase_storage_admin')
      and exists(select 1 from pg_roles where rolname='supabase_auth_admin')
      and exists(select 1 from pg_roles where rolname='authenticator')
      and exists(select 1 from pg_roles where rolname='supabase_admin')
      and exists(select 1 from pg_namespace where nspname='auth')
      and exists(select 1 from pg_namespace where nspname='storage')
      and exists(select 1 from pg_namespace where nspname='_realtime')
      and exists(select 1 from pg_namespace where nspname='graphql_public')
      and (to_regprocedure('auth.uid()') is null or pg_get_userbyid((select proowner from pg_proc where oid=to_regprocedure('auth.uid()')))='supabase_auth_admin')
      and (to_regprocedure('auth.role()') is null or pg_get_userbyid((select proowner from pg_proc where oid=to_regprocedure('auth.role()')))='supabase_auth_admin')
      then 1 else 0 end" 2>/dev/null | grep -qx 1)
}

# Spark uses dedicated www/api/turn hosts below the main application domain.
# The old generic domain regex accepted values such as turn.shahr even when the
# application domain was shahrmeeting.ir. Keep the syntax check, but also enforce
# the service-domain relationship used by Nginx and Certbot.
valid_service_domain() {
  local child="$1" parent="$2"
  valid_domain "$child" || return 1
  valid_domain "$parent" || return 1
  [[ "$child" == *".${parent}" && "$child" != "$parent" ]]
}

test_values() {
  require_manager_values || return 1
  valid_domain "$APP_DOMAIN" || return 1
  valid_service_domain "$WWW_DOMAIN" "$APP_DOMAIN" || return 1
  valid_service_domain "$API_DOMAIN" "$APP_DOMAIN" || return 1
  valid_ipv4 "$TURN_PUBLIC_IP" || return 1
  valid_ipv4 "$TURN_PRIVATE_IP" || return 1
  valid_email "$LE_EMAIL" || return 1
}

configure_values_interactive() {
  ensure_values
  local v default_value

  while true; do
    prompt_default v "Main domain" "${APP_DOMAIN:-shahrmeeting.ir}"
    valid_domain "$v" && { APP_DOMAIN="$v"; break; }
    fail "The original domain is not valid."
  done

  default_value="${WWW_DOMAIN:-}"
  valid_service_domain "$default_value" "$APP_DOMAIN" || default_value="www.${APP_DOMAIN}"
  while true; do
    prompt_default v "domain www" "$default_value"
    valid_service_domain "$v" "$APP_DOMAIN" && { WWW_DOMAIN="$v"; break; }
    fail "domain www Must be a subdomain ${APP_DOMAIN} be; Example: www.${APP_DOMAIN}"
  done

  default_value="${API_DOMAIN:-}"
  valid_service_domain "$default_value" "$APP_DOMAIN" || default_value="api.${APP_DOMAIN}"
  while true; do
    prompt_default v "domain API" "$default_value"
    valid_service_domain "$v" "$APP_DOMAIN" && { API_DOMAIN="$v"; break; }
    fail "domain API Must be a subdomain ${APP_DOMAIN} be; Example: api.${APP_DOMAIN}"
  done

  while true; do
    prompt_default v "Public IPv4 server" "${TURN_PUBLIC_IP:-}"
    valid_ipv4 "$v" && { TURN_PUBLIC_IP="$v"; break; }
    fail "IPv4 not valid."
  done
  while true; do
    prompt_default v "Private IPv4 server (if NAT You don't have the same Public IP)" "${TURN_PRIVATE_IP:-$TURN_PUBLIC_IP}"
    valid_ipv4 "$v" && { TURN_PRIVATE_IP="$v"; break; }
    fail "IPv4 not valid."
  done
  while true; do
    prompt_default v "Email for Let's Encrypt" "${LE_EMAIL:-}"
    valid_email "$v" && { LE_EMAIL="$v"; break; }
    fail "Email not valid."
  done

  save_config
  ok "Settings in ${MANAGER_CONF} saved (mode 600)."
}

install_step_13() {
  title
  new_log "install-13-certificates"
  require_manager_values || return 1
  if ! test_values; then
    fail "Domain settings are not valid; stage 01 – Configuration Run it again."
    return 1
  fi
  run_logged "Certificate domain Frontend" certbot certonly --webroot -w /var/www/acme -d "$APP_DOMAIN" -d "$WWW_DOMAIN" --email "$LE_EMAIL" --agree-tos --non-interactive --keep-until-expiring || return 1
  run_logged "Certificate domain API" certbot certonly --webroot -w /var/www/acme -d "$API_DOMAIN" --email "$LE_EMAIL" --agree-tos --non-interactive --keep-until-expiring || return 1
  if run_logged "test Certificates" test_certificates; then
    mark_step 13
  else
    unmark_step 13
    return 1
  fi
}
