# Shared progress UI for Spark CLI long-running operations.
#
# Determinate operations that expose a real percentage may render their own
# percentage bar (for example bootstrap Git download). Generic commands do not
# have a trustworthy total, so this helper uses an indeterminate activity bar
# and only prints 100% after the command has actually completed successfully.

spark_progress_tty_available() {
  [[ -e /dev/tty && -w /dev/tty ]] || return 1
  ( : >/dev/tty ) 2>/dev/null
}

spark_progress_format_elapsed() {
  local elapsed="${1:-0}"
  printf '%02d:%02d' "$((elapsed / 60))" "$((elapsed % 60))"
}

spark_progress_render_activity() {
  local tick="$1" elapsed="$2" label="${3:-Working}"
  local width=40 span pos left right bar
  span=$((width - 7))
  (( span < 1 )) && span=1
  pos=$((tick % (span * 2)))
  if (( pos >= span )); then pos=$((span * 2 - pos)); fi
  left="$pos"
  right=$((width - left - 7))
  (( right < 0 )) && right=0
  printf '\r\033[2K\033[36m  [%*s███████%*s]  WORKING  %s\033[0m' \
    "$left" '' "$right" '' "$(spark_progress_format_elapsed "$elapsed")" >/dev/tty
}

spark_progress_render_done() {
  printf '\r\033[2K\033[32m  [████████████████████████████████████████]  100%%\033[0m\n' >/dev/tty
}

spark_progress_clear_line() {
  printf '\r\033[2K' >/dev/tty 2>/dev/null || true
}

spark_progress_activity_loop() {
  local pid="$1" started="$2" tick=0 now elapsed
  # Avoid flashing a progress bar for commands that complete almost instantly.
  sleep 0.18
  while kill -0 "$pid" 2>/dev/null; do
    now="$(date +%s)"
    elapsed=$((now - started))
    spark_progress_render_activity "$tick" "$elapsed"
    tick=$((tick + 1))
    sleep 0.08
  done
}

spark_progress_run_logged_command() {
  local label="$1"
  shift
  local pid ticker_pid rc started

  [[ -n "${CURRENT_LOG:-}" ]] || new_log "spark-progress"

  # Non-interactive consumers keep the compact historical behavior.
  if ! spark_progress_tty_available; then
    "$@" >>"$CURRENT_LOG" 2>&1
    return $?
  fi

  started="$(date +%s)"
  "$@" >>"$CURRENT_LOG" 2>&1 &
  pid=$!
  spark_progress_activity_loop "$pid" "$started" &
  ticker_pid=$!

  set +e
  wait "$pid"
  rc=$?
  set -e

  kill "$ticker_pid" >/dev/null 2>&1 || true
  wait "$ticker_pid" >/dev/null 2>&1 || true

  if (( rc == 0 )); then
    spark_progress_render_done
  else
    spark_progress_clear_line
  fi
  return "$rc"
}

# Override the common silent runner used across Installation, Update, Supabase,
# installation and repair flows. Command output remains in CURRENT_LOG exactly as
# before, so failure diagnostics and automation contracts are preserved.
run_logged() {
  local label="$1"
  shift
  info "$label"
  if spark_progress_run_logged_command "$label" "$@"; then
    ok "$label"
    return 0
  fi
  fail "$label"
  show_failure_log "$CURRENT_LOG"
  return 1
}

# Explicit helper for long actions whose output should remain log-only while the
# user gets the standard Spark activity bar. Use this instead of run_visible for
# new install/build/update operations when live command stdout is not required.
run_progress() {
  local label="$1"
  shift
  info "$label"
  if spark_progress_run_logged_command "$label" "$@"; then
    ok "$label"
    return 0
  fi
  fail "$label"
  show_failure_log "$CURRENT_LOG"
  return 1
}
