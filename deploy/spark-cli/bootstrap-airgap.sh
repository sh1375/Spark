#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

TARGET=/usr/local/lib/spark-manager
MIGRATE_TARGET=/usr/local/lib/spark-migrate
CLI_PATH=/usr/local/bin/spark
AIRGAP_CLI_PATH=/usr/local/bin/spark-airgap
MIGRATE_PATH=/usr/local/bin/spark-migrate
SPARK_ROOT=/opt/spark
EXPECTED_VERSION="3.1.0+20260910.1"
EXPECTED_AIRGAP_VERSION="3.1.0+20260916.4"
EXPECTED_UI_VERSION="3.1.0+20260910.1"

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  exec sudo -E "$0" "$@"
fi

input="${1:-}"
if [[ -z "$input" || ( ! -f "$input" && ! -d "$input" ) ]]; then
  printf 'Usage: %s /path/to/spark-airgap-*.tar.gz|/path/to/extracted-bundle\n' "$0" >&2
  exit 2
fi
input="$(readlink -f "$input")"

for cmd in tar sha256sum sed grep find dpkg apt-get; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Required bootstrap command is missing: $cmd" >&2; exit 1; }
done

# When target-patching an older transferred bundle, the connected Manager may
# already contain newer Air-Gap control-plane fixes than the application commit
# embedded in that bundle. Preserve that validated control plane instead of
# downgrading /usr/local/lib/spark-manager to the older bundled spark-cli.
# The offline Edge Function helper is now part of the required control plane;
# an older Manager with the same version string must be refreshed once.
preserve_control_plane=0
if [[ -f "$TARGET/lib/airgap-auto.sh" && -f "$TARGET/lib/airgap-edge-functions.sh" \
      && -f "$TARGET/lib/airgap-dnsless-runtime.sh" \
      && -f "$TARGET/bootstrap-airgap.sh" && -x "$CLI_PATH" && -x "$AIRGAP_CLI_PATH" && -x "$MIGRATE_PATH" ]]; then
  if [[ "$($CLI_PATH --version 2>/dev/null || true)" == "Spark Server Manager ${EXPECTED_VERSION}" \
        && "$($AIRGAP_CLI_PATH --version 2>/dev/null || true)" == "Spark Air-Gapped Installer ${EXPECTED_AIRGAP_VERSION}" ]]; then
    preserve_control_plane=1
  fi
fi

work=""
root=""
if [[ -d "$input" ]]; then
  root="$input"
else
  work="$(mktemp -d)"
  trap '[[ -n "${work:-}" ]] && rm -rf "$work"' EXIT
  while IFS= read -r entry; do
    [[ -n "$entry" ]] || continue
    case "$entry" in
      /*|../*|*/../*|*'/..')
        echo "Unsafe path in air-gap archive: $entry" >&2
        exit 1
        ;;
    esac
  done < <(tar -tzf "$input")
  if tar -tvzf "$input" | awk '$1 ~ /^[lh]/ {found=1} END{exit !found}'; then
    echo 'Air-gap archive contains symlink/hardlink entries; bootstrap refused.' >&2
    exit 1
  fi
  tar -xzf "$input" -C "$work"
  root="$(find "$work" -mindepth 1 -maxdepth 1 -type d -name 'spark-airgap-*' | head -n1)"
fi

[[ -n "$root" && -d "$root" ]] || { echo 'Invalid Spark air-gap input: bundle root missing.' >&2; exit 1; }
[[ -f "$root/SHA256SUMS" && -f "$root/metadata/manifest.env" ]] || {
  echo 'Invalid Spark air-gap bundle: manifest files missing.' >&2
  exit 1
}
(cd "$root" && sha256sum -c SHA256SUMS)

meta() { sed -n "s/^$1=//p" "$root/metadata/manifest.env" | tail -n1; }
format="$(meta FORMAT_VERSION)"
os_expected="$(meta UBUNTU_VERSION)"
arch_expected="$(meta ARCH)"
spark_commit="$(meta SPARK_COMMIT)"
[[ "$format" == "1" ]] || { echo "Unsupported air-gap bundle format: $format" >&2; exit 1; }
[[ "$spark_commit" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid Spark commit in bundle.' >&2; exit 1; }

. /etc/os-release
arch_actual="$(dpkg --print-architecture)"
[[ "${ID:-}" == ubuntu ]] || { echo 'Spark air-gap target must be Ubuntu.' >&2; exit 1; }
[[ "${VERSION_ID:-}" == "$os_expected" ]] || {
  echo "Bundle target is Ubuntu $os_expected; this server is ${VERSION_ID:-unknown}." >&2
  exit 1
}
[[ "$arch_actual" == "$arch_expected" ]] || {
  echo "Bundle target architecture is $arch_expected; this server is $arch_actual." >&2
  exit 1
}

mapfile -t debs < <(find "$root/apt" -maxdepth 1 -type f -name '*.deb' -print | sort)
((${#debs[@]} > 0)) || { echo 'Offline APT payload is empty.' >&2; exit 1; }

if [[ -f "$root/apt/install-local.sh" ]]; then
  bash "$root/apt/install-local.sh" "$root/apt"
else
  # Legacy bundles still fail closed on removals/downgrades.
  export DEBIAN_FRONTEND=noninteractive
  apt_guard="$(mktemp -d)"
  install -d -m 0755 "${apt_guard}/sources.list.d"
  : >"${apt_guard}/sources.list"
  apt_rc=0
  apt-get \
    -o "Dir::Etc::sourcelist=${apt_guard}/sources.list" \
    -o "Dir::Etc::sourceparts=${apt_guard}/sources.list.d" \
    -o APT::Get::List-Cleanup=0 \
    install -y --no-remove "${debs[@]}" || apt_rc=$?
  rm -rf "$apt_guard"
  (( apt_rc == 0 )) || exit "$apt_rc"

fi

for cmd in git python3 rsync docker npm nginx; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Offline package install did not provide: $cmd" >&2; exit 1; }
done

systemctl enable --now docker nginx

rm -rf "$SPARK_ROOT"
git clone --branch main "$root/sources/spark.git.bundle" "$SPARK_ROOT"
git -C "$SPARK_ROOT" checkout "$spark_commit"
git -C "$SPARK_ROOT" branch -f main "$spark_commit"
git -C "$SPARK_ROOT" checkout main
git -C "$SPARK_ROOT" remote set-url origin https://github.com/sh1375/Spark.git
git -C "$SPARK_ROOT" update-ref refs/remotes/origin/main "$spark_commit"

source_dir="$SPARK_ROOT/deploy/spark-cli"
for path in spark spark-airgap spark-ui.py spark-ui-core.py spark-migrate lib/airgap.sh lib/airgap-build.sh lib/airgap-runtime.sh lib/airgap-dnsless-runtime.sh lib/installation-universal.sh; do
  [[ -f "$source_dir/$path" ]] || { echo "Air-gap capable Spark source is missing: $path" >&2; exit 1; }
done
[[ -d "$SPARK_ROOT/deploy/spark-cli/livekit" ]] || { echo 'Spark LiveKit deployment assets are missing.' >&2; exit 1; }

bash -n "$source_dir/spark"
bash -n "$source_dir/spark-airgap"
for file in "$source_dir"/lib/*.sh; do bash -n "$file"; done
python3 - "$source_dir/spark-ui.py" "$source_dir/spark-ui-core.py" <<'PY'
from pathlib import Path
import sys
for value in sys.argv[1:]:
    compile(Path(value).read_text(encoding='utf-8'), value, 'exec')
PY
python3 "$source_dir/spark-ui.py" --self-test
grep -Fq "SPARK_UI_VERSION = \"${EXPECTED_UI_VERSION}\"" "$source_dir/spark-ui.py" || { echo "Unexpected Spark UI adapter version." >&2; exit 1; }
grep -Fq "SPARK_UI_VERSION = \"${EXPECTED_UI_VERSION}\"" "$source_dir/spark-ui-core.py" || { echo "Unexpected Spark UI core version." >&2; exit 1; }

if (( preserve_control_plane == 1 )); then
  printf 'Preserving newer installed Spark Air-Gap Manager control plane; bundle application source remains pinned to %s.\n' "${spark_commit:0:12}"
else
  stage="$(mktemp -d /usr/local/lib/spark-manager.airgap.XXXXXX)"
  chmod 0755 "$stage"
  install -d -m 0755 "$stage/lib" "$stage/livekit"
  install -m 0755 "$source_dir/spark" "$stage/spark"
  install -m 0755 "$source_dir/spark-airgap" "$stage/spark-airgap"
  install -m 0644 "$source_dir/spark-ui.py" "$stage/spark-ui.py"
  install -m 0644 "$source_dir/spark-ui-core.py" "$stage/spark-ui-core.py"
  for file in "$source_dir"/lib/*.sh; do install -m 0644 "$file" "$stage/lib/$(basename "$file")"; done
  rsync -a --delete "$SPARK_ROOT/deploy/spark-cli/livekit/" "$stage/livekit/"
  rm -rf "$TARGET"
  mv "$stage" "$TARGET"
  chmod 0755 "$TARGET"
  ln -sfn "$TARGET/spark" "$CLI_PATH"
  ln -sfn "$TARGET/spark-airgap" "$AIRGAP_CLI_PATH"

  rm -rf "$MIGRATE_TARGET"
  install -d -m 0755 "$MIGRATE_TARGET"
  install -m 0755 "$source_dir/spark-migrate" "$MIGRATE_TARGET/spark-migrate"
  ln -sfn "$MIGRATE_TARGET/spark-migrate" "$MIGRATE_PATH"
fi

version_output="$($CLI_PATH --version)"
[[ "$version_output" == "Spark Server Manager ${EXPECTED_VERSION}" ]] || {
  echo "Unexpected Spark Manager version: $version_output" >&2
  exit 1
}
"$CLI_PATH" --ui-self-test

# Import persists the verified bundle under /opt/spark-airgap and loads images.
SPARK_AIRGAP_SHA256_PREVERIFIED=1 "$AIRGAP_CLI_PATH" --backend-action airgap-import "$root"

echo
printf 'Spark Server Manager %s installed for air-gapped operation.\n' "$EXPECTED_VERSION"
printf 'Active bundle: %s\n' "$(sed -n 's/^BUNDLE_ID=//p' "$root/metadata/manifest.env" | tail -n1)"
printf 'Run: spark\nThen open: Installation Air-Gapped -> Run complete offline install\n'
