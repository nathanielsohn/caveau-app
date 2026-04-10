#!/bin/bash
# Generates PROGRESS.md from BUILD_STATUS.json
# Called automatically after each feature build, or manually via: ./build.sh docs

set -euo pipefail
cd "$(dirname "$0")/.."

STATUS_FILE="BUILD_STATUS.json"
OUTPUT_FILE="PROGRESS.md"

if [ ! -f "$STATUS_FILE" ]; then
  echo "Error: $STATUS_FILE not found"
  exit 1
fi

# Single-pass stats computation — one disk read, guaranteed consistent snapshot
STATS=$(jq '{
  core_total: [.features[] | select(.stretch != true)] | length,
  completed: [.features[] | select(.status == "completed")] | length,
  core_completed: [.features[] | select(.status == "completed" and .stretch != true)] | length,
  in_progress: [.features[] | select(.status == "in-progress")] | length,
  failed: [.features[] | select(.status == "failed")] | length,
  pending: [.features[] | select(.status == "pending")] | length,
  stretch_total: [.features[] | select(.stretch == true)] | length,
  stretch_completed: [.features[] | select(.stretch == true and .status == "completed")] | length,
  core_in_progress: [.features[] | select(.status == "in-progress" and .stretch != true)] | length,
  core_failed: [.features[] | select(.status == "failed" and .stretch != true)] | length,
  last_updated: (.last_updated // "Never"),
  last_feature: (.last_completed_feature // "None")
}' "$STATUS_FILE")

CORE_TOTAL=$(echo "$STATS" | jq -r '.core_total')
COMPLETED=$(echo "$STATS" | jq -r '.completed')
CORE_COMPLETED=$(echo "$STATS" | jq -r '.core_completed')
IN_PROGRESS=$(echo "$STATS" | jq -r '.in_progress')
FAILED=$(echo "$STATS" | jq -r '.failed')
PENDING=$(echo "$STATS" | jq -r '.pending')
STRETCH_TOTAL=$(echo "$STATS" | jq -r '.stretch_total')
STRETCH_COMPLETED=$(echo "$STATS" | jq -r '.stretch_completed')
CORE_IN_PROGRESS=$(echo "$STATS" | jq -r '.core_in_progress')
CORE_FAILED=$(echo "$STATS" | jq -r '.core_failed')
LAST_UPDATED=$(echo "$STATS" | jq -r '.last_updated')

if [ "$CORE_TOTAL" -gt 0 ]; then
  PCT=$(( CORE_COMPLETED * 100 / CORE_TOTAL ))
else
  PCT=0
fi

# Build progress bar (core features only, with in-progress/failed states)
BAR_FILLED=$(( CORE_COMPLETED * 2 ))
BAR_IN_PROGRESS=$(( CORE_IN_PROGRESS * 2 ))
BAR_FAILED=$(( CORE_FAILED * 2 ))
BAR_EMPTY=$(( (CORE_TOTAL - CORE_COMPLETED - CORE_IN_PROGRESS - CORE_FAILED) * 2 ))
PROGRESS_BAR=""
if [ "$BAR_FILLED" -gt 0 ]; then
  PROGRESS_BAR=$(printf '█%.0s' $(seq 1 $BAR_FILLED))
fi
if [ "$BAR_IN_PROGRESS" -gt 0 ]; then
  PROGRESS_BAR="${PROGRESS_BAR}$(printf '▓%.0s' $(seq 1 $BAR_IN_PROGRESS))"
fi
if [ "$BAR_FAILED" -gt 0 ]; then
  PROGRESS_BAR="${PROGRESS_BAR}$(printf '▒%.0s' $(seq 1 $BAR_FAILED))"
fi
PROGRESS_EMPTY=""
if [ "$BAR_EMPTY" -gt 0 ]; then
  PROGRESS_EMPTY=$(printf '░%.0s' $(seq 1 $BAR_EMPTY))
fi

cat > "$OUTPUT_FILE" << HEADER
# Caveau MVP — Build Progress

> Auto-generated from BUILD_STATUS.json. Do not edit manually.
> Last updated: $LAST_UPDATED

## Overview

\`\`\`
${PROGRESS_BAR}${PROGRESS_EMPTY} ${PCT}% complete (${CORE_COMPLETED}/${CORE_TOTAL} core features)
\`\`\`

Legend: █ completed ▓ in-progress ▒ failed ░ pending

| Status | Count |
|--------|-------|
| Completed | $COMPLETED |
| In Progress | $IN_PROGRESS |
| Failed | $FAILED |
| Pending | $PENDING |

| Stretch Goals | ${STRETCH_COMPLETED}/${STRETCH_TOTAL} completed |
|---------------|-------|

HEADER

# Feature table (with duration column)
cat >> "$OUTPUT_FILE" << 'TABLE_HEADER'
## Features

| # | Feature | Status | Duration | Started | Completed | Issue |
|---|---------|--------|----------|---------|-----------|-------|
TABLE_HEADER

# Iterate features in order
for key in $(jq -r '.features | keys[]' "$STATUS_FILE" | sort); do
  TITLE=$(jq -r ".features[\"$key\"].title" "$STATUS_FILE")
  STATUS=$(jq -r ".features[\"$key\"].status" "$STATUS_FILE")
  IS_STRETCH=$(jq -r ".features[\"$key\"].stretch // false" "$STATUS_FILE")
  STARTED=$(jq -r ".features[\"$key\"].started_at // \"—\"" "$STATUS_FILE")
  DONE=$(jq -r ".features[\"$key\"].completed_at // \"—\"" "$STATUS_FILE")
  ISSUE=$(jq -r ".features[\"$key\"].github_issue // \"—\"" "$STATUS_FILE")
  DURATION_S=$(jq -r ".features[\"$key\"].duration_seconds // empty" "$STATUS_FILE")

  # Status label
  case "$STATUS" in
    completed)   STATUS_LABEL="completed" ;;
    in-progress) STATUS_LABEL="building" ;;
    failed)      STATUS_LABEL="failed" ;;
    pending)     STATUS_LABEL="pending" ;;
    *)           STATUS_LABEL="$STATUS" ;;
  esac

  # Mark stretch goals
  if [ "$IS_STRETCH" = "true" ]; then
    TITLE="$TITLE (stretch)"
  fi

  # Format duration
  if [ -n "${DURATION_S:-}" ]; then
    DUR_MIN=$(( DURATION_S / 60 ))
    DUR_SEC=$(( DURATION_S % 60 ))
    DURATION="${DUR_MIN}m${DUR_SEC}s"
  else
    DURATION="—"
  fi

  # Trim timestamps to date only
  [ "$STARTED" != "—" ] && STARTED=$(echo "$STARTED" | cut -d'T' -f1)
  [ "$DONE" != "—" ] && DONE=$(echo "$DONE" | cut -d'T' -f1)

  # Format issue as link if it's a number
  if [ "$ISSUE" != "—" ] && [ "$ISSUE" != "null" ]; then
    ISSUE_LINK="#${ISSUE}"
  else
    ISSUE_LINK="—"
  fi

  echo "| $key | $TITLE | \`$STATUS_LABEL\` | $DURATION | $STARTED | $DONE | $ISSUE_LINK |" >> "$OUTPUT_FILE"
done

# Recent activity section
cat >> "$OUTPUT_FILE" << 'ACTIVITY_HEADER'

## Recent Activity

ACTIVITY_HEADER

# Show last 5 completed features (most recent first)
ACTIVITY=$(jq -r '
  [.features | to_entries[] | select(.value.status == "completed") | {key: .key, title: .value.title, completed: .value.completed_at, notes: .value.notes, duration: .value.duration_seconds}]
  | sort_by(.completed) | reverse | .[0:5][]
  | "- **\(.key) — \(.title)** completed \(.completed | split("T")[0])\(if .duration then " (\(.duration / 60 | floor)m\(.duration % 60)s)" else "" end)\(if .notes != "" then " — " + .notes else "" end)"
' "$STATUS_FILE" 2>/dev/null) || true
if [ -n "${ACTIVITY:-}" ]; then
  echo "$ACTIVITY" >> "$OUTPUT_FILE"
else
  echo "_No completed features yet._" >> "$OUTPUT_FILE"
fi

# Next up section
NEXT_FEATURE=$(jq -r '
  .features | to_entries
  | map(select((.value.status == "pending" or .value.status == "failed") and .value.stretch != true))
  | sort_by(.key)
  | .[0]
  | if . then "\(.key) — \(.value.title)" else "All core features complete! Run ./build.sh start <num> for stretch goals." end
' "$STATUS_FILE")

cat >> "$OUTPUT_FILE" << NEXT

## Next Up

**$NEXT_FEATURE**

---
_Run \`./build.sh status\` for live tracking. Run \`./build.sh start\` to resume building._
NEXT

echo "Updated $OUTPUT_FILE"
