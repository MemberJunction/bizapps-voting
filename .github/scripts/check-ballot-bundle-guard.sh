#!/usr/bin/env bash
# CI gate: verify the ballot element bundle contains no server-only code.
#
# Runs after `pnpm run build` to check that the esbuild metafile from the
# ballot widget build contains no @memberjunction or voting-entities/generated
# inputs.
#
# Exit code 0 if clean, 1 if violations found.

set -euo pipefail

PACKAGES_DIR="packages/AngularWidgets"

if [ ! -d "$PACKAGES_DIR" ]; then
  echo "Error: ballot-widget package not found at $PACKAGES_DIR"
  exit 1
fi

# Build the element (includes guard checks)
cd "$PACKAGES_DIR"
pnpm run build:element

# If esbuild succeeded, the guard already ran and passed.
echo "[check-ballot-bundle-guard] ✓ Ballot widget bundle passed server-only guard"
