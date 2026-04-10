#!/bin/bash
# Updates BUILD_STATUS.json for a given feature
# Usage: ./scripts/update-status.sh <feature_number> <status> [notes]
# Status: in-progress | completed | failed
# Also closes the GitHub issue on completion

set -e
cd "$(dirname "$0")/.."

FEATURE="$1"
STATUS="$2"
NOTES="${3:-}"
STATUS_FILE="BUILD_STATUS.json"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
CURRENT_SHA=$(git rev-parse HEAD 2>/dev/null || echo "")

if [ -z "$FEATURE" ] || [ -z "$STATUS" ]; then
  echo "Usage: $0 <feature_number> <status> [notes]"
  exit 1
fi

# Backup before mutation
cp "$STATUS_FILE" "${STATUS_FILE}.bak"

# Validate status value
case "$STATUS" in
  in-progress|completed|failed) ;;
  *)
    echo "Error: Invalid status '$STATUS'. Must be: in-progress, completed, or failed"
    exit 1
    ;;
esac

# Validate feature exists
EXISTS=$(jq -r ".features[\"$FEATURE\"] // empty" "$STATUS_FILE")
if [ -z "$EXISTS" ]; then
  echo "Error: Feature $FEATURE not found in $STATUS_FILE"
  exit 1
fi

# Update status
jq --arg f "$FEATURE" --arg s "$STATUS" --arg now "$NOW" --arg notes "$NOTES" --arg sha "$CURRENT_SHA" '
  .last_updated = $now |
  .features[$f].status = $s |
  if $s == "in-progress" then .features[$f].started_at = $now | .features[$f].pre_build_sha = $sha
  elif $s == "completed" then .features[$f].completed_at = $now | .last_completed_feature = $f
  elif $s == "failed" then .features[$f].failed_at = $now
  else . end |
  if $notes != "" then .features[$f].notes = $notes else . end
' "$STATUS_FILE" > "${STATUS_FILE}.tmp" && mv "${STATUS_FILE}.tmp" "$STATUS_FILE"

echo "Feature $FEATURE -> $STATUS"

# If completed, close the GitHub issue
if [ "$STATUS" = "completed" ]; then
  ISSUE_NUM=$(jq -r ".features[\"$FEATURE\"].github_issue // empty" "$STATUS_FILE")
  if [ -n "$ISSUE_NUM" ] && [ "$ISSUE_NUM" != "null" ]; then
    echo "Closing GitHub issue #${ISSUE_NUM}..."
    gh issue close "$ISSUE_NUM" --comment "Feature $FEATURE completed automatically by build pipeline." 2>/dev/null || echo "Warning: Could not close issue #${ISSUE_NUM}"
  fi
fi

# Capture files modified in this feature's commits
if [ "$STATUS" = "completed" ]; then
  # Use the pre-build SHA: pipeline env var first, then saved SHA from in-progress marking
  BASE_SHA="${CAVEAU_PRE_BUILD_SHA:-}"
  if [ -z "$BASE_SHA" ] || ! git cat-file -t "$BASE_SHA" &>/dev/null; then
    BASE_SHA=$(jq -r ".features[\"$FEATURE\"].pre_build_sha // empty" "$STATUS_FILE")
  fi
  if [ -n "$BASE_SHA" ] && git cat-file -t "$BASE_SHA" &>/dev/null; then
    FILES=$(git diff --name-only "$BASE_SHA" HEAD 2>/dev/null | jq -R -s 'split("\n") | map(select(length > 0))' 2>/dev/null || echo '[]')
  else
    # Last resort: compare against previous commit
    if git rev-parse HEAD~1 &>/dev/null; then
      FILES=$(git diff --name-only HEAD~1 HEAD 2>/dev/null | jq -R -s 'split("\n") | map(select(length > 0))' 2>/dev/null || echo '[]')
    else
      FILES='[]'
    fi
  fi
  # Guard against empty/null FILES from failed git or jq operations
  [ -z "$FILES" ] && FILES='[]'
  jq --arg f "$FEATURE" --argjson files "$FILES" '.features[$f].files = $files' "$STATUS_FILE" > "${STATUS_FILE}.tmp" && mv "${STATUS_FILE}.tmp" "$STATUS_FILE"
fi
