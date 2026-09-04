/**
 * The curve editor, **run** rather than read.
 *
 * Every part of this control is a thing that reads correctly in source and fails in practice. `draw()`
 * replaces every element it owns on every change, so a listener bound to a handle would be thrown away by
 * the redraw the drag itself causes. The value lives on an attribute rather than in an input, so the flat
 * collector cannot see it without a pass of its own — which is how `@rows` shipped able to render and unable
 * to save. And the preset caption is re-derived on each redraw, so "pick a preset, nudge it, read Custom"
 * is a behaviour, not a flag.
 *
 * So this file builds the control against the shim, presses its buttons, and asserts on what comes back out
 * of the collector — never on the renderer's text.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const shim = require("./dom-shim.js");

// The real library, loaded through the same helper `build-bezier.js` uses to inline it into `dist/ui.html`
// and to draw the style reference. One export list, three consumers: a function renamed out from under the
// editor has to fail in one place rather than drift in three.
const { loadBezierGlobal } = require("../build-bezier.js");

const B = loadBezierGlobal();
shim.install({ CodeFigBezier: B });
const renderer = require("../src/config-ui/renderer.js");

function build(field, value) {
  const wrap = renderer.buildCurveControl(field || {}, value);
  return {
    wrap,
    points: () => JSON.parse(wrap.getAttribute("data-curve-value")),
    preset: wrap.querySelector(".config-ui-curve__preset"),
    toggle: wrap.querySelector(".config-ui-curve__toggle"),
    text: wrap.querySelector(".config-ui-curve__text"),
    svg: wrap.querySelector(".config-ui-curve__canvas"),
    handles: () => wrap.querySelectorAll("[data-curve-index]"),
  };
}

test("it opens on the curve it was given, in either shape", () => {
  assert.deepEqual(build({}, [0.37, 0, 0.63, 1]).points(), [0.37, 0, 0.63, 1]);
  // `outin` rather than `inout`: `inout` is one cubic now, because two segments meant a middle anchor and
  // a colour channel travels through its middle anchor value. `outin` is still genuinely two.
  assert.equal(build({}, B.bezierFromEase("sine", "outin", 1)).points().length, 10);
  assert.deepEqual(build({ allowOriginal: true }, []).points(), []);
  // Junk in the config is an empty curve, not a crash and not a guess.
  assert.deepEqual(build({ allowOriginal: true }, [1, 2, 3]).points(), []);
  assert.deepEqual(build({ allowOriginal: true }, null).points(), []);
});

test("an empty curve is Original where that exists, and the straight ramp where it does not", () => {
  // **`[]` means two different things and `@allowOriginal` is which.** For Colors it is *Original* — leave
  // the file's own steps alone, generate nothing. For a scale there is no fallback to leave alone:
  // `bezierAt([], t)` is `t`, so an empty curve **is** the straight ramp, and drawing an empty box captioned
  // "Custom" described neither the value nor what a run would do with it.
  const original = build({ allowOriginal: true }, []);
  assert.deepEqual(original.points(), []);
  assert.equal(original.preset.value, "original");
  assert.equal(original.handles().length, 0, "nothing to drag on a curve that is not one");

  // **Drawn straight, stored empty.** The substitution happens when drawing, so an untouched control still
  // holds `[]` — which is what keeps an unrelated edit from writing six decimals nobody chose, and what
  // lets *Linear* and *Custom* be two states of the same straight line.
  const straight = build({}, []);
  assert.deepEqual(straight.points(), [], "the stored value stays empty");
  assert.equal(straight.preset.value, "linear|none");
  // The bounded editor has no growth, so its field is the coordinates alone.
  assert.equal(straight.text.value, B.bezierFormat(B.bezierFromEase("linear", "none", 1)),
    "but the field reads the line it draws");
});

test("dragging a handle on an untouched (empty, implied-Linear) curve writes a real shape", () => {
  /**
   * **Every Hue, Saturation or Chroma field starts here.** Nothing chosen yet is stored as `[]` and drawn
   * as Linear — `draw()` builds the handles from `effectivePoints([])`, the implied straight line, not
   * from the empty stored value. `applyMove` used to read the raw stored value again: `pts[dragging] =
   * at.x` on `[]` produces a one- or two-number result, which is not a recognisable curve shape, and
   * `curveValueOf`/`bezierNormalise` discards it right back to `[]` on the very next read — so the handle
   * moved on screen for exactly one frame and the drag, settle included, wrote nothing. Confirmed live,
   * driving the real plugin: dragging a fresh Hue handle left `hslHueCurve` at `[]` through the whole
   * gesture. This is the "dragging a handle does nothing" report, reproduced at the unit level for the
   * first time — every existing drag test in this file starts from a curve that already has real stored
   * points, which is why none of them caught it.
   */
  const source = [
    "// @UI_CONFIG_START",
    'var a = { bright: 98.2, dark: 9.6 }; // @group: bright:number=B|dark:number=D @label: Ends',
    'var c = []; // @curve @ends: a.bright..a.dark @range: 0..100 @label: L',
    "// @UI_CONFIG_END",
  ].join("\n");
  const schema = parser.parse(source);
  const container = document.createElement("div");
  renderer.buildForm(schema, container);
  renderer.attachListeners(container, schema, function () {});
  const wrap = container.querySelector(".config-ui-curve");
  assert.deepEqual(JSON.parse(wrap.getAttribute("data-curve-value")), [],
    "the fixture should start on the implied default, not an already-real curve");

  const svg = container.querySelector(".config-ui-curve__canvas");
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
  const handle = container.querySelector('[data-curve-index="0"]');
  assert.ok(handle, "an implied-Linear curve should still draw a handle to drag");
  svg.dispatch("pointerdown", { target: handle, clientX: 33, clientY: 67, pointerId: 1 });
  svg.dispatch("pointermove", { clientX: 60, clientY: 20, pointerId: 1 });
  svg.dispatch("pointerup", { clientX: 60, clientY: 20, pointerId: 1 });

  const after = JSON.parse(wrap.getAttribute("data-curve-value"));
  assert.equal(after.length, 4, "the drag did not turn the implied line into a real, stored curve");
  assert.ok(Math.abs(after[0] - 0.6) < 0.02, "the dragged handle's x did not move to where the pointer went");
});

test("a handle's own height can leave [0,1] only when the field opts in with overshoot", () => {
  /**
   * Márton: a Hue curve should be able to peak above (or dip below) both its own ends, the way a plain
   * CSS `cubic-bezier()` can — the height clamp had no mathematical reason to exist, only x does (it is
   * what keeps `bezierAt` single-valued). Off by default, because the same control is shared by Spacing,
   * Radius and Typography's own scale curves, where an overshoot would let an interior step exceed the
   * scale's own defined ends — a real behaviour change nobody asked for there.
   */
  function dragFarAboveThePlot(field) {
    const c = build(field, [0.5, 0.8, 0.5, 0.2]);
    const svg = c.svg;
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
    const handle = c.handles()[0];
    svg.dispatch("pointerdown", { target: handle, clientX: 50, clientY: 20, pointerId: 1 });
    svg.dispatch("pointermove", { clientX: 50, clientY: -80, pointerId: 1 });
    svg.dispatch("pointerup", { clientX: 50, clientY: -80, pointerId: 1 });
    return c.points()[1];
  }

  const withoutOvershoot = dragFarAboveThePlot({});
  assert.ok(withoutOvershoot <= 1, "without opting in, a handle must still clamp to the plot's own box");

  const withOvershoot = dragFarAboveThePlot({ overshoot: true });
  assert.ok(withOvershoot > 1, "opted in, the handle's real height should survive: " + withOvershoot);
});

test("the draggable points are the handles plus the middle anchor", () => {
  // Two-point: two handles, and the end anchors are drawn but fixed — a scale curve that started anywhere
  // but the start would not be a scale curve, so there is nothing to offer there.
  assert.equal(build({}, [0.37, 0, 0.63, 1]).handles().length, 2);

  // Three-point: four handles and the middle anchor, which is five things to drag. Only the middle anchor
  // is marked as one, so the two kinds of point are told apart by class rather than by counting.
  const three = build({}, B.bezierFromEase("quad", "outin", 1));
  assert.equal(three.handles().length, 5);
  const anchors = three.handles().filter((h) => h.classList.contains("config-ui-curve__handle--anchor"));
  assert.equal(anchors.length, 1);

  // Nothing to drag on a curve that is not one — which is *Original*, not merely empty. See the test
  // above for why a bare `[]` without `@allowOriginal` opens on the straight ramp instead.
  assert.equal(build({ allowOriginal: true }, []).handles().length, 0);
});

test("choosing a preset writes its coordinates", () => {
  const c = build({}, []);
  c.preset.value = "sine|outin";
  c.preset.dispatch("change");
  assert.deepEqual(c.points(), B.bezierFromEase("sine", "outin", 1));
  assert.equal(c.points().length, 10, "outin is still a three-point curve");
});

test("the dropdown reads the curve back, and says Custom once it is not a preset", () => {
  const c = build({}, []);
  c.preset.value = "quad|in";
  c.preset.dispatch("change");
  assert.equal(c.preset.value, "quad|in");

  // One nudge off. Nothing recorded the nudge — the caption is looked up from the numbers each redraw.
  const nudged = c.points().slice();
  nudged[0] += 0.05;
  const after = build({}, nudged);
  assert.equal(after.preset.value, "custom");
});

test("Custom is not offered in the list until the curve genuinely is one", () => {
  // Picking it while the points still match Linear changed nothing to pick — the label is derived
  // from the coordinates on every redraw, so it snapped straight back to Linear. That read as the
  // dropdown reverting the instant the option was chosen. Hiding the option until it is true removes
  // the choice that undoes itself; dragging a handle still switches to it automatically.
  const linear = build({}, B.bezierFromEase("linear", "none", 1));
  assert.equal(linear.preset.value, "linear|none");
  assert.equal(
    linear.wrap.querySelector('option[value="custom"]').hidden, true,
    "Custom is offered while the curve still matches Linear"
  );

  // One nudge off — the same "not a preset any more" edit the earlier test uses.
  const nudged = linear.points().slice();
  nudged[0] += 0.05;
  const edited = build({}, nudged);
  assert.equal(edited.preset.value, "custom", "a real edit did not switch the dropdown to Custom");
  assert.equal(
    edited.wrap.querySelector('option[value="custom"]').hidden, false,
    "Custom stayed hidden once the curve genuinely became one"
  );
});

test("Original is offered only when the script asks for it", () => {
  const plain = build({}, []);
  assert.equal(plain.wrap.querySelectorAll("option").filter((o) => o.getAttribute("value") === "original").length, 0);
  // With no Original to fall back to, an empty curve opens on the straight ramp — which is what it
  // generates — rather than on a state the list cannot name.
  assert.equal(plain.preset.value, "linear|none");

  const withOriginal = build({ allowOriginal: true }, []);
  assert.equal(withOriginal.preset.value, "original");
  withOriginal.preset.value = "cubic|out";
  withOriginal.preset.dispatch("change");
  assert.equal(withOriginal.points().length, 4);
  withOriginal.preset.value = "original";
  withOriginal.preset.dispatch("change");
  assert.deepEqual(withOriginal.points(), [], "back to no curve at all");
});

test("adding the middle point does not move the curve, and removing it is offered next", () => {
  const c = build({}, [0.37, 0, 0.63, 1]);
  const before = c.points();
  assert.match(c.toggle.textContent, /Add middle point/);

  c.toggle.dispatch("click");
  assert.equal(c.points().length, 10);
  assert.match(c.toggle.textContent, /Remove middle point/);
  for (let i = 0; i <= 50; i++) {
    const x = i / 50;
    assert.ok(Math.abs(B.bezierAt(before, x) - B.bezierAt(c.points(), x)) < 1e-4, `moved at x=${x}`);
  }

  c.toggle.dispatch("click");
  assert.equal(c.points().length, 4);
});

test("there is nothing to add a point to on an empty curve", () => {
  const c = build({ allowOriginal: true }, []);
  assert.equal(c.toggle.disabled, true);
  c.toggle.dispatch("click");
  assert.deepEqual(c.points(), []);
});

test("pasting coordinates sets the curve; junk marks the field and changes nothing", () => {
  const c = build({}, [0.37, 0, 0.63, 1]);

  c.text.value = "cubic-bezier(0.1, 0.2, 0.3, 0.4)";
  c.text.dispatch("change");
  assert.deepEqual(c.points(), [0.1, 0.2, 0.3, 0.4]);
  assert.equal(c.wrap.classList.contains("config-ui-curve--bad"), false);

  // A paste of the ten-number form, which is what this control prints for a two-segment curve.
  c.text.value = B.bezierFormat(B.bezierFromEase("circ", "outin", 1));
  c.text.dispatch("change");
  assert.equal(c.points().length, 10);

  const held = c.points();
  c.text.value = "not a curve";
  c.text.dispatch("change");
  assert.equal(c.wrap.classList.contains("config-ui-curve--bad"), true);
  assert.deepEqual(c.points(), held, "the last good curve is still live underneath");
});

test("the text field shows the curve, and a drag keeps it in step", () => {
  const c = build({}, []);
  c.preset.value = "quart|in";
  c.preset.dispatch("change");
  assert.equal(c.text.value, B.bezierFormat(B.bezierFromEase("quart", "in", 1)));
});

test("arrow keys move a handle, and shift moves it further", () => {
  const c = build({}, [0.4, 0.2, 0.6, 0.8]);
  const handle = c.handles()[0];
  c.svg.dispatch("keydown", { key: "ArrowRight", target: handle, bubbles: true });
  assert.deepEqual(c.points(), [0.41, 0.2, 0.6, 0.8]);
  c.svg.dispatch("keydown", { key: "ArrowUp", shiftKey: true, target: c.handles()[0], bubbles: true });
  assert.deepEqual(c.points(), [0.41, 0.3, 0.6, 0.8]);
  // A key that is not a direction is left alone, so typing in the panel does not nudge a focused handle.
  c.svg.dispatch("keydown", { key: "a", target: c.handles()[0], bubbles: true });
  assert.deepEqual(c.points(), [0.41, 0.3, 0.6, 0.8]);
});

test("a handle cannot be pushed past the anchor that bounds it", () => {
  const c = build({}, B.bezierWithMiddle([0.4, 0.2, 0.6, 0.8], 0.5));
  const middleX = c.points()[4];
  const handle = c.handles()[0];
  for (let i = 0; i < 200; i++) {
    c.svg.dispatch("keydown", { key: "ArrowRight", target: c.handles()[0], bubbles: true });
  }
  assert.ok(c.points()[0] <= middleX + 1e-9, "the lower handle stopped at the middle anchor");
  assert.ok(handle, "and there was a handle to move");
});

test("every change announces itself so the panel writes the config", () => {
  const c = build({}, [0.37, 0, 0.63, 1]);
  let heard = 0;
  c.wrap.addEventListener("change", () => { heard += 1; });

  c.preset.value = "cubic|in";
  c.preset.dispatch("change");
  c.toggle.dispatch("click");
  c.text.value = "0.2, 0.1, 0.8, 0.9";
  c.text.dispatch("change");
  c.svg.dispatch("keydown", { key: "ArrowUp", target: c.handles()[0], bubbles: true });

  assert.equal(heard, 4, "each edit fired exactly one change");
});

test("building it does not fire a change — that would write the config on load", () => {
  // The panel serialises the whole block on every change, so an announcement during render would rewrite
  // somebody's config the moment they opened the script.
  const wrap = renderer.buildCurveControl({}, [0.37, 0, 0.63, 1]);
  let heard = 0;
  wrap.addEventListener("change", () => { heard += 1; });
  assert.equal(heard, 0);
});

test("with no bezier library on the window it degrades instead of throwing", () => {
  // The inlined block going missing should cost the drawing, not the panel.
  const saved = global.window.CodeFigBezier;
  delete global.window.CodeFigBezier;
  try {
    const wrap = renderer.buildCurveControl({}, [0.37, 0, 0.63, 1]);
    assert.deepEqual(JSON.parse(wrap.getAttribute("data-curve-value")), [0.37, 0, 0.63, 1]);
  } finally {
    global.window.CodeFigBezier = saved;
  }
});

// ---------------------------------------------------------------------------
// The block round trip.
//
// The `@CONFIG_START` block is the human format — comments, key order and all — and the panel re-serialises
// the whole of it on every keystroke in any field. So an annotation the parser reads but the serializer
// forgets does not corrupt the curve; it corrupts the *next* line somebody types in, in a file they read.
// ---------------------------------------------------------------------------

const parser = require("../src/config-ui/parser.js");

test("@curve survives a round trip with nothing edited", () => {
  const block = [
    "var easing = [0.37, 0, 0.63, 1]; // @curve @label: Curve @helper: note here",
    "var maybe = []; // @curve @allowOriginal @label: Maybe",
    "var modes = [",
    '  { name: "Value", lower: [0.1, 0, 0.9, 1] }',
    "]; // @rows: name:text=Mode|lower:curve(original)=Lower curve|upper:curve=Upper curve @tabs @label: Modes",
  ].join("\n");
  assert.equal(parser.serialize(parser.parse(block), {}), block, "an untouched block is rewritten verbatim");
});

test("the parser claims a curve rather than leaving it read-only", () => {
  const schema = parser.parse(
    [
      "var easing = [0.37, 0, 0.63, 1]; // @curve @label: Curve",
      "var maybe = []; // @curve @allowOriginal @label: Maybe",
      "var loose = [1, 2, 3]; // @label: Loose",
      "var objects = [{ a: 1 }]; // @label: Objects",
    ].join("\n")
  );
  const byName = {};
  schema.rows.filter((r) => r.type === "field").forEach((r) => { byName[r.name] = r; });
  assert.equal(byName.easing.inputType, "curve");
  assert.equal(!!byName.easing.allowOriginal, false);
  assert.equal(byName.maybe.inputType, "curve");
  assert.equal(byName.maybe.allowOriginal, true);
  // **`@curve` is the opt-in, and it had to not disturb what an unmarked array already does.** Four bare
  // numbers are still a comma list — which is why the annotation exists rather than the parser sniffing
  // arrays of length four — and a list of objects is still read-only.
  assert.equal(byName.loose.inputType, "list");
  assert.equal(byName.objects.inputType, "unsupported");
});

test("a curve column keeps its type and its Original flag through the spec", () => {
  const schema = parser.parse(
    [
      "var modes = [",
      '  { name: "Value", lower: [], upper: [0.1, 0, 0.9, 1] }',
      "]; // @rows: name:text=Mode|lower:curve(original)=Lower curve|upper:curve=Upper curve @label: Modes",
    ].join("\n")
  );
  const rows = schema.rows.filter((r) => r.type === "field")[0];
  const cols = {};
  rows.columns.forEach((c) => { cols[c.key] = c; });
  assert.equal(cols.lower.type, "curve");
  assert.equal(cols.lower.allowOriginal, true);
  assert.equal(cols.upper.type, "curve");
  assert.equal(!!cols.upper.allowOriginal, false);
});

test("an edited curve is written back, and the annotations are not duplicated", () => {
  const block = [
    "var easing = [0.37, 0, 0.63, 1]; // @curve @label: Curve @helper: note here",
    "var maybe = []; // @curve @allowOriginal @label: Maybe",
  ].join("\n");
  const out = parser.serialize(parser.parse(block), {
    easing: [0.2, 0.1, 0.8, 0.9],
    maybe: [0.5, 0, 0.5, 1],
  });
  assert.match(out, /var easing = \[0\.2, 0\.1, 0\.8, 0\.9\]; \/\/ @curve @label: Curve @helper: note here$/m);
  assert.match(out, /var maybe = \[0\.5, 0, 0\.5, 1\]; \/\/ @curve @allowOriginal @label: Maybe$/m);
  // `@curve` was landing in `unknownAnnotations` as well as being emitted, so an edited line grew a second
  // copy of it every time. Nothing about the curve looked wrong; the comment did.
  assert.equal((out.match(/@curve/g) || []).length, 2);
  assert.equal((out.match(/@allowOriginal/g) || []).length, 1);
});

test("an untouched curve collects as [], and a chosen one collects its coordinates", () => {
  // **The panel re-serialises the whole block on every change**, so a control showing a default writes that
  // default — and a curve control without `@allowOriginal` *opens* on the straight ramp. Every mode in every
  // foundation script therefore gained `curve: [0.333333, 0.333333, 0.666667, 0.666667]` the first time
  // anyone edited anything else. Six decimals nobody typed, in the format this project treats as the thing a
  // person reads and pastes. `bezierAt([], t)` is `t`, so the tidy spelling and the handles are the same
  // curve and folding one onto the other loses nothing.
  const schema = parser.parse(
    [
      "var modes = [",
      '  { name: "Value", curve: [] }',
      "]; // @rows: name:text=Mode|curve:curve=Curve @label: Modes",
    ].join("\n")
  );
  const field = schema.rows.filter((r) => r.type === "field")[0];
  const container = document.createElement("div");
  renderer.buildForm(schema, container);
  const wrap = container.querySelector("[data-rows-field]");

  // Untouched: the control draws the straight ramp and the config keeps `[]`.
  const cell = container.querySelector('[data-row-field="modes.curve"]')
    || container.querySelector('[data-row-field="curve"]');
  assert.ok(cell, "the curve cell rendered");
  assert.deepEqual(JSON.parse(cell.getAttribute("data-curve-value")), []);
  assert.deepEqual(renderer.collectRows(wrap, field, null)[0].curve, []);

  // Bent: written out in full.
  cell.setAttribute("data-curve-value", JSON.stringify([0.42, 0, 0.58, 0.35]));
  assert.deepEqual(renderer.collectRows(wrap, field, null)[0].curve, [0.42, 0, 0.58, 0.35]);

  // **A deliberately straight curve is not the same as no curve.** It is what *Custom* stores on a line
  // nobody has bent yet, and folding it back to `[]` would take the handles away again.
  cell.setAttribute("data-curve-value", JSON.stringify(B.bezierFromEase("linear", "none", 1)));
  assert.deepEqual(
    renderer.collectRows(wrap, field, null)[0].curve, B.bezierFromEase("linear", "none", 1)
  );
});

// ---------------------------------------------------------------------------
// Growth mode — the open-ended editor
//
// Spacing, radius and typography do not know their largest value, so the curve sits on a **log** y axis
// where a constant ratio is a straight line and its slope is the growth. One control holds both: the
// handle drags the growth, the dropdown picks the shape, and the field below carries the pair so a scale
// can be copied out and pasted back.
// ---------------------------------------------------------------------------

function growthForm(rowValues, opts) {
  const spec = (opts && opts.spec) || "name:text=Mode|curve:curve(growth:ratio)=Scale";
  const schema = parser.parse(
    [
      (opts && opts.before) || "",
      "var modes = [",
      "  " + JSON.stringify(rowValues),
      "]; // @rows: " + spec + " @tabs @label: Modes",
    ].filter(Boolean).join("\n")
  );
  const container = document.createElement("div");
  renderer.buildForm(schema, container);
  renderer.attachListeners(container, schema, () => {});
  const curve = container.querySelector("[data-curve-value]");
  const field = schema.rows.filter((r) => r.type === "field" && r.inputType === "rows")[0];
  return {
    container, schema, curve, field,
    rowsWrap: container.querySelector("[data-rows-field]"),
    growth: () => curve.getAttribute("data-curve-growth-value"),
    growthDot: () => curve.querySelector("[data-curve-growth]"),
    preset: curve.querySelector(".config-ui-curve__preset"),
    text: () => curve.querySelector(".config-ui-curve__text"),
    points: () => JSON.parse(curve.getAttribute("data-curve-value")),
    handles: () => curve.querySelectorAll("[data-curve-index]"),
    collect: () => renderer.collectRows(container.querySelector("[data-rows-field]"), field, null)[0],
  };
}

test("the growth handle sits where the ratio puts it, on a log axis", () => {
  // `log(ratio) / log(2.5)` of the way up. A constant ratio is a straight line on this axis, which is the
  // whole reason it is logarithmic — a modular scale should not look bent.
  for (const [ratio, want] of [[1.5, 0.4425], [1.25, 0.2435], [2.5, 1], [1.001, 0]]) {
    const f = growthForm({ name: "V", ratio, curve: [] });
    const cy = Number(f.growthDot().getAttribute("cy"));
    assert.ok(Math.abs((1 - cy / 100) - want) < 0.01, `ratio ${ratio} sat at ${(1 - cy / 100).toFixed(3)}`);
  }
});

test("one control, two config keys — the growth has no field of its own", () => {
  // A growth field beside a curve field was two inputs for one idea, and the coordinate field had to carry
  // both anyway or copying it would not reproduce the scale. So the control holds the growth and writes it
  // out under its own name, and the block still reads `ratio: 1.5` beside `curve: []`.
  const f = growthForm({ name: "V", ratio: 1.5, curve: [] });
  assert.equal(f.container.querySelector('[data-row-field="ratio"]'), null, "no separate growth cell");
  const collected = f.collect();
  assert.equal(collected.ratio, 1.5);
  assert.deepEqual(collected.curve, []);
});

test("a mode with no growth yet opens on a sensible default", () => {
  const f = growthForm({ name: "V", curve: [] });
  assert.equal(f.growth(), "1.5");
  assert.equal(f.collect().ratio, 1.5);
});

test("dragging the growth handle changes the growth and not the curve", () => {
  const f = growthForm({ name: "V", ratio: 1.5, curve: [] });
  const before = f.points();
  f.curve.querySelector(".config-ui-curve__canvas")
    .dispatch("keydown", { key: "ArrowUp", target: f.growthDot(), bubbles: true });
  assert.equal(f.growth(), "1.51");
  assert.deepEqual(f.points(), before, "the curve itself did not change");
  assert.equal(f.collect().ratio, 1.51);
});

test("the dropdown is the shape control — Linear means no shape", () => {
  const f = growthForm({ name: "V", ratio: 1.5, curve: [] });
  assert.equal(f.preset.value, "linear|none");
  assert.equal(f.handles().length, 0, "Linear shows no handles");
  assert.equal(f.curve.querySelector(".config-ui-curve__toggle--shape"), null, "the button is gone");
  assert.equal(f.curve.querySelector(".config-ui-curve__toggle").style.display, "none");

  f.preset.value = "quad|in";
  f.preset.dispatch("change");
  assert.equal(f.handles().length, 2, "a shape reveals its handles");
  assert.equal(f.curve.querySelector(".config-ui-curve__toggle").style.display, "");

  f.preset.value = "linear|none";
  f.preset.dispatch("change");
  assert.equal(f.handles().length, 0);
  assert.deepEqual(f.collect().curve, []);
});

test("a curve that is already bent shows its shape without being asked", () => {
  const f = growthForm({ name: "V", ratio: 1.5, curve: [0.42, 0, 0.58, 0.35] });
  assert.equal(f.handles().length, 2);
  assert.equal(f.preset.value, "custom");
});

test("a shape handle is dragged in the unit square, not on the lifted canvas", () => {
  // The drawing is scaled by the growth, so a handle's screen position is `y × lift`. Reading it back
  // without dividing the lift out would fling the handle off the top of a slow-growing scale.
  const f = growthForm({ name: "V", ratio: 1.5, curve: [0.42, 0, 0.58, 0.35] });
  const lift = Math.log(1.5) / Math.log(2.5);
  const cy2 = Number(f.handles()[1].getAttribute("cy"));
  assert.ok(Math.abs((1 - cy2 / 100) - 0.35 * lift) < 1e-6, "handle drawn at y × lift");
});

test("the field always carries the whole scale, straight or bent", () => {
  const flat = growthForm({ name: "V", ratio: 1.5, curve: [] });
  assert.equal(flat.text().value, "1.5 cubic-bezier(0.333, 0.333, 0.667, 0.667)");
  const bent = growthForm({ name: "V", ratio: 1.25, curve: [0.42, 0, 0.58, 0.35] });
  assert.equal(bent.text().value, "1.25 cubic-bezier(0.42, 0, 0.58, 0.35)");
});

test("pasting the field back reproduces the scale it came from", () => {
  const source = growthForm({ name: "V", ratio: 1.25, curve: [0.42, 0, 0.58, 0.35] });
  const copied = source.text().value;
  const target = growthForm({ name: "V", ratio: 1.5, curve: [] });
  target.text().value = copied;
  target.text().dispatch("change", { bubbles: true });
  assert.equal(target.growth(), "1.25");
  assert.deepEqual(target.points(), [0.42, 0, 0.58, 0.35]);
  assert.equal(target.text().value, copied, "and it prints back the same thing");
});

test("the field takes a growth alone, a curve alone, or a three-point curve", () => {
  const f = growthForm({ name: "V", ratio: 1.5, curve: [] });
  const type = (v) => { f.text().value = v; f.text().dispatch("change", { bubbles: true }); };

  type("1.8");
  assert.equal(f.growth(), "1.8");
  assert.deepEqual(f.collect().curve, [], "a growth alone leaves the shape");

  type("cubic-bezier(0.1, 0.2, 0.3, 0.4)");
  assert.equal(f.growth(), "1.8", "a shape alone leaves the growth");
  assert.deepEqual(f.points(), [0.1, 0.2, 0.3, 0.4]);

  // The three-point form prints as two calls with the middle anchor loose between them. Splitting the text
  // by position ate that anchor and refused the control's own output.
  const three = B.bezierFormat(B.bezierFromEase("circ", "outin", 1));
  type("1.4 " + three);
  assert.equal(f.growth(), "1.4");
  assert.equal(f.points().length, 10);

  const held = f.points();
  type("1.5 cubic-bezer(nope)");
  assert.equal(f.curve.classList.contains("config-ui-curve--bad"), true);
  assert.deepEqual(f.points(), held, "a typo is refused whole, not applied by halves");
  assert.equal(f.growth(), "1.4", "including the part that would have parsed");
});

test("typing a growth past the drag range is honoured, not pinned", () => {
  const f = growthForm({ name: "V", ratio: 1.5, curve: [] });
  f.text().value = "4";
  f.text().dispatch("change", { bubbles: true });
  assert.equal(f.growth(), "4");
  assert.equal(Number(f.growthDot().getAttribute("cy")), 0, "and the handle sits at the top");
});

test("typing into the field is not clobbered by the form's own refresh", () => {
  const f = growthForm({ name: "V", ratio: 1.5, curve: [] });
  f.text().value = "1.25";
  f.text().dispatch("input", { bubbles: true });
  assert.equal(f.text().value, "1.25", "the refresh overwrote the field mid-edit");
  f.text().dispatch("change", { bubbles: true });
  assert.equal(f.growth(), "1.25");
  assert.match(f.text().value, /^1\.25 cubic-bezier/, "and it normalises once the edit lands");
});

test("grabbing a handle takes focus, so the label's tooltip lets go", () => {
  const f = growthForm({ name: "V", ratio: 1.5, curve: [0.42, 0, 0.58, 0.35] });
  const handle = f.handles()[0];
  f.curve.querySelector(".config-ui-curve__canvas")
    .dispatch("pointerdown", { target: handle, pointerId: 1 });
  assert.equal(handle._focused, true, "the handle did not take focus");
});

test("hovering the growth handle shows the ratio and generated token values", () => {
  // The end-handle height is the growth ratio on a log axis — that is the number the tip leads with.
  // Token sizes come from Preview (stamped onto the chart), numbers only.
  const f = growthForm({ name: "V", ratio: 1.5, curve: [] });
  f.curve.setAttribute("data-curve-tip-scale", "0, 2, 4, 8, 16, 24, 40, 80, 120");
  const svg = f.curve.querySelector(".config-ui-curve__canvas");
  const dot = f.growthDot();
  dot._rect = { left: 90, top: 40, width: 10, height: 10, right: 100, bottom: 50 };
  svg.dispatch("pointermove", { target: dot });
  const tip = document.body.querySelector(".config-ui-curve-tip");
  assert.ok(tip && tip.hidden !== true && tip.hidden !== "true", "tip should be visible");
  assert.equal(tip.querySelector(".config-ui-curve-tip__value").textContent, "1.5");
  assert.equal(
    tip.querySelector(".config-ui-curve-tip__scale").textContent,
    "0, 2, 4, 8, 16, 24, 40, 80, 120"
  );
  // Right of the handle, vertically centred: handle right 100, gap 8 → left 108;
  // handle mid-y 45, tip height 20 → top 35.
  tip._rect = { left: 0, top: 0, width: 40, height: 20, right: 40, bottom: 20 };
  svg.dispatch("pointermove", { target: dot });
  assert.equal(tip.style.left, "108px");
  assert.equal(tip.style.top, "35px");
});

test("dragging the growth handle keeps the tip on the live ratio", () => {
  const f = growthForm({ name: "V", ratio: 1.5, curve: [] });
  f.curve.setAttribute("data-curve-tip-scale", "4, 6, 9");
  const svg = f.curve.querySelector(".config-ui-curve__canvas");
  const dot = f.growthDot();
  dot._rect = { left: 90, top: 40, width: 10, height: 10, right: 100, bottom: 50 };
  svg.dispatch("pointerdown", { target: dot, pointerId: 1 });
  svg.dispatch("keydown", { key: "ArrowUp", target: dot, bubbles: true });
  const tip = document.body.querySelector(".config-ui-curve-tip");
  assert.ok(tip && tip.hidden !== true && tip.hidden !== "true");
  assert.equal(tip.querySelector(".config-ui-curve-tip__value").textContent, f.growth());
  assert.equal(tip.querySelector(".config-ui-curve-tip__scale").textContent, "4, 6, 9");
});

test("a cell carrying an \u24D8 is not a label, or the whole cell clicks the explanation", () => {
  // **A `<button>` is a labelable element.** A `<label>` with no `for` hands its clicks to the first
  // labelable descendant, and the caption comes first — so an \u24D8 became the cell's control and clicking
  // anywhere in the cell fired a synthetic click on it, pinning the tooltip.
  const withInfo = growthForm({ name: "V", ratio: 1.5, curve: [] }, {
    spec: 'name:text=Mode|curve:curve(growth:ratio)=Scale @helper: how fast it grows',
  });
  const cell = withInfo.curve.closest(".config-ui-rows-cell");
  assert.equal(cell.tagName, "div", "a cell with an info button must not be a label");
  assert.ok(cell.querySelector(".config-ui-info"), "and it does have one");
  assert.equal(growthForm({ name: "V", ratio: 1.5, curve: [] })
    .curve.closest(".config-ui-rows-cell").tagName, "div");
});

test("choosing Custom on a straight line gives you handles to drag", () => {
  // Picking *Custom* used to do nothing: the shape was derived from "is the curve bent", a straight line
  // is not bent, so the choice produced no handles and the only way to start shaping was to pick a preset
  // you did not want. Storing the straight coordinates is what makes it a shape.
  const f = growthForm({ name: "V", ratio: 1.5, curve: [] });
  assert.equal(f.preset.value, "linear|none");
  assert.equal(f.handles().length, 0);

  f.preset.value = "custom";
  f.preset.dispatch("change");
  assert.equal(f.handles().length, 2, "Custom reveals the handles");
  assert.deepEqual(f.collect().curve, B.bezierFromEase("linear", "none", 1), "and it persists");
  // Still a straight line — choosing to shape it does not bend it for you.
  for (let i = 0; i <= 10; i++) {
    assert.ok(Math.abs(B.bezierAt(f.points(), i / 10) - i / 10) < 1e-5);
  }

  f.preset.value = "linear|none";
  f.preset.dispatch("change");
  assert.equal(f.handles().length, 0, "and Linear takes them away again");
  assert.deepEqual(f.collect().curve, []);
});

/**
 * **A curve on a value axis.** `@ends` names the two fields it runs between and `@range` the channel's own
 * limits, and those two turn the y axis from a unit square into the quantity — which is the whole feature.
 *
 * These build the control inside a form, because that is the only place it works: `buildCurveControl` runs
 * before its wrapper is in the tree, so the ends are unfindable at first draw and the axis appears on the
 * redraw `attachListeners` triggers. A test that built the control alone would assert on the state the
 * plugin never shows anyone.
 */
function axisForm(curve) {
  const src = [
    "// @UI_CONFIG_START",
    "var ladder = { bright: 98, dark: 19 }; // @group: bright:number=Bright|dark:number=Dark @label: Ends",
    "var lc = " + JSON.stringify(curve || [0.4, 0, 0.7, 0.55]) +
      "; // @curve @ends: ladder.bright..ladder.dark @range: 0..100 @label: Lightness",
    "// @UI_CONFIG_END",
  ].join("\n");
  const schema = parser.parse(src);
  const container = document.createElement("div");
  renderer.buildForm(schema, container);
  renderer.attachListeners(container, schema, function () {});
  return {
    container,
    schema,
    wrap: container.querySelector(".config-ui-curve"),
    bright: container.querySelector('[data-row-field="ladder.bright"]'),
    dark: container.querySelector('[data-row-field="ladder.dark"]'),
    ticks: () => container.querySelectorAll(".config-ui-curve__tick").map((t) => t.textContent),
    ends: () => container.querySelectorAll("[data-curve-end]"),
  };
}

test("the plot is measured in pixels, so a handle is round and not an ellipse", () => {
  // A 100x100 viewBox stretched with `preserveAspectRatio: none` draws every circle as an ellipse the
  // moment the chart is not square — and this one is roughly four to one on purpose. The shim reports no
  // size, so what is pinned here is that the geometry *reads* the measurement rather than assuming 100.
  const form = axisForm();
  const svg = form.wrap.querySelector(".config-ui-curve__canvas");
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 200 });
  form.wrap.dispatchEvent(new Event("config-ui-curve-refresh"));
  assert.equal(svg.getAttribute("viewBox"), "0 0 400 200");

  // The far end is at x = the measured width, not at 100.
  const to = form.container.querySelector('[data-curve-end="to"]');
  assert.equal(Math.round(+to.getAttribute("cx")), 400);
});

test("the zoom is a column of its own, and the curve cannot move it", () => {
  const form = axisForm();
  const mark = form.container.querySelector(".config-ui-curve__zoom-mark");
  assert.ok(mark, "no zoom marker");
  assert.ok(form.container.querySelector(".config-ui-curve__range"), "no range column");
  const before = mark.style.top;

  // Drag the dark end a long way. The window must not follow it.
  const svg = form.wrap.querySelector(".config-ui-curve__canvas");
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
  svg.dispatch("pointerdown", { target: form.ends()[1], clientX: 100, clientY: 100, pointerId: 1 });
  svg.dispatch("pointermove", { clientX: 100, clientY: 20, pointerId: 1 });
  svg.dispatch("pointerup", { clientX: 100, clientY: 20, pointerId: 1 });
  assert.equal(mark.style.top, before, "dragging an end moved the zoom");

  // The buttons do move it, and they are the only other thing that does.
  form.container.querySelector('[data-curve-zoom="in"]').dispatch("click", { bubbles: true });
  assert.notEqual(mark.style.top, before, "the zoom button did nothing");
  assert.equal(form.wrap.getAttribute("data-curve-value"), form.wrap.getAttribute("data-curve-value"));
});

test("a drag stops at the edge of the window instead of pushing the ramp out of it", () => {
  // Holding the pointer past the top edge used to keep raising the value, and the curve walked out of the
  // chart. The clamp is to the *window*, not only to the channel.
  const form = axisForm();
  const svg = form.wrap.querySelector(".config-ui-curve__canvas");
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
  svg.dispatch("pointerdown", { target: form.ends()[1], clientX: 100, clientY: 50, pointerId: 1 });
  svg.dispatch("pointermove", { clientX: 100, clientY: -900, pointerId: 1 });
  svg.dispatch("pointerup", { clientX: 100, clientY: -900, pointerId: 1 });

  const to = form.container.querySelector('[data-curve-end="to"]');
  const cy = +to.getAttribute("cy");
  assert.ok(cy >= -1 && cy <= 101, "the end left the plot, at cy " + cy);
});

test("@ends turns the y axis into the quantity, labelled at round values", () => {
  const form = axisForm();
  // The window defaults to the two ends with a tenth of their span for air, clamped to the channel — so
  // 19..98 of 0..100 shows 11.1 to 100, and the ticks land on 25s rather than on percentages of nothing.
  assert.deepEqual(form.ticks(), ["25", "50", "75", "100"]);
  assert.equal(form.ends().length, 2, "both ends should be draggable squares");
});

test("without @ends there is no axis, no ticks and no rail", () => {
  // The scale editors in Spacing, Radius and Typography are shapes in a unit square. Nothing about them
  // changes, which is the thing most easily broken by adding a mode to a shared control.
  const plain = build({}, [0.4, 0, 0.7, 0.55]);
  assert.equal(plain.wrap.querySelectorAll(".config-ui-curve__tick").length, 0);
  assert.equal(plain.wrap.querySelectorAll("[data-curve-end]").length, 0);
});

test("dragging an end writes the field it is bound to, and tells the form", () => {
  const form = axisForm();
  let heard = 0;
  form.bright.addEventListener("input", function () { heard++; });

  // Straight down the middle of the plot: the window is 11.1..100, so half way is ~55.6.
  const svg = form.wrap.querySelector(".config-ui-curve__canvas");
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
  svg.dispatch("pointerdown", { target: form.ends()[0], clientX: 0, clientY: 0, pointerId: 1 });
  svg.dispatch("pointermove", { clientX: 0, clientY: 50, pointerId: 1 });
  svg.dispatch("pointerup", { clientX: 0, clientY: 50, pointerId: 1 });

  const landed = parseFloat(form.bright.value, 10);
  assert.ok(Math.abs(landed - 55.6) < 1, "bright should follow the pointer, got " + form.bright.value);
  assert.ok(heard > 0, "the field it wrote has to fire, or nothing downstream of it updates");
});

test("an end is clamped to @range rather than following the pointer out of the channel", () => {
  const form = axisForm();
  const svg = form.wrap.querySelector(".config-ui-curve__canvas");
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
  // Well above the top of the plot. Lightness has no 140%.
  svg.dispatch("pointerdown", { target: form.ends()[0], clientX: 0, clientY: 0, pointerId: 1 });
  svg.dispatch("pointermove", { clientX: 0, clientY: -400, pointerId: 1 });
  svg.dispatch("pointerup", { clientX: 0, clientY: -400, pointerId: 1 });
  assert.equal(parseFloat(form.bright.value, 10), 100);
});

test("the curve's own shape is untouched by moving an end", () => {
  // The shape is stored in the curve's 0..1 and the ends are the span it is stretched over. Moving one
  // restretches the same shape, which is what a palette does when you make it darker — and it is why the
  // two are separate values rather than one set of absolute coordinates.
  const form = axisForm();
  const before = form.wrap.getAttribute("data-curve-value");
  const svg = form.wrap.querySelector(".config-ui-curve__canvas");
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
  svg.dispatch("pointerdown", { target: form.ends()[1], clientX: 100, clientY: 100, pointerId: 1 });
  svg.dispatch("pointermove", { clientX: 100, clientY: 70, pointerId: 1 });
  svg.dispatch("pointerup", { clientX: 100, clientY: 70, pointerId: 1 });
  assert.equal(form.wrap.getAttribute("data-curve-value"), before);
});


test("the curve is clipped to its plot, and the handles are not", () => {
  // **A window is a slice, so the ramp runs off both ends of it.** Unclipped, the line was drawn over the
  // coordinate field and over the next curve down the form — `overflow: visible` is there so handles can
  // sit on the corners, and it let the whole line out with them.
  const form = axisForm();
  const groups = form.container.querySelectorAll("g");
  const clips = groups.map((g) => g.getAttribute("clip-path"));
  assert.equal(clips.length, 2, "the ramp and the grips are two groups, clipped differently");
  assert.ok(/^url\(#config-ui-curve-clip-\d+\)$/.test(clips[0]), "the ramp is not clipped to the plot");
  assert.ok(/^url\(#config-ui-curve-clip-\d+-grip\)$/.test(clips[1]),
    "the grips are not clipped to the padded frame");

  // The ramp is inside the tight group; the grips inside the padded one, so an end on the boundary is whole.
  assert.ok(groups[0].querySelector(".config-ui-curve__path"), "the ramp is not in the clipped group");
  assert.equal(form.ends().length, 2);
  form.ends().forEach((end) => {
    assert.ok(groups[1].contains(end), "an end on the boundary must be in the padded group, not the tight one");
  });
  assert.equal(form.container.querySelectorAll("clipPath").length, 2);

  // A shape editor has no window, so nothing can leave the box and nothing needs cutting off.
  const plain = build({}, [0.4, 0, 0.7, 0.55]);
  assert.equal(plain.wrap.querySelectorAll("clipPath").length, 0);
  assert.equal(plain.wrap.querySelectorAll("g").length, 0);
  assert.equal(plain.wrap.querySelector(".config-ui-curve__path").getAttribute("clip-path"), null);
});

test("the colour bar is drawn from the tokens, at the values the curve puts them at", () => {
  // **A picture of this ramp, not of the channel.** The alternative was computing a colour from a value,
  // which needs `@oklch.js` inlined into the UI — a second copy of the colour maths, which is the one thing
  // this repo has a standing rule against — and needs the hue and saturation beside it to mean anything.
  const hexes = ["#FAFAFA", "#D0CFD6", "#A3A1AF", "#69677A", "#2B2A32", "#0A090B"];
  renderer.setCurveRamps({ lc: hexes });
  const form = axisForm();
  const fill = form.container.querySelector(".config-ui-curve__range-fill");
  assert.equal(fill.getAttribute("data-shown"), "true");

  const stops = fill.style.background.replace(/^linear-gradient\(to bottom, |\)$/g, "").split(", ");
  // Not one-per-token any more: the window opens with 10% air past the outermost tokens (`axisView`'s
  // own comment), so the strip now also carries the two boundary stops that crop it to that window —
  // duplicating the extreme tokens' colours at the very top and bottom rather than dropping them.
  assert.ok(stops.length >= hexes.length, "fewer stops than tokens: " + stops.length);
  hexes.forEach((hex) => {
    assert.ok(stops.some((s) => s.indexOf(hex) === 0), hex + " is not on the bar");
  });

  // A gradient's stops have to ascend, whichever way the ramp runs.
  const at = stops.map((s) => parseFloat(s.split(" ")[1], 10));
  at.forEach((v, i) => {
    assert.ok(v >= 0 && v <= 100, "a stop is off the bar at " + v + "%");
    if (i) assert.ok(v >= at[i - 1], "stops are out of order: " + at.join(", "));
  });

  renderer.setCurveRamps({});
});

test("a zoomed window crops the strip to itself, interpolating the colour exactly at each edge", () => {
  // Clamping used to keep every token's colour on the strip somewhere, compressed toward the edges once
  // zoomed — the "wrong" behaviour in Márton's reference images. Cropped, a token outside the window is
  // gone, and the edge is the blend between whichever two tokens bracket it, not either token verbatim.
  const hexes = ["#FAFAFA", "#D0CFD6", "#A3A1AF", "#69677A", "#2B2A32", "#0A090B"];
  renderer.setCurveRamps({ lc: hexes });
  // `[]` is the identity curve, so the six tokens land at exactly 98, 82.2, 66.4, 50.6, 34.8, 19 on the
  // 98..19 ends below — no curve-shape guesswork about which land inside a 40..70 window.
  const form = axisForm([]);
  form.wrap.setAttribute("data-curve-view", "40,70");
  form.wrap.dispatchEvent(new Event("config-ui-curve-refresh"));

  const fill = form.container.querySelector(".config-ui-curve__range-fill");
  const stops = fill.style.background.replace(/^linear-gradient\(to bottom, |\)$/g, "").split(", ");

  // The tokens nearest the two ends (~98 and ~19) are well outside 40..70 and must be gone.
  assert.ok(!stops.some((s) => s.indexOf(hexes[0]) === 0), hexes[0] + " should have been cropped out");
  assert.ok(!stops.some((s) => s.indexOf(hexes[5]) === 0), hexes[5] + " should have been cropped out");
  // The tokens inside the window survive.
  assert.ok(stops.some((s) => s.indexOf(hexes[2]) === 0), hexes[2] + " should still be on the bar");
  assert.ok(stops.some((s) => s.indexOf(hexes[3]) === 0), hexes[3] + " should still be on the bar");

  // The window's own edges are exactly the strip's ends, in a colour that is a real blend rather than
  // either neighbour verbatim.
  const first = stops[0].split(" ");
  const last = stops[stops.length - 1].split(" ");
  assert.equal(parseFloat(first[1], 10), 0, "the window's high edge is not at the top of the strip");
  assert.equal(parseFloat(last[1], 10), 100, "the window's low edge is not at the bottom of the strip");
  assert.notEqual(first[0], hexes[1]);
  assert.notEqual(first[0], hexes[2]);
  assert.notEqual(last[0], hexes[3]);
  assert.notEqual(last[0], hexes[4]);

  renderer.setCurveRamps({});
});

test("a curve with no published colours has no bar rather than an empty one", () => {
  renderer.setCurveRamps({});
  const form = axisForm();
  assert.equal(
    form.container.querySelector(".config-ui-curve__range-fill").getAttribute("data-shown"), "false");
});

/** A curve with its two ends declared as real cells, the way the Colors block declares them. */
function anchoredForm() {
  const withMiddle = B.bezierWithMiddle([0.42, 0.16, 0.68, 0.52]);
  const source = [
    '// @UI_CONFIG_START',
    'var modes = [{ name: "G", bright: { lightness: 2 }, dark: { lightness: 96 }, curve: ' +
      JSON.stringify(withMiddle) + ' }]; // @rows: name:text=Mode|#>Lightness|' +
      'curve:curve(ends:bright.lightness..dark.lightness, range:0..100)=Lightness curve|' +
      'bright:{lightness:number=Bright}=Bright|dark:{lightness:number=Dark}=Dark @blocks @label: Modes',
    '// @UI_CONFIG_END',
  ].join('\n');
  const schema = parser.parse(source);
  const container = document.createElement('div');
  renderer.buildForm(schema, container);
  renderer.attachListeners(container, schema, function () {});
  return {
    container,
    wrap: container.querySelector('.config-ui-curve'),
    row: container.querySelector('.config-ui-curve__anchors'),
    middle: container.querySelector('[data-curve-middle]'),
    points: () => JSON.parse(container.querySelector('.config-ui-curve').getAttribute('data-curve-value')),
  };
}

test('the two end cells move under the chart, in order, and stay the same cells', () => {
  // **Adopted, not rebuilt.** They are cells the row declares, with a caption and a key and a place in
  // `collectRows` — a second pair built by the curve would be two controls for one value, which is the
  // mistake this panel has already made twice.
  const form = anchoredForm();
  assert.deepEqual(
    form.row.querySelectorAll('input').map((i) => i.getAttribute('data-row-field') || '(middle)'),
    ['bright.lightness', '(middle)', 'dark.lightness']);

  // Still findable by the collector, which is the whole reason moving them is safe.
  assert.ok(form.container.querySelector('[data-row-field="bright.lightness"]'));
});

test('the middle box is the curve\'s middle handle, in the channel\'s units', () => {
  const form = anchoredForm();
  // Reads it: the anchor sits at unit 0.34 of the span 2..96.
  assert.equal(form.middle.value, '34');

  // Writes it, and the value lands exactly where it was typed rather than near it.
  form.middle.value = '60';
  form.middle.dispatch('input', { bubbles: true });
  const at = form.points()[5];
  assert.ok(Math.abs((2 + (96 - 2) * at) - 60) < 0.05, 'typing 60 put the anchor at ' + (2 + 94 * at));
});

test('dragging a Lightness middle handle moves it vertically (writes pts[5]), not only sideways', () => {
  /**
   * Lightness has no `ends.mid` field — the control's Middle box *is* the handle. Typing already
   * wrote `pts[5]`; drag used to update only `pts[4]` and the box readout, so the grip refused to
   * move up/down on HSL and OKLCH lightness charts.
   */
  const form = anchoredForm();
  const svg = form.wrap.querySelector('.config-ui-curve__canvas');
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
  const handle = form.wrap.querySelector('[data-curve-index="4"]');
  const yBefore = form.points()[5];
  svg.dispatch('pointerdown', { target: handle, clientX: 50, clientY: 50, pointerId: 1 });
  svg.dispatch('pointermove', { clientX: 50, clientY: 20, pointerId: 1 });
  svg.dispatch('pointerup', { clientX: 50, clientY: 20, pointerId: 1 });
  const yAfter = form.points()[5];
  assert.ok(Math.abs(yAfter - yBefore) > 0.05,
    'middle handle Y must move with the pointer: was ' + yBefore + ', now ' + yAfter);
  assert.ok(parseFloat(form.middle.value, 10) > parseFloat('34', 10),
    'Middle box must follow the drag: ' + form.middle.value);
});

test('the middle box\'s caption and input stack, matching the adopted anchors either side of it', () => {
  // **Confirmed live, in a browser, by diffing the two DOM trees.** The adopted case (Hue/Saturation's
  // own middle) nests three levels deep: an outer cell, a `.config-ui-rows-group`, and — the thing
  // that actually stacks a caption over its input — a `.config-ui-rows-group-part` that never also
  // carries `.config-ui-curve__anchor`. Putting both classes on the one element this control builds
  // by hand loses the column layout to `.config-ui-curve__anchors .config-ui-curve__anchor { display:
  // block }`, which outranks `.config-ui-rows-group-part`'s own rule by specificity — read as caption
  // and input sitting side by side instead of stacked, which is what shipped and was reported live.
  const form = anchoredForm();
  const outer = form.middle.closest('.config-ui-curve__anchor--middle');
  assert.ok(outer, 'the middle box has no .config-ui-curve__anchor--middle ancestor at all');
  assert.equal(
    outer.classList.contains('config-ui-rows-group-part'), false,
    'the stacking class sits on the same element as .config-ui-curve__anchor and loses to its ' +
      'display: block override — it belongs one level further in'
  );
  const stacker = form.middle.closest('.config-ui-rows-group-part');
  assert.ok(stacker, 'no ancestor carries the class that actually stacks caption over input');
  assert.notEqual(stacker, outer, 'the stacking wrapper must be a separate element from the outer anchor');
});

test('with no middle point the box is disabled and reads the curve\'s own value as a placeholder', () => {
  // **Disabled, not empty.** The curve still has a shape between its ends, and where it sits at the
  // midpoint is a real, useful number to read off — Márton: "it's actually a useful information...
  // to measure the curve" — it is just not an anchor anyone set. `placeholder`, not `.value`: nothing
  // here is a value `collectRows` could mistake for one.
  const form = anchoredForm();
  form.wrap.querySelector('.config-ui-curve__toggle').dispatch('click', { bubbles: true });
  assert.equal(form.points().length, 4, 'the middle point was not removed');
  assert.equal(form.middle.disabled, true);
  assert.equal(form.middle.value, '', 'a real value here would be one the curve does not hold');
  const shown = Number(form.middle.placeholder);
  assert.ok(isFinite(shown), 'no derived reading was shown at all: "' + form.middle.placeholder + '"');
  assert.ok(shown > 2 && shown < 96, 'the derived reading, ' + shown + ', is outside the channel\'s own span');
});

test('a channel with a real middle adopts it; one without gets a view of the handle', () => {
  /**
   * **Two cases, and the binding says which.** Lightness has no middle field — the curve's handle *is* the
   * middle — so the box under the chart is a view of the handle. Chroma and hue do have one: the engine
   * interpolates bright to `middle.chroma` to dark and paces it with the curve, which are two different
   * numbers. A box showing the handle there would show neither the anchor nor anything the engine reads.
   */
  const source = [
    '// @UI_CONFIG_START',
    'var modes = [{ name: "G", bright: { chroma: 0.02 }, middle: { chroma: 0.25 }, ' +
      'dark: { chroma: 0.05 }, cc: [0.4, 0.2, 0.6, 0.8] }]; // @rows: name:text=Mode|#>Saturation|' +
      'cc:curve(ends:bright.chroma..middle.chroma..dark.chroma, range:0..0.4)=Chroma curve|' +
      'bright:{chroma:number=Start}=B|middle:{chroma:number=Middle}=M|dark:{chroma:number=End}=D @blocks',
    '// @UI_CONFIG_END',
  ].join('\n');
  const schema = parser.parse(source);
  const container = document.createElement('div');
  renderer.buildForm(schema, container);
  renderer.attachListeners(container, schema, function () {});

  const row = container.querySelector('.config-ui-curve__anchors');
  assert.deepEqual(row.querySelectorAll('input').map((i) => i.getAttribute('data-row-field')),
    ['bright.chroma', 'middle.chroma', 'dark.chroma'],
    'the real middle anchor is not under the chart, in the middle');
  assert.equal(container.querySelectorAll('[data-curve-middle]').length, 0,
    'a second view of the middle was invented beside the anchor the engine reads');

  // And the two-key form still builds its own, because there is nothing to adopt.
  assert.equal(anchoredForm().container.querySelectorAll('[data-curve-middle]').length, 1);
});

test('an adopted middle with no anchor of its own shows the curve\'s reading, not a blank box', () => {
  const source = [
    '// @UI_CONFIG_START',
    'var modes = [{ name: "G", bright: { chroma: 0.02 }, dark: { chroma: 0.05 }, ' +
      'cc: [0.4, 0.2, 0.6, 0.8] }]; // @rows: name:text=Mode|#>Saturation|' +
      'cc:curve(ends:bright.chroma..middle.chroma..dark.chroma, range:0..0.4)=Chroma curve|' +
      'bright:{chroma:number=Start}=B|middle:{chroma:number=Middle}=M|dark:{chroma:number=End}=D @blocks',
    '// @UI_CONFIG_END',
  ].join('\n');
  const schema = parser.parse(source);
  const container = document.createElement('div');
  renderer.buildForm(schema, container);
  renderer.attachListeners(container, schema, function () {});
  const middle = container.querySelector('[data-row-field="middle.chroma"]');
  assert.equal(middle.disabled, true);
  assert.equal(middle.value, '', 'a real value would be an anchor nobody set');
  const shown = Number(middle.placeholder);
  assert.ok(isFinite(shown) && shown > 0.02 && shown < 0.05,
    'no derived reading shown between the ends: "' + middle.placeholder + '"');
});


test('a token per step, in its own colour, with a ring on the seed', () => {
  /**
   * **The chart's job is where each step lands, and the line only implied it.** The dots are the answer,
   * drawn from the same published colours the bar beside the chart uses — so a step cannot be shown at one
   * value here and a different one there.
   *
   * Small on purpose. Márton deferred these once for being too large: a dot that competes with a handle
   * makes the thing you can drag harder to find, not easier.
   */
  const hexes = ['#FAFAFA', '#D0CFD6', '#A3A1AF', '#69677A', '#2B2A32', '#0A090B'];
  renderer.setCurveRamps({ lc: { hexes: hexes, seed: 2 } });
  const form = axisForm();

  const dots = form.container.querySelectorAll('.config-ui-curve__token');
  assert.equal(dots.length, hexes.length, 'one dot per token');
  assert.deepEqual(dots.map((d) => d.getAttribute('fill')), hexes, 'a dot is not its own colour');
  assert.equal(form.container.querySelectorAll('.config-ui-curve__seed-ring').length, 1);

  // Clipped with the ramp, not with the grips: a dot outside the window is outside the chart, and unlike a
  // handle there is nothing to reach for on the boundary.
  dots.forEach((d) => {
    const clip = d.parentNode.getAttribute('clip-path');
    assert.ok(clip && clip.indexOf('-grip') === -1, 'a token dot escaped the plot');
  });

  renderer.setCurveRamps({});
  assert.equal(axisForm().container.querySelectorAll('.config-ui-curve__token').length, 0,
    'dots drawn with no colours published would be invented');
});

test('a channel whose ends match still has an axis', () => {
  /**
   * **Lime's saturation is `100 … 83 … 100`.** Both ends pinned and all the movement in the middle, which
   * is an ordinary shape for a ramp that stays vivid at both extremes. `axis()` bailed when the two ends
   * were equal, and took everything with it: no ticks, no zoom, no colour bar, no draggable ends. The whole
   * Saturation tab looked unimplemented.
   *
   * The curve carries a real middle point (ten numbers), not just a field that names one — `axisView`
   * only widens for a middle the curve itself has an anchor for (`curveHasRealMiddle`), the same
   * question generation asks (`oklchRamp`'s `hueHasMiddle`/`chromaHasMiddle`: the curve decides, once
   * it has a shape at all). A plain two-anchor curve here would be a middle field generation already
   * ignores, and the window ignoring it too would be agreement, not the bug this test exists for.
   */
  const source = [
    '// @UI_CONFIG_START',
    'var a = { bright: 100, middle: 83.2, dark: 100 }; ' +
      '// @group: bright:number=Start|middle:number=Middle|dark:number=End @label: Ends',
    'var sc = ' + JSON.stringify(B.bezierWithMiddle([0.4, 0.3, 0.6, 0.7], 0.5)) +
      '; // @curve @ends: a.bright..a.middle..a.dark @range: 0..100 @label: S',
    '// @UI_CONFIG_END',
  ].join('\n');
  const schema = parser.parse(source);
  const container = document.createElement('div');
  renderer.buildForm(schema, container);
  renderer.attachListeners(container, schema, function () {});

  assert.equal(container.querySelectorAll('[data-curve-end]').length, 2, 'no draggable ends');
  const ticks = container.querySelectorAll('.config-ui-curve__tick').map((t) => t.textContent);
  assert.ok(ticks.length >= 2, 'no value labels, so no axis');
  // The window opens on all three anchors, so the middle is inside it rather than off the bottom.
  const values = ticks.map((t) => parseFloat(t, 10));
  assert.ok(Math.min.apply(null, values) < 90, 'the window ignored the middle: ' + ticks.join(' '));
});

test('zooming past the constant ends of an equal-ends channel keeps the window, on every redraw', () => {
  /**
   * `rampIsOffscreen`'s three samples go through `unitToValue`, which collapses to one constant —
   * `a.from` — for every sample when the two ends are equal, regardless of the curve's real shape. Zoom
   * to a window that excludes that constant (legitimate: the whole point of a middle on an equal-ends
   * channel is a value the ends don't hold) and every one of those samples reads as off the bottom, so
   * `axisView` decided the *whole ramp* was off screen and reopened the wide window it had just been
   * zoomed away from — reported as "the range doesn't match the zoom" and "it jumps between ranges",
   * because this fires on every draw, not only while dragging.
   *
   * The curve carries a real middle point, for the same reason the test above does — a plain
   * two-anchor curve's middle field is one `axisView`/`rampIsOffscreen` now ignore on purpose.
   */
  const source = [
    '// @UI_CONFIG_START',
    'var a = { bright: 100, middle: 83.2, dark: 100 }; ' +
      '// @group: bright:number=Start|middle:number=Middle|dark:number=End @label: Ends',
    'var sc = ' + JSON.stringify(B.bezierWithMiddle([0.4, 0.3, 0.6, 0.7], 0.5)) +
      '; // @curve @ends: a.bright..a.middle..a.dark @range: 0..100 @label: S',
    '// @UI_CONFIG_END',
  ].join('\n');
  const schema = parser.parse(source);
  const container = document.createElement('div');
  renderer.buildForm(schema, container);
  renderer.attachListeners(container, schema, function () {});

  const wrap = container.querySelector('.config-ui-curve');
  // Excludes both ends (100) but keeps the middle (83.2) in view.
  wrap.setAttribute('data-curve-view', '78,90');
  wrap.dispatchEvent(new Event('config-ui-curve-refresh'));

  assert.equal(wrap.getAttribute('data-curve-view'), '78,90',
    'the zoomed window was discarded and reopened wide, even though the middle is still in it');
});

test('zoom reads as how much of the channel is on screen', () => {
  // Márton: *"it's the current scale, why not the zoom at 100%?"* — it was reported as a multiple of the
  // view the channel opened on, so a chart showing 0 to 100 of a 0..100 channel sat half way up its track.
  const form = axisForm();  // ends 98 and 4 of a 0..100 channel: effectively everything
  const mark = form.container.querySelector('.config-ui-curve__zoom-mark');
  assert.ok(parseFloat(mark.style.top, 10) > 90,
    'a chart showing the whole channel should read as fully zoomed out, not ' + mark.style.top);

  // And the ends cannot move it, because the channel's limits come from `@range` and nothing on the chart
  // can change them.
  const before = mark.style.top;
  const svg = form.wrap.querySelector('.config-ui-curve__canvas');
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
  svg.dispatch('pointerdown', { target: form.ends()[1], clientX: 100, clientY: 100, pointerId: 1 });
  svg.dispatch('pointermove', { clientX: 100, clientY: 30, pointerId: 1 });
  svg.dispatch('pointerup', { clientX: 100, clientY: 30, pointerId: 1 });
  assert.equal(mark.style.top, before, 'dragging an end moved the zoom');
});

test('@ramp paints the bar in the channel\'s own colours, and follows the fields it names', () => {
  /**
   * **The bar was the collection's token colours**, which is a lightness ramp. So it looked right on the
   * Lightness tab and showed a light-to-dark sweep on Hue and Saturation — Márton twice: *"it doesn't show
   * a hue range"*, *"same for saturation, it's still a lightness scale"*. It also could not follow a drag,
   * because the tokens are the file's and the drag has not been run yet.
   *
   * A CSS template instead: `$` is the axis value, `~key` a sibling field. The browser mixes it, so no
   * colour maths lives in the UI — the alternative being a second copy of `@oklch.js` beside the one the
   * sandbox runs.
   */
  const source = [
    '// @UI_CONFIG_START',
    'var a = { bright: 10, dark: 350, sat: 80 }; ' +
      '// @group: bright:number=Start|dark:number=End|sat:number=Sat @label: Ends',
    'var hc = [0.4, 0.2, 0.6, 0.8]; // @curve @ends: a.bright..a.dark @range: 0..360 ' +
      '@ramp: hsl($ ~a.sat% 50%) @label: Hue',
    '// @UI_CONFIG_END',
  ].join('\n');
  const schema = parser.parse(source);
  const container = document.createElement('div');
  renderer.buildForm(schema, container);
  renderer.attachListeners(container, schema, function () {});

  const fill = container.querySelector('.config-ui-curve__range-fill');
  assert.equal(fill.getAttribute('data-shown'), 'true');
  const stops = fill.style.background;
  assert.ok(/hsl\(/.test(stops), 'the bar is not in the channel\'s colour space: ' + stops.slice(0, 80));
  assert.ok(stops.indexOf('80%') !== -1, '`~a.sat` did not resolve to the sibling field');
  assert.ok(stops.indexOf('$') === -1 && stops.indexOf('~') === -1, 'a placeholder survived: ' + stops);

  // It reads the sibling on every draw, which is what makes it follow an edit rather than go stale.
  const sat = container.querySelector('[data-row-field="a.sat"]');
  sat.value = '25';
  sat.dispatch('change', { bubbles: true });
  assert.ok(container.querySelector('.config-ui-curve__range-fill').style.background.indexOf('25%') !== -1,
    'the bar did not follow the field it names');
});

test('an adopted middle is disabled when the curve has no middle point', () => {
  // The engine stopped consulting it, so the panel stops offering it. An editable box holding a number
  // nothing reads is how a bump at the middle of a smooth ramp went unexplained for a week.
  const source = [
    '// @UI_CONFIG_START',
    'var modes = [{ name: "G", bright: { chroma: 0.02 }, middle: { chroma: 0.25 }, ' +
      'dark: { chroma: 0.05 }, cc: [0.4, 0.2, 0.6, 0.8] }]; // @rows: name:text=Mode|#>Saturation|' +
      'cc:curve(ends:bright.chroma..middle.chroma..dark.chroma, range:0..0.4)=Chroma curve|' +
      'bright:{chroma:number=Start}=B|middle:{chroma:number=Middle}=M|dark:{chroma:number=End}=D @blocks',
    '// @UI_CONFIG_END',
  ].join('\n');
  const schema = parser.parse(source);
  const container = document.createElement('div');
  renderer.buildForm(schema, container);
  renderer.attachListeners(container, schema, function () {});

  const mid = container.querySelector('[data-row-field="middle.chroma"]');
  assert.equal(mid.disabled, true, 'a one-segment curve does not travel through a middle');
  assert.equal(mid.value, '', 'stale middle values clear when there is no anchor');
  assert.ok(parseFloat(mid.placeholder, 10) > 0, 'the estimate reads from the curve instead');

  // Give the curve a middle point and the box is live again.
  container.querySelector('.config-ui-curve__toggle').dispatch('click', { bubbles: true });
  assert.equal(container.querySelector('.config-ui-curve').getAttribute('data-curve-value').split(',').length, 10);
  assert.equal(container.querySelector('[data-row-field="middle.chroma"]').disabled, false);
});

test('a hidden curve does not walk off with the anchor boxes', () => {
  /**
   * **Márton: the fields are there while dragging and gone when you let go.**
   *
   * Colours declare two curves per channel — one for OKLCH, one for HSL — and `@showWhen` hides whichever
   * model is not selected. Both bind to the *same* group cell, because a group holds both parts:
   * `bright:{chroma …|saturation …}` is one cell whether you read the chroma or the saturation out of it.
   * So `closest(".config-ui-rows-cell")` hands the two curves the same element and the last to draw keeps
   * it.
   *
   * Usually that is the visible one, which is why it only *tended* to happen. Releasing a drag is the case
   * that loses: `refreshCurveControls` redraws every curve **except the one being edited**, so the only
   * control that redraws is the hidden twin — and it takes the boxes with it into a panel nobody can see.
   */
  const source = [
    '// @UI_CONFIG_START',
    'var model = "hsl"; // @options: hsl:HSL|oklch:OKLCH @radio @label: Model',
    'var modes = [{ name: "G", cc: [0.4, 0.2, 0.6, 0.8], sc: [0.4, 0.2, 0.6, 0.8], ' +
      'bright: { chroma: 0.02, saturation: 80 }, dark: { chroma: 0.05, saturation: 90 } }]; ' +
      '// @rows: name:text=Mode|cc:curve(ends:bright.chroma..dark.chroma, range:0..0.4)' +
      '{model=oklch}=Chroma|sc:curve(ends:bright.saturation..dark.saturation, range:0..100)' +
      '{model=hsl}=Saturation|bright:{chroma:number{model=oklch}=C start|saturation:number{model=hsl}' +
      '=S start}=Bright|dark:{chroma:number{model=oklch}=C end|saturation:number{model=hsl}=S end}=Dark @blocks',
    '// @UI_CONFIG_END',
  ].join('\n');
  const schema = parser.parse(source);
  const container = document.createElement('div');
  renderer.buildForm(schema, container);
  renderer.attachListeners(container, schema, function () {});

  // One cell, two claimants — the thing that makes this possible at all.
  const shared = container.querySelector('[data-row-field="bright.chroma"]').closest('.config-ui-rows-cell');
  assert.equal(container.querySelector('[data-row-field="bright.saturation"]')
    .closest('.config-ui-rows-cell'), shared, 'the two models share one cell, or this test proves nothing');

  const curves = container.querySelectorAll('[data-curve-value]');
  // The shim has no layout, so stand in for "off screen" the way the browser reports it.
  curves.forEach(function (w) {
    var plot = w.querySelector('.config-ui-curve__plot-wrap');
    var shown = !!w.querySelector('[data-row-field="sc"], .config-ui-curve') && w === curves[1];
    plot.getClientRects = function () { return shown ? [{ width: 400, height: 190 }] : []; };
  });

  // Release the visible curve: everything *else* refreshes.
  curves.forEach(function (w) { if (w !== curves[1]) w.dispatchEvent(new Event('config-ui-curve-refresh')); });

  const anchors = shared.closest('.config-ui-curve__anchors');
  assert.ok(!anchors || anchors.closest('[data-curve-value]') === curves[1],
    'the hidden curve adopted the shared cell, so the boxes vanished with it');
});

test('the three boxes and the three points are one set of values, both ways', () => {
  /**
   * Márton: *"when I change the numbers in the input fields, the chart points move, when I move a chart
   * point, the same number change in the input field."*
   *
   * With a real middle the field *is* the colour at the corner (`valueAlongRamp`); `pts[5]` is only
   * pacing. Typing moves the handle on the value axis; dragging the handle writes the field.
   */
  const withMiddle = B.bezierWithMiddle([0.4, 0.2, 0.6, 0.8]);
  const source = [
    '// @UI_CONFIG_START',
    'var modes = [{ name: "G", bright: { chroma: 0.02 }, middle: { chroma: 0.035 }, ' +
      'dark: { chroma: 0.05 }, cc: ' + JSON.stringify(withMiddle) + ' }]; // @rows: name:text=Mode|' +
      'cc:curve(ends:bright.chroma..middle.chroma..dark.chroma, range:0..0.4)=Chroma|' +
      'bright:{chroma:number=S}=B|middle:{chroma:number=M}=M|dark:{chroma:number=E}=D @blocks',
    '// @UI_CONFIG_END',
  ].join('\n');
  const schema = parser.parse(source);
  const container = document.createElement('div');
  renderer.buildForm(schema, container);
  renderer.attachListeners(container, schema, function () {});

  const wrap = container.querySelector('.config-ui-curve');
  const mid = container.querySelector('[data-row-field="middle.chroma"]');
  const svg = wrap.querySelector('.config-ui-curve__canvas');
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });

  // field → chart: handle Y tracks the typed middle on the value axis
  mid.value = '0.04';
  mid.dispatch('input', { bubbles: true });
  const cyHigh = parseFloat(wrap.querySelector('[data-curve-index="4"]').getAttribute('cy'));
  mid.value = '0.025';
  mid.dispatch('input', { bubbles: true });
  const cyLow = parseFloat(wrap.querySelector('[data-curve-index="4"]').getAttribute('cy'));
  assert.ok(cyLow > cyHigh + 5,
    'typing a lower middle must move the handle down the chart: ' + cyHigh + ' → ' + cyLow);

  // chart → field
  const anchor = wrap.querySelector('[data-curve-index="4"]');
  svg.dispatch('pointerdown', { target: anchor, clientX: 50, clientY: 50, pointerId: 1 });
  svg.dispatch('pointermove', { clientX: 50, clientY: 25, pointerId: 1 });
  svg.dispatch('pointerup', { clientX: 50, clientY: 25, pointerId: 1 });
  assert.ok(parseFloat(mid.value, 10) > 0.03,
    'dragging the middle handle up must raise the field: ' + mid.value);
});

test('the coordinate field shares the preset row on a charted curve', () => {
  // One thought — which shape, the shape as text, how many points — so one row, in that order.
  // A scale editor keeps the field under the plot, where the column is too narrow for three on a line.
  const charted = axisForm();
  const head = charted.wrap.querySelector('.config-ui-curve__head');
  assert.ok(head.querySelector('.config-ui-curve__text'), 'the coordinates are not on the preset row');
  const kids = [...head.children].map((el) => {
    if (el.classList.contains('config-ui-curve__preset')) return 'preset';
    if (el.classList.contains('config-ui-curve__text')) return 'text';
    if (el.classList.contains('config-ui-curve__toggle')) return 'toggle';
    return el.className;
  });
  assert.deepEqual(kids, ['preset', 'text', 'toggle'],
    'order must be type → coordinates → add/remove middle, got ' + kids.join(', '));

  const scale = build({}, [0.4, 0, 0.7, 0.55]);
  const scaleHead = scale.wrap.querySelector('.config-ui-curve__head');
  assert.equal(scaleHead.querySelector('.config-ui-curve__text'), null,
    'a scale editor should keep its field under the plot');
});

test('the bar shows the zoomed window, matching the chart\'s own axis at every zoom level', () => {
  /**
   * Reversed from an earlier decision to show the whole channel with the window bracketed on it: Márton
   * wants the strip to correlate with the chart's left-hand axis numbers exactly, the way the chart
   * itself does — zoom to hue 90..100 and the strip shows hue 90..100, stretched to fill the same height,
   * not the whole wheel with a sliver marked near one edge. There is no separate bracket element any
   * more; the strip itself is the window.
   */
  const source = [
    '// @UI_CONFIG_START',
    'var a = { bright: 100, dark: 110, sat: 80 }; ' +
      '// @group: bright:number=Start|dark:number=End|sat:number=Sat @label: Ends',
    'var hc = [0.4, 0.2, 0.6, 0.8]; // @curve @ends: a.bright..a.dark @range: 0..360 ' +
      '@ramp: hsl($ ~a.sat% 50%) @label: Hue',
    '// @UI_CONFIG_END',
  ].join('\n');
  const schema = parser.parse(source);
  const container = document.createElement('div');
  renderer.buildForm(schema, container);
  renderer.attachListeners(container, schema, function () {});

  const stops = container.querySelector('.config-ui-curve__range-fill').style.background;
  const values = (stops.match(/hsl\((-?[\d.]+)/g) || []).map((m) => parseFloat(m.slice(4), 10));
  assert.ok(values.length > 2, 'no gradient: ' + stops.slice(0, 80));
  // The window opens on the ends (100..110) with 10% air, clamped to the channel — 99..111, not 0..360.
  assert.ok(Math.abs(values[0] - 111) < 1, 'the bar starts at ' + values[0] + ', not the window\'s own top');
  assert.ok(Math.abs(values[values.length - 1] - 99) < 1,
    'the bar ends at ' + values[values.length - 1] + ', not the window\'s own bottom');

  assert.equal(container.querySelector('.config-ui-curve__range-window'), null,
    'the window is no longer bracketed separately now that the strip itself is cropped to it');
});

/** The slope either side of the join, as a ratio. 1 is a smooth node; anything else is a corner. */
function tangentRatio(curve) {
  const mx = curve[4];
  const e = 1e-4;
  const into = (B.bezierAt(curve, mx) - B.bezierAt(curve, mx - e)) / e;
  const outOf = (B.bezierAt(curve, mx + e) - B.bezierAt(curve, mx)) / e;
  return outOf / into;
}

/** Drag the handle before the anchor, and hand back what the curve became. */
function dragInnerHandle(curve, opts) {
  const source = [
    '// @UI_CONFIG_START',
    'var a = { bright: 98.2, dark: 9.6 }; // @group: bright:number=B|dark:number=D @label: Ends',
    'var c = ' + JSON.stringify(curve) + '; // @curve @ends: a.bright..a.dark @range: 0..100 @label: L',
    '// @UI_CONFIG_END',
  ].join('\n');
  const schema = parser.parse(source);
  const container = document.createElement('div');
  renderer.buildForm(schema, container);
  renderer.attachListeners(container, schema, function () {});
  const svg = container.querySelector('.config-ui-curve__canvas');
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
  const handle = container.querySelector('[data-curve-index="2"]');
  svg.dispatch('pointerdown', {
    target: handle, clientX: 30, clientY: 60, pointerId: 1, altKey: !!(opts && opts.alt),
  });
  svg.dispatch('pointermove', { clientX: 18, clientY: 38, pointerId: 1 });
  svg.dispatch('pointerup', { clientX: 18, clientY: 38, pointerId: 1 });
  return JSON.parse(container.querySelector('.config-ui-curve').getAttribute('data-curve-value'));
}

test('a smooth node stays smooth through a drag, tangent ratio 1.0', () => {
  /**
   * **Two segments meet at the point and need not meet at the tangent.** The inner handles are stored
   * independently, so dragging one leaves a slope discontinuity across the join — Márton measured 1.259
   * into it against 1.448 out. Mirroring the other handle through the anchor is what removes it.
   */
  const smooth = B.bezierWithMiddle([0.42, 0.16, 0.68, 0.52]);
  assert.ok(Math.abs(tangentRatio(smooth) - 1) < 1e-3, 'the fixture is not smooth to begin with');

  const after = dragInnerHandle(smooth);
  assert.ok(B.bezierNodeIsSmooth(after), 'the drag broke the node');
  assert.ok(Math.abs(tangentRatio(after) - 1) < 1e-3,
    'tangent ratio after the drag is ' + tangentRatio(after) + ', not 1');
});

test('a corner survives a drag, because a fitted ramp may need one', () => {
  // Lime's file is a plateau with a knee at each end, and forcing smoothness on the *fit* costs seven of
  // 255 there. So a node that was a corner when the drag began is still one when it ends.
  const corner = B.bezierWithMiddle([0.42, 0.16, 0.68, 0.52]).slice();
  corner[2] = 0.12;
  corner[3] = 0.40;
  assert.equal(B.bezierNodeIsSmooth(corner), false, 'the fixture is not a corner to begin with');
  assert.equal(B.bezierNodeIsSmooth(dragInnerHandle(corner)), false, 'the drag smoothed a real corner');
});

test('alt inverts whichever kind of node it is', () => {
  // The way every vector tool does it: break a smooth node, or restore a broken one.
  const smooth = B.bezierWithMiddle([0.42, 0.16, 0.68, 0.52]);
  const corner = smooth.slice();
  corner[2] = 0.12;
  corner[3] = 0.40;
  assert.equal(B.bezierNodeIsSmooth(dragInnerHandle(smooth, { alt: true })), false);
  assert.equal(B.bezierNodeIsSmooth(dragInnerHandle(corner, { alt: true })), true);
});

test('the node’s kind is read once, at the start of the drag', () => {
  // Read per frame it would flip the instant the first mirrored move made the handles collinear, and a
  // corner being pulled apart would snap smooth under the pointer. Source-level, because the bug is a
  // timing one and the observable is a single frame.
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'config-ui', 'renderer.js'), 'utf8');
  assert.match(source, /pointerdown[\s\S]{0,900}bezierNodeIsSmooth/,
    'the node kind is not read at pointerdown');
  assert.doesNotMatch(source, /function applyMove\([\s\S]{0,600}bezierNodeIsSmooth/,
    'the node kind is re-read inside the move, so a mirrored drag would flip it');
});

/**
 * *Estimated original* is parked (`ESTIMATE_PARKED` in `buildCurvePresetSelect`), not removed: the
 * request it made does not reliably answer (`DEFERRED.md`, "The on-demand fit hangs, not always, and
 * not fully explained") — a control that never answers is worse than one that is not there. The
 * dispatch mechanism below (`requestQuickFit`, the tags, the watchdog) stays and stays tested, driven
 * directly through `preset.value = 'estimated'` rather than through an option nobody can click, so
 * un-parking is a one-line revert rather than a rewrite.
 */
test('a per-mode curve cell does not offer Estimated original while it is parked', () => {
  const wrap = renderer.buildCurveControl({}, [], undefined, 'modes[0].curve');
  const preset = wrap.querySelector('.config-ui-curve__preset');
  assert.equal(preset.querySelector('option[value="estimated"]'), null,
    'the option is offered while the dispatch bug behind it is still open — see DEFERRED.md');
});

test('the collection-scope curve does not offer an estimate it has no way to fetch', () => {
  // `baselineKey` for the OKLCH/Lightness collection-scope curve is a bare field name (`"curve"`),
  // never `modes[N].curve` — there is no row, so no `requestQuickFit` this control could ask for.
  const wrap = renderer.buildCurveControl({ allowOriginal: true }, [], undefined, 'curve');
  const preset = wrap.querySelector('.config-ui-curve__preset');
  assert.equal(preset.querySelector('option[value="estimated"]'), null,
    'a field with no fitting mechanism offered Estimated original anyway');
});

test('selecting Estimated original before a fit exists disables the control and asks for one', () => {
  const wrap = renderer.buildCurveControl({}, [], undefined, 'modes[0].curve');
  const preset = wrap.querySelector('.config-ui-curve__preset');
  let requested = 0;
  wrap.addEventListener('config-ui-request-estimate', () => { requested++; });

  preset.value = 'estimated';
  preset.dispatch('change', { bubbles: true });

  assert.equal(requested, 1, 'selecting the option did not ask the host for a fit');
  assert.equal(preset.disabled, true, 'the control did not disable itself while waiting');

  // A second selection while the first is still in flight must not fire a second request — the host's
  // own `_modeFitted` claims the row immediately, and a redundant event here would race it.
  preset.dispatch('change', { bubbles: true });
  assert.equal(requested, 1, 'a second selection while waiting queued a second request');
});

test('the control re-enables the moment the fit lands, however the host answers', () => {
  const wrap = renderer.buildCurveControl({}, [], undefined, 'modes[0].curve');
  const preset = wrap.querySelector('.config-ui-curve__preset');
  preset.value = 'estimated';
  preset.dispatch('change', { bubbles: true });
  assert.equal(preset.disabled, true);

  // The host's own signal for "a fit finished, re-read whatever changed" — `applyQuickFit`
  // (`src/ui.html`) publishes the fitted curve into the same baseline map this control reads
  // (`curveBaselineFor`) and *then* sets `data-curve-value` and dispatches this event, for every
  // curve field of the mode it just fitted, not only the one that asked.
  renderer.setCurveBaselines({ 'modes[0].curve': [0.3, 0.2, 0.7, 0.8] });
  try {
    wrap.setAttribute('data-curve-value', JSON.stringify([0.3, 0.2, 0.7, 0.8]));
    wrap.dispatchEvent(new Event('config-ui-curve-refresh'));

    assert.equal(preset.disabled, false, 'the control stayed disabled after the fit landed');
    assert.equal(preset.value, 'estimated', 'the landed curve was not offered as the selection');
    assert.equal(preset.title, '', 'a stale status message was left on a control that succeeded');
  } finally {
    // `curveBaselines` is module-level state, shared by every curve control built in this process —
    // left set, a later test's unfitted cell would find a baseline nothing gave it.
    renderer.setCurveBaselines({});
  }
});

test('a control that never hears back re-enables itself instead of freezing', () => {
  // The bug this exists for: shipped having only ever been confirmed to *ask* — the report was a
  // frozen dropdown, on a real collection, because whatever it was waiting on never answered. A
  // control that can get stuck must not be allowed to, regardless of why the answer never came.
  //
  // The mock captures the callback without invoking it, so the "still waiting" state is a real
  // observation and not one collapsed by a synchronous mock into the same tick as the request.
  const realSetTimeout = global.setTimeout;
  let firedWith = null;
  let pending = null;
  global.setTimeout = (fn, ms) => { firedWith = ms; pending = fn; return { unref() {} }; };
  try {
    const wrap = renderer.buildCurveControl({}, [], undefined, 'modes[0].curve');
    const preset = wrap.querySelector('.config-ui-curve__preset');
    preset.value = 'estimated';
    preset.dispatch('change', { bubbles: true });

    assert.ok(firedWith > 0, 'requestEstimate did not set a real timeout at all');
    assert.equal(preset.disabled, true, 'the control did not disable itself while genuinely waiting');

    pending();
    assert.equal(preset.disabled, false, 'the control stayed disabled once its own timeout fired');
  } finally {
    global.setTimeout = realSetTimeout;
  }
});

test('a timed-out estimate re-enables the control, says what happened, and never lies about the curve', () => {
  const realSetTimeout = global.setTimeout;
  global.setTimeout = (fn) => { fn(); return { unref() {} }; };
  try {
    const wrap = renderer.buildCurveControl({}, [], undefined, 'modes[0].curve');
    const preset = wrap.querySelector('.config-ui-curve__preset');
    preset.value = 'estimated';
    preset.dispatch('change', { bubbles: true });

    assert.equal(preset.disabled, false, 'the control is still disabled after its own timeout fired');
    assert.match(preset.title, /estimate/i, 'nothing says an estimate was asked for and never arrived');
    assert.match(preset.title, /try again|pick/i, 'the message says what happened but not what to do');
    // No estimate ever arrived, so the curve must not have been rewritten to claim one did.
    assert.deepEqual(JSON.parse(wrap.getAttribute('data-curve-value')), []);
  } finally {
    global.setTimeout = realSetTimeout;
  }
});

test('a timeout tells the host to drop the answer when it eventually lands, not just gives up the UI', () => {
  // Márton's repro, reduced to its cause: the control's own timeout gave the interface back while the
  // fit it asked for kept running with no way to cancel it, and a stale answer landed later into
  // whatever tab was open by then. Giving up on screen and telling the host to disregard the answer
  // are two different things, and only the first used to happen.
  const realSetTimeout = global.setTimeout;
  global.setTimeout = (fn) => { fn(); return { unref() {} }; };
  try {
    const wrap = renderer.buildCurveControl({}, [], undefined, 'modes[0].curve');
    let abandoned = 0;
    wrap.addEventListener('config-ui-abandon-estimate', () => { abandoned++; });
    const preset = wrap.querySelector('.config-ui-curve__preset');
    preset.value = 'estimated';
    preset.dispatch('change', { bubbles: true });
    assert.equal(abandoned, 1, 'the timeout gave up on screen without telling the host to drop the answer');
  } finally {
    global.setTimeout = realSetTimeout;
  }
});

test('a successful estimate never fires the abandon signal', () => {
  const wrap = renderer.buildCurveControl({}, [], undefined, 'modes[0].curve');
  let abandoned = 0;
  wrap.addEventListener('config-ui-abandon-estimate', () => { abandoned++; });
  const preset = wrap.querySelector('.config-ui-curve__preset');
  preset.value = 'estimated';
  preset.dispatch('change', { bubbles: true });

  renderer.setCurveBaselines({ 'modes[0].curve': [0.3, 0.2, 0.7, 0.8] });
  try {
    wrap.setAttribute('data-curve-value', JSON.stringify([0.3, 0.2, 0.7, 0.8]));
    wrap.dispatchEvent(new Event('config-ui-curve-refresh'));
    assert.equal(abandoned, 0, 'a fit that actually landed was treated as abandoned anyway');
  } finally {
    renderer.setCurveBaselines({});
  }
});

test('typing a middle value above both ends leaves pacing alone and moves the handle on the value axis', () => {
  /**
   * **Two-segment axis:** a Hue middle of 293.5° with ends near 100° is a real colour endpoint, not
   * an out-of-range pacing height. The curve's `pts[5]` stays put (generation still divides by it);
   * the field holds 293.5; the handle sits on the continuous short-arc axis (down through 0°, so at
   * the low end of the opened window — not at wrapped 293° on a 0…360 chart).
   */
  const startCurve = [0.185, 0, 0.3425, 0.25, 0.5, 0.5, 0.6575, 0.75, 0.815, 1];
  const source = [
    '// @UI_CONFIG_START',
    'var a = { bright: 100, middle: 100, dark: 99.2 }; ' +
      '// @group: bright:number=Start|middle:number=Middle|dark:number=End @label: Ends',
    'var sc = ' + JSON.stringify(startCurve) +
      '; // @curve @ends: a.bright..a.middle..a.dark @range: 0..360 @overshoot @label: Hue',
    '// @UI_CONFIG_END',
  ].join('\n');
  const schema = parser.parse(source);
  const container = document.createElement('div');
  renderer.buildForm(schema, container);
  renderer.attachListeners(container, schema, function () {});

  const wrap = container.querySelector('.config-ui-curve');
  const middle = container.querySelector('[data-row-field="a.middle"]');
  const svg = wrap.querySelector('.config-ui-curve__canvas');
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });

  middle.value = '293.5';
  middle.dispatch('input', { bubbles: true });

  assert.equal(middle.value, '293.5', 'the typed value must not be reverted');
  const pts = JSON.parse(wrap.getAttribute('data-curve-value'));
  assert.equal(pts[5], startCurve[5], 'pacing height must not move for a middle-colour edit');
  const cy = parseFloat(wrap.querySelector('[data-curve-index="4"]').getAttribute('cy'));
  const endCys = Array.from(wrap.querySelectorAll('.config-ui-curve__axis-end'))
    .map((el) => parseFloat(el.getAttribute('cy')));
  assert.ok(cy > Math.max.apply(null, endCys) + 20,
    'short-arc middle must sit past both ends on the continuous axis, cy=' + cy +
    ' ends=' + endCys.join(','));
});

test('adding a middle point stays visible-dim-free even though the anchor cell is shared with a hidden model', () => {
  /**
   * **The box and its dimming used to answer to two different redraws.** Hue and hslHue share one
   * bright/middle/dark cell (`@showWhen`, one model at a time — the same sharing `'a hidden curve does not
   * walk off with the anchor boxes'` above exists for). Clicking *Add middle point* on the visible curve set
   * the shared cell's `data-shown="true"`; `refreshCurveControls` then redrew the *other* (hidden, still
   * two-anchor) curve right after, whose own `placeColumns` set the same shared attribute back to `"false"`
   * — so the field was genuinely enabled and typable, and stayed rendered at 0.45 opacity as if it were not.
   * Márton, live: *"the input field turns active, but its colors still shows it as disabled."*
   */
  const source = [
    '// @UI_CONFIG_START',
    'var model = "hsl"; // @options: hsl:HSL|oklch:OKLCH @radio @label: Model',
    'var modes = [{ name: "G", hueCurve: [], hslHueCurve: [], ' +
      'bright: { hue: 0, hslHue: 100 }, middle: { hue: 0, hslHue: 0 }, dark: { hue: 0, hslHue: 99.2 } }]; ' +
      '// @rows: name:text=Mode|' +
      'hueCurve:curve(ends:bright.hue..middle.hue..dark.hue, range:0..360){model=oklch}=Hue curve|' +
      'hslHueCurve:curve(ends:bright.hslHue..middle.hslHue..dark.hslHue, range:0..360){model=hsl}=Hue curve|' +
      'bright:{hue:number=Hue start{model=oklch}|hslHue:number=Hue start{model=hsl}}=B|' +
      'middle:{hue:number=Hue middle{model=oklch}|hslHue:number=Hue middle{model=hsl}}=M|' +
      'dark:{hue:number=Hue end{model=oklch}|hslHue:number=Hue end{model=hsl}}=D @blocks',
    '// @UI_CONFIG_END',
  ].join('\n');
  const schema = parser.parse(source);
  const container = document.createElement('div');
  renderer.buildForm(schema, container);
  renderer.attachListeners(container, schema, function () {});

  const curves = container.querySelectorAll('[data-curve-value]');
  const hueCurve = Array.from(curves).find((w) => w.getAttribute('data-row-field') === 'hueCurve');
  const hslHueCurve = Array.from(curves).find((w) => w.getAttribute('data-row-field') === 'hslHueCurve');
  // The shim has no layout, so stand in for "off screen" the way the browser reports it — hsl is selected.
  [hueCurve, hslHueCurve].forEach((w) => {
    const plot = w.querySelector('.config-ui-curve__plot-wrap');
    plot.getClientRects = () => (w === hslHueCurve ? [{ width: 400, height: 190 }] : []);
  });
  hslHueCurve.dispatchEvent(new Event('config-ui-curve-refresh'));

  const preset = hslHueCurve.querySelector('.config-ui-curve__preset');
  preset.value = 'custom';
  preset.dispatch('change', { bubbles: true });
  hslHueCurve.querySelector('.config-ui-curve__toggle').dispatch('click', { bubbles: true });

  const midField = container.querySelector('[data-row-field="middle.hslHue"]');
  assert.equal(midField.disabled, false, 'the field itself must be enabled once the curve has a middle point');
  const wrap = midField.closest('.config-ui-curve__anchor');
  assert.equal(wrap.getAttribute('data-shown'), 'true',
    'the shared cell must not be dimmed once the visible curve has a middle point');
});

/**
 * A curve control bound to `ends: a.bright..a.dark` (or `a.bright..a.middle..a.dark`), for testing
 * how a drag converts into the curve's own stored numbers on a channel with real bright/dark/middle
 * values — the layer `effectiveGap` (`renderer.js`) lives in, not `@bezier.js`'s own margins.
 */
function dragSensitivityForm(opts) {
  const hasMid = opts.mid !== undefined;
  const endsSpec = hasMid ? 'a.bright..a.middle..a.dark' : 'a.bright..a.dark';
  const groupFields = hasMid ? 'bright:number=B|middle:number=M|dark:number=D' : 'bright:number=B|dark:number=D';
  const varsObj = hasMid
    ? `{ bright: ${opts.bright}, middle: ${opts.mid}, dark: ${opts.dark} }`
    : `{ bright: ${opts.bright}, dark: ${opts.dark} }`;
  const source = [
    '// @UI_CONFIG_START',
    `var a = ${varsObj}; // @group: ${groupFields} @label: Ends`,
    'var c = ' + JSON.stringify(opts.curve || [0.37, 0, 0.63, 1]) +
      `; // @curve @ends: ${endsSpec} @range: ${opts.range[0]}..${opts.range[1]} @overshoot @label: C`,
    '// @UI_CONFIG_END',
  ].join('\n');
  const schema = parser.parse(source);
  const container = document.createElement('div');
  renderer.buildForm(schema, container);
  renderer.attachListeners(container, schema, function () {});
  const svg = container.querySelector('.config-ui-curve__canvas');
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
  return {
    container, svg,
    points: () => JSON.parse(container.querySelector('.config-ui-curve').getAttribute('data-curve-value')),
  };
}

/** Drag the first handle from `fromY` to `toY` (plot pixels, 0..100) and hand back the stored curve. */
function dragHandle0To(form, fromY, toY) {
  const handle = form.container.querySelector('[data-curve-index="0"]');
  form.svg.dispatch('pointerdown', { target: handle, clientX: 30, clientY: fromY, pointerId: 1 });
  form.svg.dispatch('pointermove', { clientX: 30, clientY: toY, pointerId: 1 });
  form.svg.dispatch('pointerup', { clientX: 30, clientY: toY, pointerId: 1 });
  return form.points();
}

test('a curve whose ends sit a normal distance apart drags exactly as before — Lightness', () => {
  // Bright 98, dark 4: a 94-unit gap on a 0..100 range. `effectiveGap`'s floor is this spread over
  // ten, 9.4 — far below the real 94-unit gap, so `Math.max` hands back the gap unchanged and nothing
  // about this channel's drag sensitivity is different from before `effectiveGap` existed.
  const dragged = dragHandle0To(dragSensitivityForm({ bright: 98, dark: 4, range: [0, 100] }), 50, 0);
  assert.ok(Math.abs(dragged[1] - -0.021277) < 1e-4, 'Lightness drag sensitivity moved: ' + dragged[1]);
});

test('a curve whose ends sit a normal distance apart drags exactly as before — Chroma', () => {
  // Bright/dark chroma from a real set (lime), 0.0332 apart on a 0..0.4 range — the floor (0.00332)
  // sits below it the same way, so this is another curve `effectiveGap` must leave alone.
  const dragged = dragHandle0To(
    dragSensitivityForm({ bright: 0.0227, dark: 0.0559, range: [0, 0.4] }), 50, 0);
  assert.ok(Math.abs(dragged[1] - 1.1) < 1e-4, 'Chroma drag sensitivity moved: ' + dragged[1]);
});

test('a curve whose ends sit a normal distance apart drags exactly as before — Hue with no far middle', () => {
  // Lime's hslHue gap (100°, 99.2°) is narrow — shape handles stay visible; drag uses shape space
  // while the preset is still flat linear, then value-axis mapping once the curve bends.
  const narrow = dragSensitivityForm({ bright: 100, dark: 99.2, range: [0, 360] });
  assert.ok(narrow.container.querySelectorAll('.config-ui-curve__handle').length > 0);
  const dragged = dragHandle0To(dragSensitivityForm({ bright: 100, dark: 80, range: [0, 360] }), 50, 0);
  assert.ok(dragged[1] < -0.05,
    'Hue drag must move the handle off linear: ' + dragged[1]);
});

test('a near-equal-ends channel with a real middle point far from both ends gets a bounded, not a wild, drag', () => {
  /**
   * The reported bug, reproduced directly: Lime's real Hue gap (100° bright, 99.2° dark) with a
   * *real middle point* — the curve carries ten numbers, not just a field holding 200° — a value
   * nowhere between the ends, which is exactly what forces the window wide. Without a floor, this
   * same drag reads as unit ≈ −137 (`(210.08 − 100) / −0.8`, hand-derived from `axisView`'s own
   * window math) — a handle that looks frozen for nearly the whole plot and then jumps, because only
   * a hairline band near the ends avoids the clamp every other consumer applies. With the floor, the
   * same drag reads as a bounded, comparatively tame amplification.
   *
   * The middle has to be a real anchor on the curve, not only a value in the field: `effectiveGap`
   * asks `curveHasRealMiddle` the same question generation does, and a two-anchor curve with a
   * leftover middle field is the *other* bug — a value on screen the ramp never reads — covered by
   * its own test below rather than this one.
   *
   * The split lands `my = 0.5`, so `bezierNormalise`'s own segment margin (`@Bezier`, "two spans"
   * either way — the fix a few rounds before this one) is the tighter of the two bounds here: it
   * settles at exactly `-2 · my = -1` before `effectiveGap`'s own floor would have mattered. Both
   * protections are real and this fixture happens to hit the stricter one first — the point of the
   * assertion is "bounded", not which layer did the bounding.
   */
  const wild = dragHandle0To(
    dragSensitivityForm({
      bright: 100, dark: 99.2, mid: 200, range: [0, 360],
      curve: B.bezierWithMiddle([0.37, 0, 0.63, 1], 0.5)
    }), 50, 0);
  assert.ok(Math.abs(wild[1]) < 15,
    'the floored drag should stay within a small multiple of the gap, not read as ' + wild[1]);
  assert.ok(Math.abs(wild[1]) > 0.1,
    'still a real, non-trivial move for a full drag to the top of the plot: ' + wild[1]);
});

test("a middle field left over from a removed middle point does not widen a two-anchor curve's window or drag", () => {
  const narrow = dragSensitivityForm({ bright: 100, dark: 99.2, mid: 0, range: [0, 360] });
  assert.ok(narrow.container.querySelectorAll('.config-ui-curve__handle').length > 0);
  const plain = dragHandle0To(
    dragSensitivityForm({ bright: 100, dark: 80, mid: 0, range: [0, 360] }), 50, 0);
  assert.ok(Math.abs(plain[1]) > 0.05,
    'leftover middle field must not freeze the shape handles: ' + plain[1]);
});

test('a channel pinned at its range ceiling still opens a value axis with zoom and ticks', () => {
  /**
   * Equal ends + no middle: generation ignores handle height. The chart shows a **horizontal** line
   * at the pin on the full declared range (0…100), with zoom/range — not a synthetic 90–110 diagonal.
   */
  const form = dragSensitivityForm({ bright: 100, dark: 100, range: [0, 100] });
  const path = form.container.querySelector('.config-ui-curve__path');
  assert.ok(path, 'path missing');
  const ys = [];
  (path.getAttribute('d') || '').replace(/[ML]\s*([\d.+-]+)\s+([\d.+-]+)/g, function (_, x, y) {
    ys.push(parseFloat(y, 10));
    return _;
  });
  assert.ok(ys.length > 2, 'path should be sampled');
  const spread = Math.max.apply(null, ys) - Math.min.apply(null, ys);
  assert.ok(spread < 1.5, 'pinned equal ends must draw horizontal, Y spread=' + spread);
  // Pin at ceiling of 0…100 → near the top of the chart.
  assert.ok(ys[0] < 15, '100 on a 0…100 chart sits near the top, y=' + ys[0]);
  const zoom = form.container.querySelector('.config-ui-curve__zoom');
  const range = form.container.querySelector('.config-ui-curve__range');
  assert.ok(zoom && !zoom.hidden, 'zoom must stay for equal ends');
  assert.ok(range && !range.hidden, 'range strip must stay for equal ends');
  const ticks = Array.from(form.container.querySelectorAll('.config-ui-curve__tick'));
  assert.ok(ticks.length > 0, 'equal ends must still label the value axis');
  // End grips sit on the field value, not on a synthetic 110.
  const ends = form.container.querySelectorAll('.config-ui-curve__axis-end');
  assert.equal(ends.length, 2);
  const ey0 = parseFloat(ends[0].getAttribute('cy'));
  const ey1 = parseFloat(ends[1].getAttribute('cy'));
  assert.ok(Math.abs(ey0 - ey1) < 1, 'both ends at the same pin height');
  assert.ok(Math.abs(ey0 - ys[0]) < 2, 'end grips sit on the horizontal path');
});

test('a Linear Hue ramp across the short arc is a straight path, not a wrap gap', () => {
  /**
   * 60° → 280° short-way crosses 0°. Plotting wrapped degrees on a 0…360 axis put Linear "all over
   * the chart" (path through 350° while the dashed diagonal took the long chord). Display-unwrapped
   * Y keeps one continuous subpath that meets both end grips.
   */
  const form = dragSensitivityForm({ bright: 60, dark: 280, range: [0, 360] });
  const path = form.container.querySelector('.config-ui-curve__path');
  assert.ok(path, 'path missing');
  const d = path.getAttribute('d') || '';
  assert.equal((d.match(/M/g) || []).length, 1,
    'Linear short-arc hue must be one subpath, d=' + d.slice(0, 120));
  const pts = [];
  d.replace(/[ML]\s*([\d.+-]+)\s+([\d.+-]+)/g, function (_, x, y) {
    pts.push({ x: parseFloat(x, 10), y: parseFloat(y, 10) });
    return _;
  });
  assert.ok(pts.length > 2, 'path should be sampled');
  for (let i = 1; i < pts.length; i++) {
    assert.ok(Math.abs(pts[i].y - pts[i - 1].y) < 8,
      'Linear must stay nearly straight in Y, jump ' + Math.abs(pts[i].y - pts[i - 1].y));
  }
  const ends = form.container.querySelectorAll('.config-ui-curve__axis-end');
  assert.equal(ends.length, 2);
  const ey0 = parseFloat(ends[0].getAttribute('cy'));
  const ey1 = parseFloat(ends[1].getAttribute('cy'));
  assert.ok(Math.abs(ey0 - pts[0].y) < 2, 'start grip on the path');
  assert.ok(Math.abs(ey1 - pts[pts.length - 1].y) < 2, 'end grip on the path');
  const diag = form.container.querySelector('.config-ui-curve__diagonal');
  assert.ok(diag, 'diagonal missing');
  assert.ok(Math.abs(parseFloat(diag.getAttribute('y1')) - ey0) < 2, 'diagonal starts at bright');
  assert.ok(Math.abs(parseFloat(diag.getAttribute('y2')) - ey1) < 2, 'diagonal ends at dark');
});

test('a Linear Hue ramp of exactly 180° does not climb the long way around the wheel', () => {
  /**
   * axisHueDelta(0, 180) is −180, so Linear walks 0 → 270 → 180 in wrapped degrees. Display space
   * opens on that continuous arc (0…−180); the path is one straight subpath that meets both grips,
   * not a Euclidean 0→180 chord with handles parked near 300°.
   */
  const form = dragSensitivityForm({ bright: 0, dark: 180, range: [0, 360] });
  const path = form.container.querySelector('.config-ui-curve__path');
  const d = path.getAttribute('d') || '';
  assert.equal((d.match(/M/g) || []).length, 1, 'one subpath');
  const pts = [];
  d.replace(/[ML]\s*([\d.+-]+)\s+([\d.+-]+)/g, function (_, x, y) {
    pts.push({ x: parseFloat(x, 10), y: parseFloat(y, 10) });
    return _;
  });
  for (let i = 1; i < pts.length; i++) {
    assert.ok(Math.abs(pts[i].y - pts[i - 1].y) < 8, 'adjacent samples stay close');
  }
  const ends = form.container.querySelectorAll('.config-ui-curve__axis-end');
  assert.equal(ends.length, 2);
  assert.ok(Math.abs(parseFloat(ends[0].getAttribute('cy')) - pts[0].y) < 2, 'start on path');
  assert.ok(Math.abs(parseFloat(ends[1].getAttribute('cy')) - pts[pts.length - 1].y) < 2, 'end on path');
  // Handles of the Linear cubic sit on the same diagonal, not up near 300° on a 0…360 chart.
  const handles = form.container.querySelectorAll('.config-ui-curve__handle');
  assert.ok(handles.length >= 2);
  const hys = Array.from(handles).map((h) => parseFloat(h.getAttribute('cy')));
  const pathMin = Math.min.apply(null, pts.map((p) => p.y));
  const pathMax = Math.max.apply(null, pts.map((p) => p.y));
  hys.forEach(function (hy) {
    assert.ok(hy >= pathMin - 3 && hy <= pathMax + 3,
      'Linear handle must sit on the path band, cy=' + hy + ' path=' + pathMin + '..' + pathMax);
  });
});

test('dragging a Hue middle across the short arc keeps a continuous path (no wrap spike)', () => {
  /**
   * 100° → 290° short-way crosses 0°. Plotting wrapped samples used to need a path break (`M`) to
   * avoid a vertical spike. Continuous display space keeps one subpath; the middle still sits near
   * the top of the opened window.
   */
  const form = dragSensitivityForm({
    bright: 100, dark: 99.2, mid: 290, range: [0, 360],
    curve: B.bezierWithMiddle([0.37, 0, 0.63, 1], 0.5)
  });
  const path = form.container.querySelector('.config-ui-curve__path');
  assert.ok(path, 'path missing');
  const d = path.getAttribute('d') || '';
  assert.equal((d.match(/M/g) || []).length, 1,
    'path must stay continuous across the hue wrap, d=' + d.slice(0, 120));
  const ys = [];
  d.replace(/[ML]\s*([\d.+-]+)\s+([\d.+-]+)/g, function (_, x, y) {
    ys.push(parseFloat(y, 10));
    return _;
  });
  for (let i = 1; i < ys.length; i++) {
    assert.ok(Math.abs(ys[i] - ys[i - 1]) < 25,
      'path still has a spike: jump ' + Math.abs(ys[i] - ys[i - 1]));
  }
  const midField = form.container.querySelector('[data-row-field="a.middle"]');
  assert.equal(parseFloat(midField.value, 10), 290);
  const handle = form.container.querySelector('[data-curve-index="4"]');
  const cy = parseFloat(handle.getAttribute('cy'));
  const endCys = Array.from(form.container.querySelectorAll('.config-ui-curve__axis-end'))
    .map((el) => parseFloat(el.getAttribute('cy')));
  assert.ok(cy > Math.max.apply(null, endCys) + 20,
    'short-arc middle 290° sits past both ends on the continuous axis, cy=' + cy);
});

test('zoom and range columns stay visible when ends are equal', () => {
  const form = dragSensitivityForm({ bright: 100, dark: 100, range: [0, 100] });
  const zoom = form.container.querySelector('.config-ui-curve__zoom');
  const range = form.container.querySelector('.config-ui-curve__range');
  assert.ok(zoom && !zoom.hidden, 'zoom must show on equal ends');
  assert.ok(range && !range.hidden, 'range strip must show on equal ends');
});

test('zooming in on pinned equal ends keeps the window across redraws', () => {
  const form = dragSensitivityForm({ bright: 100, dark: 100, range: [0, 100] });
  const wrap = form.container.querySelector('.config-ui-curve');
  wrap.setAttribute('data-curve-view', '95,100');
  wrap.dispatchEvent(new Event('config-ui-curve-refresh'));
  assert.equal(wrap.getAttribute('data-curve-view'), '95,100',
    'a narrow zoom on 100…100 was discarded on redraw');
});

test('dragging an end off a pinned channel does not reset the latched zoom window', () => {
  const form = dragSensitivityForm({ bright: 100, dark: 100, range: [0, 100] });
  const wrap = form.container.querySelector('.config-ui-curve');
  wrap.setAttribute('data-curve-view', '0,100');
  const end = form.container.querySelector('[data-curve-end="to"]');
  form.svg.dispatch('pointerdown', { target: end, clientX: 100, clientY: 10, pointerId: 1 });
  form.svg.dispatch('pointermove', { clientX: 100, clientY: 30, pointerId: 1 });
  form.svg.dispatch('pointerup', { clientX: 100, clientY: 30, pointerId: 1 });
  assert.equal(wrap.getAttribute('data-curve-view'), '0,100',
    'leaving a pinned channel must not reopen a tight window under the end drag');
});

test('zoom in on pinned saturation at 100 stays around the pin without resetting', () => {
  const form = dragSensitivityForm({ bright: 100, dark: 100, range: [0, 100] });
  const wrap = form.container.querySelector('.config-ui-curve');
  const stepIn = form.container.querySelector('[data-curve-zoom="in"]');
  stepIn.dispatchEvent(new Event('click', { bubbles: true }));
  const held = wrap.getAttribute('data-curve-view');
  assert.ok(held, 'zoom in must latch a window');
  const parts = held.split(',').map(parseFloat);
  assert.ok(parts[1] >= 99, 'zoom on 100…100 must keep the pin in view, got ' + held);
  assert.ok(parts[1] - parts[0] < 100, 'zoom in must narrow the window, got ' + held);
});

test('color curve axis ticks are whole numbers', () => {
  const form = dragSensitivityForm({ bright: 98, dark: 9.6, range: [0, 100] });
  const ticks = Array.from(form.container.querySelectorAll('.config-ui-curve__tick'));
  assert.ok(ticks.length > 0);
  ticks.forEach(function (t) {
    const n = parseFloat(t.textContent, 10);
    assert.ok(Number.isFinite(n));
    assert.equal(String(n), t.textContent.trim(),
      'tick must be a whole number, got ' + t.textContent);
  });
});

test('near-equal ends keep shape handles visible on the flat Linear preset', () => {
  const form = dragSensitivityForm({ bright: 100, dark: 99.2, range: [0, 360] });
  assert.ok(form.container.querySelectorAll('.config-ui-curve__handle').length > 0,
    'shape handles must stay visible so a two-point overshoot arch can be authored');
});

test('derived middle placeholder matches valueAlongRamp at the plot midpoint', () => {
  const form = dragSensitivityForm({
    bright: 100, dark: 100, mid: 0, range: [0, 360],
    curve: [0.37, 1.5, 0.63, 1.5]
  });
  const midCell = form.container.querySelector('[data-row-field="a.middle"]');
  assert.ok(midCell, 'middle cell missing');
  assert.equal(midCell.value, '', 'leftover middle value must clear when there is no anchor');
  var ph = parseFloat(midCell.placeholder, 10);
  assert.ok(ph > 40 && ph < 160,
    'derived middle must match the bent curve on the chart, not a stale field: ' + midCell.placeholder);
});

test('dragging the middle anchor writes the channel value under the pointer, not a single-span map of pts[5]', () => {
  /**
   * **Two-segment axis:** the middle handle is the colour at the corner. Dragging it along the
   * continuous short-arc axis writes that value into the middle field and leaves `pts[5]` (pacing)
   * alone. The old single-span path forced the field through `unitToValue(pts[5])` after a margin
   * clamp, which pinned a Hue middle of 300° back near 100° on the chart while generation still
   * used 300° — the cyan-spike disagreement.
   */
  const form = dragSensitivityForm({
    bright: 100, dark: 99.2, mid: 200, range: [0, 360],
    curve: B.bezierWithMiddle([0.37, 0, 0.63, 1], 0.5)
  });
  const ptsBefore = form.points().slice();
  const handle = form.container.querySelector('[data-curve-index="4"]');
  // Top of the short-arc window is further above both ends (100° → 200° is +100°).
  form.svg.dispatch('pointerdown', { target: handle, clientX: 50, clientY: 50, pointerId: 1 });
  form.svg.dispatch('pointermove', { clientX: 50, clientY: 0, pointerId: 1 });
  form.svg.dispatch('pointerup', { clientX: 50, clientY: 0, pointerId: 1 });

  const pts = form.points();
  assert.ok(pts[5] >= 0.001 && pts[5] <= 0.999,
    'pacing height must stay inside its margin: ' + pts[5]);
  assert.ok(Math.abs(pts[5] - ptsBefore[5]) < 1e-6,
    'dragging the middle colour must not rewrite pacing pts[5]: was ' + ptsBefore[5] + ', now ' + pts[5]);
  const midField = form.container.querySelector('[data-row-field="a.middle"]');
  const fieldValue = parseFloat(midField.value, 10);
  // Top of the short-arc window is further above both ends (100° → 200° is +100°).
  assert.ok(fieldValue > 200,
    'middle field must follow the pointer further along the short arc, got ' + fieldValue);
});

test('typing a Hue middle above both ends moves the handle there without rewriting the curve shape', () => {
  const form = dragSensitivityForm({
    bright: 100, dark: 99.2, mid: 100, range: [0, 360],
    curve: B.bezierWithMiddle([0.37, 0, 0.63, 1], 0.5)
  });
  const midField = form.container.querySelector('[data-row-field="a.middle"]');
  const ptsBefore = form.points().slice();
  midField.value = '200';
  midField.dispatchEvent(new Event('input', { bubbles: true }));
  const handle = form.container.querySelector('[data-curve-index="4"]');
  const cy = parseFloat(handle.getAttribute('cy'));
  const endCys = Array.from(form.container.querySelectorAll('.config-ui-curve__axis-end'))
    .map((el) => parseFloat(el.getAttribute('cy')));
  // 200° is on the short arc above both ends (100 → 200 continuous).
  assert.ok(cy < Math.min.apply(null, endCys) - 10,
    'handle should sit above both ends for middle=200, cy=' + cy);
  const pts = form.points();
  assert.deepEqual(Array.from(pts), Array.from(ptsBefore),
    'typing the middle colour must not rewrite curve coordinates');
  assert.equal(midField.value, '200');
});

test('typing a start or end value moves that grip on the chart without rewriting the curve shape', () => {
  /**
   * Same seam the middle input already covered: after adoption the end fields live *inside* the
   * curve wrap, so `refreshCurveControls(…, except)` skips the wrap that contains the keystroke.
   * Without a dedicated listener the number changes and the chart stays put — reported live for
   * Hue start / Hue end.
   */
  const form = dragSensitivityForm({
    bright: 100, dark: 20, range: [0, 100],
    curve: [0.333, 0.333, 0.667, 0.667]
  });
  const bright = form.container.querySelector('[data-row-field="a.bright"]');
  const dark = form.container.querySelector('[data-row-field="a.dark"]');
  const ptsBefore = form.points().slice();

  const fromBefore = parseFloat(
    form.container.querySelector('[data-curve-end="from"]').getAttribute('cy'));
  bright.value = '40';
  bright.dispatchEvent(new Event('input', { bubbles: true }));
  const fromAfter = parseFloat(
    form.container.querySelector('[data-curve-end="from"]').getAttribute('cy'));
  assert.ok(fromAfter > fromBefore + 5,
    'lowering Bright must move the start grip down the chart, before=' + fromBefore + ' after=' + fromAfter);
  assert.deepEqual(Array.from(form.points()), Array.from(ptsBefore),
    'typing an end must restretch the same shape, not rewrite coordinates');

  const toBefore = parseFloat(
    form.container.querySelector('[data-curve-end="to"]').getAttribute('cy'));
  dark.value = '80';
  dark.dispatchEvent(new Event('input', { bubbles: true }));
  const toAfter = parseFloat(
    form.container.querySelector('[data-curve-end="to"]').getAttribute('cy'));
  assert.ok(toAfter < toBefore - 5,
    'raising Dark must move the end grip up the chart, before=' + toBefore + ' after=' + toAfter);
});

test("getValues() keeps an overshoot curve's real height instead of clamping it back to [0,1]", () => {
  /**
   * **The control that drags and draws a curve is not the control that saves it.** `buildCurveControl`
   * shadows `curveValueOf` with a field-scoped version that already threads `field.overshoot` through
   * (`allowOvershoot`) — so the chart itself, and every drag on it, was always correct. But
   * `getValues()`/`collectRows()` read a curve's value back out through the *module-level*
   * `curveValueOf`, outside any one control's closure, which had no `field.overshoot` to read and
   * defaulted to `false` — silently clamping every Y coordinate back into [0,1] the moment the curve
   * was collected for the config block or the live preview. A curve could drag, draw and evaluate
   * exactly right and still write a flattened shape into both — reported live as "the chart doesn't
   * reflect the curve", for a reason that had nothing to do with the colour maths reading it.
   */
  const wild = [0.34, 1.8, 0.64, -0.5];
  const source = [
    '// @UI_CONFIG_START',
    'var a = { bright: 98.2, dark: 9.6 }; // @group: bright:number=B|dark:number=D @label: Ends',
    'var c = ' + JSON.stringify(wild) +
      '; // @curve @ends: a.bright..a.dark @range: 0..100 @overshoot @label: L',
    '// @UI_CONFIG_END',
  ].join('\n');
  const schema = parser.parse(source);
  const container = document.createElement('div');
  renderer.buildForm(schema, container);
  const api = renderer.attachListeners(container, schema, function () {});

  const collected = api.getValues().c;
  assert.deepEqual(Array.from(collected), wild,
    'an overshoot curve\'s real height was clamped on collection: ' + JSON.stringify(collected));
});

test("getValues() keeps an overshoot @rows curve's real height too, not only a field-level one", () => {
  // Same bug, the other collection path: `readRowCellInto` (a `@rows` cell, not a field-level curve)
  // reads `column.overshoot` from the panel spec — colors.js's own Hue/Saturation/Chroma curves are
  // declared exactly this way, via `@PANEL_START`, not the single-field `@curve @overshoot` annotation.
  const wild = [0.34, 1.8, 0.64, -0.5];
  const panelSpec = [
    '// { blocks: [ { key: "modes", type: "rows", columns: [',
    '//   { key: "name", type: "text", label: "Mode" },',
    '//   { key: "bright", type: "number", label: "Bright" },',
    '//   { key: "dark", type: "number", label: "Dark" },',
    '//   { key: "c", type: "curve", overshoot: true, ends: "bright..dark", range: [0, 100], label: "C" }',
    '// ] } ] }',
  ].join('\n');
  const values = 'modes: [{ name: "M", bright: 98.2, dark: 9.6, c: ' + JSON.stringify(wild) + ' }]';
  const schema = parser.parse(values, panelSpec);
  assert.ok(!schema.error, 'fixture panel spec should parse cleanly: ' + schema.error);
  const container = document.createElement('div');
  renderer.buildForm(schema, container);
  const api = renderer.attachListeners(container, schema, function () {});

  const collected = api.getValues().modes[0].c;
  assert.deepEqual(Array.from(collected), wild,
    'an overshoot @rows curve\'s real height was clamped on collection: ' + JSON.stringify(collected));
});
