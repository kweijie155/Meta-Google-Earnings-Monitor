#!/usr/bin/env bash
# Rebuild data (with all validation checks), the installable app and the two Claude pages.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 build_data.py | tee /tmp/build_data.log
grep -q " 0 fail" /tmp/build_data.log || { echo "DATA CHECKS FAILED - do not publish"; exit 1; }
# "Last updated" = time of the last committed data change (falls back to now for uncommitted changes)
if git diff --quiet -- app/src/data.json 2>/dev/null && git log -1 --format=%cI -- app/src/data.json >/dev/null 2>&1 && [ -n "$(git log -1 --format=%cI -- app/src/data.json)" ]; then
  export BUILD_TIME="$(git log -1 --format=%cI -- app/src/data.json)"
else
  export BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
fi
cd app
[ -d node_modules ] || npm ci
VITE_TARGET=pages npx vite build
VITE_TARGET=artifact npx vite build
VITE_TARGET=artifact VITE_DEFAULT_EDITION=apac npx vite build
cd ..
mkdir -p publish
python3 make_fragment.py app/dist-artifact/index.html publish/alphabet-meta-monitor.html "Alphabet vs Meta Monitor"
python3 make_fragment.py app/dist-artifact-apac/index.html publish/alphabet-meta-apac-monitor.html "Alphabet vs Meta APAC Monitor"
echo "BUILD OK  (last updated stamp: $BUILD_TIME)"
