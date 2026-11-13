# ZIP-based full Spark source bundle override for Manager Air-Gap builds.
# Sourced after airgap-manager.sh so this function intentionally replaces the
# legacy Git-bundle implementation. The target needs no GitHub/network access.

spark_manager_airgap_build() (
  set -Eeuo pipefail
  local output_root="${1:-${PWD}}" target_release="${2:-}" revision root bundle_id archive partial source source_root source_zip

  [[ -d "${SPARK_ROOT}/.git" ]] || { fail "Spark source repository is required at ${SPARK_ROOT} on the connected builder."; return 1; }
  revision="$(spark_airgap_sync_source_main)" || return 1
  [[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { fail "Unable to resolve Spark revision."; return 1; }

  if [[ -z "$target_release" ]]; then
    target_release="any"
  else
    target_release="$(airgap_normalize_ubuntu_release "$target_release")" || return 1
  fi

  mkdir -p "$output_root"
  output_root="$(readlink -f "$output_root")"
  bundle_id="spark-manager-airgap-${revision:0:12}-ubuntu${target_release}-amd64"
  root="${output_root}/${bundle_id}"
  archive="${output_root}/${bundle_id}.tar.gz"
  [[ ! -e "$root" && ! -e "$archive" ]] || { fail "Bundle output already exists: ${bundle_id}"; return 1; }

  source_root="$(mktemp -d)"
  trap 'rm -rf "$root" "$source_root"; [[ -n "${partial:-}" ]] && rm -f "$partial"' EXIT

  # Immutable exact-revision snapshot used both for Manager payload and the
  # complete application ZIP. Local uncommitted files are never included.
  command git -C "$SPARK_ROOT" archive "$revision" | tar -x -C "$source_root" || return 1
  source="${source_root}/deploy/spark-cli"
  [[ -d "$source" ]] || { fail "Spark source snapshot is incomplete."; return 1; }

  mkdir -p "$root/metadata" "$root/manager" "$root/sources"
  source_zip="$root/sources/Spark-main.zip"

  # Equivalent content model to GitHub's /archive/refs/heads/main.zip, but
  # generated from the exact fetched commit so manifest and source cannot race.
  command git -C "$SPARK_ROOT" archive --format=zip --prefix=Spark-main/ -o "$source_zip" "$revision" || return 1

  python3 - "$source_zip" <<'PY'
from pathlib import PurePosixPath
import sys, zipfile
path = sys.argv[1]
with zipfile.ZipFile(path) as zf:
    names = zf.namelist()
    if not names:
        raise SystemExit("Spark source ZIP is empty")
    for name in names:
        p = PurePosixPath(name)
        if p.is_absolute() or '..' in p.parts or not p.parts or p.parts[0] != 'Spark-main':
            raise SystemExit(f"Unsafe ZIP path: {name}")
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

  for file in spark spark-airgap spark-architecture spark-database spark-ui.py spark-ui-base.py spark-ui-core.py spark-migrate database_cli.py spark-manager-airgap-bootstrap; do
    [[ -f "$source/$file" ]] || { fail "Manager source missing: $file"; return 1; }
    cp -a "$source/$file" "$root/manager/$file"
  done
  for dir in core architecture config adapters secrets roles lib; do
    [[ -d "$source/$dir" ]] || { fail "Manager source directory missing: $dir"; return 1; }
    cp -a "$source/$dir" "$root/manager/$dir"
  done
  if [[ -d "${source_root}/deploy/spark-cli/livekit" ]]; then
    cp -a "${source_root}/deploy/spark-cli/livekit" "$root/manager/livekit"
  fi

  [[ -f "$source/bootstrap-full-source-airgap.sh" ]] || { fail "ZIP-based offline installer is missing."; return 1; }
  cp -a "$source/bootstrap-full-source-airgap.sh" "$root/install.sh"
  chmod 0755 "$root/install.sh" "$root/manager/spark" "$root/manager/spark-airgap" "$root/manager/spark-architecture" "$root/manager/spark-database" "$root/manager/spark-migrate" "$root/manager/spark-manager-airgap-bootstrap" "$root/manager/lib/spark-manager-airgap" "$root/manager/lib/build-manager-airgap"

  python3 - "$root/metadata/manifest.json" "$revision" "$target_release" <<'PY'
import json, sys
path, revision, ubuntu = sys.argv[1:]
with open(path, 'w', encoding='utf-8') as f:
    json.dump({
        'format_version': 3,
        'spark_revision': revision,
        'spark_repository': 'https://github.com/sh1375/Spark.git',
        'spark_branch': 'main',
        'spark_source_archive': 'sources/Spark-main.zip',
        'ubuntu': ubuntu,
        'architecture': 'amd64',
        'payload': 'spark-main-zip-and-manager',
        'target_network_required': False,
    }, f, indent=2, sort_keys=True)
    f.write('\n')
PY
  python3 -m compileall -q "$root/manager/core" "$root/manager/config" "$root/manager/architecture" "$root/manager/adapters" "$root/manager/secrets" "$root/manager/roles"
  bash -n "$root/install.sh" "$root/manager/spark" "$root/manager/spark-airgap" "$root/manager/spark-architecture" "$root/manager/spark-database" "$root/manager/spark-manager-airgap-bootstrap" "$root/manager/lib/spark-manager-airgap" "$root/manager/lib/build-manager-airgap"
  "$root/manager/lib/spark-manager-airgap" --help >/dev/null

  partial="$(mktemp "${output_root}/.${bundle_id}.XXXXXX")"
  tar -C "$output_root" -czf "$partial" "$bundle_id"
  mv "$partial" "$archive"
  partial=""
  rm -rf "$root" "$source_root"
  trap - EXIT

  ok "Spark main ZIP + Manager Air-Gap bundle created: $archive"
  printf 'Revision: %s\nSource ZIP: sources/Spark-main.zip\nTarget network required: NO\nTarget: Ubuntu %s / amd64\n' "$revision" "$target_release"
)
