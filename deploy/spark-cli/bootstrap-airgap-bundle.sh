#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Authoritative bootstrap embedded inside every Spark Air-Gap format-v2 bundle.
# Run this file from the extracted bundle root. It intentionally replaces any
# previously installed Spark Manager with the control plane carried by this
# exact verified bundle, so stale same-version patch code cannot survive.

SPARK_ROOT=/opt/spark
TARGET=/usr/local/lib/spark-manager
MIGRATE_TARGET=/usr/local/lib/spark-migrate
CLI_PATH=/usr/local/bin/spark
AIRGAP_CLI_PATH=/usr/local/bin/spark-airgap
MIGRATE_PATH=/usr/local/bin/spark-migrate

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  exec sudo -E "$0" "$@"
fi

SCRIPT_SOURCE="${BASH_SOURCE[0]}"
while [[ -L "$SCRIPT_SOURCE" ]]; do
  DIR="$(cd -P -- "$(dirname -- "$SCRIPT_SOURCE")" && pwd)"
  LINK="$(readlink -- "$SCRIPT_SOURCE")"
  [[ "$LINK" == /* ]] && SCRIPT_SOURCE="$LINK" || SCRIPT_SOURCE="${DIR}/${LINK}"
done
SCRIPT_DIR="$(cd -P -- "$(dirname -- "$SCRIPT_SOURCE")" && pwd)"
unset SCRIPT_SOURCE DIR LINK

root="${1:-$SCRIPT_DIR}"
root="$(readlink -f "$root")"
[[ -d "$root" ]] || { echo "Air-Gap bundle root not found: $root" >&2; exit 2; }
[[ "$root" != "$SPARK_ROOT" && "$root" != "$SPARK_ROOT/"* ]] || {
  echo "Extract the bundle outside ${SPARK_ROOT} before bootstrapping (for example /opt/install)." >&2
  exit 2
}

for cmd in tar sha256sum sed grep find dpkg apt-get readlink; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Required bootstrap command is missing: $cmd" >&2; exit 1; }
done

manifest="${root}/metadata/manifest.env"
[[ -f "$manifest" && -f "${root}/SHA256SUMS" ]] || {
  echo "Invalid Spark Air-Gap bundle: manifest/checksum files are missing." >&2
  exit 1
}
meta() { sed -n "s/^$1=//p" "$manifest" | tail -n1; }

format="$(meta FORMAT_VERSION)"
os_expected="$(meta UBUNTU_VERSION)"
arch_expected="$(meta ARCH)"
spark_commit="$(meta SPARK_COMMIT)"
bundle_id="$(meta BUNDLE_ID)"
[[ "$format" == "2" ]] || { echo "This bootstrap requires Spark Air-Gap format 2; found ${format:-missing}." >&2; exit 1; }
[[ "$spark_commit" =~ ^[0-9a-f]{40}$ ]] || { echo "Invalid Spark commit in bundle." >&2; exit 1; }
[[ -n "$bundle_id" ]] || { echo "Bundle ID is missing." >&2; exit 1; }

for path in \
  sources/spark.git.bundle \
  sources/supabase.git.bundle \
  docker/docker-images.tar.gz \
  edge-functions/.spark-bundled-functions \
  edge-functions/deno.jsonc \
  edge-functions/main/index.ts \
  deno-cache \
  metadata/edge-runtime.env; do
  [[ -e "${root}/${path}" ]] || { echo "Bundle is incomplete: ${path}" >&2; exit 1; }
done

printf 'Validating complete bundle SHA256 manifest...\n'
(cd "$root" && sha256sum -c SHA256SUMS)

. /etc/os-release
arch_actual="$(dpkg --print-architecture)"
[[ "${ID:-}" == ubuntu ]] || { echo "Spark Air-Gap target must be Ubuntu." >&2; exit 1; }
[[ "${VERSION_ID:-}" == "$os_expected" ]] || {
  echo "Bundle target is Ubuntu ${os_expected}; this server is ${VERSION_ID:-unknown}." >&2
  exit 1
}
[[ "$arch_actual" == "$arch_expected" ]] || {
  echo "Bundle architecture is ${arch_expected}; this server is ${arch_actual}." >&2
  exit 1
}

mapfile -t debs < <(find "${root}/apt" -maxdepth 1 -type f -name '*.deb' -print | sort)
((${#debs[@]} > 0)) || { echo "Offline APT payload is empty." >&2; exit 1; }

if [[ -f "$root/apt/install-local.sh" ]]; then
  bash "$root/apt/install-local.sh" "$root/apt"
else
  # Legacy bundles still fail closed on removals/downgrades.
  export DEBIAN_FRONTEND=noninteractive
  apt_guard="$(mktemp -d)"
  trap 'rm -rf "$apt_guard" 2>/dev/null || true' EXIT
  install -d -m 0755 "${apt_guard}/sources.list.d"
  : >"${apt_guard}/sources.list"
  apt-get \
    -o "Dir::Etc::sourcelist=${apt_guard}/sources.list" \
    -o "Dir::Etc::sourceparts=${apt_guard}/sources.list.d" \
    -o APT::Get::List-Cleanup=0 \
    install -y --no-remove "${debs[@]}"
  rm -rf "$apt_guard"
  trap - EXIT

fi

for cmd in git python3 rsync docker npm nginx; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Offline package install did not provide: $cmd" >&2; exit 1; }
done
systemctl enable --now docker nginx

# Validate the bundled control plane and payload before replacing existing source.
restore_stage="$(mktemp -d /opt/.spark-airgap-restore.XXXXXX)"
trap 'rm -rf -- "$restore_stage"' EXIT
git clone --branch main "${root}/sources/spark.git.bundle" "${restore_stage}/spark"
git -C "${restore_stage}/spark" checkout "$spark_commit"
git -C "${restore_stage}/spark" branch -f main "$spark_commit"
git -C "${restore_stage}/spark" checkout main
git -C "${restore_stage}/spark" remote set-url origin https://github.com/sh1375/Spark.git
git -C "${restore_stage}/spark" update-ref refs/remotes/origin/main "$spark_commit"
[[ "$(git -C "${restore_stage}/spark" rev-parse HEAD)" == "$spark_commit" ]] || {
  echo "Restored Spark source commit does not match bundle manifest." >&2
  exit 1
}
# The complete SHA256 manifest was already verified above. Source checkout below
# verifies the Spark commit, and import performs the remaining semantic checks.
if [[ -e "$SPARK_ROOT" ]]; then
  backup="$(mktemp -d /var/backups/spark-airgap-source.XXXXXX)"
  chmod 0700 "$backup"
  mv "$SPARK_ROOT" "${backup}/spark"
  printf 'Existing source preserved at %s\n' "${backup}/spark"
fi
if ! mv "${restore_stage}/spark" "$SPARK_ROOT"; then
  [[ -z "${backup:-}" ]] || mv "${backup}/spark" "$SPARK_ROOT"
  exit 1
fi
rm -rf "$restore_stage"
trap - EXIT

source_dir="${SPARK_ROOT}/deploy/spark-cli"
for path in \
  spark spark-airgap spark-ui.py spark-ui-core.py spark-migrate \
  lib/airgap.sh lib/airgap-build.sh lib/airgap-runtime.sh lib/installation-universal.sh \
  lib/airgap-edge-functions.sh lib/airgap-edge-functions-runtime-fix.sh lib/airgap-edge-final.sh \
  lib/airgap-observability-quiet.sh lib/airgap-observability-quiet-base.sh; do
  [[ -f "${source_dir}/${path}" ]] || { echo "Bundled Spark control plane is missing: ${path}" >&2; exit 1; }
done
[[ -d "${SPARK_ROOT}/deploy/spark-cli/livekit" ]] || { echo "Bundled LiveKit assets are missing." >&2; exit 1; }

bash -n "${source_dir}/spark"
bash -n "${source_dir}/spark-airgap"
for file in "${source_dir}"/lib/*.sh; do bash -n "$file"; done
python3 - "${source_dir}/spark-ui.py" "${source_dir}/spark-ui-core.py" <<'PY'
from pathlib import Path
import sys
for value in sys.argv[1:]:
    compile(Path(value).read_text(encoding='utf-8'), value, 'exec')
PY
python3 "${source_dir}/spark-ui.py" --self-test

# Always replace the Manager from the verified bundle. The old bootstrap tried
# to preserve a same-version Manager and allowed stale hotfix code to survive;
# format-v2 intentionally makes the bundle authoritative.
stage="$(mktemp -d /usr/local/lib/spark-manager.airgap.XXXXXX)"
chmod 0755 "$stage"
install -d -m 0755 "${stage}/lib" "${stage}/livekit"
install -m 0755 "${source_dir}/spark" "${stage}/spark"
install -m 0755 "${source_dir}/spark-airgap" "${stage}/spark-airgap"
install -m 0644 "${source_dir}/spark-ui.py" "${stage}/spark-ui.py"
install -m 0644 "${source_dir}/spark-ui-core.py" "${stage}/spark-ui-core.py"
for file in "${source_dir}"/lib/*.sh; do
  install -m 0644 "$file" "${stage}/lib/$(basename "$file")"
done
rsync -a --delete "${SPARK_ROOT}/deploy/spark-cli/livekit/" "${stage}/livekit/"
printf '%s\n' "$spark_commit" >"${stage}/.spark-control-plane-commit"
chmod 0644 "${stage}/.spark-control-plane-commit"

rm -rf "$TARGET"
mv "$stage" "$TARGET"
chmod 0755 "$TARGET"
ln -sfn "$TARGET/spark" "$CLI_PATH"
ln -sfn "$TARGET/spark-airgap" "$AIRGAP_CLI_PATH"

rm -rf "$MIGRATE_TARGET"
install -d -m 0755 "$MIGRATE_TARGET"
install -m 0755 "${source_dir}/spark-migrate" "$MIGRATE_TARGET/spark-migrate"
ln -sfn "$MIGRATE_TARGET/spark-migrate" "$MIGRATE_PATH"

"$CLI_PATH" --ui-self-test

# Import the same verified extracted root. The format-v2 Manager performs the
# stronger Edge Runtime/cache/image identity validation before activation.
SPARK_AIRGAP_SHA256_PREVERIFIED=1 "$AIRGAP_CLI_PATH" --backend-action airgap-import "$root"

printf '\nSpark Air-Gap format-v2 bundle bootstrapped successfully.\n'
printf 'Bundle        : %s\n' "$bundle_id"
printf 'Spark commit  : %s\n' "$spark_commit"
printf 'Control plane : %s\n' "$(cat "${TARGET}/.spark-control-plane-commit")"
printf 'Next          : run spark, then Installation Air-Gapped -> Run complete offline install\n'
