#!/usr/bin/env bash
#
# update-mem0.sh — Fetch latest mem0 upstream and prepare upgrade comparison.
#
# Usage:
#   bash scripts/update-mem0.sh
#
# This script:
#   1. Clones/fetches the latest mem0 source to /tmp/mem0-upstream
#   2. Shows a summary of changes since the vendored version
#   3. Prints instructions for running benchmark comparison
#
# It does NOT automatically apply changes.

set -euo pipefail

UPSTREAM_REPO="https://github.com/mem0ai/mem0.git"
UPSTREAM_DIR="/tmp/mem0-upstream"
VENDOR_DIR="vendor/providers/memory/mem0"
VERSION_FILE="vendor/mem0/VERSION"

echo "=== Mem0 Upstream Update ==="
echo ""

# Step 1: Fetch upstream
if [ -d "$UPSTREAM_DIR/.git" ]; then
  echo "Updating existing clone at $UPSTREAM_DIR..."
  cd "$UPSTREAM_DIR"
  git fetch origin
  git checkout main
  git pull origin main
  cd -
else
  echo "Cloning mem0 to $UPSTREAM_DIR..."
  git clone --depth=50 "$UPSTREAM_REPO" "$UPSTREAM_DIR"
fi

CANDIDATE_COMMIT=$(cd "$UPSTREAM_DIR" && git rev-parse --short HEAD)
CANDIDATE_DATE=$(cd "$UPSTREAM_DIR" && git log -1 --format=%ci HEAD)

echo ""
echo "Candidate version:"
echo "  Commit: $CANDIDATE_COMMIT"
echo "  Date:   $CANDIDATE_DATE"
echo ""

# Step 2: Show current version
if [ -f "$VERSION_FILE" ]; then
  echo "Current version:"
  cat "$VERSION_FILE"
  echo ""
fi

# Step 3: Diff summary
echo "=== Change Summary ==="
echo ""

if [ -d "$VENDOR_DIR" ]; then
  # Memory module changes
  MEMORY_CHANGES=$(diff -rq "$VENDOR_DIR/mem0/memory/" "$UPSTREAM_DIR/mem0/memory/" 2>/dev/null | wc -l || echo "0")
  echo "Memory module: $MEMORY_CHANGES files changed"

  # Server changes
  if [ -f "$VENDOR_DIR/server/main.py" ] && [ -f "$UPSTREAM_DIR/server/main.py" ]; then
    SERVER_DIFF=$(diff "$VENDOR_DIR/server/main.py" "$UPSTREAM_DIR/server/main.py" | wc -l || echo "0")
    echo "Server API:    $SERVER_DIFF lines changed"
  fi

  # Scoring changes
  if [ -f "$VENDOR_DIR/mem0/utils/scoring.py" ] && [ -f "$UPSTREAM_DIR/mem0/utils/scoring.py" ]; then
    SCORING_DIFF=$(diff "$VENDOR_DIR/mem0/utils/scoring.py" "$UPSTREAM_DIR/mem0/utils/scoring.py" | wc -l || echo "0")
    echo "Scoring:       $SCORING_DIFF lines changed"
  fi
else
  echo "No vendor directory found at $VENDOR_DIR"
fi

echo ""
echo "=== Next Steps ==="
echo ""
echo "1. Review changes:"
echo "   diff -r $VENDOR_DIR/mem0/memory/ $UPSTREAM_DIR/mem0/memory/"
echo ""
echo "2. Run baseline benchmark:"
echo "   pnpm memory:eval > /tmp/mem0-baseline.json"
echo ""
echo "3. Start candidate mem0 server, then run:"
echo "   MEMORY_PROVIDER=mem0 MEM0_BASE_URL=http://localhost:8000 pnpm memory:eval > /tmp/mem0-candidate.json"
echo ""
echo "4. Compare:"
echo "   diff /tmp/mem0-baseline.json /tmp/mem0-candidate.json"
echo ""
echo "5. If benchmarks pass, apply:"
echo "   cp -r $UPSTREAM_DIR/* $VENDOR_DIR/"
echo "   # Update vendor/mem0/VERSION"
echo ""
