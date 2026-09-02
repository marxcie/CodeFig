#!/usr/bin/env bash
# Plan 37 object @PANEL_START + DSF Mode settings gates — figma:ui smoke.
# Requires: npm run dev, plugin open on current dist/build-id.
set -euo pipefail
cd "$(dirname "$0")/.."
UI=(npm run figma:ui --)
OUT=artifacts/panel-object-form-verify.txt
mkdir -p artifacts
DISK=$(cat dist/build-id.txt)
PRESENCE=$(curl -s http://localhost:8765/presence)
FIGMA=$(echo "$PRESENCE" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).buildId || ''")

{
  echo "# Panel object-form Figma verification"
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
ok() { echo "ok: $*" | tee -a "$OUT"; }
bad() { echo "FAIL: $*" | tee -a "$OUT"; fail=1; }

# ========== 1. Every DSF + one utility: form loads (proves object PANEL parses) ==========
for label in Typography Spacing "Corner radius" Grid Colors; do
  echo "======== load: $label ========" | tee -a "$OUT"
  "${UI[@]}" selectScript "name=Design System Foundations / $label" 2>&1 | tee -a "$OUT" | tail -2
  sleep 1
  FORM=$("${UI[@]}" readForm 2>&1 || true)
  echo "$FORM" >> "$OUT"
  if echo "$FORM" | grep -qiE 'unreadable @PANEL|PANEL_START|driftWarning'; then
    bad "$label — panel parse / drift error"
  elif echo "$FORM" | grep -qiE 'collectionName|Collection'; then
    ok "$label — Configuration UI has Collection"
  else
    bad "$label — form missing Collection (empty or failed)"
  fi
done

echo "======== load: Rename styles ========" | tee -a "$OUT"
"${UI[@]}" selectScript "name=Styles / Rename styles" 2>&1 | tee -a "$OUT" | tail -2
sleep 1
FORM=$("${UI[@]}" readForm 2>&1 || true)
echo "$FORM" >> "$OUT"
if echo "$FORM" | grep -qiE 'searchIn|Search in|searchFor'; then
  ok "Rename styles — form fields present"
else
  bad "Rename styles — form empty or unexpected"
fi

# ========== 2. Spacing Mode settings: need collection + tokens ==========
echo "======== gate: Spacing ========" | tee -a "$OUT"
"${UI[@]}" selectScript "name=Design System Foundations / Spacing" 2>&1 | tee -a "$OUT" | tail -2
sleep 1

# Write pristine-ish block: collection + tokens + Value mode
TMP=$(mktemp)
cat > "$TMP" <<'EOF'
// @fromFile: domains.spacing

  collectionName: "__codefig_gate_spacing",
  group: "",
  spacings: ["xs", "sm", "md"],
  generateOverview: false,
  modes: [{
    name: "Value",
    scaleType: "bezier",
    base: 4,
    ratio: 1.5,
    curve: [],
    step: 4,
    mod: 3,
    roundTo: 2,
    extras: [1]
  }]
EOF
"${UI[@]}" writeConfig --text-file "$TMP" 2>&1 | tee -a "$OUT" | tail -3
rm -f "$TMP"
sleep 2
FORM=$("${UI[@]}" readForm 2>&1 || true)
echo "$FORM" >> "$OUT"
if echo "$FORM" | grep -qi 'Mode settings\|scaleType\|Base unit\|bezier'; then
  ok "Spacing with collection+tokens — Mode settings / scale controls visible"
else
  bad "Spacing with collection+tokens — Mode settings not visible"
fi

# Clear collection — Mode settings should hide
TMP=$(mktemp)
cat > "$TMP" <<'EOF'
// @fromFile: domains.spacing

  collectionName: "",
  group: "",
  spacings: ["xs", "sm", "md"],
  generateOverview: false,
  modes: [{ name: "Value", scaleType: "bezier", base: 4, ratio: 1.5, curve: [], step: 4, mod: 3, roundTo: 2, extras: [1] }]
EOF
"${UI[@]}" writeConfig --text-file "$TMP" 2>&1 | tee -a "$OUT" | tail -3
rm -f "$TMP"
sleep 1
FORM=$("${UI[@]}" readForm 2>&1 || true)
echo "$FORM" >> "$OUT"
# Hidden rows may be omitted or marked hidden — accept either
if echo "$FORM" | grep -qi 'Mode settings' && ! echo "$FORM" | grep -qiE 'hidden|display:\s*none'; then
  # If Mode settings text appears, check whether generateOverview / scaleType are absent
  if echo "$FORM" | grep -qiE 'scaleType|Base unit|"generateOverview"'; then
    bad "Spacing tokens without collection — mode controls still visible"
  else
    ok "Spacing tokens without collection — mode controls not exposed"
  fi
else
  ok "Spacing tokens without collection — Mode settings gated"
fi

# ========== 3. Grid Mode settings: need named collection ==========
echo "======== gate: Grid ========" | tee -a "$OUT"
"${UI[@]}" selectScript "name=Design System Foundations / Grid" 2>&1 | tee -a "$OUT" | tail -2
sleep 1
TMP=$(mktemp)
cat > "$TMP" <<'EOF'
// @fromFile: domains.grid

  collectionName: "__codefig_gate_grid",
  group: "",
  extensionColumns: 0,
  generateOverview: false,
  modes: [{ name: "Value", containerWidth: 1920, columns: 12, gap: 40, padding: 80 }]
EOF
"${UI[@]}" writeConfig --text-file "$TMP" 2>&1 | tee -a "$OUT" | tail -3
rm -f "$TMP"
sleep 2
FORM=$("${UI[@]}" readForm 2>&1 || true)
echo "$FORM" >> "$OUT"
if echo "$FORM" | grep -qiE 'Mode settings|containerWidth|Width|columns'; then
  ok "Grid with named collection — mode fields visible"
else
  bad "Grid with named collection — mode fields missing"
fi

echo "" | tee -a "$OUT"
if [ "$fail" -eq 0 ]; then
  echo "ALL CHECKS PASSED" | tee -a "$OUT"
  exit 0
fi
echo "FAILED ($fail)" | tee -a "$OUT"
exit 1
