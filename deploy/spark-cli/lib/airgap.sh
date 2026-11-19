# Spark Air-Gapped installation support.
# Sourced only by spark-airgap. Normal online installation remains unchanged.

AIRGAP_FORMAT_VERSION="1"
AIRGAP_HOME="${AIRGAP_HOME:-/opt/spark-airgap}"
AIRGAP_BUNDLES_DIR="${AIRGAP_HOME}/bundles"
AIRGAP_CURRENT_LINK="${AIRGAP_HOME}/current"
AIRGAP_CONF="${CONFIG_DIR}/airgap.conf"
AIRGAP_SHIM_DIR="/run/spark-airgap/bin"
AIRGAP_REAL_DOCKER="${AIRGAP_REAL_DOCKER:-/usr/bin/docker}"
AIRGAP_REAL_NPM="${AIRGAP_REAL_NPM:-/usr/bin/npm}"

# Preserve final online implementations after all standard modules are loaded.
eval "$(declare -f install_step_2 | sed '1s/install_step_2/install_step_2_online/')"
eval "$(declare -f install_step_3 | sed '1s/install_step_3/install_step_3_online/')"
eval "$(declare -f install_step_4 | sed '1s/install_step_4/install_step_4_online/')"
eval "$(declare -f install_step_10 | sed '1s/install_step_10/install_step_10_online/')"
eval "$(declare -f install_step_11 | sed '1s/install_step_11/install_step_11_online/')"
eval "$(declare -f install_step_13 | sed '1s/install_step_13/install_step_13_online/')"
eval "$(declare -f install_step_17 | sed '1s/install_step_17/install_step_17_online/')"

airgap_is_active() {
  [[ "${SPARK_AIRGAP_ACTIVE:-0}" == "1" ]]
}

airgap_current_root() {
  if [[ -n "${AIRGAP_ROOT:-}" && -d "${AIRGAP_ROOT}" ]]; then
    printf '%s\n' "$AIRGAP_ROOT"
    return 0
  fi
  if [[ -L "$AIRGAP_CURRENT_LINK" || -d "$AIRGAP_CURRENT_LINK" ]]; then
    readlink -f "$AIRGAP_CURRENT_LINK"
    return 0
  fi
  return 1
}

airgap_meta_from() {
  local root="$1" key="$2" file="${1}/metadata/manifest.env"
  [[ -f "$file" ]] || return 1
  sed -n "s/^${key}=//p" "$file" | tail -n1
}

airgap_meta() {
  local root
  root="$(airgap_current_root)" || return 1
  airgap_meta_from "$root" "$1"
}

airgap_require_file() {
  local path="$1"
  [[ -f "$path" ]] || { fail "Air-gap artifact missing: $path"; return 1; }
}

airgap_validate_checksum_manifest() {
  local root="$1"
  airgap_require_file "${root}/SHA256SUMS" || return 1
  # A checksum list can pass while omitting artifacts. Require exact coverage
  # and safe regular files before asking sha256sum to read any listed paths.
  python3 - "$root" <<'PY' || return 1
from pathlib import Path, PurePosixPath
import re, sys
root = Path(sys.argv[1])
listed = set()
for line in (root / 'SHA256SUMS').read_text().splitlines():
    match = re.fullmatch(r'[0-9a-f]{64} [ *](\./[^\r\n]+)', line)
    if not match:
        raise SystemExit('Invalid bundle checksum entry')
    name = match[1]
    if '..' in PurePosixPath(name).parts or name in listed or name == './SHA256SUMS':
        raise SystemExit('Unsafe or duplicate bundle checksum entry')
    listed.add(name)
actual = set()
for path in root.rglob('*'):
    if path.is_symlink() or not (path.is_file() or path.is_dir()):
        raise SystemExit(f'Unsupported bundle artifact: {path.relative_to(root)}')
    if path.is_file() and path != root / 'SHA256SUMS':
        actual.add('./' + path.relative_to(root).as_posix())
if not actual or actual != listed:
    raise SystemExit('Bundle checksum coverage differs from the artifact inventory')
PY
  (cd "$root" && sha256sum --quiet -c SHA256SUMS)
}

airgap_validate_image_manifest() {
  python3 - "$1" <<'PY'
from pathlib import Path
import re, sys
root = Path(sys.argv[1]) / 'docker'
images = (root / 'images.txt').read_text().splitlines()
ids = {}
for line in (root / 'image-ids.txt').read_text().splitlines():
    parts = line.split()
    if len(parts) != 2 or not re.fullmatch(r'sha256:[0-9a-f]{64}', parts[1]) or parts[0] in ids:
        raise SystemExit('Invalid or duplicate Docker image identity entry')
    ids[parts[0]] = parts[1]
if not images or len(images) != len(set(images)) or any(not i or any(c.isspace() for c in i) for i in images):
    raise SystemExit('Invalid or empty Docker image inventory')
if set(images) != set(ids):
    raise SystemExit('Docker images.txt and image-ids.txt do not cover the same images')
PY
}

airgap_validate_source_bundle() (
  local root="$1" name="$2" branch="$3" commit="$4" verify_repo heads
  [[ "$commit" =~ ^[0-9a-f]{40}$ ]] || { fail "Invalid ${name} source commit."; return 1; }
  git check-ref-format "refs/heads/$branch" || return 1
  verify_repo="$(mktemp -d)" || return 1
  trap 'rm -rf -- "$verify_repo"' EXIT
  git init --bare -q "$verify_repo" || return 1
  git -C "$verify_repo" bundle verify "${root}/sources/${name}.git.bundle" >/dev/null 2>&1 || {
    fail "${name} Git bundle is invalid or requires missing prerequisite commits."
    return 1
  }
  heads="$(git bundle list-heads "${root}/sources/${name}.git.bundle" "refs/heads/$branch")" || return 1
  [[ "$heads" == "$commit refs/heads/$branch" ]] || { fail "${name} Git bundle does not contain the declared branch/commit."; return 1; }
)

airgap_validate_payload_archives() {
  python3 - "$1" <<'PY'
from pathlib import Path
import json, re, subprocess, sys, tarfile
root = Path(sys.argv[1])
values = {}
for line in (root / 'metadata/manifest.env').read_text().splitlines():
    key, sep, value = line.partition('=')
    if not sep or key in values:
        raise SystemExit('Invalid or duplicate bundle metadata')
    values[key] = value
if json.loads((root / 'manifest.json').read_text()) != values:
    raise SystemExit('JSON and env bundle metadata disagree')
if not re.fullmatch(r'spark-airgap-[A-Za-z0-9._-]+', values.get('BUNDLE_ID', '')):
    raise SystemExit('Invalid bundle ID')
if values.get('UBUNTU_VERSION') not in ('24.04', '26.04') or values.get('ARCH') != 'amd64':
    raise SystemExit('Unsupported bundle platform')
requested = set((root / 'apt/requested-packages.txt').read_text().splitlines())
available = set()
versions = set()
for package in (root / 'apt').glob('*.deb'):
    fields = subprocess.check_output(['dpkg-deb', '--field', str(package), 'Package', 'Version', 'Architecture'], text=True)
    fields = dict(line.split(': ', 1) for line in fields.splitlines())
    if fields.get('Architecture') not in ('amd64', 'all'):
        raise SystemExit(f'Wrong APT package architecture: {package.name}')
    available.add(fields['Package'])
    versions.add((fields['Package'], fields['Version'], fields['Architecture']))
if not requested or '' in requested or not requested <= available:
    raise SystemExit(f'APT payload is missing requested packages: {sorted(requested - available)}')
platform = root / 'apt/platform.env'
if platform.exists():
    actual = dict(line.split('=', 1) for line in platform.read_text().splitlines())
    if actual != {'UBUNTU_VERSION': values['UBUNTU_VERSION'], 'ARCH': values['ARCH']}:
        raise SystemExit('APT payload platform does not match bundle target')
    ledger = {tuple(line.split('\t')) for line in (root / 'apt/package-versions.tsv').read_text().splitlines()}
    if ledger != versions:
        raise SystemExit('APT package version inventory does not match shipped packages')
    if not (root / 'apt/install-local.sh').is_file():
        raise SystemExit('Local APT installer is missing')
def require_members(path, required):
    with tarfile.open(path, 'r:gz') as archive:
        names = {m.name.removeprefix('./') for m in archive}
    if not required <= names:
        raise SystemExit(f'Incomplete archive: {path.name}; missing {sorted(required - names)}')
require_members(root / 'npm/frontend-node-modules.tar.gz', {'node_modules/typescript/bin/tsc', 'node_modules/vite/bin/vite.js'})
packages = list((root / 'npm').glob('npm-*.tgz'))
if len(packages) != 1:
    raise SystemExit('Expected exactly one offline npm package')
require_members(packages[0], {'package/bin/npm-cli.js', 'package/package.json'})
# Iterate the Docker tar as well as its gzip wrapper; a non-tar gzip is not an image archive.
with tarfile.open(root / 'docker/docker-images.tar.gz', 'r|gz') as archive:
    names = {m.name.removeprefix('./') for m in archive}
if 'manifest.json' not in names:
    raise SystemExit('Docker save archive is missing manifest.json')
if values.get('OFFLINE_PROOF_REQUIRED') == '1':
    proof = dict(line.split('=', 1) for line in (root / 'npm/offline-proof.env').read_text().splitlines())
    expected = {'UBUNTU_VERSION': values['UBUNTU_VERSION'], 'ARCH': 'amd64', 'NETWORK': 'none',
                'APT_INSTALL': 'passed', 'NPM_INSTALL': 'passed', 'FRONTEND_BUILD': 'passed'}
    if proof != expected:
        raise SystemExit('Offline package/frontend proof does not match the bundle target')
PY
}

airgap_validate_bundle_dir() {
  local root="$1" format
  [[ -d "$root" ]] || { fail "Air-gap bundle directory not found: $root"; return 1; }
  airgap_require_file "${root}/metadata/manifest.env" || return 1
  airgap_require_file "${root}/manifest.json" || return 1
  airgap_require_file "${root}/sources/spark.git.bundle" || return 1
  airgap_require_file "${root}/sources/supabase.git.bundle" || return 1
  airgap_require_file "${root}/docker/docker-images.tar.gz" || return 1
  airgap_require_file "${root}/docker/images.txt" || return 1
  airgap_require_file "${root}/docker/image-ids.txt" || return 1
  airgap_require_file "${root}/npm/frontend-node-modules.tar.gz" || return 1
  compgen -G "${root}/npm/npm-*.tgz" >/dev/null || { fail "Offline npm package is missing."; return 1; }
  compgen -G "${root}/apt/*.deb" >/dev/null || { fail "Offline APT packages are missing."; return 1; }
  format="$(airgap_meta_from "$root" FORMAT_VERSION)"
  [[ "$format" == "$AIRGAP_FORMAT_VERSION" ]] || {
    fail "Unsupported air-gap bundle format: ${format:-missing}"
    return 1
  }
  if [[ "${SPARK_AIRGAP_SHA256_PREVERIFIED:-0}" != "1" ]]; then
    run_logged "Validate air-gap SHA256 manifest" airgap_validate_checksum_manifest "$root" || return 1
  else
    info "SHA256 payload integrity already verified by bootstrap; skipping duplicate full-file pass."
  fi
  airgap_validate_image_manifest "$root" || return 1
  airgap_validate_payload_archives "$root" || return 1
  root="$(readlink -f "$root")"
  airgap_validate_source_bundle "$root" spark main "$(airgap_meta_from "$root" SPARK_COMMIT)" || return 1
  airgap_validate_source_bundle "$root" supabase "$(airgap_meta_from "$root" SUPABASE_BRANCH)" "$(airgap_meta_from "$root" SUPABASE_COMMIT)"
}

airgap_validate_target_compatibility() {
  local root="$1" expected_os expected_arch actual_arch
  . /etc/os-release
  expected_os="$(airgap_meta_from "$root" UBUNTU_VERSION)"
  expected_arch="$(airgap_meta_from "$root" ARCH)"
  actual_arch="$(dpkg --print-architecture)"
  [[ "${ID:-}" == "ubuntu" ]] || { fail "Air-gap target must be Ubuntu."; return 1; }
  [[ "${VERSION_ID:-}" == "$expected_os" ]] || {
    fail "Bundle is for Ubuntu ${expected_os}; target is ${VERSION_ID:-unknown}."
    return 1
  }
  [[ "$actual_arch" == "$expected_arch" ]] || {
    fail "Bundle is for ${expected_arch}; target is ${actual_arch}."
    return 1
  }
}

airgap_archive_safe_paths() {
  local archive="$1" entry
  while IFS= read -r entry; do
    [[ -n "$entry" ]] || continue
    case "$entry" in
      /*|../*|*/../*|*'/..')
        fail "Unsafe path in air-gap archive: $entry"
        return 1
        ;;
    esac
  done < <(tar -tzf "$archive")
  if tar -tvzf "$archive" | awk '$1 ~ /^[lh]/ {found=1} END{exit !found}'; then
    fail "Air-gap archive contains symlink/hardlink entries; import refused."
    return 1
  fi
}

airgap_extract_bundle_archive() {
  local archive="$1" destination="$2" root
  [[ -f "$archive" ]] || { fail "Bundle archive not found: $archive"; return 1; }
  airgap_archive_safe_paths "$archive" || return 1
  mkdir -p "$destination"
  tar -xzf "$archive" -C "$destination" || return 1
  root="$(find "$destination" -mindepth 1 -maxdepth 1 -type d -name 'spark-airgap-*' | head -n1)"
  [[ -n "$root" ]] || { fail "Bundle archive does not contain a Spark air-gap root."; return 1; }
  printf '%s\n' "$root"
}

airgap_verify_image_content() {
  local image="$1"
  "$AIRGAP_REAL_DOCKER" image inspect "$image" >/dev/null 2>&1 || return 1
  if [[ -n "${CURRENT_LOG:-}" ]]; then
    "$AIRGAP_REAL_DOCKER" image save "$image" >/dev/null 2>>"$CURRENT_LOG"
  else
    "$AIRGAP_REAL_DOCKER" image save "$image" >/dev/null 2>&1
  fi
}

airgap_verify_image_list_content() {
  local list_file="$1" image failed=0
  [[ -f "$list_file" ]] || return 1
  while IFS= read -r image; do
    [[ -n "$image" ]] || continue
    if ! airgap_verify_image_content "$image"; then
      [[ -n "${CURRENT_LOG:-}" ]] && echo "Unreadable Docker image content: $image" >>"$CURRENT_LOG"
      failed=1
    fi
  done <"$list_file"
  (( failed == 0 ))
}

airgap_reload_image_archive() {
  local root="$1" archive="${1}/docker/docker-images.tar.gz"
  [[ -s "$archive" ]] || return 1
  gzip -dc "$archive" | "$AIRGAP_REAL_DOCKER" load
}

airgap_repair_image_list_content() {
  local root="$1" list_file="$2" image
  airgap_verify_image_list_content "$list_file" && return 0

  [[ -n "${CURRENT_LOG:-}" ]] && echo "Docker image content is incomplete; reloading verified Air-Gap image archive." >>"$CURRENT_LOG"
  airgap_reload_image_archive "$root" || return 1
  airgap_verify_image_list_content "$list_file" && return 0

  # A stale tag can keep pointing at metadata whose config/layer blobs were lost.
  # Remove only unreadable tags, reload the verified archive, and validate again.
  while IFS= read -r image; do
    [[ -n "$image" ]] || continue
    airgap_verify_image_content "$image" && continue
    "$AIRGAP_REAL_DOCKER" image rm -f "$image" >/dev/null 2>&1 || true
  done <"$list_file"

  airgap_reload_image_archive "$root" || return 1
  airgap_verify_image_list_content "$list_file"
}

airgap_verify_images() {
  local root="$1" image expected_id actual_id extra failed=0 count=0
  airgap_validate_image_manifest "$root" || return 1
  [[ -s "${root}/docker/image-ids.txt" ]] || { fail "Docker image ID manifest is missing or empty."; return 1; }
  # spark-airgap excludes spaces from global IFS; this file is space-delimited.
  while IFS=$' \t' read -r image expected_id extra || [[ -n "$image" ]]; do
    [[ -n "$image" ]] || continue
    [[ "$expected_id" =~ ^sha256:[0-9a-f]{64}$ && -z "$extra" ]] || {
      fail "Invalid Docker image ID manifest entry: $image"
      return 1
    }
    count=$((count + 1))
    actual_id="$("$AIRGAP_REAL_DOCKER" image inspect --format '{{.Id}}' "$image" 2>/dev/null || true)"
    if [[ -z "$actual_id" ]]; then
      [[ -n "${CURRENT_LOG:-}" ]] && echo "Missing Docker image: $image" >>"$CURRENT_LOG"
      failed=1
    elif [[ "$actual_id" != "$expected_id" ]]; then
      [[ -n "${CURRENT_LOG:-}" ]] && echo "Docker image ID mismatch: $image expected=$expected_id actual=$actual_id" >>"$CURRENT_LOG"
      failed=1
    fi
  done <"${root}/docker/image-ids.txt"
  (( count > 0 && failed == 0 ))
}

airgap_import_bundle() (
  title
  new_log "airgap-import"
  local input="${1:-}" staging="" incoming="" root bundle_id final
  trap '[[ -z "$staging" ]] || rm -rf -- "$staging"; [[ -z "$incoming" ]] || rm -rf -- "$incoming"' EXIT
  if [[ -z "$input" ]]; then read -r -p "Path to Spark air-gap .tar.gz or extracted bundle directory: " input; fi
  [[ -n "$input" ]] || { fail "Bundle path is required."; return 1; }

  mkdir -p "$AIRGAP_BUNDLES_DIR"
  if [[ -d "$input" ]]; then
    root="$(readlink -f "$input")"
  else
    staging="$(mktemp -d "${AIRGAP_HOME}/import.XXXXXX")"
    root="$(airgap_extract_bundle_archive "$input" "$staging")" || { rm -rf "$staging"; return 1; }
  fi

  airgap_validate_bundle_dir "$root" || return 1
  airgap_validate_target_compatibility "$root" || return 1
  bundle_id="$(airgap_meta_from "$root" BUNDLE_ID)"
  [[ -n "$bundle_id" ]] || { fail "Bundle ID is missing."; return 1; }
  final="${AIRGAP_BUNDLES_DIR}/${bundle_id}"

  if [[ "$(readlink -f "$root")" != "$(readlink -m "$final")" ]]; then
    if [[ -e "$final" ]]; then
      cmp -s "${root}/SHA256SUMS" "${final}/SHA256SUMS" || {
        fail "A different bundle already uses ID ${bundle_id}; refusing to replace it."
        return 1
      }
      airgap_validate_bundle_dir "$final" || return 1
    else
      incoming="$(mktemp -d "${AIRGAP_BUNDLES_DIR}/.import.XXXXXX")" || return 1
      cp -a "$root/." "$incoming/" || return 1
      mv "$incoming" "$final" || return 1
      incoming=""
    fi
  fi
  [[ -n "$staging" ]] && rm -rf "$staging"

  [[ -x "$AIRGAP_REAL_DOCKER" ]] || { fail "Docker is not installed yet. Run bootstrap-airgap.sh first."; return 1; }
  run_visible "Load offline Docker images" bash -c "gzip -dc '$final/docker/docker-images.tar.gz' | '$AIRGAP_REAL_DOCKER' load" || return 1
  run_logged "Verify every bundled Docker image locally" airgap_verify_images "$final" || return 1
  run_logged "Validate bundled Docker image content" airgap_repair_image_list_content "$final" "${final}/docker/images.txt" || {
    fail "Bundled Docker image content is unreadable after offline reload. Rebuild the Air-Gap bundle on a healthy Docker host."
    return 1
  }
  # A failed load/verification must not replace the previously active bundle.
  ln -sfn "$final" "$AIRGAP_CURRENT_LINK" || return 1
  mkdir -p "$CONFIG_DIR"
  printf 'AIRGAP_ROOT=%s\n' "$final" >"$AIRGAP_CONF"
  chmod 0600 "$AIRGAP_CONF"
  if [[ -f "${final}/config/manager.conf" && ! -f "$MANAGER_CONF" ]]; then
    cp "${final}/config/manager.conf" "$MANAGER_CONF" || return 1
    chmod 0600 "$MANAGER_CONF"
    info "Installation configuration restored from bundle because manager.conf did not exist."
  fi
  ok "Air-gap bundle imported and activated: $bundle_id"
)

airgap_install_local_debs() {
  local root="$1" apt_guard rc=0
  airgap_validate_target_compatibility "$root" || return 1
  if [[ -f "${SCRIPT_DIR}/lib/airgap-packages.sh" ]]; then
    bash "${SCRIPT_DIR}/lib/airgap-packages.sh" "${root}/apt"
    return $?
  fi
  local -a debs=()
  mapfile -t debs < <(find "${root}/apt" -maxdepth 1 -type f -name '*.deb' -print | sort)
  ((${#debs[@]} > 0)) || { fail "No .deb packages found in bundle."; return 1; }

  apt_guard="$(mktemp -d /run/spark-airgap-apt.XXXXXX)"
  install -d -m 0755 "${apt_guard}/sources.list.d"
  : >"${apt_guard}/sources.list"

  DEBIAN_FRONTEND=noninteractive apt-get \
    -o "Dir::Etc::sourcelist=${apt_guard}/sources.list" \
    -o "Dir::Etc::sourceparts=${apt_guard}/sources.list.d" \
    -o APT::Get::List-Cleanup=0 \
    install -y --no-remove "${debs[@]}" || rc=$?

  rm -rf "$apt_guard"
  return "$rc"
}

airgap_install_manager_local() {
  local source_dir="${SPARK_ROOT}/deploy/spark-cli" stage target="/usr/local/lib/spark-manager"
  local migrate_target="/usr/local/lib/spark-migrate" file
  airgap_require_file "${source_dir}/spark" || return 1
  airgap_require_file "${source_dir}/spark-ui.py" || return 1
  airgap_require_file "${source_dir}/spark-ui-core.py" || return 1
  airgap_require_file "${source_dir}/spark-airgap" || return 1
  airgap_require_file "${source_dir}/spark-migrate" || return 1

  bash -n "${source_dir}/spark" || return 1
  bash -n "${source_dir}/spark-airgap" || return 1
  for file in "${source_dir}"/lib/*.sh; do bash -n "$file" || return 1; done
  python3 - "${source_dir}/spark-ui.py" "${source_dir}/spark-ui-core.py" <<'PY'
from pathlib import Path
import sys
for item in sys.argv[1:]: compile(Path(item).read_text(encoding='utf-8'), item, 'exec')
PY
  python3 "${source_dir}/spark-ui.py" --self-test >/dev/null || return 1

  # The installed Manager is the Air-Gap control plane. Do not downgrade it to
  # the application snapshot embedded in an older offline bundle during step 03.
  if [[ -x /usr/local/bin/spark && -x /usr/local/bin/spark-airgap && -x /usr/local/bin/spark-migrate ]]; then
    local installed_manager_version installed_airgap_version
    installed_manager_version="$(/usr/local/bin/spark --version 2>/dev/null || true)"
    installed_airgap_version="$(/usr/local/bin/spark-airgap --version 2>/dev/null || true)"
    if [[ "$installed_manager_version" == "Spark Server Manager ${SPARK_MANAGER_VERSION}" \
          && "$installed_airgap_version" == "Spark Air-Gapped Installer ${SPARK_MANAGER_VERSION}" ]]; then
      info "Preserving current Spark Manager control plane ${SPARK_MANAGER_VERSION}; bundled Spark application source remains pinned to its verified snapshot."
      return 0
    fi
  fi

  stage="$(mktemp -d /usr/local/lib/spark-manager.airgap.XXXXXX)"
  chmod 0755 "$stage"
  install -d -m 0755 "$stage/lib"
  install -m 0755 "${source_dir}/spark" "$stage/spark"
  install -m 0755 "${source_dir}/spark-airgap" "$stage/spark-airgap"
  install -m 0644 "${source_dir}/spark-ui.py" "$stage/spark-ui.py"
  install -m 0644 "${source_dir}/spark-ui-core.py" "$stage/spark-ui-core.py"
  for file in "${source_dir}"/lib/*.sh; do install -m 0644 "$file" "$stage/lib/$(basename "$file")"; done
  rm -rf "$target"
  mv "$stage" "$target"
  chmod 0755 "$target"
  ln -sfn "$target/spark" /usr/local/bin/spark
  ln -sfn "$target/spark-airgap" /usr/local/bin/spark-airgap

  rm -rf "$migrate_target"
  install -d -m 0755 "$migrate_target"
  install -m 0755 "${source_dir}/spark-migrate" "$migrate_target/spark-migrate"
  ln -sfn "$migrate_target/spark-migrate" /usr/local/bin/spark-migrate
}

airgap_restore_git_bundle() {
  local bundle="$1" destination="$2" branch="$3" commit="$4" origin_url="$5"
  if [[ -d "${destination}/.git" ]]; then
    [[ -z "$(git -C "$destination" status --porcelain)" ]] || { fail "$destination has uncommitted changes."; return 1; }
    git -C "$destination" fetch "$bundle" "$branch" || return 1
    git -C "$destination" checkout "$branch" || return 1
    git -C "$destination" merge --ff-only "$commit" || return 1
  elif [[ -e "$destination" ]]; then
    fail "$destination exists but is not a Git repository."
    return 1
  else
    git clone --branch "$branch" "$bundle" "$destination" || return 1
    git -C "$destination" checkout "$commit" || return 1
    git -C "$destination" branch -f "$branch" "$commit" || return 1
    git -C "$destination" checkout "$branch" || return 1
  fi
  if git -C "$destination" remote get-url origin >/dev/null 2>&1; then
    git -C "$destination" remote set-url origin "$origin_url"
  else
    git -C "$destination" remote add origin "$origin_url"
  fi
  git -C "$destination" update-ref "refs/remotes/origin/${branch}" "$commit"
}

airgap_prepare_runtime_shims() {
  local root="$1"
  mkdir -p "$AIRGAP_SHIM_DIR"
  cat >"${AIRGAP_SHIM_DIR}/docker" <<'SHIM_DOCKER'
#!/usr/bin/env bash
set -Eeuo pipefail
real="${AIRGAP_REAL_DOCKER:-/usr/bin/docker}"
if [[ "${SPARK_AIRGAP_ACTIVE:-0}" == "1" ]]; then
  case "${1:-}" in
    pull|build|buildx)
      printf '[air-gap] Docker registry/build operations are disabled on the target.\n' >&2
      exit 1 ;;
    compose)
      args=("$1"); shift
      # Consume Compose global options before finding its subcommand. Paths and
      # project names may themselves be named "pull" or "build".
      while (($#)); do
        case "$1" in
          -f|--file|--env-file|-p|--project-name|--project-directory|--profile|--ansi|--progress|--parallel)
            (($# >= 2)) || exit 2
            args+=("$1" "$2"); shift 2 ;;
          -*) args+=("$1"); shift ;;
          *) break ;;
        esac
      done
      action="${1:-}"
      case "$action" in
        pull|build)
          printf '[air-gap] compose %s skipped; verified local images are authoritative.\n' "$action"
          exit 0 ;;
        up|create|run)
          shift
          rest=()
          while (($#)); do
            case "$1" in
              --build) printf '[air-gap] --build is forbidden.\n' >&2; exit 1 ;;
              --pull) (($# >= 2)) || exit 2; shift 2 ;;
              --pull=*) shift ;;
              *) rest+=("$1"); shift ;;
            esac
          done
          args+=("$action" --pull never)
          [[ "$action" == run ]] || args+=(--no-build)
          exec "$real" "${args[@]}" "${rest[@]}" ;;
        *) exec "$real" "${args[@]}" "$@" ;;
      esac ;;
    run|create)
      action="$1"; shift
      # Reject explicit overrides of never; a missing image must fail locally.
      for arg in "$@"; do
        case "$arg" in --pull|--pull=always|--pull=missing) exit 1 ;; esac
      done
      exec "$real" "$action" --pull=never "$@" ;;
  esac
fi
exec "$real" "$@"
SHIM_DOCKER
  chmod 0755 "${AIRGAP_SHIM_DIR}/docker"

  cat >"${AIRGAP_SHIM_DIR}/npm" <<'SHIM_NPM'
#!/usr/bin/env bash
set -Eeuo pipefail
real="${AIRGAP_REAL_NPM:-/usr/bin/npm}"
if [[ "${SPARK_AIRGAP_ACTIVE:-0}" == "1" && "${1:-}" == "ci" ]]; then
  root="${AIRGAP_ROOT:?AIRGAP_ROOT is required}"
  archive="${root}/npm/frontend-node-modules.tar.gz"
  [[ -f "$archive" ]] || { echo "Offline node_modules archive missing: $archive" >&2; exit 1; }
  rm -rf node_modules
  tar -xzf "$archive" -C .
  printf '[air-gap] restored frontend node_modules from verified bundle.\n'
  exit 0
fi
exec "$real" "$@"
SHIM_NPM
  chmod 0755 "${AIRGAP_SHIM_DIR}/npm"
  export PATH="${AIRGAP_SHIM_DIR}:${PATH}"
}

airgap_prepare_avatar_compose() {
  local root="$1" image compose_file="${SUPABASE_ROOT}/docker-compose.yml"
  image="$(airgap_meta_from "$root" AVATAR_IMAGE)"
  [[ -n "$image" ]] || { fail "AVATAR_IMAGE missing from air-gap manifest."; return 1; }
  COMPOSE_FILE="$compose_file" AVATAR_IMAGE="$image" python3 - <<'PY'
import os, yaml
from pathlib import Path
p=Path(os.environ['COMPOSE_FILE'])
d=yaml.safe_load(p.read_text(encoding='utf-8')) or {}
s=(d.get('services') or {}).get('avatar-worker')
if not isinstance(s, dict): raise SystemExit('avatar-worker service is missing after Compose hardening')
s.pop('build', None)
s['image']=os.environ['AVATAR_IMAGE']
p.write_text(yaml.safe_dump(d, sort_keys=False, default_flow_style=False), encoding='utf-8')
PY
}


# Builder-only and offline runtime overrides are kept separate for auditability.
source "${SCRIPT_DIR}/lib/airgap-build.sh"
source "${SCRIPT_DIR}/lib/airgap-runtime.sh"
