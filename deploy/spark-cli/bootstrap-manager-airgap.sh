#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

TARGET=/usr/local/lib/spark-manager
MIGRATE_TARGET=/usr/local/lib/spark-migrate
SPARK_SOURCE_TARGET=/opt/spark
SPARK_REPO_URL=https://github.com/sh1375/Spark.git
BIN_DIR=/usr/local/bin
SUDO_HELPER=/usr/local/sbin/spark-manager-airgap-bootstrap
INBOX=/var/tmp/spark-manager-inbox

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  exec sudo -E "$0" "$@"
fi

ROOT="$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$ROOT/SHA256SUMS" && -f "$ROOT/metadata/manifest.json" && -d "$ROOT/manager" && -f "$ROOT/sources/spark.git.bundle" ]] || {
  echo 'Invalid Spark full-repository + Manager air-gap bundle.' >&2
  exit 1
}

for cmd in sha256sum python3 install ln mv rm mktemp git cp mkdir; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Required command missing: $cmd" >&2; exit 1; }
done

(cd "$ROOT" && sha256sum -c SHA256SUMS)

readarray -t META < <(python3 - "$ROOT/metadata/manifest.json" <<'PY'
import json, sys
p=json.load(open(sys.argv[1], encoding='utf-8'))
for key in ('format_version','spark_revision','spark_repository','spark_branch','ubuntu','architecture','payload'):
    print(p.get(key,''))
PY
)
format="${META[0]:-}"
revision="${META[1]:-}"
repo_expected="${META[2]:-}"
branch_expected="${META[3]:-}"
os_expected="${META[4]:-}"
arch_expected="${META[5]:-}"
payload="${META[6]:-}"
[[ "$format" == 2 ]] || { echo "Unsupported full Spark bundle format: $format" >&2; exit 1; }
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid Spark revision in bundle.' >&2; exit 1; }
[[ "$repo_expected" == "$SPARK_REPO_URL" ]] || { echo "Unexpected Spark repository: $repo_expected" >&2; exit 1; }
[[ "$branch_expected" == main ]] || { echo "Unexpected Spark branch: $branch_expected" >&2; exit 1; }
[[ "$payload" == spark-full-repository-and-manager ]] || { echo "Unexpected bundle payload: $payload" >&2; exit 1; }

. /etc/os-release
[[ "${ID:-}" == ubuntu ]] || { echo 'Spark target must be Ubuntu.' >&2; exit 1; }
if [[ "$os_expected" != "any" ]]; then
  case "${VERSION_ID:-}" in
    "$os_expected"|"$os_expected".*) ;;
    *) echo "Bundle targets Ubuntu $os_expected; this server is ${VERSION_ID:-unknown}." >&2; exit 1 ;;
  esac
fi
arch_actual="$(dpkg --print-architecture 2>/dev/null || uname -m)"
[[ "$arch_actual" == "$arch_expected" || ( "$arch_expected" == amd64 && "$arch_actual" == x86_64 ) ]] || {
  echo "Bundle architecture is $arch_expected; this server is $arch_actual." >&2
  exit 1
}

source_bundle="$ROOT/sources/spark.git.bundle"
verify_repo="$(mktemp -d)"
trap 'rm -rf "$verify_repo"' EXIT
git init --bare -q "$verify_repo" || {
  echo 'Unable to initialize temporary Git verifier.' >&2
  exit 1
}
git -C "$verify_repo" bundle verify "$source_bundle" >/dev/null 2>&1 || {
  echo 'Spark Git bundle verification failed.' >&2
  exit 1
}
bundle_head="$(git bundle list-heads "$source_bundle" refs/heads/main)"
[[ "$bundle_head" == "$revision refs/heads/main" ]] || {
  echo 'Spark Git bundle main ref does not match manifest revision.' >&2
  exit 1
}
rm -rf "$verify_repo"
trap - EXIT

python3 - <<'PY'
import curses, pty, selectors
PY

required=(spark spark-airgap spark-architecture spark-database spark-ui.py spark-ui-base.py spark-ui-core.py spark-manager-airgap-bootstrap core architecture config adapters secrets roles lib)
for item in "${required[@]}"; do
  [[ -e "$ROOT/manager/$item" ]] || { echo "Manager payload missing: $item" >&2; exit 1; }
done
[[ -f "$ROOT/manager/lib/spark-manager-airgap" && -f "$ROOT/manager/lib/build-manager-airgap" ]] || {
  echo 'Manager Air-Gap control commands are missing.' >&2
  exit 1
}

python3 -m compileall -q \
  "$ROOT/manager/core" "$ROOT/manager/config" "$ROOT/manager/architecture" \
  "$ROOT/manager/adapters" "$ROOT/manager/secrets" "$ROOT/manager/roles"
bash -n "$ROOT/manager/spark" "$ROOT/manager/spark-airgap" "$ROOT/manager/spark-architecture" "$ROOT/manager/spark-database" "$ROOT/manager/spark-manager-airgap-bootstrap" "$ROOT/manager/lib/spark-manager-airgap" "$ROOT/manager/lib/build-manager-airgap"

stage="$(mktemp -d /usr/local/lib/spark-manager.airgap.XXXXXX)"
source_stage_parent="$(mktemp -d /opt/spark.airgap.XXXXXX)"
source_stage="${source_stage_parent}/repo"
trap 'rm -rf "$stage" "$source_stage_parent"' EXIT

cp -a "$ROOT/manager/." "$stage/"
printf '%s\n' "$revision" >"$stage/.revision"
chmod 0644 "$stage/.revision"
chmod 0755 "$stage/spark" "$stage/spark-airgap" "$stage/spark-architecture" "$stage/spark-database" "$stage/spark-manager-airgap-bootstrap" "$stage/lib/spark-manager-airgap" "$stage/lib/build-manager-airgap"

git clone -q --branch main "$source_bundle" "$source_stage" || {
  echo 'Unable to materialize Spark repository from offline bundle.' >&2
  exit 1
}
[[ "$(git -C "$source_stage" rev-parse HEAD)" == "$revision" ]] || {
  echo 'Materialized Spark repository revision mismatch.' >&2
  exit 1
}
git -C "$source_stage" remote set-url origin "$SPARK_REPO_URL"
git -C "$source_stage" update-ref refs/remotes/origin/main "$revision"
[[ -f "$source_stage/package.json" && -d "$source_stage/deploy/spark-cli" ]] || {
  echo 'Materialized Spark repository is incomplete.' >&2
  exit 1
}

backup="${TARGET}.previous.$$"
migrate_backup="${MIGRATE_TARGET}.previous.$$"
source_backup="${SPARK_SOURCE_TARGET}.previous.$$"
[[ ! -e "$TARGET" ]] || mv "$TARGET" "$backup"
[[ ! -e "$MIGRATE_TARGET" ]] || mv "$MIGRATE_TARGET" "$migrate_backup"
[[ ! -e "$SPARK_SOURCE_TARGET" ]] || mv "$SPARK_SOURCE_TARGET" "$source_backup"

rollback_install() {
  rm -f "$BIN_DIR/spark" "$BIN_DIR/spark-airgap" "$BIN_DIR/spark-architecture" "$BIN_DIR/spark-database" "$BIN_DIR/spark-manager-airgap" "$BIN_DIR/build-manager-airgap" "$BIN_DIR/spark-migrate"
  rm -rf "$TARGET" "$MIGRATE_TARGET" "$SPARK_SOURCE_TARGET"
  if [[ -d "$backup" ]]; then
    mv "$backup" "$TARGET"
    [[ -x "$TARGET/spark" ]] && ln -sfn "$TARGET/spark" "$BIN_DIR/spark"
    [[ -x "$TARGET/spark-airgap" ]] && ln -sfn "$TARGET/spark-airgap" "$BIN_DIR/spark-airgap"
    [[ -x "$TARGET/spark-architecture" ]] && ln -sfn "$TARGET/spark-architecture" "$BIN_DIR/spark-architecture"
    [[ -x "$TARGET/spark-database" ]] && ln -sfn "$TARGET/spark-database" "$BIN_DIR/spark-database"
    [[ -x "$TARGET/lib/spark-manager-airgap" ]] && ln -sfn "$TARGET/lib/spark-manager-airgap" "$BIN_DIR/spark-manager-airgap"
    [[ -x "$TARGET/lib/build-manager-airgap" ]] && ln -sfn "$TARGET/lib/build-manager-airgap" "$BIN_DIR/build-manager-airgap"
  fi
  if [[ -d "$migrate_backup" ]]; then
    mv "$migrate_backup" "$MIGRATE_TARGET"
    [[ -x "$MIGRATE_TARGET/spark-migrate" ]] && ln -sfn "$MIGRATE_TARGET/spark-migrate" "$BIN_DIR/spark-migrate"
  fi
  if [[ -e "$source_backup" ]]; then
    mv "$source_backup" "$SPARK_SOURCE_TARGET"
  fi
}

if ! mv "$stage" "$TARGET"; then
  rollback_install
  exit 1
fi
if ! mv "$source_stage" "$SPARK_SOURCE_TARGET"; then
  rollback_install
  exit 1
fi
rm -rf "$source_stage_parent"
trap - EXIT

ln -sfn "$TARGET/spark" "$BIN_DIR/spark"
ln -sfn "$TARGET/spark-airgap" "$BIN_DIR/spark-airgap"
ln -sfn "$TARGET/spark-architecture" "$BIN_DIR/spark-architecture"
ln -sfn "$TARGET/spark-database" "$BIN_DIR/spark-database"
ln -sfn "$TARGET/lib/spark-manager-airgap" "$BIN_DIR/spark-manager-airgap"
ln -sfn "$TARGET/lib/build-manager-airgap" "$BIN_DIR/build-manager-airgap"
install -m 0755 "$TARGET/spark-manager-airgap-bootstrap" "$SUDO_HELPER"
install -d -m 1777 "$INBOX"
if [[ -f "$TARGET/spark-migrate" ]]; then
  install -d -m 0755 "$MIGRATE_TARGET"
  install -m 0755 "$TARGET/spark-migrate" "$MIGRATE_TARGET/spark-migrate"
  ln -sfn "$MIGRATE_TARGET/spark-migrate" "$BIN_DIR/spark-migrate"
fi

if ! {
  [[ "$(git -C "$SPARK_SOURCE_TARGET" rev-parse HEAD)" == "$revision" ]] &&
  [[ "$(git -C "$SPARK_SOURCE_TARGET" branch --show-current)" == main ]] &&
  [[ "$(git -C "$SPARK_SOURCE_TARGET" remote get-url origin)" == "$SPARK_REPO_URL" ]] &&
  SPARK_MANAGER_REVISION="$revision" "$BIN_DIR/spark-architecture" revision | grep -Fq "Revision: $revision" &&
  SPARK_ENV_PROFILE="$TARGET/config/environments/example.production.yaml" "$BIN_DIR/spark-architecture" validate >/dev/null &&
  "$BIN_DIR/spark-database" --help >/dev/null &&
  "$BIN_DIR/spark-manager-airgap" --help >/dev/null &&
  "$BIN_DIR/spark" --ui-self-test >/dev/null &&
  python3 "$TARGET/spark-ui.py" --self-test >/dev/null
}; then
  echo 'Spark full-repository + Manager offline post-install validation failed; rolling back.' >&2
  rollback_install
  exit 1
fi

rm -rf "$backup" "$migrate_backup" "$source_backup"
printf 'Spark full repository + Manager installed from offline bundle.\nRevision: %s\nRepository: %s\nSource: %s\nRun: spark\n' "$revision" "$SPARK_REPO_URL" "$SPARK_SOURCE_TARGET"
printf 'Restricted update helper: %s\n' "$SUDO_HELPER"
