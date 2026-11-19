"""Exercise final load order and installer boundaries without changing the host."""
import unittest
import test_airgap_image_identity as identity


class OfflineInstallTests(unittest.TestCase):
    run_shell = identity.AirgapIdentityTests.run_shell

    def test_full_and_individual_use_identical_plan_and_preflight(self):
        self.run_shell(r'''
airgap_prepare_install() { printf 'prepare\n' >>"$WORK/preflight"; }
unmark_step() { :; }
run_install_step() { printf '%s\n' "$1" >>"$WORK/steps"; }
airgap_install_all
cp "$WORK/steps" "$WORK/full"
: >"$WORK/steps"
for n in "${AIRGAP_INSTALL_STEPS[@]}"; do airgap_install_one_step "$n"; done
cmp "$WORK/full" "$WORK/steps"
[[ "$(wc -l <"$WORK/steps")" == 17 ]]
[[ "$(wc -l <"$WORK/preflight")" == 18 ]]
if grep -qx 18 "$WORK/steps"; then exit 1; fi
for retired in 16 18 19 20 22; do if airgap_install_one_step "$retired"; then exit 1; fi; done
''')

    def test_failed_step_stops_chain_and_clears_marker(self):
        self.run_shell(r'''
STEP_DIR="$WORK/steps"; mkdir "$STEP_DIR"
touch "$STEP_DIR/7.ok"
airgap_prepare_install() { :; }
run_install_step() { printf '%s\n' "$1" >>"$WORK/executed"; [[ "$1" != 7 ]]; }
if airgap_install_all; then exit 1; fi
[[ "$(tail -1 "$WORK/executed")" == 7 ]]
[[ ! -f "$STEP_DIR/7.ok" ]]
''')

    def test_failed_preflight_prevents_any_step(self):
        self.run_shell(r'''
airgap_prepare_install() { return 1; }
run_install_step() { touch "$WORK/executed"; }
if airgap_install_all; then exit 1; fi
if airgap_install_one_step 1; then exit 1; fi
[[ ! -e "$WORK/executed" ]]
''')

    def test_rerun_invalidates_downstream_validation_even_on_failure(self):
        self.run_shell(r'''
STEP_DIR="$WORK/steps"; mkdir "$STEP_DIR"
for n in "${AIRGAP_INSTALL_STEPS[@]}"; do touch "$STEP_DIR/$n.ok"; done
airgap_prepare_install() { :; }
run_install_step() { return 1; }
if airgap_install_one_step 10; then exit 1; fi
[[ -f "$STEP_DIR/9.ok" ]]
for n in 10 11 12 13 14 15 17 21; do [[ ! -f "$STEP_DIR/$n.ok" ]]; done
if spark_airgap_step21_prerequisite; then exit 1; fi
''')

    def test_both_modes_share_exclusive_lock_and_release_after_failure(self):
        self.run_shell(r'''
STEP_DIR="$WORK/steps"; mkdir "$STEP_DIR"
airgap_prepare_install() { touch "$WORK/prepared"; }
run_install_step() { return 1; }
exec {held}>"$STATE_DIR/airgap-install.lock"
flock -n "$held"
if airgap_install_all; then exit 1; fi
if airgap_install_one_step 10; then exit 1; fi
[[ ! -e "$WORK/prepared" ]]
exec {held}>&-
if airgap_install_one_step 10; then exit 1; fi
[[ -e "$WORK/prepared" ]]
exec {released}>"$STATE_DIR/airgap-install.lock"
flock -n "$released"
exec {released}>&-
''')

    def test_shims_force_local_images_and_offline_modules(self):
        self.run_shell(r'''
AIRGAP_SHIM_DIR="$WORK/shims"
export AIRGAP_ROOT="$WORK/bundle" SPARK_AIRGAP_ACTIVE=1
export AIRGAP_REAL_DOCKER="$WORK/docker-real"
printf '#!/bin/bash\nprintf "%%s\\n" "$@" >"$WORK/docker-args"\n' >"$AIRGAP_REAL_DOCKER"
chmod +x "$AIRGAP_REAL_DOCKER"
airgap_prepare_runtime_shims "$AIRGAP_ROOT"
"$AIRGAP_SHIM_DIR/docker" compose -f pull --project-name build up -d --pull always api-gw
[[ "$(cat "$WORK/docker-args")" == $'compose\n-f\npull\n--project-name\nbuild\nup\n--pull\nnever\n--no-build\n-d\napi-gw' ]]
if "$AIRGAP_SHIM_DIR/docker" pull missing:image; then exit 1; fi
if "$AIRGAP_SHIM_DIR/docker" compose up --build; then exit 1; fi
"$AIRGAP_SHIM_DIR/docker" compose run --rm task
[[ "$(cat "$WORK/docker-args")" == $'compose\nrun\n--pull\nnever\n--rm\ntask' ]]
"$AIRGAP_SHIM_DIR/docker" run --rm local:image
[[ "$(cat "$WORK/docker-args")" == $'run\n--pull=never\n--rm\nlocal:image' ]]
if "$AIRGAP_SHIM_DIR/npm" ci; then exit 1; fi
''')

    def test_preflight_recovers_images_only_from_validated_local_bundle(self):
        self.run_shell(r'''
airgap_validate_bundle_dir() { [[ "${BAD_BUNDLE:-0}" == 0 ]]; }
airgap_validate_target_compatibility() { :; }
airgap_verify_images() { [[ -e "$WORK/images-ready" ]]; }
airgap_reload_image_archive() { touch "$WORK/reloaded" "$WORK/images-ready"; }
airgap_full_preflight "$WORK/bundle"
[[ -f "$WORK/reloaded" ]]
rm "$WORK/reloaded"
airgap_full_preflight "$WORK/bundle"
[[ ! -e "$WORK/reloaded" ]]
BAD_BUNDLE=1
if airgap_full_preflight "$WORK/bundle"; then exit 1; fi
[[ ! -e "$WORK/reloaded" ]]
''')

    def test_failed_local_image_recovery_stops_both_modes(self):
        self.run_shell(r'''
airgap_current_root() { printf '%s' "$WORK/bundle"; }
airgap_validate_bundle_dir() { :; }
airgap_validate_target_compatibility() { :; }
airgap_verify_images() { return 1; }
airgap_reload_image_archive() { return 1; }
run_install_step() { touch "$WORK/executed"; }
if airgap_install_all; then exit 1; fi
if airgap_install_one_step 10; then exit 1; fi
[[ ! -e "$WORK/executed" ]]
''')

    def test_builder_never_transfers_manager_or_tls(self):
        self.run_shell(r'''
make_repos
printf 'PRIVATE_BUILDER_CONFIG=yes\n' >"$MANAGER_CONF"
airgap_build_bundle </dev/null
mkdir "$WORK/extracted"
archive=("$WORK/output/"*.tar.gz)
root="$(airgap_extract_bundle_archive "${archive[0]}" "$WORK/extracted")"
[[ "$(airgap_meta_from "$root" CONFIG_PACK)" == 0 ]]
[[ "$(airgap_meta_from "$root" CERTIFICATE_PACK)" == 0 ]]
[[ -z "$(find "$root/config" "$root/certificates" -type f -print -quit)" ]]
''')

    def test_firewall_helpers_do_not_invoke_ufw(self):
        self.run_shell(r'''
ufw() { touch "$WORK/ufw-called"; return 1; }
firewall_optional_allow_port 5432
firewall_optional_close_port 5432
if install_step_18; then exit 1; fi
[[ ! -e "$WORK/ufw-called" ]]
''')

    def test_existing_database_runs_full_checks_without_restore(self):
        self.run_shell(r'''
STEP_DIR="$WORK/steps"; mkdir "$STEP_DIR"
test_supabase_health() { :; }; airgap_ip_test_nginx() { :; }
touch "$STATE_DIR/airgap-db-integration.pending"
spark_application_database_provisioned() { return 0; }
restore_plain_database_interactive() { touch "$WORK/restore"; return 1; }
_airgap_edge_runtime_probe() { :; }
test_function_sync() { touch "$WORK/functions-checked"; }
install_step_21
[[ -f "$STEP_DIR/21.ok" && -f "$WORK/functions-checked" && ! -e "$WORK/restore" ]]
''')

    def test_missing_database_restore_failure_cannot_mark_success(self):
        self.run_shell(r'''
STEP_DIR="$WORK/steps"; mkdir "$STEP_DIR"; touch "$STEP_DIR/21.ok"
test_supabase_health() { :; }; airgap_ip_test_nginx() { :; }
spark_application_database_provisioned() { return 1; }
restore_plain_database_interactive() { return 1; }
if install_step_21; then exit 1; fi
[[ ! -f "$STEP_DIR/21.ok" ]]
''')

    def test_offline_supabase_pin_is_stamped_and_checked(self):
        self.run_shell(r'''
make_repos
source_backup="$WORK/source-backup"
mv "$SUPABASE_SOURCE" "$source_backup"
root="$WORK/bundle"; mkdir -p "$root/sources" "$root/metadata"
commit="$(git -C "$source_backup" rev-parse HEAD)"
printf 'SUPABASE_COMMIT=%s\nSUPABASE_BRANCH=main\nSUPABASE_REF=self-hosted/v0.8.1\n' "$commit" >"$root/metadata/manifest.env"
git -C "$source_backup" bundle create "$root/sources/supabase.git.bundle" main refs/tags/self-hosted/v0.8.1
# The fixture source does not include a .env.example; copy it in the copy boundary.
cp() { command cp "$@"; }
airgap_current_root() { printf '%s\n' "$WORK/bundle"; }
export SPARK_AIRGAP_ACTIVE=1
STEP_DIR="$WORK/steps"; mkdir "$STEP_DIR"
# Build a real minimal source bundle including the initial environment.
printf 'POSTGRES_PASSWORD=placeholder\n' >"$source_backup/docker/.env.example"
git -C "$source_backup" add .
git -C "$source_backup" -c user.name=Test -c user.email=test@example.invalid commit -qm env
commit="$(git -C "$source_backup" rev-parse HEAD)"
git -C "$source_backup" tag -f self-hosted/v0.8.1
sed -i "s/^SUPABASE_COMMIT=.*/SUPABASE_COMMIT=$commit/" "$root/metadata/manifest.env"
git -C "$source_backup" bundle create "$root/sources/supabase.git.bundle" main refs/tags/self-hosted/v0.8.1
install_step_4
test_supabase_source
[[ "$(spark_supabase_runtime_ref)" == self-hosted/v0.8.1 ]]
printf 'ref=self-hosted/v0.0.1\n' >"$SUPABASE_ROOT/.supabase-version"
if install_step_4; then exit 1; fi
''')


if __name__ == '__main__':
    unittest.main()
