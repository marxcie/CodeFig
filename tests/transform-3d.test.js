/**
 * Fixture tests for the projection maths in scripts/EXAMPLE_SCRIPTS/transform-3d.js.
 *
 * A wrong sign, a mis-ordered rotation or a bad tangent is silent in Figma: the shape
 * still draws, only the wrong shape. The script runs here against a stub `figma` with an
 * empty selection, and the pure functions are read back out of it.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'EXAMPLE_SCRIPTS', 'transform-3d.js');

function load() {
  const source = fs.readFileSync(SCRIPT, 'utf8');
  const stub = { currentPage: { selection: [] }, notify() {} };
  const fn = new Function(
    'figma',
    'window',
    source + '\nreturn { prepareTargets, groupResultSets, buildCamera, projectPoint, transformNetwork, remapLoop, networkOrigin, parseSeries, seriesValue, copyOffsets, buildSideNetwork, frontFacesCamera };'
  );
  const out = fn(stub, {});
  out.stub = stub;
  return out;
}

const lib = load();
const IDENTITY = [[1, 0, 0], [0, 1, 0]];

function rectNet(w, h) {
  const z = { x: 0, y: 0 };
  return {
    vertices: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }],
    segments: [0, 1, 2, 3].map((i) => ({ start: i, end: (i + 1) % 4, tangentStart: z, tangentEnd: z })),
    regions: [{ windingRule: 'NONZERO', loops: [[0, 1, 2, 3]] }]
  };
}

function near(a, b, eps = 1e-9) {
  assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
}

test('zero rotation leaves points where they were', () => {
  const cam = lib.buildCamera(0, 0, 0, 60, 50, 50, 100);
  const out = lib.transformNetwork(rectNet(100, 100), IDENTITY, cam, 8);
  out.vertices.forEach((v, i) => {
    const src = rectNet(100, 100).vertices[i];
    near(v.x, src.x);
    near(v.y, src.y);
  });
});

test('rotate Y positive pushes the right edge away, so it shrinks under perspective', () => {
  const cam = lib.buildCamera(0, 40, 0, 60, 50, 50, 100);
  const out = lib.transformNetwork(rectNet(100, 100), IDENTITY, cam, 8);
  const rightHeight = out.vertices[2].y - out.vertices[1].y;
  const leftHeight = out.vertices[3].y - out.vertices[0].y;
  assert.ok(rightHeight < leftHeight);
});

test('rotate X positive pushes the top edge away, so it narrows', () => {
  const cam = lib.buildCamera(40, 0, 0, 60, 50, 50, 100);
  const out = lib.transformNetwork(rectNet(100, 100), IDENTITY, cam, 8);
  const topWidth = out.vertices[1].x - out.vertices[0].x;
  const bottomWidth = out.vertices[2].x - out.vertices[3].x;
  assert.ok(topWidth < bottomWidth);
});

test('rotate Z positive spins counterclockwise on screen', () => {
  const cam = lib.buildCamera(0, 0, 90, 0, 0, 0, 100);
  const p = lib.projectPoint(cam, 10, 0, 0, 0);
  near(p.x, 0);
  near(p.y, -10);
});

test('fov 0 is orthographic, so a 90 degree Y turn collapses width and keeps height', () => {
  const cam = lib.buildCamera(0, 90, 0, 0, 50, 50, 100);
  const out = lib.transformNetwork(rectNet(100, 100), IDENTITY, cam, 8);
  near(out.vertices[1].x, out.vertices[0].x);
  near(out.vertices[2].y - out.vertices[1].y, 100);
});

test('a point behind the camera throws', () => {
  const cam = lib.buildCamera(0, 80, 0, 150, 0, 0, 100);
  assert.throws(() => lib.projectPoint(cam, -400, 0, 0, 0), /behind the camera/);
});

test('projected curve pieces stay within a hair of the exact projection', () => {
  // A quarter circle of radius 100 as one cubic, projected hard.
  const k = 0.5522847498 * 100;
  const net = {
    vertices: [{ x: 100, y: 0 }, { x: 0, y: 100 }],
    segments: [{ start: 0, end: 1, tangentStart: { x: 0, y: k }, tangentEnd: { x: k, y: 0 } }],
    regions: []
  };
  const cam = lib.buildCamera(35, 50, 10, 70, 0, 0, 200);
  const out = lib.transformNetwork(net, IDENTITY, cam, 16);

  let worst = 0;
  out.segments.forEach((seg) => {
    const a = out.vertices[seg.start];
    const b = out.vertices[seg.end];
    for (let t = 0; t <= 1; t += 0.25) {
      const mt = 1 - t;
      const x = mt ** 3 * a.x + 3 * mt * mt * t * (a.x + seg.tangentStart.x) +
        3 * mt * t * t * (b.x + seg.tangentEnd.x) + t ** 3 * b.x;
      const y = mt ** 3 * a.y + 3 * mt * mt * t * (a.y + seg.tangentStart.y) +
        3 * mt * t * t * (b.y + seg.tangentEnd.y) + t ** 3 * b.y;
      // Distance to the exact projection of the original cubic, found by dense sampling.
      let best = Infinity;
      for (let u = 0; u <= 1; u += 0.0001) {
        const mu = 1 - u;
        const cx = mu ** 3 * 100 + 3 * mu * mu * u * 100 + 3 * mu * u * u * k + u ** 3 * 0;
        const cy = mu ** 3 * 0 + 3 * mu * mu * u * k + 3 * mu * u * u * 100 + u ** 3 * 100;
        const p = lib.projectPoint(cam, cx, cy, 0, 0);
        best = Math.min(best, Math.hypot(p.x - x, p.y - y));
      }
      worst = Math.max(worst, best);
    }
  });
  assert.ok(worst < 0.05, `worst deviation ${worst}`);
});

test('loops keep a connected walk after segments split, including reversed ones', () => {
  const z = { x: 0, y: 0 };
  const net = {
    vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }],
    segments: [
      { start: 0, end: 1, tangentStart: { x: 30, y: -30 }, tangentEnd: { x: -30, y: -30 } },
      { start: 2, end: 1, tangentStart: z, tangentEnd: z },
      { start: 2, end: 0, tangentStart: z, tangentEnd: z }
    ],
    regions: [{ windingRule: 'NONZERO', loops: [[0, 1, 2]] }]
  };
  const cam = lib.buildCamera(10, 10, 0, 60, 0, 0, 100);
  const out = lib.transformNetwork(net, IDENTITY, cam, 4);
  const loop = out.regions[0].loops[0];
  assert.strictEqual(loop.length, 4 + 1 + 1);

  let cur = null;
  loop.forEach((idx, i) => {
    const s = out.segments[idx];
    if (i === 0) {
      cur = s.end;
      return;
    }
    assert.ok(s.start === cur || s.end === cur, `segment ${idx} does not connect`);
    cur = s.start === cur ? s.end : s.start;
  });
});

function series(text) {
  const parsed = lib.parseSeries(text, 'Field');
  return [0, 1, 2, 3].map((k) => lib.seriesValue(parsed, k));
}

test('a series applies its operator to the previous value for each copy', () => {
  assert.deepStrictEqual(series('120'), [120, 120, 120, 120]);
  assert.deepStrictEqual(series('90 + 5'), [90, 95, 100, 105]);
  assert.deepStrictEqual(series('90-5'), [90, 85, 80, 75]);
  assert.deepStrictEqual(series('120 * 2'), [120, 240, 480, 960]);
  assert.deepStrictEqual(series('120 x 2'), [120, 240, 480, 960]);
  assert.deepStrictEqual(series('120 \u00d7 2'), [120, 240, 480, 960]);
  assert.deepStrictEqual(series('80 / 2'), [80, 40, 20, 10]);
  assert.deepStrictEqual(series('-10 + -5'), [-10, -15, -20, -25]);
  assert.deepStrictEqual(series(''), [0, 0, 0, 0]);
  assert.deepStrictEqual(series(45), [45, 45, 45, 45]);
});

test('a malformed series is refused with the field name', () => {
  assert.throws(() => lib.parseSeries('45 ** 2', 'Angle'), /Angle/);
  assert.throws(() => lib.parseSeries('abc', 'Distance'), /Distance/);
  assert.throws(() => lib.parseSeries('10 / 0', 'Distance'), /divide/);
});

test('copy offsets accumulate, with angle 0 right and 90 up', () => {
  const right = lib.copyOffsets(2, lib.parseSeries('100', 'd'), lib.parseSeries('0', 'a'));
  near(right[1].x, 100);
  near(right[2].x, 200);
  near(right[2].y, 0);

  const up = lib.copyOffsets(1, lib.parseSeries('50', 'd'), lib.parseSeries('90', 'a'));
  near(up[1].x, 0);
  near(up[1].y, -50);

  const geometric = lib.copyOffsets(3, lib.parseSeries('10 * 2', 'd'), lib.parseSeries('0', 'a'));
  near(geometric[3].x, 10 + 20 + 40);
  assert.strictEqual(lib.copyOffsets(0, lib.parseSeries('10', 'd'), lib.parseSeries('0', 'a')).length, 1);
});

test('depth at zero projects the same as no depth, and back points sit behind the front', () => {
  const cam = lib.buildCamera(0, 0, 0, 60, 50, 50, 100);
  const front = lib.projectPoint(cam, 10, 10, 0, 0, 0);
  const back = lib.projectPoint(cam, 10, 10, 0, 0, -40);
  assert.ok(Math.abs(back.x - 50) < Math.abs(front.x - 50), 'back copy is smaller, so farther away');
});

test('side network has one closed four-sided region per outline segment', () => {
  const cam = lib.buildCamera(20, 30, 0, 60, 50, 50, 100);
  const front = lib.transformNetwork(rectNet(100, 100), IDENTITY, cam, 8, 0);
  const back = lib.transformNetwork(rectNet(100, 100), IDENTITY, cam, 8, -30);
  const side = lib.buildSideNetwork(front, back);
  assert.strictEqual(side.regions.length, front.segments.length);

  side.regions.forEach((region) => {
    const loop = region.loops[0];
    assert.strictEqual(loop.length, 4);
    let cur = null;
    loop.forEach((idx, i) => {
      const seg = side.segments[idx];
      if (i === 0) {
        const next = side.segments[loop[1]];
        cur = [seg.start, seg.end].find((v) => v === next.start || v === next.end);
        return;
      }
      assert.ok(seg.start === cur || seg.end === cur, 'walk is connected');
      cur = seg.start === cur ? seg.end : seg.start;
    });
  });
});

test('the front faces the camera at rest and not after a half turn about Y', () => {
  const rest = lib.buildCamera(0, 0, 0, 60, 0, 0, 100);
  const turned = lib.buildCamera(0, 180, 0, 60, 0, 0, 100);
  assert.strictEqual(lib.frontFacesCamera(rest, 0, 0), true);
  assert.strictEqual(lib.frontFacesCamera(turned, 0, 0), false);
});

// ---- converting text and frames --------------------------------------------------------

function mul(p, q) {
  return [
    [p[0][0] * q[0][0] + p[0][1] * q[1][0], p[0][0] * q[0][1] + p[0][1] * q[1][1], p[0][0] * q[0][2] + p[0][1] * q[1][2] + p[0][2]],
    [p[1][0] * q[0][0] + p[1][1] * q[1][0], p[1][0] * q[0][1] + p[1][1] * q[1][1], p[1][0] * q[0][2] + p[1][1] * q[1][2] + p[1][2]]
  ];
}

function fakeNode(type, name, x, y, extra) {
  const node = Object.assign({
    type, name, locked: false, visible: true, opacity: 1, blendMode: 'NORMAL', children: [], parent: null,
    width: 100, height: 50, fills: [], strokes: [], effects: [],
    relativeTransform: [[1, 0, x], [0, 1, y]]
  }, extra || {});
  Object.defineProperty(node, 'absoluteTransform', {
    get() {
      const parentAbs = node.parent && node.parent.absoluteTransform;
      return parentAbs ? mul(parentAbs, node.relativeTransform) : node.relativeTransform;
    }
  });
  node.insertChild = function (i, child) {
    if (child.parent) {
      const old = child.parent;
      old.children.splice(old.children.indexOf(child), 1);
      if (old.onChildLeft) old.onChildLeft(child);
    }
    node.children.splice(i, 0, child);
    child.parent = node;
  };
  node.remove = function () {
    node.parent.children.splice(node.parent.children.indexOf(node), 1);
    node.parent = null;
  };
  node.resize = function (w, h) { node.width = w; node.height = h; };
  return node;
}

function fakePage() {
  return { children: [], insertChild(i, c) { if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1); this.children.splice(i, 0, c); c.parent = this; } };
}

function wireFigma(env) {
  env.stub.mixed = Symbol('mixed');
  env.stub.createRectangle = () => {
    const rect = fakeNode('RECTANGLE', 'Rectangle', 0, 0);
    let blend = 'NORMAL';
    let fills = [];
    Object.defineProperty(rect, 'fills', {
      get: () => fills,
      set: (v) => { if (v.some((p) => p.type === 'PATTERN')) throw new Error('invalid paint'); fills = v; }
    });
    Object.defineProperty(rect, 'blendMode', {
      get: () => blend,
      set: (v) => { if (v === 'PASS_THROUGH') throw new Error('invalid blend mode'); blend = v; }
    });
    return rect;
  };
  env.stub.flatten = (nodes) => {
    const src = nodes[0];
    if (src.visible === false) throw new Error('Failed to apply flatten operation');
    const vector = fakeNode('VECTOR', src.name, 0, 0);
    src.parent.insertChild(src.parent.children.indexOf(src), vector);
    src.remove();
    return vector;
  };
}

test('a filled frame becomes a rectangle with its children moved out above it', async () => {
  const env = load();
  wireFigma(env);
  const page = fakePage();
  const frame = fakeNode('FRAME', 'Card', 100, 50, { fills: [{ type: 'SOLID', visible: true }, { type: 'PATTERN', visible: false }], opacity: 0.5, blendMode: 'PASS_THROUGH' });
  page.insertChild(0, frame);
  const a = fakeNode('RECTANGLE', 'A', 10, 10);
  const b = fakeNode('ELLIPSE', 'B', 20, 20);
  frame.insertChild(0, a);
  frame.insertChild(1, b);

  const targets = [];
  const skipped = [];
  await env.prepareTargets([frame], targets, skipped);

  assert.deepStrictEqual(page.children.map((n) => n.name), ['Card', 'A', 'B']);
  assert.strictEqual(page.children[0].type, 'RECTANGLE');
  assert.strictEqual(page.children[0].width, 100);
  assert.deepStrictEqual(targets.map((n) => n.name), ['Card', 'A', 'B']);
  assert.strictEqual(targets[0].type, 'RECTANGLE');
  assert.deepStrictEqual(targets[0].fills.map((f) => f.type), ['SOLID']);
  assert.ok(page.children.includes(frame) === false);
  near(a.absoluteTransform[0][2], 110);
  near(a.absoluteTransform[1][2], 60);
  near(a.opacity, 0.5);
  assert.deepStrictEqual(skipped, []);
});

test('a frame with no fill or stroke only releases its children', async () => {
  const env = load();
  wireFigma(env);
  const page = fakePage();
  const frame = fakeNode('FRAME', 'Wrapper', 0, 0);
  page.insertChild(0, frame);
  frame.insertChild(0, fakeNode('RECTANGLE', 'Only', 5, 5));
  const targets = [];
  await env.prepareTargets([frame], targets, []);
  assert.deepStrictEqual(page.children.map((n) => n.name), ['Only']);
  assert.strictEqual(targets.length, 1);
});

test('text is flattened to a vector and nested frames are handled in turn', async () => {
  const env = load();
  wireFigma(env);
  const page = fakePage();
  const outer = fakeNode('FRAME', 'Outer', 0, 0);
  const inner = fakeNode('FRAME', 'Inner', 10, 10, { strokes: [{ type: 'SOLID', visible: true }] });
  const label = fakeNode('TEXT', 'Label', 5, 5);
  page.insertChild(0, outer);
  outer.insertChild(0, inner);
  inner.insertChild(0, label);

  const targets = [];
  await env.prepareTargets([outer], targets, []);
  assert.deepStrictEqual(targets.map((n) => n.type), ['RECTANGLE', 'VECTOR']);
  assert.deepStrictEqual(page.children.map((n) => n.type), ['RECTANGLE', 'VECTOR']);
});

test('locked layers, components and auto layout children are skipped by name', async () => {
  const env = load();
  wireFigma(env);
  const page = fakePage();
  const locked = fakeNode('RECTANGLE', 'Locked', 0, 0, { locked: true });
  const instance = fakeNode('INSTANCE', 'Button', 0, 0);
  const row = fakeNode('FRAME', 'Row', 0, 0, { layoutMode: 'HORIZONTAL' });
  const kid = fakeNode('RECTANGLE', 'Kid', 0, 0);
  page.insertChild(0, locked);
  page.insertChild(1, instance);
  page.insertChild(2, row);
  row.insertChild(0, kid);

  const targets = [];
  const skipped = [];
  await env.prepareTargets([locked, instance, kid], targets, skipped);
  assert.strictEqual(targets.length, 0);
  assert.deepStrictEqual(skipped, ['Locked (locked)', 'Button (instance)', 'Kid (auto layout)']);
});

test('a frame that cannot be copied leaves no stray rectangle behind', async () => {
  const env = load();
  wireFigma(env);
  const page = fakePage();
  const frame = fakeNode('FRAME', 'Bad', 0, 0, { fills: [{ type: 'SOLID', visible: true }] });
  page.insertChild(0, frame);
  Object.defineProperty(frame, 'effects', { get() { throw new Error('boom'); } });
  await assert.rejects(env.prepareTargets([frame], [], []), /boom/);
  assert.deepStrictEqual(page.children.map((n) => n.name), ['Bad']);
});

test('children keep their canvas position when an auto layout frame reflows as they leave', async () => {
  const env = load();
  wireFigma(env);
  const page = fakePage();
  const frame = fakeNode('FRAME', 'List', 0, 0, { layoutMode: 'VERTICAL' });
  page.insertChild(0, frame);
  const a = fakeNode('RECTANGLE', 'A', 0, 0);
  const b = fakeNode('RECTANGLE', 'B', 0, 200);
  frame.insertChild(0, a);
  frame.insertChild(1, b);
  frame.onChildLeft = () => {
    if (frame.layoutMode !== 'NONE') frame.children.forEach((c) => { c.relativeTransform = [[1, 0, 0], [0, 1, 0]]; });
  };
  await env.prepareTargets([frame], [], []);
  near(b.absoluteTransform[1][2], 200);
});

function wireGroup(env) {
  env.stub.group = (items, parent, index) => {
    const group = fakeNode('GROUP', 'Group', 0, 0);
    parent.insertChild(index, group);
    items.forEach((n) => group.insertChild(group.children.length, n));
    return group;
  };
}

test('several results from one layer are grouped under its name, in the same parent', () => {
  const env = load();
  wireGroup(env);
  const page = fakePage();
  const items = ['a', 'b', 'c'].map((n) => fakeNode('VECTOR', n, 0, 0));
  items.forEach((n, i) => page.insertChild(i, n));
  const out = env.groupResultSets([items], page, 'Card');
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].name, 'Card');
  assert.strictEqual(out[0].children.length, 3);
  assert.strictEqual(page.children.length, 1);
});

test('layers inside an original group move with that group, and a single result is not wrapped', () => {
  const env = load();
  wireGroup(env);
  const page = fakePage();
  const mask = fakeNode('GROUP', 'Mask group', 0, 0);
  const lone = fakeNode('VECTOR', 'lone', 0, 0);
  page.insertChild(0, mask);
  page.insertChild(1, lone);
  const inner = fakeNode('VECTOR', 'inner', 0, 0);
  mask.insertChild(0, inner);
  const out = env.groupResultSets([[inner, lone]], page, 'Card');
  assert.strictEqual(out[0].name, 'Card');
  assert.strictEqual(out[0].children.includes(mask), true);

  const solo = env.groupResultSets([[fakeNode('VECTOR', 'x', 0, 0)]], null, 'Card');
  assert.strictEqual(solo.length, 1);
});

test('copies are grouped separately, and shared containers cancel grouping', () => {
  const env = load();
  wireGroup(env);
  const page = fakePage();
  const mk = (n, i) => { const v = fakeNode('VECTOR', n, 0, 0); page.insertChild(i, v); return v; };
  const sets = [[mk('a', 0), mk('b', 1)], [mk('c', 2), mk('d', 3)]];
  const out = env.groupResultSets(sets, page, 'Card');
  assert.deepStrictEqual(out.map((g) => g.name), ['Card', 'Card copy 1']);

  const shared = fakeNode('GROUP', 'Shared', 0, 0);
  const page2 = fakePage();
  page2.insertChild(0, shared);
  const p = fakeNode('VECTOR', 'p', 0, 0);
  const q = fakeNode('VECTOR', 'q', 0, 0);
  shared.insertChild(0, p);
  shared.insertChild(1, q);
  const flat = env.groupResultSets([[p], [q]], page2, 'Card');
  assert.deepStrictEqual(flat.map((n) => n.name), ['p', 'q']);
});

test('a hidden text layer is flattened and stays hidden', async () => {
  const env = load();
  wireFigma(env);
  const page = fakePage();
  const text = fakeNode('TEXT', 'Ghost', 0, 0, { visible: false });
  page.insertChild(0, text);
  const targets = [];
  await env.prepareTargets([text], targets, []);
  assert.strictEqual(targets.length, 1);
  assert.strictEqual(targets[0].visible, false);
});
