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
SOURCE_ZIP="$ROOT/sources/Spark-main.zip"
[[ -f "$ROOT/metadata/manifest.json" && -d "$ROOT/manager" && -f "$SOURCE_ZIP" ]] || {
  echo 'Invalid Spark ZIP + Manager air-gap bundle.' >&2
  exit 1
}

for cmd in python3 install ln mv rm mktemp cp mkdir flock rmdir; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Required command missing: $cmd" >&2; exit 1; }
done

# Keep the lock file in place so every invocation locks the same inode.
original_umask=$(umask)
umask 077
exec {install_lock}>>/run/spark-manager-full-source-install.lock
umask "$original_umask"
flock -x "$install_lock"

readarray -t META < <(python3 - "$ROOT/metadata/manifest.json" <<'PY'
import json, sys
p=json.load(open(sys.argv[1], encoding='utf-8'))
for key in ('format_version','spark_revision','spark_repository','spark_branch','spark_source_archive','ubuntu','architecture','payload','target_network_required'):
    print(p.get(key,''))
PY
)
format="${META[0]:-}"
revision="${META[1]:-}"
repo_expected="${META[2]:-}"
branch_expected="${META[3]:-}"
source_archive="${META[4]:-}"
os_expected="${META[5]:-}"
arch_expected="${META[6]:-}"
payload="${META[7]:-}"
network_required="${META[8]:-}"

[[ "$format" == 3 ]] || { echo "Unsupported Spark ZIP bundle format: $format" >&2; exit 1; }
[[ "$repo_expected" == "$SPARK_REPO_URL" ]] || { echo "Unexpected Spark repository: $repo_expected" >&2; exit 1; }
[[ "$branch_expected" == main ]] || { echo "Unexpected Spark branch: $branch_expected" >&2; exit 1; }
[[ "$source_archive" == sources/Spark-main.zip ]] || { echo "Unexpected Spark source archive: $source_archive" >&2; exit 1; }
[[ "$payload" == spark-main-zip-and-manager ]] || { echo "Unexpected bundle payload: $payload" >&2; exit 1; }
[[ "$network_required" == False || "$network_required" == false ]] || { echo 'Target bundle unexpectedly requires network access.' >&2; exit 1; }

. /etc/os-release
[[ "${ID:-}" == ubuntu ]] || { echo 'Spark target must be Ubuntu.' >&2; exit 1; }
if [[ "$os_expected" != any ]]; then
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

python3 - "$SOURCE_ZIP" <<'PY'
from pathlib import PurePosixPath
import stat, sys, zipfile
path = sys.argv[1]
with zipfile.ZipFile(path) as zf:
    names = zf.namelist()
    if not names:
        raise SystemExit('Spark source ZIP is empty')
    for info in zf.infolist():
        p = PurePosixPath(info.filename)
        if p.is_absolute() or '..' in p.parts or not p.parts or p.parts[0] != 'Spark-main':
            raise SystemExit(f'Unsafe Spark ZIP path: {info.filename}')
        mode = (info.external_attr >> 16) & 0xFFFF
        if stat.S_ISLNK(mode):
            raise SystemExit(f'Symlink entries are not allowed in Spark ZIP: {info.filename}')
    required = {
        'Spark-main/package.json',
        'Spark-main/package-lock.json',
        'Spark-main/deploy/spark-cli/spark',
        'Spark-main/deploy/spark-cli/spark-architecture',
    }
    missing = sorted(required - set(names))
    if missing:
        raise SystemExit('Spark source ZIP missing: ' + ', '.join(missing))
PY

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

path_exists() {
  [[ -e "$1" || -L "$1" ]]
}

move_exact() {
  local from="$1" to="$2"
  if ! mv -nT -- "$from" "$to"; then
    printf 'Could not rename %s to %s.\n' "$from" "$to" >&2
    return 1
  fi
  # GNU mv can return success after declining to clobber its destination.
  if path_exists "$from"; then
    printf 'Rename skipped from %s to %s.\n' "$from" "$to" >&2
    return 1
  fi
}

move_from=()
move_to=()
backups=()
staging_dirs=()
migrate_dir=''
migrate_created=0
committed=0

record_move() {
  move_exact "$1" "$2" || return 1
  move_from+=("$1")
  move_to+=("$2")
}

save_previous() {
  local target="$1" previous="${1}.previous.$$"
  if path_exists "$previous"; then
    echo "Refusing to overwrite existing backup: $previous" >&2
    return 1
  fi
  if path_exists "$target"; then
    record_move "$target" "$previous" || return 1
    backups+=("$previous")
  fi
}

publish_file() {
  local staged="$1" target="$2"
  if [[ -d "$target" && ! -L "$target" ]]; then
    echo "Refusing to replace directory: $target" >&2
    return 1
  fi
  save_previous "$target" || return 1
  record_move "$staged" "$target"
}

resolve_migrate_dir() {
  python3 - "$MIGRATE_TARGET" "$TARGET" "$SPARK_SOURCE_TARGET" "$BIN_DIR" "$INBOX" <<'PY'
from collections import deque
import os, stat, sys

migration, manager, source, bin_dir, inbox = sys.argv[1:]

# These entries are renamed during publication. Compare their names under
# their resolved parents without following a symlink at the entry itself.
def entry_path(path):
    return os.path.join(os.path.realpath(os.path.dirname(path)), os.path.basename(path))

replaced = {entry_path(manager), entry_path(source)}

def trusted_directory(path, info):
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
        raise SystemExit(f'Untrusted migration directory component: {path}')

def resolve(path):
    current = '/'
    trusted_directory(current, os.lstat(current))
    pending = deque(path.split('/'))
    followed = 0
    while pending:
        part = pending.popleft()
        if part in ('', '.'):
            continue
        if part == '..':
            current = os.path.dirname(current)
            continue
        entry = os.path.join(current, part)
        if entry in replaced:
            raise SystemExit(f'Migration path traverses an installation path being replaced: {entry}')
        info = os.lstat(entry)
        if stat.S_ISLNK(info.st_mode):
            followed += 1
            if info.st_uid != 0 or followed > 40:
                raise SystemExit(f'Untrusted migration directory symlink: {entry}')
            target = os.readlink(entry)
            if target.startswith('/'):
                current = '/'
            pending.extendleft(reversed(target.split('/')))
        else:
            trusted_directory(entry, info)
            current = entry
    return current

try:
    parent = resolve(os.path.dirname(migration))
    entry = os.path.join(parent, os.path.basename(migration))
    try:
        os.lstat(entry)
    except FileNotFoundError:
        resolved = entry
    else:
        resolved = resolve(entry)
    if resolved in ('/', parent, os.path.realpath(bin_dir)):
        raise SystemExit(f'Migration directory conflicts with an installation path: {resolved}')
    inbox_path = os.path.realpath(inbox)
    if os.path.commonpath((resolved, inbox_path)) in (resolved, inbox_path):
        raise SystemExit(f'Migration directory overlaps the shared inbox: {resolved}')
    # The suffix preserves directory names that end in a newline through Bash substitution.
    print(resolved + '/.')
except OSError as error:
    raise SystemExit(f'Cannot resolve trusted migration directory: {error}')
PY
}

finish_install() {
  local status=$? index from to rollback_failed=0
  trap - EXIT
  if (( ! committed )); then
    for ((index=${#move_from[@]} - 1; index >= 0; index--)); do
      from="${move_from[index]}"
      to="${move_to[index]}"
      if ! move_exact "$to" "$from"; then
        printf 'Could not restore %s from %s.\n' "$from" "$to" >&2
        rollback_failed=1
      fi
    done
  fi
  if (( rollback_failed )); then
    echo 'Manual recovery required; remaining backup and staging paths preserved.' >&2
    exit 1
  fi
  if (( committed && ${#backups[@]} )); then
    rm -rf -- "${backups[@]}" || status=1
  fi
  if (( ${#staging_dirs[@]} )); then
    rm -rf -- "${staging_dirs[@]}" || status=1
  fi
  if (( ! committed && migrate_created )); then
    rmdir -- "$migrate_dir" || status=1
  fi
  exit "$status"
}

install -d -m 0755 /opt /usr/local/lib
trap finish_install EXIT
stage="$(mktemp -d /usr/local/lib/spark-manager.airgap.XXXXXX)"
staging_dirs+=("$stage")
source_stage_parent="$(mktemp -d /opt/spark.airgap.XXXXXX)"
staging_dirs+=("$source_stage_parent")
source_stage="${source_stage_parent}/repo"
mkdir -p "$source_stage"

cp -a "$ROOT/manager/." "$stage/"
printf '%s\n' "$revision" >"$stage/.revision"
chmod 0644 "$stage/.revision"
chmod 0755 "$stage/spark" "$stage/spark-airgap" "$stage/spark-architecture" "$stage/spark-database" "$stage/spark-manager-airgap-bootstrap" "$stage/lib/spark-manager-airgap" "$stage/lib/build-manager-airgap"

python3 - "$SOURCE_ZIP" "$source_stage" <<'PY'
from pathlib import Path, PurePosixPath
import os, stat, sys, zipfile
archive = Path(sys.argv[1])
dest = Path(sys.argv[2])
with zipfile.ZipFile(archive) as zf:
    for info in zf.infolist():
        parts = PurePosixPath(info.filename).parts
        if not parts or parts[0] != 'Spark-main':
            raise SystemExit(f'Unexpected ZIP root: {info.filename}')
        rel = parts[1:]
        if not rel:
            continue
        target = dest.joinpath(*rel)
        mode = (info.external_attr >> 16) & 0xFFFF
        if stat.S_ISLNK(mode):
            raise SystemExit(f'Symlink entries are not allowed: {info.filename}')
        if info.is_dir():
            target.mkdir(parents=True, exist_ok=True)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        with zf.open(info) as src, open(target, 'wb') as out:
            while True:
                chunk = src.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)
        perms = stat.S_IMODE(mode)
        if perms:
            os.chmod(target, perms)
PY

printf '%s\n' "$revision" >"$source_stage/.spark-source-revision"
printf '%s\n' "$SPARK_REPO_URL" >"$source_stage/.spark-source-origin"
printf 'main\n' >"$source_stage/.spark-source-branch"
chmod 0644 "$source_stage/.spark-source-revision" "$source_stage/.spark-source-origin" "$source_stage/.spark-source-branch"

[[ -f "$source_stage/package.json" && -f "$source_stage/package-lock.json" && -d "$source_stage/deploy/spark-cli" ]] || {
  echo 'Extracted Spark source snapshot is incomplete.' >&2
  exit 1
}

bin_stage="$(mktemp -d "$BIN_DIR/.spark-airgap.XXXXXX")"
staging_dirs+=("$bin_stage")
helper_stage="$(mktemp -d "${SUDO_HELPER}.airgap.XXXXXX")"
staging_dirs+=("$helper_stage")
install -m 0755 "$stage/spark-manager-airgap-bootstrap" "$helper_stage/helper"

links=(spark spark-airgap spark-architecture spark-database lib/spark-manager-airgap lib/build-manager-airgap)
for entry in "${links[@]}"; do
  ln -s -- "$TARGET/$entry" "$bin_stage/${entry##*/}"
done

migrate_stage=''
if [[ -f "$stage/spark-migrate" ]]; then
  migrate_dir="$(resolve_migrate_dir)"
  migrate_dir="${migrate_dir%/.}"
  if ! path_exists "$migrate_dir"; then
    mkdir -m 0755 -- "$migrate_dir"
    migrate_created=1
  fi
  migrate_stage="$(mktemp -d "$migrate_dir/.spark-airgap.XXXXXX")"
  staging_dirs+=("$migrate_stage")
  install -m 0755 "$stage/spark-migrate" "$migrate_stage/spark-migrate"
  ln -s -- "$MIGRATE_TARGET/spark-migrate" "$bin_stage/spark-migrate"
fi

if ! { save_previous "$TARGET" && save_previous "$SPARK_SOURCE_TARGET"; }; then
  echo 'Initial backup failed; restoring previous installation paths.' >&2
  exit 1
fi

record_move "$stage" "$TARGET"
record_move "$source_stage" "$SPARK_SOURCE_TARGET"
for entry in "${links[@]}"; do
  publish_file "$bin_stage/${entry##*/}" "$BIN_DIR/${entry##*/}"
done
publish_file "$helper_stage/helper" "$SUDO_HELPER"
if [[ -n "$migrate_stage" ]]; then
  publish_file "$migrate_stage/spark-migrate" "$migrate_dir/spark-migrate"
  publish_file "$bin_stage/spark-migrate" "$BIN_DIR/spark-migrate"
fi

# Preserve the original installer ordering: prepare the inbox before validation.
install -d -m 1777 "$INBOX"

if ! (
  exec {install_lock}>&- || exit 1
  [[ "$(cat "$SPARK_SOURCE_TARGET/.spark-source-origin")" == "$SPARK_REPO_URL" ]] &&
  [[ "$(cat "$SPARK_SOURCE_TARGET/.spark-source-branch")" == main ]] &&
  [[ -f "$SPARK_SOURCE_TARGET/package.json" && -f "$SPARK_SOURCE_TARGET/package-lock.json" ]] &&
  SPARK_ENV_PROFILE="$TARGET/config/environments/example.production.yaml" "$BIN_DIR/spark-architecture" validate >/dev/null &&
  "$BIN_DIR/spark-database" --help >/dev/null &&
  "$BIN_DIR/spark-manager-airgap" --help >/dev/null &&
  "$BIN_DIR/spark" --ui-self-test >/dev/null &&
  python3 "$TARGET/spark-ui.py" --self-test >/dev/null
); then
  echo 'Spark ZIP + Manager offline post-install validation failed; rolling back.' >&2
  exit 1
fi

committed=1
rm -rf -- "${backups[@]}" "${staging_dirs[@]}"
trap - EXIT
printf 'Spark main ZIP snapshot + Manager installed completely offline.\nRevision: %s\nRepository source: %s\nInstalled source: %s\nTarget network access used: NO\nRun: spark\n' "$revision" "$SPARK_REPO_URL" "$SPARK_SOURCE_TARGET"
printf 'Restricted update helper: %s\n' "$SUDO_HELPER"
