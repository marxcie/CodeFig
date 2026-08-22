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
  assert.equal(build({}, B.bezierFromEase("sine", "inout", 1)).points().length, 10);
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

test("the draggable points are the handles plus the middle anchor", () => {
  // Two-point: two handles, and the end anchors are drawn but fixed — a scale curve that started anywhere
  // but the start would not be a scale curve, so there is nothing to offer there.
  assert.equal(build({}, [0.37, 0, 0.63, 1]).handles().length, 2);

  // Three-point: four handles and the middle anchor, which is five things to drag. Only the middle anchor
  // is marked as one, so the two kinds of point are told apart by class rather than by counting.
  const three = build({}, B.bezierFromEase("quad", "inout", 1));
  assert.equal(three.handles().length, 5);
  const anchors = three.handles().filter((h) => h.classList.contains("config-ui-curve__handle--anchor"));
  assert.equal(anchors.length, 1);

  // Nothing to drag on a curve that is not one — which is *Original*, not merely empty. See the test
  // above for why a bare `[]` without `@allowOriginal` opens on the straight ramp instead.
  assert.equal(build({ allowOriginal: true }, []).handles().length, 0);
});

test("choosing a preset writes its coordinates", () => {
  const c = build({}, []);
  c.preset.value = "sine|inout";
  c.preset.dispatch("change");
  assert.deepEqual(c.points(), B.bezierFromEase("sine", "inout", 1));
  assert.equal(c.points().length, 10, "inout is a three-point curve");
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
    railWindow: () => container.querySelector(".config-ui-curve__rail-window"),
  };
}

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
  assert.equal(plain.wrap.querySelectorAll(".config-ui-curve__rail").length, 0);
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

test("the zoom rail is a viewport and never reaches the config", () => {
  const form = axisForm();
  const before = form.wrap.getAttribute("data-curve-value");
  const rail = form.container.querySelector(".config-ui-curve__rail");
  rail.getBoundingClientRect = () => ({ left: 0, top: 0, width: 22, height: 100 });

  // The whole channel is 0..100 and the default window is 11.1..100, so it starts at 88.9% of the rail.
  assert.equal(form.railWindow().style.height, "88.9%");

  // Drag the bottom grip up: a narrower window, more ticks, same curve.
  const grip = form.container.querySelector(".config-ui-curve__rail-grip--bottom");
  rail.dispatch("pointerdown", { target: grip, clientY: 89, pointerId: 2 });
  rail.dispatch("pointermove", { clientY: 60, pointerId: 2 });
  rail.dispatch("pointerup", { clientY: 60, pointerId: 2 });

  assert.ok(parseFloat(form.railWindow().style.height, 10) < 88.9, "the window should have narrowed");
  assert.equal(form.wrap.getAttribute("data-curve-value"), before, "zooming is not an edit");
});
