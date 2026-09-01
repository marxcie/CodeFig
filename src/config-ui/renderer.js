(function (root, factory) {
  if (typeof define === "function" && define.amd) define(["./parser"], factory);
  else if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./parser"));
  else root.ConfigUIRenderer = factory(root.ConfigUIParser);
})(typeof self !== "undefined" ? self : this, function (P) {
  "use strict";
  var p = P || (typeof ConfigUIParser !== "undefined" ? ConfigUIParser : null);
  if (!p) throw new Error("ConfigUI Renderer requires Parser");

  /**
   * One channel for a control's explanation, behind an ⓘ.
   *
   * Three of them used to compete. `@helper:` drew a 10px note under the control; leftover comment
   * prose set `wrap.title` and showed *nothing*, because the class it added for the purpose —
   * `config-ui-field__label--has-tooltip` — had no rule anywhere in `ui.css`; and a paragraph row
   * printed its explanation between the fields as loose prose. So a form of eight fields carried
   * three kinds of grey text, one of them invisible, and no way to tell which text belonged to which
   * control. They are one thing now: an ⓘ after the label, and the text on hover or on focus.
   *
   * **Not `title`.** A native tooltip cannot be styled, waits about a second before appearing, and
   * lays a two-sentence helper — which most of them are — into one unreadable strip. One shared
   * bubble, positioned against the button, is the whole of the machinery below.
   */

  // A block of tooltip content keeps the rendering its source had. Prose came from a paragraph row,
  // which has always been markdown, so `**bold**` and `` `code` `` in a shipped config keep working.
  // A helper is plain text with its newlines honoured, which is what `white-space: pre-line` on the
  // old note gave it — a toggle's *On.* and *Off.* cases are a table of two, and running them
  // together makes one sentence that contradicts itself. Rendering both as markdown looked simpler
  // and is not: a helper reading `@options: small|medium|large` becomes a GFM table.
  function proseBlock(text) { return { kind: "md", text: String(text) }; }
  function helperBlock(text) { return { kind: "text", text: String(text).replace(/\\n/g, "\n") }; }

  /**
   * Configuration UI heading tags. Docs keep a full h1–h3 ladder; the form never emits h1 —
   * section titles (`// #` / panel level 1) are h2, nested headings are h3 — so form sections do
   * not wear the Documentation tab's document-title size.
   */
  function configHeadingTag(level) {
    var n = typeof level === "number" ? level : 1;
    return n <= 1 ? "h2" : "h3";
  }

  /** The blocks a control shows, in the order a reader met them: its own note, then any prose. */
  function tipBlocks(owner, prose) {
    var blocks = [];
    if (owner && owner.tooltip) blocks.push(helperBlock(owner.tooltip));
    if (owner && owner.helper) blocks.push(helperBlock(owner.helper));
    (prose || []).forEach(function (t) { blocks.push(proseBlock(t)); });
    return blocks;
  }

  var tipEl = null;
  var tipOwner = null;
  var tipPinned = false;

  function tooltipHost() {
    if (tipEl) return tipEl;
    if (typeof document === "undefined" || !document.body) return null;
    tipEl = document.createElement("div");
    tipEl.className = "config-ui-tip";
    tipEl.setAttribute("role", "tooltip");
    tipEl.hidden = true;
    document.body.appendChild(tipEl);
    return tipEl;
  }

  function fillTip(el, blocks) {
    el.innerHTML = "";
    blocks.forEach(function (b) {
      var part = document.createElement("div");
      part.className = "config-ui-tip__block";
      if (b.kind === "md" && typeof window !== "undefined" && window.marked && window.marked.parse) {
        part.className += " docs-rendered";
        // **A newline in the source is a wrap, not a break.** A paragraph in a config block is a run of
        // `//` lines wrapped at whatever width the `.js` file is kept to, and forcing each one to a
        // `<br>` put a hard break wherever the author happened to hit the margin — 18 of them landed
        // mid-sentence, which is what "one mode block ⏎ below per chip" was. Markdown's own rule is
        // the right one: a single newline reflows, a blank line starts a paragraph, and a list stays a
        // list. An author who wants a break writes one of those.
        part.innerHTML = window.marked.parse(b.text, { gfm: true });
      } else {
        part.textContent = b.text;
      }
      el.appendChild(part);
    });
  }

  /**
   * Placed against the button, clamped to the panel.
   *
   * The plugin panel is narrow and the ⓘ can sit at its right edge, so a bubble anchored naively
   * runs off the side where nothing scrolls it back. It is measured, then pushed inside an 8px
   * margin, and flipped above the button when there is no room below.
   */
  function placeTip(el, btn) {
    if (!btn.getBoundingClientRect || !el.getBoundingClientRect) return;
    var a = btn.getBoundingClientRect();
    var vw = window.innerWidth || 320;
    var vh = window.innerHeight || 480;
    el.style.left = "0px";
    el.style.top = "0px";
    var box = el.getBoundingClientRect();
    var left = Math.min(Math.max(8, a.left + a.width / 2 - box.width / 2), Math.max(8, vw - box.width - 8));
    var below = a.bottom + 6;
    var top = (below + box.height > vh - 8 && a.top - box.height - 6 > 8) ? a.top - box.height - 6 : below;
    el.style.left = Math.round(left) + "px";
    el.style.top = Math.round(top) + "px";
  }

  function showTip(btn, blocks) {
    var el = tooltipHost();
    if (!el || !blocks.length) return;
    fillTip(el, blocks);
    el.hidden = false;
    tipOwner = btn;
    btn.setAttribute("aria-expanded", "true");
    placeTip(el, btn);
  }

  function hideTip(force) {
    if (tipPinned && !force) return;
    tipPinned = false;
    if (tipOwner && tipOwner.setAttribute) tipOwner.setAttribute("aria-expanded", "false");
    tipOwner = null;
    if (tipEl) tipEl.hidden = true;
  }

  /**
   * The ⓘ itself — a real `button`, so it is reachable by Tab and answers Enter.
   *
   * Hover alone would have been half a control: the panel is used from the keyboard, and a hint
   * nobody can reach is the state this change set out to leave behind. Click pins the bubble open so
   * a two-sentence explanation can be read without holding the pointer still.
   */
  function buildInfo(blocks) {
    if (!blocks || !blocks.length) return null;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "config-ui-info";
    btn.setAttribute("aria-label", "Explain this setting");
    btn.setAttribute("aria-expanded", "false");
    // The text, on the button. The bubble is built when it is shown, so without this the explanation
    // is nowhere in the document — which would put it out of reach of the specimen page, which renders
    // the form once and never hovers anything, and of every test that checks a control says what it
    // should. It is the content, not a duplicate of it: `fillTip` reads the same blocks.
    btn.setAttribute("data-info", blocks.map(function (b) { return b.text; }).join("\n\n"));
    btn.textContent = "i";
    btn.addEventListener("mouseenter", function () { if (!tipPinned) showTip(btn, blocks); });
    btn.addEventListener("mouseleave", function () { if (!tipPinned) hideTip(); });
    btn.addEventListener("focus", function () { showTip(btn, blocks); });
    btn.addEventListener("blur", function () { hideTip(true); });
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (tipPinned && tipOwner === btn) { hideTip(true); return; }
      tipPinned = false;
      showTip(btn, blocks);
      tipPinned = true;
    });
    btn.addEventListener("keydown", function (e) {
      if (e.key === "Escape") hideTip(true);
    });
    return btn;
  }

  /** Hangs the ⓘ off a label, when there is anything to say. */
  function attachInfo(labelEl, owner, prose) {
    var blocks = tipBlocks(owner, prose);
    var btn = buildInfo(blocks);
    if (btn && labelEl) labelEl.appendChild(btn);
    return btn;
  }

  /**
   * Which control each paragraph belongs to.
   *
   * A paragraph row has no owner in the block — it is a comment line between two other lines — so
   * the question is decided by adjacency, and the shipped scripts answer it two different ways. Most
   * write the explanation *under* the field (`rename-variables` and the six scripts shaped like it);
   * a few write it *above* (`merge-variable-collections` / Copy or move, `config`). A blank or bare `//` line is
   * what separates one from the next, and it turns out to be a reliable signal: where an author put
   * a spacer, they meant the paragraph to go with the other side.
   *
   * So: an owner touching it above wins, then one touching it below, then the nearest either way. A
   * divider ends a section and blocks the search — prose after a rule belongs to what follows it, not
   * to what the rule just closed off. Checked against all 68 paragraphs in `scripts/`; the two that
   * came out attached to the wrong control were the two blocks whose spacing disagreed with their
   * intent, and both were given the spacer that says what they mean.
   *
   * The fold is presentational and lives here rather than in the parser on purpose: `serialize`
   * writes rows back out to rebuild the config block, and a parser that swallowed paragraphs would
   * drop a person's comments out of their own config the first time they touched a field.
   */
  function foldProse(rows) {
    var prose = {};
    var folded = {};
    if (!rows || !rows.length) return { prose: prose, folded: folded };
    // `@prose` — this block is a reference, and its paragraphs are what it exists to show.
    for (var d = 0; d < rows.length; d++) {
      if (rows[d].directive === "prose") return { prose: prose, folded: folded };
    }
    function owns(r) { return r.type === "field" || r.type === "heading" || r.type === "chips"; }
    function gap(r) { return r.type === "blank" || r.type === "lineBreak"; }

    function seek(from, step) {
      var adjacent = true;
      for (var j = from; j >= 0 && j < rows.length; j += step) {
        var r = rows[j];
        if (r.type === "paragraph") continue;
        if (gap(r)) { adjacent = false; continue; }
        if (owns(r)) return { at: j, adjacent: adjacent };
        return null; // a divider, a preview slot, anything else: the search stops here
      }
      return null;
    }

    // A `@PANEL_START` paragraph carries its own direction (see `parser.js`'s `parsePanelSpec`) —
    // there is no blank-line gap in JSON to read one from, so it says which neighbour it explains
    // instead of the search below guessing. Old-format rows never set `attachTo`, so nothing here
    // changes for them.
    function seekDirected(from, step) {
      for (var j = from; j >= 0 && j < rows.length; j += step) {
        var r = rows[j];
        if (r.type === "paragraph" || gap(r)) continue;
        if (owns(r)) return j;
        return null; // a divider, a preview slot, anything else: the search stops here
      }
      return null;
    }

    for (var i = 0; i < rows.length; i++) {
      if (rows[i].type !== "paragraph") continue;
      var target;
      if (rows[i].attachTo === "next") {
        target = seekDirected(i + 1, 1);
      } else if (rows[i].attachTo === "previous") {
        target = seekDirected(i - 1, -1);
      } else {
        var back = seek(i - 1, -1);
        var fwd = seek(i + 1, 1);
        target =
          (back && back.adjacent) ? back.at :
          (fwd && fwd.adjacent) ? fwd.at :
          back ? back.at :
          fwd ? fwd.at : null;
      }
      // Nothing to explain — a paragraph alone between two rules stays on the page rather than
      // vanishing, because the alternative is losing text with nowhere to put it.
      if (target == null) continue;
      (prose[target] || (prose[target] = [])).push(rows[i].text);
      folded[i] = true;
    }
    return { prose: prose, folded: folded };
  }

  // **A section's identity, derived rather than stored.** `parse()` returns a flat `rows` array with
  // no section object of its own — a section is "whatever fields come after this heading" only at
  // render time. `currentSectionSlug` is reset once per `buildForm` pass and updated by `buildRow`
  // whenever it draws a heading, so a plain field can be stamped with the section it visually sits in
  // without the parser needing to compute or store one. See `.plans/29-field-identity.md`.
  var currentSectionSlug = "";

  /** Lowercase, non-alphanumeric runs collapsed to one hyphen, no leading or trailing hyphen. */
  function sectionSlug(text) {
    return String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  function buildField(field, idx, prose) {
    var n = field.name;
    var t = field.type;
    var v = field.value;
    var l = field.label || n;
    var tip = field.tooltip || "";
    var id = "config-ui-" + n + "-" + idx;
    var wrap = document.createElement("div");
    wrap.className = "config-ui-field config-ui-field--" + t;
    // **Identity a stylesheet can select on** — a field wrapper otherwise carries only its control
    // type. Additive: no class changed, no parser input required. `data-group` is the parent group a
    // `@rows` cell belongs to (unset for a plain `@UI_CONFIG` field, which has no group of its own);
    // `data-package` wants a package id, which does not exist before `.plans/32-packages.md`, so a
    // plain field is never inside one and does not carry it — only `buildForm`'s root does, empty for
    // now. See `.plans/29-field-identity.md`.
    wrap.setAttribute("data-key", n);
    wrap.setAttribute("data-type", t);
    if (field.group) wrap.setAttribute("data-group", field.group);
    if (field.sectionSlug) wrap.setAttribute("data-section", field.sectionSlug);
    var fswr = field.showWhenRules || (field.showWhen ? [field.showWhen] : []);
    if (fswr && fswr.length) {
      wrap.setAttribute("data-show-when-rules", JSON.stringify(fswr));
    }
    var row = document.createElement("div");
    row.className = "config-ui-field__row";
    // A rows control is a **section**, not a field: the section heading above it already names it, and
    // the tab strip and its fields want the whole width rather than the 7fr control column. So no label.
    // (This supersedes the centred-label exception plan 17 recorded for `@rows` — there is no label left
    // to centre.)
    if (t !== "rows") {
      var lab = document.createElement("label");
      lab.className = "config-ui-field__label";
      lab.htmlFor = id;
      lab.textContent = l;
      attachInfo(lab, field, prose);
      row.appendChild(lab);
    } else if (tip || field.helper || (prose && prose.length)) {
      // A `@rows` control is a section rather than a field and has no label to hang an ⓘ from — the
      // heading above it is what a reader is looking at. Nothing in `scripts/` folds prose onto one,
      // and the native title stays as the fallback rather than inventing a header to hold a button.
      wrap.title = tipBlocks(field, prose).map(function (b) { return b.text; }).join("\n\n");
    }
    var cw = document.createElement("div");
    cw.className = "config-ui-field__control";

    if (t === "boolean") {
      var tw = document.createElement("div");
      tw.className = "config-ui-toggle-wrap";
      var inp = document.createElement("input");
      inp.type = "checkbox";
      inp.id = id;
      inp.checked = !!v;
      inp.className = "config-ui-toggle";
      inp.setAttribute("data-field", n);
      tw.appendChild(inp);
      cw.appendChild(tw);
    } else if (t === "number") {
      var ni = document.createElement("input");
      ni.type = "number";
      ni.id = id;
      ni.value = v;
      ni.className = "config-ui-input config-ui-input--number";
      ni.setAttribute("data-field", n);
      if (field.placeholder) ni.setAttribute("placeholder", field.placeholder);
      cw.appendChild(ni);
    } else if (t === "radio" && field.options && field.options.length) {
      var rg = document.createElement("div");
      rg.className = "config-ui-radio-group";
      var ov = v != null ? String(v) : "";
      field.options.forEach(function (opt, i) {
        var lbl = document.createElement("label");
        lbl.className = "config-ui-radio-label";
        var inp = document.createElement("input");
        inp.type = "radio";
        inp.name = "cfg-" + n + "-" + idx;
        inp.id = id + "-" + i;
        inp.value = fieldOptionValue(opt);
        inp.checked = fieldOptionValue(opt) === ov;
        inp.className = "config-ui-radio";
        inp.setAttribute("data-field", n);
        lbl.appendChild(inp);
        var sp = document.createElement("span");
        sp.textContent = fieldOptionLabel(opt);
        lbl.appendChild(sp);
        rg.appendChild(lbl);
      });
      cw.appendChild(rg);
    } else if (t === "multiselect" && field.options && field.options.length && !field.optionSource) {
      // A fixed set of options with `@multi`. This branch did not exist: the multiselect required a
      // dynamic `optionSource`, so a static list fell through to the text input at the bottom and
      // rendered an array as `gap,margin` — the corruption class again, arriving by omission.
      var sbox = document.createElement("div");
      sbox.id = id;
      sbox.className = "config-ui-multiselect";
      sbox.setAttribute("data-field", n);
      sbox.setAttribute("data-multi", "true");
      var chosen = Array.isArray(v) ? v.map(String) : (v == null || String(v).trim() === "" ? [] : [String(v)]);
      field.options.forEach(function (opt) {
        var lbl = document.createElement("label");
        lbl.className = "config-ui-multiselect-item";
        var cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = "config-ui-multiselect-cb";
        cb.value = opt;
        cb.checked = chosen.indexOf(opt) !== -1;
        lbl.appendChild(cb);
        var sp = document.createElement("span");
        sp.textContent = opt;
        lbl.appendChild(sp);
        sbox.appendChild(lbl);
      });
      cw.appendChild(sbox);
    } else if (t === "multiselect" && field.optionSource) {
      var mbox = document.createElement("div");
      mbox.id = id;
      mbox.className = "config-ui-multiselect";
      mbox.setAttribute("data-field", n);
      mbox.setAttribute("data-option-source", field.optionSource);
      mbox.setAttribute("data-multi", "true");
      var selected = Array.isArray(v) ? v : v != null && String(v).trim() !== "" ? [String(v)] : [];
      mbox.setAttribute("data-initial-value", JSON.stringify(selected));
      mbox.textContent = "Loading collections…";
      cw.appendChild(mbox);
      if (typeof parent !== "undefined" && parent.postMessage) {
        parent.postMessage(
          { pluginMessage: { type: "GET_OPTIONS", optionSource: field.optionSource } },
          "*"
        );
      }
    } else if (t === "select" && field.optionSource) {
      var sel = document.createElement("select");
      sel.id = id;
      sel.className = "config-ui-input config-ui-input--select";
      sel.setAttribute("data-field", n);
      sel.setAttribute("data-option-source", field.optionSource);
      var ov = v != null ? String(v) : "";
      sel.setAttribute("data-initial-value", ov);
      var placeOpt = document.createElement("option");
      placeOpt.value = ov || "__loading__";
      placeOpt.textContent = ov || "Loading...";
      sel.appendChild(placeOpt);
      if (ov) sel.value = ov;
      cw.appendChild(sel);
      if (typeof parent !== "undefined" && parent.postMessage) {
        parent.postMessage(
          { pluginMessage: { type: "GET_OPTIONS", optionSource: field.optionSource } },
          "*"
        );
      }
    } else if (t === "select" && field.options && field.options.length) {
      var sel2 = document.createElement("select");
      sel2.id = id;
      sel2.className = "config-ui-input config-ui-input--select";
      sel2.setAttribute("data-field", n);
      var ov2 = v != null ? String(v) : "";
      field.options.forEach(function (opt) {
        var o = document.createElement("option");
        o.value = fieldOptionValue(opt);
        o.textContent = fieldOptionLabel(opt);
        if (fieldOptionValue(opt) === ov2) o.selected = true;
        sel2.appendChild(o);
      });
      if (!sel2.value && field.options[0]) sel2.value = fieldOptionValue(field.options[0]);
      cw.appendChild(sel2);
    } else if (t === "group" && field.columns && field.columns.length) {
      // The same control a nested `@rows` column builds, at field level: one labelled row, captioned parts.
      // Reusing it is the point — the OKLCH settings Lightness row and a mode's Bright anchor are the same
      // shape, and two builders for one shape is how they drift.
      cw.appendChild(buildRowGroup(field, v && typeof v === "object" ? v : {}, "cfg-" + n + "-" + idx));
    } else if (t === "curve") {
      var curveWrap = buildCurveControl(field, v, undefined, n);
      curveWrap.setAttribute("data-curve-field", n);
      cw.appendChild(curveWrap);
    } else if (t === "collection") {
      cw.appendChild(buildCollectionControl(field, v == null ? "" : String(v)));
    } else if (t === "mode") {
      cw.appendChild(buildModeControl(field, v == null ? "" : String(v)));
    } else if (t === "rows") {
      cw.appendChild(buildRowsControl(field, Array.isArray(v) ? v : []));
    } else if (t === "unsupported") {
      // No control represents this value, so it is shown as written and **not** given a
      // `data-field`: getValues collects by that attribute, so leaving it off is what makes
      // serialize write the original line back untouched. Edit it in the Script tab.
      var ro = document.createElement("pre");
      ro.className = "config-ui-readonly";
      ro.textContent = typeof v === "string" ? v : JSON.stringify(v, null, 2);
      ro.setAttribute("aria-readonly", "true");
      // Named, but with `data-readonly-field` rather than `data-field`, so `getValues` still
      // ignores it and `readForm` can still see it. "The form silently dropped this field" is
      // exactly the state worth being able to observe from outside.
      ro.setAttribute("data-readonly-field", n);
      ro.setAttribute("title", "Edit this one in the Script tab — no form control can hold it");
      cw.appendChild(ro);
    } else if (t === "list") {
      // One input holding a comma list, which is what the frames show for Tokens — and the config keeps
      // its array, so nothing about the paste format changes. `p.listToText` and `p.textToList` are the
      // one conversion, used here and by the collector below.
      var listInput = document.createElement("input");
      listInput.type = "text";
      listInput.className = "config-ui-input config-ui-input--text";
      listInput.setAttribute("data-field", n);
      listInput.setAttribute("data-field-list", "true");
      listInput.value = p.listToText(v);
      if (field.placeholder) listInput.setAttribute("placeholder", field.placeholder);
      cw.appendChild(listInput);
    } else if (t === "textarea") {
      var ta = document.createElement("textarea");
      ta.id = id;
      ta.value = v == null ? "" : String(v);
      ta.className = "config-ui-input config-ui-input--text config-ui-textarea";
      ta.setAttribute("data-field", n);
      if (field.placeholder) ta.setAttribute("placeholder", field.placeholder);
      ta.rows = field.rows || 5;
      cw.appendChild(ta);
    } else {
      var ti = document.createElement("input");
      ti.type = "text";
      ti.id = id;
      ti.value = v == null ? "" : String(v);
      ti.className = "config-ui-input config-ui-input--text";
      ti.setAttribute("data-field", n);
      if (field.placeholder) ti.setAttribute("placeholder", field.placeholder);
      cw.appendChild(ti);
    }
    row.appendChild(cw);
    // `@helper:` used to draw a note here, under the control. It is in the ⓘ beside the label now,
    // with the field's leftover prose and any paragraph written against it — one explanation per
    // control instead of three places to look. `.config-ui-field-note` stays for the notes that
    // report *state* rather than meaning: `@disabledNote:`, the collection and mode notes, and the
    // pending mode removal. Those are things about to happen, and hiding a consequence behind a
    // hover is not the same trade as hiding a description.
    wrap.appendChild(row);
    return wrap;
  }

  /**
   * The collection a `@mode` row follows, as the block spells it: the field it names, or — written
   * bare — the block's only collection picker. The same rule `collectionWrapForMode` applies to the
   * rendered form, against the schema instead.
   */
  function seedCollectionValue(row, schema) {
    var rows = (schema && schema.rows) || [];
    var candidates = rows.filter(function (other) {
      return other.type === "field" && other.inputType === "collection";
    });
    if (row.collectionField) {
      var named = candidates.filter(function (other) { return other.name === row.collectionField; })[0];
      return named ? named.value : "";
    }
    return candidates.length === 1 ? candidates[0].value : "";
  }

  function buildRow(r, idx, schema, prose) {
    if (r.type === "lineBreak") {
      var wr = document.createElement("div");
      wr.className = "config-ui-row config-ui-row--line-break";
      wr.setAttribute("aria-hidden", "true");
      return wr;
    }
    if (r.type === "divider") {
      var wr2 = document.createElement("div");
      wr2.className = "config-ui-row config-ui-row--divider" +
        (r.section ? " config-ui-row--divider-section" : "");
      wr2.appendChild(document.createElement("hr"));
      return wr2;
    }
    if (r.type === "heading") {
      var wrap = document.createElement("div");
      wrap.className = "config-ui-row config-ui-row--heading";
      var hrules = r.showWhenRules || (r.showWhen ? [r.showWhen] : []);
      if (hrules && hrules.length) {
        wrap.setAttribute("data-show-when-rules", JSON.stringify(hrules));
      }
      var tag = configHeadingTag(r.level);
      var h = document.createElement(tag);
      h.className = "config-ui-heading";
      h.textContent = r.text;
      // A section's own intro folds onto its heading: the paragraph under `# Mode settings` explains
      // the four fields below it rather than any one of them, so the heading is the only honest place
      // to hang it.
      attachInfo(h, r, prose);
      wrap.appendChild(h);
      // Every field row from here until the next heading carries this slug — see `currentSectionSlug`.
      currentSectionSlug = sectionSlug(r.text);
      wrap.setAttribute("data-section", currentSectionSlug);
      return wrap;
    }
    if (r.type === "paragraph") {
      var wrap2 = document.createElement("div");
      wrap2.className = "config-ui-row config-ui-row--paragraph";
      var prules = r.showWhenRules || (r.showWhen ? [r.showWhen] : []);
      if (prules && prules.length) {
        wrap2.setAttribute("data-show-when-rules", JSON.stringify(prules));
      }
      var mdWrap = document.createElement("div");
      mdWrap.className = "docs-rendered";
      // The same rule the tooltip uses: a source newline is a wrap, not a break. One paragraph
      // renderer, one answer — the shelf in Help and a bubble cannot disagree about where a line ends.
      var md = r.text;
      mdWrap.innerHTML =
        typeof window.marked !== "undefined" && window.marked.parse
          ? window.marked.parse(md, { gfm: true })
          : md.replace(/&/g, "&amp;").replace(/\x3c/g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, " ");
      wrap2.appendChild(mdWrap);
      return wrap2;
    }
    if (r.type === "directive") {
      // Present in the block, absent from the panel.
      var hidden = document.createElement("div");
      hidden.className = "config-ui-row config-ui-row--directive";
      hidden.style.display = "none";
      return hidden;
    }
    if (r.type === "suggestions") {
      var suggestSlot = document.createElement("div");
      suggestSlot.className = "config-ui-row config-ui-row--suggestions";
      suggestSlot.setAttribute("data-suggestions-slot", "true");
      // The search for alternatives is not built. Dimmed and captioned rather than absent, so the
      // panel reports how far along it is instead of looking finished.
      return suggestSlot;
    }
    if (r.type === "preview") {
      // The panel fills this: the row's job is to say where the section belongs in the order.
      var previewSlot = document.createElement("div");
      previewSlot.className = "config-ui-row config-ui-row--preview";
      previewSlot.setAttribute("data-preview-slot", "true");
      return previewSlot;
    }
    if (r.type === "chips") {
      var chipsWrap = document.createElement("div");
      chipsWrap.className = "config-ui-row config-ui-row--field config-ui-row--chips";
      var crules = r.showWhenRules || (r.showWhen ? [r.showWhen] : []);
      if (crules && crules.length) {
        chipsWrap.setAttribute("data-show-when-rules", JSON.stringify(crules));
      }
      var chipsField = document.createElement("div");
      chipsField.className = "config-ui-field config-ui-field--chips";
      var chipsRow = document.createElement("div");
      chipsRow.className = "config-ui-field__row";
      var chipsLabel = document.createElement("label");
      chipsLabel.className = "config-ui-field__label";
      chipsLabel.textContent = r.label || "Collection modes";
      attachInfo(chipsLabel, r, prose);
      chipsRow.appendChild(chipsLabel);
      var chipsControl = document.createElement("div");
      chipsControl.className = "config-ui-field__control";
      chipsControl.appendChild(buildChipsControl(r, schema));
      chipsRow.appendChild(chipsControl);
      chipsField.appendChild(chipsRow);
      chipsWrap.appendChild(chipsField);
      return chipsWrap;
    }
    if (r.type === "field") {
      var wrap3 = document.createElement("div");
      // A charted curve is the width of the block wherever it lives — in a mode's row cell or, as OKLCH's
      // shared ladder is, as a field of its own. The modifier is what the stylesheet keys the break-out on.
      wrap3.className = "config-ui-row config-ui-row--field" +
        (r.inputType === "rows" ? " config-ui-row--fullwidth" : "") +
        (r.inputType === "curve" && r.ends ? " config-ui-row--charted" : "");
      var frules = r.showWhenRules || (r.showWhen ? [r.showWhen] : []);
      if (frules && frules.length) {
        wrap3.setAttribute("data-show-when-rules", JSON.stringify(frules));
      }
      // **Copied, not hand-listed.** This was a whitelist of ten property names, and it silently
      // dropped every property the parser learned after it was written — `@rows` shipped with its
      // `columns` and `tabs` lost here, so rows rendered with no cells and `@tabs` produced no tabs.
      // A list that has to be kept in step with another list is the seam this codebase keeps
      // hitting; the fix is the same one `bridge.js` got. `type` is the only rename.
      var f = {};
      for (var key in r) {
        if (Object.prototype.hasOwnProperty.call(r, key)) f[key] = r[key];
      }
      f.type = r.inputType;
      f.sectionSlug = currentSectionSlug;
      // The value of the collection this mode picker follows, read from the block rather than from
      // the DOM: at this point the collection picker may not have been built yet.
      if (r.inputType === "mode") f.collectionValue = seedCollectionValue(r, schema);
      wrap3.appendChild(buildField(f, idx, prose));
      return wrap3;
    }
    return document.createElement("div");
  }

  function buildForm(schema, container) {
    if (!schema) {
      hideTip(true);
      container.innerHTML = '<div class="config-ui-empty">No configuration options.</div>';
      return;
    }
    if (schema.rows && schema.rows.length) {
      // The bubble lives on `document.body`, not in the form, so a rebuild — every `@showWhen` change,
      // every sync — would leave it on screen pointing at a button that no longer exists.
      hideTip(true);
      container.innerHTML = "";
      container.className = "config-ui-form config-ui-form--rows";
      // Reset once per render pass, before any heading has been seen — see `currentSectionSlug`.
      currentSectionSlug = "";
      // Empty until `.plans/32-packages.md` assigns real ids; stamped now so a stylesheet has a
      // stable attribute to select on rather than waiting for the value to exist.
      container.setAttribute("data-package", "");
      // **Who owns the membership of the mode list.** A chips row *is* the list of modes, so wherever one
      // exists the array control must not offer its own Add — two controls for one action is the shape that
      // produced the mode-picker confusion. This used to be decided by `field.tabs`, which was only ever a
      // proxy for "there are chips above"; `@blocks` has chips now too.
      var hasChips = schema.rows.some(function (r) { return r.type === "chips"; });
      if (hasChips) {
        schema.rows.forEach(function (r) {
          if (r.type === "field" && r.inputType === "rows") r.membershipFromChips = true;
        });
      }
      var fieldIdx = 0;
      // Which paragraph explains which control, decided once for the whole block — a row cannot
      // answer it alone, because the answer is about the rows on either side of it.
      var fold = foldProse(schema.rows);
      schema.rows.forEach(function (r, i) {
        // A folded paragraph is not dropped from the schema, only from the page: it is still in
        // `schema.rows`, so `serialize` writes it back into the config block exactly as it was.
        if (fold.folded[i]) return;
        // The schema goes with the row: the chips control needs the mode names, which live in another
        // row's value. Passing context beats either control reaching into the DOM for the other,
        // which would depend on render order.
        var el = buildRow(r, r.type === "field" ? fieldIdx++ : 0, schema, fold.prose[i]);
        el.setAttribute("data-row-index", String(i));
        container.appendChild(el);
      });
      return;
    }
    // `parse()` returns `{ rows }` and nothing else, so there is one rendering. A second branch here
    // built a `.config-ui-section` tree that no schema could reach, and it carried its own copy of the
    // heading, divider and container styles — which is how "the config form" came to mean two
    // different sets of CSS. Removed with those rules.
    container.innerHTML = '<div class="config-ui-empty">No configuration options.</div>';
  }

  /**
   * Collection modes, as chips.
   *
   * **A 1:1 view of the collection's modes, not of the config.** A mode is a thing in the file and a
   * set of values in the config at the same time; only the second is a config key. So these chips own
   * no `data-field`, hold edit intent that reaches the document at Run, and the Mode settings tab strip
   * takes its names and order from them.
   *
   * Seeded from the config's mode names while no collection has been chosen — which is the whole of the
   * layout pass. Reading the real collection is behaviour, and comes second.
   *
   * Every rule here is Márton's:
   * - before a collection exists the single chip is a **placeholder** and not editable, because there
   *   is nowhere for a mode to be created yet;
   * - `+` reveals an inline input where the chip will appear; Enter or blur commits, Escape cancels, so
   *   **a mode never exists unnamed**;
   * - clicking a label edits in place and that is a **rename** — the mode keeps its `modeId`, so values
   *   and bindings survive, and this is the only rename affordance;
   * - `—` removes, and the **last remaining mode has none**;
   * - chips are draggable, and drag owns the config order, the tab order and the creation order.
   */
  function buildChipsControl(row, schema) {
    var wrap = document.createElement("div");
    wrap.className = "config-ui-chips";
    wrap.setAttribute("data-chips-field", row.from || "modes");

    var names = chipNamesFromSchema(row, schema);
    var placeholder = names.length === 0;
    if (placeholder) names = [chipPlaceholderName()];
    wrap.setAttribute("data-placeholder", placeholder ? "true" : "false");

    drawChips(wrap, names, placeholder);
    return wrap;
  }

  /**
   * The name to show before a collection exists.
   *
   * Figma's variables panel labels a single-mode collection's column "Value" whatever the mode is
   * called, which is where the frame's wording comes from — but the rename affordance edits the real
   * name, so the real name is what to show. Until a collection is read there is no real name, so this
   * is a placeholder and says so by not being editable.
   */
  function chipPlaceholderName() {
    return "Value";
  }

  function chipNamesFromSchema(row, schema) {
    var rows = schema && schema.rows ? schema.rows : [];
    var key = row.from || "modes";
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].type !== "field" || rows[i].name !== key) continue;
      var value = rows[i].value;
      if (!Array.isArray(value)) return [];
      return value
        .map(function (entry) { return entry && entry.name; })
        .filter(function (name) { return typeof name === "string" && name.trim() !== ""; });
    }
    return [];
  }

  /**
   * Hang the file's `modeId`s back on the chips, by position.
   *
   * By position and not by name, deliberately: a renamed chip no longer matches the name the file has
   * for that mode, and matching on names is what would turn the rename into a delete. The panel's list
   * is parallel to the config's `modes` array and both are transformed by the same operation, so the
   * positions cannot disagree.
   *
   * The ids are informational in the DOM — they are here so `readForm` and a person with the inspector
   * can see which chip is which mode. Nothing reads them back out to make a decision.
   */
  function populateChipsControl(wrap, modeIds) {
    var ids = modeIds || [];
    wrap.querySelectorAll(".config-ui-chip").forEach(function (chip, i) {
      if (ids[i]) chip.setAttribute("data-mode-id", ids[i]);
      else chip.removeAttribute("data-mode-id");
    });
  }

  /** The last operation, consumed: read once and cleared, so it can never be applied twice. */
  function readChipOp(wrap) {
    var raw = wrap.getAttribute("data-chip-op");
    if (!raw) return null;
    wrap.removeAttribute("data-chip-op");
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  /** The chips a control currently holds, in their displayed order. */
  function readChipsControl(wrap) {
    if (wrap.getAttribute("data-placeholder") === "true") return [];
    var names = [];
    wrap.querySelectorAll(".config-ui-chip").forEach(function (chip) {
      var name = chip.getAttribute("data-chip-name");
      if (name) names.push(name);
    });
    return names;
  }

  /**
   * Draw the chips, and say **what changed** rather than leaving it to be worked out.
   *
   * Every edit announces a named operation on the wrap — `{"op":"rename","index":1,"to":"Pad"}` — which
   * the panel applies to the config's `modes` array and to its own list of `modeId`s in one step.
   *
   * The alternative was matching the new chip list against the old one, and it cannot work: after a
   * rename the config says `Pad` and the file still says `Tablet`, so a name match sees one mode gone
   * and one arrived. That is an add plus an orphan, and the orphan keeps every value and binding —
   * exactly the loss a rename is supposed to avoid. Positions are not enough either, because a reorder
   * moves them. The operation is the only thing that is unambiguous, so it is what travels.
   */
  function drawChips(wrap, names, placeholder) {
    wrap.innerHTML = "";

    function announce() {
      wrap.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function commit(next, op) {
      wrap.setAttribute("data-placeholder", "false");
      // Set before the redraw, because the redraw is what the panel will re-read the chips from.
      wrap.setAttribute("data-chip-op", JSON.stringify(op));
      drawChips(wrap, next, false);
      announce();
    }

    names.forEach(function (name, index) {
      var chip = document.createElement("span");
      chip.className = "config-ui-chip" + (placeholder ? " config-ui-chip--placeholder" : "");
      chip.setAttribute("data-chip-name", name);
      chip.setAttribute("data-chip-index", String(index));
      if (!placeholder) chip.setAttribute("draggable", "true");

      var label = document.createElement("span");
      label.className = "config-ui-chip-label";
      label.textContent = name;
      if (!placeholder) {
        // The only rename affordance. Deliberately not on the Mode settings tabs.
        label.setAttribute("role", "button");
        label.setAttribute("title", "Click to rename — the mode keeps its values and bindings");
        label.addEventListener("click", function () {
          editChipName(wrap, names, index, commit);
        });
      }
      chip.appendChild(label);

      // The last remaining mode has no remove: a collection cannot have zero modes.
      if (!placeholder && names.length > 1) {
        var minus = document.createElement("button");
        minus.type = "button";
        minus.className = "config-ui-chip-remove";
        minus.setAttribute("aria-label", "Remove mode " + name);
        minus.textContent = "\u2014";
        minus.addEventListener("click", function () {
          var next = names.slice();
          next.splice(index, 1);
          commit(next, { op: "remove", index: index, name: name });
        });
        chip.appendChild(minus);
      }

      if (!placeholder) attachChipDrag(chip, wrap, names, index, commit);
      wrap.appendChild(chip);
    });

    // **No `+` until a collection exists.** With nowhere for a mode to be created, an add button is an
    // affordance for something that cannot happen. The wording is the design's own — a hidden text
    // node in the frame reads "Modes locked by Collection scope".
    if (placeholder) {
      var locked = document.createElement("span");
      locked.className = "config-ui-chips-locked";
      locked.textContent = "Modes locked by Collection scope";
      wrap.appendChild(locked);
      return;
    }

    var add = document.createElement("button");
    add.type = "button";
    add.className = "config-ui-chip-add";
    add.setAttribute("aria-label", "Add a mode");
    add.textContent = "+";
    add.addEventListener("click", function () {
      openChipInput(wrap, names, commit);
    });
    wrap.appendChild(add);
  }

  /**
   * The inline input. **It replaces the `+`**, focused, at the place the chip will appear.
   *
   * Márton corrected the design here: the input standing beside a still-visible `+` reads as two
   * ways to do the same thing at once. Pressing `+` *becomes* the input; Enter commits and the pill
   * appears; Escape puts the `+` back. A mode never exists unnamed, and there is never a moment where
   * both affordances are offered.
   */
  function openChipInput(wrap, names, commit) {
    if (wrap.querySelector(".config-ui-chip-input")) return;
    var add = wrap.querySelector(".config-ui-chip-add");

    var input = document.createElement("input");
    input.type = "text";
    input.className = "config-ui-input config-ui-input--text config-ui-chip-input";
    input.setAttribute("placeholder", "Mode name");

    var settled = false;
    function close() {
      if (settled) return;
      settled = true;
      if (input.parentNode) input.parentNode.removeChild(input);
      // The `+` comes back — it was hidden rather than removed, so nothing has to rebuild to restore it.
      if (add) add.style.display = "";
    }
    function accept() {
      var name = input.value.trim();
      var known = names.indexOf(name) !== -1;
      close();
      if (!name || known) return;
      commit(names.concat([name]), { op: "add", name: name });
    }

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); accept(); }
      else if (e.key === "Escape") { e.preventDefault(); close(); }
    });
    input.addEventListener("blur", accept);

    if (add) {
      add.style.display = "none";
      wrap.insertBefore(input, add);
    } else {
      wrap.appendChild(input);
    }
    input.focus();
  }

  /** Editing a label in place. A rename, so the mode keeps its identity. */
  function editChipName(wrap, names, index, commit) {
    var chip = wrap.querySelectorAll(".config-ui-chip")[index];
    if (!chip || chip.querySelector(".config-ui-chip-input")) return;
    var label = chip.querySelector(".config-ui-chip-label");
    if (!label) return;

    var input = document.createElement("input");
    input.type = "text";
    input.className = "config-ui-input config-ui-input--text config-ui-chip-input";
    input.value = names[index];

    function restore() {
      if (input.parentNode) input.parentNode.removeChild(input);
      label.style.display = "";
    }
    function accept() {
      var name = input.value.trim();
      restore();
      if (!name || name === names[index]) return;
      var next = names.slice();
      next[index] = name;
      commit(next, { op: "rename", index: index, from: names[index], to: name });
    }

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); accept(); }
      else if (e.key === "Escape") { e.preventDefault(); restore(); }
    });
    input.addEventListener("blur", accept);

    label.style.display = "none";
    chip.insertBefore(input, label);
    input.focus();
    input.select();
  }

  /**
   * Drag to reorder. Drag owns the config order, the tab order, and the creation order of a new
   * collection — it cannot reorder the modes of a collection that already has variables, because the
   * plugin API has no way to. That is reported when it happens rather than silently ignored.
   */
  function attachChipDrag(chip, wrap, names, index, commit) {
    chip.addEventListener("dragstart", function (e) {
      if (e.dataTransfer) {
        e.dataTransfer.setData("text/plain", String(index));
        e.dataTransfer.effectAllowed = "move";
      }
      chip.classList.add("is-dragging");
    });
    chip.addEventListener("dragend", function () {
      chip.classList.remove("is-dragging");
    });
    chip.addEventListener("dragover", function (e) {
      e.preventDefault();
      chip.classList.add("is-drop-target");
    });
    chip.addEventListener("dragleave", function () {
      chip.classList.remove("is-drop-target");
    });
    chip.addEventListener("drop", function (e) {
      e.preventDefault();
      chip.classList.remove("is-drop-target");
      var from = e.dataTransfer ? Number(e.dataTransfer.getData("text/plain")) : NaN;
      if (isNaN(from) || from === index) return;
      var next = names.slice();
      var moved = next.splice(from, 1)[0];
      next.splice(index, 0, moved);
      commit(next, { op: "reorder", from: from, to: index });
    });
  }

  /**
   * The collection picker: one field, two ways to fill it.
   *
   * The select lists this file's collections; choosing *Create a new one* reveals a text input. Both
   * write the same string, because `getOrCreateCollection` creates a collection whose name is not
   * found — so "new" is not a state the config records, it is a thing that happens on Run.
   *
   * What that costs is a typo quietly creating a collection, so the control says which of the two is
   * about to happen before anyone presses Run. A pasted config naming a collection this file does not
   * have lands in exactly that state, and it is the case worth being clear about rather than the
   * exception.
   */
  function buildCollectionControl(field, value) {
    var wrap = document.createElement("div");
    // Two classes, two jobs: `config-ui-picker` is the layout every select-plus-input control shares,
    // `config-ui-collection` is this one's name and what the DOM is addressed by.
    wrap.className = "config-ui-collection config-ui-picker";
    wrap.setAttribute("data-collection-field", field.name);
    // Local collections only, and no empty "(all)" entry: `variableCollections` is a *filter*
    // source, which is a different question from "where should this be written".
    wrap.setAttribute("data-option-source", "localCollections");
    wrap.setAttribute("data-initial-value", value);

    // No `data-field` on either part: the flat collector would report the sentinel as the value.
    var select = document.createElement("select");
    select.className = "config-ui-input config-ui-input--select config-ui-collection-select";
    wrap.appendChild(select);

    var newName = document.createElement("input");
    newName.type = "text";
    newName.className = "config-ui-input config-ui-input--text config-ui-collection-new";
    newName.setAttribute("placeholder", "New collection name");
    newName.setAttribute("data-collection-new-label", "New collection name");
    newName.style.display = "none";
    wrap.appendChild(newName);

    var note = document.createElement("div");
    // The panel's note style, the same one `@helper:` uses. It had a private copy of those three
    // declarations; a note under a control is a note under a control.
    note.className = "config-ui-collection-note config-ui-field-note";
    wrap.appendChild(note);

    // **Revealing the name input is the select's own business.** The form's change listener collects
    // values and re-serialises the block; nothing on that path can see that the *sentinel* was
    // chosen, because `readCollectionControl` reports the empty text input, not the option. So
    // without this, picking "New collection" produced a select that visibly did nothing — the input
    // only ever appeared for a value that arrived already absent from the file, which is the pasted
    // config case rather than the one anybody clicks.
    //
    // The note stays hidden while creating deliberately: it exists to point out a name that *turned
    // out* not to be in this file, and repeating that above an input labelled "New collection name"
    // is saying the same thing twice.
    select.addEventListener("change", function () {
      var creating = select.value === collectionNewSentinel();
      newName.style.display = creating ? "block" : "none";
      if (creating) {
        if (typeof newName.focus === "function") newName.focus();
      } else {
        newName.value = "";
      }
      note.style.display = "none";
      note.textContent = "";
    });

    // Populated for real when the option list arrives; until then the value it already has is the
    // only option, so the control never renders empty.
    populateCollectionControl(wrap, value ? [value] : [], value, false);

    // The list is a backend round trip; the same request the dynamic option sources make.
    if (typeof parent !== "undefined" && parent.postMessage) {
      parent.postMessage(
        { pluginMessage: { type: "GET_OPTIONS", optionSource: "localCollections" } },
        "*"
      );
    }
    return wrap;
  }

  /** The sentinel the select uses for "create a new one". Never a collection name. */
  function collectionNewSentinel() {
    return "\u0000codefig-new";
  }

  /**
   * Fill the picker from a list of this file's collections.
   *
   * `known` is whether that list is real yet: before the backend answers, a value that is not in the
   * list is not evidence that it does not exist, so the note stays quiet rather than claiming a
   * collection will be created when nobody has looked.
   */
  function populateCollectionControl(wrap, names, value, known) {
    var select = wrap.querySelector(".config-ui-collection-select");
    var newName = wrap.querySelector(".config-ui-collection-new");
    var note = wrap.querySelector(".config-ui-collection-note");
    if (!select) return;

    var list = Array.isArray(names) ? names.filter(Boolean) : [];
    var inList = list.indexOf(value) !== -1;
    // Read before the options are thrown away. A select already sitting on the sentinel is a choice
    // somebody made, and the list arriving a moment later must not undo it merely because they have
    // not finished typing the name — which is the state the control is in for as long as it takes to
    // reach the keyboard.
    var chosenNew = select.value === collectionNewSentinel();

    select.innerHTML = "";
    // Shown when nothing is chosen, but **not an item in the list**: it is a prompt, and picking it would
    // mean nothing. `disabled` keeps it out of the choices; `hidden` keeps it out of the open menu.
    var placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select target collection or create a new one";
    placeholder.disabled = true;
    placeholder.hidden = true;
    select.appendChild(placeholder);

    list.forEach(function (name) {
      var o = document.createElement("option");
      o.value = name;
      o.textContent = name;
      select.appendChild(o);
    });

    // Separated from the collections, because it is a different kind of thing: everything above is a
    // collection that exists, and this is an instruction to make one. A disabled option is the only
    // separator a native select has.
    if (list.length > 0) {
      var rule = document.createElement("option");
      rule.disabled = true;
      rule.textContent = "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500";
      select.appendChild(rule);
    }
    var create = document.createElement("option");
    create.value = collectionNewSentinel();
    // The frames' wording, which is shorter and reads as a thing rather than an instruction.
    create.textContent = "New collection";
    select.appendChild(create);

    // A value that is not one of this file's collections is the create case, whether it was typed
    // here or arrived in a pasted config.
    var creating = chosenNew || (!!value && !inList);
    select.value = creating ? collectionNewSentinel() : value;
    if (newName) {
      newName.style.display = creating ? "block" : "none";
      newName.value = creating ? value : "";
    }
    if (note) {
      // Only for a name that *turned out* not to be here. Someone who chose "New collection" is
      // already looking at an input that says so.
      if (creating && known && value && !chosenNew) {
        note.style.display = "block";
        note.textContent = '"' + value + '" doesn\'t exist in this file \u2014 it will be created.';
      } else {
        note.style.display = "none";
        note.textContent = "";
      }
    }
  }

  /**
   * The mode picker: the collection picker one level down, and dependent on it.
   *
   * Same shape — a select of what is there, plus *New mode* revealing a name input, both writing one
   * string, because `getOrCreateMode` creates a name it cannot find. What is different comes from a
   * mode only existing *inside* a collection: **it follows another field**. The list is the modes of
   * whatever the collection picker currently holds, so it is re-fetched when that changes — and
   * **reset**, because everything it was showing belonged to the collection that is no longer chosen.
   *
   * It is always there, including for a collection with a single mode: there is still a mode to name
   * and *New mode* to reach, and a control that comes and goes reads as the panel breaking. (An
   * earlier build hid it in that case, on the reasoning that Figma does not name a single-mode column
   * either. That reasoning was about Figma's *variables table*, not about a settings form, and it
   * took the add-a-mode affordance with it.)
   *
   * All of that is behaviour. It looks like a dropdown with a text input under it, because that is
   * what it is: the same `config-ui-picker` layout and the same input classes the collection picker
   * uses, with no appearance of its own.
   */
  function buildModeControl(field, value) {
    var wrap = document.createElement("div");
    wrap.className = "config-ui-mode config-ui-picker";
    wrap.setAttribute("data-mode-field", field.name);
    // Which collection picker this one follows. Absent for a bare `@mode`, which resolves against the
    // form instead — see `collectionWrapForMode`.
    if (field.collectionField) {
      wrap.setAttribute("data-mode-collection-field", field.collectionField);
    }
    wrap.setAttribute("data-initial-value", value);

    // No `data-field` on either part, for the reason the collection picker has none: the flat
    // collector would report the sentinel as the value.
    var select = document.createElement("select");
    select.className = "config-ui-input config-ui-input--select config-ui-mode-select";
    wrap.appendChild(select);

    var newName = document.createElement("input");
    newName.type = "text";
    newName.className = "config-ui-input config-ui-input--text config-ui-mode-new";
    newName.setAttribute("placeholder", "New mode name");
    newName.setAttribute("data-mode-new-label", "New mode name");
    newName.style.display = "none";
    wrap.appendChild(newName);

    var note = document.createElement("div");
    note.className = "config-ui-mode-note config-ui-field-note";
    wrap.appendChild(note);

    // The select reveals its own input, for the reason the collection picker's does: nothing on the
    // form's change path can tell that the *sentinel* was chosen, because `readModeControl` reports
    // the empty text input rather than the option.
    select.addEventListener("change", function () {
      var creating = select.value === modeNewSentinel();
      newName.style.display = creating ? "block" : "none";
      if (creating) {
        if (typeof newName.focus === "function") newName.focus();
      } else {
        newName.value = "";
      }
      renderModeNote(wrap);
    });

    // Seeded from the block — the collection this field follows, and the mode the config names — so
    // the control shows its configured answer rather than an empty menu for as long as the round trip
    // takes. No `exists`: nothing has been read yet, and a control that has not looked must not say
    // whether a mode is there. Without a collection there is nothing to ask about, and it says so.
    var seed = field.collectionValue == null ? "" : String(field.collectionValue);
    populateModeControl(wrap, seed && value ? [value] : [], value, { collection: seed });
    return wrap;
  }

  /**
   * The note, recomputed from what the control is showing — the half of it that a *click* can change.
   *
   * `populateModeControl` writes the note when an answer arrives, which covers a config that arrived
   * naming a mode. It does not cover somebody choosing "New mode" a moment later, because nothing
   * repopulates on a click: the line saying the mode arrives with the collection appeared only for a
   * pasted config and never for the case it was written for.
   *
   * Only the new-collection line lives here. Choosing "New mode" on a collection that exists needs no
   * note — the input above it already says what is about to happen, and the collection picker learned
   * the same lesson.
   */
  function renderModeNote(wrap) {
    var select = wrap.querySelector(".config-ui-mode-select");
    var note = wrap.querySelector(".config-ui-mode-note");
    if (!select || !note) return;
    var creating = select.value === modeNewSentinel();
    var collection = wrap.getAttribute("data-mode-collection") || "";
    var text = creating && collection && wrap.getAttribute("data-mode-exists") === "false"
      ? "Created with the collection at Run."
      : "";
    note.textContent = text;
    note.style.display = text ? "block" : "none";
  }

  /** The sentinel the select uses for "create a new one". Never a mode name. */
  function modeNewSentinel() {
    return "\u0000codefig-new-mode";
  }

  /** Mode names as Figma compares them: it refuses two modes differing only in case or padding. */
  function sameModeText(a, b) {
    return String(a == null ? "" : a).trim().toLowerCase() ===
      String(b == null ? "" : b).trim().toLowerCase();
  }

  /**
   * Fill the mode picker from one collection's modes.
   *
   * `state` is what the backend answered about that collection, and the cases it separates are the
   * whole of this control:
   *   `{ collection: "" }`            — no collection chosen. Nothing to ask, nothing to offer.
   *   `{ collection: n }`             — asked, not yet answered. The configured mode is shown and
   *                                     nothing is claimed about it: before the answer, a name that
   *                                     is not in the list is not evidence that it is not there.
   *   `{ collection: n, exists: false }` — a collection about to be created. Only *New mode* is true,
   *                                     and a name typed here names the mode it is created with.
   *   `{ collection: n, exists: true }`  — its modes, plus *New mode*.
   *
   * Carrying an `exists` at all is what marks an answer, which is why the two states that have not
   * heard back omit it rather than guessing `false`.
   */
  function populateModeControl(wrap, names, value, state) {
    var select = wrap.querySelector(".config-ui-mode-select");
    var newName = wrap.querySelector(".config-ui-mode-new");
    var note = wrap.querySelector(".config-ui-mode-note");
    if (!select) return;

    var st = state || {};
    var collection = st.collection == null ? "" : String(st.collection);
    var answered = Object.prototype.hasOwnProperty.call(st, "exists");
    var exists = !!st.exists;
    // Recorded on the wrap, because a later click has to be able to tell "this collection is about to
    // be created" from "it is there" without a second round trip.
    //
    // **Only this one.** `data-mode-collection` is the other half of the pair and is written by
    // `refreshModePickers` alone, where it means *asked* — writing it here too would have made every
    // first render look like a request already in flight, and the modes would never have been
    // fetched at all.
    wrap.setAttribute("data-mode-exists", answered ? (exists ? "true" : "false") : "");
    var list = Array.isArray(names) ? names.filter(Boolean) : [];
    var inList = list.some(function (n) { return sameModeText(n, value); });
    // Read before the options are thrown away, for the reason the collection picker reads it: an
    // answer arriving while somebody is halfway through typing a name must not undo their choice.
    var chosenNew = select.value === modeNewSentinel();

    select.innerHTML = "";
    var placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = collection
      ? "Select mode or create a new one"
      : "Pick a collection first";
    placeholder.disabled = true;
    placeholder.hidden = !!collection;
    select.appendChild(placeholder);
    select.disabled = !collection;

    list.forEach(function (name) {
      var o = document.createElement("option");
      o.value = name;
      o.textContent = name;
      select.appendChild(o);
    });

    if (collection) {
      if (list.length > 0) {
        var rule = document.createElement("option");
        rule.disabled = true;
        rule.textContent = "──────────";
        select.appendChild(rule);
      }
      var create = document.createElement("option");
      create.value = modeNewSentinel();
      create.textContent = "New mode";
      select.appendChild(create);
    }

    var creating = !!collection && (chosenNew || (!!value && !inList));
    select.value = creating ? modeNewSentinel() : inList ? matchedName(list, value) : "";
    if (newName) {
      newName.style.display = creating ? "block" : "none";
      newName.value = creating ? value : "";
    }
    if (note) {
      var text = "";
      if (!answered) {
        text = "";
      } else if (creating && collection && !exists) {
        // The new-collection case the whole row exists for: there is nothing to list because the
        // collection itself is not there yet, and this name is what its first mode will be called.
        text = "Created with the collection at Run.";
      } else if (creating && exists && value && !chosenNew) {
        text = '"' + value + '" isn\'t a mode of ' + collection + " — it will be created.";
      }
      note.textContent = text;
      note.style.display = text ? "block" : "none";
    }

  }

  /** The option that answers to this value, so a differently-cased config still selects it. */
  function matchedName(list, value) {
    for (var i = 0; i < list.length; i++) {
      if (sameModeText(list[i], value)) return list[i];
    }
    return "";
  }

  /**
   * Put the picker back to "Select mode or create a new one".
   *
   * Called when the collection underneath it changes, because every part of what it was showing
   * belonged to the collection that is no longer selected. Leaving the name behind was worse than
   * stale: a mode chosen in one collection reappeared as a *new mode about to be created* in the
   * next, so switching collection quietly queued up a mode nobody asked for.
   *
   * The stored value goes too — it is what a redraw falls back to, and a reset it can undo is not a
   * reset.
   */
  function resetModeControl(wrap) {
    var select = wrap.querySelector(".config-ui-mode-select");
    var newName = wrap.querySelector(".config-ui-mode-new");
    var note = wrap.querySelector(".config-ui-mode-note");
    wrap.setAttribute("data-initial-value", "");
    if (select) select.value = "";
    if (newName) {
      newName.value = "";
      newName.style.display = "none";
    }
    if (note) {
      note.textContent = "";
      note.style.display = "none";
    }
  }

  /** What the picker holds: the typed name when creating, the chosen one otherwise. */
  function readModeControl(wrap) {
    var select = wrap.querySelector(".config-ui-mode-select");
    var newName = wrap.querySelector(".config-ui-mode-new");
    if (!select) return "";
    if (select.value === modeNewSentinel()) return newName ? newName.value : "";
    return select.value;
  }

  /**
   * The value to redraw a mode picker with: what it is showing, or — while it is showing nothing,
   * which is every moment before the first answer arrives — what the config gave it.
   *
   * Without the fallback, the list landing a beat after render would repopulate the control with the
   * empty select it is still displaying and lose the configured mode name.
   */
  function currentModeValue(wrap) {
    return readModeControl(wrap) || wrap.getAttribute("data-initial-value") || "";
  }

  /**
   * The collection picker a mode picker follows: the one it names, or — written bare — the form's
   * only one. With several and no name, it follows none, which is the state the placeholder
   * describes rather than a guess between two targets.
   */
  function collectionWrapForMode(container, wrap) {
    var named = wrap.getAttribute("data-mode-collection-field");
    if (named) return container.querySelector('[data-collection-field="' + named + '"]');
    var all = container.querySelectorAll("[data-collection-field]");
    return all.length === 1 ? all[0] : null;
  }

  /** What the picker holds: the typed name when creating, the chosen one otherwise. */
  function readCollectionControl(wrap) {
    var select = wrap.querySelector(".config-ui-collection-select");
    var newName = wrap.querySelector(".config-ui-collection-new");
    if (!select) return "";
    if (select.value === collectionNewSentinel()) return newName ? newName.value : "";
    return select.value;
  }

  /**
   * One repeatable-group control, in one of two renderings.
   *
   * Stacked by default; `@tabs` gives one tab per row, named from its `name` column. That is a
   * **display choice on one control**, not a second control type — same values, same serialization,
   * so a rendering cannot drift from the data the way a parallel control would.
   *
   * Cells carry `data-row-field` rather than `data-field`, so the flat collector never sees them:
   * a cell called `min` must not become a top-level `min`. `collectRows` reads them back.
   */
  // ==========================================================================
  // THE CURVE EDITOR
  //
  // A curve is a flat array of numbers and this control is the only thing that draws it. Four numbers is
  // one cubic segment, ten is two with a middle anchor, and `[]` is no curve — the three states `@Bezier`
  // defines, with nothing added here.
  //
  // **The coordinates are the value; everything on screen is a reading of them.** The preset dropdown does
  // not remember what was picked, the caption does not remember whether you dragged, and there is no
  // "custom" flag anywhere: `curveLabelFor` looks the current numbers up in the preset table on every
  // redraw and says what it finds. Pick *Sine · easeInOut*, nudge a handle, and the dropdown reads *Custom*
  // because the curve is no longer that curve — not because something recorded the nudge.
  // ==========================================================================

  /** The plugin's own copy of `@Bezier`, published by `ui.html`. */
  function curveLib() {
    return typeof window !== "undefined" && window.CodeFigBezier ? window.CodeFigBezier : null;
  }

  /**
   * What a curve control writes back to the config — which is simply what it holds.
   *
   * There used to be a fold here turning the straight curve back into `[]`, because the control wrote the
   * substituted straight line into its own value on load and every unrelated edit then persisted six
   * decimals nobody chose. The substitution happens at *draw* time now, so an untouched control still holds
   * `[]` and there is nothing to undo — and `Linear` and `Custom` can be told apart, which a fold would
   * have made impossible.
   */
  function curveCollected(raw, overshoot) {
    return curveValueOf(raw, overshoot);
  }

  /**
   * Numbers in, always: a stored string, a stored array, or nothing at all.
   *
   * **`overshoot` has to be passed in here, not read off `raw`.** `raw` is `data-curve-value`'s own
   * text — a fresh `JSON.stringify` of the control's points — and `JSON.stringify`/`JSON.parse` carry
   * none of an array's own properties, `.overshoot` included. Every caller inside a curve control's own
   * closure has a *field*-scoped `curveValueOf` that already threads `field.overshoot` through
   * (`buildCurveControl`); this module-level one is what `getValues()`/`collectRows()` use to read a
   * curve's value back out for the config block and the preview — outside any one control's closure,
   * so it never had `field.overshoot` to read until a caller hands it one. Omitted, it defaults to
   * `false`, and every Y coordinate an overshoot channel is holding gets silently clamped back into
   * [0,1] — confirmed live: a curve that dragged, drew, and evaluated correctly wrote flattened control
   * points into both the preview and the eventual config text, which read as "the chart doesn't
   * reflect the curve" for a reason that had nothing to do with `oklchRamp`'s own math.
   */
  function curveValueOf(raw, overshoot) {
    var B = curveLib();
    if (!B) return Array.isArray(raw) ? raw.slice() : [];
    if (typeof raw === "string") return B.bezierParse(raw, overshoot) || [];
    return B.bezierNormalise(raw, overshoot);
  }

  var CURVE_PRESET_FAMILIES = [
    ["linear", "Linear"], ["sine", "Sine"], ["quad", "Quad"], ["cubic", "Cubic"],
    ["quart", "Quart"], ["quint", "Quint"], ["circ", "Circ"],
    ["exponential", "Exponential"], ["goldenRatio", "Golden ratio"]
  ];
  var CURVE_PRESET_EASES = [["in", "easeIn"], ["out", "easeOut"], ["inout", "easeInOut"], ["outin", "easeOutIn"]];

  /**
   * What to call the curve currently held — re-derived, never stored.
   *
   * `original` for the empty array, a preset's name when the numbers are exactly one, `custom` otherwise.
   */
  /**
   * **The curve recognition fitted to what the file already holds**, per curve field, or `null`.
   *
   * Published by the host rather than derived here, and that split is the point: the estimate is a pure
   * function of the collection's own colours, which the *host* holds (they ride the auto-import payload) and
   * the renderer never sees. So this is not a stored answer to a question the form could ask — it is data
   * the form does not have.
   *
   * Keyed by the field's name, and for a `@rows` cell by `field[index].cell`, because HSL fits one curve
   * per mode and they are all called `curve`.
   */
  var curveBaselines = {};
  function setCurveBaselines(map) {
    curveBaselines = map || {};
  }

  /**
   * How far in and out the zoom goes, as a multiple of the view a channel opens on. Logarithmic between the
   * two, so dragging the marker feels the same at either end of its travel.
   */
  var CURVE_ZOOM_MIN = 1, CURVE_ZOOM_MAX = 200;

  /**
   * **The tokens' own colours**, per curve field — the same seam as `curveBaselines`, and for the same
   * reason: the renderer knows the numbers, only the host knows what colour they are.
   *
   * A list of hex strings in step order, nothing more. The bar could have been a synthetic sweep computed
   * from a value, but that needs the colour maths — and a second copy of `@oklch.js` in the UI is the one
   * thing this repo has a standing rule against. It also needs the hue and the saturation beside the
   * lightness to mean anything, which is three fields in two rows away from here.
   *
   * The tokens answer both objections. They are the colours the collection actually has, the host holds
   * them already (`fileColorValues`), and placing each at the value its own curve puts it at makes the bar
   * a picture of *this* ramp rather than of the channel in the abstract.
   */
  var curveRamps = {};
  function setCurveRamps(map) {
    curveRamps = map || {};
  }
  /**
   * → `{ hexes, seed }` for a curve, or `null`.
   *
   * `seed` is the index of the step the seed colour sits on, or `-1`. It rides along with the colours
   * because it is the same question — *what does this collection actually contain* — and the host is the
   * only place that can answer either.
   */
  function curveRampOf(key) {
    var held = key ? curveRamps[key] : null;
    if (Array.isArray(held)) return held.length > 1 ? { hexes: held, seed: -1 } : null;
    if (held && Array.isArray(held.hexes) && held.hexes.length > 1) {
      return { hexes: held.hexes, seed: typeof held.seed === "number" ? held.seed : -1 };
    }
    return null;
  }
  function curveBaselineFor(key) {
    var held = key ? curveBaselines[key] : null;
    return held && held.length ? held : null;
  }
  /** Two curves are the same curve when their stored coordinates are. Six decimals, as written. */
  function sameCurve(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 5e-6) return false;
    return true;
  }

  function curveLabelFor(points) {
    var B = curveLib();
    if (!points || !points.length) return "original";
    if (!B) return "custom";
    var found = B.bezierEaseName(points);
    if (!found) return "custom";
    if (found.type === "linear") return "linear|none";
    return found.type + "|" + found.ease;
  }

  function buildCurvePresetSelect(allowOriginal, estimated, awaitable) {
    var sel = document.createElement("select");
    sel.className = "config-ui-curve__preset";
    function add(value, text, into) {
      var o = document.createElement("option");
      o.value = value;
      o.textContent = text;
      (into || sel).appendChild(o);
    }
    if (allowOriginal) add("original", "Original");
    // **`estimated` (a fit already in hand) is unaffected and still offers the option — applying it
    // is a plain assignment (`setPoints(estimate.slice())`), no request, nothing to hang.**
    //
    // **`awaitable` — asking for a fit that does not exist yet — is parked, not removed.** That
    // selection is itself the request (`requestEstimate`, below), and the request does not reliably
    // answer (`DEFERRED.md`, "The on-demand fit hangs, not always, and not fully explained": the
    // identical computation finishes in ~1.2s through the job queue and has not landed once through
    // this live dispatch path across many attempts). A control that never answers is worse than one
    // that is not there. `awaitable` still arrives here and still means what it always did, so
    // restoring this is a one-line revert once the dispatch bug is found — `requestQuickFit`, the
    // tags, and the watchdog all stay, and stay exercised directly in tests via `preset.value =
    // 'estimated'` rather than through an option nobody can click.
    var ESTIMATE_REQUEST_PARKED = true;
    if (estimated || (awaitable && !ESTIMATE_REQUEST_PARKED)) add("estimated", "Estimated original");
    // **Hidden until it is true, not a choice that undoes itself.** Picking *Custom* on an untouched
    // preset changed nothing about the points, so `setPoints`'s own label — derived from the
    // coordinates, the same rule that lets an edit fall back to *Custom* on its own — snapped straight
    // back to whatever preset those points already matched. That read as the dropdown reverting the
    // instant you picked the option. `hidden`, not absent: the option still exists for `setPoints` to
    // select once a drag genuinely makes the curve custom, the same technique the collection and mode
    // pickers use for their own "New…" placeholder.
    add("custom", "Custom");
    add("linear|none", "Linear");
    for (var f = 1; f < CURVE_PRESET_FAMILIES.length; f++) {
      var group = document.createElement("optgroup");
      // `setAttribute`, not the `.label` property: a browser reflects one onto the other, and the shim the
      // style reference renders through does not — so the generated page lost every group heading.
      group.setAttribute("label", CURVE_PRESET_FAMILIES[f][1]);
      for (var e = 0; e < CURVE_PRESET_EASES.length; e++) {
        add(
          CURVE_PRESET_FAMILIES[f][0] + "|" + CURVE_PRESET_EASES[e][0],
          CURVE_PRESET_FAMILIES[f][1] + " · " + CURVE_PRESET_EASES[e][1],
          group
        );
      }
      sel.appendChild(group);
    }
    return sel;
  }

  function curveSvgEl(name, attrs) {
    var el = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k)) el.setAttribute(k, String(attrs[k]));
    }
    return el;
  }

  /**
   * **Growth mode: the plot's y axis is a logarithm, so a constant ratio is a straight line.**
   *
   * Spacing, radius and typography do not know their largest value. They know a base and roughly how fast
   * the scale should grow — which is what a modular ratio always was. Pinning a top instead means adding a
   * token re-subdivides the range and moves every value below it, and those values are already bound to
   * things in people's files.
   *
   * So the scale is `base × ratio ^ ((n-1) × curve(t))`, and on a log axis that plots as:
   *
   *     y(t) = curve(t) × log(ratio) / log(GROWTH_MAX)
   *
   * — the bezier shape, scaled vertically by how fast the scale grows. Which is why nothing about the curve
   * maths changes: `bezierAt` still answers over the unit square, and growth is one multiplier on top. The
   * two are separable, and folding them together is the mistake the first version made by treating the
   * endpoint as part of the curve.
   *
   * `GROWTH_MAX` is the top of the drag, not a limit on the config: it only decides how far up the canvas a
   * given ratio sits. 2.5 puts every named ratio — 1.067 through φ — in the lower two thirds with room to
   * pull past them, and a typed number outside it is honoured and pinned to the edge.
   */
  var CURVE_GROWTH_MAX = 2.5;
  var CURVE_GROWTH_MIN = 1.001;
  // What a mode that has never had a growth opens on. A perfect fifth: recognisable, and squarely in the
  // middle of what spacing sets actually use.
  var CURVE_GROWTH_DEFAULT = 1.5;

  function curveGrowthClamp(ratio) {
    if (typeof ratio !== "number" || !isFinite(ratio)) return null;
    if (ratio < CURVE_GROWTH_MIN) return CURVE_GROWTH_MIN;
    return ratio;
  }

  /** Where a ratio sits on the canvas, 0 at the bottom and 1 at `CURVE_GROWTH_MAX`. */
  function curveGrowthHeight(ratio) {
    var r = curveGrowthClamp(ratio);
    if (r === null) return 0;
    var h = Math.log(r) / Math.log(CURVE_GROWTH_MAX);
    return h < 0 ? 0 : h > 1 ? 1 : h;
  }

  /** The inverse: a height back to a ratio, rounded the way a config should read. */
  function curveGrowthRatio(height) {
    var h = height < 0 ? 0 : height > 1 ? 1 : height;
    return Math.round(Math.pow(CURVE_GROWTH_MAX, h) * 1000) / 1000;
  }

  /**
   * The editor.
   *
   * Drawn in a 0-100 viewBox with **y flipped** — the curve's y goes up and SVG's goes down — so every
   * conversion runs through `toView`/`fromView` rather than being written out at each use. Getting one of
   * those backwards draws a curve that is right until you drag it.
   */
  var CURVE_CLIP_SEQ = 0;

  function buildCurveControl(field, value, growthSeed, baselineKey) {
    var B = curveLib();
    var allowOriginal = !!field.allowOriginal;
    var allowOvershoot = !!field.overshoot;
    /**
     * **Shadows the module-level `curveValueOf` for the rest of this control, on purpose.** Every read of
     * `data-curve-value` inside this function — draw, drag, the axis, the range strip, arrow keys, the
     * text field — goes through this same name, so there is exactly one place that has to know this
     * field's own `overshoot` setting rather than fifteen call sites that each have to remember to pass
     * it. `setPoints` re-normalises through this shadow on every write too, which is what makes the drag
     * mechanics safe even where an intermediate `.slice()` elsewhere in this file drops the array's own
     * `overshoot` marker — the field-level flag here is the one that is never lost.
     */
    function curveValueOf(raw) {
      if (!B) return Array.isArray(raw) ? raw.slice() : [];
      if (typeof raw === "string") return B.bezierParse(raw, allowOvershoot) || [];
      return B.bezierNormalise(raw, allowOvershoot);
    }
    // The sibling cell holding the growth ratio, named by `curve(growth:<key>)`. Looked up **lazily**, at
    // draw time: the control is built before it is in the document, and the ratio is edited from two places
    // — the handle here and the number field beside it — so reading it fresh each render is what keeps the
    // two from disagreeing. Ask the question; do not store the answer.
    var growthKey = typeof field.growth === "string" && field.growth ? field.growth : null;
    var wrap = document.createElement("div");
    wrap.className = "config-ui-curve" + (growthKey ? " config-ui-curve--growth" : "");
    // Plan 29: curves inside `@rows` had no `data-type`, so `[data-section="hue"] [data-type="curve"]`
    // could not reach them. Key is the column/field name when present (`curve`, `hue`, …).
    wrap.setAttribute("data-type", "curve");
    var curveKey = field && (field.name || field.key);
    if (curveKey) wrap.setAttribute("data-key", String(curveKey));
    var points = curveValueOf(value);

    /**
     * **One control, two config keys, no second field.**
     *
     * The growth used to live in a sibling number cell that this control typed into. It does not need to:
     * a growth field and a curve field are two inputs for one idea, and the coordinate field below the plot
     * already has to carry both anyway — otherwise copying it does not reproduce the scale, which is the
     * whole point of having it. So the growth is held here, on the wrapper, and `readRowCellInto` writes it
     * out under its own name so the config block still reads `ratio: 1.5` beside `curve: []`.
     */
    function growthRatio() {
      if (!growthKey) return null;
      var raw = parseFloat(wrap.getAttribute("data-curve-growth-value"), 10);
      return curveGrowthClamp(raw);
    }
    function setGrowthRatio(ratio) {
      if (!growthKey) return;
      wrap.setAttribute("data-curve-growth-value", String(ratio));
    }
    if (growthKey) {
      var seeded = curveGrowthClamp(parseFloat(growthSeed, 10));
      wrap.setAttribute("data-curve-growth-value", String(seeded === null ? CURVE_GROWTH_DEFAULT : seeded));
    }

    /**
     * **An empty curve means two different things, and `@allowOriginal` is which.** For Colors it is
     * *Original* — leave the steps this file already has, generate nothing. For a scale there is no such
     * fallback: `bezierAt([], t)` is `t`, so an empty curve *is* the straight ramp.
     *
     * So a scale draws `[]` as the straight line — **at draw time only**. The stored value stays empty
     * until somebody chooses a shape, which is what keeps an unrelated edit from writing six decimals
     * nobody asked for, and what lets *Linear* and *Custom* be two different states of the same straight
     * line: `[]` is "no shape", coordinates are "a shape that happens to be straight, with handles".
     */
    function effectivePoints(pts) {
      if (pts.length || allowOriginal || !B) return pts;
      return B.bezierFromEase("linear", "none", 1);
    }

    var head = document.createElement("div");
    head.className = "config-ui-curve__head";
    // **The dropdown is the shape control.** There was an *Add shape* button beside it doing the same job
    // from the other end, and two controls for one state is one too many — *Linear* already means "no
    // shape", so selecting it hides the handles and selecting anything else reveals them. Nothing has to
    // remember whether you clicked, because the curve says.
    var estimate = curveBaselineFor(baselineKey);
    // A per-mode cell's baseline key is `modes[<index>].<column key>` (`buildRowCell`'s caller, above) —
    // the shape nothing else produces, since a top-level field's own key never has a `[N].` in it. That is
    // what tells this control apart from Colors' own collection-scope curve, or a Spacing/Typography scale
    // curve, neither of which has a mode to fit.
    var isPerModeCurve = typeof baselineKey === "string" && /\[\d+\]\./.test(baselineKey);
    var preset = buildCurvePresetSelect(allowOriginal, estimate, isPerModeCurve);
    head.appendChild(preset);
    var toggle = document.createElement("button");
    toggle.type = "button";
    // **Same secondary chrome as the footer buttons** (`.btn.secondary`): stroke darkens on hover,
    // background does not. The curve used to paint `--hover-bg` instead and read as a different control.
    toggle.className = "btn secondary config-ui-curve__toggle";
    // Order: type → coordinates → add/remove middle (was type → middle → coordinates).
    // Toggle is appended after the text field below so DOM order matches.
    wrap.appendChild(head);

    // **No padding in the viewBox.** The plot fills the control, so its edges line up with the preset row
    // above and the coordinate field below — inset by a tenth, the grey box floated 27px narrower than
    // everything around it and read as misaligned. Handles at the corners hang outside instead, which is
    // what `overflow: visible` on the canvas is for and what every other cubic-bezier editor looks like.
    /**
     * **The plot is measured, not a unit square stretched to fit it.**
     *
     * A `100 x 100` viewBox with `preserveAspectRatio: none` is the obvious thing, and it is wrong the
     * moment the chart is not square: at four-to-one every handle draws as an ellipse and every glyph the
     * wrong shape. Measuring means one unit is one pixel, so a 5px grip is 5px and the geometry below reads
     * in the units it is written in.
     *
     * `SIZE` stays as the fallback for the first draw, which happens before the wrapper is in the tree and
     * therefore before it has a size.
     */
    var SIZE = 100;
    var W = SIZE, H = SIZE;
    function measurePlot() {
      var box = typeof svg.getBoundingClientRect === "function" ? svg.getBoundingClientRect() : null;
      if (box && box.width > 1 && box.height > 1) { W = box.width; H = box.height; }
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    }
    // One id per control, because a document holds several curves and a clip path is addressed by id.
    CURVE_CLIP_SEQ += 1;
    var clipId = "config-ui-curve-clip-" + CURVE_CLIP_SEQ;
    // The canvas sits in a positioned box so the empty-state caption can be **HTML over the top** rather
    // than `<text>` inside. SVG text scales with the viewBox — 9 units in a 120-unit box drawn 320px wide
    // is 24px on screen — so a size set in the stylesheet was not the size that appeared. Nothing else in
    // this control has a font, which is why it was the only part that looked wrong.
    var plot = document.createElement("div");
    plot.className = "config-ui-curve__plot-wrap";
    var svg = curveSvgEl("svg", {
      "class": "config-ui-curve__canvas",
      viewBox: "0 0 " + SIZE + " " + SIZE,
      preserveAspectRatio: "none"
    });
    plot.appendChild(svg);
    var emptyNote = document.createElement("div");
    emptyNote.className = "config-ui-curve__empty-note";
    emptyNote.textContent = "Original";
    plot.appendChild(emptyNote);
    /**
     * **The tick labels are HTML over the plot, not `<text>` inside it.**
     *
     * The canvas is a 100-unit viewBox with `preserveAspectRatio: none`, so it stretches by a different
     * factor in each direction — 2.9x across and 3.2x down at the width the panel happens to be. SVG text
     * stretches with it, which means both that the size in the stylesheet is not the size on screen and
     * that the glyphs are subtly the wrong shape. The empty-state caption is HTML for exactly this reason;
     * so is this.
     */
    var tickLayer = document.createElement("div");
    tickLayer.className = "config-ui-curve__ticks";
    plot.appendChild(tickLayer);

    /**
     * **The zoom, and the channel's own colours, as two columns beside the plot.**
     *
     * They were one strip with the buttons sitting on the gradient, which said they were one control — and
     * the version before that derived the window from the two ends, so touching the curve moved the zoom.
     * They are three separate facts and they are now three separate things: the ends belong to the palette,
     * the window belongs to the view, and the gradient is a picture of neither.
     *
     * The gradient takes no input at all. `setCurveRamps` supplies its stops, because what colour a value
     * *is* depends on the other two channels and only the host knows those.
     */
    var zoomMark = null;
    var zoomTrack = null;
    var rangeFill = null;
    var zoomCol = null;
    var rangeCol = null;
    if (field.ends) {
      var line = document.createElement("div");
      line.className = "config-ui-curve__chartline";
      wrap.appendChild(line);
      line.appendChild(plot);

      zoomCol = document.createElement("div");
      zoomCol.className = "config-ui-curve__zoom";
      var zoomIn = curveZoomButton("in", "+", "Zoom in");
      zoomTrack = document.createElement("div");
      zoomTrack.className = "config-ui-curve__zoom-track";
      var zoomLine = document.createElement("i");
      zoomLine.className = "config-ui-curve__zoom-line";
      zoomMark = document.createElement("div");
      zoomMark.className = "config-ui-curve__zoom-mark";
      zoomMark.setAttribute("role", "slider");
      zoomMark.setAttribute("tabindex", "0");
      zoomMark.setAttribute("aria-label", "Zoom");
      zoomTrack.appendChild(zoomLine);
      zoomTrack.appendChild(zoomMark);
      zoomCol.appendChild(zoomIn);
      zoomCol.appendChild(zoomTrack);
      zoomCol.appendChild(curveZoomButton("out", "\u2212", "Zoom out"));
      line.appendChild(zoomCol);

      rangeCol = document.createElement("div");
      rangeCol.className = "config-ui-curve__range";
      rangeFill = document.createElement("div");
      rangeFill.className = "config-ui-curve__range-fill";
      rangeCol.appendChild(rangeFill);
      line.appendChild(rangeCol);
    } else {
      wrap.appendChild(plot);
    }

    function curveZoomButton(which, glyph, label) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "config-ui-curve__zoom-step";
      b.setAttribute("data-curve-zoom", which);
      b.setAttribute("title", label);
      b.setAttribute("aria-label", label);
      b.textContent = glyph;
      return b;
    }

    /**
     * **The three anchor boxes, under the chart, left / centre / right.**
     *
     * The two ends are *adopted*, not rebuilt. They are ordinary cells the row already declares, so they
     * already carry a caption, a key, and a place in `collectRows`; building a second pair here would be
     * two controls for one value, which is the mistake this panel has already made twice. So the control
     * moves the cells it is bound to into position. Moving them inside the row is invisible to the
     * collector, which finds cells with `querySelector` and does not care where they sit.
     *
     * The middle box is the control's own, because there is no field behind it. It **is** the curve's
     * middle handle, read in the channel's units: type in it and the handle moves, drag the handle and it
     * follows. One fact, two ways to reach it — which is the answer Márton gave when asked whether the
     * middle should come back as a value of its own.
     */
    var anchorRow = null;
    var middleBox = null;
    if (field.ends) {
      anchorRow = document.createElement("div");
      anchorRow.className = "config-ui-curve__anchors";
    }
    // **A middle box of our own only when the channel has no middle of its own.** With `ends:a..m..b` the
    // middle is a real anchor the engine reads, so it is adopted like the two ends and this control has no
    // business inventing a second view of it.
    if (field.ends && !field.ends.mid) {
      var middleCell = document.createElement("label");
      middleCell.className = "config-ui-curve__anchor config-ui-curve__anchor--middle";
      /**
       * **The actual stacker is an inner wrapper, kept off the outer cell on purpose.**
       *
       * The adopted anchors either side of this one nest three levels deep: an outer cell (its own
       * caption hidden by `.config-ui-curve__anchors > .config-ui-rows-cell > .config-ui-rows-cell-label`),
       * a `.config-ui-rows-group` for the pair of alternate-model fields one position can hold, and a
       * `.config-ui-rows-group-part` *inside that* — the thing whose `flex-direction: column` is what
       * stacks a caption over its input. Confirmed live, in a browser, by diffing the two DOM trees:
       * the adopted middle's part carries `.config-ui-rows-group-part` alone, never `.config-ui-curve__anchor`.
       * Putting both classes on the same element — what this used to do — loses the column layout to
       * `.config-ui-curve__anchors .config-ui-curve__anchor { display: block }`, which is two classes
       * against `.config-ui-rows-group-part`'s one and wins by specificity regardless of source order.
       * So `.config-ui-curve__anchor`/`--middle` (grid position, the `data-shown` dimming) stay on the
       * outer label, and the flex column that actually stacks caption over input lives one level in,
       * on an element that class never reaches.
       */
      var middlePart = document.createElement("span");
      middlePart.className = "config-ui-rows-group-part";
      var middleCap = document.createElement("span");
      // **The same caption class the adopted cells use.** Its two neighbours are group *parts*, whose
      // captions are `config-ui-rows-group-label` at 10px; this one was a cell label at 12px, so Middle
      // read as a heading beside two labels — and the extra two points made the Lightness tab nine pixels
      // taller than Hue and Saturation, so the whole block jumped when you switched.
      middleCap.className = "config-ui-rows-group-label";
      middleCap.textContent = "Middle";
      middleBox = document.createElement("input");
      middleBox.type = "text";
      middleBox.className = "config-ui-input config-ui-input--number";
      middleBox.setAttribute("data-curve-middle", "true");
      middlePart.appendChild(middleCap);
      middlePart.appendChild(middleBox);
      middleCell.appendChild(middlePart);
      anchorRow.appendChild(middleCell);
    }
    if (anchorRow) wrap.appendChild(anchorRow);

    var text = document.createElement("input");
    text.type = "text";
    text.className = "config-ui-curve__text";
    text.setAttribute("spellcheck", "false");
    text.setAttribute("placeholder", "cubic-bezier(0.37, 0, 0.63, 1)");
    // **On the preset row, not under the chart.** Order: type → coordinates → add/remove middle.
    // Charted curves only: a scale editor is a narrow column where three controls on one line do not fit.
    if (field.ends) head.appendChild(text); else wrap.appendChild(text);
    head.appendChild(toggle);

    /**
     * **The axis, or nothing.** `@ends: a..b` names the two fields the curve runs between, and having them
     * is what turns the y axis from a unit square into the quantity itself — 98% at the top of the plot and
     * 19% at the bottom, because that is what the palette actually does.
     *
     * **Read live, every draw.** The two ends are ordinary number fields somebody types into, and they are
     * also what the two square handles drag. A copy taken at build time would be the value they held before
     * either of those happened. Ask the question.
     *
     * → `{ from, to, lo, hi }`, or `null` for a plain shape editor. `from` may be above `to`; a lightness
     * ladder runs downhill and the chart should say so rather than flipping it to look tidy.
     */
    function axis() {
      if (!field.ends) return null;
      var from = endValue("from"), to = endValue("to");
      /**
       * **Equal ends are a channel, not an absence of one.** This used to bail when they matched, which
       * killed the axis outright — no ticks, no zoom, no colour bar, no draggable ends. Lime's saturation
       * is `100 … 83 … 100`: both ends pinned and all the movement in the middle, which is a perfectly
       * ordinary shape and made the whole Saturation tab look unimplemented.
       */
      if (from === null || to === null) return null;
      var limit = field.range || { lo: Math.min(from, to), hi: Math.max(from, to) };
      return { from: from, to: to, lo: limit.lo, hi: limit.hi };
    }

    /**
     * Pull the two end cells under the chart, once, and keep them in order: bright, middle, dark.
     *
     * Idempotent by construction — a cell already in the anchor row is left alone — because this runs on
     * every draw, and the alternative is a flag recording whether it has happened: a stored answer to a
     * question the DOM can be asked.
     */
    function adoptEnds() {
      if (!anchorRow) return;
      /**
       * **A control that is not on screen does not take the cells.**
       *
       * Colours declare two curves per channel — one for OKLCH, one for HSL — and `@showWhen` hides
       * whichever model is not selected. Both are bound to the *same* group cell, because a group holds
       * both parts: `bright:{chroma … |saturation …}` is one cell whether you are reading the chroma out of
       * it or the saturation. So `closest(".config-ui-rows-cell")` hands the two curves the same element,
       * and whichever draws last keeps it.
       *
       * That is usually the visible one, and then it works — which is why this only *tended* to happen.
       * Releasing a drag is the case that loses: `refreshCurveControls` redraws every curve **except the
       * one being edited**, so the only control that redraws is the hidden twin, and it walks off with the
       * anchor boxes. The fields were there while dragging and gone on release, exactly as reported.
       */
      // Asked of the **plot**, not the wrapper: a charted curve's wrapper is `display: contents`, which
      // generates no box at all, so asking it whether it is on screen answers "no" for every one of them.
      if (typeof plot.getClientRects === "function" && !plot.getClientRects().length) return;
      // **The captioned box, not the input.** In a `@rows` row that is the cell; at field scope an end is a
      // part of a `@group:`, and `.config-ui-rows-group-part` is the box holding its caption. Adopting the
      // bare input instead left OKLCH's two ends as unlabelled number boxes beside a captioned Middle.
      var from = endCell("from"), to = endCell("to");
      var fromCell = adoptable(from), toCell = adoptable(to);
      // The middle, when the channel has a real one, sits between them and is adopted the same way.
      // **Disabled when the curve has no middle point**, because then the engine does not consult it: a
      // one-segment curve runs end to end. An editable box holding a number nothing reads is how the bump
      // at the middle went unexplained — the value was still there and still looked authoritative.
      if (field.ends.mid) {
        var midEl = endCell("mid");
        var midCell = adoptable(midEl);
        if (midCell && !anchorRow.contains(midCell)) {
          placeAdoptedAnchor(midCell, "config-ui-curve__anchor config-ui-curve__anchor--middle");
        }
        /**
         * **Typing a middle moves the anchor**, which has to be wired here rather than at build time.
         *
         * With a real middle the field *is* the colour at the corner, and the curve's own `pts[5]` is
         * only pacing — so the return leg is by hand (reopen the window, redraw; leave the shape alone).
         * `endCell` answers `null` until the control is in the tree, so wiring it where the control is
         * *built* attaches nothing at all; this runs on every draw, and the marker keeps it to one listener.
         */
        bindEndInput(midEl, "mid", function (typed) {
          var pts = curveValueOf(wrap.getAttribute("data-curve-value")).slice();
          if (pts.length !== 10) return;
          ensureMidInView(typed);
          if (typeof window !== "undefined" && window.codefigProbe) {
            window.codefigProbe("curve:midInput", {
              field: (field && field.name) || wrap.getAttribute("data-row-field") || null,
              typed: typed, want: null, axis: axis(), applied: "field-only"
            });
          }
          draw();
        });
      }
      if (fromCell && !anchorRow.contains(fromCell)) {
        placeAdoptedAnchor(fromCell, "config-ui-curve__anchor", true);
      }
      if (toCell && !anchorRow.contains(toCell)) {
        placeAdoptedAnchor(toCell, "config-ui-curve__anchor config-ui-curve__anchor--end");
      }
      /**
       * **Typing a start/end moves the grip too.** `axis()` already reads the fields on every draw —
       * the missing piece was *calling* draw. After adoption the inputs live *inside* this wrap, and
       * `refreshCurveControls(…, except)` skips the wrap that contains the typed field (so a growth
       * readout is not overwritten mid-keystroke). The middle already had its own listener for that
       * reason; the two ends did not, so the number changed and the chart stayed put.
       */
      bindEndInput(from, "from", function (typed) {
        ensureValueInView(typed);
        draw();
      });
      bindEndInput(to, "to", function (typed) {
        ensureValueInView(typed);
        draw();
      });
    }

    /** One `input` listener per end cell, marked so redraws that re-adopt do not stack another. */
    function bindEndInput(el, which, onTyped) {
      if (!el || !el.addEventListener || el.getAttribute("data-curve-" + which + "-bound")) return;
      el.setAttribute("data-curve-" + which + "-bound", "true");
      el.addEventListener("input", function () {
        if (!axis()) return;
        var typed = parseFloat(String(el.value).replace(/[^\d.\-]/g, ""), 10);
        if (!isFinite(typed)) return;
        onTyped(typed);
      });
    }

    /**
     * The cell holding one end, found by the key `@ends` named. `null` until it is on screen — this control
     * is built before it is in the tree, so the first draw legitimately finds nothing and the redraw after
     * insertion is where the axis appears.
     *
     * Nearest mode block first: a mode's `bright.lightness` is *that mode's*, and there is one per mode. A
     * field-scope curve is in no block, so it climbs to the top of whatever tree it is in — not
     * `ownerDocument`, which the DOM shim the tests and the style reference run against does not have.
     *
     * **`.config-ui-rows-item`, not `[data-row-index]`.** Both mark a repeated thing and the attribute is
     * the more obvious reach, but `buildForm` puts `data-row-index` on *every top-level row of the form* —
     * so scoping by it found the curve's own row, which by construction never holds the field the curve is
     * bound to, and the axis silently never appeared.
     */
    function endCell(which) {
      return cellNamed(field.ends && field.ends[which]);
    }
    /** The captioned box an end lives in — a `@rows` cell, or a `@group:` part at field scope. */
    function adoptable(el) {
      if (!el || typeof el.closest !== "function") return el;
      return el.closest(".config-ui-rows-cell") || el.closest(".config-ui-rows-group-part") || el;
    }
    /**
     * **Put an adopted end under the chart without flattening its caption stack.**
     *
     * A `@rows` cell already nests a `.config-ui-rows-group-part` that owns `flex-direction: column`.
     * Tagging the cell with `.config-ui-curve__anchor` is fine — the part inside still stacks.
     *
     * A field-scope `@group:` part *is* that stacker. Tagging *it* with `.config-ui-curve__anchor`
     * loses the column to `.config-ui-curve__anchors .config-ui-curve__anchor { display: block }`
     * (same specificity trap the control's own Middle box documents). Wrap the part instead, the
     * way Middle already does: outer carries grid position, inner keeps the column.
     */
    function placeAdoptedAnchor(cell, className, asFirst) {
      var node = cell;
      if (!cell.classList.contains("config-ui-rows-cell")) {
        var outer = document.createElement("div");
        outer.className = className;
        outer.appendChild(cell);
        node = outer;
      } else {
        cell.setAttribute("class", cell.getAttribute("class") + " " + className);
      }
      if (asFirst) anchorRow.insertBefore(node, anchorRow.firstChild);
      else anchorRow.appendChild(node);
    }
    function endValue(which) {
      var cell = endCell(which);
      if (!cell) return null;
      var n = parseFloat(cell.value, 10);
      return isFinite(n) ? n : null;
    }

    /**
     * **Does the curve itself have a middle anchor — not just a field that is allowed to hold one?**
     * `field.ends.mid` names a field the schema declares (Hue's "Hue middle" among them) and exists
     * whether or not the curve currently has a third anchor to go with it; a fresh two-anchor curve, or
     * one that had its middle point removed, leaves that field's own last value sitting there, read
     * and unused. Every place below that widens the axis or floors a drag to make room for "the
     * middle" has to ask this first — generation itself only ever consults the field once the curve's
     * own length says there is a real anchor for it to belong to (`hueHasMiddle`/`chromaHasMiddle`,
     * `@OKLCH`), and a window or a drag sensitivity computed as if that anchor existed when it does not
     * shows a value nothing downstream will produce. Confirmed live: a two-anchor Hue curve, no middle
     * point, with "Hue middle" still holding 0° from an earlier edit — the axis widened to include it,
     * a drag that reached the top of that widened window read as 360°, and the generated ramp (which
     * has no idea a middle field exists for a curve this shape) moved by 15°. What was drawn and what
     * was generated were reading two different scales for the same stored number.
     */
    function curveHasRealMiddle() {
      return curveValueOf(wrap.getAttribute("data-curve-value")).length === 10;
    }

    /**
     * **Hue channels walk the short arc**, matching `oklchLerpHue` (`@OKLCH`). Each sample is a
     * wrapped degree in [0, 360). The *polyline* must not connect across the wrap — see the path
     * sampler in `draw()` — or 100° → 290° (short way through 0) draws a vertical spike while the
     * swatch strip stays smooth.
     */
    function axisIsHue() {
      return !!(field.range && Math.abs((field.range.hi - field.range.lo) - 360) < 1e-6);
    }
    function axisHueDelta(from, to) {
      return ((to - from + 540) % 360) - 180;
    }
    function axisLerp(from, to, t) {
      if (!axisIsHue()) return from + (to - from) * t;
      return axisWrapHue(from + axisHueDelta(from, to) * t);
    }
    function axisWrapHue(v) {
      return ((v % 360) + 360) % 360;
    }

    /**
     * **The window on the axis** — what slice of the channel the plot is showing.
     *
     * **Its own state, not derived from the ends.** It used to be computed from them, which meant dragging
     * an end rescaled the axis under your finger — the chart zoomed while you were trying to set a value.
     * The ends and the window are two facts: one is the palette, the other is where you are looking at it
     * from. Opened once on the ends with a tenth of their span for air, and after that only the zoom moves
     * it. It is also the one part of this control that never reaches the config: where you are looking is
     * not a property of the ramp.
     */
    function axisView(a) {
      var held = wrap.getAttribute("data-curve-view");
      if (held) {
        var pair = held.split(",");
        var lo = parseFloat(pair[0], 10), hi = parseFloat(pair[1], 10);
        if (isFinite(lo) && isFinite(hi) && hi > lo && !rampIsOffscreen(a, lo, hi)) {
          return { lo: lo, hi: hi };
        }
      }
      /**
       * **All three anchors, not just the two ends.** A channel whose ends match has its whole shape in the
       * middle, and a window derived from the ends alone is a line with nothing above or below it.
       */
      var seen = [a.from, a.to];
      var mid = curveHasRealMiddle() ? endValue("mid") : null;
      if (mid !== null && isFinite(mid)) seen.push(mid);
      var low = Math.min.apply(null, seen), high = Math.max.apply(null, seen);
      /**
       * **Equal ends, no middle: the full declared channel, not a synthetic ±effectiveGap band.**
       * Generation's lerp between two identical numbers is that number regardless of curve height
       * (`oklchLerp` / `oklchLerpHue`), so inventing a 90–110 window to host a Linear diagonal was a
       * lie — Márton: 100…100 must be a horizontal line at the top of a normal 0…100 chart. Zoom
       * still works once the window is latched from this full-range open.
       */
      var pinned = endsPinned(a);
      var flat = high - low <= 1e-9;
      var air = flat ? (Math.abs(effectiveGap(a)) || 1) : (high - low) * 0.1;
      var opened = pinned
        ? { lo: a.lo, hi: a.hi }
        : flat
          ? { lo: low - air, hi: high + air }
          : { lo: Math.max(a.lo, low - air), hi: Math.min(a.hi, high + air) };
      if (!(opened.hi > opened.lo)) opened = { lo: low - 1, hi: high + 1 };
      // **Latched the first time it is asked for.** Derived every draw, it followed the ends — so dragging
      // one rescaled the axis under your finger. Written down once, it stays where the user left it.
      wrap.setAttribute("data-curve-view", opened.lo + "," + opened.hi);
      return opened;
    }

    /**
     * Is *none* of the ramp inside this window?
     *
     * The one case where a latched window has to be reopened. A drag cannot cause it — `valueFromView`
     * clamps to the window, so an end can never be pushed out of view. A *read* can: recognition refills
     * both ends from the file, and if the new ramp is nowhere near the old window the chart comes up empty
     * with nothing on screen explaining why.
     *
     * Three samples rather than the two ends, because zooming in on the middle legitimately puts both ends
     * outside — and that view must survive.
     *
     * **Equal ends are a separate case.** `unitToValue` maps a curve's 0..1 height onto `a.from..a.to`, and
     * when the two are the same number that map is degenerate — every sample comes back as that one constant
     * *regardless of the curve's real shape*, the exact channel `axisView`'s own comment calls out ("a
     * channel whose ends match has its whole shape in the middle"). Zooming to a window that excludes that
     * constant then reads as the whole ramp being offscreen on every single redraw, and the window keeps
     * getting discarded and reopened wide — which is the "range scale doesn't match the zoom" and "zoom
     * jumps between ranges" reports. Falling back to the same three anchors `axisView` opens the window on
     * (`a.from`, `a.to`, and the middle field when the channel has one) keeps the two in agreement instead
     * of one asking the curve and the other asking the field.
     */
    function rampIsOffscreen(a, lo, hi) {
      var pts = curveValueOf(wrap.getAttribute("data-curve-value"));
      // Equal ends on a flat linear preset: every sample is the pin.
      if (endsPinned(a) && chartFlat(a, pts)) {
        var pin = a.from;
        return pin > hi || pin < lo;
      }
      var at = [0, 0.5, 1].map(function (x) { return valueAlongRamp(a, pts, x); });
      var mid = curveHasRealMiddle() ? endValue("mid") : null;
      if (mid !== null && isFinite(mid)) at.push(mid);
      return at.every(function (v) { return v > hi; }) || at.every(function (v) { return v < lo; });
    }

    /**
     * **The gap a drag divides by, never thinner than a fraction of what the chart is actually
     * showing.** Used for the *two-anchor* (no real middle) mapping only. Once a middle point
     * exists, values travel bright → middle → dark in two spans (`valueAlongRamp`) and this floor
     * is not consulted for the path or the middle handle — keeping it for the no-middle case is
     * what preserves the near-equal-ends drag fix for Hue/Sat overshoot without a third anchor.
     */
    var SPREAD_DAMPING = 10;
    function endsPinned(a) {
      return !!a && !curveHasRealMiddle() && Math.abs(a.to - a.from) <= 1e-9;
    }
    /**
     * **Equal ends still on the default Linear shape** — Saturation 100…100 before anyone bends it.
     * Generation ignores handle height here anyway; the chart stays horizontal. The moment a handle
     * leaves the unit square or the curve ceases to be linear, `effectiveGap` mapping takes over so a
     * two-point 100 → 50 → 100 overshoot arch is drawable without adding a middle anchor first.
     */
    function chartFlat(a, pts) {
      if (!allowOvershoot || !endsPinned(a)) return false;
      var shape = effectivePoints(curveValueOf(pts != null ? pts
        : wrap.getAttribute("data-curve-value")));
      if (!shape.length || !B) return true;
      if (shape.length !== 4) return false;
      if (shape[1] < -0.001 || shape[1] > 1.001 || shape[3] < -0.001 || shape[3] > 1.001) return false;
      return Math.abs(B.bezierAt(shape, 0.5) - 0.5) < 0.02;
    }
    /** Equal ends, flat preset: shape handles edit in the unit square until the curve breaks linear. */
    function shapeSpaceHandles(a, pts) {
      return chartFlat(a, pts);
    }
    function effectiveGap(a) {
      var span = axisIsHue() ? axisHueDelta(a.from, a.to) : (a.to - a.from);
      var seen = [a.from, a.to];
      var mid = curveHasRealMiddle() ? endValue("mid") : null;
      if (mid !== null && isFinite(mid)) seen.push(mid);
      var spread = Math.max.apply(null, seen) - Math.min.apply(null, seen);
      var floor = (spread > 1e-9 ? spread : axisBaseSpan(a)) / SPREAD_DAMPING;
      return Math.abs(span) >= floor ? span : (span < 0 ? -1 : 1) * floor;
    }
    /**
     * Single-span map — two-anchor curves, and the pre-split value when adding a middle point.
     * **Pinned equal ends are the pin itself:** lerp(from, from, u) is from for every u, including
     * overshoot heights — inventing a gap here is what drew Saturation 100…100 as a 100→110 diagonal.
     */
    function unitToValue(a, u) {
      var pts = curveValueOf(wrap.getAttribute("data-curve-value"));
      if (chartFlat(a, pts)) return a.from;
      var gap = effectiveGap(a);
      if (axisIsHue()) return axisWrapHue(a.from + gap * u);
      return a.from + gap * u;
    }
    function valueToUnit(a, v) {
      if (endsPinned(a)) {
        var pts = curveValueOf(wrap.getAttribute("data-curve-value"));
        if (chartFlat(a, pts)) return 0.5;
      }
      var gap = effectiveGap(a);
      if (Math.abs(gap) < 1e-9) return 0.5;
      return axisIsHue() ? axisHueDelta(a.from, v) / gap : (v - a.from) / gap;
    }

    /**
     * **The value the chart (and generation) puts at curve parameter `x`.**
     *
     * Without a real middle: single-span `from + gap · bezierAt` — overshoot Y included.
     * With a real middle: two spans bright → middle → dark, paced by the curve the same way
     * `oklchChannelAt` paces generation (`g / atMiddle` on the first half, `(g − atMiddle) /
     * (1 − atMiddle)` on the second). The middle *field* is the colour at the corner; `pts[5]` is
     * only the pacing height generation divides by. That split is what lets a Hue middle of 200°
     * sit above both ends on the chart instead of being clamped into `[bright, dark]`.
     *
     * Hue returns a wrapped degree (same as `oklchLerpHue`); the path sampler in `draw()` breaks
     * the polyline when adjacent samples jump across the 0° wrap so the chart does not spike.
     */
    function valueAlongRamp(a, pts, x, gOverride) {
      var g = typeof gOverride === "number" ? gOverride
        : (B ? B.bezierAt(pts, x) : x);
      if (!curveHasRealMiddle()) return unitToValue(a, g);
      var mid = endValue("mid");
      if (mid === null || !isFinite(mid)) return unitToValue(a, g);
      var mx = pts.length === 10 ? pts[4] : 0.5;
      var my = pts.length === 10 ? pts[5] : 0.5;
      var t;
      if (x <= mx) {
        t = my > 1e-9 ? g / my : 1;
        if (!allowOvershoot) t = t < 0 ? 0 : t > 1 ? 1 : t;
        return axisLerp(a.from, mid, t);
      }
      t = my < 1 - 1e-9 ? (g - my) / (1 - my) : 1;
      if (!allowOvershoot) t = t < 0 ? 0 : t > 1 ? 1 : t;
      return axisLerp(mid, a.to, t);
    }

    /** Inverse of `valueAlongRamp` for a known `x` — recovers the curve-space Y a pointer means. */
    function valueToCurveY(a, pts, x, value) {
      if (!curveHasRealMiddle()) return valueToUnit(a, value);
      var mid = endValue("mid");
      if (mid === null || !isFinite(mid)) return valueToUnit(a, value);
      var mx = pts.length === 10 ? pts[4] : 0.5;
      var my = pts.length === 10 ? pts[5] : 0.5;
      var t;
      if (x <= mx) {
        var d0 = axisIsHue() ? axisHueDelta(a.from, mid) : (mid - a.from);
        var dv0 = axisIsHue() ? axisHueDelta(a.from, value) : (value - a.from);
        t = Math.abs(d0) < 1e-9 ? 1 : dv0 / d0;
        return t * my;
      }
      var d1 = axisIsHue() ? axisHueDelta(mid, a.to) : (a.to - mid);
      var dv1 = axisIsHue() ? axisHueDelta(mid, value) : (value - mid);
      t = Math.abs(d1) < 1e-9 ? 1 : dv1 / d1;
      return my + t * (1 - my);
    }

    /**
     * Drop a latched window that no longer contains a typed/dragged anchor — otherwise the grip sits
     * off-chart while the number field says the value is there.
     */
    function ensureValueInView(value) {
      if (value === null || !isFinite(value)) return;
      var held = wrap.getAttribute("data-curve-view");
      if (!held) return;
      var pair = held.split(",");
      var lo = parseFloat(pair[0], 10), hi = parseFloat(pair[1], 10);
      if (!(isFinite(lo) && isFinite(hi))) return;
      if (value < lo || value > hi) wrap.removeAttribute("data-curve-view");
    }
    function ensureMidInView(mid) { ensureValueInView(mid); }

    function toView(x, y) {
      var a = axis();
      if (!a) return { x: x * W, y: (1 - y) * H };
      var w = axisView(a);
      var pts = curveValueOf(wrap.getAttribute("data-curve-value"));
      var value = chartFlat(a, pts) ? a.from
        : curveHasRealMiddle() ? valueAlongRamp(a, pts, x, y)
        : unitToValue(a, y);
      return { x: x * W, y: (1 - (value - w.lo) / (w.hi - w.lo)) * H };
    }
    /** Place something at a known channel value (end grips — not a unit-square corner). */
    function plotAtValue(xUnit, value) {
      var a = axis();
      if (!a) return { x: xUnit * W, y: (1 - xUnit) * H };
      var w = axisView(a);
      return { x: xUnit * W, y: (1 - (value - w.lo) / (w.hi - w.lo)) * H };
    }
    function fromView(vx, vy) {
      var a = axis();
      if (!a) return { x: vx / W, y: 1 - vy / H };
      var pts = curveValueOf(wrap.getAttribute("data-curve-value"));
      // **Overshoot channels always drag on the value axis.** Shape-space was for equal-ends Linear only;
      // flipping to value mapping the moment a handle left [0, 1] rewrote the same pointer position as
      // channel hundreds (`cubic-bezier(…, 125, …)`) and the curve jumped off the chart — confirmed live.
      if (!allowOvershoot && shapeSpaceHandles(a, pts)) return { x: vx / W, y: 1 - vy / H };
      var value = valueFromView(vy);
      var x = vx / W;
      if (!curveHasRealMiddle()) {
        return { x: x, y: valueToUnit(a, value) };
      }
      return { x: x, y: valueToCurveY(a, pts, x, value) };
    }
    /**
     * **Write one end back into its field**, clamped to the channel and rounded the way somebody would type it.
     *
     * It dispatches `input` and `change` on the field it writes, because the field is a real control the rest
     * of the form is already listening to — the preview, the `@showWhen` sweep and the config editor all
     * update off those events. Writing `.value` and stopping would move the number on screen and change
     * nothing else, which is the shape of a control that looks like it works.
     */
    function setEndValue(which, value) {
      var cell = endCell(which);
      if (!cell || value === null || !isFinite(value)) return;
      var limit = field.range;
      var next = value;
      // Hue fields store a wrapped degree; the pointer may sit slightly outside [0, 360) mid-drag.
      if (axisIsHue()) next = axisWrapHue(next);
      next = limit ? Math.min(limit.hi, Math.max(limit.lo, next)) : next;
      /**
       * **Rounded against the channel, not to one decimal.**
       *
       * A tenth is right for a lightness or a hue and destroys a chroma: dragging an anchor to 0.044 on a
       * `0..0.4` channel wrote **0**. A thousandth of the range keeps four useful digits whatever the
       * channel measures, which is finer than the drag can resolve on a 190px plot and coarser than the
       * float noise a division leaves behind.
       */
      var span = limit ? Math.abs(limit.hi - limit.lo) : 100;
      var quantum = Math.pow(10, Math.floor(Math.log((span || 100) / 1000) / Math.LN10));
      var rounded = Math.round(next / quantum) * quantum;
      // Back through a float's own shortest form, or `0.30000000000000004` reaches the config block.
      rounded = parseFloat(rounded.toPrecision(12), 10);
      if (which === "mid") ensureMidInView(rounded);
      if (String(rounded) === cell.value) return;
      cell.value = String(rounded);
      if (typeof cell.dispatchEvent === "function" && typeof Event === "function") {
        cell.dispatchEvent(new Event("input", { bubbles: true }));
        cell.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    /**
     * Where the pointer is in the channel's own units.
     *
     * **Clamped to the window, not only to the channel.** Without that you can hold the pointer past the top
     * edge and keep pushing the value up, and the ramp walks out of the chart while you watch it happen.
     */
    function valueFromView(vy) {
      var a = axis();
      if (!a) return null;
      var w = axisView(a);
      return Math.min(w.hi, Math.max(w.lo, w.lo + (1 - vy / H) * (w.hi - w.lo)));
    }

    /** The draggable things, as `{ x, y, index }` — `index` is where the pair lives in the flat array. */
    function handlesOf(pts) {
      var out = [];
      for (var i = 0; i + 1 < pts.length; i += 2) {
        out.push({ x: pts[i], y: pts[i + 1], index: i, anchor: pts.length === 10 && i === 4 });
      }
      return out;
    }

    /** Which anchor a handle hangs off, so the tether line has something to join it to. */
    function tetherFor(pts, index) {
      if (pts.length === 4) return index === 0 ? { x: 0, y: 0 } : { x: 1, y: 1 };
      if (index === 0) return { x: 0, y: 0 };
      if (index === 2 || index === 6) return { x: pts[4], y: pts[5] };
      if (index === 8) return { x: 1, y: 1 };
      return null;
    }

    /**
     * Is the shape editor showing?
     *
     * **Derived first, revealed second.** A curve that is already bent is showing its shape whether anyone
     * asked or not, so that is the answer most of the time. *Add shape* is a disclosure on top of it, and
     * it stops being a disclosure the moment a handle moves — the curve is bent, so the derivation now says
     * the same thing. *Remove shape* flattens the curve, which is a real edit rather than a hidden flag.
     */
    /**
     * Is the shape editor showing?
     *
     * **Whether a shape has been chosen, not whether it is bent.** Picking *Custom* on a straight line has
     * to give you handles — otherwise the choice does nothing and the only way to start shaping is to pick
     * a preset you did not want. So the question is simply whether anything is stored: `[]` is *Linear*,
     * and any coordinates are a shape, even the straight one.
     */
    function shapeShowing() {
      if (!growthKey) return true;
      return curveValueOf(wrap.getAttribute("data-curve-value")).length > 0;
    }

    /**
     * One end of the axis: a filled circle you can drag, reading the field it is bound to.
     *
     * **Filled where a shape handle is hollow**, rather than square where a shape handle is round. Both say
     * "these two are a different kind of thing from those three", and filled-versus-hollow is the one
     * Márton drew — a square beside circles reads as a different control rather than a different role.
     */
    function drawEnd(into, which, at, value) {
      into.appendChild(curveSvgEl("circle", {
        "class": "config-ui-curve__axis-end", cx: at.x, cy: at.y, r: 5,
        "data-curve-end": which,
        tabindex: 0,
        role: "slider",
        "aria-label": (which === "from" ? "Bright end" : "Dark end") + ", " + Math.round(value * 10) / 10
      }));
    }

    /**
     * **Zoom is measured against the ramp, not against the channel.**
     *
     * Against the channel it is nonsense on hue: a neutral travels twelve degrees out of three hundred and
     * sixty, so the opening view is already thirty times in and the marker starts pinned to the top of its
     * track with nowhere to go. Against the ramp, 1 always means "the view you were given" whatever the
     * channel is, and the marker always starts in the same place on every tab.
     */
    /**
     * **Zoom is how much of the channel is on screen**, so 1 means all of it and the marker sits at the
     * bottom of its track.
     *
     * It was a multiple of the view the channel *opened* on, which read as half-zoomed while the chart was
     * showing 0 to 100 — Márton: *"it's the current scale, why not the zoom at 100%?"*. Measuring against
     * the channel also means the ends cannot move it, which was the original complaint: the channel's
     * limits are fixed by `@range` and nothing on the chart can change them.
     *
     * A hue ramp that travels twelve degrees of three hundred and sixty therefore opens at about 28x, with
     * the marker high. That is not a glitch — it is zoomed in, because the alternative is a flat line at
     * the bottom of an empty chart.
     */
    function axisBaseSpan(a) { return Math.max(1e-6, a.hi - a.lo); }
    /** Where zoom should tighten around — the pin, or the span the anchors actually cover. */
    function zoomFocus(a) {
      var mid = field.ends && field.ends.mid ? endValue("mid") : null;
      if (endsPinned(a)) return a.from;
      /**
       * **Equal ends with a real middle anchor: zoom into the dip, not the pin.** Lime saturation
       * `100 … 83 … 100` — both ends sit at 100 and all movement is at 83. Centering on
       * `(100 + 83) / 2` still loses the dip after one step of zoom-in; the middle field is the
       * only value that differs from the ends.
       */
      if (Math.abs(a.to - a.from) <= 1e-9 && mid !== null && isFinite(mid)) return mid;
      var lo = Math.min(a.from, a.to), hi = Math.max(a.from, a.to);
      if (curveHasRealMiddle() && mid !== null && isFinite(mid)) {
        lo = Math.min(lo, mid);
        hi = Math.max(hi, mid);
      }
      return (lo + hi) / 2;
    }
    /**
     * **Tightest zoom for Colors channels: roughly two step spacings, whole numbers only on the axis.**
     * Márton: max zoom is "every two steps visible", not fractional tick labels.
     */
    function zoomCap(a) {
      if (!allowOvershoot) return CURVE_ZOOM_MAX;
      var pts = curveValueOf(wrap.getAttribute("data-curve-value"));
      var ramp = curveRampOf(baselineKey);
      var minSpan = 2;
      if (ramp && ramp.hexes.length > 1 && a) {
        var last = ramp.hexes.length - 1;
        var minD = Infinity;
        for (var i = 0; i < last; i++) {
          var v0 = valueAlongRamp(a, pts, i / last);
          var v1 = valueAlongRamp(a, pts, (i + 1) / last);
          var d = Math.abs(axisIsHue() ? axisHueDelta(v0, v1) : (v1 - v0));
          if (d > 1e-9 && d < minD) minD = d;
        }
        if (isFinite(minD) && minD < Infinity) minSpan = Math.max(2, Math.ceil(minD * 2));
      }
      return Math.min(CURVE_ZOOM_MAX, axisBaseSpan(a) / minSpan);
    }
    function zoomOf(a) {
      var w = axisView(a);
      return Math.min(zoomCap(a), Math.max(1, axisBaseSpan(a) / Math.max(1e-9, w.hi - w.lo)));
    }
    function zoomFraction(z) {
      var f = Math.log(z / CURVE_ZOOM_MIN) / Math.log(CURVE_ZOOM_MAX / CURVE_ZOOM_MIN);
      return Math.min(1, Math.max(0, f));
    }
    /** Re-window at a given tightness about the centre, kept inside the channel. Then redraw. */
    function setZoom(z) {
      var a = axis();
      if (!a) return;
      var cap = zoomCap(a);
      var f = Math.min(cap, Math.max(CURVE_ZOOM_MIN, z));
      var span = Math.min(a.hi - a.lo, axisBaseSpan(a) / f);
      var focus = zoomFocus(a);
      var lo = Math.min(a.hi - span, Math.max(a.lo, focus - span / 2));
      var hi = lo + span;
      if (allowOvershoot) {
        lo = Math.round(lo);
        hi = Math.round(hi);
        if (hi <= lo) hi = lo + 1;
        hi = Math.min(a.hi, hi);
        lo = Math.max(a.lo, hi - Math.max(1, Math.round(span)));
      }
      wrap.setAttribute("data-curve-view", lo + "," + hi);
      draw();
    }

    /** The marker reads the zoom; the gradient reads the window. Both derived, every draw. */
    function placeColumns() {
      var a = axis();
      if (!a || !zoomMark) return;
      var z = zoomOf(a);
      zoomMark.style.top = ((1 - zoomFraction(z)) * 100) + "%";
      zoomMark.setAttribute("aria-valuenow", String(Math.round(z * 100) / 100));
      var stepIn = wrap.querySelector('[data-curve-zoom="in"]');
      var stepOut = wrap.querySelector('[data-curve-zoom="out"]');
      if (stepIn) stepIn.disabled = z >= zoomCap(a) * 0.999;
      if (stepOut) stepOut.disabled = z <= CURVE_ZOOM_MIN * 1.001;
      /**
       * **The middle box reads the curve's anchor**, in the channel's units.
       *
       * Disabled with an em dash when the curve has no middle point, because then there is nothing for it
       * to be a view of — showing a number there would invent one. Left alone while it has focus: this runs
       * on every draw, and rewriting a field mid-keystroke is how a control becomes impossible to type in.
       */
      var stored = curveValueOf(wrap.getAttribute("data-curve-value"));
      var curveHasMiddle = stored.length === 10;
      /**
       * **Where the curve already sits at the midpoint, before anyone has added an anchor there.**
       * `bezierWithMiddle(pts, 0.5)`'s own split point is *solved* to land at x=0.5 — see its `bezierSolve`
       * call — so the y it would produce there is exactly `bezierAt(pts, 0.5)`, the curve's ordinary
       * eased value at the halfway point. Reading that without a real anchor is the "useful even before
       * you add a middle point" number Márton asked for. Written to `placeholder`, never `.value` — a
       * disabled field's value is still what `collectRows` reads, and this is a measurement, not an
       * anchor nobody set.
       */
      function derivedMiddleText() {
        if (!B || !stored.length) return "";
        var value = valueAlongRamp(a, stored, 0.5);
        // **Rounded against the channel, the same reason `setEndValue` is.** A tenth reads fine for a
        // lightness or a hue and rounds a chroma straight to 0 — `0..0.4`'s thousandth keeps four useful
        // digits, and a channel with no declared range still gets the one-decimal read this box always
        // showed before there was anything to derive.
        var span = field.range ? Math.abs(field.range.hi - field.range.lo) : 10;
        var quantum = Math.pow(10, Math.floor(Math.log((span || 10) / 1000) / Math.LN10));
        var rounded = parseFloat((Math.round(value / quantum) * quantum).toPrecision(12), 10);
        return String(rounded);
      }
      // An adopted middle is greyed rather than hidden: it keeps its value, and it comes back the moment
      // the curve grows a middle point again.
      var midCell = field.ends.mid ? endCell("mid") : null;
      if (midCell) {
        midCell.disabled = !curveHasMiddle;
        midCell.placeholder = curveHasMiddle ? "" : derivedMiddleText();
        if (!curveHasMiddle && (typeof document === "undefined" || document.activeElement !== midCell)) {
          midCell.value = "";
        }
        /**
         * **The dimming wrapper is shared; this control's answer only counts while it is the one on
         * screen.** Hue and hslHue (`@showWhen`, one model at a time) bind to the *same* bright/middle/dark
         * cell — `adoptEnds` already refuses to adopt it while hidden, for the reason on that check. This
         * needs the identical guard: `refreshCurveControls` redraws every *other* curve right after the one
         * just edited, so clicking *Add middle point* on the visible curve set `data-shown="true"` and the
         * very next line was the hidden twin's own redraw — still no middle point of its own — setting it
         * straight back to `"false"` on the one shared node both curves' `.disabled` boxes sit inside.
         * Confirmed live: the field itself was correctly enabled and typable, and stayed dimmed at 0.45
         * opacity regardless, because the box and its dimming were never read from the same curve twice in
         * a row. `midCell.disabled` above is unaffected — it addresses this curve's own field by name, never
         * the twin's — so only the *shared* write needs the check.
         */
        var visible = typeof plot.getClientRects !== "function" || !!plot.getClientRects().length;
        var midWrap = visible && typeof midCell.closest === "function"
          ? midCell.closest(".config-ui-curve__anchor") : null;
        if (midWrap) midWrap.setAttribute("data-shown", curveHasMiddle ? "true" : "false");
      }
      if (middleBox) {
        var held = stored;
        var hasMiddle = curveHasMiddle;
        middleBox.disabled = !hasMiddle;
        // **Placeholder, not `.value`, for the derived reading** \u2014 the same reason the adopted case
        // above uses it: this box has no field behind it to be collected, but treating "no anchor" and
        // "measured, not set" the same way here keeps the two middle boxes behaving alike.
        middleBox.placeholder = hasMiddle ? "" : derivedMiddleText();
        var middleWrap = typeof middleBox.closest === "function"
          ? middleBox.closest(".config-ui-curve__anchor") : null;
        if (middleWrap) middleWrap.setAttribute("data-shown", hasMiddle ? "true" : "false");
        if (typeof document === "undefined" || document.activeElement !== middleBox) {
          middleBox.value = hasMiddle
            ? String(Math.round(unitToValue(a, held[5]) * 10) / 10) : "";
        }
      }
      if (rangeFill) {
        var stops = rangeStops(a);
        rangeFill.style.background = stops
          ? "linear-gradient(to bottom, " + stops.join(", ") + ")" : "";
        rangeFill.setAttribute("data-shown", stops ? "true" : "false");
      }
    }

    /**
     * **Each token's colour, at the value this curve puts it at**, as gradient stops down the window.
     *
     * Not a sweep of the channel in the abstract — a picture of *this* ramp. Zoom in between two steps and
     * the bar is the blend between those two colours, which is what the ramp does there.
     *
     * Positions run top-down because a CSS gradient does and the axis does not: the window's high value is
     * at the top of the plot. **Cropped to the window, not clamped to its edges.** Clamping kept every
     * token's colour somewhere on the strip — compressed toward the edges once zoomed — so the full
     * spectrum stayed visible instead of the zoomed slice, which is the "wrong" behaviour in Márton's own
     * reference images. A token outside the window is dropped instead, and the colour exactly at each edge
     * is interpolated between whichever two tokens bracket it, the same linear blend a CSS gradient already
     * does between any two stops — so the strip shows only what the window actually contains, stretched to
     * fill it, and the correlation with the chart's own axis numbers holds at every zoom level.
     */
    function hexToRgb(hex) {
      var m = /^#?([0-9a-f]{6})$/i.exec(hex);
      if (!m) return null;
      var n = parseInt(m[1], 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
    function lerpHex(h1, h2, t) {
      var a = hexToRgb(h1), b = hexToRgb(h2);
      if (!a || !b) return t < 0.5 ? h1 : h2;
      return "#" + [a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t]
        .map(function (c) {
          var byte = Math.max(0, Math.min(255, Math.round(c)));
          return (byte < 16 ? "0" : "") + byte.toString(16);
        }).join("");
    }
    function hexAt(points, last, value) {
      if (value <= points[0].value) return points[0].hex;
      if (value >= points[last].value) return points[last].hex;
      for (var k = 1; k <= last; k++) {
        if (value <= points[k].value) {
          var p0 = points[k - 1], p1 = points[k];
          var t = p1.value === p0.value ? 0 : (value - p0.value) / (p1.value - p0.value);
          return lerpHex(p0.hex, p1.hex, t);
        }
      }
      return points[last].hex;
    }
    /**
     * **The bar is a picture of the window**, built from `@ramp` — a CSS colour with `$` where the axis
     * value goes and `~key` for a sibling field.
     *
     * **The window, not the whole channel.** This used to draw the whole channel and mark the zoomed
     * window on top of it with a bracket, on the reasoning that a hue ramp travelling one degree is a
     * solid block of colour otherwise. Márton reversed that: the strip has to correlate with the chart's
     * own numbers on the left at every zoom level, the same way the chart itself does — zoom to hue
     * 90..100 and the strip shows hue 90..100, stretched to fill the same height, not the whole wheel
     * with a sliver bracketed near one edge.
     *
     * Sampled at eleven points across the window and handed to the browser, which does the mixing. So no
     * colour maths lives here: the only other way to draw a hue wheel is a second copy of `@oklch.js`
     * beside the one the sandbox runs, and `build-bezier.js` exists so that does not happen.
     *
     * Read fresh every draw, siblings and all, which is what makes it follow a drag. The version before
     * this used the collection's *token* colours — a lightness ramp, so it looked right on Lightness and
     * showed a light-to-dark sweep on Hue and Saturation, and could not follow a drag at all because the
     * tokens are the file's and the drag has not been run yet.
     */
    function templateStops(a) {
      if (!field.ramp) return null;
      var w = axisView(a), span = w.hi - w.lo;
      if (!(span > 0)) return null;
      var out = [];
      for (var i = 0; i <= 10; i++) {
        var at = i / 10;
        // Top of the bar is the window's high value, as it is on the plot beside it.
        var value = w.hi - at * span;
        var colour = field.ramp.replace(/~([A-Za-z0-9_$.]+)/g, function (all, key) {
          var cell = cellNamed(key);
          var held = cell ? parseFloat(cell.value, 10) : NaN;
          return isFinite(held) ? String(Math.round(held * 100) / 100) : "0";
        }).replace(/\$/g, String(Math.round(value * 1000) / 1000));
        out.push(colour + " " + Math.round(at * 1000) / 10 + "%");
      }
      return out;
    }

    /** Any cell in this control's scope, by key — the same lookup the two ends use. */
    function cellNamed(key) {
      if (!key) return null;
      var scope = typeof wrap.closest === "function" ? wrap.closest(".config-ui-rows-item") : null;
      if (!scope) {
        scope = wrap;
        while (scope.parentNode && scope.parentNode.nodeType === 1) scope = scope.parentNode;
      }
      return typeof scope.querySelector === "function"
        ? scope.querySelector('[data-row-field="' + key + '"]') : null;
    }

    function rangeStops(a) {
      var fromTemplate = templateStops(a);
      if (fromTemplate) return fromTemplate;
      var ramp = curveRampOf(baselineKey);
      if (!ramp) return null;
      var hexes = ramp.hexes;
      var pts = curveValueOf(wrap.getAttribute("data-curve-value"));
      var w = axisView(a), span = w.hi - w.lo;
      if (!(span > 0)) return null;
      var last = hexes.length - 1;
      var points = [];
      for (var i = 0; i <= last; i++) {
        points.push({ value: valueAlongRamp(a, pts, last ? i / last : 0), hex: hexes[i] });
      }
      // Sorted by value, not token order — the boundary lookup below walks a straight line, whichever
      // direction the ramp itself runs.
      points.sort(function (p, q) { return p.value - q.value; });
      var kept = points.filter(function (p) { return p.value > w.lo && p.value < w.hi; });
      kept.reverse(); // descending, to match the window's high value sitting at the top of the strip.
      var out = [{ value: w.hi, hex: hexAt(points, last, w.hi) }]
        .concat(kept, [{ value: w.lo, hex: hexAt(points, last, w.lo) }]);
      return out.map(function (p) {
        var at = Math.min(100, Math.max(0, ((w.hi - p.value) / span) * 100));
        return p.hex + " " + Math.round(at * 10) / 10 + "%";
      });
    }

    function draw() {
      adoptEnds();
      placeColumns();
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      while (tickLayer.firstChild) tickLayer.removeChild(tickLayer.firstChild);
      var stored = curveValueOf(wrap.getAttribute("data-curve-value"));
      var pts = effectivePoints(stored);
      var empty = !pts.length;

      svg.setAttribute("class", "config-ui-curve__canvas" + (empty ? " config-ui-curve__canvas--empty" : ""));
      measurePlot();
      svg.appendChild(curveSvgEl("rect", {
        "class": "config-ui-curve__plot", x: 0, y: 0, width: W, height: H
      }));
      var ax = axis();
      // Zoom / range / ticks stay for equal ends too — the synthetic `effectiveGap` window is what
      // puts an ordinary Linear preset on screen when bright === dark. Hiding them for "flat" left
      // Saturation looking unfinished until someone nudged an end.
      if (zoomCol) zoomCol.hidden = false;
      if (rangeCol) rangeCol.hidden = false;
      /**
       * **A windowed axis has a curve that leaves the box, and the box has to cut it off.**
       *
       * The canvas is `overflow: visible` so handles can hang off the corners, which is right and is what
       * every cubic-bezier editor looks like. On a unit square nothing else ever left the box. On an axis
       * the plot is a *slice*, so the parts of the ramp outside that slice were drawn outside the plot —
       * over the coordinate field, over the next curve down the form, over whatever happened to be there.
       * Clipping the line and leaving the handles unclipped is the only combination that gets both right.
       */
      if (ax) {
        var clip = curveSvgEl("clipPath", { id: clipId });
        clip.appendChild(curveSvgEl("rect", { x: 0, y: 0, width: W, height: H }));
        svg.appendChild(clip);
        /**
         * **A grip sits *on* the frame, not inside it.** Clipped tight, an end on the boundary was sliced in
         * half and read as broken. Clipped to the frame plus a grip's radius it straddles the edge, and
         * anything genuinely outside the window is still cut off long before it reaches the row below.
         */
        var padClip = curveSvgEl("clipPath", { id: clipId + "-grip" });
        padClip.appendChild(curveSvgEl("rect", { x: -8, y: -8, width: W + 16, height: H + 16 }));
        svg.appendChild(padClip);
      }
      // Quarter lines, and the diagonal the curve is a departure from. Reading a curve is reading how far
      // it sits from straight, so the straight one is on the page rather than imagined.
      [25, 50, 75].forEach(function (at) {
        svg.appendChild(curveSvgEl("line", {
          "class": "config-ui-curve__grid", x1: at / 100 * W, y1: 0, x2: at / 100 * W, y2: H }));
        if (!ax) {
          svg.appendChild(curveSvgEl("line", {
            "class": "config-ui-curve__grid", x1: 0, y1: at / 100 * H, x2: W, y2: at / 100 * H }));
        }
      });
      // **The diagonal is the straight *curve*, not the diagonal of the box.** With an axis it runs from
      // the bright end to the dark end, which is where they actually sit in the window — off the top or
      // bottom edge when you have zoomed in past them, which is correct and is the point of zooming.
      var straightFrom = ax ? toView(0, 0) : { x: 0, y: H };
      var straightTo = ax ? toView(1, 1) : { x: W, y: 0 };
      svg.appendChild(curveSvgEl("line", {
        "class": "config-ui-curve__diagonal",
        x1: straightFrom.x, y1: straightFrom.y, x2: straightTo.x, y2: straightTo.y
      }));
      // **Horizontal lines at round values, labelled.** A grid at 25/50/75 percent of an arbitrary window
      // says nothing; a line at 80 and a line at 60 say where you are. Rounded to whatever tenth, unit or
      // ten keeps the count near four, so the labels never crowd.
      if (ax) {
        var w = axisView(ax);
        var span = w.hi - w.lo;
        var raw = span / 4;
        var tick;
        if (allowOvershoot) {
          var intSteps = [1, 2, 5, 10, 20, 25, 50, 100];
          tick = intSteps[intSteps.length - 1];
          for (var si = 0; si < intSteps.length; si++) {
            if (intSteps[si] >= raw) { tick = intSteps[si]; break; }
          }
        } else {
          var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
          var stepSizes = [1, 2, 2.5, 5, 10];
          tick = mag * 10;
          for (var sj = 0; sj < stepSizes.length; sj++) {
            if (stepSizes[sj] * mag >= raw) { tick = stepSizes[sj] * mag; break; }
          }
        }
        var decimals = allowOvershoot ? 0 : Math.max(0, -Math.floor(Math.log(tick) / Math.LN10 + 1e-9));
        for (var v = Math.ceil(w.lo / tick) * tick; v <= w.hi + tick * 1e-6; v += tick) {
          var vy = (1 - (v - w.lo) / span) * H;
          svg.appendChild(curveSvgEl("line", {
            "class": "config-ui-curve__grid", x1: 0, y1: vy, x2: W, y2: vy
          }));
          var label = document.createElement("span");
          label.className = "config-ui-curve__tick";
          label.style.top = (vy / H) * 100 + "%";
          var shown = Math.abs(v) < tick * 1e-6 ? 0 : v;
          label.textContent = allowOvershoot ? String(Math.round(shown))
            : shown.toFixed(decimals);
          tickLayer.appendChild(label);
        }
      }

      emptyNote.setAttribute("data-shown", empty ? "true" : "false");
      if (empty) return;

      // **In growth mode every y is multiplied by how fast the scale grows.** That one factor is the whole
      // of the difference: the shape still comes from `bezierAt` over the unit square, and the log axis
      // turns `base × ratio^((n-1)·curve(t))` into `curve(t) × log(ratio)/log(GROWTH_MAX)`.
      var lift = growthKey ? curveGrowthHeight(growthRatio()) : 1;
      var showShape = shapeShowing();

      // The curve, sampled rather than emitted as a path of its own segments: `bezierAt` is what the
      // generator will call, so drawing anything else risks a picture that disagrees with the numbers.
      //
      // **Hue: break the polyline at the 0° wrap.** Adjacent samples can jump from ~5° to ~355° on the
      // short arc; connecting them draws the vertical spikes Márton saw while the swatch strip (one
      // wrapped colour per step) stayed fine. A fresh `M` starts a new subpath instead.
      var d = "";
      var prevValue = null;
      for (var i = 0; i <= 80; i++) {
        var x = i / 80;
        var gy = (B ? B.bezierAt(pts, x) : x) * lift;
        var pt = toView(x, gy);
        var sampleValue = ax ? (curveHasRealMiddle()
          ? valueAlongRamp(ax, pts, x, gy)
          : unitToValue(ax, gy)) : null;
        var jump = axisIsHue() && prevValue !== null && sampleValue !== null
          && Math.abs(sampleValue - prevValue) > 180;
        d += (i === 0 || jump ? "M" : "L") + pt.x.toFixed(2) + " " + pt.y.toFixed(2);
        prevValue = sampleValue;
      }
      /**
       * **Two groups on an axis, not one clipped path.** Clipping only the line left the tethers and the
       * grips free, and once the window is tight they are far outside the plot — so the chart threw thin
       * diagonals across the panel and dropped handles onto whatever was below it. The *ramp* is clipped to
       * the frame; the *grips* to the frame plus their own radius, so one on the boundary is whole.
       */
      var ramp = ax ? curveSvgEl("g", { "clip-path": "url(#" + clipId + ")" }) : svg;
      var grips = ax ? curveSvgEl("g", { "clip-path": "url(#" + clipId + "-grip)" }) : svg;
      if (ax) svg.appendChild(ramp);
      ramp.appendChild(curveSvgEl("path", { "class": "config-ui-curve__path", d: d }));

      /**
       * **A dot per token, in its own colour, on the line it lands on.**
       *
       * The chart's whole job is *where does each step end up*, and until now it answered that with a
       * smooth line and left you to interpolate. The dots are the answer. They are drawn from the same
       * published colours the bar beside the chart uses, so a step cannot be shown at one value here and
       * another there.
       *
       * Small on purpose: Márton deferred these once for being too large, and a dot that competes with a
       * handle for the eye makes the thing you can drag harder to find, not easier.
       */
      var tokens = ax ? curveRampOf(baselineKey) : null;
      if (tokens) {
        var lastToken = tokens.hexes.length - 1;
        for (var t = 0; t <= lastToken; t++) {
          var tx = lastToken ? t / lastToken : 0;
          var spot = toView(tx, (B ? B.bezierAt(pts, tx) : tx) * lift);
          if (t === tokens.seed) {
            // The seed is a step like any other; the ring says which one without moving it.
            ramp.appendChild(curveSvgEl("circle", {
              "class": "config-ui-curve__seed-ring", cx: spot.x, cy: spot.y, r: 5.5
            }));
          }
          ramp.appendChild(curveSvgEl("circle", {
            "class": "config-ui-curve__token", cx: spot.x, cy: spot.y, r: 2.5, fill: tokens.hexes[t]
          }));
        }
      }

      var handles = showShape ? handlesOf(pts) : [];
      // PROBE: skip while a handle drag is in flight — every rAF was posting a full axis dump to the
      // bridge and that was a measurable share of the "sluggish while dragging" feel.
      if (typeof window !== "undefined" && window.codefigProbe && ax && dragging === null) {
        window.codefigProbe("curve:axis", {
          field: (field && field.name) || wrap.getAttribute("data-row-field") || null,
          pts: pts, axis: ax, window: ax ? axisView(ax) : null,
          curveHasRealMiddle: curveHasRealMiddle(),
          effectiveGap: effectiveGap(ax),
          handles: handles.map(function (h) {
            return {
              index: h.index, x: h.x, y: h.y,
              value: curveHasRealMiddle()
                ? valueAlongRamp(ax, pts, h.x, h.y * lift)
                : unitToValue(ax, h.y * lift),
              px: toView(h.x, h.y * lift)
            };
          })
        });
      }
      handles.forEach(function (h) {
        var to = tetherFor(pts, h.index);
        var at = toView(h.x, h.y * lift);
        if (to && !h.anchor) {
          var from = toView(to.x, to.y * lift);
          ramp.appendChild(curveSvgEl("line", {
            "class": "config-ui-curve__tether", x1: from.x, y1: from.y, x2: at.x, y2: at.y
          }));
        }
      });
      // The fixed ends, drawn but not draggable — a scale curve that started anywhere but the start would
      // not be a scale curve, so there is nothing to offer here.
      // The origin is always fixed. The far end is the **growth handle** in growth mode — dragging it is how
      // you set the ratio — and a fixed anchor in the bounded one.
      // Grips last, so one sitting on top of another is still the one you grab.
      if (ax) svg.appendChild(grips);
      // **End grips sit on the field values**, not on `toView(0,0)` / `toView(1,1)`. Those corners go
      // through `unitToValue`/`effectiveGap`, which on equal ends invented 90 and 110 while the fields
      // said 100 — so the grips lied, dragging them felt broken, and on release one jumped off-screen.
      var originAt = ax ? plotAtValue(0, ax.from) : toView(0, 0);
      if (ax) {
        // **Square, not round — and they move the palette, not the curve.** The three round handles bend the
        // shape *between* the ends; these two say where the ends are, which is a different fact living in a
        // different field. Same shape as the number input below, so the two read as one control.
        drawEnd(grips, "from", originAt, ax.from);
      } else {
        svg.appendChild(curveSvgEl("circle", {
          "class": "config-ui-curve__end", cx: originAt.x, cy: originAt.y, r: 3
        }));
      }
      var farAt = ax ? plotAtValue(1, ax.to) : toView(1, growthKey ? lift : 1);
      if (ax) {
        drawEnd(grips, "to", farAt, ax.to);
      } else if (growthKey) {
        svg.appendChild(curveSvgEl("circle", {
          "class": "config-ui-curve__handle config-ui-curve__handle--growth",
          cx: farAt.x, cy: farAt.y, r: 5,
          "data-curve-growth": "true",
          tabindex: 0,
          role: "slider",
          "aria-label": "Growth, " + (growthRatio() || 1) + " per step"
        }));
      } else {
        svg.appendChild(curveSvgEl("circle", {
          "class": "config-ui-curve__end", cx: farAt.x, cy: farAt.y, r: 3
        }));
      }
      // Shape handles draw whenever the curve carries a shape (`showShape`) — including equal ends
      // on the flat Linear preset, where bending them is how a two-point overshoot arch is authored.
      if (showShape) {
        handles.forEach(function (h) {
          var at = toView(h.x, h.y * lift);
          var dot = curveSvgEl("circle", {
            "class": "config-ui-curve__handle" + (h.anchor ? " config-ui-curve__handle--anchor" : ""),
            cx: at.x, cy: at.y, r: h.anchor ? 5 : 4.5,
            "data-curve-index": h.index,
            tabindex: 0,
            role: "slider",
            "aria-label": (h.anchor ? "Middle anchor" : "Handle " + (h.index / 2 + 1)) +
              " at " + h.x.toFixed(2) + ", " + h.y.toFixed(2)
          });
          (ax ? grips : svg).appendChild(dot);
        });
      }
    }

    /**
     * The growth readout: `×1.5 per step`, and where that lands if the token count is knowable.
     *
     * The largest value is **derived and shown, never typed** — that is the whole change. It needs the token
     * count, which lives in a field above the table rather than in this row, so it is looked up and simply
     * left off when it cannot be found. A readout that guessed would be worse than one that is short.
     */
    function curveGrowthText() {
      var ratio = growthRatio();
      if (ratio === null) return "";
      // **Always both, and always the coordinates — even when they are straight.** This field exists so a
      // scale can be copied out and pasted back, and a scale is its growth *and* its shape: printing only
      // one reproduces neither. Printing nothing at all when the curve is linear, which it used to, made
      // the field look arbitrary — it had a value sometimes.
      return ratio + " " + (B ? B.bezierFormat(curveShapeForText()) : "");
    }

    /** The shape to print: whatever is stored, or the straight curve when nothing is. */
    function curveShapeForText() {
      return effectivePoints(curveValueOf(wrap.getAttribute("data-curve-value")));
    }

    /** One writer for the value, so the attribute, the picture, the caption and the text field cannot part company. */
    function setPoints(next, opts) {
      var pts = curveValueOf(next);
      wrap.setAttribute("data-curve-value", JSON.stringify(pts));
      // PROBE: every curve-data change funnels through here regardless of source (drag, preset,
      // typed text, add/remove middle point), so one call catches all of them. `window.codefigProbe`
      // is a no-op unless `window.CODEFIG_PROBE` is set — see its definition in `src/ui.html`.
      if (typeof window !== "undefined" && window.codefigProbe && !(opts && opts.live)) {
        var probeRow = typeof wrap.closest === "function" ? wrap.closest("[data-row-index]") : null;
        window.codefigProbe("curve:setPoints", {
          field: (field && field.name) || wrap.getAttribute("data-row-field") || null,
          row: probeRow ? probeRow.getAttribute("data-row-index") : null,
          overshoot: !!(pts && pts.overshoot), pts: Array.from(pts), opts: opts || null
        });
      }
      // **`Estimated original` is looked up, not remembered.** It wins over `Custom` when the coordinates
      // *are* the fit — and over a preset name too, because a fit that happens to land on Linear is still
      // the estimate and saying `Linear` would lose where it came from. Change a handle and the numbers stop
      // matching, so the caption falls through to `Custom` on its own. Nothing stored, nothing to clear.
      var label = (estimate && sameCurve(pts, estimate)) ? "estimated" : curveLabelFor(effectivePoints(pts));
      // The dropdown *reads* the curve. Selecting an option it does not contain leaves a `<select>` blank,
      // so *Custom* is a real option rather than a placeholder.
      var resolved = label === "original" && !allowOriginal ? "custom" : label;
      // **Offered only once it is true.** Picking it while the points still match a named preset
      // changed nothing to pick — see the note on `add("custom", ...)` above.
      var customOption = preset.querySelector('option[value="custom"]');
      if (customOption) customOption.hidden = resolved !== "custom";
      preset.value = resolved;
      if (!preset.value) preset.value = "custom";

      // The middle-point button only means something once there is a shape to split.
      if (growthKey) toggle.style.display = shapeShowing() ? "" : "none";
      toggle.textContent = pts.length === 10 ? "Remove middle point" : "Add middle point";
      toggle.disabled = !pts.length;

      if (!opts || !opts.keepText) {
        // **In growth mode the field reads the scale, not the curve.** Coordinates are the thing you paste
        // when the shape is the point; here the number anyone wants is the growth, and the largest value it
        // lands on. Both are shown because the second is the one people sanity-check, and it is derived —
        // typing it is exactly what this model removed.
        // Both branches read the **effective** curve, so the field agrees with the line on the plot. The
        // bounded editor printed the raw stored value, which is empty for a scale that has not been shaped
        // — an empty field beside a drawn straight line.
        text.value = growthKey ? curveGrowthText() : (B ? B.bezierFormat(curveShapeForText()) : "");
      }
      draw();
      if (!opts || !opts.quiet) {
        var ev = new Event("change", { bubbles: true });
        // **A live change is drawn but not written through.** Mid-drag the form and the preview should
        // follow the handle; the config editor's text does not have to, because nothing reads it until the
        // preview runs or the drag ends. The flag rides the event so the one listener can tell the two
        // apart without the renderer having to know what a host does with either.
        if (opts && opts.live) ev.codefigLive = true;
        wrap.dispatchEvent(ev);
      }
    }

    /**
     * **The dropdown is where a person goes to ask for the estimate, not just where it shows up once
     * there is one.** Before this, *Estimated original* only appeared after a fit had already run —
     * backwards, since a fit runs from opening a channel tab, and the whole point of the option is to be
     * the thing someone reaches for. Selecting it on an unfitted mode is now itself one of the fit's
     * triggers, alongside opening a tab (`.plans/36-lazy-fit-on-demand.md`).
     *
     * A fit takes ~700ms-1s, real work, not a redraw — so the control has to say it is busy rather than
     * sit still. Disabling `preset` and relabelling the option in place does that with no extra element:
     * a disabled dropdown that still reads "Estimating original…" is the status, not a separate line
     * competing for space in an already-narrow row cell.
     *
     * `awaitingEstimate` also guards re-entrancy — the host's own `_modeFitted` claims the fit
     * immediately, before it resolves, so a second selection while the first is still in flight here
     * would otherwise fire a second, redundant request event.
     */
    var awaitingEstimate = false;
    var estimateTimeout = null;
    // Generous over the ~700ms-1s a real fit takes (`.plans/36-lazy-fit-on-demand.md`'s own measured
    // numbers) so this only ever fires on a genuine stall, never on an ordinary one.
    var ESTIMATE_TIMEOUT_MS = 6000;
    var estimatedOption = preset.querySelector('option[value="estimated"]');
    /**
     * **A control that asks must be able to stop asking.** The first version disabled the dropdown and
     * waited for `config-ui-curve-refresh` to say the fit landed — with nothing that says it never
     * will, a stall upstream (an auto-import that never resolves, the exact failure this shipped
     * against) freezes the control forever. This is the backstop: whatever the cause, the person gets
     * their control back, told plainly what happened and what to try, not a dropdown that quietly
     * stopped responding.
     */
    function clearEstimateWait(timedOut) {
      awaitingEstimate = false;
      if (estimateTimeout) { clearTimeout(estimateTimeout); estimateTimeout = null; }
      preset.disabled = false;
      if (estimatedOption) estimatedOption.textContent = "Estimated original";
      preset.title = timedOut ? "No estimate arrived. Try again, or pick a curve." : "";
    }
    function requestEstimate() {
      if (awaitingEstimate) return;
      awaitingEstimate = true;
      preset.disabled = true;
      preset.title = "";
      if (estimatedOption) estimatedOption.textContent = "Estimating original…";
      // The host owns the fit (a real network round trip through the sandbox) and the row addressing
      // that finds which mode this is — the same reasons `onChannelOpen` is a callback rather than
      // something this file does itself. `evt.target` is `wrap`, so the host can find the row the same
      // way `onChannelOpen`'s click delegation already does.
      wrap.dispatchEvent(new Event("config-ui-request-estimate", { bubbles: true }));
      estimateTimeout = setTimeout(function () {
        if (!awaitingEstimate) return;
        clearEstimateWait(true);
        setPoints(wrap.getAttribute("data-curve-value"), { quiet: true });
        // **Giving the control back is not the same as stopping the request.** There is no
        // cancellation API for the silent run this asked for, so the request itself keeps going —
        // this says so, rather than leaving a stale answer free to land, unasked for, into whatever
        // is on screen when it eventually does. `onAbandonEstimate` marks it to be dropped on
        // arrival; see `src/ui.html`'s `abandonQuickFit`.
        wrap.dispatchEvent(new Event("config-ui-abandon-estimate", { bubbles: true }));
      }, ESTIMATE_TIMEOUT_MS);
      if (estimateTimeout && typeof estimateTimeout.unref === "function") estimateTimeout.unref();
    }

    preset.addEventListener("change", function () {
      var choice = preset.value;
      if (choice === "original") return setPoints([]);
      if (choice === "estimated") {
        // Selecting it puts the estimate back. It is the file's own shape, so this is the way back after
        // an edit — the values survive because they are re-derived from the collection, not held by the
        // control.
        if (estimate) return setPoints(estimate.slice());
        // No fit yet for this mode, and this cell can ask for one — the only case the option is shown
        // without an estimate already in hand (see `buildCurvePresetSelect`'s `awaitable`).
        if (isPerModeCurve) return requestEstimate();
        return setPoints([]);
      }
      if (choice === "custom") {
        // **Custom on a straight line is still a shape.** Storing the straight coordinates is what gives it
        // handles to drag — picking *Custom* and getting nothing to grab was a choice that did nothing.
        return setPoints(effectivePoints(curveValueOf(wrap.getAttribute("data-curve-value"))));
      }
      // In growth mode *Linear* is the no-shape state, so it clears rather than storing a straight curve.
      if (growthKey && choice === "linear|none") return setPoints([]);
      var bits = choice.split("|");
      setPoints(B ? B.bezierFromEase(bits[0], bits[1], 1) : []);
    });

    toggle.addEventListener("click", function () {
      if (!B) return;
      var pts = curveValueOf(wrap.getAttribute("data-curve-value"));
      if (!pts.length) return;
      if (pts.length === 10) {
        setPoints(B.bezierWithoutMiddle(pts));
        return;
      }
      /**
       * **Split where the ramp actually turns, not always at the plot's own middle.** Generation paces
       * each half against `index / last` up to the channel's real middle *step* — the seed's placement,
       * or `colorsMidIndex` when there is none — which for an even step count is essentially never 0.5
       * exactly (a 16-step ramp turns at step 7 of 15, 0.467). Splitting here at a flat 0.5 put the
       * curve's own corner at a different horizontal position than the one generation bends at: for every
       * step between the two, `bezierAt` was already reading the *second* segment while generation still
       * treated it as the first half's own progress toward the middle, which is a discontinuity in the
       * generated ramp that the drawn curve gives no hint of. Only the host can answer where the real
       * middle step is — the seed placement and the step list are sibling cells this control cannot see —
       * asked synchronously through a mutable event detail, the same reason `onChannelOpen` and
       * `onRequestEstimate` are callbacks rather than something this file works out itself. No listener,
       * or nothing to say, keeps 0.5 — exactly right for a channel with no seed placement to disagree
       * with it.
       *
       * **`Event`, not `CustomEvent` — `detail` attached after, not passed to the constructor.** The
       * DOM shim's `dispatchEvent` walks the bubble chain by hand and assigns `e.target` itself, which
       * throws on a real `CustomEvent` (read-only `target`) the moment a listener further up the chain
       * re-enters `dispatchEvent`, as this one does mid-click. `setPoints`'s own `ev.codefigLive = true`
       * is the same pattern already proven against this shim: a plain, mutable property on a plain
       * `Event`, not a constructor option.
       */
      var asked = { fraction: 0.5 };
      var askEvt = new Event("config-ui-middle-point-position", { bubbles: true });
      askEvt.detail = asked;
      wrap.dispatchEvent(askEvt);
      var at = typeof asked.fraction === "number" && isFinite(asked.fraction) &&
        asked.fraction > 0 && asked.fraction < 1 ? asked.fraction : 0.5;
      /**
       * **The curve's real height at the split, read before the split — not the corner's own height
       * after it.** `bezierWithMiddle` holds the new corner to `[0.001, 0.999]` because `oklchRamp`
       * divides by it; sound for the corner, and the wrong number for the host's field fill below,
       * which wants *where this point on the curve actually was* — for a curve already dragged into
       * an overshoot, that can be well past 1 or below 0, and the margin-clamped corner has already
       * lost it. `pts` here is still the pre-split, two-anchor curve — `bezierAt` reads its real,
       * unclamped height, exactly what the field fill needs to place the middle where the curve
       * visibly already was, not where the split's own safety margin left the corner.
       */
      var realHeightAtSplit = B.bezierAt(pts, at);
      var preAxis = axis();
      var valueAtSplit = preAxis ? valueAlongRamp(preAxis, pts, at, realHeightAtSplit) : null;
      setPoints(B.bezierWithMiddle(pts, at));
      // **The curve now has a middle position; the channel's own middle *value* is a different cell
      // this control cannot see.** `bright.hue`/`middle.hue`/`dark.hue` live in sibling row cells this
      // curve knows nothing about — so the host, which can see the whole row, is asked to fill the
      // sibling in from what the curve and the row's own ends already say, the same reason
      // `onChannelOpen` and `onRequestEstimate` are callbacks and not something this file does itself.
      var addedEvt = new Event("config-ui-middle-point-added", { bubbles: true });
      addedEvt.detail = { fraction: realHeightAtSplit, value: valueAtSplit, replace: true };
      wrap.dispatchEvent(addedEvt);
    });

    // **Only on a real edit.** The field is redrawn from the curve on every change, so reacting to that
    // would re-parse the control's own output and round it to the three places it prints at.
    /**
     * `1.5 cubic-bezier(0.333, 0.333, 0.667, 0.667)` — a growth, a shape, or both.
     *
     * **Split at the first `cubic-bezier`, not on whitespace.** A three-point curve prints as *two* calls
     * with the middle anchor loose between them, so anything that tried to pick the numbers apart by
     * position ate the anchor and refused the control's own output. Everything from the first call onward
     * goes to `bezierParse`, which already knows both shapes; whatever precedes it is the growth.
     *
     * All of these work, and mean what they look like:
     *
     * - `1.5` — set the growth, leave the shape
     * - `cubic-bezier(.42,0,.58,.35)` — set the shape, leave the growth (and a curve pasted from a browser)
     * - `1.5 cubic-bezier(…)` — both, which is what this field prints
     *
     * A control with no growth of its own — the bounded editor Colours uses — has no leading number to
     * find, so the whole string is a curve exactly as it always was.
     *
     * → `{ growth, shape }`, either possibly null, or `null` for text that is neither.
     */
    function typedScale(raw) {
      var value = String(raw == null ? "" : raw).trim();
      if (!value) return null;
      if (!B) return null;

      if (!growthKey) {
        var only = B.bezierParse(value, allowOvershoot);
        return only === null ? null : { growth: null, shape: only };
      }

      var at = value.search(/cubic-bezier/i);
      if (at === -1) {
        // No shape in the text at all: a bare number is the growth, and anything else is still offered to
        // the curve parser so a raw coordinate list keeps working.
        if (/^-?\d*\.?\d+$/.test(value)) {
          var n = Number(value);
          return isFinite(n) && n > 0 ? { growth: n, shape: null } : null;
        }
        var loose = B.bezierParse(value, allowOvershoot);
        return loose === null ? null : { growth: null, shape: loose };
      }

      var head = value.slice(0, at).trim();
      var shape = B.bezierParse(value.slice(at), allowOvershoot);
      if (shape === null) return null;
      if (!head) return { growth: null, shape: shape };
      // What precedes the curve has to be *only* a number. Ignoring trailing junk is how a typo becomes a
      // silent half-edit.
      if (!/^-?\d*\.?\d+$/.test(head)) return null;
      var g = Number(head);
      if (!isFinite(g) || g <= 0) return null;
      return { growth: g, shape: shape };
    }

    text.addEventListener("change", function () {
      var typed = typedScale(text.value);
      if (typed === null) {
        wrap.classList.add("config-ui-curve--bad");
        return;
      }
      wrap.classList.remove("config-ui-curve--bad");
      // **Typed, not dragged, so it is not pinned to the canvas.** The handle can only reach
      // `CURVE_GROWTH_MAX`, but that is a property of the drag, not of the scale — a config asking for 4 is
      // honoured and the handle simply sits at the top.
      if (growthKey && typed.growth !== null) setGrowthRatio(Math.round(typed.growth * 1000) / 1000);
      setPoints(typed.shape === null ? wrap.getAttribute("data-curve-value") : typed.shape);
    });
    text.addEventListener("input", function () {
      if (typedScale(text.value) !== null) wrap.classList.remove("config-ui-curve--bad");
    });

    /**
     * Dragging.
     *
     * Pointer events on the `<svg>` rather than on each dot, with `setPointerCapture`, so a fast drag that
     * leaves the 4px circle keeps hold of it. Bound once here rather than per handle, because `draw()`
     * replaces every element on every frame — listeners attached to a dot would be thrown away by the
     * redraw that the drag itself causes.
     */
    var dragging = null;
    function pointAt(evt) {
      var box = svg.getBoundingClientRect();
      if (!box.width || !box.height) return null;
      var vx = ((evt.clientX - box.left) / box.width) * W;
      var vy = ((evt.clientY - box.top) / box.height) * H;
      var at = fromView(vx, vy);
      // The same position in the channel's own units, for whichever of the two things is being dragged.
      at.value = valueFromView(vy);
      return at;
    }
    var draggingGrowth = false;
    var draggingEnd = null;
    var panning = null;
    var dragSmooth = false;
    svg.addEventListener("pointerdown", function (evt) {
      var target = evt.target;
      if (!target || typeof target.getAttribute !== "function") return;
      if (target.getAttribute("data-curve-end")) {
        draggingEnd = target.getAttribute("data-curve-end");
      } else if (target.getAttribute("data-curve-growth")) {
        draggingGrowth = true;
      } else {
        var dot = target.getAttribute("data-curve-index");
        if (dot !== null) {
          /**
           * **What kind of node this is, read once, at the start of the drag.**
           *
           * Read per frame it would flip the moment the first mirrored move made it collinear, and a corner
           * you were pulling apart would snap smooth under the pointer. Read at `pointerdown` it is the
           * state you began with, which is what "keeps it a corner" has to mean.
           *
           * Not stored between drags: the coordinates carry it, and this is a fact about *this* gesture.
           */
          var held = curveValueOf(wrap.getAttribute("data-curve-value"));
          dragSmooth = B ? B.bezierNodeIsSmooth(held) : false;
          // Alt inverts it, the way every vector tool does: break a smooth node, or restore a broken one.
          if (evt.altKey) dragSmooth = !dragSmooth;
        }
        if (dot === null) {
          // **Empty chart with an axis: scroll it.** A tight window has ramp above or below it, and this is
          // how you follow it. It slides the window and never resizes it, so a pan cannot become a zoom.
          var a0 = axis();
          if (!a0) return;
          var w0 = axisView(a0);
          panning = { y: evt.clientY, lo: w0.lo, span: w0.hi - w0.lo };
        } else {
          dragging = parseInt(dot, 10);
        }
      }
      if (svg.setPointerCapture) svg.setPointerCapture(evt.pointerId);
      // **`preventDefault` stops focus moving, so move it deliberately.**
      //
      // Without this the ⓘ beside the label kept focus after it had been clicked or tabbed to, and its
      // tooltip is shown on focus and hidden on blur — so the bubble stayed up for as long as you were
      // working anywhere in the curve, which reads exactly like the whole row being a hover target for it.
      // The handle is `tabindex="0"` already, so it is somewhere focus can legitimately go, and landing
      // there also means the arrow keys work straight after a drag without tabbing back.
      if (target.focus) target.focus();
      evt.preventDefault();
    });
    /**
     * **One update per frame, not one per pointer event.**
     *
     * A trackpad delivers `pointermove` well above 120Hz and the screen paints at 60, so at least half of
     * what a drag used to do was thrown away before anyone saw it — and each one of those redrew this SVG
     * from nothing, redrew every *other* curve on the page, and rewrote the config editor's whole document.
     * Colours felt worst because it has the largest config block and the most curve controls, and those two
     * costs multiply.
     *
     * Coalescing here fixes it at the source: the last position wins, and the work happens once per frame.
     *
     * **Synchronous where there is no `requestAnimationFrame`.** The DOM shim the tests run against has
     * none, and a drag that only lands a frame later is a drag the tests cannot observe. No rAF, no
     * coalescing — which is the honest behaviour rather than a fake one.
     */
    var queuedAt = null;
    var frame = null;
    function applyMove(at) {
      if (draggingEnd) {
        // **The end writes a field, not the curve.** The shape between the ends is untouched by this — it is
        // stored in the curve's own 0..1, so moving an end restretches the same shape over the new span,
        // which is what a palette does when you make it darker.
        setEndValue(draggingEnd, at.value);
        setPoints(wrap.getAttribute("data-curve-value"), { live: true });
        return;
      }
      if (draggingGrowth) {
        setGrowthRatio(curveGrowthRatio(at.y));
        setPoints(wrap.getAttribute("data-curve-value"), { live: true });
        return;
      }
      // **The same points the handle was drawn from, not the raw stored value.** `draw()` positions every
      // handle from `effectivePoints(stored)` — the implied Linear shape when nothing is stored yet, which
      // is the state of every untouched Hue, Saturation or Chroma field. Reading the raw (empty) value here
      // instead indexed into `[]`: `pts[dragging] = at.x` on an empty array produces a one- or two-element
      // result, not a valid four- or ten-number curve, and `curveValueOf`/`bezierNormalise` discards
      // anything that shape on the very next read — so the handle visibly moved for a frame and then the
      // drag, and every frame after it, wrote nothing. Confirmed live: dragging a fresh Hue handle left
      // `hslHueCurve` at `[]` through the whole gesture, settle included.
      var pts = effectivePoints(curveValueOf(wrap.getAttribute("data-curve-value"))).slice();
      // **A shape handle is dragged in the unit square, not on the canvas.** In growth mode the drawing is
      // lifted by the growth, so the pointer's height has to be divided back out or bending a slow-growing
      // scale would fling the handle off the top.
      var lift = growthKey ? curveGrowthHeight(growthRatio()) : 1;
      /**
       * **Middle handle: two jobs depending on whether the channel has a real middle field.**
       *
       * With `ends:a..m..b` (Hue, Chroma, Saturation) the field *is* the colour at the corner and
       * `pts[5]` is only pacing — write the channel value under the pointer into `middle.*`, slide
       * `pts[4]` horizontally, leave `pts[5]` alone. Forcing Y through a single-span map was how a
       * Hue middle of 200° collapsed back onto the ends.
       *
       * With `ends:a..b` only (Lightness) the control's own Middle box *is* the handle: typing
       * already writes `pts[5]`, so the drag must too — otherwise the grip only slides sideways and
       * the number box is the only way to change height (confirmed live on HSL and OKLCH).
       */
      if (dragging === 4 && pts.length === 10) {
        pts[4] = at.x;
        if (typeof window !== "undefined" && window.codefigProbe) {
          window.codefigProbe("curve:drag", {
            field: (field && field.name) || wrap.getAttribute("data-row-field") || null,
            dragging: dragging, at: at, axis: axis(), middleField: true
          });
        }
        if (field.ends && field.ends.mid && at.value != null && isFinite(at.value)) {
          setEndValue("mid", at.value);
        } else {
          pts[5] = lift > 0 ? at.y / lift : at.y;
          if (middleBox && at.value != null && isFinite(at.value)) {
            middleBox.value = String(Math.round(at.value * 10) / 10);
          }
        }
        pts = curveValueOf(pts);
        setPoints(pts, { live: true });
        return;
      }
      pts[dragging] = at.x;
      pts[dragging + 1] = lift > 0 ? at.y / lift : at.y;
      // PROBE: the raw drag input, before it becomes a stored point — `at.y` is what `fromView`
      // converted the pointer position into, dividing through the axis's own `from`/`to`. Catches an
      // amplified drag at its source, distinct from `curve:setPoints` seeing only the result.
      // Skipped during the densest live frames when the tag would only repeat — bridge spam was part
      // of the "sluggish while dragging" feel with `CODEFIG_PROBE` on.
      if (typeof window !== "undefined" && window.codefigProbe) {
        var probeAxis = axis();
        window.codefigProbe("curve:drag", {
          field: (field && field.name) || wrap.getAttribute("data-row-field") || null,
          dragging: dragging, at: at, axis: probeAxis
        });
      }
      /**
       * **A smooth node stays smooth.** The two inner handles are stored independently, so nothing keeps
       * them collinear through the anchor — drag one and the segments still meet at the point but no longer
       * at the tangent, which is the kink Márton measured as a 15% slope discontinuity across the join.
       *
       * Only when the node *was* smooth when the drag began. A curve fitted to a real ramp may hold a
       * genuine corner — lime's file is a plateau with a knee at each end, and forcing smoothness on the
       * fit costs seven of 255 there — so mirroring on touch would destroy the fits the recogniser exists
       * to produce.
       */
      if (dragSmooth && pts.length === 10 && (dragging === 2 || dragging === 6) && B) {
        pts = B.bezierMirrorNode(pts, dragging);
      }
      /**
       * **Normalised before any field reads it.** Tangents still go through `curveValueOf` here so a
       * mid-drag frame cannot seed the next read with an unclamped candidate. The middle-handle path
       * above returns early and does not land here.
       */
      pts = curveValueOf(pts);
      // `keepText` is off: the field is a readout while you drag, and a paste in progress is not a state
      // you can be in and dragging at the same time.
      setPoints(pts, { live: true });
    }
    svg.addEventListener("pointermove", function (evt) {
      if (panning) {
        var a = axis();
        var box = svg.getBoundingClientRect();
        if (!a || !box.height) return;
        var moved = (evt.clientY - panning.y) * (panning.span / box.height);
        var lo = Math.min(a.hi - panning.span, Math.max(a.lo, panning.lo + moved));
        wrap.setAttribute("data-curve-view", lo + "," + (lo + panning.span));
        draw();
        return;
      }
      if (dragging === null && !draggingGrowth && !draggingEnd) return;
      var at = pointAt(evt);
      if (!at) return;
      if (typeof requestAnimationFrame !== "function") { applyMove(at); return; }
      queuedAt = at;
      if (frame !== null) return;
      frame = requestAnimationFrame(function () {
        frame = null;
        var next = queuedAt;
        queuedAt = null;
        if (!next || (dragging === null && !draggingGrowth && !draggingEnd)) return;
        applyMove(next);
      });
    });
    function endDrag(evt) {
      if (panning) {
        panning = null;
        if (svg.releasePointerCapture && evt.pointerId != null) {
          try { svg.releasePointerCapture(evt.pointerId); } catch (err) { /* already gone */ }
        }
        return;
      }
      if (dragging === null && !draggingGrowth && !draggingEnd) return;
      // Land the last position the pointer reached before the frame that would have drawn it, or letting go
      // mid-flick loses up to a frame of movement.
      if (frame !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
      frame = null;
      if (queuedAt) { applyMove(queuedAt); queuedAt = null; }
      dragging = null;
      draggingGrowth = false;
      draggingEnd = null;
      // **The settle.** Everything above was `live` — drawn, but not written through to the config editor.
      // This is the one non-live change of the whole drag, and it is what commits the text.
      setPoints(wrap.getAttribute("data-curve-value"), { keepText: true });
      if (svg.releasePointerCapture && evt.pointerId != null) {
        try { svg.releasePointerCapture(evt.pointerId); } catch (err) { /* already gone */ }
      }
    }
    svg.addEventListener("pointerup", endDrag);
    svg.addEventListener("pointercancel", endDrag);

    // Typing in the middle box moves the anchor. The other direction is in `draw`, so the two cannot get
    // out of step: there is one value and both of these are views of it.
    if (middleBox) {
      middleBox.addEventListener("input", function () {
        var a = axis();
        if (!a) return;
        var typed = parseFloat(String(middleBox.value).replace(/[^\d.\-]/g, ""), 10);
        if (!isFinite(typed)) return;
        var pts = curveValueOf(wrap.getAttribute("data-curve-value")).slice();
        if (pts.length !== 10) return;
        // Lightness-style middle box *is* the curve's corner in channel units — still a single fact,
        // mapped through the two-segment axis when ends differ, or valueToUnit when they don't share a
        // separate colour middle field.
        if (curveHasRealMiddle() && field.ends && field.ends.mid) {
          ensureMidInView(typed);
          draw();
          return;
        }
        if (a.to === a.from) return;
        pts[5] = Math.min(1, Math.max(0, valueToUnit(a, typed)));
        setPoints(pts, { keepText: true });
      });
    }

    /**
     * **The marker is the zoom, and it is the only thing that is.**
     *
     * Not the gradient beside it, which takes no input, and not the curve — dragging an end or a handle
     * cannot change where you are looking from. Bottom of the track is pulled all the way back, top is as
     * close as it goes.
     */
    if (zoomMark && zoomTrack) {
      var zoomDragging = false;
      var zoomBox = null;
      // Same coalescing as the shape handle above: a trackpad's pointermove outruns paint, and each one of
      // these used to force a layout read (`getBoundingClientRect`) *and* a full `draw()` teardown/rebuild.
      // The rect is read once, on `pointerdown` — it does not move while a drag holding it is in progress.
      var zoomFrame = null;
      var zoomQueuedF = null;
      function applyZoom(f) {
        setZoom(CURVE_ZOOM_MIN * Math.pow(CURVE_ZOOM_MAX / CURVE_ZOOM_MIN, f));
      }
      zoomMark.addEventListener("pointerdown", function (evt) {
        zoomDragging = true;
        zoomBox = zoomTrack.getBoundingClientRect();
        if (zoomMark.setPointerCapture) zoomMark.setPointerCapture(evt.pointerId);
        if (zoomMark.focus) zoomMark.focus();
        evt.preventDefault();
        evt.stopPropagation();
      });
      zoomMark.addEventListener("pointermove", function (evt) {
        if (!zoomDragging || !zoomBox || !zoomBox.height) return;
        var f = 1 - Math.min(1, Math.max(0, (evt.clientY - zoomBox.top) / zoomBox.height));
        if (typeof requestAnimationFrame !== "function") { applyZoom(f); return; }
        zoomQueuedF = f;
        if (zoomFrame !== null) return;
        zoomFrame = requestAnimationFrame(function () {
          zoomFrame = null;
          if (zoomQueuedF !== null) { applyZoom(zoomQueuedF); zoomQueuedF = null; }
        });
      });
      function zoomRelease(evt) {
        if (!zoomDragging) return;
        zoomDragging = false;
        zoomBox = null;
        if (zoomFrame !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(zoomFrame);
        zoomFrame = null;
        if (zoomQueuedF !== null) { applyZoom(zoomQueuedF); zoomQueuedF = null; }
        if (zoomMark.releasePointerCapture && evt.pointerId != null) {
          try { zoomMark.releasePointerCapture(evt.pointerId); } catch (err) { /* already gone */ }
        }
      }
      zoomMark.addEventListener("pointerup", zoomRelease);
      zoomMark.addEventListener("pointercancel", zoomRelease);
      zoomMark.addEventListener("keydown", function (evt) {
        var a = axis();
        if (!a) return;
        if (evt.key === "ArrowUp") setZoom(zoomOf(a) * 1.3);
        else if (evt.key === "ArrowDown") setZoom(zoomOf(a) / 1.3);
        else return;
        evt.preventDefault();
      });
      wrap.addEventListener("click", function (evt) {
        var step = evt.target && typeof evt.target.closest === "function"
          ? evt.target.closest("[data-curve-zoom]") : null;
        if (!step) return;
        var a = axis();
        if (!a) return;
        setZoom(step.getAttribute("data-curve-zoom") === "in" ? zoomOf(a) * 1.6 : zoomOf(a) / 1.6);
      });
    }


    // Arrow keys on a focused handle: 1% a press, 10% with shift. The canvas is a few hundred pixels wide,
    // so a coordinate cannot otherwise be set exactly — which is the whole of "precise" in this control.
    svg.addEventListener("keydown", function (evt) {
      var el = evt.target;
      if (!el || typeof el.getAttribute !== "function") return;
      var dx = evt.key === "ArrowLeft" ? -1 : evt.key === "ArrowRight" ? 1 : 0;
      var dy = evt.key === "ArrowDown" ? -1 : evt.key === "ArrowUp" ? 1 : 0;
      if (!dx && !dy) return;

      if (el.getAttribute("data-curve-growth")) {
        // A hundredth of a ratio a press, a tenth with shift — the precision the dropdown never had, which
        // is the reason this replaced it.
        evt.preventDefault();
        var current = growthRatio();
        if (current === null) return;
        var next = Math.round((current + dy * (evt.shiftKey ? 0.1 : 0.01)) * 1000) / 1000;
        setGrowthRatio(next < CURVE_GROWTH_MIN ? CURVE_GROWTH_MIN : next);
        setPoints(wrap.getAttribute("data-curve-value"));
        var backTo = svg.querySelector("[data-curve-growth]");
        if (backTo && backTo.focus) backTo.focus();
        return;
      }

      var index = el.getAttribute("data-curve-index");
      if (index === null) return;
      evt.preventDefault();
      var by = (evt.shiftKey ? 0.1 : 0.01);
      var pts = curveValueOf(wrap.getAttribute("data-curve-value")).slice();
      var i = parseInt(index, 10);
      pts[i] += dx * by;
      pts[i + 1] += dy * by;
      setPoints(pts);
      // The redraw replaced the element the focus was on, so it is put back by index.
      var again = svg.querySelector('[data-curve-index="' + i + '"]');
      if (again && again.focus) again.focus();
    });

    /**
     * **Redraw against the form around it.**
     *
     * `buildCurveControl` runs before its wrapper is in the tree, so at first draw `closest` finds no row
     * and the growth handle has no ratio to read — the plot came up flat whatever the config said. And the
     * ratio is editable from the number field beside the plot as well as from the handle, so the picture
     * has to be re-derived whenever anything changes rather than only when the curve itself is touched.
     *
     * Both are the same fix: re-run the draw on a signal the form sends after it is assembled and after
     * every change. Quiet, so redrawing never looks like an edit.
     *
     * **Also where a pending estimate resolves.** `estimate` was read once, at build time, from
     * whatever baseline existed then — for a cell awaiting its own first fit, that was nothing. The host
     * publishes the new one into the same map this control already reads (`curveBaselineFor`), then fires
     * this same signal (`applyQuickFit`, `src/ui.html`) — so re-reading it here, on every refresh rather
     * than only for a cell that was waiting, is what lets the answer reach a value that has to be asked
     * for after the control was already built, not only a value redrawn after a change already known.
     */
    wrap.addEventListener("config-ui-curve-refresh", function () {
      estimate = curveBaselineFor(baselineKey);
      if (awaitingEstimate && estimate) clearEstimateWait(false);
      setPoints(wrap.getAttribute("data-curve-value"), { quiet: true });
    });

    setPoints(points, { quiet: true });

    /**
     * **Redraw when the plot's size changes, because the geometry is in pixels now.**
     *
     * The first draw happens before the wrapper is in the tree, so it measures nothing and falls back to a
     * stretched unit square. The refresh after `attachListeners` usually fixes that — but a curve inside a
     * hidden `@showWhen` block has no size then either, and nothing redraws it when the block appears. The
     * result is a chart drawn at 100x100 and stretched to 268x190, which is the ellipse bug back again in
     * the one place hardest to notice.
     *
     * Guarded, because the DOM shim the tests and the style reference run against has no `ResizeObserver`
     * and must not acquire one by accident.
     */
    if (field.ends && typeof ResizeObserver === "function") {
      var lastW = 0, lastH = 0;
      var watch = new ResizeObserver(function (entries) {
        var box = entries[0] && entries[0].contentRect;
        if (!box || box.width < 2 || box.height < 2) return;
        if (Math.abs(box.width - lastW) < 1 && Math.abs(box.height - lastH) < 1) return;
        lastW = box.width;
        lastH = box.height;
        draw();
      });
      watch.observe(plot);
    }

    return wrap;
  }

  /**
   * Tell every curve in `root` to re-read the form around it. Cheap, and idempotent.
   *
   * **Except the one being typed into.** The refresh rewrites the readout from the stored ratio, and it runs
   * on `input` — so every keystroke in a curve's own field was overwritten before the field's `change`
   * handler ever saw it, and typing a growth was impossible. A control manages its own edits; this is for
   * telling it that something *else* moved.
   */
  /**
   * Does a condition's value list accept what a control currently reads?
   *
   * **`*` means "anything, as long as it is something".** Every other value is an exact match, which is
   * right for a radio or a select but cannot express *"once a collection has been chosen"* — the name is
   * whatever the file calls it. Colours needs that to keep the panel empty below General until the address
   * is real, rather than drawing a placeholder ramp for a collection nobody has picked.
   *
   * One function, because the same question is asked in four places — field rows, headings, row cells and
   * the disabled state — and a vocabulary that means different things in each is worse than none.
   */
  function conditionAccepts(values, current) {
    if (!values || !values.length) return true;
    if (values.indexOf("*") !== -1) return String(current == null ? "" : current) !== "";
    return values.indexOf(current) !== -1;
  }

  /**
   * **A group with nothing left in it is not a caption, it is nothing.**
   *
   * Two ways a group empties out, both ordinary and both leaving a labelled blank behind:
   *
   * - Every part is conditional on the other model. On OKLCH a mode's Lightness cell holds only
   *   `{colorModel=hsl}` parts — the ladder is the collection's — so the tab drew "Bright" and "Dark" over
   *   two boxes that were not there.
   * - A charted curve **adopted** the parts. The collection's own Lightness is exactly this: its two numbers
   *   move under the chart, and the field row they came from is left holding a label and an ⓘ.
   *
   * Called from both `applyVisibility` and `refreshCurveControls`, because those are the two passes that
   * empty one and they run in that order — swept only by the first, an adopted group stays visible until
   * something else changes, which is a label that appears on load and vanishes on the next keystroke.
   *
   * Asked of the parts every time rather than recorded when one is hidden: the group is the answer to "is
   * there anything to set here", and it has to survive an adoption that no condition triggered.
   */
  function hideEmptyGroups(root) {
    if (!root || typeof root.querySelectorAll !== "function") return;
    root.querySelectorAll(".config-ui-rows-group").forEach(function (group) {
      var parts = group.querySelectorAll(".config-ui-rows-group-part");
      var any = false;
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].style.display !== "none") { any = true; break; }
      }
      var box = group.closest
        ? (group.closest(".config-ui-rows-cell") || group.closest(".config-ui-row--field")) : null;
      if (box) box.style.display = any ? "" : "none";
    });
  }

  /**
   * **A tab with nothing in it is not a tab, and a tab's name can depend on the model.**
   *
   * Both are read off the panel on every pass rather than recorded. Under OKLCH a mode's *Lightness* holds
   * only `{colorModel=hsl}` cells — the ladder is the collection's — so the tab was a heading over an empty
   * box; and *Saturation* is *Chroma* in OKLCH, which is a different quantity in different units and not a
   * synonym. Naming the panel by the caption instead would rename it under the attribute that tracks which
   * tab is open, so the key stays the first name and only the caption moves.
   *
   * If the open tab is the one that goes, the first surviving tab opens — otherwise switching model leaves
   * a row with every panel closed, which reads as a block that failed to render.
   */
  function refreshRowTabs(root, holds) {
    if (!root || typeof root.querySelectorAll !== "function") return;
    root.querySelectorAll(".config-ui-rows-item").forEach(function (item) {
      var buttons = item.querySelectorAll("[data-rows-tab]");
      if (!buttons.length) return;
      var open = item.getAttribute("data-rows-tab-open");
      var firstLive = null, openLives = false;
      buttons.forEach(function (button) {
        var key = button.getAttribute("data-rows-tab");
        var panel = item.querySelector('[data-rows-tabpanel="' + key + '"]');

        var names = button.getAttribute("data-rows-tab-names");
        if (names && holds) {
          var alts = [];
          try { alts = JSON.parse(names); } catch (e) { alts = []; }
          for (var a = 0; a < alts.length; a++) {
            if (alts[a].showWhen && !holds(item, alts[a].showWhen)) continue;
            if (button.textContent !== alts[a].text) button.textContent = alts[a].text;
            break;
          }
        }

        var live = !!panel && panelHasContent(panel);
        button.style.display = live ? "" : "none";
        if (!live && panel) panel.setAttribute("data-shown", "false");
        if (live && !firstLive) firstLive = key;
        if (live && key === open) openLives = true;
      });
      if (!openLives && firstLive) showRowTab(item, firstLive);
    });
  }

  /** Anything in this panel a person could see. A cell its condition hid does not count. */
  function panelHasContent(panel) {
    var kids = panel.children || [];
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].style.display !== "none") return true;
    }
    return false;
  }

  function refreshCurveControls(root, except) {
    if (!root || typeof root.querySelectorAll !== "function") return;
    root.querySelectorAll("[data-curve-value]").forEach(function (wrap) {
      if (except && typeof wrap.contains === "function" && wrap.contains(except)) return;
      if (except && wrap === except) return;
      wrap.dispatchEvent(new Event("config-ui-curve-refresh"));
    });
    hideEmptyGroups(root);
  }

  /**
   * Show one of a row's tabs and hide the rest.
   *
   * The open tab is written on the row rather than held in a closure, so `attachListeners` can switch it
   * with a delegated click and a redraw can read back which one was showing. Panels are hidden with an
   * attribute rather than removed: `collectRows` sweeps every cell in the row, and a channel whose tab is
   * closed must still be read — otherwise switching tabs would blank the two you cannot see.
   */
  function showRowTab(rowEl, name) {
    if (!rowEl || !name) return;
    rowEl.setAttribute("data-rows-tab-open", name);
    rowEl.querySelectorAll("[data-rows-tabpanel]").forEach(function (panel) {
      panel.setAttribute("data-shown", panel.getAttribute("data-rows-tabpanel") === name ? "true" : "false");
    });
    rowEl.querySelectorAll("[data-rows-tab]").forEach(function (button) {
      button.setAttribute("aria-selected", button.getAttribute("data-rows-tab") === name ? "true" : "false");
    });
  }

  function buildRowsControl(field, rows) {
    var wrap = document.createElement("div");
    // Three displays, one control. `--blocks` shows every row in full, one under the next, each titled —
    // which is what a ramp needs, because two ramps you want to compare have to be on one page.
    wrap.className = "config-ui-rows" +
      (field.tabs ? " config-ui-rows--tabs" : "") +
      (field.blocks ? " config-ui-rows--blocks" : "");
    wrap.setAttribute("data-rows-field", field.name);

    var body = document.createElement("div");
    body.className = "config-ui-rows-body";

    var tabBar = null;
    if (field.tabs) {
      tabBar = document.createElement("div");
      tabBar.className = "config-ui-rows-tabs";
      wrap.appendChild(tabBar);
    }
    wrap.appendChild(body);

    function rowLabel(row, index) {
      var named = row && row.name;
      return (typeof named === "string" && named.trim()) ? named : "Row " + (index + 1);
    }

    function selectTab(index) {
      if (!field.tabs) return;
      body.querySelectorAll(".config-ui-rows-item").forEach(function (el, i) {
        el.style.display = i === index ? "" : "none";
      });
      tabBar.querySelectorAll(".config-ui-rows-tab").forEach(function (el, i) {
        el.classList.toggle("is-active", i === index);
      });
    }

    /** Rebuilt rather than patched: a row's index is in its tab label and its remove handler. */
    function draw(list, active) {
      body.innerHTML = "";
      if (tabBar) tabBar.innerHTML = "";

      list.forEach(function (row, index) {
        var rowEl = document.createElement("div");
        // A block reads as a form for the same reason a tab does: one labelled field per line. The flat
        // strip of cells is only right when rows are stacked *and being compared*, which is the table.
        rowEl.className = (field.tabs || field.blocks)
          ? "config-ui-rows-item config-ui-rows-item--stacked"
          : "config-ui-rows-item";
        rowEl.setAttribute("data-row-index", String(index));

        // "Mode **Granite**" — the word is the kind of thing and the name is which one, so the name is the
        // half that carries the weight. Under `@tabs` the tab strip does this job; in the table there is no
        // room for it. Drawn by the control, because there is no comment per row for the parser to have read.
        //
        // The word comes from the **`name` column's own label** — `name:text=Mode` says "Mode" — not from
        // depluralising the field's. Chopping a trailing `s` off *Modes* works and off *Radius* does not, and
        // the right word is already written down one line away.
        if (field.blocks) {
          var title = document.createElement("div");
          title.className = "config-ui-rows-item-title";
          var kind = null;
          (field.columns || []).forEach(function (column) {
            if (column.key === "name" && column.label) kind = column.label;
          });
          title.textContent = kind ? kind + " " : "";
          var named = document.createElement("span");
          named.className = "config-ui-rows-item-title-name";
          named.textContent = rowLabel(row, index);
          title.appendChild(named);

          /**
           * **Collapse, and where its state lives.**
           *
           * On the title row as the frame draws it, and collapsed shows the title and the strip only — the
           * strip because that is the thing you scan a list of modes *for*.
           *
           * The state is a class on the item and nothing else: it is a fact about the sitting, not about the
           * config, so it is never written to the block. The starting position is **derived** — a mode that
           * already has a name came from the collection and starts collapsed, an unnamed one is the block you
           * are filling in and starts open. No flag, no stored default.
           */
          var chevron = document.createElement("button");
          chevron.type = "button";
          chevron.className = "config-ui-rows-collapse";
          chevron.setAttribute("aria-expanded", "true");
          chevron.setAttribute("data-rows-collapse", String(index));
          /**
           * **Márton's own chevron, from node 2112:11828.** Two text glyphs came before this and neither was
           * right: `\u2304` rendered as a thin undersized caret, and `\u25be` is a filled triangle where the
           * design is a stroked chevron. A drawn icon settles both the shape and the size — a 20px box with an
           * 8\u00d74 stroke through the middle, which is the frame's geometry exactly.
           *
           * `currentColor` rather than the frame's `#666666`, so it takes the panel's own text colour and
           * follows the hover the other functional icons have. Flipped for the open state the way the frame
           * flips it, and the *direction says where the block will go*: down to open, up to close.
           */
          function setChevron(closed) {
            chevron.innerHTML = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" ' +
              'aria-hidden="true" focusable="false"' +
              (closed ? "" : ' style="transform:scaleY(-1)"') + '>' +
              '<path d="M6 8L10 12L14 8" stroke="currentColor" stroke-width="1.33333" ' +
              'stroke-linecap="round" stroke-linejoin="round"/></svg>';
            chevron.setAttribute("aria-expanded", closed ? "false" : "true");
            chevron.setAttribute("aria-label", (closed ? "Expand " : "Collapse ") + rowLabel(row, index));
          }
          chevron.addEventListener("click", function () {
            setChevron(rowEl.classList.toggle("is-collapsed"));
          });
          title.appendChild(chevron);
          var startsClosed = !!(row && typeof row === "object" &&
            typeof row.name === "string" && row.name.trim());
          if (startsClosed) rowEl.classList.add("is-collapsed");
          setChevron(startsClosed);
          rowEl.appendChild(title);
        }

        /**
         * **A tab is a section you can only see one of**, so it is built out of the same pieces.
         *
         * `#>Hue` opens a panel; everything after it lands in that panel instead of in the row, until the
         * next `#>`. The bar is created once, at the first one. Nothing else in the loop changes — the
         * cells do not know they are in a tab, which is what keeps `collectRows` reading all of them
         * whether their panel is showing or not.
         */
        var channelBar = null;
        var tabPanel = null;
        var tabNames = [];
        function placeIn() { return tabPanel || rowEl; }

        var tabRunEnd = 0;
        (field.columns || []).forEach(function (column, at) {
          if (column.type === "tab") {
            if (at < tabRunEnd) return; // already folded into the run that started above
            /**
             * **Two tabs written next to each other are one tab under two names.** HSL calls the channel
             * Saturation and OKLCH calls it Chroma, and the columns beneath already carry that split one
             * condition at a time — so the tab does too, rather than the panel being duplicated.
             *
             * The *key* is the first name and never changes; only the caption follows the condition.
             * Keying the panel by the visible name instead would rename it under the open-tab attribute
             * that tracks it, and switching model would close the tab you were looking at.
             */
            var alts = [column];
            var next = at + 1;
            while ((field.columns[next] || {}).type === "tab") { alts.push(field.columns[next]); next++; }
            tabRunEnd = next;

            if (!channelBar) {
              channelBar = document.createElement("div");
              channelBar.className = "config-ui-rows-channels";
              rowEl.appendChild(channelBar);
            }
            var tabButton = document.createElement("button");
            tabButton.type = "button";
            tabButton.className = "config-ui-rows-channel";
            tabButton.setAttribute("data-rows-tab", alts[0].text);
            tabButton.textContent = alts[0].text;
            if (alts.length > 1) {
              tabButton.setAttribute("data-rows-tab-names", JSON.stringify(alts.map(function (t) {
                return { text: t.text, showWhen: t.showWhen || null };
              })));
            }
            channelBar.appendChild(tabButton);
            tabPanel = document.createElement("div");
            tabPanel.className = "config-ui-rows-tabpanel";
            tabPanel.setAttribute("data-rows-tabpanel", alts[0].text);
            // Plan 29 in-rows identity: `[data-section="hue"]` must match the Hue tabpanel,
            // not only the outer Modes `@rows` wrapper. Same slug helper as form headings.
            tabPanel.setAttribute("data-section", sectionSlug(alts[0].text));
            rowEl.appendChild(tabPanel);
            tabNames.push(alts[0].text);
            return;
          }
          // `#Seed` among the columns: the same `h2.config-ui-heading` the form builds from a `// ## Heading`
          // line, so the size ladder is the form's rather than a second one invented here. It groups *rows*,
          // where a nested column groups *cells* — two jobs, and this is the one that already had a
          // mechanism.
          // The per-row preview slot. Filled by the panel the same way the section-level one is — the
          // renderer marks where it goes and never computes what is in it, because computing it needs a run.
          if (column.type === "preview") {
            var slot = document.createElement("div");
            slot.className = "config-ui-rows-preview";
            slot.setAttribute("data-preview-slot", "true");
            // **Keyed by index, not by name.** `rowLabel` falls back to "Row 1" for an unnamed entry while the
            // preview knows that mode as `""`, so the two sides disagreed the moment the shipped default became
            // an empty block — and the strips silently vanished. An index is the same on both sides whatever
            // the entry is called. The name rides along for diagnosis only.
            slot.setAttribute("data-preview-row", String(index));
            slot.setAttribute("data-preview-name", rowLabel(row, index));
            /**
             * **The strip is the mode's, never a channel's.** It shows the colours the mode generates, and
             * those do not change with which channel you happen to be looking at. Left to fall into the
             * current tab it landed in whichever one was declared last — so it appeared under Lightness and
             * vanished on Hue and Saturation, which is how Márton found it.
             */
            rowEl.appendChild(slot);
            return;
          }
          if (column.type === "heading") {
            var sub = document.createElement(configHeadingTag(column.level || 2));
            sub.className = "config-ui-heading";
            sub.textContent = column.text;
            // A heading left standing over a section its condition has hidden reads as a failed render.
            if (column.showWhen) {
              sub.setAttribute("data-row-show-when", JSON.stringify(column.showWhen));
            }
            placeIn().appendChild(sub);
            return;
          }
          // Under `@tabs` the row's `name` **is** the tab, so it is not also a field. Renaming happens
          // on the chips, which is the only rename affordance — a second one here would be a second
          // place to do the same thing, and the two could disagree.
          //
          // **Under `@blocks` the title does that job**, and the same reasoning applies: the block already
          // says *Mode  Ash* across its top, so a control underneath repeating it is the second place. It
          // was a dropdown of the collection's modes, which also let a block point at a mode that is not in
          // the file, or two blocks point at one mode — states the name-keyed fill has no answer for.
          // `collectRows` starts each row from the value it already had and only overwrites what it finds a
          // control for, so a column with no control keeps its name rather than losing it.
          if ((field.tabs || field.blocks) && column.key === "name") return;
          // A radio cell is a `div`, every other cell a `label`. A `label` wrapping a radio group is
          // nested labels: clicking anywhere in the cell — the caption included — would activate the
          // outer label's first labelable descendant, which is the first radio. So the caption would
          // silently reset the scale type to Modular.
          // A radio cell is a `div`, and so is a group: both contain labels of their own, and a `label`
          // wrapping them would make clicking the group's caption focus its first input.
          // **An ⓘ makes it a `div` too, and so does a curve.** A `<button>` is a labelable element, so a
          // caption carrying an ⓘ becomes the label's control — and then clicking *anywhere in the cell*
          // fires a synthetic click on it, which is what pins the tooltip open. It reads exactly like the
          // whole row being a hover target for the explanation, and no amount of fiddling with the hover
          // handlers touches it, because it was never hover. Same shape as the radio bug above, arriving
          // through a different labelable element.
          //
          // A curve is a `div` for the same reason: its preset `<select>` would otherwise be the control,
          // so clicking the plot would drop the dropdown open.
          var cellHasInfo = tipBlocks(column, null).length > 0;
          var cell = document.createElement(
            (column.type === "radio" || column.type === "group" || column.type === "curve" || cellHasInfo)
              ? "div" : "label"
          );
          // With `@tabs` or `@blocks` a row is shown on its own, so its fields read as a form — one labelled
          // field per line, as the frames show — rather than as a horizontal strip of cells, which is the
          // right shape only in the table, where rows are side by side and being compared.
          //
          // **`@blocks` was missing here** while the *item* above already had it, so every cell in a block
          // fell back to the table form: labels shoved to the right edge, fields at 1229px, and a layout
          // nothing in the design asks for. Two lines that have to agree, one of them updated — which is why
          // `layout` is now read back through the bridge rather than trusted.
          cell.className = (field.tabs || field.blocks)
            ? "config-ui-rows-cell config-ui-rows-cell--stacked"
            : "config-ui-rows-cell";
          // A group's captions sit above its inputs, so the row is taller than a plain cell and the label
          // has to line up with the *fields* rather than with the middle of the pair — centred, it floats
          // between the caption and the input and reads as belonging to neither.
          if (column.type === "group") cell.className += " config-ui-rows-cell--group";
          /**
           * **A charted curve is the width of the block, not the width of a field.**
           *
           * Every other control in a stacked cell sits in the right-hand column of a label/control grid,
           * which is right for a dropdown and wrong for a chart: it left the plot 268px wide and indented
           * 292px, above a swatch strip running the full 944. The same eleven steps, drawn twice, to two
           * different widths. The cell says so and the stylesheet lets the chart out of the column.
           */
          if (column.type === "curve" && column.ends) {
            cell.className += " config-ui-rows-cell--charted";
          }
          // A column can depend on another column **in the same row**: a modular scale needs a ratio,
          // a metric one needs a step, and showing both leaves half of every tab inert. The condition
          // travels on the cell, and is evaluated against that row's own values rather than the form's
          // — two modes on two tabs can be using different scale types at the same time.
          if (column.showWhen) {
            cell.setAttribute("data-row-show-when", JSON.stringify(column.showWhen));
          }
          // Inert rather than absent — the value is real and worth reading, it just is not in play yet.
          if (column.disabledWhen) {
            cell.setAttribute("data-row-disabled-when", JSON.stringify(column.disabledWhen));
          }
          if (column.disabledNote) {
            cell.setAttribute("data-row-disabled-note", column.disabledNote);
          }
          var caption = document.createElement("span");
          caption.className = "config-ui-rows-cell-label";
          caption.textContent = column.label;
          // A column's own `@helper:`, on the ⓘ beside its caption. A cell is the narrowest thing in
          // the panel and a note under it used to set the width of the whole column.
          attachInfo(caption, column, null);
          cell.appendChild(caption);
          cell.appendChild(buildRowCell(
            column, row ? row[column.key] : undefined,
            "config-ui-row-radio-" + field.name + "-" + index + "-" + column.key,
            "",
            // **The whole row, for a curve that owns two keys.** A growth curve holds the shape *and* the
            // growth, and the growth lives under a name of its own in the config so the block stays
            // readable — so the control has to be handed the row to find its starting value.
            row,
            // The path the host publishes its fitted curves under, which is the only thing that tells one
            // mode's curve from another's.
            field.name + "[" + index + "]." + column.key
          ));
          // A column can carry its own `@helper:` now. `.config-ui-field-note` is `grid-column: 2`, so in
          // a `--stacked` cell — which is a 3fr/7fr grid — it lands under the control it explains rather
          // than under the row, which is where a sibling of the cell would put it. That is the shape the
          // Colors prototype used by hand, and closing this gap is what lets the shipped block carry the
          // *Lock seed* copy instead of the mockup carrying it.
          placeIn().appendChild(cell);
        });

        // No Remove under `@tabs`: the chips above manage the modes, and two places to remove one is one too
        // many. `@blocks` keeps it — the frames show Add and no Remove, but they also never draw the state
        // where you added a block by mistake, and Add without Remove is a one-way door. Safe either way,
        // because this removes a *config* entry and nothing reaches the document until Run.
        var remove = (field.tabs || field.membershipFromChips) ? null : document.createElement("button");
        if (remove) {
        remove.type = "button";
        // **In a block, a small affordance rather than a full-width button.** No frame has a Remove at all;
        // the capability still has to exist, because Add without it is a one-way door, but a bar the width of
        // the panel competes with Add for attention and reads as the primary action of the block. So under
        // `@blocks` it is a `×` beside the block's own title, where it is about *this* block.
        remove.className = field.blocks
          ? "config-ui-rows-remove config-ui-rows-remove--block"
          : "config-ui-rows-remove";
        remove.textContent = field.blocks ? "\u00d7" : "Remove";
        if (field.blocks) remove.setAttribute("aria-label", "Remove this " + (rowLabel(row, index) || "entry"));
        // Remove-then-add is how a row is replaced, so removal needs no confirmation here — this
        // control edits a config, and nothing reaches the document until the script runs.
        remove.addEventListener("click", function () {
          var next = collectRows(wrap, field);
          next.splice(index, 1);
          draw(next, Math.max(0, Math.min(index, next.length - 1)));
          wrap.dispatchEvent(new Event("change", { bubbles: true }));
        });
        // Into the title row when there is one, so it sits with the thing it removes rather than at the far
        // end of a block that is now several hundred pixels tall.
        var titleRow = field.blocks ? rowEl.querySelector(".config-ui-rows-item-title") : null;
        if (titleRow) titleRow.appendChild(remove); else rowEl.appendChild(remove);
      }
        /**
         * **Which tab is open** — the last one declared.
         *
         * A genuine piece of user state: nothing else in the form records which channel you were looking
         * at, so unlike the panel's other display decisions it cannot be re-derived. It lives on the row,
         * so two mode blocks can be open on different channels.
         *
         * The last rather than the first, because Márton's bar reads Hue, Saturation, Lightness and the
         * frame that shows the panel at rest has Lightness selected — a ramp is mostly about its lightness,
         * and the other two are adjustments to it.
         */
        if (tabNames.length) {
          showRowTab(rowEl, tabNames[tabNames.length - 1]);
        }
        // **A charted row is narrower than it looks.** The plot stops short of the row's right edge by the
        // two columns beside it, so anything meant to line up with the *chart* — the strip of swatches most
        // of all, which is the same steps seen a second way — has to reserve the same width. Márton spotted
        // the ramp and the chart not sharing an edge.
        if ((field.columns || []).some(function (c) { return c.type === "curve" && c.ends; })) {
          rowEl.setAttribute("data-rows-charted", "true");
        }
        body.appendChild(rowEl);

        if (tabBar) {
          var tab = document.createElement("button");
          tab.type = "button";
          tab.className = "config-ui-rows-tab";
          tab.textContent = rowLabel(row, index);
              tab.addEventListener("click", function () {
            selectTab(index);
            // The preview follows the tab, so switching one is a change worth announcing.
            wrap.dispatchEvent(new Event("change", { bubbles: true }));
          });
          tabBar.appendChild(tab);
        }
      });

      // The chips above are the mode list, so Add does not belong here — two places to add a mode is one too
      // many. `@tabs` has always had chips; `@blocks` has them now, and the test is the chips rather than the
      // display, because it is the chips that make Add redundant.
      if (field.tabs) selectTab(typeof active === "number" ? active : 0);
      if (field.tabs || field.membershipFromChips) return;

      var add = document.createElement("button");
      add.type = "button";
      add.className = "config-ui-rows-add";
      add.textContent = "Add";
      add.addEventListener("click", function () {
        var next = collectRows(wrap, field);
        var blank = {};
        (field.columns || []).forEach(function (column) {
          // `#Seed` among the columns: the same `h2.config-ui-heading` the form builds from a `// ## Heading`
          // line, so the size ladder is the form's rather than a second one invented here. It groups *rows*,
          // where a nested column groups *cells* — two jobs, and this is the one that already had a
          // mechanism.
          // The per-row preview slot. Filled by the panel the same way the section-level one is — the
          // renderer marks where it goes and never computes what is in it, because computing it needs a run.
          if (column.type === "preview") {
            var slot = document.createElement("div");
            slot.className = "config-ui-rows-preview";
            slot.setAttribute("data-preview-slot", "true");
            // **Keyed by index, not by name.** `rowLabel` falls back to "Row 1" for an unnamed entry while the
            // preview knows that mode as `""`, so the two sides disagreed the moment the shipped default became
            // an empty block — and the strips silently vanished. An index is the same on both sides whatever
            // the entry is called. The name rides along for diagnosis only.
            slot.setAttribute("data-preview-row", String(index));
            slot.setAttribute("data-preview-name", rowLabel(row, index));
            rowEl.appendChild(slot);
            return;
          }
          if (column.type === "heading") {
            var sub = document.createElement(configHeadingTag(column.level || 2));
            sub.className = "config-ui-heading";
            sub.textContent = column.text;
            // A heading left standing over a section its condition has hidden reads as a failed render.
            if (column.showWhen) {
              sub.setAttribute("data-row-show-when", JSON.stringify(column.showWhen));
            }
            rowEl.appendChild(sub);
            return;
          }
          blank[column.key] = column.type === "number" ? 0
            : column.type === "checkbox" ? false
            : (column.type === "select" || column.type === "radio")
              ? ((column.options || []).length ? p.columnOptionValue(column.options[0]) : "")
            : "";
        });
        next.push(blank);
        draw(next, next.length - 1);
        wrap.dispatchEvent(new Event("change", { bubbles: true }));
      });
      body.appendChild(add);

      if (field.tabs) selectTab(typeof active === "number" ? active : 0);
    }

    draw(rows, 0);
    return wrap;
  }

  /**
   * A nested group: `bright:{hue:number=Hue|chroma:number=Chroma}=Bright`.
   *
   * The group's own label goes in the cell's label column, the same as any other; the parts sit in the
   * control column, each captioned, at a number's own width. That is what the Colors frames draw for an
   * anchor — one thing you set, two numbers you set it with — and it is why the config nests rather than
   * carrying six flat keys with an annotation explaining which belong together.
   *
   * Each part's `data-row-field` is `group.part`, so `collectRows` can find it without two groups that
   * both hold a `hue` colliding on whichever came first.
   */
  /**
   * `oklch:OKLCH` → the value half, and the label half.
   *
   * **A column option has always been able to carry its own label** (`1.618:1.618 Golden ratio`), and a field
   * option could not — the same spelling meant two different things depending on where in the annotation you
   * wrote it. So `colorModel: "oklch"` with `@options: oklch:OKLCH|hsl:HSL` matched neither radio, nothing
   * was checked, and the two sections gated on it with `@showWhen` were invisible. Nothing said so: an
   * unchecked radio group is a legal thing for a form to show.
   *
   * Split here rather than in the parser, so `field.options` keeps the strings the block wrote and
   * serialization round-trips untouched. A bare option is its own label, exactly as before — and no shipped
   * script had a colon in a field-level option list, so nothing changes meaning.
   */
  function fieldOptionValue(option) {
    var text = String(option);
    var at = text.indexOf(":");
    return at === -1 ? text : text.slice(0, at).trim();
  }

  function fieldOptionLabel(option) {
    var text = String(option);
    var at = text.indexOf(":");
    return at === -1 ? text : text.slice(at + 1).trim();
  }

  function buildRowGroup(column, value, groupName) {
    var wrap = document.createElement("span");
    wrap.className = "config-ui-rows-group";
    // Only a *field*-level group is addressable on its own: a group inside a `@rows` row is read by
    // `collectRows` along with the rest of its row, and marking it here would have `getValues` collect it
    // twice — once as a row and once as a top-level key that does not exist in the config.
    if (!column.key && column.name) wrap.setAttribute("data-group-field", column.name);
    // Plan 29 identity for stylesheets — additive; collectors still use data-group-field / row paths.
    wrap.setAttribute("data-type", "group");
    var groupKey = column.key || column.name;
    if (groupKey) wrap.setAttribute("data-key", String(groupKey));
    if (groupName) wrap.setAttribute("data-group", String(groupName));
    var held = (value && typeof value === "object") ? value : {};

    (column.columns || []).forEach(function (part) {
      // A part's caption can carry an ⓘ, and a `<button>` is labelable — so a `label` here would hand the
      // whole part's clicks to the explanation rather than to the input. Same rule as the cell above.
      var partWrap = document.createElement(tipBlocks(part, null).length > 0 ? "div" : "label");
      partWrap.className = "config-ui-rows-group-part";

      // **A part carries its own condition**, the same `{field=value}` a column does, on the part rather
       // than the cell — because the two parts that swap are inside one group. HSL has no shared ladder, so a
       // mode's Lightness *is* its ladder and Chroma is spelled Saturation; OKLCH shares the ladder, so
       // Lightness is not a mode's to hold. Same anchor, different parts, decided by *Color model*.
      if (part.showWhen) {
        partWrap.setAttribute("data-row-show-when", JSON.stringify(part.showWhen));
      }
      if (part.disabledWhen) {
        partWrap.setAttribute("data-row-disabled-when", JSON.stringify(part.disabledWhen));
      }

      var caption = document.createElement("span");
      caption.className = "config-ui-rows-group-label";
      caption.textContent = part.label;
      attachInfo(caption, part, null);
      partWrap.appendChild(caption);

      // `key` on a column, `name` on a field — this builder serves both, which is the point of reusing it.
      // Without the fallback the prefix was the literal string "undefined." and nothing could be read back.
      var owner = column.key || column.name;
      var control = buildRowCell(part, held[part.key], groupName + "-" + part.key, owner + ".");
      partWrap.appendChild(control);

      wrap.appendChild(partWrap);
    });
    return wrap;
  }

  /**
   * `baselineKey` is **not** `fieldKey`. A row cell's key is bare — `curve`, with no prefix — because the
   * flat sweep in `getValues` must not mistake a cell for a top-level field. That makes it useless for
   * addressing one row's curve among several: in HSL every mode has a curve and all of them are called
   * `curve`, and the collection's OKLCH curve is called `curve` too. So the caller that knows which row
   * this is says so separately.
   */
  function buildRowCell(column, value, groupName, keyPrefix, row, baselineKey) {
    var fieldKey = (keyPrefix || "") + column.key;
    if (column.type === "group") return buildRowGroup(column, value, groupName);

    function stampCellIdentity(el) {
      if (!el || !el.setAttribute) return el;
      if (column.key) el.setAttribute("data-key", String(column.key));
      if (column.type) el.setAttribute("data-type", String(column.type));
      if (groupName) el.setAttribute("data-group", String(groupName));
      return el;
    }
    /**
     * A mode picker in a row: the collection's own modes plus *New mode*.
     *
     * Three things have to line up or this control lists the right modes and saves nothing — which is the
     * failure this panel has already produced twice. It is **built** here; it carries `data-row-field` so
     * `collectRows` can find it (`buildModeControl` only sets `data-mode-field`, which the flat sweep reads
     * and a row must not); and `readRowCellInto` knows to read it with `readModeControl` rather than as an
     * input. `ui.html` populates every `[data-mode-field]` it finds, so the options arrive with no extra
     * wiring.
     */
    if (column.type === "mode") {
      var held = value == null ? "" : String(value);
      var picker = buildModeControl({ name: fieldKey, collectionField: null }, held);
      picker.setAttribute("data-row-field", fieldKey);
      // **Seeded with the value it was given.** `buildModeControl` only pre-fills its select when it knows the
      // collection, which a *column* never does — so a row whose config said `Granite` drew an empty dropdown,
      // and reading the form back wrote that emptiness over the name. The real list replaces this the moment it
      // arrives; until then the control shows what the config says, which is the only honest thing it can show.
      if (held) populateModeControl(picker, [held], held, { collection: "" });
      return stampCellIdentity(picker);
    }
    if (column.type === "curve") {
      // The same editor at cell scope. It carries `data-row-field` and **not** `data-curve-field`, for the
      // reason every other row control does: the flat sweep in `getValues` collects by the second, and a
      // mode's `lower` must never become a top-level `lower`.
      // Keyed by the cell's own path, because HSL fits one curve per mode and every one of them is
      // called `curve`.
      var cellCurve = buildCurveControl(column, value,
        row && column.growth ? row[column.growth] : undefined, baselineKey);
      cellCurve.setAttribute("data-row-field", fieldKey);
      return stampCellIdentity(cellCurve);
    }
    if (column.type === "list") {
      // `extras: [0, 1, 2]` is a list in a cell. Text on screen, an array in the config — a string
      // there would read as an array of one to `rampExtras` and quietly generate nothing.
      var list = document.createElement("input");
      list.type = "text";
      list.className = "config-ui-input config-ui-input--text";
      list.setAttribute("data-row-field", fieldKey);
      list.setAttribute("data-row-list", "true");
      list.value = p.listToText(value);
      return stampCellIdentity(list);
    }
    if (column.type === "radio") {
      // The group carries `data-row-field`, not the inputs: one cell, one value, read by asking which
      // input is checked. `groupName` has to be unique per row or the tabs share one group and picking
      // a scale type on Desktop clears Mobile's.
      var group = document.createElement("span");
      group.className = "config-ui-radio-group";
      group.setAttribute("data-row-field", fieldKey);
      group.setAttribute("data-row-radio", "true");
      var options = column.options || [];
      var matched = false;
      options.forEach(function (opt) {
        if (String(value) === p.columnOptionValue(opt)) matched = true;
      });
      options.forEach(function (opt, i) {
        var wrapLabel = document.createElement("label");
        wrapLabel.className = "config-ui-radio-label";
        var input = document.createElement("input");
        input.type = "radio";
        input.className = "config-ui-radio";
        input.name = groupName;
        input.value = p.columnOptionValue(opt);
        // Nothing checked is not a state this control can be read out of, so an unrecognised value
        // falls back to the first option rather than to none — and the fallback is visible, which is
        // how you find out the config says `metrik`.
        input.checked = matched ? String(value) === input.value : i === 0;
        wrapLabel.appendChild(input);
        wrapLabel.appendChild(document.createTextNode(" " + p.columnOptionLabel(opt)));
        group.appendChild(wrapLabel);
      });
      return stampCellIdentity(group);
    }
    if (column.type === "select") {
      var sel = document.createElement("select");
      sel.className = "config-ui-input config-ui-input--select";
      sel.setAttribute("data-row-field", fieldKey);
      var choices = (column.options || []).slice();
      // **A value the list does not offer is added to the list, not replaced by the first entry.**
      // A `<select>` always shows something, so an unlisted value showed the first option *and* would be
      // collected as it on the next edit — the config quietly rewritten to a number nobody chose. Found
      // in the plugin: a mode written with `ratio: 1.15` displayed 1.067.
      // Adding it also makes a custom value a first-class thing, which it is: every type-scale tool
      // offers the eight named ratios *and* a custom one.
      var listed = false;
      choices.forEach(function (opt) {
        if (String(value) === p.columnOptionValue(opt)) listed = true;
      });
      if (!listed && value !== undefined && value !== null && String(value) !== "") {
        choices.unshift({ value: String(value), label: String(value) });
      }
      choices.forEach(function (opt) {
        var o = document.createElement("option");
        o.value = p.columnOptionValue(opt);
        o.textContent = p.columnOptionLabel(opt);
        if (String(value) === o.value) o.selected = true;
        sel.appendChild(o);
      });
      return stampCellIdentity(sel);
    }
    if (column.type === "checkbox") {
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "config-ui-toggle";
      cb.setAttribute("data-row-field", fieldKey);
      cb.checked = value === true;
      return stampCellIdentity(cb);
    }
    var input = document.createElement("input");
    input.type = column.type === "number" ? "number" : "text";
    // The **modifier has to match the type**, or the narrow-number width never applies: this always
    // said `--text`, so `.config-ui-input--number { width: 96px }` matched nothing and the mode fields
    // filled their column.
    input.className = "config-ui-input config-ui-input--" +
      (column.type === "number" ? "number" : "text");
    input.setAttribute("data-row-field", fieldKey);
    // A column's own example. The empty-state frame is a full table of grey examples, and without them a
    // numeric cell labelled *Chroma* gives a first-time reader nothing to go on — 0.012 and 12 are both
    // plausible guesses and only one of them is a colour.
    if (column.placeholder != null) input.placeholder = String(column.placeholder);
    input.value = value == null ? "" : String(value);
    if (column.unit) return stampCellIdentity(curveUnitWrap(input, column.unit));
    return stampCellIdentity(input);
  }

  /**
   * A unit printed inside the input, at its right edge — `150` reading as `150 %`.
   *
   * **Not a placeholder.** A placeholder is the thing that disappears the moment you type, which is the
   * opposite of what a unit does: the field means percent whether it is empty or full, and a reader coming
   * back to `-1.5` needs to know it is a percentage and not pixels. So it is a sibling that stays.
   *
   * The input keeps `data-row-field`, so every collector, condition and address still finds it exactly
   * where it was — the wrapper is decoration and nothing reads it.
   */
  function curveUnitWrap(input, unit) {
    var box = document.createElement("span");
    box.className = "config-ui-unit";
    box.appendChild(input);
    var mark = document.createElement("span");
    mark.className = "config-ui-unit__mark";
    mark.textContent = String(unit);
    // Decoration only: clicks go through to the input, and a screen reader hears the label, not "percent"
    // twice.
    mark.setAttribute("aria-hidden", "true");
    box.appendChild(mark);
    return box;
  }

  /** Every option of this column is a number, so the column is about numbers. */
  function allNumericOptions(column) {
    var options = column.options || [];
    if (!options.length) return false;
    for (var i = 0; i < options.length; i++) {
      var raw = p.columnOptionValue(options[i]);
      if (raw === "" || Number.isNaN(parseFloat(raw, 10)) || !isFinite(Number(raw))) return false;
    }
    return true;
  }

  /** The rows of one control, read back out of the DOM in their displayed order. */
  /**
   * Read the rows back — **over** what was there, never from scratch.
   *
   * A cell that is not rendered is not a cell whose value is empty. Under `@tabs` the `name` column
   * is deliberately not drawn, because the chips above own the name; collecting only from rendered
   * cells therefore *deleted every mode's name* on the first edit to any field in the form. Then the
   * chips had nothing to show, the ids could not be matched, and a rename would have become an add —
   * three symptoms, one cause, and the config on disk quietly lost a key.
   *
   * The same rule already exists one layer up, where an object no control claims is marked
   * `unsupported` and left out of `getValues` rather than collected as `"[object Object]"`. This is
   * that rule for the inside of a row: the panel may only overwrite what it actually shows.
   */
  function collectRows(wrap, field, base) {
    var out = [];
    // **What a cell that wrote nothing falls back to.**
    //
    // A row is seeded with the values it already had, so a cell the form did not read — hidden by its own
    // condition, or absent — keeps what the config says rather than being blanked. The source of "what it
    // already had" matters: `field.value` is the schema the form was *built* from, and the form is only
    // re-built on a projection. Every edit in between goes through the merge, which writes the block and
    // deliberately does not re-project, so that value is frozen at load time.
    //
    // Left alone, hiding a cell restores the value it held when the panel opened. Editing a mode's Curve and
    // then switching to OKLCH — which hides Curve — silently put `original` back over it. `base` lets the
    // caller pass values read from the block as it is now, which is the only current answer there is.
    var existing = Array.isArray(base) ? base : (Array.isArray(field.value) ? field.value : []);
    wrap.querySelectorAll(".config-ui-rows-item").forEach(function (rowEl, index) {
      var row = {};
      var was = existing[index];
      if (was && typeof was === "object") {
        for (var key in was) row[key] = was[key];
      }
      (field.columns || []).forEach(function (column) {
        // A group is read one level down, into an object of its own. Its parts carry a compound
        // `data-row-field` (`bright.hue`) so the flat lookup below cannot mistake a part for a column —
        // two groups both holding a `hue` would otherwise collide on the first one found.
        if (column.type === "group") {
          var was = row[column.key];
          var hadValue = !!(was && typeof was === "object");
          var nested = hadValue ? was : {};
          var collected = {};
          for (var key in nested) collected[key] = nested[key];
          // **A group nothing ever filled is not a group of zeros.** An unfitted mode's `middle`
          // anchor (Hue's, Saturation's, Chroma's — plan 36 leaves it absent on a read, on purpose)
          // has no pre-existing value and every part's input is still genuinely blank — `""`, what
          // `buildRowCell` sets a number field to for a `null`/`undefined` value, not what a real
          // read ever produces. Reading each part back regardless (`readRowCellInto`'s number branch
          // turns an unparsable `""` into `0`, which is right for a field a person actually cleared)
          // used to write that `0` into every part unconditionally, so a group with nothing in it
          // came back as `{hue: 0, hslHue: 0, chroma: 0, saturation: 0}` — the exact zeroed anchor
          // that made the generator interpolate through grey. `anyPartHasContent` is true the moment
          // either the group already had a value, or one of its cells holds anything at all — so a
          // deliberately-cleared field still collects (matching every other cell's rule below: the
          // panel may only overwrite what it actually shows, and a cleared field was shown).
          var anyPartHasContent = hadValue;
          (column.columns || []).forEach(function (part) {
            var partEl = rowEl.querySelector('[data-row-field="' + column.key + "." + part.key + '"]');
            if (!partEl) return;
            if (String(partEl.value) !== "") anyPartHasContent = true;
            readRowCellInto(collected, part, partEl);
          });
          if (anyPartHasContent) row[column.key] = collected;
          else delete row[column.key];
          return;
        }
        var el = rowEl.querySelector('[data-row-field="' + column.key + '"]');
        if (!el) return;
        // **A cell its condition hides does not write.** This is the same rule as the one above, one
        // layer in: the panel may only overwrite what it actually shows. A `<select>` always shows
        // *something*, so a metric mode collected `ratio: 1.067` — the first option — and every mode in
        // the file gained a ratio it does not use, in a block people read. Skipping it leaves whatever
        // the config already had, so switching to modular and back returns your ratio rather than a
        // default.
        var cell = typeof el.closest === "function" ? el.closest(".config-ui-rows-cell") : null;
        if (cell && cell.style.display === "none") return;
        readRowCellInto(row, column, el);
      });
      out.push(row);
    });
    return out;
  }

  /**
   * One cell's value, typed, written into `target[column.key]`.
   *
   * Split out so a group's parts read back through exactly the same rules as a top-level column — a second
   * copy of "a select over numbers reads back a number" would be the fifth place in this file where two
   * implementations of one rule drifted.
   */
  function readRowCellInto(target, column, el) {
    if (column.type === "mode") {
      // Its own reader, because a picker's value is not `el.value`: choosing *New mode* means the answer is in
      // the name input beside the select, and `readModeControl` is the one place that knows that.
      //
      // **An empty answer never overwrites a name.** The same rule the rest of this collector follows — the
      // panel may only overwrite what it actually shows — and here it is load-bearing twice over: the mode list
      // arrives a beat after render, and any form change in that window would otherwise blank every mode name
      // in the block.
      var picked = readModeControl(el);
      if (picked) target[column.key] = picked;
      return;
    }
    if (column.type === "curve") {
      target[column.key] = curveCollected(el.getAttribute("data-curve-value"), !!column.overshoot);
      // **A growth curve writes two keys from one cell.** The growth has no field of its own any more — one
      // idea, one control — but it keeps its own name in the config so the block still reads
      // `ratio: 1.5` beside `curve: []` rather than hiding a second number inside the first.
      if (column.growth) {
        var grown = parseFloat(el.getAttribute("data-curve-growth-value"), 10);
        if (isFinite(grown) && grown > 0) target[column.growth] = grown;
      }
      return;
    }
    if (column.type === "radio") {
      // Left alone when nothing is checked, rather than blanked. `buildRowCell` always checks
      // something, so no-selection means the DOM is not what this code thinks it is — and keeping
      // the value the config already had is the answer that cannot lose data.
      var checked = el.querySelector("input:checked");
      if (checked) target[column.key] = checked.value;
    } else if (column.type === "list") {
      target[column.key] = p.textToList(el.value);
    } else if (column.type === "number") {
      var n = parseFloat(el.value, 10);
      target[column.key] = Number.isNaN(n) ? 0 : n;
    } else if (column.type === "select" && allNumericOptions(column)) {
      // A select over numbers reads back a number. A `<select>`'s value is always a string, so
      // picking *1.25 Major third* wrote `ratio: "1.25"` — which `resolveModularRatio` answers
      // with "unknown ratio" and an empty scale. The config also stops looking like the one that
      // shipped, and this is a file people read.
      var numeric = parseFloat(el.value, 10);
      target[column.key] = Number.isNaN(numeric) ? el.value : numeric;
    } else if (column.type === "checkbox") {
      target[column.key] = !!el.checked;
    } else {
      target[column.key] = el.value;
    }
  }

  function attachListeners(container, schema, onChange, onChannelOpen, onRequestEstimate, onAbandonEstimate, onMiddlePointAdded) {
    if (!onChange || typeof onChange !== "function") return;

    /**
     * `base` is a schema parsed from the block as it stands, used only for the values a control did not
     * read. Without it those come from the form's build-time schema, which is stale the moment anything is
     * written without re-projecting — see `collectRows`.
     */
    function getValues(base) {
      var vals = {};
      function baseValueFor(name) {
        var rows = base && base.rows ? base.rows : [];
        for (var bi = 0; bi < rows.length; bi++) {
          if (rows[bi].type === "field" && rows[bi].name === name) return rows[bi].value;
        }
        return null;
      }
      container.querySelectorAll(".config-ui-multiselect[data-field]").forEach(function (box) {
        var n = box.getAttribute("data-field");
        if (!n) return;
        vals[n] = [];
        box.querySelectorAll(".config-ui-multiselect-cb:checked").forEach(function (cb) {
          vals[n].push(cb.value);
        });
      });
      // Rows first, and by their own attribute. A cell named `min` inside a row must never
      // become a top-level `min` — which is what would happen if cells carried `data-field`.
      container.querySelectorAll("[data-collection-field]").forEach(function (wrap) {
        var n = wrap.getAttribute("data-collection-field");
        if (n) vals[n] = readCollectionControl(wrap);
      });
      container.querySelectorAll("[data-mode-field]").forEach(function (wrap) {
        var n = wrap.getAttribute("data-mode-field");
        if (n) vals[n] = readModeControl(wrap);
      });
      container.querySelectorAll("[data-rows-field]").forEach(function (wrap) {
        var n = wrap.getAttribute("data-rows-field");
        if (!n) return;
        var field = null;
        var rows = schema && schema.rows ? schema.rows : [];
        for (var i = 0; i < rows.length; i++) {
          if (rows[i].type === "field" && rows[i].name === n) { field = rows[i]; break; }
        }
        if (field) vals[n] = collectRows(wrap, field, baseValueFor(n));
      });
      // A field-level `@group:` keeps its parts under `data-row-field` — the same attribute a `@rows` cell
      // uses, because it is the same builder — so the flat sweep below cannot see them. Collected here into
      // the object the config holds, keyed by the group's own name.
      //
      // Worth the extra pass: without it the control rendered, accepted typing, and saved nothing. The form
      // looked right and the block never changed, which is the failure mode this codebase keeps meeting.
      // A curve keeps its value on the wrapper rather than in an input, so the flat sweep below cannot see
      // it. Its own pass, like the group one under it, and for the same reason: without this the editor
      // rendered, dragged, and saved nothing.
      container.querySelectorAll("[data-curve-field]").forEach(function (wrap) {
        var n = wrap.getAttribute("data-curve-field");
        if (!n) return;
        var owner = null;
        var rows = (schema && schema.rows) || [];
        for (var ci = 0; ci < rows.length; ci++) {
          if (rows[ci].type === "field" && rows[ci].name === n) { owner = rows[ci]; break; }
        }
        vals[n] = curveCollected(wrap.getAttribute("data-curve-value"), !!(owner && owner.overshoot));
      });
      container.querySelectorAll("[data-group-field]").forEach(function (wrap) {
        var groupName = wrap.getAttribute("data-group-field");
        if (!groupName) return;
        var held = {};
        var field = null;
        var rows = schema && schema.rows ? schema.rows : [];
        for (var gi = 0; gi < rows.length; gi++) {
          if (rows[gi].type === "field" && rows[gi].name === groupName) { field = rows[gi]; break; }
        }
        if (!field) return;
        if (field.value && typeof field.value === "object") {
          for (var was in field.value) held[was] = field.value[was];
        }
        /**
         * **Searched from the form, not from the group.** A curve declaring `@ends: lightness.bright..`
         * *adopts* those two inputs — moves them under its own chart, which is the whole point of the
         * charted layout — and they land in a different field's subtree. Asking the group wrapper for its
         * own parts then finds an empty box: OKLCH's Lightness rendered, accepted typing and saved nothing.
         *
         * Safe to widen because a field-level part's key is `group.part` and a `@rows` cell's group is not
         * marked `data-group-field` at all, so there is exactly one element per key in the form.
         */
        (field.columns || []).forEach(function (part) {
          var key = '[data-row-field="' + groupName + "." + part.key + '"]';
          var el = wrap.querySelector(key) || container.querySelector(key);
          if (el) readRowCellInto(held, part, el);
        });
        vals[groupName] = held;
      });

      container.querySelectorAll("[data-field]").forEach(function (el) {
        var n = el.getAttribute("data-field");
        if (!n) return;
        if (el.classList.contains("config-ui-multiselect")) return;
        if (el.classList.contains("config-ui-multiselect-cb")) return;
        if (el.type === "checkbox") {
          if (el.classList.contains("config-ui-toggle")) vals[n] = el.checked;
        } else if (el.type === "radio") {
          if (el.checked) vals[n] = el.value;
        } else if (el.type === "number") {
          var x = parseFloat(el.value, 10);
          vals[n] = Number.isNaN(x) ? 0 : x;
        } else if (el.getAttribute("data-field-list") === "true") {
          vals[n] = p.textToList(el.value);
        } else if (vals[n] === undefined) {
          vals[n] = el.value;
        }
      });
      return vals;
    }

    function applyVisibility() {
      var vals = getValues();
      /**
       * A field's value as a condition reads it.
       *
       * **A curve answers `original` or `curve`, never its coordinates.** There is nothing useful to compare
       * a handle position against, and the question every condition actually asks about a curve is whether
       * there is one — Colors disables its anchors until a curve is chosen, and shows the seed only once one
       * is. Two words rather than a number keeps the block readable: `{lower=curve}`, not a wildcard over
       * four decimals.
       */
      function showWhenValueStr(v) {
        return v === undefined || v === null ? "" : String(v);
      }
      function curveFieldNames() {
        var names = {};
        var rows = (schema && schema.rows) || [];
        for (var i = 0; i < rows.length; i++) {
          if (rows[i].type === "field" && rows[i].inputType === "curve") names[rows[i].name] = true;
        }
        return names;
      }
      var curveFields = curveFieldNames();
      function conditionValueOf(name) {
        if (curveFields[name]) return (vals[name] && vals[name].length) ? "curve" : "original";
        return showWhenValueStr(vals[name]);
      }
      function visRules(row) {
        var rs = row.getAttribute("data-show-when-rules");
        if (rs) {
          try {
            var rules = JSON.parse(rs);
            for (var i = 0; i < rules.length; i++) {
              var cur = conditionValueOf(rules[i].field);
              if (!conditionAccepts(rules[i].values, cur)) return false;
            }
            return true;
          } catch (e) {
            return true;
          }
        }
        return null;
      }
      container.querySelectorAll("[data-show-when-rules]").forEach(function (row) {
        var v = visRules(row);
        if (v !== null) row.style.display = v ? "" : "none";
      });
      // Row cells, judged inside their own row. `getValues` flattens the rows into one array per field,
      // which is the wrong shape for this — what a cell needs is the sibling cell beside it, so the
      // values are read from the DOM of that row and nowhere else.
      /** One control's value, however it is spelled. */
      function readConditionValue(el) {
        if (el.getAttribute("data-row-radio")) {
          var on = el.querySelector("input:checked");
          return on ? on.value : "";
        }
        // A curve cell keeps its value on an attribute and has no `.value` at all, so without this every
        // condition naming one read `undefined` and the cells it guards were hidden for good. Same two words
        // the field-level reader answers with — one vocabulary, whichever layout the curve is in.
        var curve = el.getAttribute("data-curve-value");
        if (curve !== null) {
          var held = curveValueOf(curve);
          return held.length ? "curve" : "original";
        }
        return el.type === "checkbox" ? (el.checked ? "true" : "false") : el.value;
      }

      /** Every `[data-row-field]` under `root`, keyed as written and also by its last segment. */
      /**
       * Do these `{…}` rules hold, read through this chain of scopes, closest first?
       *
       * **The form-level fallback goes through the same reader as everything else.** A curve field answers
       * `original` or `curve`; `String([0.37,0,0.63,1])` is a coordinate list, which matches no condition
       * anyone would write. The row scopes are already curve-aware — the fallback was the one place that
       * was not, and it is the path a condition naming a setting above the whole table takes.
       */
      function conditionsHold(rules, scopes) {
        for (var i = 0; i < rules.length; i++) {
          var field = rules[i].field;
          var seen;
          var found = false;
          for (var s = 0; s < scopes.length && !found; s++) {
            if (scopes[s] && Object.prototype.hasOwnProperty.call(scopes[s], field)) {
              seen = scopes[s][field];
              found = true;
            }
          }
          var reading = found ? showWhenValueStr(seen) : conditionValueOf(field);
          if (!conditionAccepts(rules[i].values, reading)) return false;
        }
        return true;
      }

      function scopeUnder(root) {
        var own = {};
        root.querySelectorAll("[data-row-field]").forEach(function (el) {
          var key = el.getAttribute("data-row-field");
          if (!key) return;
          var value = readConditionValue(el);
          own[key] = value;
          var dot = key.lastIndexOf(".");
          // **Also by short name, so a part can name its sibling.** Inside a group the controls are
          // `lower.family` and `lower.easing`; a condition written on the Easing part says `family=sine`,
          // because that is the sibling it is about. Without this it resolved to nothing and the part was
          // hidden always — which is what stopped the two-segment curve controls being buildable.
          if (dot !== -1) {
            var short = key.slice(dot + 1);
            if (!Object.prototype.hasOwnProperty.call(own, short)) own[short] = value;
          }
        });
        return own;
      }

      /**
       * **Nearest scope wins: the group, then the row, then the form.**
       *
       * A part's condition is usually about its sibling part (Easing depends on Family). A cell's is usually
       * about a sibling cell (a ratio depends on the scale type in that row). And some are about a setting
       * above the whole table (*Color model*). One chain covers all three, closest first, so the specific
       * case cannot be shadowed by a coincidental name higher up.
       */
      function applyConditions(root, scopes) {
        root.querySelectorAll("[data-row-show-when]").forEach(function (el) {
          if (el !== root && el.parentElement && el.parentElement.closest &&
              el.parentElement.closest(".config-ui-rows-group") &&
              !root.classList.contains("config-ui-rows-group")) {
            return; // a group's parts are judged in the group's own pass
          }
          var rules;
          try {
            rules = JSON.parse(el.getAttribute("data-row-show-when"));
          } catch (e) {
            return;
          }
          el.style.display = conditionsHold(rules, scopes) ? "" : "none";
        });

        // **The same rules, a different consequence.** `[…]` disables where `{…}` hides, so it runs through
        // the same scope chain and cannot drift from it. The note lives with the state rather than beside it:
        // one attribute, shown exactly while the disable applies.
        root.querySelectorAll("[data-row-disabled-when]").forEach(function (el) {
          if (el !== root && el.parentElement && el.parentElement.closest &&
              el.parentElement.closest(".config-ui-rows-group") &&
              !root.classList.contains("config-ui-rows-group")) {
            return;
          }
          var rules;
          try {
            rules = JSON.parse(el.getAttribute("data-row-disabled-when"));
          } catch (e) {
            return;
          }
          var off = true;
          for (var i = 0; i < rules.length; i++) {
            var field = rules[i].field;
            var seen;
            var found = false;
            for (var s = 0; s < scopes.length && !found; s++) {
              if (scopes[s] && Object.prototype.hasOwnProperty.call(scopes[s], field)) {
                seen = scopes[s][field];
                found = true;
              }
            }
            // Same reader as the `{…}` branch above, for the same reason.
            var offReading = found ? showWhenValueStr(seen) : conditionValueOf(field);
            if (!conditionAccepts(rules[i].values, offReading)) off = false;
          }
          el.classList.toggle("is-disabled", off);
          el.querySelectorAll("input, select, textarea").forEach(function (control) {
            control.disabled = off;
          });
          var wanted = off ? (el.getAttribute("data-row-disabled-note") || "") : "";
          var note = el.querySelector(":scope > .config-ui-field-note--disabled");
          if (wanted && !note) {
            note = document.createElement("div");
            note.className = "config-ui-field-note config-ui-field-note--disabled";
            el.appendChild(note);
          }
          if (note) {
            note.textContent = wanted;
            note.style.display = wanted ? "" : "none";
          }
        });
      }

      container.querySelectorAll(".config-ui-rows-item").forEach(function (item) {
        applyConditions(item, [scopeUnder(item)]);
      });

      // Groups last and in their own scope, so a part sees its siblings before its row. Field-level groups
      // live outside any row, which is why they were never swept at all.
      container.querySelectorAll(".config-ui-rows-group").forEach(function (group) {
        var row = group.closest ? group.closest(".config-ui-rows-item") : null;
        applyConditions(group, [scopeUnder(group), row ? scopeUnder(row) : null]);
      });

      hideEmptyGroups(container);

      // And the tabs above them, which is the same question one level out: a channel whose every cell
      // belongs to the other model is a heading over an empty box. Runs after the group sweep, because a
      // group it just hid is exactly what can leave a panel empty.
      refreshRowTabs(container, function (item, rules) {
        return conditionsHold(rules, [scopeUnder(item)]);
      });

      container.querySelectorAll("[data-show-when-field]").forEach(function (row) {
        if (row.getAttribute("data-show-when-rules")) return;
        var field = row.getAttribute("data-show-when-field");
        var valsStr = row.getAttribute("data-show-when-values");
        var valsList = valsStr ? valsStr.split("|") : [];
        var cur = showWhenValueStr(vals[field]);
        row.style.display = valsList.indexOf(cur) !== -1 ? "" : "none";
      });
    }

    /**
     * Point every mode picker at the collection it follows, and ask for that collection's modes.
     *
     * The list is a property of another field's value, so this runs on every change rather than once:
     * switching collection re-asks, and the answer arrives through the same `OPTIONS` message the
     * dynamic option sources use. `data-mode-collection` records which collection the control is
     * currently showing, so an unrelated keystroke does not send a request per character.
     */
    function refreshModePickers() {
      container.querySelectorAll("[data-mode-field]").forEach(function (wrap) {
        var collectionWrap = collectionWrapForMode(container, wrap);
        var name = collectionWrap ? readCollectionControl(collectionWrap) : "";
        var previous = wrap.getAttribute("data-mode-collection");
        if (previous === name) return;
        wrap.setAttribute("data-mode-collection", name);
        // A *change* of collection, as against the first look at one. Only the change discards what
        // the picker holds: on the first pass the value came from the config, and a config that names
        // a mode is answering the question, not carrying an answer over from somewhere else.
        if (previous !== null) resetModeControl(wrap);
        if (!name) {
          // Nothing to ask about. Said by the control rather than left as a stale list from the
          // collection that was chosen a moment ago.
          populateModeControl(wrap, [], currentModeValue(wrap), { collection: "" });
          return;
        }
        if (typeof parent !== "undefined" && parent.postMessage) {
          parent.postMessage(
            {
              pluginMessage: {
                type: "GET_OPTIONS",
                optionSource: "collectionModes",
                collection: name,
              },
            },
            "*"
          );
        }
      });
    }

    /**
     * **Switching a channel tab is not a config change.** It moves nothing and writes nothing — which is
     * why it is handled here rather than through `handleControlEvent`, and why it does not call `onChange`.
     * A rebuild of the form would lose it, and that is correct: a rebuild is a new form.
     */
    container.addEventListener("click", function (evt) {
      var button = evt.target && typeof evt.target.closest === "function"
        ? evt.target.closest("[data-rows-tab]") : null;
      if (!button) return;
      var rowEl = button.closest("[data-row-index]");
      if (!rowEl) return;
      showRowTab(rowEl, button.getAttribute("data-rows-tab"));
      // The chart in the tab that just appeared has been sized 0x0 all along, so it has never measured
      // itself. Everything else in there is laid out by CSS and needs no telling.
      refreshCurveControls(rowEl);
      // **A tab opening, not a value changing.** The row itself is the unit the host fits by — see
      // `.plans/36-lazy-fit-on-demand.md` — so this hands over the row, not the tab name; whether it
      // needs a fit at all, and which mode it is, are questions only the host's own session state and
      // the row's own `name` cell can answer.
      if (typeof onChannelOpen === "function") onChannelOpen(rowEl);
    });

    /**
     * **Selecting *Estimated original* before a fit exists, the other trigger.** `buildCurveControl`
     * dispatches this instead of calling the host directly for the same reason `onChannelOpen` is a
     * callback and not a function this file owns: the fit is a real network round trip through the
     * sandbox, and which mode `rowEl` names is a question only the host's session state answers.
     * `evt.target` is the curve control's own wrapper, so the host can clear *that* control's disabled,
     * "Estimating…" state directly if it turns out there is nothing to fit yet (no mode name typed, most
     * likely) — the request would otherwise leave the control waiting for a refresh that never comes.
     */
    container.addEventListener("config-ui-request-estimate", function (evt) {
      var rowEl = evt.target && typeof evt.target.closest === "function"
        ? evt.target.closest("[data-row-index]") : null;
      if (!rowEl) return;
      if (typeof onRequestEstimate === "function") onRequestEstimate(rowEl, evt.target);
    });

    /**
     * **The control gave up; the request did not.** Fired only from the timeout path in
     * `buildCurveControl` — the fit the row asked for is still running with no way to cancel it, so
     * this tells the host to drop the answer instead of applying it wherever it lands, and to let a
     * later, real retry ask again rather than sitting behind a claim nothing will ever resolve.
     */
    container.addEventListener("config-ui-abandon-estimate", function (evt) {
      var rowEl = evt.target && typeof evt.target.closest === "function"
        ? evt.target.closest("[data-row-index]") : null;
      if (!rowEl) return;
      if (typeof onAbandonEstimate === "function") onAbandonEstimate(rowEl, evt.target);
    });

    /**
     * **A middle point just appeared on the curve with no value of its own.** Only the host can see
     * this curve's sibling `bright.*`/`middle.*`/`dark.*` cells in the same row — a control outside any
     * row (Spacing, Radius, Typography's own `curve` field, or Colors' collection-scope OKLCH curve)
     * has no such siblings, and `closest("[data-row-index]")` finding nothing there is exactly the
     * backward-compatible no-op those controls need.
     */
    container.addEventListener("config-ui-middle-point-added", function (evt) {
      var rowEl = evt.target && typeof evt.target.closest === "function"
        ? evt.target.closest("[data-row-index]") : null;
      // **Row when there is one; the form otherwise.** Colors' per-channel curves live in `@rows` and
      // the host fills `middle.<channel>` from sibling cells in that row. A top-level charted field
      // (the style-reference shelf, scenario tests) has the same siblings under the form root — still
      // no-op when there is no `middle.*` cell to fill.
      if (typeof onMiddlePointAdded === "function") {
        onMiddlePointAdded(rowEl || container, evt.target, evt.detail);
      }
    });

    applyVisibility();
    refreshCurveControls(container);
    refreshModePickers();
    /**
     * Is this event a control changing?
     *
     * This used to be `data-field` and nothing else, which quietly excluded **every control whose
     * parts deliberately lack that attribute** — the `@rows` cells (`data-row-field`), its Add and
     * Remove (which dispatch on the wrap), and the collection picker. They omit `data-field` so the
     * flat collector cannot mistake a cell for a top-level field; the consequence nobody checked was
     * that editing them never reached `onChange`, so the config was never written.
     *
     * `@rows` therefore shipped able to render and unable to save. The sweep proved the controls
     * appeared; nothing proved a keystroke in one arrived anywhere. Found by `setField` reporting it
     * settled on the frame fallback instead of on a change.
     */
    function isControlEvent(target) {
      if (!target || typeof target.getAttribute !== "function") return false;
      if (target.getAttribute("data-field")) return true;
      if (target.getAttribute("data-row-field")) return true;
      if (target.getAttribute("data-rows-field")) return true;
      if (target.classList && target.classList.contains("config-ui-multiselect-cb")) return true;
      // A radio inside a row cell. The *group* carries `data-row-field` — one cell, one value — so the
      // input that the user actually clicks has no attribute of its own, and the check above misses it.
      // This is the failure the comment describes, arriving a second time by the same route: a control
      // that renders and cannot save.
      if (typeof target.closest === "function" && target.closest("[data-row-field]")) return true;
      if (typeof target.closest === "function" && target.closest("[data-curve-field]")) return true;
      if (typeof target.closest === "function" && target.closest("[data-collection-field]")) return true;
      if (typeof target.closest === "function" && target.closest("[data-mode-field]")) return true;
      return false;
    }

    /**
     * **A dragged handle cannot have moved another curve.** `refreshCurveControls` exists so a growth
     * readout shared between controls catches up; nothing about dragging *this* curve's handle changes what
     * any other curve should draw. Redrawing them anyway meant one drag rebuilt N+1 SVGs from nothing every
     * frame, on a panel whose whole point is having several ramps side by side.
     */
    function handleControlEvent(e) {
      applyVisibility();
      if (!e.codefigLive) refreshCurveControls(container, e.target);
      refreshModePickers();
      // **`live` and `committed` are different questions.** `live` says a drag is in flight, so the config
      // editor's text can wait. `committed` says the control has *settled* — a `change` fires when a text
      // field is left or Enter is pressed, and when a select is chosen, where `input` fires on every
      // keystroke. Anything that acts on a value rather than recording it wants the second one.
      onChange(getValues(), { live: !!e.codefigLive, committed: e.type === "change" });
    }
    /**
     * **Named, so they can be taken off again.**
     *
     * These are delegated listeners on the *container*, which outlives the form inside it — `destroy()`
     * empties the container's children, and a child's listeners go with it, but these two never do. Every
     * re-render therefore used to add another pair to the same element, and nothing ever removed one. After
     * N renders a single keystroke ran the whole change pipeline N times: visibility, every curve control,
     * the mode pickers, and a full read-serialise-write of the config editor, N times over.
     *
     * That is the "it gets slower the longer I work in it" report. It is not a leak that shows up as memory
     * — the listeners are tiny — it shows up as *time*, growing linearly in how many times the form has
     * been rebuilt. Colours rebuilds it most: mode chips, auto-import fills, a collection change and a model
     * switch all re-render.
     */
    function onChangeEvent(e) {
      if (isControlEvent(e.target)) handleControlEvent(e);
    }
    function onInputEvent(e) {
      if (isControlEvent(e.target) && e.target.type !== "checkbox") handleControlEvent(e);
    }
    container.addEventListener("change", onChangeEvent);
    container.addEventListener("input", onInputEvent);
    return {
      getValues: getValues,
      applyVisibility: applyVisibility,
      refreshModePickers: refreshModePickers,
      detach: function () {
        container.removeEventListener("change", onChangeEvent);
        container.removeEventListener("input", onInputEvent);
      },
    };
  }

  // The renderer's public API. `bridge.js` copies this object onto `window.CodeFigConfigUI` the same
  // way it copies the parser's, so adding a function here is the whole of publishing it.
  return {
    buildForm: buildForm,
    buildField: buildField,
    attachListeners: attachListeners,
    // The collection list is a backend round trip, so `ui.html` fills the picker when it arrives.
    populateCollectionControl: populateCollectionControl,
    readCollectionControl: readCollectionControl,
    // The mode list is the same round trip, one level down: which collection to ask about comes from
    // the collection picker, so `ui.html` fills these by the collection name they are showing.
    populateModeControl: populateModeControl,
    readModeControl: readModeControl,
    currentModeValue: currentModeValue,
    readChipsControl: readChipsControl,
    // A `modeId` is file-specific and never travels in a config, so the panel holds the list and
    // hangs it back on the chips after every redraw.
    populateChipsControl: populateChipsControl,
    readChipOp: readChipOp,
    // The read-back for one `@rows` control. Published so a test can *run* it: every other renderer test
    // here reads this file as source, which is how a function with an out-of-scope variable shipped and
    // killed every form in the plugin. A nested group's read-back is exactly the kind of thing that looks
    // right in the source and returns the first anchor's hue three times in practice.
    collectRows: collectRows,
    // Published so a test can assemble a form and then tell the curves to look at it — which is the only
    // way to exercise a control whose picture depends on a cell it does not own.
    refreshCurveControls: refreshCurveControls,
    setCurveBaselines: setCurveBaselines,
    setCurveRamps: setCurveRamps,
    // Published for the same reason `collectRows` is: the curve editor's redraw replaces every element it
    // owns, which is exactly the kind of thing that reads correctly and loses its drag handler in practice.
    buildCurveControl: buildCurveControl,
  };
});
