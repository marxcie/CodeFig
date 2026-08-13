/**
 * The smallest DOM that runs `src/config-ui/renderer.js`.
 *
 * Every renderer test in this repo reads the file as **source** and asserts on its text. That is why
 * `if (field.tabs) return;` landing in a function with no `field` in scope shipped and killed every
 * form in the plugin — the source said the right thing and nothing ever called it. This shim exists
 * so the renderer can be *run*: by `build-style-reference.js`, which renders the real specimen shelf
 * into a browsable page, and by tests that want to execute a control rather than grep for it.
 *
 * Deliberately not a browser. No layout, no CSS, no cascade, no real event dispatch — listeners are
 * recorded so a test can invoke one, not fired by anything here. Anything that needs a *measurement*
 * belongs in `artifacts/style-reference.html` or the bridge, both of which use a real engine.
 *
 * The API surface is bounded by what the renderer actually calls, which is small: createElement,
 * appendChild/insertBefore/removeChild, class and attribute access, textContent, innerHTML, and
 * querySelector(All) over a handful of simple selectors. If the renderer starts needing more, this
 * throws rather than silently returning undefined — a shim that quietly answers "no match" is how a
 * generated page ends up missing a control nobody notices.
 */
'use strict';

const VOID_TAGS = new Set(['input', 'br', 'hr', 'img']);

/** `.class`, `tag`, `[attr]`, `[attr="value"]`, and `:checked` — combined, but never nested. */
function parseSelector(sel) {
  const parts = { tag: null, classes: [], attrs: [], checked: false };
  let rest = String(sel).trim();
  if (rest.endsWith(':checked')) {
    parts.checked = true;
    rest = rest.slice(0, -':checked'.length);
  }
  const re = /^([a-zA-Z][\w-]*)|^\.([\w-]+)|^\[([\w-]+)(?:=["']?([^\]"']*)["']?)?\]/;
  while (rest.length) {
    const m = re.exec(rest);
    if (!m) {
      throw new Error(
        'dom-shim: selector "' + sel + '" is more than this shim supports. Extend parseSelector ' +
        'deliberately rather than letting it return no match.'
      );
    }
    if (m[1]) parts.tag = m[1].toLowerCase();
    else if (m[2]) parts.classes.push(m[2]);
    else parts.attrs.push({ name: m[3], value: m[4] === undefined ? null : m[4] });
    rest = rest.slice(m[0].length);
    // A descendant combinator: only the right-most compound is matched, which is all the renderer
    // needs and is stated here so a future selector is not silently half-matched.
    if (/^\s/.test(rest)) {
      throw new Error('dom-shim: descendant selectors are not supported ("' + sel + '")');
    }
  }
  return parts;
}

function matches(el, parts) {
  if (parts.tag && el.tagName !== parts.tag) return false;
  if (parts.checked && !el.checked) return false;
  for (const c of parts.classes) if (!el.classList.contains(c)) return false;
  for (const a of parts.attrs) {
    const v = el.getAttribute(a.name);
    if (v === null) return false;
    if (a.value !== null && v !== a.value) return false;
  }
  return true;
}

class TextNode {
  constructor(text) {
    this.nodeType = 3;
    this.text = String(text);
    this.parentNode = null;
  }
  get textContent() { return this.text; }
}

class RawHtml {
  constructor(html) {
    this.nodeType = 8; // Not a real node type: markup the renderer handed us, kept verbatim.
    this.html = String(html);
    this.parentNode = null;
  }
  get textContent() { return ''; }
}

class Element {
  constructor(tagName) {
    this.nodeType = 1;
    this.tagName = String(tagName).toLowerCase();
    this.childNodes = [];
    this.parentNode = null;
    this._attrs = new Map();
    this._listeners = [];
    this.style = {};
    const self = this;
    this.classList = {
      add() { [].forEach.call(arguments, (c) => { if (c && !self._classes().includes(c)) self.className = (self.className ? self.className + ' ' : '') + c; }); },
      remove() { [].forEach.call(arguments, (c) => { self.className = self._classes().filter((x) => x !== c).join(' '); }); },
      contains(c) { return self._classes().includes(c); },
      toggle(c, on) {
        const has = self._classes().includes(c);
        const want = on === undefined ? !has : !!on;
        if (want && !has) this.add(c);
        if (!want && has) this.remove(c);
        return want;
      },
    };
  }

  _classes() { return String(this.className || '').split(/\s+/).filter(Boolean); }

  // --- attributes. `className`, `id`, `type`, `value` and friends are attributes underneath, so a
  // --- generated page shows whichever way the renderer chose to set them.
  get className() { return this._attrs.get('class') || ''; }
  set className(v) { this._attrs.set('class', String(v)); }
  get id() { return this._attrs.get('id') || ''; }
  set id(v) { this._attrs.set('id', String(v)); }
  get type() { return this._attrs.get('type') || ''; }
  set type(v) { this._attrs.set('type', String(v)); }
  get name() { return this._attrs.get('name') || ''; }
  set name(v) { this._attrs.set('name', String(v)); }
  get title() { return this._attrs.get('title') || ''; }
  set title(v) { this._attrs.set('title', String(v)); }
  get placeholder() { return this._attrs.get('placeholder') || ''; }
  set placeholder(v) { this._attrs.set('placeholder', String(v)); }
  get rows() { return this._attrs.get('rows') || ''; }
  set rows(v) { this._attrs.set('rows', String(v)); }
  get htmlFor() { return this._attrs.get('for') || ''; }
  set htmlFor(v) { this._attrs.set('for', String(v)); }
  /**
   * A `<select>`'s value is its selected option's, which the attribute map does not know.
   *
   * The renderer builds a select by marking one `<option selected>` and never assigns `value`, so
   * every reader — `collectRows`, the row-level `showWhen` evaluation — saw an empty string and drew
   * the wrong conclusion. In a browser this is free; here it has to be modelled, and a shim that
   * silently answers "" for a control the user can see a value in is worse than one that throws.
   */
  get value() {
    if (this._attrs.has('value')) return this._attrs.get('value');
    if (this.tagName === 'select') {
      var chosen = this.children.filter(function (o) { return o.tagName === 'option' && o.selected; })[0];
      if (!chosen) chosen = this.children.filter(function (o) { return o.tagName === 'option'; })[0];
      if (chosen) return chosen._attrs.has('value') ? chosen._attrs.get('value') : chosen.textContent;
    }
    return '';
  }
  set value(v) {
    var next = v === null || v === undefined ? '' : String(v);
    this._attrs.set('value', next);
    // Assigning a select's value moves the selection, the way it does in a browser — otherwise a test
    // that sets a value and re-reads the options disagrees with itself.
    if (this.tagName === 'select') {
      this.children.forEach(function (o) {
        if (o.tagName !== 'option') return;
        var own = o._attrs.has('value') ? o._attrs.get('value') : o.textContent;
        o.selected = own === next;
      });
    }
  }
  get checked() { return this._attrs.get('checked') === true; }
  set checked(v) { this._attrs.set('checked', !!v); }
  get disabled() { return this._attrs.get('disabled') === true; }
  set disabled(v) { this._attrs.set('disabled', !!v); }
  get draggable() { return this._attrs.get('draggable') === true; }
  set draggable(v) { this._attrs.set('draggable', !!v); }
  get selected() { return this._attrs.get('selected') === true; }
  set selected(v) { this._attrs.set('selected', !!v); }
  get hidden() { return this._attrs.get('hidden') === true; }
  set hidden(v) { this._attrs.set('hidden', !!v); }

  setAttribute(n, v) { this._attrs.set(n, String(v)); }
  getAttribute(n) {
    if (!this._attrs.has(n)) return null;
    const v = this._attrs.get(n);
    return typeof v === 'boolean' ? (v ? '' : null) : v;
  }
  hasAttribute(n) { return this._attrs.has(n); }
  removeAttribute(n) { this._attrs.delete(n); }

  // --- children
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get firstChild() { return this.childNodes[0] || null; }
  appendChild(node) {
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    this.childNodes.push(node);
    return node;
  }
  insertBefore(node, ref) {
    if (!ref) return this.appendChild(node);
    const i = this.childNodes.indexOf(ref);
    if (i === -1) return this.appendChild(node);
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    this.childNodes.splice(i, 0, node);
    return node;
  }
  removeChild(node) {
    const i = this.childNodes.indexOf(node);
    if (i !== -1) this.childNodes.splice(i, 1);
    node.parentNode = null;
    return node;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }

  get textContent() { return this.childNodes.map((n) => n.textContent).join(''); }
  set textContent(v) {
    this.childNodes = [];
    if (v !== '' && v !== null && v !== undefined) this.appendChild(new TextNode(v));
  }

  get innerHTML() { return this.childNodes.map((n) => (n instanceof RawHtml ? n.html : '')).join(''); }
  set innerHTML(html) {
    this.childNodes = [];
    if (html) this.appendChild(new RawHtml(html));
  }

  // --- queries
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) {
    const parts = parseSelector(sel);
    const out = [];
    const walk = (el) => {
      el.children.forEach((child) => {
        if (matches(child, parts)) out.push(child);
        walk(child);
      });
    };
    walk(this);
    // A real NodeList has forEach; the renderer relies on it.
    return out;
  }
  closest(sel) {
    const parts = parseSelector(sel);
    let el = this;
    while (el && el.nodeType === 1) {
      if (matches(el, parts)) return el;
      el = el.parentNode;
    }
    return null;
  }

  // --- events. Nothing fires on its own; a test or the renderer dispatches on purpose.
  addEventListener(type, fn) { this._listeners.push({ type, fn }); }
  removeEventListener(type, fn) {
    this._listeners = this._listeners.filter((l) => !(l.type === type && l.fn === fn));
  }

  /** `dispatch('click')` — the convenience a test wants. */
  dispatch(type, init) {
    return this.dispatchEvent(Object.assign({ type }, init || {}));
  }

  /**
   * The real thing, including bubbling, because the renderer announces a chip edit with
   * `wrap.dispatchEvent(new Event("change", { bubbles: true }))` and the panel listens for it on the
   * form container. A shim that swallowed that would make every delegated listener untestable — which
   * is most of them.
   */
  dispatchEvent(event) {
    const e = event || {};
    e.target = e.target || this;
    if (!e.preventDefault) e.preventDefault = function () {};
    if (!e.stopPropagation) e.stopPropagation = function () { e._stopped = true; };
    let node = this;
    while (node && node.nodeType === 1) {
      node._listeners.filter((l) => l.type === e.type).forEach((l) => l.fn.call(node, e));
      if (!e.bubbles || e._stopped) break;
      node = node.parentNode;
    }
    return e;
  }
  focus() { this._focused = true; }
  select() { this._selected = true; }
}

/**
 * C0 control characters, which HTML cannot carry and a file cannot contain and stay text.
 *
 * The collection picker's "New collection" option uses `"\u0000codefig-new"` as its value — a
 * sentinel chosen precisely because no collection name can collide with it. Serialised verbatim, that
 * one byte made the generated page a *binary* file: `grep` reported no matches in a page that plainly
 * contained them, and a diff would have refused to show a review. Dropped here rather than in the
 * renderer, because the sentinel is right and only this serializer has a problem with it.
 */
function stripControls(s) {
  return String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}

function escapeText(s) {
  return stripControls(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return stripControls(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** The rendered tree as HTML, indented. What the browser gets is what the renderer built. */
function serialize(node, indent) {
  const pad = new Array((indent || 0) + 1).join('  ');
  if (node instanceof TextNode) return node.text.trim() ? pad + escapeText(node.text) : '';
  if (node instanceof RawHtml) return pad + node.html;

  const attrs = [];
  node._attrs.forEach((v, k) => {
    if (v === true) attrs.push(k);
    else if (v === false || v === null) return;
    else attrs.push(k + '="' + escapeAttr(v) + '"');
  });
  const open = '<' + node.tagName + (attrs.length ? ' ' + attrs.join(' ') : '') + '>';
  if (VOID_TAGS.has(node.tagName)) return pad + open;

  const kids = node.childNodes.map((c) => serialize(c, (indent || 0) + 1)).filter(Boolean);
  if (!kids.length) return pad + open + '</' + node.tagName + '>';
  // One line when it is only text, so a label does not become three lines.
  if (kids.length === 1 && node.childNodes[0] instanceof TextNode) {
    return pad + open + kids[0].trim() + '</' + node.tagName + '>';
  }
  return pad + open + '\n' + kids.join('\n') + '\n' + pad + '</' + node.tagName + '>';
}

/**
 * Install the shim as the globals the renderer reads, and return them.
 *
 * `window` has to exist: the renderer asks for `window.marked` when rendering a paragraph, and
 * `typeof window` on a missing global throws rather than being undefined.
 */
/** `new Event("change", { bubbles: true })` — the two properties the renderer sets. */
class ShimEvent {
  constructor(type, init) {
    this.type = type;
    this.bubbles = !!(init && init.bubbles);
    this.defaultPrevented = false;
  }
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this._stopped = true; }
}

function install() {
  const document = {
    createElement: (tag) => new Element(tag),
    createTextNode: (t) => new TextNode(t),
    documentElement: new Element('html'),
  };
  const window = { marked: undefined };
  global.document = document;
  global.window = window;
  global.Event = ShimEvent;
  return { document, window, serialize, Element, Event: ShimEvent };
}

module.exports = { install, serialize, Element, TextNode, RawHtml, Event: ShimEvent };
