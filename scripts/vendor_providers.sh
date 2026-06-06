#!/usr/bin/env bash
set -euo pipefail

VENDOR_DIR="$(cd "$(dirname "$0")/.." && pwd)/vendor/providers"

# Each entry: category | name | repo URL
# Commit SHAs are "latest at vendor time" — update as needed
PROVIDERS=(
  "memory|mem0|https://github.com/mem0ai/mem0.git"
  "knowledge|claude-mem|https://github.com/thedotmack/claude-mem.git"
  "memory|letta|https://github.com/letta-ai/letta.git"
  "context|openviking|https://github.com/volcengine/OpenViking.git"
  "knowledge|cognee|https://github.com/topoteretes/cognee.git"
  "routing|gemini-cli|https://github.com/google-gemini/gemini-cli.git"
  "policy|parlant|https://github.com/emcie-co/parlant.git"
  "search|chroma|https://github.com/chroma-core/chroma.git"
  "search|pageindex|https://github.com/VectifyAI/PageIndex.git"
)

echo "=== agent-core vendor script ==="
echo "Vendor directory: $VENDOR_DIR"
echo ""

for entry in "${PROVIDERS[@]}"; do
  IFS='|' read -r category name repo_url <<< "$entry"
  target="$VENDOR_DIR/$category/$name"

  if [ -d "$target" ]; then
    echo "SKIP  $category/$name — already exists"
    continue
  fi

  echo "CLONE $category/$name from $repo_url"
  mkdir -p "$(dirname "$target")"
  git clone --depth 1 "$repo_url" "$target" 2>/dev/null || {
    echo "WARN  Failed to clone $name — skipping"
    continue
  }

  # Remove .git to make it a source snapshot
  rm -rf "$target/.git"

  # Record the commit SHA in metadata
  echo "  Cloned at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
done

echo ""
echo "=== Done ==="
echo "Run 'ls vendor/providers/*/' to verify."
