#!/usr/bin/env bash
# DSF content-reveal + Colors strip — full figma:ui end-to-end.
# Requires: npm run dev, plugin open on the current dist/build-id.
set -euo pipefail
cd "$(dirname "$0")/.."
UI=(npm run figma:ui --)
OUT=artifacts/dsf-content-reveal-verify.txt
mkdir -p artifacts
DISK=$(cat dist/build-id.txt)
PRESENCE=$(curl -s http://localhost:8765/presence)
FIGMA=$(echo "$PRESENCE" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).buildId || ''")

{
  echo "# DSF content-reveal Figma verification"
  echo "Date: $(date -u +%Y-%m-%dT%H:%MZ)"
  echo "Figma build: $FIGMA"
  echo "Disk build:  $DISK"
  if [ -z "$FIGMA" ] || [ "$FIGMA" = "undefined" ]; then
    echo "FAIL: no plugin presence — open the plugin on a dev build"
    exit 1
  fi
  if [ "$FIGMA" != "$DISK" ]; then
    echo "FAIL: build mismatch — reload plugin after build:dev"
    exit 1
  fi
  echo "Build: synced"
  echo ""
} | tee "$OUT"

fail=0
assert_not() {
  local label="$1" needle="$2" hay="$3"
  if echo "$hay" | grep -qiF -- "$needle"; then
    echo "FAIL: $label — found unexpected: $needle" | tee -a "$OUT"
    fail=1
  else
    echo "ok: $label — no '$needle'" | tee -a "$OUT"
  fi
}
assert_has() {
  local label="$1" needle="$2" hay="$3"
  if echo "$hay" | grep -qiF -- "$needle"; then
    echo "ok: $label — has '$needle'" | tee -a "$OUT"
  else
    echo "FAIL: $label — missing: $needle" | tee -a "$OUT"
    fail=1
  fi
}
# readPreview "visible: false" with empty slots = content-reveal holding the section closed
assert_preview_hidden() {
  local label="$1" hay="$2"
  if echo "$hay" | grep -q 'visible: false'; then
    echo "ok: $label — preview region hidden" | tee -a "$OUT"
  elif echo "$hay" | grep -qE 'slots: \[\{[^]]*"visible":false[^]]*\}]$' \
    || echo "$hay" | grep -q '"visible":false,"cards":0,"text":""'; then
    echo "ok: $label — all slots empty/hidden" | tee -a "$OUT"
  elif ! echo "$hay" | grep -qiE 'spacing-preview|radius-preview|grid-preview|type-specimen|color-ramp-preview|type-overview'; then
    echo "ok: $label — no preview content classes" | tee -a "$OUT"
  else
    echo "FAIL: $label — expected hidden/empty preview" | tee -a "$OUT"
    fail=1
  fi
}
assert_no_placeholders() {
  local label="$1" hay="$2"
  assert_not "$label" "Pick a scale type" "$hay"
  assert_not "$label" "Name some tokens" "$hay"
  assert_not "$label" "Waiting for a config" "$hay"
  assert_not "$label" "config-ui-empty" "$hay"
}

# ========== 1. Pristine opens (no collection) ==========
for label in Typography Spacing "Corner radius" Grid Colors; do
  echo "======== pristine: $label ========" | tee -a "$OUT"
  "${UI[@]}" selectScript "name=Design System Foundations / $label" 2>&1 | tee -a "$OUT" | tail -2
  sleep 2
  PREV=$("${UI[@]}" readPreview 2>&1 || true)
  echo "$PREV" >> "$OUT"
  assert_no_placeholders "$label pristine" "$PREV"
  # Colors / Spacing / etc. should not show a fabricated ramp/bars before address + data
  case "$label" in
    Colors)
      assert_not "$label pristine" "color-ramp-preview" "$PREV"
      ;;
    Typography)
      assert_not "$label pristine" "type-specimen" "$PREV"
      assert_not "$label pristine" "type-overview" "$PREV"
      ;;
  esac
done

# ========== 2. Spacing + collection with known spacing group ==========
echo "======== Spacing + Responsive System ========" | tee -a "$OUT"
"${UI[@]}" selectScript "name=Design System Foundations / Spacing" 2>&1 | tee -a "$OUT" | tail -2
"${UI[@]}" setField "name=collectionName" "value=Responsive System" 2>&1 | tee -a "$OUT" | tail -2
sleep 5
PREV=$("${UI[@]}" readPreview 2>&1 || true)
echo "$PREV" >> "$OUT"
assert_no_placeholders "Spacing after RS" "$PREV"
assert_has "Spacing after RS" "spacing-preview" "$PREV"

# ========== 3. Corner radius + RS ==========
echo "======== Corner radius + Responsive System ========" | tee -a "$OUT"
"${UI[@]}" selectScript "name=Design System Foundations / Corner radius" 2>&1 | tee -a "$OUT" | tail -2
"${UI[@]}" setField "name=collectionName" "value=Responsive System" 2>&1 | tee -a "$OUT" | tail -2
sleep 5
PREV=$("${UI[@]}" readPreview 2>&1 || true)
echo "$PREV" >> "$OUT"
assert_no_placeholders "Corner radius after RS" "$PREV"
# May be empty if no radius group — either hidden or a real radius preview, never placeholder
if echo "$PREV" | grep -qiF "radius-preview"; then
  echo "ok: Corner radius after RS — has radius-preview" | tee -a "$OUT"
else
  assert_preview_hidden "Corner radius after RS (no group)" "$PREV"
fi

# ========== 4. Grid + RS ==========
echo "======== Grid + Responsive System ========" | tee -a "$OUT"
"${UI[@]}" selectScript "name=Design System Foundations / Grid" 2>&1 | tee -a "$OUT" | tail -2
"${UI[@]}" setField "name=collectionName" "value=Responsive System" 2>&1 | tee -a "$OUT" | tail -2
sleep 5
PREV=$("${UI[@]}" readPreview 2>&1 || true)
echo "$PREV" >> "$OUT"
assert_no_placeholders "Grid after RS" "$PREV"
# Grid shows when mode has width/columns/gap/padding
if echo "$PREV" | grep -qiE 'grid-preview|Total:'; then
  echo "ok: Grid after RS — has diagram or totals" | tee -a "$OUT"
else
  assert_preview_hidden "Grid after RS (incomplete)" "$PREV"
fi

# ========== 5. Typography + RS ==========
echo "======== Typography + Responsive System ========" | tee -a "$OUT"
"${UI[@]}" selectScript "name=Design System Foundations / Typography" 2>&1 | tee -a "$OUT" | tail -2
"${UI[@]}" setField "name=collectionName" "value=Responsive System" 2>&1 | tee -a "$OUT" | tail -2
sleep 5
PREV=$("${UI[@]}" readPreview 2>&1 || true)
echo "$PREV" >> "$OUT"
assert_no_placeholders "Typography after RS" "$PREV"

# ========== 6. Colors: non-ramp collection + typed tokens ==========
echo "======== Colors: Responsive System + typed 50, 900 ========" | tee -a "$OUT"
"${UI[@]}" selectScript "name=Design System Foundations / Colors" 2>&1 | tee -a "$OUT" | tail -2
sleep 1
"${UI[@]}" setField "name=collectionName" "value=Responsive System" 2>&1 | tee -a "$OUT" | tail -2
sleep 2
# Before steps: no strip
PREV=$("${UI[@]}" readPreview 2>&1 || true)
echo "$PREV" >> "$OUT"
assert_not "Colors before steps" "color-ramp-preview" "$PREV"
assert_no_placeholders "Colors before steps" "$PREV"

# Comma in the value must stay one argv
"${UI[@]}" setField name=steps 'value=50, 900' 2>&1 | tee -a "$OUT" | tail -5
sleep 4
PREV=$("${UI[@]}" readPreview 2>&1 || true)
echo "$PREV" >> "$OUT"
assert_not "Colors typed steps" "Original has no colours" "$PREV"
assert_has "Colors typed steps" "color-ramp-preview" "$PREV"
assert_has "Colors typed steps" "#FAFAFA" "$PREV"
assert_has "Colors typed steps" '"visible":true' "$PREV"

# ========== 7. Colors: existing lime collection — modes load; strip waits on tokens ==========
echo "======== Colors: color - lime then typed steps ========" | tee -a "$OUT"
"${UI[@]}" selectScript "name=Design System Foundations / Colors" 2>&1 | tee -a "$OUT" | tail -2
"${UI[@]}" setField "name=collectionName" "value=color - lime" 2>&1 | tee -a "$OUT" | tail -2
sleep 5
PREV=$("${UI[@]}" readPreview 2>&1 || true)
echo "$PREV" >> "$OUT"
assert_no_placeholders "Colors lime before steps" "$PREV"
# Auto-import may or may not fill steps from the file; content-reveal must stay closed until it has some.
if echo "$PREV" | grep -qiF "color-ramp-preview"; then
  echo "ok: Colors lime — auto-import already drew a strip" | tee -a "$OUT"
else
  echo "ok: Colors lime — no strip until tokens (content-reveal)" | tee -a "$OUT"
  "${UI[@]}" setField name=steps 'value=50, 100, 200, 300, 400, 500, 600, 700, 800, 900' 2>&1 | tee -a "$OUT" | tail -3
  sleep 4
  PREV=$("${UI[@]}" readPreview 2>&1 || true)
  echo "$PREV" >> "$OUT"
  assert_not "Colors lime typed steps" "Original has no colours" "$PREV"
  assert_has "Colors lime typed steps" "color-ramp-preview" "$PREV"
fi

echo "" | tee -a "$OUT"
if [ "$fail" -ne 0 ]; then
  echo "RESULT: FAIL ($fail) — see $OUT" | tee -a "$OUT"
  exit 1
fi
echo "RESULT: PASS — see $OUT" | tee -a "$OUT"
