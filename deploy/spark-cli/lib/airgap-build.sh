# Air-gap bundle builder. Sourced by lib/airgap.sh.

airgap_prompt_default() {
  local __var="$1" label="$2" default_value="$3" value
  read -r -p "${label} [${default_value}]: " value
  printf -v "$__var" '%s' "${value:-$default_value}"
}

# Ubuntu point releases share a package series (26.04.1 -> 26.04).
airgap_normalize_ubuntu_release() {
  case "$1" in
    24.04|26.04) printf '%s\n' "$1" ;;
    *)
      if [[ "$1" =~ ^(24\.04|26\.04)\.[0-9]+$ ]]; then
        printf '%s\n' "${BASH_REMATCH[1]}"
      else
        fail "Supported targets: Ubuntu 24.04 or 26.04 (point releases accepted)." >&2
        return 1
      fi ;;
  esac
}

airgap_build_apt_payload() (
  local output="$1" target_release="$2" count container rc
  mkdir -p "$output"
  find "$output" -maxdepth 1 -type f -name '*.deb' -delete
  rm -f "${output}/requested-packages.txt"

  # Do not rely on an APT cache bind-mount. Ubuntu/Docker APT cleanup hooks and
  # _apt sandbox permissions can make a successful download disappear from the
  # host mount. Build the complete payload inside a retained container, then
  # copy the verified payload to the host with `docker cp`.
  container="spark-airgap-apt-${target_release//./-}-$$-${RANDOM}"
  docker rm -f "$container" >/dev/null 2>&1 || true
  trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT

  set +e
  # -i is required because the builder script is supplied to `bash -s` on stdin.
  # Without it Docker detaches container stdin and bash exits successfully
  # without executing the heredoc, leaving /payload absent.
  docker run -i --pull=always --name "$container" --platform linux/amd64 \
    -e TARGET_RELEASE="$target_release" \
    "ubuntu:${target_release}" bash -s <<'BUNDLE_APT'
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive

# Keep APT downloads available for the final complete dependency resolution.
rm -f /etc/apt/apt.conf.d/docker-clean
apt-get -o APT::Update::Error-Mode=any update
apt-get install -y ca-certificates curl gnupg python3

. /etc/os-release
[[ "$ID" == ubuntu && "$VERSION_ID" == "$TARGET_RELEASE" ]]
codename="${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}"
[[ -n "$codename" ]]
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
cat >/etc/apt/sources.list.d/docker.list <<EOF_DOCKER
deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${codename} stable
EOF_DOCKER
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
chmod a+r /etc/apt/keyrings/nodesource.gpg
latest_node_major="$(curl -fsSL https://nodejs.org/dist/index.json | python3 -c 'import json,sys,re; data=json.load(sys.stdin); 
for item in data:
 v=str(item.get("version","")); m=re.fullmatch(r"v(\d+)\.\d+\.\d+",v)
 if m: print(m.group(1)); break
else: raise SystemExit(1)')"
cat >/etc/apt/sources.list.d/nodesource.list <<EOF_NODE
deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${latest_node_major}.x nodistro main
EOF_NODE
apt-get -o APT::Update::Error-Mode=any update
packages=(
  ca-certificates curl git gnupg jq openssl rsync python3 python3-yaml
  systemd systemd-sysv iproute2 procps sudo
  nginx docker-ce docker-ce-cli containerd.io
  docker-buildx-plugin docker-compose-plugin nodejs
)

# Include the installed base explicitly before resolving against an empty status
# file. Otherwise APT may upgrade a library while omitting its installed reverse
# dependents (e.g. util-linux requires exactly matching libmount/libblkid versions).
# Resolve the whole base plus Spark in one transaction, without host-specific pins.
mapfile -t base_packages < <(dpkg-query -W -f='${db:Status-Status} ${binary:Package}\n' \
  | awk '$1 == "installed" {print $2}')
((${#base_packages[@]} > 0))
: >/tmp/spark-empty-dpkg-status
rm -f /var/cache/apt/archives/*.deb
apt-get -o Dir::State::status=/tmp/spark-empty-dpkg-status \
  install -y --download-only --reinstall "${packages[@]}" "${base_packages[@]}"
mkdir -p /payload
cp -a /var/cache/apt/archives/*.deb /payload/
printf '%s\n' "${packages[@]}" >/payload/requested-packages.txt
count="$(find /payload -maxdepth 1 -type f -name '*.deb' | wc -l | tr -d '[:space:]')"
[[ "$count" =~ ^[0-9]+$ && "$count" -gt 0 ]]
printf 'Prepared %s offline .deb files inside container.\n' "$count"
BUNDLE_APT
  rc=$?
  set -e
  if (( rc != 0 )); then
    fail "Offline APT payload container build failed (exit=${rc})."
    return "$rc"
  fi

  if ! docker cp "${container}:/payload/." "$output/"; then
    fail "Unable to copy offline APT payload from builder container."
    return 1
  fi
  docker rm -f "$container" >/dev/null 2>&1 || true
  trap - EXIT

  count="$(find "$output" -maxdepth 1 -type f -name '*.deb' | wc -l | tr -d '[:space:]')"
  [[ "$count" =~ ^[0-9]+$ && "$count" -gt 0 ]] || {
    fail "Offline APT payload build returned success but produced no .deb files in ${output}."
    return 1
  }
  [[ -s "${output}/requested-packages.txt" ]] || {
    fail "Offline APT requested package manifest is missing from ${output}."
    return 1
  }
  install -m 0755 "${SCRIPT_DIR}/lib/airgap-packages.sh" "${output}/install-local.sh" || return 1
  printf 'UBUNTU_VERSION=%s\nARCH=amd64\n' "$target_release" >"${output}/platform.env"
  : >"${output}/package-versions.tsv"
  local archive
  for archive in "${output}"/*.deb; do
    dpkg-deb --show --showformat='${Package}\t${Version}\t${Architecture}\n' "$archive" >>"${output}/package-versions.tsv" || return 1
  done
  info "Offline APT payload contains ${count} .deb files."
  info "Exact package versions: ${output}/package-versions.tsv"
)

airgap_build_npm_payload() {
  local output="$1" target_release="$2"
  mkdir -p "$output"
  rm -f "${output}/frontend-node-modules.tar.gz" "${output}"/npm-*.tgz
  # The npm builder also receives its script over stdin, so keep stdin attached.
  docker run --rm -i --pull=always --platform linux/amd64 \
    -e TARGET_RELEASE="$target_release" \
    -v "${SPARK_ROOT}:/src:ro" \
    -v "${output}:/out" \
    "ubuntu:${target_release}" bash -s <<'BUNDLE_NPM'
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get -o APT::Update::Error-Mode=any update
apt-get install -y ca-certificates curl gnupg tar gzip python3
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
chmod a+r /etc/apt/keyrings/nodesource.gpg
latest_node_major="$(curl -fsSL https://nodejs.org/dist/index.json | python3 -c 'import json,sys,re; data=json.load(sys.stdin); 
for item in data:
 v=str(item.get("version","")); m=re.fullmatch(r"v(\d+)\.\d+\.\d+",v)
 if m: print(m.group(1)); break
else: raise SystemExit(1)')"
cat >/etc/apt/sources.list.d/nodesource.list <<EOF_NODE
deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${latest_node_major}.x nodistro main
EOF_NODE
apt-get -o APT::Update::Error-Mode=any update
apt-get install -y nodejs
npm install -g npm@latest
mkdir -p /work/frontend
cp /src/package.json /src/package-lock.json /work/frontend/
cd /work/frontend
npm ci
tar -czf /out/frontend-node-modules.tar.gz node_modules
cd /work
npm pack --pack-destination /out "npm@$(npm --version)" >/dev/null
BUNDLE_NPM
  [[ -s "${output}/frontend-node-modules.tar.gz" ]] || {
    fail "Offline frontend node_modules archive was not produced in ${output}."
    return 1
  }
  compgen -G "${output}/npm-*.tgz" >/dev/null || {
    fail "Offline npm package was not produced in ${output}."
    return 1
  }
}

airgap_collect_compose_images() {
  local supabase_source="$1" output="$2"
  (cd "${supabase_source}/docker" && docker compose --env-file .env.example -f docker-compose.yml config --images) |
    sed '/^[[:space:]]*$/d' | sort -u >"$output"
}

airgap_prove_offline_payloads() {
  local root="$1" target_release="$2"
  # Replay on a clean target image using ONLY the artifacts being shipped.
  # No Docker daemon or host services are started inside this test container.
  docker run --rm -i --pull=never --platform linux/amd64 --network none \
    -v "${root}/apt:/payload/apt:ro" -v "${root}/npm:/payload/npm:ro" \
    -v "${SPARK_ROOT}:/src:ro" "ubuntu:${target_release}" bash -s <<'OFFLINE_PROOF' || return 1
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive
mkdir -p /tmp/empty-sources
: >/tmp/empty-sources.list
printf '#!/bin/sh\nexit 101\n' >/usr/sbin/policy-rc.d
chmod +x /usr/sbin/policy-rc.d
# Allow APT's acquisition phase to resolve local .deb paths. --no-download
# skips it and can leave relative filenames for dpkg ("Pathname ... not absolute").
# Offline isolation is enforced by --network none plus the empty sources below.
apt-get -o Dir::Etc::sourcelist=/tmp/empty-sources.list \
  -o Dir::Etc::sourceparts=/tmp/empty-sources \
  install -y --no-remove /payload/apt/*.deb
while IFS= read -r package; do
  [[ -n "$package" ]] || continue
  [[ "$(dpkg-query -W -f='${Status}' "$package")" == 'install ok installed' ]]
done </payload/apt/requested-packages.txt
python3 -c 'import yaml'
docker compose version
node --version
npm --version
npm install --offline --no-audit --no-fund -g /payload/npm/npm-*.tgz
mkdir -p /work/frontend
tar -C /src --exclude=.git --exclude=node_modules --exclude=dist -cf - . | tar -C /work/frontend -xf -
tar -xzf /payload/npm/frontend-node-modules.tar.gz -C /work/frontend
cd /work/frontend
export npm_config_offline=true npm_config_audit=false npm_config_fund=false
export VITE_SUPABASE_URL=http://127.0.0.1:8000 VITE_SUPABASE_ANON_KEY=offline-build-proof
npm run build
test -s dist/index.html
test -s dist/sw.js
test -s dist/pwa-bootstrap.js
OFFLINE_PROOF
  printf 'UBUNTU_VERSION=%s\nARCH=amd64\nNETWORK=none\nAPT_INSTALL=passed\nNPM_INSTALL=passed\nFRONTEND_BUILD=passed\n' \
    "$target_release" >"${root}/npm/offline-proof.env"
}

airgap_write_image_ids() {
  local root="$1" image image_id
  : >"${root}/docker/image-ids.txt"
  while IFS= read -r image; do
    [[ -n "$image" ]] || continue
    image_id="$(docker image inspect --format '{{.Id}}' "$image")" || return 1
    [[ "$image_id" =~ ^sha256:[0-9a-f]{64}$ ]] || { fail "Invalid image ID: $image"; return 1; }
    printf '%s %s\n' "$image" "$image_id" >>"${root}/docker/image-ids.txt"
  done <"${root}/docker/images.txt"
}

airgap_publish_bundle() (
  local root="$1" output_root="$2" bundle_id archive partial
  bundle_id="$(basename "$root")"
  archive="${output_root}/${bundle_id}.tar.gz"
  [[ ! -e "$archive" ]] || { fail "Bundle output already exists: $archive"; return 1; }
  partial="$(mktemp "${output_root}/.${bundle_id}.XXXXXX")" || return 1
  trap 'rm -f -- "$partial"' EXIT
  # tar/gzip failure is already fatal. The internal SHA256SUMS manifest is the
  # single integrity authority after extraction, so do not reread the entire
  # multi-GB archive for gzip -t or an external .sha256 sidecar.
  tar -C "$(dirname "$root")" -czf "$partial" "$bundle_id" || return 1
  chmod 0600 "$partial"
  mv "$partial" "$archive" || return 1
)

airgap_linux_amd64_registry_digest() {
  local image="$1" raw digest
  raw="$(docker buildx imagetools inspect --raw "$image")" || return 1
  digest="$(python3 -c '
import json, sys
obj = json.load(sys.stdin)
items = obj.get("manifests") or []
for item in items:
    p = item.get("platform") or {}
    if p.get("os") == "linux" and p.get("architecture") == "amd64" and p.get("variant") in (None, ""):
        d = item.get("digest")
        if d:
            print(d)
            raise SystemExit(0)
raise SystemExit(1)
' <<<"$raw" 2>/dev/null || true)"
  if [[ -n "$digest" ]]; then
    printf '%s\n' "$digest"
    return 0
  fi

  # Single-platform manifests have no child list. Use the registry digest and
  # validate os/arch after pulling it by digest.
  docker buildx imagetools inspect "$image" \
    | sed -n 's/^Digest:[[:space:]]*//p' | head -n1
}

airgap_digest_reference() {
  local image="$1" digest="$2"
  python3 - "$image" "$digest" <<'PY'
import sys
ref, digest = sys.argv[1], sys.argv[2]
ref = ref.split('@', 1)[0]
slash = ref.rfind('/')
colon = ref.rfind(':')
if colon > slash:
    ref = ref[:colon]
print(f"{ref}@{digest}")
PY
}

airgap_prepare_linux_amd64_image() {
  local image="$1" digest digest_ref image_id platform cid
  digest="$(airgap_linux_amd64_registry_digest "$image")" || {
    fail "Unable to resolve the linux/amd64 registry manifest for ${image}."
    return 1
  }
  [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]] || {
    fail "Registry returned an invalid linux/amd64 digest for ${image}: ${digest:-missing}"
    return 1
  }
  digest_ref="$(airgap_digest_reference "$image" "$digest")" || return 1

  # Docker's containerd image store can report a platform as pulled while
  # docker save --platform cannot export it. Pull the exact child manifest by
  # digest and retag that single-platform image instead of relying on index
  # platform selection during export.
  docker image rm -f "$image" >/dev/null 2>&1 || true
  docker pull "$digest_ref" || return 1
  image_id="$(docker image inspect --format '{{.Id}}' "$digest_ref" 2>/dev/null || true)"
  [[ -n "$image_id" ]] || { fail "Pulled linux/amd64 image has no local image ID: ${image}"; return 1; }
  platform="$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$image_id" 2>/dev/null || true)"
  [[ "$platform" == "linux/amd64" ]] || {
    fail "Resolved image ${image} is not linux/amd64 after digest pull (reported: ${platform:-unknown})."
    return 1
  }
  docker tag "$image_id" "$image" || return 1

  # Exercise both export and daemon container creation before bundle assembly.
  docker image save "$image" >/dev/null || {
    fail "Docker image ${image} is not exportable after exact amd64 digest pull."
    return 1
  }
  cid="$(docker create --pull=never --entrypoint /bin/true "$image" 2>/dev/null)" || {
    fail "Docker image ${image} cannot create a container after exact amd64 digest pull."
    return 1
  }
  docker rm -f "$cid" >/dev/null 2>&1 || true
}

airgap_prepare_pinned_minio_image() (
  local image="$1" work release asset_url expected_sha binary_name entrypoint platform version_output cid
  work="$(mktemp -d)" || return 1
  trap 'rm -rf -- "$work"' EXIT

  case "$image" in
    quay.io/minio/minio:RELEASE.2025-04-22T22-12-26Z)
      release="RELEASE.2025-04-22T22-12-26Z"
      binary_name="minio"
      entrypoint="minio"
      expected_sha="53e2a2cb16c5366ea6fbbc479c19ddb4c6a0948273e752f740fb1fbf27bb817c"
      asset_url="https://github.com/minio/minio/releases/download/${release}/minio.linux-amd64.${release}"
      ;;
    quay.io/minio/mc:RELEASE.2025-08-13T08-35-41Z)
      release="RELEASE.2025-08-13T08-35-41Z"
      binary_name="mc"
      entrypoint="mc"
      expected_sha="01f866e9c5f9b87c2b09116fa5d7c06695b106242d829a8bb32990c00312e891"
      asset_url="https://github.com/minio/mc/releases/download/${release}/mc.linux-amd64.${release}"
      ;;
    *)
      return 2
      ;;
  esac

  info "Building ${image} from the official pinned MinIO linux/amd64 release binary."
  curl -fL --retry 4 --retry-delay 3 "$asset_url" -o "${work}/${binary_name}" || {
    fail "Unable to download pinned MinIO release asset for ${image}."
    return 1
  }
  printf '%s  %s\n' "$expected_sha" "${work}/${binary_name}" | sha256sum -c - >/dev/null || {
    fail "Pinned MinIO release checksum mismatch for ${image}."
    return 1
  }

  if [[ "$entrypoint" == "minio" ]]; then
    cat >"${work}/Dockerfile" <<'MINIO_SERVER_DOCKERFILE'
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
COPY minio /usr/local/bin/minio
RUN chmod 0755 /usr/local/bin/minio
ENTRYPOINT ["minio"]
MINIO_SERVER_DOCKERFILE
  else
    cat >"${work}/Dockerfile" <<'MINIO_MC_DOCKERFILE'
FROM ubuntu:24.04
COPY mc /usr/local/bin/mc
RUN chmod 0755 /usr/local/bin/mc
ENTRYPOINT ["mc"]
MINIO_MC_DOCKERFILE
  fi

  docker build --platform linux/amd64 --pull -t "$image" "$work" >/dev/null || {
    fail "Unable to build pinned Air-Gap MinIO image ${image}."
    return 1
  }
  platform="$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$image" 2>/dev/null || true)"
  [[ "$platform" == "linux/amd64" ]] || {
    fail "Pinned Air-Gap MinIO image ${image} is not linux/amd64 (reported: ${platform:-unknown})."
    return 1
  }
  version_output="$(docker run --rm --pull=never --entrypoint "$entrypoint" "$image" --version 2>&1)" || {
    fail "Pinned Air-Gap MinIO image ${image} cannot execute ${entrypoint} --version."
    return 1
  }
  grep -Fq "$release" <<<"$version_output" || {
    fail "Pinned Air-Gap MinIO image ${image} reports an unexpected version."
    return 1
  }
  docker image save "$image" >/dev/null || {
    fail "Pinned Air-Gap MinIO image ${image} is not exportable."
    return 1
  }
  cid="$(docker create --pull=never --entrypoint /bin/true "$image" 2>/dev/null)" || {
    fail "Pinned Air-Gap MinIO image ${image} cannot create a container."
    return 1
  }
  docker rm -f "$cid" >/dev/null 2>&1 || true
)

airgap_prepare_bundle_image() {
  local image="$1" meta="${2}/metadata/edge-runtime.env"
  local runtime_image expected_id actual_id platform
  case "$image" in
    quay.io/minio/minio:RELEASE.2025-04-22T22-12-26Z|quay.io/minio/mc:RELEASE.2025-08-13T08-35-41Z)
      airgap_prepare_pinned_minio_image "$image"
      return $?
      ;;
  esac
  if [[ -f "$meta" ]]; then
    runtime_image="$(sed -n 's/^EDGE_RUNTIME_IMAGE=//p' "$meta")"
    if [[ "$image" == "$runtime_image" ]]; then
      expected_id="$(sed -n 's/^EDGE_RUNTIME_IMAGE_ID=//p' "$meta")"
      actual_id="$(docker image inspect --format '{{.Id}}' "$image" 2>/dev/null || true)"
      platform="$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$image" 2>/dev/null || true)"
      [[ "$expected_id" =~ ^sha256:[0-9a-f]{64}$ && "$actual_id" == "$expected_id" && "$platform" == "linux/amd64" ]] || {
        fail "Prepared Edge Runtime changed before export: ${image} expected=${expected_id:-missing} actual=${actual_id:-missing} platform=${platform:-missing}. Rebuild the bundle."
        return 1
      }
      # Already pulled by child digest and exercised before building DENO_DIR.
      # Do not re-resolve a mutable registry tag after recording cache identity.
      return 0
    fi
  fi
  airgap_prepare_linux_amd64_image "$image"
}

airgap_export_linux_amd64_images() {
  local list_file="$1" archive="$2" image platform
  local -a images=()
  mapfile -t images < <(sed '/^[[:space:]]*$/d' "$list_file")
  ((${#images[@]} > 0)) || { fail "Docker image manifest is empty."; return 1; }

  # Every external tag has already been normalized to an exact linux/amd64
  # child manifest. The locally-built Avatar image is validated here as well.
  for image in "${images[@]}"; do
    platform="$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$image" 2>/dev/null || true)"
    [[ "$platform" == "linux/amd64" ]] || {
      fail "Docker image ${image} is not the required linux/amd64 variant (reported: ${platform:-unknown})."
      return 1
    }
  done

  rm -f "$archive"
  # One final docker save is the exportability check. Avoid exporting every
  # image once individually and then exporting all of them again.
  docker image save "${images[@]}" | gzip -1 >"$archive" || return 1
  [[ -s "$archive" ]] || { fail "Docker image archive was not produced."; return 1; }
}

airgap_copy_certificate_pack() {
  local destination="$1" source="$2" domain src
  [[ -n "$source" && -d "$source" ]] || return 0
  mkdir -p "$destination"

  # Dedicated pack layout: <source>/<domain>/fullchain.pem + privkey.pem.
  if find "$source" -mindepth 2 -maxdepth 2 -type f -name fullchain.pem -print -quit | grep -q .; then
    while IFS= read -r src; do
      domain="$(basename "$(dirname "$src")")"
      [[ -f "$(dirname "$src")/privkey.pem" ]] || continue
      mkdir -p "${destination}/${domain}"
      cp -L "$src" "${destination}/${domain}/fullchain.pem"
      cp -L "$(dirname "$src")/privkey.pem" "${destination}/${domain}/privkey.pem"
      chmod 0600 "${destination}/${domain}/privkey.pem"
    done < <(find "$source" -mindepth 2 -maxdepth 2 -type f -name fullchain.pem | sort)
    return 0
  fi

  # Certbot root is accepted only when manager.conf identifies exact Spark domains.
  if [[ -d "${source}/live" && -f "$MANAGER_CONF" ]]; then
    local app api cert_dir
    app="$(sed -n 's/^APP_DOMAIN=//p' "$MANAGER_CONF" | tail -n1)"
    api="$(sed -n 's/^API_DOMAIN=//p' "$MANAGER_CONF" | tail -n1)"
    for domain in "$app" "$api"; do
      [[ -n "$domain" ]] || continue
      cert_dir=""
      for src in "${source}/live/${domain}" "${source}/live/${domain}-"*; do
        [[ -d "$src" && -f "$src/fullchain.pem" && -f "$src/privkey.pem" ]] || continue
        cert_dir="$src"; break
      done
      [[ -n "$cert_dir" ]] || continue
      mkdir -p "${destination}/${domain}"
      cp -L "${cert_dir}/fullchain.pem" "${destination}/${domain}/fullchain.pem"
      cp -L "${cert_dir}/privkey.pem" "${destination}/${domain}/privkey.pem"
      chmod 0600 "${destination}/${domain}/privkey.pem"
    done
    return 0
  fi

  fail "Certificate source must be a dedicated <domain>/fullchain.pem + privkey.pem pack, or a Certbot root with manager.conf present."
  return 1
}


airgap_build_bundle() {
  title
  new_log "airgap-build"
  local target_release output_root cert_source work bundle bundle_id spark_commit spark_short
  local supabase_source supabase_commit avatar_image created_at config_pack=0 cert_pack=0

  for cmd in git docker tar gzip sha256sum openssl python3; do
    command -v "$cmd" >/dev/null 2>&1 || { fail "Bundle builder requires: $cmd"; return 1; }
  done
  [[ -d "${SPARK_ROOT}/.git" ]] || { fail "Spark source repository is required at ${SPARK_ROOT}."; return 1; }
  [[ "$(git -C "$SPARK_ROOT" branch --show-current)" == "main" ]] || { fail "Spark bundle must be built from branch main."; return 1; }
  [[ -z "$(git -C "$SPARK_ROOT" status --porcelain)" ]] || { fail "Spark repository has uncommitted changes; bundle generation refused."; return 1; }
  docker info >/dev/null 2>&1 || { fail "Docker daemon is required on the connected bundle-builder host."; return 1; }

  . /etc/os-release
  airgap_prompt_default target_release "Destination Ubuntu release (not builder host)" "26.04"
  target_release="$(airgap_normalize_ubuntu_release "$target_release")" || return 1
  airgap_prompt_default output_root "Bundle output directory" "/var/backups/spark-airgap"
  # Public DNS/TLS is external to Spark. Air-Gap bundles never require or
  # prompt for domain certificates.
  cert_source=""

  mkdir -p "$output_root"
  # Keep the multi-GB raw bundle workspace on the selected output filesystem.
  # /tmp may be a small tmpfs (common on production hosts) and cannot safely
  # hold docker-images.tar.gz while the final bundle is being assembled.
  work="$(mktemp -d "${output_root}/.spark-airgap-build.XXXXXX")"

  spark_commit="$(git -C "$SPARK_ROOT" rev-parse HEAD)"
  spark_short="${spark_commit:0:12}"
  created_at="$(date -u +%Y%m%dT%H%M%SZ)"
  bundle_id="spark-airgap-${spark_short}-ubuntu${target_release}-amd64-${created_at}"
  bundle="${work}/${bundle_id}"
  mkdir -p "$bundle"/{metadata,sources,apt,docker,npm,certificates,config}

  info "Creating Spark source bundle at ${spark_short}."
  git -C "$SPARK_ROOT" bundle create "${bundle}/sources/spark.git.bundle" main || return 1

  supabase_source="${work}/supabase-source"
  run_visible "Clone official Supabase master for offline snapshot" \
    git clone --branch master --single-branch https://github.com/supabase/supabase.git "$supabase_source" || return 1
  supabase_commit="$(git -C "$supabase_source" rev-parse HEAD)"
  git -C "$supabase_source" bundle create "${bundle}/sources/supabase.git.bundle" master || return 1

  run_visible "Build Ubuntu/Docker/Node offline APT payload" airgap_build_apt_payload "${bundle}/apt" "$target_release" || return 1

  run_visible "Build target-matched frontend/npm offline payload" \
    airgap_build_npm_payload "${bundle}/npm" "$target_release" || return 1

  avatar_image="spark/avatar-worker-airgap:${spark_short}"
  run_visible "Build pinned Avatar Worker image" docker build --platform linux/amd64 --pull --no-cache -t "$avatar_image" "${SPARK_ROOT}/worker" || return 1
  airgap_collect_compose_images "$supabase_source" "${bundle}/docker/images.txt" || return 1
  printf '%s\n' "$avatar_image" >>"${bundle}/docker/images.txt"
  sort -u -o "${bundle}/docker/images.txt" "${bundle}/docker/images.txt"

  while IFS= read -r image; do
    [[ -n "$image" ]] || continue
    [[ "$image" == "$avatar_image" ]] && continue
    run_visible "Resolve and pull exact linux/amd64 image ${image}" \
      airgap_prepare_bundle_image "$image" "$bundle" || return 1
  done <"${bundle}/docker/images.txt"

  info "Validating and saving the linux/amd64 Docker image set. This can take several minutes."
  run_visible "Validate and export linux/amd64 Docker images" \
    airgap_export_linux_amd64_images "${bundle}/docker/images.txt" "${bundle}/docker/docker-images.tar.gz" || return 1
  : >"${bundle}/docker/image-ids.txt"
  while IFS= read -r image; do
    printf '%s %s\n' "$image" "$(docker image inspect --format '{{.Id}}' "$image")" >>"${bundle}/docker/image-ids.txt"
  done <"${bundle}/docker/images.txt"

  if [[ -f "$MANAGER_CONF" ]]; then
    cp "$MANAGER_CONF" "${bundle}/config/manager.conf"
    chmod 0600 "${bundle}/config/manager.conf"
    config_pack=1
  fi
  if [[ -n "$cert_source" ]]; then
    airgap_copy_certificate_pack "${bundle}/certificates" "$cert_source" || return 1
  fi
  if find "${bundle}/certificates" -mindepth 2 -maxdepth 2 -type f -name privkey.pem -print -quit | grep -q .; then cert_pack=1; fi

  cat >"${bundle}/metadata/manifest.env" <<EOF_META
FORMAT_VERSION=${AIRGAP_FORMAT_VERSION}
BUNDLE_ID=${bundle_id}
CREATED_AT=${created_at}
UBUNTU_VERSION=${target_release}
ARCH=amd64
SPARK_COMMIT=${spark_commit}
SUPABASE_BRANCH=master
SUPABASE_COMMIT=${supabase_commit}
AVATAR_IMAGE=${avatar_image}
CONFIG_PACK=${config_pack}
CERTIFICATE_PACK=${cert_pack}
EOF_META
  chmod 0600 "${bundle}/metadata/manifest.env"

  BUNDLE_ROOT="$bundle" python3 - <<'PY'
import json, os
from pathlib import Path
root=Path(os.environ['BUNDLE_ROOT'])
values={}
for line in (root/'metadata/manifest.env').read_text().splitlines():
    if '=' in line:
        k,v=line.split('=',1); values[k]=v
(root/'manifest.json').write_text(json.dumps(values, indent=2, sort_keys=True)+"\n", encoding='utf-8')
PY

  # Generate the internal integrity manifest once. Do not immediately reread
  # every payload file to verify hashes that were just calculated.
  (cd "$bundle" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum >SHA256SUMS) || return 1
  tar -C "$work" -czf "${output_root}/${bundle_id}.tar.gz" "$bundle_id" || return 1
  rm -rf "$work"

  ok "Air-gap bundle created: ${output_root}/${bundle_id}.tar.gz"
  printf 'Spark commit        : %s\n' "$spark_commit"
  printf 'Supabase commit     : %s\n' "$supabase_commit"
  printf 'Target              : Ubuntu %s / amd64\n' "$target_release"
  printf 'TLS certificate pack: %s\n' "$([[ "$cert_pack" == 1 ]] && echo INCLUDED || echo MISSING)"
  if [[ "$cert_pack" != 1 ]]; then
    warn "Package/source/image/npm installation is offline-ready, but complete Run All needs certificates for steps 13/19."
  fi
}
