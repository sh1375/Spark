"""Exercise real readiness loops and step gates without Docker or networking."""
import unittest
import test_airgap_image_identity as identity


PROBE = r'''
mkdir -p "$SUPABASE_ROOT"
printf 'ANON_KEY=test-anon\n' >"$SUPABASE_ROOT/.env"
printf '0' >"$WORK/probes"
# Advance the real loop's deadline deterministically, without waiting in tests.
sleep() { SECONDS=$((SECONDS + $1)); }
curl() {
  local n
  n=$(($(cat "$WORK/probes") + 1))
  printf '%s' "$n" >"$WORK/probes"
  [[ "$1" == --noproxy && "$2" == '*' && "${@: -1}" == 'http://127.0.0.1:8000/functions/v1/auth-health-check' ]] || return 9
  sed -n "${n}p" "$WORK/responses"
}
'''

class RuntimeReadinessTests(unittest.TestCase):
    run_shell = identity.AirgapIdentityTests.run_shell

    def test_transient_startup_recovers_automatically(self):
        self.run_shell(PROBE + r'''
printf '000\n502\n503\n204\n' >"$WORK/responses"
_airgap_edge_runtime_probe "$SUPABASE_ROOT" 10
[[ "$(cat "$WORK/probes")" == 4 ]]
''')

    def test_auth_error_fails_immediately(self):
        self.run_shell(PROBE + r'''
printf '401\n204\n' >"$WORK/responses"
if _airgap_edge_runtime_probe "$SUPABASE_ROOT" 10; then exit 1; fi
[[ "$(cat "$WORK/probes")" == 1 ]]
''')

    def test_persistent_server_error_has_bounded_deadline(self):
        self.run_shell(PROBE + r'''
printf '500\n500\n500\n204\n' >"$WORK/responses"
if _airgap_edge_runtime_probe "$SUPABASE_ROOT" 6; then exit 1; fi
[[ "$(cat "$WORK/probes")" == 3 ]]
''')

    def test_missing_anon_key_never_sends_probe(self):
        self.run_shell(PROBE + r'''
: >"$SUPABASE_ROOT/.env"
if _airgap_edge_runtime_probe "$SUPABASE_ROOT"; then exit 1; fi
[[ "$(cat "$WORK/probes")" == 0 ]]
''')

    def test_step10_uses_same_readiness_gate_after_cache_activation(self):
        self.run_shell(PROBE + r'''
export SPARK_AIRGAP_ACTIVE=1
STEP_DIR="$WORK/steps"; mkdir "$STEP_DIR"
BACKUP_DIR="$WORK/backups"; mkdir "$BACKUP_DIR"
airgap_current_root() { printf '%s' "$WORK/bundle"; }
install_step_10_airgap_base_v2() { mark_step 10; }
_airgap_edge_validate_payload() { :; }
_airgap_edge_seed_live_cache() { :; }
_airgap_edge_capture_logs() { touch "$WORK/diagnostics"; }
printf '503\n204\n' >"$WORK/responses"
install_step_10
[[ -f "$STEP_DIR/10.ok" && "$(cat "$WORK/probes")" == 2 ]]
printf '0' >"$WORK/probes"
printf '401\n' >"$WORK/responses"
if install_step_10; then exit 1; fi
[[ ! -f "$STEP_DIR/10.ok" && -f "$WORK/diagnostics" ]]
''')


if __name__ == '__main__':
    unittest.main()
