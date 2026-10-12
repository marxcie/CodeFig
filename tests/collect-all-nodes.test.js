const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const scripts = path.join(__dirname, '..', 'scripts');

function slice(file, startRe, endMarker) {
  const src = fs.readFileSync(path.join(scripts, file), 'utf8');
  const start = src.search(startRe);
  assert.ok(start !== -1, file + ' defines the walker');
  const rest = src.slice(start);
  const rel = typeof endMarker === 'string' ? rest.indexOf(endMarker) : rest.search(endMarker);
  assert.ok(rel > 0, file + ' end marker found');
  return rest.slice(0, rel);
}

function collector(file, startRe) {
  const chunk = slice(file, startRe, /\n\};?\n/).replace(/^var collectAllNodes = function/, 'function collectAllNodes') + '\n}';
  return new Function(chunk + '\nreturn collectAllNodes;')();
}

const collectors = {
  'replace-variables.js': collector('EXAMPLE_SCRIPTS/Variables/replace-variables.js', /function collectAllNodes\(/),
  'merge-variable-collections.js': collector('EXAMPLE_SCRIPTS/Variables/merge-variable-collections.js', /function collectAllNodes\(/),
  'variable-inspector.js': collector('EXAMPLE_SCRIPTS/Variables/variable-inspector.js', /var collectAllNodes = function/)
};

const coreSrc = slice('CODEFIG_LIBRARIES/@core-library.js', /function traverseNodes\(/, 'function getTargetNodes');
const traverseNodes = new Function(coreSrc + '\nreturn traverseNodes;')();

/** A node whose `children` throws: the walkers must use findAll, which stays finite on a self-expanding instance. */
function node(id, kids) {
  const n = {
    id,
    get children() { throw new Error('read children of ' + id); }
  };
  n._kids = kids || [];
  if (kids) {
    n.findAll = (cb) => {
      const out = [];
      (function walk(list) {
        list.forEach((k) => { if (cb(k)) out.push(k); if (k._kids.length) walk(k._kids); });
      })(n._kids);
      return out;
    };
  }
  return n;
}

function sample() {
  const c = node('c'), d = node('d'), e = node('e'), g = node('g');
  const b = node('b', [c, d]);
  const a = node('a', [b, e]);
  const f = node('f', [g]);
  return [a, f];
}

Object.keys(collectors).forEach((name) => {
  test(name + ': parents before children, in document order, without reading children', () => {
    const ids = collectors[name](sample()).map((x) => x.id);
    assert.deepStrictEqual(ids, ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  });

  test(name + ': a node selected together with its ancestor is listed once', () => {
    const [a] = sample();
    const b = a._kids[0];
    const ids = collectors[name]([a, b]).map((x) => x.id);
    assert.deepStrictEqual(ids, ['a', 'b', 'c', 'd', 'e']);
  });

  test(name + ': a leaf with no findAll is kept', () => {
    assert.deepStrictEqual(collectors[name]([node('x')]).map((x) => x.id), ['x']);
  });
});

test('traverseNodes: same order, never reads children', () => {
  const seen = [];
  traverseNodes(sample(), (n) => { seen.push(n.id); return 0; });
  assert.deepStrictEqual(seen, ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
});

test('traverseNodes: maxNodes stops after that many', () => {
  const seen = [];
  traverseNodes(sample(), (n) => { seen.push(n.id); return 0; }, { maxNodes: 3 });
  assert.deepStrictEqual(seen, ['a', 'b', 'c']);
});

test('traverseNodes: numeric results from the processor are summed', () => {
  const total = traverseNodes(sample(), (n) => (n.id === 'c' || n.id === 'g' ? 2 : 0));
  assert.strictEqual(total, 4);
});

test('traverseNodes: a processor may change the tree it is walking', () => {
  const roots = sample();
  const seen = [];
  traverseNodes(roots, (n) => { seen.push(n.id); roots[0]._kids.length = 0; return 0; });
  assert.deepStrictEqual(seen, ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
});

test('traverseNodes: a single root, not an array, works', () => {
  const [a] = sample();
  const seen = [];
  traverseNodes(a, (n) => { seen.push(n.id); return 0; });
  assert.deepStrictEqual(seen, ['a', 'b', 'c', 'd', 'e']);
});
