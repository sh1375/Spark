# Spark full-repository + Manager Air-Gap bundle build/distribution helpers.

spark_manager_airgap_profile_path() {
  local explicit="${SPARK_ENV_PROFILE:-}"
  local production="/etc/spark-manager/environments/production.yaml"
  local bundled="${SCRIPT_DIR}/config/environments/example.production.yaml"
  if [[ -n "$explicit" ]]; then
    printf '%s\n' "$explicit"
  elif [[ -f "$production" ]]; then
    printf '%s\n' "$production"
  elif [[ -f "$bundled" ]]; then
    printf '%s\n' "$bundled"
  else
    printf '%s\n' "$production"
  fi
}

spark_manager_airgap_revision() {
  if [[ -f "${SCRIPT_DIR}/.revision" ]]; then
    tr -d '[:space:]' <"${SCRIPT_DIR}/.revision"
  elif [[ -d "${SPARK_ROOT}/.git" ]]; then
    command git -C "$SPARK_ROOT" rev-parse HEAD
  else
    return 1
  fi
}

spark_manager_airgap_build() (
  set -Eeuo pipefail
  local output_root="${1:-${PWD}}" target_release="${2:-}" revision root bundle_id archive partial source source_root bundle_repo bundle_head
  [[ -d "${SPARK_ROOT}/.git" ]] || { fail "Spark source repository is required at ${SPARK_ROOT}."; return 1; }
  revision="$(spark_airgap_sync_source_main)" || return 1
  [[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { fail "Unable to resolve Spark revision."; return 1; }

  # This bundle carries the complete Spark Git repository plus the Manager
  # control plane. The Manager payload itself has no release-specific APT
  # packages, so the default remains any Ubuntu release on amd64.
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
  [[ ! -e "$root" && ! -e "$archive" ]] || { fail "Manager bundle output already exists: ${bundle_id}"; return 1; }

  source_root="$(mktemp -d)"
  bundle_repo="$(mktemp -d)"
  trap 'rm -rf "$root" "$source_root" "$bundle_repo"; [[ -n "${partial:-}" ]] && rm -f "$partial"' EXIT

  # Build Manager files from an immutable exact-revision snapshot. Local
  # uncommitted files under /opt/spark are never included or modified.
  command git -C "$SPARK_ROOT" archive "$revision" | tar -x -C "$source_root"
  source="${source_root}/deploy/spark-cli"
  [[ -d "$source" ]] || { fail "Manager source snapshot is incomplete."; return 1; }

  mkdir -p "$root/metadata" "$root/manager" "$root/sources"

  # Create a real Git bundle containing the complete sh1375/Spark main
  # history reachable from the exact fetched revision. The temporary bare repo
  # gives the bundle a canonical refs/heads/main without mutating /opt/spark.
  command git init --bare -q "$bundle_repo" || return 1
  command git -C "$bundle_repo" fetch -q "$SPARK_ROOT" "$revision" || return 1
  command git -C "$bundle_repo" update-ref refs/heads/main "$revision" || return 1
  command git -C "$bundle_repo" bundle create "$root/sources/spark.git.bundle" main || return 1
  command git -C "$bundle_repo" bundle verify "$root/sources/spark.git.bundle" >/dev/null 2>&1 || {
    fail "Generated Spark repository bundle failed verification."
    return 1
  }
  bundle_head="$(command git bundle list-heads "$root/sources/spark.git.bundle" refs/heads/main)"
  [[ "$bundle_head" == "$revision refs/heads/main" ]] || {
    fail "Generated Spark repository bundle does not contain the exact main revision."
    return 1
  }

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
  cp -a "$source/bootstrap-manager-airgap.sh" "$root/install.sh"
  chmod 0755 "$root/install.sh" "$root/manager/spark" "$root/manager/spark-airgap" "$root/manager/spark-architecture" "$root/manager/spark-database" "$root/manager/spark-migrate" "$root/manager/spark-manager-airgap-bootstrap" "$root/manager/lib/spark-manager-airgap" "$root/manager/lib/build-manager-airgap"

  python3 - "$root/metadata/manifest.json" "$revision" "$target_release" <<'PY'
import json, sys
path, revision, ubuntu = sys.argv[1:]
with open(path, 'w', encoding='utf-8') as f:
    json.dump({
        'format_version': 2,
        'spark_revision': revision,
        'spark_repository': 'https://github.com/sh1375/Spark.git',
        'spark_branch': 'main',
        'ubuntu': ubuntu,
        'architecture': 'amd64',
        'payload': 'spark-full-repository-and-manager',
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
  rm -rf "$root" "$source_root" "$bundle_repo"
  trap - EXIT
  ok "Spark full-repository + Manager Air-Gap bundle created: $archive"
  printf 'Revision: %s\nRepository: https://github.com/sh1375/Spark.git (main)\nTarget: Ubuntu %s / amd64\n' "$revision" "$target_release"
)

spark_manager_airgap_inventory() {
  local profile="$1"
  PYTHONPATH="$SCRIPT_DIR" python3 - "$profile" <<'PY'
import sys
from config.loader import load_environment
from roles.environment.remote.inventory import build_inventory
from roles.environment.remote.settings import load_remote_settings
p=sys.argv[1]
e=load_environment(p)
s=load_remote_settings(p)
for n in build_inventory(e):
    print(f"{n.id}\t{n.role}\t{n.host}\t{n.ssh_user}\t{s.known_hosts_file}\t{s.connect_timeout_seconds}\t{s.command_timeout_seconds}")
PY
}

spark_manager_airgap_status() {
  local profile="${1:-$(spark_manager_airgap_profile_path)}"
  [[ -f "$profile" ]] || { fail "Production profile not found: $profile"; return 1; }
  printf 'SPARK MANAGER NODES\n\n'
  printf '%-18s %s\n' 'Node' 'Status'
  local id role host user known connect command status overall=0
  while IFS=$'\t' read -r id role host user known connect command; do
    if [[ -z "$user" ]]; then
      status=SSH_USER_MISSING; overall=1
    elif ssh -q -o BatchMode=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$known" -o "ConnectTimeout=$connect" \
      "$user@$host" 'test -x /usr/local/bin/spark' </dev/null >/dev/null 2>&1; then
      status=READY
    else
      status=UNREACHABLE; overall=1
    fi
    printf '%-18s %s\n' "$id" "$status"
  done < <(spark_manager_airgap_inventory "$profile")
  return "$overall"
}

spark_manager_airgap_verify_revisions() {
  spark_manager_airgap_status "${1:-$(spark_manager_airgap_profile_path)}"
}

spark_manager_airgap_install_environment() {
  local bundle="${1:-}" profile="${2:-$(spark_manager_airgap_profile_path)}" work root manifest revision
  [[ -n "$bundle" ]] || read -r -p 'Path to spark-manager-airgap-*.tar.gz: ' bundle
  [[ -f "$bundle" ]] || { fail "Manager bundle not found: $bundle"; return 1; }
  [[ -f "$profile" ]] || { fail "Production profile not found: $profile"; return 1; }
  work="$(mktemp -d)"; trap 'rm -rf "$work"' RETURN
  tar -tzf "$bundle" | grep -Eq '^spark-manager-airgap-[^/]+/metadata/manifest.json$' || { fail 'Invalid Manager bundle archive.'; return 1; }
  tar -xzf "$bundle" -C "$work"
  root="$(find "$work" -mindepth 1 -maxdepth 1 -type d -name 'spark-manager-airgap-*' | head -n1)"
  [[ -n "$root" ]] || { fail 'Manager bundle root missing.'; return 1; }
  manifest="$root/metadata/manifest.json"
  revision="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["spark_revision"])' "$manifest")"
  [[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { fail 'Invalid Manager bundle revision.'; return 1; }

  local id role host user known connect command remote_archive launcher_status
  while IFS=$'\t' read -r id role host user known connect command; do
    [[ -n "$user" ]] || { fail "SSH user missing for $id"; return 1; }
    remote_archive="/var/tmp/spark-manager-inbox/spark-manager-airgap-${revision:0:12}.tar.gz"
    launcher_status="$(ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$known" -o "ConnectTimeout=$connect" \
      "$user@$host" 'test -x /usr/local/sbin/spark-manager-airgap-bootstrap && test -d /var/tmp/spark-manager-inbox && echo READY' 2>/dev/null || true)"
    [[ "$launcher_status" == READY ]] || {
      fail "Restricted Manager bootstrap launcher is missing on $id. Perform the first local Manager bootstrap on that node or have the OS/security baseline provision /usr/local/sbin/spark-manager-airgap-bootstrap."
      return 1
    }
    info "Distributing full Spark repository + Manager ${revision:0:12} to ${id} (${host})."
    scp -q -o BatchMode=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$known" -o "ConnectTimeout=$connect" \
      "$bundle" "$user@$host:$remote_archive" || { fail "Manager transfer failed: $id"; return 1; }
    ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$known" -o "ConnectTimeout=$connect" \
      "$user@$host" sudo -n /usr/local/sbin/spark-manager-airgap-bootstrap "$remote_archive" \
      || { fail "Manager install failed: $id"; return 1; }
  done < <(spark_manager_airgap_inventory "$profile")
}
