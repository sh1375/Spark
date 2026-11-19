"""Failure-path coverage for offline bundle completeness and publication."""
import unittest

import test_airgap_image_identity as identity


BUILD = r'''
make_repos
airgap_build_bundle <<<' '
mkdir "$WORK/extracted"
archive=("$WORK/output/"*.tar.gz)
root="$(airgap_extract_bundle_archive "${archive[0]}" "$WORK/extracted")"
rehash() { (cd "$root" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum >SHA256SUMS); }
'''


class AirgapCompletenessTests(unittest.TestCase):
    run_shell = identity.AirgapIdentityTests.run_shell

    def test_checksum_requires_full_coverage(self):
        self.run_shell(BUILD + r'''
printf 'unlisted\n' >"$root/extra.txt"
if airgap_validate_checksum_manifest "$root"; then exit 20; fi
rehash
airgap_validate_checksum_manifest "$root"
sed -i '\|./extra.txt$|d' "$root/SHA256SUMS"
if airgap_validate_checksum_manifest "$root"; then exit 21; fi
''')

    def test_missing_image_and_wrong_source_commit_are_rejected(self):
        self.run_shell(BUILD + r'''
cp "$root/docker/image-ids.txt" "$WORK/ids"
sed -i '/other\/image/d' "$root/docker/image-ids.txt"
rehash
if airgap_validate_bundle_dir "$root"; then exit 22; fi
cp "$WORK/ids" "$root/docker/image-ids.txt"
bad_commit="$(printf 'f%.0s' {1..40})"
if airgap_validate_source_bundle "$root" spark main "$bad_commit"; then exit 23; fi
if airgap_validate_source_bundle "$root" supabase master "$(airgap_meta_from "$root" SUPABASE_COMMIT)"; then exit 24; fi
''')

    def test_missing_apt_and_corrupt_npm_are_rejected(self):
        self.run_shell(BUILD + r'''
printf 'missing-package\n' >>"$root/apt/requested-packages.txt"
if airgap_validate_payload_archives "$root"; then exit 25; fi
sed -i '/missing-package/d' "$root/apt/requested-packages.txt"
printf 'not a tarball\n' >"$root/npm/npm-test.tgz"
if airgap_validate_payload_archives "$root"; then exit 26; fi
''')

    def test_missing_function_is_rejected_even_with_recomputed_checksums(self):
        self.run_shell(BUILD + r'''
rm "$root/edge-functions/hello/index.ts"
rehash
if airgap_validate_bundle_dir "$root"; then exit 31; fi
''')

    def test_validate_command_accepts_extracted_directory(self):
        start = identity.ENTRYPOINT.index('spark_airgap_validate_action()')
        end = identity.ENTRYPOINT.index('spark_airgap_dispatch_inner()')
        self.run_shell(BUILD + identity.ENTRYPOINT[start:end] + r'''
airgap_validate_target_compatibility() { :; }
spark_airgap_validate_action "$root"
''')

    def test_import_failure_keeps_previous_activation(self):
        self.run_shell(BUILD + r'''
airgap_validate_target_compatibility() { :; }
export -f docker
printf '#!/usr/bin/env bash\ndocker "$@"\n' >"$WORK/docker"
chmod +x "$WORK/docker"
AIRGAP_REAL_DOCKER="$WORK/docker"
mkdir -p "$AIRGAP_HOME/previous"
ln -s "$AIRGAP_HOME/previous" "$AIRGAP_CURRENT_LINK"
printf 'previous\n' >"$AIRGAP_CONF"
export FAIL_LOAD=1
if airgap_import_bundle "$root"; then exit 27; fi
[[ "$(readlink "$AIRGAP_CURRENT_LINK")" == "$AIRGAP_HOME/previous" ]]
[[ "$(cat "$AIRGAP_CONF")" == previous ]]
''')

    def test_failed_offline_proof_publishes_nothing_and_cleans_workspace(self):
        self.run_shell(r'''
make_repos
mkdir "$WORK/tmp"
export TMPDIR="$WORK/tmp" FAIL_PROOF=1
if airgap_build_bundle <<<' '; then exit 28; fi
[[ -z "$(find "$WORK/output" -type f -print -quit)" ]]
[[ -z "$(find "$WORK/tmp" -mindepth 1 -print -quit)" ]]
[[ -s "$WORK/offline-proof-script" ]]
''')

    def test_compose_inventory_propagates_first_failure(self):
        self.run_shell(r'''
source "$SCRIPT_DIR/lib/airgap-build.sh"
mkdir -p "$SUPABASE_SOURCE/docker"
docker() { if [[ "$PWD" == "$SUPABASE_SOURCE/docker" ]]; then return 9; else printf 'other/image:v1\n'; fi; }
if airgap_collect_compose_images "$SUPABASE_SOURCE" "$WORK/images"; then exit 29; fi
''')

    def test_meta_helpers_do_not_depend_on_caller_local_variables(self):
        self.run_shell(r'''
mkdir -p "$WORK/one/metadata" "$WORK/two/metadata"
printf 'BUNDLE_ID=one\n' >"$WORK/one/metadata/manifest.env"
printf 'BUNDLE_ID=two\n' >"$WORK/two/metadata/manifest.env"
root="$WORK/one"
[[ "$(airgap_meta_from "$WORK/two" BUNDLE_ID)" == two ]]
unset root
[[ "$(airgap_meta_from "$WORK/one" BUNDLE_ID)" == one ]]
''')

    def test_publisher_never_leaves_final_archive_on_tar_failure(self):
        self.run_shell(r'''
mkdir -p "$WORK/spark-airgap-test" "$WORK/output"
tar() { printf 'partial output'; return 9; }
if airgap_publish_bundle "$WORK/spark-airgap-test" "$WORK/output"; then exit 30; fi
[[ -z "$(find "$WORK/output" -type f -print -quit)" ]]
''')

    def test_installed_builder_runs_the_current_source_entrypoint(self):
        start = identity.ENTRYPOINT.index('spark_airgap_dispatch_inner()')
        end = identity.ENTRYPOINT.index('spark_airgap_backend_action()')
        self.run_shell(identity.ENTRYPOINT[start:end] + r'''
make_repos
printf '#!/bin/bash\nprintf current >"$WORK/current-builder"\n' >"$SPARK_ROOT/deploy/spark-cli/spark-airgap"
spark_airgap_sync_source_main() { :; }
airgap_build_bundle() { return 32; }
spark_airgap_dispatch_inner airgap-build
[[ "$(cat "$WORK/current-builder")" == current ]]
''')


if __name__ == '__main__':
    unittest.main()
