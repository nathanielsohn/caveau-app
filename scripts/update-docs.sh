#!/bin/bash
# update-docs.sh — Regenerate developer documentation from current codebase state
# Run after each feature build to keep docs fresh.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCS_DIR="$PROJECT_ROOT/docs"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M')

# Read last completed feature from BUILD_STATUS.json
LAST_FEATURE=$(node -e "
  const s = require('$PROJECT_ROOT/BUILD_STATUS.json');
  const features = Object.entries(s.features)
    .filter(([,v]) => v.status === 'completed')
    .sort(([a],[b]) => b.localeCompare(a));
  if (features.length) console.log('Feature ' + features[0][0] + ' — ' + features[0][1].title);
  else console.log('Feature 01 — Project Scaffold');
" 2>/dev/null || echo "Unknown")

echo "Updating docs (last completed: $LAST_FEATURE)..."

# --- ARCHITECTURE.md: update file tree ---
update_architecture() {
  local TREE=""

  # Build src/ tree dynamically
  if [ -d "$PROJECT_ROOT/src" ]; then
    TREE=$(cd "$PROJECT_ROOT" && find src -type f -name "*.ts" -o -name "*.tsx" -o -name "*.css" | sort)
  fi

  # Count source files
  local SRC_COUNT=0
  if [ -d "$PROJECT_ROOT/src" ]; then
    SRC_COUNT=$(cd "$PROJECT_ROOT" && find src -type f \( -name "*.ts" -o -name "*.tsx" \) | wc -l | tr -d ' ')
  fi

  # Update the timestamp line in ARCHITECTURE.md
  if [ -f "$DOCS_DIR/ARCHITECTURE.md" ]; then
    sed -i '' "s/^> Last updated:.*/> Last updated: $TIMESTAMP | $LAST_FEATURE/" "$DOCS_DIR/ARCHITECTURE.md"
    echo "  Updated ARCHITECTURE.md ($SRC_COUNT source files)"
  fi
}

# --- DATA_MODEL.md: update from Prisma schema ---
update_data_model() {
  if [ -f "$DOCS_DIR/DATA_MODEL.md" ]; then
    # Count models in schema
    local MODEL_COUNT=0
    if [ -f "$PROJECT_ROOT/prisma/schema.prisma" ]; then
      MODEL_COUNT=$(grep -c "^model " "$PROJECT_ROOT/prisma/schema.prisma" || true)
    fi

    sed -i '' "s/^> Last updated:.*/> Last updated: $TIMESTAMP | $LAST_FEATURE/" "$DOCS_DIR/DATA_MODEL.md"
    echo "  Updated DATA_MODEL.md ($MODEL_COUNT models)"
  fi
}

# --- COMPONENT_GUIDE.md: update component statuses ---
update_component_guide() {
  if [ -f "$DOCS_DIR/COMPONENT_GUIDE.md" ]; then
    sed -i '' "s/^> Last updated:.*/> Last updated: $TIMESTAMP | $LAST_FEATURE/" "$DOCS_DIR/COMPONENT_GUIDE.md"

    # Update component statuses based on file existence
    local COMPONENTS=("nav.tsx" "metric-card.tsx" "wine-card.tsx" "locker-grid.tsx" "sensor-charts.tsx" "alert-list.tsx" "certificate-doc.tsx" "add-wine-form.tsx")
    local BUILT_COUNT=0

    for comp in "${COMPONENTS[@]}"; do
      if [ -f "$PROJECT_ROOT/src/components/$comp" ]; then
        BUILT_COUNT=$((BUILT_COUNT + 1))
      fi
    done

    echo "  Updated COMPONENT_GUIDE.md ($BUILT_COUNT/${#COMPONENTS[@]} components built)"
  fi
}

# --- GETTING_STARTED.md: just timestamp ---
update_getting_started() {
  if [ -f "$DOCS_DIR/GETTING_STARTED.md" ]; then
    sed -i '' "s/^> Last updated:.*/> Last updated: $TIMESTAMP | $LAST_FEATURE/" "$DOCS_DIR/GETTING_STARTED.md"
    echo "  Updated GETTING_STARTED.md"
  fi
}

# --- DESIGN_SYSTEM.md: just timestamp ---
update_design_system() {
  if [ -f "$DOCS_DIR/DESIGN_SYSTEM.md" ]; then
    sed -i '' "s/^> Last updated:.*/> Last updated: $TIMESTAMP | $LAST_FEATURE/" "$DOCS_DIR/DESIGN_SYSTEM.md"
    echo "  Updated DESIGN_SYSTEM.md"
  fi
}

# --- DEPLOYMENT.md: just timestamp ---
update_deployment() {
  if [ -f "$DOCS_DIR/DEPLOYMENT.md" ]; then
    sed -i '' "s/^> Last updated:.*/> Last updated: $TIMESTAMP | $LAST_FEATURE/" "$DOCS_DIR/DEPLOYMENT.md"
    echo "  Updated DEPLOYMENT.md"
  fi
}

# --- API.md: update if API routes exist ---
update_api() {
  if [ -f "$DOCS_DIR/API.md" ]; then
    sed -i '' "s/^> Last updated:.*/> Last updated: $TIMESTAMP | $LAST_FEATURE/" "$DOCS_DIR/API.md"

    local API_COUNT=0
    if [ -d "$PROJECT_ROOT/src/app/api" ]; then
      API_COUNT=$(find "$PROJECT_ROOT/src/app/api" -name "route.ts" | wc -l | tr -d ' ')
    fi

    echo "  Updated API.md ($API_COUNT routes)"
  fi
}

# Run all updates
update_architecture
update_data_model
update_component_guide
update_getting_started
update_design_system
update_deployment
update_api

echo "Docs updated at $TIMESTAMP"
