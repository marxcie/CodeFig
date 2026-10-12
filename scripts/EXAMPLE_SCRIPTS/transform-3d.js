// 3D transform
// @DOC_START
// # Rotates selected shapes in 3D and redraws them as flat vector outlines with true perspective
//
// ## Overview
//
// Figma only transforms layers in 2D, so this script converts each selected shape to a vector and
// moves its points through a 3D rotation and a perspective camera. The result is a normal vector
// layer you can edit. Rounded corners and curves stay smooth, and strokes stay strokes.
//
// The selected layers are replaced in place. Use undo to go back.
//
// ### Copies
//
// Copies adds that many extra duplicates of the whole selection. The original stays as the first
// one, so 4 copies gives five in total. Each copy moves along a direction by a distance, and
// turns by its own rotation, around its own pivot.
//
// Distance, Angle and the three rotations accept a series written as `start operator step`.
// The start value applies to the original. Each further copy applies the operator and step to the
// previous value. Use `+`, `-`, `*`, `/` (or `x`). A plain number stays the same for every copy.
//
// | Entry | Values for the first four shapes |
// | --- | --- |
// | `120` | 120, 120, 120, 120 |
// | `90 + 5` | 90, 95, 100, 105 |
// | `120 * 2` | 120, 240, 480, 960 |
//
// Distance and Angle describe the move from one copy to the next, so the first move uses the
// start value. Angle 0 points right and 90 points up, counterclockwise, like Rotate Z. Each new
// copy sits above the previous one in the layer stack.
//
// ### Works on
//
// Rectangles, ellipses, polygons, stars, lines, vectors, boolean groups, and groups of those.
//
// Text is flattened to vector outlines first. A frame, including an auto layout frame, is taken
// apart. Its own fill and stroke become a rectangle with the same size, corners and effects, and
// its children move out above that rectangle at the same position, then get transformed too.
// Layout, clipping and constraints on the frame are lost, and a frame's opacity is multiplied into
// its children.
//
// When one selected layer turns into several, such as a frame with text and cards, the results are
// wrapped in a group named after the original. Layers that were inside a group stay in it, so masks
// keep working.
//
// Components, instances, hidden frames, and layers inside an auto layout frame that is not part
// of the selection are skipped. The notification names what was skipped.
//
// ### Rotation
//
// Rotate X and Rotate Y turn the shape toward or away from you. Rotate Z spins it in the canvas
// plane and is applied last, so it rolls the finished 3D result.
//
// ### Perspective
//
// Field of view sets how far the camera sits from the pivot area. A low value looks almost flat.
// A high value stretches the near edge. At 0 there is no perspective at all. If a rotation swings a
// point behind the camera, the script stops and asks for a lower rotation or field of view.
//
// ### Depth
//
// Depth extrudes each shape backward by that many pixels, so a rectangle turns into a slab. Each
// shape then becomes a group of three vector layers named Front face, Side face and Back face.
// The faces that point toward the camera sit on top, so the stack flips when you turn a shape
// past edge-on. The Front face keeps its original place, and the Back face and Side face follow
// the same rotation.
//
// The Side face copies the solid fill of the shape, 25% darker, with a hairline stroke in the same
// colour that hides seams between its panels. It has no other stroke. The Back face copies the
// fills and strokes of the front.
//
// ### Limits
//
// - Fills are not warped. A gradient or image keeps its flat look inside the new outline.
// - Stroke width stays the same on screen instead of foreshortening.
// - Effects such as blur and shadow stay flat.
//
// ## Configuration options
//
// Controls match the Configuration UI. The code key is shown under each label for Source edits.
//
// | Control | Description |
// | --- | --- |
// | **Rotate X**<br>`rotateX` | Degrees, or a series. Positive tilts the top edge away from you. |
// | **Rotate Y**<br>`rotateY` | Degrees, or a series. Positive turns the right edge away from you. |
// | **Rotate Z**<br>`rotateZ` | Degrees, or a series. Positive spins counterclockwise, like Figma's rotation field. |
// | **Field of view**<br>`fov` | Degrees from 0 to 170. 0 removes perspective. |
// | **Pivot of**<br>`pivotOf` | `selection` rotates all layers around one shared pivot. `each layer` rotates each layer around its own. |
// | **Pivot point**<br>`pivotPoint` | Which point of the selection or layer stays in place while it rotates. |
// | **Depth**<br>`depth` | Pixels to extrude backward. 0 keeps a single layer per shape. |
// | **Copies**<br>`copies` | Extra duplicates of the selection, from 0 to 200. 0 only transforms the selection. |
// | **Distance**<br>`copyDistance` | Pixels from one copy to the next, or a series. |
// | **Angle**<br>`copyAngle` | Direction of that move in degrees, or a series. |
// @DOC_END

// @UI_CONFIG_START
var rotateX = "0";
var rotateY = "40";
var rotateZ = "0";
var fov = 60;
var pivotOf = "selection";
var pivotPoint = "center";
var depth = 0;
var copies = 0;
var copyDistance = "120";
var copyAngle = "90";
// @UI_CONFIG_END

// @PANEL_START
var __codefigPanel = {
  blocks: [
    { type: "heading", level: 2, text: "Rotation" },
    { key: "rotateX", type: "string", label: "Rotate X", placeholder: "0 + 20", helper: "Degrees. Tilts the top edge away from you, and negative tilts it toward you. With copies, enter a series like 0 + 20 to turn each copy further." },
    { key: "rotateY", type: "string", label: "Rotate Y", placeholder: "0 + 20", helper: "Degrees. Turns the right edge away from you, and negative turns it toward you. With copies, enter a series like 0 + 20 to turn each copy further." },
    { key: "rotateZ", type: "string", label: "Rotate Z", placeholder: "0 + 20", helper: "Degrees. Spins the shape counterclockwise on the canvas, like Figma's rotation field. With copies, enter a series like 0 + 20." },
    { type: "heading", level: 2, text: "Camera" },
    { key: "fov", type: "number", label: "Field of view", unit: "°", helper: "Sets how strong the perspective looks. Low values look flat, high values exaggerate the near edge. 0 turns perspective off." },
    { type: "heading", level: 2, text: "Pivot" },
    { key: "pivotOf", type: "radio", label: "Pivot of", options: ["selection", "each layer"], helper: "Selection keeps stacked layers in one shared 3D scene. Each layer rotates every shape on its own." },
    { key: "pivotPoint", type: "select", label: "Pivot point", options: ["center", "top left", "top", "top right", "left", "right", "bottom left", "bottom", "bottom right"], helper: "The point that stays in place while the shape rotates. Defaults to the center." },
    { type: "heading", level: 2, text: "Depth" },
    { key: "depth", type: "number", label: "Depth", unit: "px", helper: "How far to extrude each shape backward. 0 keeps one layer. Above 0, each shape becomes a group of Front face, Side face and Back face." },
    { type: "heading", level: 2, text: "Copies" },
    { key: "copies", type: "number", label: "Copies", helper: "Extra duplicates of the selection. 0 only transforms what is selected. Each copy also gets its own rotation from the series above." },
    { key: "copyDistance", type: "string", label: "Distance", placeholder: "120 * 0.8", helper: "Pixels from one copy to the next. Enter 120 for an even gap, or a series like 120 * 0.8 to shrink it each time." },
    { key: "copyAngle", type: "string", label: "Angle", placeholder: "90 + 5", helper: "Direction of each move in degrees. 0 points right and 90 points up. Enter a series like 90 + 5 to curve the line of copies." }
  ]
};
// @PANEL_END

var CURVE_PIECES = 16;
var MAX_COPIES = 200;
var SIDE_SHADE = 0.75;
var SEAM_STROKE = 0.5;
var CLIP_FRACTION = 0.02;
var SHAPE_TYPES = ["RECTANGLE", "ELLIPSE", "POLYGON", "STAR", "VECTOR", "LINE", "BOOLEAN_OPERATION"];
var PIVOT_FRACTIONS = {
  "center": [0.5, 0.5],
  "top left": [0, 0],
  "top": [0.5, 0],
  "top right": [1, 0],
  "left": [0, 0.5],
  "right": [1, 0.5],
  "bottom left": [0, 1],
  "bottom": [0.5, 1],
  "bottom right": [1, 1]
};

function degToRad(d) {
  return (d * Math.PI) / 180;
}

/**
 * Reads "start", or "start operator step" with + - * / x or ×. Empty means 0.
 */
function parseSeries(text, label) {
  var s = String(text === undefined || text === null ? "" : text).trim();
  if (s === "") return { start: 0, op: null, step: 0 };
  var m = s.match(/^(-?\d*\.?\d+)\s*(?:([+\-*\/x\u00d7])\s*(-?\d*\.?\d+))?$/i);
  if (!m) {
    throw new Error(label + ' must be a number or a series like "45" or "45 * 0.8"');
  }
  var op = m[2] ? m[2].toLowerCase() : null;
  if (op === "x" || op === "\u00d7") op = "*";
  var step = m[3] === undefined ? 0 : parseFloat(m[3]);
  if (op === "/" && step === 0) {
    throw new Error(label + " cannot divide by 0");
  }
  return { start: parseFloat(m[1]), op: op, step: step };
}

/** Value of a series for the k-th shape, where k = 0 is the original. */
function seriesValue(series, k) {
  var v = series.start;
  for (var i = 0; i < k; i++) {
    if (series.op === "+") v += series.step;
    else if (series.op === "-") v -= series.step;
    else if (series.op === "*") v *= series.step;
    else if (series.op === "/") v /= series.step;
  }
  return v;
}

/**
 * Canvas offsets of shapes 0..n from the original. Move i leads from shape i to shape i + 1,
 * using the i-th distance and angle. Angle 0 points right, 90 points up.
 */
function copyOffsets(n, distanceSeries, angleSeries) {
  var offsets = [{ x: 0, y: 0 }];
  var x = 0;
  var y = 0;
  for (var i = 0; i < n; i++) {
    var dist = seriesValue(distanceSeries, i);
    var ang = degToRad(seriesValue(angleSeries, i));
    x += dist * Math.cos(ang);
    y -= dist * Math.sin(ang);
    offsets.push({ x: x, y: y });
  }
  return offsets;
}

/**
 * Builds a camera from rotation angles in degrees, a pivot in canvas space, and the
 * size the field of view is measured across.
 */
function buildCamera(rx, ry, rz, fovDeg, pivotX, pivotY, refSize) {
  var d = 0;
  if (fovDeg > 0) {
    d = refSize / 2 / Math.tan(degToRad(fovDeg) / 2);
  }
  return {
    px: pivotX,
    py: pivotY,
    d: d,
    cx: Math.cos(degToRad(rx)),
    sx: Math.sin(degToRad(rx)),
    cy: Math.cos(degToRad(ry)),
    sy: Math.sin(degToRad(ry)),
    // Canvas y points down, so a counterclockwise spin negates the angle.
    cz: Math.cos(degToRad(-rz)),
    sz: Math.sin(degToRad(-rz))
  };
}

/** Rotates a vector about X, then Y, then Z. */
function rotateVector(cam, x, y, z) {
  var y1 = y * cam.cx - z * cam.sx;
  var z1 = y * cam.sx + z * cam.cx;
  var x2 = x * cam.cy + z1 * cam.sy;
  var z2 = -x * cam.sy + z1 * cam.cy;
  var x3 = x2 * cam.cz - y1 * cam.sz;
  var y3 = x2 * cam.sz + y1 * cam.cz;
  return [x3, y3, z2];
}

/**
 * Projects a canvas point and carries a direction (dx, dy) through the same map, so
 * curve tangents stay exact instead of being guessed from neighbouring points.
 */
function projectPoint(cam, x, y, dx, dy, z) {
  var v = rotateVector(cam, x - cam.px, y - cam.py, z || 0);
  var w = rotateVector(cam, dx, dy, 0);
  var s = 1;
  var ds = 0;

  if (cam.d > 0) {
    var gap = cam.d - v[2];
    if (gap < cam.d * CLIP_FRACTION) {
      throw new Error("A point swings behind the camera. Lower the rotation or raise the field of view.");
    }
    s = cam.d / gap;
    ds = (cam.d * w[2]) / (gap * gap);
  }

  return {
    x: cam.px + v[0] * s,
    y: cam.py + v[1] * s,
    dx: w[0] * s + v[0] * ds,
    dy: w[1] * s + v[1] * ds
  };
}

function applyMatrix(m, x, y) {
  return { x: m[0][0] * x + m[0][1] * y + m[0][2], y: m[1][0] * x + m[1][1] * y + m[1][2] };
}

function applyLinear(m, x, y) {
  return { x: m[0][0] * x + m[0][1] * y, y: m[1][0] * x + m[1][1] * y };
}

function invertMatrix(m) {
  var det = m[0][0] * m[1][1] - m[0][1] * m[1][0];
  var a = m[1][1] / det;
  var b = -m[0][1] / det;
  var c = -m[1][0] / det;
  var d = m[0][0] / det;
  return [
    [a, b, -(a * m[0][2] + b * m[1][2])],
    [c, d, -(c * m[0][2] + d * m[1][2])]
  ];
}

function multiplyMatrix(p, q) {
  return [
    [
      p[0][0] * q[0][0] + p[0][1] * q[1][0],
      p[0][0] * q[0][1] + p[0][1] * q[1][1],
      p[0][0] * q[0][2] + p[0][1] * q[1][2] + p[0][2]
    ],
    [
      p[1][0] * q[0][0] + p[1][1] * q[1][0],
      p[1][0] * q[0][1] + p[1][1] * q[1][1],
      p[1][0] * q[0][2] + p[1][1] * q[1][2] + p[1][2]
    ]
  ];
}

/** Samples a cubic and its derivative at n + 1 evenly spaced parameters, projected. */
function projectCubicSamples(cam, p0, p1, p2, p3, n, z) {
  var samples = [];
  for (var k = 0; k <= n; k++) {
    var t = k / n;
    var mt = 1 - t;
    var x = mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x;
    var y = mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y;
    var dx = 3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x);
    var dy = 3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y);
    samples.push(projectPoint(cam, x, y, dx, dy, z));
  }
  return samples;
}

/**
 * Expands one loop of original segment indices into the matching sub-segment indices,
 * reversing a segment's pieces wherever the loop walks it end to start.
 */
function remapLoop(loop, segments, segMap) {
  var result = [];
  var cur = null;
  for (var i = 0; i < loop.length; i++) {
    var seg = segments[loop[i]];
    var forward;
    if (i === 0) {
      var nextSeg = segments[loop[(i + 1) % loop.length]];
      forward = loop.length === 1 || seg.end === nextSeg.start || seg.end === nextSeg.end;
    } else {
      forward = seg.start === cur;
    }
    cur = forward ? seg.end : seg.start;
    var map = segMap[loop[i]];
    for (var j = 0; j < map.count; j++) {
      result.push(forward ? map.first + j : map.first + map.count - 1 - j);
    }
  }
  return result;
}

/**
 * Takes a vector network in local space and returns the projected network in canvas
 * space, with each curve split into short pieces so the projection stays accurate.
 */
function transformNetwork(net, matrix, cam, pieces, z) {
  var vertices = [];
  var segments = [];
  var segMap = [];
  var i;

  var abs = net.vertices.map(function (v) {
    return applyMatrix(matrix, v.x, v.y);
  });

  for (i = 0; i < net.vertices.length; i++) {
    var p = projectPoint(cam, abs[i].x, abs[i].y, 0, 0, z);
    var vert = { x: p.x, y: p.y };
    if (net.vertices[i].strokeCap !== undefined) vert.strokeCap = net.vertices[i].strokeCap;
    if (net.vertices[i].strokeJoin !== undefined) vert.strokeJoin = net.vertices[i].strokeJoin;
    vertices.push(vert);
  }

  net.segments.forEach(function (seg, idx) {
    var ts = applyLinear(matrix, seg.tangentStart.x, seg.tangentStart.y);
    var te = applyLinear(matrix, seg.tangentEnd.x, seg.tangentEnd.y);
    var a = abs[seg.start];
    var b = abs[seg.end];
    var straight = ts.x === 0 && ts.y === 0 && te.x === 0 && te.y === 0;

    if (straight) {
      segMap[idx] = { first: segments.length, count: 1 };
      segments.push({ start: seg.start, end: seg.end, tangentStart: { x: 0, y: 0 }, tangentEnd: { x: 0, y: 0 } });
      return;
    }

    var samples = projectCubicSamples(
      cam,
      a,
      { x: a.x + ts.x, y: a.y + ts.y },
      { x: b.x + te.x, y: b.y + te.y },
      b,
      pieces,
      z
    );
    var third = 1 / (3 * pieces);
    var ids = [seg.start];
    for (var k = 1; k < pieces; k++) {
      vertices.push({ x: samples[k].x, y: samples[k].y });
      ids.push(vertices.length - 1);
    }
    ids.push(seg.end);

    segMap[idx] = { first: segments.length, count: pieces };
    for (var j = 0; j < pieces; j++) {
      segments.push({
        start: ids[j],
        end: ids[j + 1],
        tangentStart: { x: samples[j].dx * third, y: samples[j].dy * third },
        tangentEnd: { x: -samples[j + 1].dx * third, y: -samples[j + 1].dy * third }
      });
    }
  });

  var regions = (net.regions || []).map(function (region) {
    var out = {
      windingRule: region.windingRule,
      loops: region.loops.map(function (loop) {
        return remapLoop(loop, net.segments, segMap);
      })
    };
    if (region.fills !== undefined) out.fills = region.fills;
    if (region.fillStyleId !== undefined) out.fillStyleId = region.fillStyleId;
    return out;
  });

  return { vertices: vertices, segments: segments, regions: regions };
}

/** Smallest x and y over every vertex and control point of a network. */
function networkOrigin(net) {
  var minX = Infinity;
  var minY = Infinity;
  net.vertices.forEach(function (v) {
    minX = Math.min(minX, v.x);
    minY = Math.min(minY, v.y);
  });
  net.segments.forEach(function (s) {
    var a = net.vertices[s.start];
    var b = net.vertices[s.end];
    minX = Math.min(minX, a.x + s.tangentStart.x, b.x + s.tangentEnd.x);
    minY = Math.min(minY, a.y + s.tangentStart.y, b.y + s.tangentEnd.y);
  });
  return { x: minX, y: minY };
}

function shiftNetwork(net, dx, dy) {
  net.vertices.forEach(function (v) {
    v.x -= dx;
    v.y -= dy;
  });
}

function parentAbsoluteMatrix(node) {
  var parent = node.parent;
  if (parent && parent.absoluteTransform) return parent.absoluteTransform;
  return [[1, 0, 0], [0, 1, 0]];
}

/** Gives a node the canvas transform `abs`, whatever space its parent measures in. */
function restoreAbsolute(node, abs) {
  var inv = invertMatrix(parentAbsoluteMatrix(node));
  node.relativeTransform = multiplyMatrix(inv, abs);

  // Children of groups can sit in a different coordinate space, so correct what is left.
  var actual = node.absoluteTransform;
  var ex = abs[0][2] - actual[0][2];
  var ey = abs[1][2] - actual[1][2];
  if (Math.abs(ex) > 1e-3 || Math.abs(ey) > 1e-3) {
    var d = applyLinear(inv, ex, ey);
    var rt = node.relativeTransform;
    node.relativeTransform = [
      [rt[0][0], rt[0][1], rt[0][2] + d.x],
      [rt[1][0], rt[1][1], rt[1][2] + d.y]
    ];
  }
}

/** Places a node so its local origin lands at (x, y) on the canvas with no rotation. */
function placeNode(node, x, y) {
  restoreAbsolute(node, [[1, 0, x], [0, 1, y]]);
}

async function writeNetwork(vector, net) {
  if (typeof vector.setVectorNetworkAsync === "function") {
    await vector.setVectorNetworkAsync(net);
  } else {
    vector.vectorNetwork = net;
  }
}

function inAutoLayout(node) {
  var parent = node.parent;
  return !!(parent && parent.layoutMode && parent.layoutMode !== "NONE" && node.layoutPositioning !== "ABSOLUTE");
}

var SETTABLE_PAINTS = ["SOLID", "GRADIENT_LINEAR", "GRADIENT_RADIAL", "GRADIENT_ANGULAR", "GRADIENT_DIAMOND", "IMAGE", "VIDEO"];

/** Paints a shape accepts. Frames can also hold pattern paints, which cannot be set elsewhere. */
function settablePaints(paints) {
  if (!Array.isArray(paints)) return [];
  return paints.filter(function (p) {
    return SETTABLE_PAINTS.indexOf(p.type) !== -1;
  });
}

function hasVisiblePaint(paints) {
  return Array.isArray(paints) && paints.some(function (p) {
    return p.visible !== false;
  });
}

/** Flattens text into a vector, loading its fonts first if Figma asks for them. */
async function textToVector(text) {
  try {
    return flattenNode(text);
  } catch (error) {
    var fonts = text.getRangeAllFontNames(0, text.characters.length);
    for (var i = 0; i < fonts.length; i++) {
      await figma.loadFontAsync(fonts[i]);
    }
    return flattenNode(text);
  }
}

var RADIUS_KEYS = ["topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius", "cornerSmoothing"];
var STROKE_KEYS = ["strokeTopWeight", "strokeRightWeight", "strokeBottomWeight", "strokeLeftWeight", "strokeAlign", "strokeJoin", "strokeMiterLimit", "dashPattern"];

/** A rectangle with the frame's size, corners, fills, strokes and effects, in the frame's place. */
async function frameBackground(frame) {
  var rect = figma.createRectangle();
  try {
    await copyFrameLook(frame, rect);
  } catch (error) {
    rect.remove();
    throw error;
  }
  return rect;
}

async function copyFrameLook(frame, rect) {
  var parent = frame.parent;
  parent.insertChild(parent.children.indexOf(frame), rect);
  rect.name = frame.name;
  rect.resize(frame.width, frame.height);
  rect.relativeTransform = frame.relativeTransform;
  rect.opacity = frame.opacity;
  // Frames default to Pass through, which a rectangle does not accept.
  if (frame.blendMode !== "PASS_THROUGH") rect.blendMode = frame.blendMode;
  RADIUS_KEYS.forEach(function (key) {
    if (typeof frame[key] === "number") rect[key] = frame[key];
  });
  rect.fills = settablePaints(frame.fills);
  rect.strokes = settablePaints(frame.strokes);
  STROKE_KEYS.forEach(function (key) {
    if (frame[key] !== undefined && frame[key] !== figma.mixed) rect[key] = frame[key];
  });
  rect.effects = frame.effects;

  // Shared styles are applied last because setting a style id replaces the raw values.
  var styles = [
    ["fillStyleId", "setFillStyleIdAsync"],
    ["strokeStyleId", "setStrokeStyleIdAsync"],
    ["effectStyleId", "setEffectStyleIdAsync"]
  ];
  for (var i = 0; i < styles.length; i++) {
    var id = frame[styles[i][0]];
    if (typeof id === "string" && id !== "") {
      try {
        await rect[styles[i][1]](id);
      } catch (error) {
        // The raw values copied above still match the style.
      }
    }
  }
}

/**
 * Replaces a frame by a rectangle for its own fill and stroke, with its children moved out
 * above it at the same canvas position. Returns the rectangle (or null) and the children.
 */
async function dissolveFrame(frame) {
  var parent = frame.parent;
  var background = null;
  if (hasVisiblePaint(frame.fills) || hasVisiblePaint(frame.strokes)) {
    background = await frameBackground(frame);
  }
  var children = frame.children.slice();

  // Read every position first and freeze the layout, because each child that leaves an auto
  // layout frame would otherwise reflow the ones still inside.
  var positions = children.map(function (child) {
    return child.absoluteTransform;
  });
  if (frame.layoutMode && frame.layoutMode !== "NONE") frame.layoutMode = "NONE";

  children.forEach(function (child, i) {
    child.opacity = child.opacity * frame.opacity;
    parent.insertChild(parent.children.indexOf(frame), child);
    restoreAbsolute(child, positions[i]);
  });
  frame.remove();
  return { background: background, children: children };
}

/**
 * Collects the shapes to transform. Text is flattened to a vector, and frames dissolve into a
 * background rectangle plus their children, so everything ends up as a plain shape.
 */
async function prepareTargets(nodes, targets, skipped) {
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    if (node.locked) {
      skipped.push(node.name + " (locked)");
      continue;
    }
    if (inAutoLayout(node)) {
      skipped.push(node.name + " (auto layout)");
      continue;
    }
    if (node.type === "GROUP") {
      await prepareTargets(node.children.slice(), targets, skipped);
    } else if (node.type === "FRAME") {
      if (node.visible === false) {
        skipped.push(node.name + " (hidden frame)");
        continue;
      }
      var parts = await dissolveFrame(node);
      if (parts.background) targets.push(parts.background);
      await prepareTargets(parts.children, targets, skipped);
    } else if (node.type === "TEXT") {
      try {
        targets.push(await textToVector(node));
      } catch (error) {
        skipped.push(node.name + " (text)");
      }
    } else if (SHAPE_TYPES.indexOf(node.type) !== -1) {
      targets.push(node);
    } else {
      skipped.push(node.name + " (" + node.type.toLowerCase() + ")");
    }
  }
}

function unionBoundsOf(boundsList) {
  var minX = Infinity;
  var minY = Infinity;
  var maxX = -Infinity;
  var maxY = -Infinity;
  boundsList.forEach(function (b) {
    if (!b) return;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  });
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function cameraForBounds(bounds, rot, offset) {
  var frac = PIVOT_FRACTIONS[pivotPoint] || PIVOT_FRACTIONS["center"];
  return buildCamera(
    rot.x,
    rot.y,
    rot.z,
    Number(fov) || 0,
    bounds.x + offset.x + bounds.width * frac[0],
    bounds.y + offset.y + bounds.height * frac[1],
    Math.max(bounds.width, bounds.height, 1)
  );
}

/** Throws if any corner of the bounds, once moved and rotated, lands behind the camera. */
function assertInFront(cam, bounds, offset, depth) {
  var zs = depth > 0 ? [0, -depth] : [0];
  var xs = [bounds.x, bounds.x + bounds.width];
  var ys = [bounds.y, bounds.y + bounds.height];
  xs.forEach(function (x) {
    ys.forEach(function (y) {
      zs.forEach(function (z) {
        projectPoint(cam, x + offset.x, y + offset.y, 0, 0, z);
      });
    });
  });
}

/** Moves the network to the origin of its own bounds, writes it, and places the node. */
async function placeNetwork(vector, net) {
  var origin = networkOrigin(net);
  shiftNetwork(net, origin.x, origin.y);

  await writeNetwork(vector, net);

  // Figma may re-anchor the network at the new bounds, so measure what it kept.
  var back = vector.vectorNetwork.vertices[0];
  var kept = net.vertices[0];
  placeNode(vector, origin.x + (kept.x - back.x), origin.y + (kept.y - back.y));
}

/**
 * Joins the front and back outlines into one network of side panels. Each segment of the
 * outline becomes a closed four-sided region, so the panels fill as separate shapes.
 */
function buildSideNetwork(front, back) {
  var count = front.vertices.length;
  var total = front.segments.length;
  var vertices = front.vertices.concat(back.vertices).map(function (v) {
    return { x: v.x, y: v.y };
  });
  var zero = { x: 0, y: 0 };
  var segments = front.segments.concat(
    back.segments.map(function (seg) {
      return {
        start: seg.start + count,
        end: seg.end + count,
        tangentStart: seg.tangentStart,
        tangentEnd: seg.tangentEnd
      };
    })
  );
  var links = {};

  function link(v) {
    if (links[v] === undefined) {
      links[v] = segments.length;
      segments.push({ start: v, end: v + count, tangentStart: zero, tangentEnd: zero });
    }
    return links[v];
  }

  var regions = front.segments.map(function (seg, j) {
    return { windingRule: "NONZERO", loops: [[j, link(seg.end), total + j, link(seg.start)]] };
  });

  return { vertices: vertices, segments: segments, regions: regions };
}

function darkenPaint(paint) {
  if (paint.type !== "SOLID") return paint;
  return {
    type: "SOLID",
    color: { r: paint.color.r * SIDE_SHADE, g: paint.color.g * SIDE_SHADE, b: paint.color.b * SIDE_SHADE },
    opacity: paint.opacity === undefined ? 1 : paint.opacity,
    visible: paint.visible === undefined ? true : paint.visible
  };
}

function firstVisibleSolid(paints) {
  if (!Array.isArray(paints)) return null;
  for (var i = 0; i < paints.length; i++) {
    if (paints[i].type === "SOLID" && paints[i].visible !== false) return paints[i];
  }
  return null;
}

/** Gives the side the front's solid fill, darkened, plus a thin stroke to close seams. */
function styleSide(side, front) {
  var source = firstVisibleSolid(front.fills) || firstVisibleSolid(front.strokes);
  if (!source) {
    side.strokes = [];
    return;
  }
  var shaded = darkenPaint(source);
  side.fills = [shaded];
  side.strokes = [shaded];
  side.strokeWeight = SEAM_STROKE;
  side.strokeAlign = "CENTER";
  side.strokeJoin = "ROUND";
  side.dashPattern = [];
}

/** True when the front of the shape points toward the camera. */
function frontFacesCamera(cam, cx, cy) {
  var v = rotateVector(cam, cx - cam.px, cy - cam.py, 0);
  var n = rotateVector(cam, 0, 0, 1);
  if (cam.d <= 0) return n[2] > 0;
  return -v[0] * n[0] - v[1] * n[1] + (cam.d - v[2]) * n[2] > 0;
}

/** Flattens one node. Figma refuses hidden layers, so they are shown for the flatten and hidden again. */
function flattenNode(node) {
  var hidden = node.visible === false;
  if (hidden) node.visible = true;
  var vector;
  try {
    vector = figma.flatten([node]);
  } catch (error) {
    if (hidden) node.visible = false;
    throw error;
  }
  if (hidden) vector.visible = false;
  return vector;
}

async function transformShape(node, cam, offset, depthValue) {
  var name = node.name;
  var bounds = node.absoluteBoundingBox;
  var vector = node.type === "VECTOR" ? node : flattenNode(node);
  var t = vector.absoluteTransform;
  var matrix = [[t[0][0], t[0][1], t[0][2] + offset.x], [t[1][0], t[1][1], t[1][2] + offset.y]];
  var source = vector.vectorNetwork;
  var frontNet = transformNetwork(source, matrix, cam, CURVE_PIECES, 0);

  if (!(depthValue > 0)) {
    await placeNetwork(vector, frontNet);
    return vector;
  }

  var backNet = transformNetwork(source, matrix, cam, CURVE_PIECES, -depthValue);
  var sideNet = buildSideNetwork(frontNet, backNet);
  var side = vector.clone();
  var back = vector.clone();

  await placeNetwork(back, backNet);
  await placeNetwork(side, sideNet);
  await placeNetwork(vector, frontNet);
  styleSide(side, vector);

  vector.name = "Front face";
  side.name = "Side face";
  back.name = "Back face";

  var parent = vector.parent;
  var group = figma.group([back, side, vector], parent, parent.children.indexOf(vector));
  group.name = name;

  var cx = bounds.x + bounds.width / 2 + offset.x;
  var cy = bounds.y + bounds.height / 2 + offset.y;
  var order = frontFacesCamera(cam, cx, cy) ? [back, side, vector] : [vector, side, back];
  order.forEach(function (layer) {
    group.appendChild(layer);
  });
  return group;
}

/** The ancestor of `node` that sits directly in `root`, or null if it is not inside it. */
function topLevelItem(node, root) {
  var n = node;
  while (n && n.parent !== root) n = n.parent;
  return n || null;
}

/**
 * Wraps each copy's results in one group when they came out as several layers. Layers that
 * sit inside an original group move with that whole group, so masks keep working. If the
 * results cannot be grouped cleanly, they are left where they are.
 */
function groupResultSets(resultSets, root, baseName) {
  var flat = [].concat.apply([], resultSets);
  if (!root) return flat;

  var seen = [];
  var itemSets = [];
  for (var k = 0; k < resultSets.length; k++) {
    var items = [];
    for (var i = 0; i < resultSets[k].length; i++) {
      var item = topLevelItem(resultSets[k][i], root);
      if (!item) return flat;
      if (items.indexOf(item) === -1) items.push(item);
    }
    for (var j = 0; j < items.length; j++) {
      if (seen.indexOf(items[j]) !== -1) return flat;
      seen.push(items[j]);
    }
    itemSets.push(items);
  }

  return itemSets.map(function (items, idx) {
    if (items.length < 2) return items[0];
    var at = Math.min.apply(null, items.map(function (n) { return root.children.indexOf(n); }));
    var group = figma.group(items, root, at);
    group.name = idx === 0 ? baseName : baseName + " copy " + idx;
    return group;
  });
}

/** Clones every target once, stacking each clone directly above the previous shape. */
function cloneTargets(targets, previous) {
  return targets.map(function (node, i) {
    var clone = node.clone();
    var parent = node.parent;
    parent.insertChild(parent.children.indexOf(previous[i]) + 1, clone);
    return clone;
  });
}

(async function () {
  try {
    var fovValue = Number(fov) || 0;
    if (fovValue < 0 || fovValue > 170) {
      throw new Error("Field of view must be between 0 and 170");
    }
    var count = Math.floor(Number(copies) || 0);
    if (count < 0 || count > MAX_COPIES) {
      throw new Error("Copies must be between 0 and " + MAX_COPIES);
    }

    var depthValue = Number(depth) || 0;
    if (depthValue < 0) {
      throw new Error("Depth cannot be negative");
    }

    var rotSeries = {
      x: parseSeries(rotateX, "Rotate X"),
      y: parseSeries(rotateY, "Rotate Y"),
      z: parseSeries(rotateZ, "Rotate Z")
    };
    var offsets = copyOffsets(count, parseSeries(copyDistance, "Distance"), parseSeries(copyAngle, "Angle"));

    // One camera per shape and copy. Shared mode builds them all from the combined bounds.
    function makePlan(boundsList) {
      var shared = unionBoundsOf(boundsList);
      return offsets.map(function (offset, k) {
        var rot = {
          x: seriesValue(rotSeries.x, k),
          y: seriesValue(rotSeries.y, k),
          z: seriesValue(rotSeries.z, k)
        };
        var cams = boundsList.map(function (own) {
          var bounds = pivotOf === "each layer" ? own : shared;
          var cam = cameraForBounds(bounds, rot, offset);
          assertInFront(cam, bounds, offset, depthValue);
          return cam;
        });
        return { offset: offset, cams: cams };
      });
    }

    var selection = figma.currentPage.selection.slice();
    if (!selection.length) {
      throw new Error("Select at least one shape");
    }

    // Check the camera on the selection first, so an unusable setting changes nothing.
    makePlan(selection.map(function (n) { return n.absoluteBoundingBox; }).filter(Boolean));

    var root = selection.every(function (n) { return n.parent === selection[0].parent; }) ? selection[0].parent : null;
    var baseName = selection.length === 1 ? selection[0].name : "3D transform";

    var targets = [];
    var skipped = [];
    await prepareTargets(selection, targets, skipped);
    if (!targets.length) {
      throw new Error("No supported shapes in the selection");
    }

    var plan = makePlan(targets.map(function (n) { return n.absoluteBoundingBox; }));

    // Clones come from the untouched originals, so make them all before transforming any.
    var sets = [targets];
    for (var k = 1; k <= count; k++) {
      sets.push(cloneTargets(targets, sets[k - 1]));
    }

    var resultSets = [];
    for (var s = 0; s < sets.length; s++) {
      var made = [];
      for (var i = 0; i < sets[s].length; i++) {
        var cam = plan[s].cams[i];
        try {
          made.push(await transformShape(sets[s][i], cam, plan[s].offset, depthValue));
        } catch (error) {
          console.log("[3D transform] " + sets[s][i].name + ": " + error.message);
          skipped.push(sets[s][i].name + " (" + error.message + ")");
        }
      }
      resultSets.push(made);
    }

    figma.currentPage.selection = groupResultSets(resultSets, root, baseName);

    var done = resultSets[0].length;
    var message = "Transformed " + done + (done === 1 ? " shape" : " shapes") + " in 3D";
    if (count > 0) {
      message += " with " + count + (count === 1 ? " copy" : " copies");
    }
    if (skipped.length) {
      message += ". Skipped " + skipped.length + ": " + skipped.slice(0, 3).join(", ") + (skipped.length > 3 ? "…" : "");
    }
    figma.notify(message);
  } catch (error) {
    console.log("[3D transform] " + (error && error.message) + "\n" + (error && error.stack ? error.stack : ""));
    figma.notify("Error: " + error.message);
  }
  if (typeof window !== "undefined" && typeof window.codefigRunComplete === "function") {
    window.codefigRunComplete();
  }
})();
