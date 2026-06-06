#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Installing dependencies..."
pnpm install

echo ""
echo "Starting agent-core in development mode..."
echo "Server will be available at http://localhost:3210"
echo ""
exec pnpm dev
