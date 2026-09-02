#!/usr/bin/env bash
# DSF verification via figma:ui. Requires npm run dev + plugin open on dev build.
set -euo pipefail
cd "$(dirname "$0")/.."
UI=(npm run figma:ui --)
OUT=artifacts/dsf-2.0-figma-verify.txt
mkdir -p artifacts
DISK=$(cat dist/build-id.txt)
PRESENCE=$(curl -s http://localhost:8765/presence)
FIGMA=$(echo "$PRESENCE" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).buildId")

{
  echo "# DSF 2.0 Figma verification"
  echo "Date: $(date -u +%Y-%m-%dT%H:%MZ)"
  echo "Figma build: $FIGMA"
  echo "Disk build:  $DISK"
  if [ "$FIGMA" != "$DISK" ]; then
    echo "WARN: build mismatch — reload plugin or run build:dev"
  else
    echo "Build: synced"
  fi
  echo ""
} > "$OUT"

verify() {
  local label="$1"
  local collection="$2"
  echo "======== $label / $collection ========" | tee -a "$OUT"

  "${UI[@]}" selectScript "name=Design System Foundations / $label" 2>&1 | tee -a "$OUT" | tail -2

  echo "--- form pristine ---" >> "$OUT"
  "${UI[@]}" readForm --json 2>&1 >> "$OUT" || true

  echo "--- set collection ---" >> "$OUT"
  "${UI[@]}" setField "name=collectionName" "value=$collection" 2>&1 >> "$OUT" || true
  sleep 5

  echo "--- auto-import ---" >> "$OUT"
  "${UI[@]}" readAutoImport 2>&1 >> "$OUT" || true

  echo "--- form after ---" >> "$OUT"
  "${UI[@]}" readForm --json 2>&1 >> "$OUT" || true

  echo "--- preview ---" >> "$OUT"
  "${UI[@]}" readPreview 2>&1 >> "$OUT" || true
  echo "" >> "$OUT"
}

verify "Spacing" "Responsive System"
verify "Corner radius" "Responsive System"
verify "Typography" "Responsive System"
verify "Grid" "Responsive System"
verify "Colors" "color - lime"

echo "Done → $OUT"
