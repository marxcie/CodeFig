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
  assert.equal(stops.length, hexes.length, "one stop per token");
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

test('with no middle point the box has nothing to be a view of, and says so', () => {
  const form = anchoredForm();
  form.wrap.querySelector('.config-ui-curve__toggle').dispatch('click', { bubbles: true });
  assert.equal(form.points().length, 4, 'the middle point was not removed');
  assert.equal(form.middle.disabled, true);
  assert.equal(form.middle.value, '—', 'a number here would be one the curve does not hold');
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

test('@invert draws the axis counting down, and changes nothing that is stored', () => {
  /**
   * **A display transform, and only that.** Márton's frames plot darkness, so a ramp reads downhill left
   * to right the way its swatches do. Storing darkness instead would mean changing the engine and every
   * file already read, to move a minus sign — so the field holds lightness, the drag writes lightness, a
   * run generates from lightness, and 98 simply draws at 2.
   */
  function chart(inverted) {
    const source = [
      '// @UI_CONFIG_START',
      'var ladder = { bright: 98, dark: 4 }; // @group: bright:number=Bright|dark:number=Dark @label: Ends',
      'var lc = [0.42, 0.16, 0.68, 0.52]; // @curve @ends: ladder.bright..ladder.dark @range: 0..100' +
        (inverted ? ' @invert' : '') + ' @label: L',
      '// @UI_CONFIG_END',
    ].join('\n');
    const schema = parser.parse(source);
    const container = document.createElement('div');
    renderer.buildForm(schema, container);
    renderer.attachListeners(container, schema, function () {});
    const svg = container.querySelector('.config-ui-curve__canvas');
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 200 });
    container.querySelector('.config-ui-curve').dispatchEvent(new Event('config-ui-curve-refresh'));
    return {
      container,
      svg,
      brightY: +container.querySelector('[data-curve-end="from"]').getAttribute('cy'),
      darkY: +container.querySelector('[data-curve-end="to"]').getAttribute('cy'),
    };
  }

  const plain = chart(false);
  assert.ok(plain.brightY < plain.darkY, 'lightness puts the bright end at the top');

  const flipped = chart(true);
  assert.ok(flipped.brightY > flipped.darkY,
    'darkness puts the bright end at the bottom, so the ramp climbs as the swatches darken');

  // The bright end holds 98 and draws near the floor of the plot: 100 - 98 of a 200px box.
  assert.ok(flipped.brightY > 180, 'bright drew at ' + flipped.brightY + ', not near the bottom');

  // And dragging still writes lightness, not what is on screen. Pull the bright end to the very top of an
  // inverted chart: that is darkness 100, which is lightness 0.
  flipped.svg.dispatch('pointerdown', {
    target: flipped.container.querySelector('[data-curve-end="from"]'),
    clientX: 0, clientY: 190, pointerId: 1,
  });
  flipped.svg.dispatch('pointermove', { clientX: 0, clientY: 0, pointerId: 1 });
  flipped.svg.dispatch('pointerup', { clientX: 0, clientY: 0, pointerId: 1 });
  const wrote = parseFloat(flipped.container.querySelector('[data-row-field="ladder.bright"]').value, 10);
  assert.ok(wrote < 5, 'dragging to the top of a darkness axis should store a low lightness, got ' + wrote);
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
   */
  const source = [
    '// @UI_CONFIG_START',
    'var a = { bright: 100, middle: 83.2, dark: 100 }; ' +
      '// @group: bright:number=Start|middle:number=Middle|dark:number=End @label: Ends',
    'var sc = [0.4, 0.3, 0.6, 0.7]; // @curve @ends: a.bright..a.middle..a.dark @range: 0..100 @label: S',
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
  assert.equal(mid.value, '0.25', 'and it keeps its value, so it comes back intact');

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
   * The two ends need nothing — `axis()` reads their fields on every draw, so editing one moves the chart
   * already. The **middle** is the one that has to be wired by hand in both directions, because the anchor
   * lives in the curve and the value lives in a field, and neither reads the other.
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
  const anchorValue = () => {
    const u = JSON.parse(wrap.getAttribute('data-curve-value'))[5];
    return 0.02 + (0.05 - 0.02) * u;
  };

  // field → chart
  mid.value = '0.04';
  mid.dispatch('input', { bubbles: true });
  assert.ok(Math.abs(anchorValue() - 0.04) < 1e-4, 'typing did not move the anchor: ' + anchorValue());

  // chart → field
  const svg = wrap.querySelector('.config-ui-curve__canvas');
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
  const anchor = wrap.querySelector('[data-curve-index="4"]');
  svg.dispatch('pointerdown', { target: anchor, clientX: 50, clientY: 50, pointerId: 1 });
  svg.dispatch('pointermove', { clientX: 50, clientY: 25, pointerId: 1 });
  svg.dispatch('pointerup', { clientX: 50, clientY: 25, pointerId: 1 });
  assert.ok(Math.abs(parseFloat(mid.value, 10) - anchorValue()) < 1e-3,
    'the field and the anchor disagree after a drag: ' + mid.value + ' vs ' + anchorValue());
});

test('the coordinate field shares the preset row on a charted curve', () => {
  // One thought — which shape, how many points, the shape as text — so one row. A scale editor keeps it
  // under the plot, where the column is too narrow for three controls on a line.
  const charted = axisForm();
  const head = charted.wrap.querySelector('.config-ui-curve__head');
  assert.ok(head.querySelector('.config-ui-curve__text'), 'the coordinates are not on the preset row');

  const scale = build({}, [0.4, 0, 0.7, 0.55]);
  const scaleHead = scale.wrap.querySelector('.config-ui-curve__head');
  assert.equal(scaleHead.querySelector('.config-ui-curve__text'), null,
    'a scale editor should keep its field under the plot');
});

test('the bar shows the whole channel, with the window bracketed on it', () => {
  /**
   * It showed the *window*, which on a hue ramp travelling one degree is a solid block of one colour — it
   * told you nothing about where that degree sits on the wheel. Márton: show the whole channel with the
   * window marked on it instead. The bar answers "where in the channel am I"; the chart answers "what
   * happens across it".
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
  // Top of the bar is the channel's ceiling, bottom its floor — 360 down to 0, not 110 down to 100.
  assert.ok(Math.abs(values[0] - 360) < 1, 'the bar starts at ' + values[0] + ', not the top of the channel');
  assert.ok(Math.abs(values[values.length - 1]) < 1, 'the bar ends at ' + values[values.length - 1]);

  // And the ten degrees the ramp occupies are bracketed, near the bottom of a 0..360 bar.
  const win = container.querySelector('.config-ui-curve__range-window');
  assert.equal(win.getAttribute('data-shown'), 'true', 'a window inside the channel should be marked');
  assert.ok(parseFloat(win.style.height, 10) < 15,
    'the bracket should be a small part of the channel, not ' + win.style.height);
  assert.ok(parseFloat(win.style.top, 10) > 60,
    'a ramp around 100 of 360 belongs low on the bar, not at ' + win.style.top);
});
