# airgap-observability-quiet.sh temporarily defines its own logging wrappers.
# Re-load the common renderer here so Air-Gap commands end with the exact same
# progress behavior as the normal Spark CLI.
source "${SCRIPT_DIR}/lib/progress-ui.sh"
