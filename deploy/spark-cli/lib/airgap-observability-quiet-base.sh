# Quiet expected transient readiness failures during Air-Gap observability startup.
# Step 22 polls until the stack is ready; services can legitimately return HTTP
# 503 during that window. Preserve the readiness return code while keeping those
# expected curl diagnostics out of the interactive UI. Final timeout diagnostics
# are still emitted by install_step_22 via livekit_report_observability_failure.

if declare -F livekit_observability_ready >/dev/null 2>&1; then
  eval "$(declare -f livekit_observability_ready | sed '1s/livekit_observability_ready/livekit_observability_ready_with_stderr/')"

  livekit_observability_ready() {
    livekit_observability_ready_with_stderr 2>/dev/null
  }
fi

spark_airgap_step21_prerequisite() {
  [[ -f "${STEP_DIR}/21.ok" ]] || {
    printf 'Step 22 prerequisite failed: Step 21 success marker is missing.\n' >>"${CURRENT_LOG:-/dev/null}"
    return 1
  }
  return 0
}

if declare -F install_step_22 >/dev/null 2>&1; then
  eval "$(declare -f install_step_22 \
    | sed '1s/install_step_22/install_step_22_with_persisted_step21/' \
    | sed 's/test_livekit_full_validation || {/spark_airgap_step21_prerequisite || {/')"

  install_step_22() {
    install_step_22_with_persisted_step21 "$@"
  }
fi

# airgap-observability-quiet.sh temporarily defines its own logging wrappers.
# Re-load the common renderer here so Air-Gap commands end with the exact same
# progress behavior as the normal Spark CLI.
source "${SCRIPT_DIR}/lib/progress-ui.sh"
