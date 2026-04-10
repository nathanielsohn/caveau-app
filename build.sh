#!/bin/bash
# Caveau MVP — Resumable Build Pipeline
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

set -e
cd "$(dirname "$0")"

STATUS_FILE="BUILD_STATUS.json"
STOP_FILE=".build-stop"
SCRIPTS="scripts"

# ── Helpers ─────────────────────────────────────────────────────

print_header() {
  echo ""
  echo "=========================================="
  echo "  $1"
  echo "=========================================="
  echo ""
}

require_jq() {
  if ! command -v jq &> /dev/null; then
    echo "Error: jq is required. Install with: brew install jq"
    exit 1
  fi
}

require_status_file() {
  if [ ! -f "$STATUS_FILE" ]; then
    echo "Error: $STATUS_FILE not found. Are you in the project root?"
    exit 1
  fi
}

get_next_feature() {
  jq -r '
    .features | to_entries
    | map(select(.value.status == "pending" or .value.status == "failed"))
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

update_docs_and_push() {
  # Regenerate PROGRESS.md
  bash "$SCRIPTS/update-progress.sh"

  # Commit tracking files
  git add BUILD_STATUS.json PROGRESS.md BUILD_LOG.md 2>/dev/null || true
  git commit -m "docs: update build progress" --allow-empty 2>/dev/null || true

  # Push to GitHub
  git push origin main 2>/dev/null || echo "Warning: Could not push to GitHub"
}

# ── Commands ────────────────────────────────────────────────────

cmd_status() {
  require_jq
  require_status_file

  TOTAL=$(jq '.total_features' "$STATUS_FILE")
  COMPLETED=$(jq '[.features[] | select(.status == "completed")] | length' "$STATUS_FILE")
  IN_PROG=$(jq '[.features[] | select(.status == "in-progress")] | length' "$STATUS_FILE")
  FAILED=$(jq '[.features[] | select(.status == "failed")] | length' "$STATUS_FILE")
  PENDING=$(jq '[.features[] | select(.status == "pending")] | length' "$STATUS_FILE")
  PCT=$(( COMPLETED * 100 / TOTAL ))

  print_header "Caveau Build Status — ${PCT}% complete"

  # Print each feature
  for key in $(jq -r '.features | keys[]' "$STATUS_FILE" | sort); do
    TITLE=$(jq -r ".features[\"$key\"].title" "$STATUS_FILE")
    STATUS=$(jq -r ".features[\"$key\"].status" "$STATUS_FILE")

    case "$STATUS" in
      completed)   MARK="[x]" ;;
      in-progress) MARK="[>]" ;;
      failed)      MARK="[!]" ;;
      pending)     MARK="[ ]" ;;
      *)           MARK="[?]" ;;
    esac

    printf "  %s %s  %s\n" "$MARK" "$key" "$TITLE"
  done

  echo ""
  echo "  Completed: $COMPLETED | In Progress: $IN_PROG | Failed: $FAILED | Pending: $PENDING"

  NEXT=$(get_next_feature)
  if [ -n "$NEXT" ]; then
    echo "  Next up: $NEXT — $(get_feature_title "$NEXT")"
  else
    echo "  All features complete!"
  fi
  echo ""
}

cmd_stop() {
  touch "$STOP_FILE"
  echo "Stop signal set. Pipeline will stop after the current feature finishes."
  echo "Run './build.sh start' to resume."
}

cmd_reset() {
  local FEATURE="$1"
  if [ -z "$FEATURE" ]; then
    echo "Usage: ./build.sh reset <feature_number>"
    exit 1
  fi

  EXISTS=$(jq -r ".features[\"$FEATURE\"] // empty" "$STATUS_FILE")
  if [ -z "$EXISTS" ]; then
    echo "Error: Feature $FEATURE not found"
    exit 1
  fi

  jq --arg f "$FEATURE" '
    .features[$f].status = "pending" |
    .features[$f].started_at = null |
    .features[$f].completed_at = null |
    .features[$f].failed_at = null |
    .features[$f].files = [] |
    .features[$f].notes = ""
  ' "$STATUS_FILE" > "${STATUS_FILE}.tmp" && mv "${STATUS_FILE}.tmp" "$STATUS_FILE"

  echo "Feature $FEATURE reset to pending."
}

cmd_reset_all() {
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

cmd_retry() {
  # Find the last failed feature
  FAILED=$(jq -r '
    .features | to_entries
    | map(select(.value.status == "failed"))
    | sort_by(.key)
    | .[0].key // empty
  ' "$STATUS_FILE")

  if [ -z "$FAILED" ]; then
    echo "No failed features to retry."
    exit 0
  fi

  echo "Retrying feature $FAILED — $(get_feature_title "$FAILED")..."
  cmd_reset "$FAILED"
  cmd_start "$FAILED"
}

cmd_start() {
  require_jq
  require_status_file
  mkdir -p logs

  # Remove any previous stop signal
  rm -f "$STOP_FILE"

  # Determine starting feature
  local START_FROM="$1"
  if [ -n "$START_FROM" ]; then
    EXISTS=$(jq -r ".features[\"$START_FROM\"] // empty" "$STATUS_FILE")
    if [ -z "$EXISTS" ]; then
      echo "Error: Feature $START_FROM not found"
      exit 1
    fi
    CURRENT="$START_FROM"
  else
    CURRENT=$(get_next_feature)
  fi

  if [ -z "$CURRENT" ]; then
    print_header "All features are complete!"
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
    print_header "Feature $CURRENT: $TITLE"
    echo "Started: $(date)"

    # Mark as in-progress
    bash "$SCRIPTS/update-status.sh" "$CURRENT" "in-progress"

    # Run Claude Code for this feature
    set +e
    claude --print --dangerously-skip-permissions \
      "Read CLAUDE.md and SPEC.md for full project context. Then read BUILD.md and execute feature $CURRENT exactly as specified. Follow the 5-step process (BUILD, VERIFY, COMMIT, LOG, NEXT). Do not skip any step. Do not build anything beyond what feature $CURRENT specifies." \
      2>&1 | tee "logs/feature-${CURRENT}.log"
    EXIT_CODE=${PIPESTATUS[0]}
    set -e

    if [ $EXIT_CODE -eq 0 ]; then
      # Mark completed
      bash "$SCRIPTS/update-status.sh" "$CURRENT" "completed"

      # Log it
      echo "### Feature $CURRENT — $TITLE" >> BUILD_LOG.md
      echo "- **Status:** PASS" >> BUILD_LOG.md
      echo "- **Completed:** $(date -u +"%Y-%m-%dT%H:%M:%SZ")" >> BUILD_LOG.md
      echo "- **Log:** logs/feature-${CURRENT}.log" >> BUILD_LOG.md
      echo "" >> BUILD_LOG.md

      echo ""
      echo "Feature $CURRENT PASSED"

      # Auto-update docs and push
      update_docs_and_push

    else
      # Mark failed
      bash "$SCRIPTS/update-status.sh" "$CURRENT" "failed" "Exit code $EXIT_CODE"

      # Log it
      echo "### Feature $CURRENT — $TITLE" >> BUILD_LOG.md
      echo "- **Status:** FAIL (exit code $EXIT_CODE)" >> BUILD_LOG.md
      echo "- **Failed:** $(date -u +"%Y-%m-%dT%H:%M:%SZ")" >> BUILD_LOG.md
      echo "- **Log:** logs/feature-${CURRENT}.log" >> BUILD_LOG.md
      echo "" >> BUILD_LOG.md

      echo ""
      echo "Feature $CURRENT FAILED (exit code $EXIT_CODE)"
      echo "Check logs/feature-${CURRENT}.log for details"
      echo "Run './build.sh retry' to retry, or './build.sh start' to skip to next."

      update_docs_and_push
      exit 1
    fi

    # Get next feature
    CURRENT=$(get_next_feature)
  done

  print_header "All features complete!"
  cmd_status
}

# ── Main ────────────────────────────────────────────────────────

COMMAND="${1:-status}"
ARG="$2"

case "$COMMAND" in
  start)     cmd_start "$ARG" ;;
  stop)      cmd_stop ;;
  status)    cmd_status ;;
  retry)     cmd_retry ;;
  docs)      cmd_docs ;;
  reset)     cmd_reset "$ARG" ;;
  reset-all) cmd_reset_all ;;
  help|--help|-h)
    echo "Caveau Build Pipeline"
    echo ""
    echo "Usage: ./build.sh <command> [args]"
    echo ""
    echo "Commands:"
    echo "  start [num]    Start or resume from next pending feature (or specific feature)"
    echo "  stop           Stop after current feature finishes"
    echo "  status         Show build progress"
    echo "  retry          Retry the last failed feature"
    echo "  docs           Regenerate PROGRESS.md"
    echo "  reset <num>    Reset a feature to pending"
    echo "  reset-all      Reset all features to pending"
    echo "  help           Show this help"
    ;;
  *)
    echo "Unknown command: $COMMAND"
    echo "Run './build.sh help' for usage."
    exit 1
    ;;
esac
