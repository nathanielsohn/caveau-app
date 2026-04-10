#!/bin/bash
# Caveau MVP — Resumable Build Pipeline
# Note: Pushes directly to main (unless CAVEAU_AUTO_PUSH=false).
#
# Usage:
#   ./build.sh start          Start or resume building from next pending feature
#   ./build.sh start 07       Start from a specific feature
#   ./build.sh stop            Signal the pipeline to stop after the current feature
#   ./build.sh status          Show current build progress
#   ./build.sh retry           Retry the last failed feature
#   ./build.sh docs            Regenerate PROGRESS.md from BUILD_STATUS.json
#   ./build.sh reset <num>     Reset a feature back to pending
#   ./build.sh reset-all       Reset all features to pending
#   ./build.sh rollback <num>  Revert a failed feature to its pre-build state
#   ./build.sh dry-run         Preview what would be built next without running
#
# Environment variables:
#   CAVEAU_AUTO_PUSH=false     Disable auto-push after each feature (default: true)
#   CAVEAU_MAX_RETRIES=3       Max retry attempts per feature (default: 3)

set -euo pipefail

# This script requires bash (uses PIPESTATUS, arrays)
if [ -z "${BASH_VERSION:-}" ]; then
  echo "Error: This script requires bash. Run with: bash build.sh or ./build.sh"
  exit 1
fi

cd "$(dirname "$0")"

STATUS_FILE="BUILD_STATUS.json"
STOP_FILE=".build-stop"
SCRIPTS="scripts"
BUILDING_FEATURE=""  # Tracks active feature for signal handler
MAX_RETRIES="${CAVEAU_MAX_RETRIES:-3}"
AUTO_PUSH="${CAVEAU_AUTO_PUSH:-true}"

# ── Helpers ─────────────────────────────────────────────────────

print_header() {
  echo ""
  echo "=========================================="
  echo "  $1"
  echo "=========================================="
  echo ""
}

notify() {
  # macOS notification — best-effort, never fails the build
  local TITLE="$1"
  local MSG="$2"
  osascript -e "display notification \"$MSG\" with title \"$TITLE\"" 2>/dev/null || true
}

require_jq() {
  if ! command -v jq &> /dev/null; then
    echo "Error: jq is required. Install with: brew install jq"
    exit 1
  fi
}

require_claude() {
  if ! command -v claude &> /dev/null; then
    echo "Error: claude CLI is required. Install from: https://claude.ai/download"
    exit 1
  fi
}

require_node() {
  if ! command -v node &> /dev/null; then
    echo "Error: node is required. Install from: https://nodejs.org"
    exit 1
  fi
  if ! command -v npm &> /dev/null; then
    echo "Error: npm is required. Install Node.js from: https://nodejs.org"
    exit 1
  fi
}

require_env() {
  if [ ! -f ".env" ]; then
    echo "Warning: .env file not found. Database features will fail without DATABASE_URL."
    echo "Create .env with: DATABASE_URL=postgresql://<user>:<password>@<host>:5432/caveau"
  fi
}

require_env_strict() {
  # Features 02+ need DATABASE_URL. Fail fast instead of discovering mid-build.
  if [ ! -f ".env" ]; then
    echo "Error: .env file required for database features (02+)."
    echo "Create .env with: DATABASE_URL=postgresql://<user>:<password>@<host>:5432/caveau"
    exit 1
  fi
  if ! grep -q "DATABASE_URL" .env 2>/dev/null; then
    echo "Error: DATABASE_URL not found in .env. Required for database features (02+)."
    exit 1
  fi
}

require_clean_worktree() {
  if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    echo "Error: Working tree is dirty. Commit or stash changes before running the pipeline."
    echo ""
    git status --short
    exit 1
  fi
}

check_gh() {
  if ! command -v gh &> /dev/null; then
    echo "Warning: gh CLI not found. GitHub issues will not be auto-closed on feature completion."
    echo "Install with: brew install gh"
  fi
}

require_status_file() {
  if [ ! -f "$STATUS_FILE" ]; then
    echo "Error: $STATUS_FILE not found. Are you in the project root?"
    exit 1
  fi
}

backup_status_file() {
  cp "$STATUS_FILE" "${STATUS_FILE}.bak"
}

LOCK_DIR=".build.lock"

acquire_lock() {
  # Use mkdir for atomic lock acquisition (immune to TOCTOU race conditions)
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    echo $$ > "$LOCK_DIR/pid"
  else
    # Lock exists — check if the holding process is still alive
    if [ -f "$LOCK_DIR/pid" ] && kill -0 "$(cat "$LOCK_DIR/pid")" 2>/dev/null; then
      echo "Error: Build already running (PID $(cat "$LOCK_DIR/pid"))"
      echo "If this is stale, remove $LOCK_DIR/ manually."
      exit 1
    else
      # Stale lock — reclaim it
      rm -rf "$LOCK_DIR"
      if ! mkdir "$LOCK_DIR" 2>/dev/null; then
        echo "Error: Could not reclaim stale lock. Another process may have started."
        exit 1
      fi
      echo $$ > "$LOCK_DIR/pid"
    fi
  fi
  # EXIT trap always cleans up lock
  trap 'rm -rf "$LOCK_DIR" 2>/dev/null || true' EXIT
  # INT/TERM mark active feature as failed, then exit (triggers EXIT trap for lock cleanup)
  trap 'signal_handler INT' INT
  trap 'signal_handler TERM' TERM
}

signal_handler() {
  local SIG="$1"
  echo ""
  echo "Caught SIG${SIG} — cleaning up..."
  if [ -n "${BUILDING_FEATURE:-}" ]; then
    echo "Marking feature $BUILDING_FEATURE as failed (interrupted)..."
    bash "$SCRIPTS/update-status.sh" "$BUILDING_FEATURE" "failed" "Interrupted by SIG${SIG}" 2>/dev/null || true
    BUILDING_FEATURE=""
  fi
  exit 130
}

log_environment() {
  local LOG_FILE="$1"
  {
    echo "=== Environment Snapshot ==="
    echo "Date:      $(date)"
    echo "Node:      $(node -v 2>/dev/null || echo 'not found')"
    echo "npm:       $(npm -v 2>/dev/null || echo 'not found')"
    echo "Prisma:    $(npx prisma -v 2>/dev/null | head -1 || echo 'not found')"
    echo "Git HEAD:  $(git rev-parse HEAD 2>/dev/null || echo 'unknown')"
    echo "Branch:    $(git branch --show-current 2>/dev/null || echo 'unknown')"
    echo "==========================="
    echo ""
  } >> "$LOG_FILE"
}

check_dependencies() {
  local TARGET="$1"
  for key in $(jq -r '.features | keys[]' "$STATUS_FILE" | sort); do
    [ "$key" = "$TARGET" ] && break
    local DEP_STATUS
    DEP_STATUS=$(get_feature_status "$key")
    if [ "$DEP_STATUS" != "completed" ]; then
      echo "Error: Feature $key ($(get_feature_title "$key")) is '$DEP_STATUS' — must be completed before $TARGET"
      exit 1
    fi
  done
}

get_next_feature() {
  jq -r '
    .features | to_entries
    | map(select(.value.status == "pending" or .value.status == "failed" or .value.status == "in-progress"))
    | map(select(.value.stretch != true))
    | sort_by(.key)
    | .[0].key // empty
  ' "$STATUS_FILE"
}

get_feature_title() {
  jq -r ".features[\"$1\"].title" "$STATUS_FILE"
}

get_feature_status() {
  jq -r ".features[\"$1\"].status" "$STATUS_FILE"
}

get_retry_count() {
  jq -r ".features[\"$1\"].retry_count // 0" "$STATUS_FILE"
}

update_docs_and_push() {
  # Regenerate PROGRESS.md
  bash "$SCRIPTS/update-progress.sh"

  # Commit tracking files (only if there are changes to commit)
  git add BUILD_STATUS.json PROGRESS.md BUILD_LOG.md 2>/dev/null || true
  if ! git diff --cached --quiet 2>/dev/null; then
    git commit -m "docs: update build progress" || echo "Warning: Could not commit tracking files"
  fi

  # Push to GitHub (controlled by CAVEAU_AUTO_PUSH)
  if [ "$AUTO_PUSH" = "true" ]; then
    git push origin main || echo "Warning: Could not push to GitHub. You may need to push manually."
  else
    echo "Auto-push disabled (CAVEAU_AUTO_PUSH=false). Push manually when ready."
  fi
}

verify_build() {
  # Independent build verification — don't trust Claude's self-reported exit code
  echo "Running independent build verification (npm run build)..."
  if npm run build > /dev/null 2>&1; then
    echo "Build verification PASSED"
    return 0
  else
    echo "Build verification FAILED — npm run build exited non-zero"
    return 1
  fi
}

# ── Commands ────────────────────────────────────────────────────

cmd_status() {
  require_jq
  require_status_file

  CORE_TOTAL=$(jq '[.features[] | select(.stretch != true)] | length' "$STATUS_FILE")
  CORE_COMPLETED=$(jq '[.features[] | select(.status == "completed" and .stretch != true)] | length' "$STATUS_FILE")
  IN_PROG=$(jq '[.features[] | select(.status == "in-progress")] | length' "$STATUS_FILE")
  FAILED=$(jq '[.features[] | select(.status == "failed")] | length' "$STATUS_FILE")
  PENDING=$(jq '[.features[] | select(.status == "pending")] | length' "$STATUS_FILE")
  if [ "$CORE_TOTAL" -gt 0 ]; then
    PCT=$(( CORE_COMPLETED * 100 / CORE_TOTAL ))
  else
    PCT=0
  fi

  print_header "Caveau Build Status — ${PCT}% complete (${CORE_COMPLETED}/${CORE_TOTAL} core)"

  # Print each feature with duration and retry info
  for key in $(jq -r '.features | keys[]' "$STATUS_FILE" | sort); do
    TITLE=$(jq -r ".features[\"$key\"].title" "$STATUS_FILE")
    STATUS=$(jq -r ".features[\"$key\"].status" "$STATUS_FILE")
    DURATION=$(jq -r ".features[\"$key\"].duration_seconds // empty" "$STATUS_FILE")
    RETRIES=$(jq -r ".features[\"$key\"].retry_count // 0" "$STATUS_FILE")

    case "$STATUS" in
      completed)   MARK="[x]" ;;
      in-progress) MARK="[>]" ;;
      failed)      MARK="[!]" ;;
      pending)     MARK="[ ]" ;;
      *)           MARK="[?]" ;;
    esac

    EXTRA=""
    if [ -n "${DURATION:-}" ]; then
      MINS=$(( DURATION / 60 ))
      SECS=$(( DURATION % 60 ))
      EXTRA=" (${MINS}m${SECS}s)"
    fi
    if [ "$RETRIES" -gt 0 ]; then
      EXTRA="${EXTRA} [retries: ${RETRIES}]"
    fi

    printf "  %s %s  %s%s\n" "$MARK" "$key" "$TITLE" "$EXTRA"
  done

  echo ""
  echo "  Core: $CORE_COMPLETED/$CORE_TOTAL completed | In Progress: $IN_PROG | Failed: $FAILED | Pending: $PENDING"

  NEXT=$(get_next_feature)
  if [ -n "$NEXT" ]; then
    echo "  Next up: $NEXT — $(get_feature_title "$NEXT")"
  else
    STRETCH_REMAINING=$(jq '[.features[] | select(.stretch == true and .status != "completed")] | length' "$STATUS_FILE")
    if [ "$STRETCH_REMAINING" -gt 0 ]; then
      echo "  All core features complete! $STRETCH_REMAINING stretch goal(s) remaining."
    else
      echo "  All features complete!"
    fi
  fi
  echo ""
}

cmd_stop() {
  touch "$STOP_FILE"
  echo "Stop signal set. Pipeline will stop after the current feature finishes."
  echo "Run './build.sh start' to resume."
}

cmd_reset() {
  local FEATURE="${1:-}"
  if [ -z "$FEATURE" ]; then
    echo "Usage: ./build.sh reset <feature_number>"
    exit 1
  fi

  EXISTS=$(jq -r ".features[\"$FEATURE\"] // empty" "$STATUS_FILE")
  if [ -z "$EXISTS" ]; then
    echo "Error: Feature $FEATURE not found"
    exit 1
  fi

  backup_status_file
  jq --arg f "$FEATURE" '
    .features[$f].status = "pending" |
    .features[$f].started_at = null |
    .features[$f].completed_at = null |
    .features[$f].failed_at = null |
    .features[$f].files = [] |
    .features[$f].notes = "" |
    .features[$f].retry_count = 0 |
    .features[$f].duration_seconds = null
  ' "$STATUS_FILE" > "${STATUS_FILE}.tmp" && mv "${STATUS_FILE}.tmp" "$STATUS_FILE"

  echo "Feature $FEATURE reset to pending."
}

cmd_reset_all() {
  backup_status_file
  for key in $(jq -r '.features | keys[]' "$STATUS_FILE" | sort); do
    cmd_reset "$key"
  done
  jq '.last_updated = null | .last_completed_feature = null' "$STATUS_FILE" > "${STATUS_FILE}.tmp" && mv "${STATUS_FILE}.tmp" "$STATUS_FILE"
  echo ""
  echo "All features reset to pending."
}

cmd_docs() {
  bash "$SCRIPTS/update-progress.sh"
}

cmd_rollback() {
  local FEATURE="${1:-}"
  if [ -z "$FEATURE" ]; then
    echo "Usage: ./build.sh rollback <feature_number>"
    exit 1
  fi

  require_jq
  require_status_file

  EXISTS=$(jq -r ".features[\"$FEATURE\"] // empty" "$STATUS_FILE")
  if [ -z "$EXISTS" ]; then
    echo "Error: Feature $FEATURE not found"
    exit 1
  fi

  local PRE_SHA
  PRE_SHA=$(jq -r ".features[\"$FEATURE\"].pre_build_sha // empty" "$STATUS_FILE")
  if [ -z "$PRE_SHA" ] || ! git cat-file -t "$PRE_SHA" &>/dev/null; then
    echo "Error: No valid pre-build SHA found for feature $FEATURE."
    echo "Cannot rollback — pre_build_sha is missing or unreachable."
    exit 1
  fi

  local CURRENT_STATUS
  CURRENT_STATUS=$(get_feature_status "$FEATURE")
  if [ "$CURRENT_STATUS" = "completed" ]; then
    echo "Warning: Feature $FEATURE is marked as completed."
    echo "Rolling back will discard its changes."
    echo ""
  fi

  echo "Rolling back to pre-build state: $PRE_SHA"
  echo "Current HEAD: $(git rev-parse HEAD)"
  echo ""
  echo "This will run: git reset --hard $PRE_SHA"
  echo "Press Ctrl+C to cancel, or Enter to proceed..."
  read -r

  git reset --hard "$PRE_SHA"
  cmd_reset "$FEATURE"
  echo ""
  echo "Rollback complete. Feature $FEATURE reset to pending."
}

cmd_dry_run() {
  require_jq
  require_status_file

  print_header "Caveau Build Pipeline — Dry Run"

  # Environment checks
  echo "Environment checks:"
  local ALL_OK=true

  if command -v node &> /dev/null; then
    echo "  [ok] node $(node -v)"
  else
    echo "  [!!] node not found"
    ALL_OK=false
  fi

  if command -v npm &> /dev/null; then
    echo "  [ok] npm $(npm -v)"
  else
    echo "  [!!] npm not found"
    ALL_OK=false
  fi

  if command -v jq &> /dev/null; then
    echo "  [ok] jq $(jq --version)"
  else
    echo "  [!!] jq not found"
    ALL_OK=false
  fi

  if command -v claude &> /dev/null; then
    echo "  [ok] claude CLI found"
  else
    echo "  [!!] claude CLI not found"
    ALL_OK=false
  fi

  if command -v gh &> /dev/null; then
    echo "  [ok] gh CLI found"
  else
    echo "  [--] gh CLI not found (optional)"
  fi

  if command -v timeout &> /dev/null || command -v gtimeout &> /dev/null; then
    echo "  [ok] timeout/gtimeout found"
  else
    echo "  [--] timeout not found (optional safety net)"
  fi

  if [ -f ".env" ] && grep -q "DATABASE_URL" .env 2>/dev/null; then
    echo "  [ok] .env with DATABASE_URL"
  else
    echo "  [!!] .env missing or no DATABASE_URL"
    ALL_OK=false
  fi

  if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    echo "  [!!] Working tree is dirty"
    ALL_OK=false
  else
    echo "  [ok] Working tree clean"
  fi

  echo ""

  # Pipeline configuration
  echo "Pipeline configuration:"
  echo "  Auto-push:    $AUTO_PUSH"
  echo "  Max retries:  $MAX_RETRIES"
  echo ""

  # What would be built
  local NEXT
  NEXT=$(get_next_feature)
  if [ -z "$NEXT" ]; then
    echo "Nothing to build — all core features complete."
  else
    echo "Features that would be built (in order):"
    for key in $(jq -r '.features | keys[]' "$STATUS_FILE" | sort); do
      local F_STATUS
      F_STATUS=$(get_feature_status "$key")
      local IS_STRETCH
      IS_STRETCH=$(jq -r ".features[\"$key\"].stretch // false" "$STATUS_FILE")
      if [ "$IS_STRETCH" = "true" ]; then
        continue
      fi
      if [ "$F_STATUS" = "pending" ] || [ "$F_STATUS" = "failed" ] || [ "$F_STATUS" = "in-progress" ]; then
        local F_TITLE
        F_TITLE=$(get_feature_title "$key")
        local RETRIES
        RETRIES=$(get_retry_count "$key")
        local RETRY_NOTE=""
        if [ "$RETRIES" -gt 0 ]; then
          RETRY_NOTE=" (retry $((RETRIES + 1))/${MAX_RETRIES})"
        fi
        echo "  -> $key — $F_TITLE [$F_STATUS]${RETRY_NOTE}"
      fi
    done
  fi

  echo ""
  if [ "$ALL_OK" = "true" ]; then
    echo "All checks passed. Ready to run: ./build.sh start"
  else
    echo "Some checks failed. Fix issues above before running."
  fi
}

cmd_retry() {
  require_jq
  require_status_file

  # Find the last failed feature
  local FAILED_FEATURE
  FAILED_FEATURE=$(jq -r '
    .features | to_entries
    | map(select(.value.status == "failed"))
    | sort_by(.key)
    | .[0].key // empty
  ' "$STATUS_FILE")

  if [ -z "$FAILED_FEATURE" ]; then
    echo "No failed features to retry."
    exit 0
  fi

  # Check retry count
  local RETRIES
  RETRIES=$(get_retry_count "$FAILED_FEATURE")
  if [ "$RETRIES" -ge "$MAX_RETRIES" ]; then
    echo "Feature $FAILED_FEATURE has failed $RETRIES time(s) — max retries ($MAX_RETRIES) reached."
    echo "To force a retry: ./build.sh reset $FAILED_FEATURE && ./build.sh start $FAILED_FEATURE"
    exit 1
  fi

  echo "Retrying feature $FAILED_FEATURE — $(get_feature_title "$FAILED_FEATURE") (attempt $((RETRIES + 1))/$MAX_RETRIES)..."

  # Increment retry count without full reset (preserve history)
  backup_status_file
  jq --arg f "$FAILED_FEATURE" --argjson retries "$((RETRIES + 1))" '
    .features[$f].status = "pending" |
    .features[$f].failed_at = null |
    .features[$f].retry_count = $retries
  ' "$STATUS_FILE" > "${STATUS_FILE}.tmp" && mv "${STATUS_FILE}.tmp" "$STATUS_FILE"

  cmd_start "$FAILED_FEATURE"
}

cmd_start() {
  require_jq
  require_claude
  require_node
  require_status_file
  require_env
  require_clean_worktree
  check_gh
  acquire_lock
  mkdir -p logs

  # Remove any previous stop signal
  rm -f "$STOP_FILE"

  # Determine starting feature
  local START_FROM="${1:-}"
  local CURRENT=""
  if [ -n "$START_FROM" ]; then
    EXISTS=$(jq -r ".features[\"$START_FROM\"] // empty" "$STATUS_FILE")
    if [ -z "$EXISTS" ]; then
      echo "Error: Feature $START_FROM not found"
      exit 1
    fi
    check_dependencies "$START_FROM"
    CURRENT="$START_FROM"
  else
    CURRENT=$(get_next_feature)
  fi

  if [ -z "$CURRENT" ]; then
    print_header "All core features are complete!"
    # Check if stretch goals remain
    STRETCH_REMAINING=$(jq '[.features[] | select(.stretch == true and .status != "completed")] | length' "$STATUS_FILE")
    if [ "$STRETCH_REMAINING" -gt 0 ]; then
      echo "  $STRETCH_REMAINING stretch goal(s) remaining. Run './build.sh start <num>' to build them individually."
    fi
    cmd_status
    exit 0
  fi

  print_header "Caveau Build Pipeline — Starting"
  cmd_status

  # Initialize BUILD_LOG.md if it doesn't exist
  if [ ! -f "BUILD_LOG.md" ]; then
    echo "# Caveau MVP — Build Log" > BUILD_LOG.md
    echo "" >> BUILD_LOG.md
    echo "> Auto-updated by the build pipeline." >> BUILD_LOG.md
    echo "" >> BUILD_LOG.md
  fi

  local FEATURES_BUILT=0

  while [ -n "$CURRENT" ]; do
    # Check for stop signal
    if [ -f "$STOP_FILE" ]; then
      rm -f "$STOP_FILE"
      print_header "Build stopped (after completing previous feature)"
      echo "Stopped before feature $CURRENT — $(get_feature_title "$CURRENT")"
      echo "Run './build.sh start' to resume."
      update_docs_and_push
      exit 0
    fi

    TITLE=$(get_feature_title "$CURRENT")

    # Features 02+ need a real DATABASE_URL — fail fast
    if [ "$CURRENT" != "01" ]; then
      require_env_strict
    fi

    print_header "Feature $CURRENT: $TITLE"
    echo "Started: $(date)"

    # Set for signal handler
    BUILDING_FEATURE="$CURRENT"

    # Backup + mark as in-progress
    backup_status_file
    bash "$SCRIPTS/update-status.sh" "$CURRENT" "in-progress"

    # Save pre-build HEAD for file tracking and rollback
    PRE_BUILD_SHA=$(git rev-parse HEAD 2>/dev/null || echo "")
    export CAVEAU_PRE_BUILD_SHA="$PRE_BUILD_SHA"

    # Log environment snapshot
    local LOG_FILE="logs/feature-${CURRENT}.log"
    : > "$LOG_FILE"
    log_environment "$LOG_FILE"

    # Run Claude Code for this feature
    # NOTE: Claude is told to only BUILD, VERIFY, and COMMIT. The pipeline handles
    # status tracking, progress docs, and pushing — see update_docs_and_push().
    # Determine timeout command (macOS doesn't ship GNU timeout)
    local TIMEOUT_CMD=""
    if command -v timeout &> /dev/null; then
      TIMEOUT_CMD="timeout"
    elif command -v gtimeout &> /dev/null; then
      TIMEOUT_CMD="gtimeout"
    else
      echo "Warning: timeout/gtimeout not found. Running without timeout guard."
      echo "Install with: brew install coreutils"
    fi

    # Track duration
    local FEATURE_START=$SECONDS

    set +e
    if [ -n "$TIMEOUT_CMD" ]; then
      $TIMEOUT_CMD 1800 claude --print --dangerously-skip-permissions --max-turns 50 \
        "Read CLAUDE.md and SPEC.md for full project context. Then read BUILD.md and build feature $CURRENT exactly as specified. IMPORTANT: You are running inside the build pipeline. Only do steps 1-4 of the Development Workflow in CLAUDE.md (read context, build, verify, commit). Do NOT run update-status.sh, update-progress.sh, or git push — the pipeline handles those. Do not build anything beyond what feature $CURRENT specifies." \
        2>&1 | tee -a "$LOG_FILE"
    else
      claude --print --dangerously-skip-permissions --max-turns 50 \
        "Read CLAUDE.md and SPEC.md for full project context. Then read BUILD.md and build feature $CURRENT exactly as specified. IMPORTANT: You are running inside the build pipeline. Only do steps 1-4 of the Development Workflow in CLAUDE.md (read context, build, verify, commit). Do NOT run update-status.sh, update-progress.sh, or git push — the pipeline handles those. Do not build anything beyond what feature $CURRENT specifies." \
        2>&1 | tee -a "$LOG_FILE"
    fi
    EXIT_CODE=${PIPESTATUS[0]}
    set -e

    local FEATURE_DURATION=$(( SECONDS - FEATURE_START ))
    local DURATION_MIN=$(( FEATURE_DURATION / 60 ))
    local DURATION_SEC=$(( FEATURE_DURATION % 60 ))

    # Clear signal handler target
    BUILDING_FEATURE=""

    # Distinguish timeout from other failures
    if [ $EXIT_CODE -eq 124 ]; then
      echo ""
      echo "TIMEOUT: Feature $CURRENT exceeded 30-minute time limit."
    fi

    # Independent build verification — don't trust Claude's self-reported exit code
    if [ $EXIT_CODE -eq 0 ]; then
      if ! verify_build; then
        EXIT_CODE=1
        echo "Claude exited 0 but npm run build failed. Marking as failed."
      fi
    fi

    if [ $EXIT_CODE -eq 0 ]; then
      # Mark completed
      bash "$SCRIPTS/update-status.sh" "$CURRENT" "completed"

      # Record duration
      jq --arg f "$CURRENT" --argjson dur "$FEATURE_DURATION" \
        '.features[$f].duration_seconds = $dur' "$STATUS_FILE" > "${STATUS_FILE}.tmp" && mv "${STATUS_FILE}.tmp" "$STATUS_FILE"

      # Log it
      {
        echo "### Feature $CURRENT — $TITLE"
        echo "- **Status:** PASS"
        echo "- **Completed:** $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
        echo "- **Duration:** ${DURATION_MIN}m${DURATION_SEC}s"
        echo "- **Log:** logs/feature-${CURRENT}.log"
        echo ""
      } >> BUILD_LOG.md

      echo ""
      echo "Feature $CURRENT PASSED (${DURATION_MIN}m${DURATION_SEC}s)"
      FEATURES_BUILT=$((FEATURES_BUILT + 1))

      # Auto-update docs and push
      update_docs_and_push

    else
      # Determine failure reason
      local FAIL_REASON="Exit code $EXIT_CODE"
      if [ $EXIT_CODE -eq 124 ]; then
        FAIL_REASON="Timed out after 30 minutes"
      fi

      # Mark failed
      bash "$SCRIPTS/update-status.sh" "$CURRENT" "failed" "$FAIL_REASON"

      # Record duration even on failure
      jq --arg f "$CURRENT" --argjson dur "$FEATURE_DURATION" \
        '.features[$f].duration_seconds = $dur' "$STATUS_FILE" > "${STATUS_FILE}.tmp" && mv "${STATUS_FILE}.tmp" "$STATUS_FILE"

      # Log it
      {
        echo "### Feature $CURRENT — $TITLE"
        echo "- **Status:** FAIL ($FAIL_REASON)"
        echo "- **Failed:** $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
        echo "- **Duration:** ${DURATION_MIN}m${DURATION_SEC}s"
        echo "- **Log:** logs/feature-${CURRENT}.log"
        echo ""
      } >> BUILD_LOG.md

      echo ""
      echo "Feature $CURRENT FAILED ($FAIL_REASON) after ${DURATION_MIN}m${DURATION_SEC}s"
      echo "Check logs/feature-${CURRENT}.log for details"
      echo ""
      echo "Recovery options:"
      local CURRENT_RETRIES
      CURRENT_RETRIES=$(get_retry_count "$CURRENT")
      echo "  ./build.sh retry                         Retry this feature (${CURRENT_RETRIES}/${MAX_RETRIES} attempts used)"
      echo "  ./build.sh rollback $CURRENT               Revert to pre-build state (${PRE_BUILD_SHA:0:8})"
      echo "  ./build.sh reset $CURRENT && ./build.sh start   Full reset and rebuild"

      notify "Caveau Build Failed" "Feature $CURRENT — $TITLE failed: $FAIL_REASON"

      update_docs_and_push
      exit 1
    fi

    # Get next feature
    CURRENT=$(get_next_feature)
  done

  print_header "All features complete!"
  notify "Caveau Build Complete" "$FEATURES_BUILT feature(s) built successfully"
  cmd_status
}

# ── Main ────────────────────────────────────────────────────────

COMMAND="${1:-status}"
ARG="${2:-}"

case "$COMMAND" in
  start)     cmd_start "$ARG" ;;
  stop)      cmd_stop ;;
  status)    cmd_status ;;
  retry)     cmd_retry ;;
  docs)      cmd_docs ;;
  reset)     cmd_reset "$ARG" ;;
  reset-all) cmd_reset_all ;;
  rollback)  cmd_rollback "$ARG" ;;
  dry-run)   cmd_dry_run ;;
  help|--help|-h)
    echo "Caveau Build Pipeline"
    echo ""
    echo "Usage: ./build.sh <command> [args]"
    echo ""
    echo "Commands:"
    echo "  start [num]    Start or resume from next pending core feature (or specific feature)"
    echo "                 Stretch goals (15-17) must be started explicitly by number"
    echo "  stop           Stop after current feature finishes"
    echo "  status         Show build progress (with duration and retry info)"
    echo "  retry          Retry the last failed feature (max $MAX_RETRIES attempts)"
    echo "  docs           Regenerate PROGRESS.md"
    echo "  reset <num>    Reset a feature to pending"
    echo "  reset-all      Reset all features to pending"
    echo "  rollback <num> Revert a failed feature to its pre-build git state"
    echo "  dry-run        Preview what would be built + environment checks"
    echo "  help           Show this help"
    echo ""
    echo "Environment variables:"
    echo "  CAVEAU_AUTO_PUSH=false     Disable auto-push (default: true)"
    echo "  CAVEAU_MAX_RETRIES=N       Max retries per feature (default: 3)"
    ;;
  *)
    echo "Unknown command: $COMMAND"
    echo "Run './build.sh help' for usage."
    exit 1
    ;;
esac
