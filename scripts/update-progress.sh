#!/bin/bash
# Generates PROGRESS.md from BUILD_STATUS.json
# Called automatically after each feature build, or manually via: ./build.sh docs

set -e
cd "$(dirname "$0")/.."

STATUS_FILE="BUILD_STATUS.json"
OUTPUT_FILE="PROGRESS.md"

if [ ! -f "$STATUS_FILE" ]; then
  echo "Error: $STATUS_FILE not found"
  exit 1
fi

# Count statuses
TOTAL=$(jq '.total_features' "$STATUS_FILE")
COMPLETED=$(jq '[.features[] | select(.status == "completed")] | length' "$STATUS_FILE")
IN_PROGRESS=$(jq '[.features[] | select(.status == "in-progress")] | length' "$STATUS_FILE")
FAILED=$(jq '[.features[] | select(.status == "failed")] | length' "$STATUS_FILE")
PENDING=$(jq '[.features[] | select(.status == "pending")] | length' "$STATUS_FILE")
LAST_UPDATED=$(jq -r '.last_updated // "Never"' "$STATUS_FILE")
LAST_FEATURE=$(jq -r '.last_completed_feature // "None"' "$STATUS_FILE")
PCT=$(( COMPLETED * 100 / TOTAL ))

# Build progress bar
BAR_FILLED=$(( COMPLETED * 2 ))
BAR_EMPTY=$(( (TOTAL - COMPLETED) * 2 ))
PROGRESS_BAR=$(printf '█%.0s' $(seq 1 $BAR_FILLED 2>/dev/null) || true)
PROGRESS_EMPTY=$(printf '░%.0s' $(seq 1 $BAR_EMPTY 2>/dev/null) || true)

cat > "$OUTPUT_FILE" << HEADER
# Caveau MVP — Build Progress

> Auto-generated from BUILD_STATUS.json. Do not edit manually.
> Last updated: $LAST_UPDATED

## Overview

\`\`\`
${PROGRESS_BAR}${PROGRESS_EMPTY} ${PCT}% complete (${COMPLETED}/${TOTAL} features)
\`\`\`

| Status | Count |
|--------|-------|
| Completed | $COMPLETED |
| In Progress | $IN_PROGRESS |
| Failed | $FAILED |
| Pending | $PENDING |

HEADER

# Feature table
cat >> "$OUTPUT_FILE" << 'TABLE_HEADER'
## Features

| # | Feature | Status | Started | Completed | Issue |
|---|---------|--------|---------|-----------|-------|
TABLE_HEADER

# Iterate features in order
for key in $(jq -r '.features | keys[]' "$STATUS_FILE" | sort); do
  TITLE=$(jq -r ".features[\"$key\"].title" "$STATUS_FILE")
  STATUS=$(jq -r ".features[\"$key\"].status" "$STATUS_FILE")
  STARTED=$(jq -r ".features[\"$key\"].started_at // \"—\"" "$STATUS_FILE")
  DONE=$(jq -r ".features[\"$key\"].completed_at // \"—\"" "$STATUS_FILE")
  ISSUE=$(jq -r ".features[\"$key\"].github_issue // \"—\"" "$STATUS_FILE")

  # Status emoji
  case "$STATUS" in
    completed)   ICON="done" ;;
    in-progress) ICON="building" ;;
    failed)      ICON="failed" ;;
    pending)     ICON="pending" ;;
    *)           ICON="$STATUS" ;;
  esac

  # Trim timestamps to date only
  [ "$STARTED" != "—" ] && STARTED=$(echo "$STARTED" | cut -d'T' -f1)
  [ "$DONE" != "—" ] && DONE=$(echo "$DONE" | cut -d'T' -f1)

  # Format issue as link if it's a number
  if [ "$ISSUE" != "—" ] && [ "$ISSUE" != "null" ]; then
    ISSUE_LINK="#${ISSUE}"
  else
    ISSUE_LINK="—"
  fi

  echo "| $key | $TITLE | \`$ICON\` | $STARTED | $DONE | $ISSUE_LINK |" >> "$OUTPUT_FILE"
done

# Recent activity section
cat >> "$OUTPUT_FILE" << 'ACTIVITY_HEADER'

## Recent Activity

ACTIVITY_HEADER

# Show last 5 completed features (most recent first)
jq -r '
  [.features | to_entries[] | select(.value.status == "completed") | {key: .key, title: .value.title, completed: .value.completed_at, notes: .value.notes}]
  | sort_by(.completed) | reverse | .[0:5][]
  | "- **\(.key) — \(.title)** completed \(.completed | split("T")[0])\(if .notes != "" then " — " + .notes else "" end)"
' "$STATUS_FILE" >> "$OUTPUT_FILE" 2>/dev/null || echo "_No completed features yet._" >> "$OUTPUT_FILE"

# Next up section
NEXT_FEATURE=$(jq -r '
  .features | to_entries
  | map(select(.value.status == "pending" or .value.status == "failed"))
  | sort_by(.key)
  | .[0]
  | if . then "\(.key) — \(.value.title)" else "All features complete!" end
' "$STATUS_FILE")

cat >> "$OUTPUT_FILE" << NEXT

## Next Up

**$NEXT_FEATURE**

---
_Run \`./build.sh status\` for live tracking. Run \`./build.sh start\` to resume building._
NEXT

echo "Updated $OUTPUT_FILE"
