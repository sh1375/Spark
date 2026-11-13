#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

REPO_API="https://api.github.com/repos/sh1375/Spark"
TARGET="/usr/local/lib/spark-manager"
CLI_PATH="/usr/local/bin/spark"
AIRGAP_CLI_PATH="/usr/local/bin/spark-airgap"
ARCHITECTURE_CLI_PATH="/usr/local/bin/spark-architecture"
DATABASE_CLI_PATH="/usr/local/bin/spark-database"
MIGRATE_TARGET="/usr/local/lib/spark-migrate"
MIGRATE_PATH="/usr/local/bin/spark-migrate"
EXPECTED_VERSION="4.0.0"
EXPECTED_AIRGAP_VERSION="3.1.0+20260916.4"
EXPECTED_UI_VERSION="3.1.0+20260910.1"
EXPECTED_MIGRATE_VERSION="1.1.0+20260822.2"

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  exec sudo -E "$0" "$@"
fi

command -v curl >/dev/null 2>&1 || {
  echo "curl is required. Install curl first." >&2
  exit 1
}
command -v python3 >/dev/null 2>&1 || {
  echo "python3 is required for the Spark curses UI." >&2
  exit 1
}
python3 - <<'PY'
import curses, pty, selectors
PY

resolve_main_sha() {
  local response sha
  response="$(curl -fsSL -H 'Accept: application/vnd.github+json' \
    -H 'Cache-Control: no-cache' \
    "${REPO_API}/commits/main?nocache=$(date +%s)")" || {
      echo "Unable to resolve current Spark main commit from GitHub API." >&2
      return 1
    }
  sha="$(printf '%s' "$response" \
    | grep -m1 -Eo '"sha"[[:space:]]*:[[:space:]]*"[0-9a-f]{40}"' \
    | grep -Eo '[0-9a-f]{40}' || true)"
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || {
    echo "GitHub API returned an invalid Spark Manager revision." >&2
    return 1
  }
  printf '%s\n' "$sha"
}

MAIN_SHA="$(resolve_main_sha)"
RAW_ROOT="https://raw.githubusercontent.com/sh1375/Spark/${MAIN_SHA}"
RAW_BASE="${RAW_ROOT}/deploy/spark-cli"
LIVEKIT_RAW_BASE="${RAW_ROOT}/deploy/spark-cli/livekit"
printf 'Resolved Spark Manager revision: %s\n' "${MAIN_SHA:0:12}"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/lib" "$tmp/livekit" "$tmp/architecture" "$tmp/config/environments" "$tmp/roles/database/tasks" "$tmp/secrets" "$tmp/roles/database/package" "$tmp/adapters" "$tmp/roles/database/runtime" "$tmp/roles/database/lifecycle" "$tmp/roles/database/schema" "$tmp/roles/application/tasks" "$tmp/roles/application/build" "$tmp/roles/application/deployment"

files=(
  spark
  spark-airgap
spark-architecture
architecture/__init__.py
architecture/cli.py
architecture/controller.py
architecture/connectivity.py
architecture/host_context.py
architecture/renderer.py
architecture/status.py
architecture/validator.py
config/__init__.py
config/loader.py
config/models.py
config/schema.py
config/yaml_loader.py
config/environments/example.production.yaml
config/environments/example.staging.yaml
config/environments/example.airgap.yaml
roles/__init__.py
roles/application/__init__.py
roles/application/context.py
roles/application/detector.py
roles/application/preflight.py
roles/application/source.py
roles/application/configuration.py
roles/application/workflow.py
roles/application/manifest.yaml
roles/application/tasks/__init__.py
roles/application/tasks/build.py
roles/application/tasks/deploy.py
roles/application/build/__init__.py
roles/application/build/manifest.py
roles/application/build/identity.py
roles/application/build/builder.py
roles/application/deployment/__init__.py
roles/application/deployment/models.py
roles/application/deployment/lock.py
roles/application/deployment/nginx.py
roles/application/deployment/health.py
roles/application/deployment/activator.py
roles/database/__init__.py
roles/database/context.py
roles/database/detector.py
roles/database/preflight.py
roles/database/workflow.py
roles/database/manifest.yaml
roles/database/tasks/__init__.py
roles/database/tasks/preflight.py
roles/database/tasks/package.py
roles/database/tasks/secrets.py
roles/database/package/__init__.py
roles/database/package/manager.py
roles/database/package/source.py
roles/database/package/version.py
roles/database/package/verifier.py
roles/database/package/overlay.py
secrets/__init__.py
secrets/provider.py
secrets/file_provider.py
secrets/generator.py
secrets/redaction.py
secrets/models.py
adapters/__init__.py
adapters/command.py
adapters/apt.py
adapters/systemd.py
adapters/docker.py
roles/database/runtime/__init__.py
roles/database/runtime/models.py
roles/database/runtime/detector.py
roles/database/runtime/installer.py
roles/database/runtime/firewall.py
roles/database/runtime/env_builder.py
roles/database/runtime/compose.py
roles/database/tasks/runtime.py
roles/database/tasks/compose.py
roles/database/tasks/images.py
roles/database/tasks/postgres.py
roles/database/tasks/supabase.py
roles/database/lifecycle/__init__.py
roles/database/lifecycle/models.py
roles/database/lifecycle/images.py
roles/database/lifecycle/postgres.py
roles/database/lifecycle/supabase.py
roles/database/lifecycle/diagnostics.py
roles/database/schema/__init__.py
roles/database/schema/models.py
roles/database/schema/parser.py
roles/database/schema/rules.py
roles/database/schema/ownership.py
roles/database/schema/dump_analyzer.py
roles/database/schema/sanitizer.py
roles/database/schema/fingerprint.py
roles/database/schema/catalog.py
roles/database/schema/live_inventory.py
database_cli.py
spark-database
bootstrap-airgap.sh
  spark-ui.py
  spark-ui-core.py
  spark-migrate
  lib/core.sh
  lib/install-base.sh
  lib/install-platform-a.sh
  lib/install-platform-b.sh
  lib/install-platform-c.sh
  lib/tests-backup.sh
  lib/update.sh
  lib/admin.sh
  lib/cleanup.sh
  lib/repair-override.sh
  lib/env-modern.sh
  lib/runtime-fixes-base.sh
  lib/runtime-fixes.sh
  lib/application.sh
  lib/application-maintenance.sh
  lib/linux-system.sh
  lib/installation-universal.sh
  lib/database.sh
  lib/same-origin.sh
  lib/studio-session.sh
  lib/install-livekit.sh
  lib/airgap.sh
  lib/airgap-build.sh
  lib/airgap-packages.sh
  lib/airgap-runtime.sh
  lib/airgap-target-patch.sh
  lib/airgap-auto.sh
  lib/airgap-ip.sh
  lib/airgap-dnsless-runtime.sh
  lib/airgap-observability-quiet-base.sh
  lib/airgap-observability-quiet.sh
  lib/airgap-edge-functions.sh
  lib/airgap-edge-functions-runtime-fix.sh
  lib/airgap-edge-final.sh
)

for file in "${files[@]}"; do
  echo "Downloading ${file}..."
  curl -fsSL -H 'Cache-Control: no-cache' "${RAW_BASE}/${file}" -o "${tmp}/${file}"
done

livekit_files=(
  .env.example
  docker-compose.yml
  docker-compose.spark-cli.yml
  Caddyfile
  redis.conf
  livekit.yaml
  egress.yaml
  ingress.yaml
  README.md
  monitoring/prometheus.yml
  monitoring/rules/livekit-alerts.yml
  monitoring/alertmanager.yml
  monitoring/blackbox.yml
  monitoring/loki.yml
  monitoring/alloy.alloy
  monitoring/grafana/provisioning/datasources/datasources.yml
  monitoring/grafana/provisioning/dashboards/dashboards.yml
  monitoring/grafana/dashboards/spark-livekit-overview.json
  monitoring/grafana/dashboards/spark-livekit-operations.json
  monitoring/targets/blackbox.json
)
for file in "${livekit_files[@]}"; do
  echo "Downloading LiveKit asset ${file}..."
  install -d -m 0755 "$(dirname "${tmp}/livekit/${file}")"
  curl -fsSL -H 'Cache-Control: no-cache' "${LIVEKIT_RAW_BASE}/${file}" -o "${tmp}/livekit/${file}"
done

grep -q '^  minio:' "$tmp/livekit/docker-compose.yml" || {
  echo "Spark LiveKit MinIO service is missing from deployment assets." >&2
  exit 1
}
grep -q '^  minio-init:' "$tmp/livekit/docker-compose.yml" || {
  echo "Spark LiveKit MinIO initialization service is missing." >&2
  exit 1
}
for file in   monitoring/prometheus.yml   monitoring/rules/livekit-alerts.yml   monitoring/alertmanager.yml   monitoring/blackbox.yml   monitoring/loki.yml   monitoring/alloy.alloy   monitoring/grafana/provisioning/datasources/datasources.yml   monitoring/grafana/provisioning/dashboards/dashboards.yml   monitoring/grafana/dashboards/spark-livekit-overview.json   monitoring/grafana/dashboards/spark-livekit-operations.json   monitoring/targets/blackbox.json; do
  [[ -f "$tmp/livekit/$file" ]] || {
    echo "Spark LiveKit observability asset is missing: $file" >&2
    exit 1
  }
done

bash -n "$tmp/spark"
bash -n "$tmp/spark-airgap"
bash -n "$tmp/bootstrap-airgap.sh"
bash -n "$tmp/spark-migrate"
for file in "$tmp"/lib/*.sh; do bash -n "$file"; done
python3 - "$tmp/spark-ui.py" "$tmp/spark-ui-core.py" <<'PY'
from pathlib import Path
import sys
for value in sys.argv[1:]:
    path = Path(value)
    compile(path.read_text(encoding="utf-8"), str(path), "exec")
PY
python3 "$tmp/spark-ui.py" --self-test
SPARK_ENV_PROFILE="$tmp/config/environments/example.production.yaml" python3 "$tmp/spark-architecture" validate >/dev/null

grep -Fq "SPARK_MANAGER_VERSION=\"${EXPECTED_VERSION}\"" "$tmp/spark" || {
  echo "Spark Manager version validation failed." >&2
  exit 1
}
grep -Fq "SPARK_MANAGER_VERSION=\"${EXPECTED_AIRGAP_VERSION}\"" "$tmp/spark-airgap" || {
  echo "Spark Air-Gap backend version validation failed." >&2
  exit 1
}
grep -q 'airgap-build-target-patch' "$tmp/spark-airgap" || {
  echo "Spark Air-Gap target patch action is missing." >&2
  exit 1
}
grep -q 'airgap-auto-target-bootstrap' "$tmp/spark-airgap" || {
  echo "Spark Air-Gap automatic target bootstrap action is missing." >&2
  exit 1
}
grep -q 'airgap-ip' "$tmp/spark-airgap" || {
  echo "Spark Air-Gap internal-IP module is not loaded." >&2
  exit 1
}
grep -q 'airgap-dnsless-runtime' "$tmp/spark-airgap" || {
  echo "Spark Air-Gap DNS-free runtime module is not loaded." >&2
  exit 1
}
grep -q 'airgap-observability-quiet' "$tmp/spark-airgap" || {
  echo "Spark Air-Gap observability quiet module is not loaded." >&2
  exit 1
}
[[ -f "$tmp/lib/airgap-dnsless-runtime.sh" ]] || {
  echo "Spark Air-Gap DNS-free runtime module is missing." >&2
  exit 1
}
[[ -f "$tmp/lib/airgap-observability-quiet.sh" ]] || {
  echo "Spark Air-Gap observability quiet module is missing." >&2
  exit 1
}
[[ -f "$tmp/lib/airgap-observability-quiet-base.sh" ]] || {
  echo "Spark Air-Gap observability quiet base module is missing." >&2
  exit 1
}
[[ -f "$tmp/lib/airgap-edge-functions.sh" ]] || {
  echo "Spark Air-Gap Edge Function offline dependency module is missing." >&2
  exit 1
}
[[ -f "$tmp/lib/airgap-edge-functions-runtime-fix.sh" ]] || {
  echo "Spark Air-Gap Edge Function runtime compatibility module is missing." >&2
  exit 1
}
[[ -f "$tmp/lib/airgap-edge-final.sh" ]] || {
  echo "Spark Air-Gap final Edge Runtime cache hardening module is missing." >&2
  exit 1
}
grep -q 'airgap-edge-functions.sh' "$tmp/lib/airgap-observability-quiet.sh" || {
  echo "Spark Air-Gap Edge Function offline dependency module is not sourced." >&2
  exit 1
}
grep -q 'airgap-edge-functions-runtime-fix.sh' "$tmp/lib/airgap-observability-quiet.sh" || {
  echo "Spark Air-Gap Edge Function runtime compatibility module is not sourced." >&2
  exit 1
}
grep -q 'airgap-edge-final.sh' "$tmp/lib/airgap-observability-quiet.sh" || {
  echo "Spark Air-Gap final Edge Runtime cache hardening module is not sourced." >&2
  exit 1
}
grep -Fq 'AIRGAP_IP_MODE="internal_ip"' "$tmp/lib/airgap-ip.sh" || {
  echo "Spark Air-Gap internal-IP deployment mode is incomplete." >&2
  exit 1
}
grep -Fq "SPARK_UI_VERSION = \"${EXPECTED_UI_VERSION}\"" "$tmp/spark-ui.py" || {
  echo "Spark UI version validation failed." >&2
  exit 1
}
grep -Fq "SPARK_UI_VERSION = \"${EXPECTED_UI_VERSION}\"" "$tmp/spark-ui-core.py" || {
  echo "Spark UI core version validation failed." >&2
  exit 1
}
grep -q 'SPARK_MIGRATE_VERSION="1.1.0+20260822.2"' "$tmp/spark-migrate" || {
  echo "Spark migration companion version validation failed." >&2
  exit 1
}
grep -q 'cleanup_database_data' "$tmp/lib/cleanup.sh" || {
  echo "Spark cleanup module validation failed." >&2
  exit 1
}
grep -q 'ensure_modern_auth_keys' "$tmp/lib/env-modern.sh" || {
  echo "Spark modern Supabase env layer is missing." >&2
  exit 1
}
grep -q 'Studio HTTPS/443' "$tmp/lib/runtime-fixes-base.sh" || {
  echo "Spark Studio 443 runtime fix is missing." >&2
  exit 1
}
grep -q "GRANT anon, authenticated, service_role TO supabase_storage_admin" "$tmp/lib/runtime-fixes-base.sh" || {
  echo "Spark Storage role repair is missing." >&2
  exit 1
}
grep -q 'studio_gateway_direct_probe' "$tmp/lib/runtime-fixes-base.sh" || {
  echo "Spark Studio gateway probe is missing." >&2
  exit 1
}
grep -q 'SPARK_EDGE_MAIN_ROUTER' "$tmp/lib/runtime-fixes.sh" || {
  echo "Spark offline-safe Edge Runtime router fix is missing." >&2
  exit 1
}
grep -q 'spark_studio_session' "$tmp/lib/studio-session.sh" || {
  echo "Spark Studio session auth module is missing." >&2
  exit 1
}
grep -q 'env-modern runtime-fixes studio-session install-livekit' "$tmp/spark" || {
  echo "Spark loader does not source Studio session auth natively." >&2
  exit 1
}
grep -q 'install_step_21' "$tmp/lib/install-livekit.sh" || {
  echo "Spark LiveKit installer module is incomplete." >&2
  exit 1
}
grep -q 'pty.openpty()' "$tmp/spark-ui.py" || {
  echo "Spark UI PTY backend validation failed." >&2
  exit 1
}
grep -q 'curses.doupdate()' "$tmp/spark-ui.py" || {
  echo "Spark UI differential refresh validation failed." >&2
  exit 1
}
if grep -Eq 'terminal-menus|mainmenu\(|TUI_VENDOR' "$tmp/spark-ui.py"; then
  echo "Spark UI unexpectedly depends on the retired terminal-menus runtime." >&2
  exit 1
fi

stage="$(mktemp -d /usr/local/lib/spark-manager.new.XXXXXX)"
migrate_stage="$(mktemp -d /usr/local/lib/spark-migrate.new.XXXXXX)"
chmod 0755 "$stage" "$migrate_stage"
backup="/usr/local/lib/spark-manager.previous.$$"
migrate_backup="/usr/local/lib/spark-migrate.previous.$$"
install -d -m 0755 "$stage/lib" "$stage/livekit" "$stage/architecture" "$stage/config/environments" "$stage/roles/database/tasks" "$stage/secrets" "$stage/roles/database/package" "$stage/adapters" "$stage/roles/database/runtime" "$stage/roles/database/lifecycle" "$stage/roles/database/schema" "$stage/roles/application/tasks" "$stage/roles/application/build" "$stage/roles/application/deployment"
install -m 0755 "$tmp/spark" "$stage/spark"
install -m 0755 "$tmp/spark-airgap" "$stage/spark-airgap"
install -m 0755 "$tmp/spark-architecture" "$stage/spark-architecture"
install -m 0755 "$tmp/spark-database" "$stage/spark-database"
install -m 0644 "$tmp/database_cli.py" "$stage/database_cli.py"
install -m 0755 "$tmp/bootstrap-airgap.sh" "$stage/bootstrap-airgap.sh"
install -m 0644 "$tmp/spark-ui.py" "$stage/spark-ui.py"
install -m 0644 "$tmp/spark-ui-core.py" "$stage/spark-ui-core.py"
for file in "$tmp"/architecture/*.py; do install -m 0644 "$file" "$stage/architecture/$(basename "$file")"; done
for file in "$tmp"/config/*.py; do install -m 0644 "$file" "$stage/config/$(basename "$file")"; done
for file in "$tmp"/config/environments/*.yaml; do install -m 0644 "$file" "$stage/config/environments/$(basename "$file")"; done
for file in "$tmp"/roles/*.py; do install -m 0644 "$file" "$stage/roles/$(basename "$file")"; done
for file in "$tmp"/roles/application/*.py; do install -m 0644 "$file" "$stage/roles/application/$(basename "$file")"; done
install -m 0644 "$tmp/roles/application/manifest.yaml" "$stage/roles/application/manifest.yaml"
for file in "$tmp"/roles/application/tasks/*.py; do install -m 0644 "$file" "$stage/roles/application/tasks/$(basename "$file")"; done
for file in "$tmp"/roles/application/build/*.py; do install -m 0644 "$file" "$stage/roles/application/build/$(basename "$file")"; done
for file in "$tmp"/roles/application/deployment/*.py; do install -m 0644 "$file" "$stage/roles/application/deployment/$(basename "$file")"; done
for file in "$tmp"/roles/database/*.py; do install -m 0644 "$file" "$stage/roles/database/$(basename "$file")"; done
install -m 0644 "$tmp/roles/database/manifest.yaml" "$stage/roles/database/manifest.yaml"
for file in "$tmp"/roles/database/tasks/*.py; do install -m 0644 "$file" "$stage/roles/database/tasks/$(basename "$file")"; done
for file in "$tmp"/roles/database/package/*.py; do install -m 0644 "$file" "$stage/roles/database/package/$(basename "$file")"; done
for file in "$tmp"/secrets/*.py; do install -m 0644 "$file" "$stage/secrets/$(basename "$file")"; done
for file in "$tmp"/adapters/*.py; do install -m 0644 "$file" "$stage/adapters/$(basename "$file")"; done
for file in "$tmp"/roles/database/runtime/*.py; do install -m 0644 "$file" "$stage/roles/database/runtime/$(basename "$file")"; done
for file in "$tmp"/roles/database/lifecycle/*.py; do install -m 0644 "$file" "$stage/roles/database/lifecycle/$(basename "$file")"; done
for file in "$tmp"/roles/database/schema/*.py; do install -m 0644 "$file" "$stage/roles/database/schema/$(basename "$file")"; done
install -m 0755 "$tmp/spark-migrate" "$migrate_stage/spark-migrate"
for file in "$tmp"/lib/*.sh; do
  install -m 0644 "$file" "$stage/lib/$(basename "$file")"
done
rsync -a --delete "$tmp/livekit/" "$stage/livekit/"

if [[ -d "$TARGET" ]]; then
  mv "$TARGET" "$backup"
fi
if [[ -d "$MIGRATE_TARGET" ]]; then
  mv "$MIGRATE_TARGET" "$migrate_backup"
fi

rollback_install() {
  rm -f "$CLI_PATH" "$AIRGAP_CLI_PATH" "$ARCHITECTURE_CLI_PATH" "$DATABASE_CLI_PATH" "$MIGRATE_PATH"
  rm -rf "$TARGET" "$MIGRATE_TARGET"
  if [[ -d "$backup" ]]; then
    mv "$backup" "$TARGET"
    ln -sfn "$TARGET/spark" "$CLI_PATH"
    [[ -x "$TARGET/spark-airgap" ]] && ln -sfn "$TARGET/spark-airgap" "$AIRGAP_CLI_PATH"
    [[ -x "$TARGET/spark-architecture" ]] && ln -sfn "$TARGET/spark-architecture" "$ARCHITECTURE_CLI_PATH"
    [[ -x "$TARGET/spark-database" ]] && ln -sfn "$TARGET/spark-database" "$DATABASE_CLI_PATH"
  fi
  if [[ -d "$migrate_backup" ]]; then
    mv "$migrate_backup" "$MIGRATE_TARGET"
    ln -sfn "$MIGRATE_TARGET/spark-migrate" "$MIGRATE_PATH"
  fi
}

if ! mv "$stage" "$TARGET"; then
  rollback_install
  rm -rf "$stage" "$migrate_stage"
  exit 1
fi
if ! mv "$migrate_stage" "$MIGRATE_TARGET"; then
  rollback_install
  rm -rf "$migrate_stage"
  exit 1
fi
chmod 0755 "$TARGET" "$MIGRATE_TARGET"
ln -sfn "$TARGET/spark" "$CLI_PATH"
ln -sfn "$TARGET/spark-airgap" "$AIRGAP_CLI_PATH"
ln -sfn "$TARGET/spark-architecture" "$ARCHITECTURE_CLI_PATH"
ln -sfn "$TARGET/spark-database" "$DATABASE_CLI_PATH"
ln -sfn "$MIGRATE_TARGET/spark-migrate" "$MIGRATE_PATH"

if ! version_output="$($CLI_PATH --version 2>/dev/null)"; then
  echo "Spark Server Manager version smoke test failed; rolling back." >&2
  rollback_install
  exit 1
fi
if [[ "$version_output" != "Spark Server Manager ${EXPECTED_VERSION}" ]]; then
  echo "Unexpected Spark Server Manager version: ${version_output}" >&2
  rollback_install
  exit 1
fi
if ! airgap_version_output="$($AIRGAP_CLI_PATH --version 2>/dev/null)"; then
  echo "Spark Air-Gap backend smoke test failed; rolling back." >&2
  rollback_install
  exit 1
fi
if [[ "$airgap_version_output" != "Spark Air-Gapped Installer ${EXPECTED_AIRGAP_VERSION}" ]]; then
  echo "Unexpected Spark Air-Gap backend version: ${airgap_version_output}" >&2
  rollback_install
  exit 1
fi
if ! migrate_version_output="$($MIGRATE_PATH --version 2>/dev/null)"; then
  echo "Spark Cloud migration companion version smoke test failed; rolling back." >&2
  rollback_install
  exit 1
fi
if [[ "$migrate_version_output" != "Spark Supabase Cloud Migration ${EXPECTED_MIGRATE_VERSION}" ]]; then
  echo "Unexpected Spark migration companion version: ${migrate_version_output}" >&2
  rollback_install
  exit 1
fi
if ! "$DATABASE_CLI_PATH" --help >/dev/null 2>&1; then
  echo "Spark database lifecycle CLI smoke test failed; rolling back." >&2
  rollback_install
  exit 1
fi
if ! "$CLI_PATH" --ui-self-test >/dev/null 2>&1; then
  echo "Spark curses UI smoke test failed; rolling back." >&2
  rollback_install
  exit 1
fi

rm -rf "$backup" "$migrate_backup"
rm -rf /usr/local/share/spark-manager 2>/dev/null || true
printf 'Spark Server Manager %s installed from %s. Run: spark\n' "$EXPECTED_VERSION" "${MAIN_SHA:0:12}"
printf 'Spark Air-Gapped Installer %s installed. Run: spark-airgap --help\n' "$EXPECTED_AIRGAP_VERSION"
printf 'Spark Supabase Cloud Migration %s installed. Run: spark-migrate\n' "$EXPECTED_MIGRATE_VERSION"
