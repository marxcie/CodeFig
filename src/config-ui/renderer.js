(function (root, factory) {
  if (typeof define === "function" && define.amd) define(["./parser"], factory);
  else if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./parser"));
  else root.ConfigUIRenderer = factory(root.ConfigUIParser);
})(typeof self !== "undefined" ? self : this, function (P) {
  "use strict";
  var p = P || (typeof ConfigUIParser !== "undefined" ? ConfigUIParser : null);
  if (!p) throw new Error("ConfigUI Renderer requires Parser");

  function buildField(field, idx) {
    var n = field.name;
    var t = field.type;
    var v = field.value;
    var l = field.label || n;
    var tip = field.tooltip || "";
    var id = "config-ui-" + n + "-" + idx;
    var wrap = document.createElement("div");
    wrap.className = "config-ui-field config-ui-field--" + t;
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
      if (tip) (wrap.title = tip), lab.classList.add("config-ui-field__label--has-tooltip");
      row.appendChild(lab);
    } else if (tip) {
      wrap.title = tip;
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
        inp.value = opt;
        inp.checked = opt === ov;
        inp.className = "config-ui-radio";
        inp.setAttribute("data-field", n);
        lbl.appendChild(inp);
        var sp = document.createElement("span");
        sp.textContent = opt;
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
        o.value = opt;
        o.textContent = opt;
        if (opt === ov2) o.selected = true;
        sel2.appendChild(o);
      });
      if (!sel2.value && field.options[0]) sel2.value = field.options[0];
      cw.appendChild(sel2);
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
    // Under the **control**, not under the row: a note at the label's left edge reads as prose about
    // the section rather than as an explanation of this input. It goes in the grid's second column,
    // which is what puts it under the field it describes.
    if (field.helper) {
      var helper = document.createElement("div");
      helper.className = "config-ui-field-note";
      helper.textContent = field.helper;
      row.appendChild(helper);
    }
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

  function buildRow(r, idx, schema) {
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
      var tag = r.level >= 3 ? "h3" : r.level === 2 ? "h2" : "h1";
      var h = document.createElement(tag);
      h.className = "config-ui-heading";
      h.textContent = r.text;
      wrap.appendChild(h);
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
      var md = r.text.replace(/\n/g, "  \n");
      mdWrap.innerHTML =
        typeof window.marked !== "undefined" && window.marked.parse
          ? window.marked.parse(md, { gfm: true })
          : md.replace(/&/g, "&amp;").replace(/\x3c/g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
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
      var chipsField = document.createElement("div");
      chipsField.className = "config-ui-field config-ui-field--chips";
      var chipsRow = document.createElement("div");
      chipsRow.className = "config-ui-field__row";
      var chipsLabel = document.createElement("label");
      chipsLabel.className = "config-ui-field__label";
      chipsLabel.textContent = r.label || "Collection modes";
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
      wrap3.className = "config-ui-row config-ui-row--field" +
        (r.inputType === "rows" ? " config-ui-row--fullwidth" : "");
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
      // The value of the collection this mode picker follows, read from the block rather than from
      // the DOM: at this point the collection picker may not have been built yet.
      if (r.inputType === "mode") f.collectionValue = seedCollectionValue(r, schema);
      wrap3.appendChild(buildField(f, idx));
      return wrap3;
    }
    return document.createElement("div");
  }

  function buildSection(sec, idx) {
    if (sec.divider) {
      var wr = document.createElement("div");
      wr.className = "config-ui-section config-ui-section--divider";
      wr.setAttribute("data-section", String(idx));
      wr.appendChild(document.createElement("hr"));
      return wr;
    }
    var el = document.createElement("div");
    el.className = "config-ui-section";
    el.setAttribute("data-section", String(idx));
    if (sec.title || sec.intro) {
      var intro = sec.intro || "";
      var introForMd = intro.replace(/\n\n/g, "\n\n").replace(/\n/g, "  \n");
      var md = sec.title ? (introForMd ? sec.title + "  \n" + introForMd : sec.title) : introForMd;
      var mdWrap = document.createElement("div");
      mdWrap.className = "docs-rendered";
      mdWrap.innerHTML =
        typeof window.marked !== "undefined" && window.marked.parse
          ? window.marked.parse(md, { gfm: true })
          : md.replace(/&/g, "&amp;").replace(/\x3c/g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
      el.appendChild(mdWrap);
    }
    var fe = document.createElement("div");
    fe.className = "config-ui-section__fields";
    sec.fields.forEach(function (f, i) {
      fe.appendChild(buildField(f, idx * 1000 + i));
    });
    el.appendChild(fe);
    return el;
  }

  function buildForm(schema, container) {
    if (!schema) {
      container.innerHTML = '<div class="config-ui-empty">No configuration options.</div>';
      return;
    }
    if (schema.rows && schema.rows.length) {
      container.innerHTML = "";
      container.className = "config-ui-form config-ui-form--rows";
      var fieldIdx = 0;
      schema.rows.forEach(function (r, i) {
        // The schema goes with the row: the chips control needs the mode names, which live in another
        // row's value. Passing context beats either control reaching into the DOM for the other,
        // which would depend on render order.
        var el = buildRow(r, r.type === "field" ? fieldIdx++ : 0, schema);
        el.setAttribute("data-row-index", String(i));
        container.appendChild(el);
      });
      return;
    }
    if (schema.sections && schema.sections.length) {
      container.innerHTML = "";
      container.className = "config-ui-form";
      schema.sections.forEach(function (sec, i) {
        container.appendChild(buildSection(sec, i));
      });
      return;
    }
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
  function buildRowsControl(field, rows) {
    var wrap = document.createElement("div");
    wrap.className = "config-ui-rows" + (field.tabs ? " config-ui-rows--tabs" : "");
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
        rowEl.className = field.tabs ? "config-ui-rows-item config-ui-rows-item--stacked"
          : "config-ui-rows-item";
        rowEl.setAttribute("data-row-index", String(index));

        (field.columns || []).forEach(function (column) {
          // Under `@tabs` the row's `name` **is** the tab, so it is not also a field. Renaming happens
          // on the chips, which is the only rename affordance — a second one here would be a second
          // place to do the same thing, and the two could disagree.
          if (field.tabs && column.key === "name") return;
          // A radio cell is a `div`, every other cell a `label`. A `label` wrapping a radio group is
          // nested labels: clicking anywhere in the cell — the caption included — would activate the
          // outer label's first labelable descendant, which is the first radio. So the caption would
          // silently reset the scale type to Modular.
          var cell = document.createElement(column.type === "radio" ? "div" : "label");
          // With `@tabs` a tab shows one row at a time, so its fields read as a form — one labelled
          // field per line, as the frames show — rather than as a horizontal strip of cells, which is
          // the right shape only when rows are stacked and being compared.
          cell.className = field.tabs ? "config-ui-rows-cell config-ui-rows-cell--stacked"
            : "config-ui-rows-cell";
          // A column can depend on another column **in the same row**: a modular scale needs a ratio,
          // a metric one needs a step, and showing both leaves half of every tab inert. The condition
          // travels on the cell, and is evaluated against that row's own values rather than the form's
          // — two modes on two tabs can be using different scale types at the same time.
          if (column.showWhen) {
            cell.setAttribute("data-row-show-when", JSON.stringify(column.showWhen));
          }
          var caption = document.createElement("span");
          caption.className = "config-ui-rows-cell-label";
          caption.textContent = column.label;
          cell.appendChild(caption);
          cell.appendChild(buildRowCell(
            column, row ? row[column.key] : undefined,
            "config-ui-row-radio-" + field.name + "-" + index + "-" + column.key
          ));
          rowEl.appendChild(cell);
        });

        var remove = field.tabs ? null : document.createElement("button");
        if (remove) {
        remove.type = "button";
        remove.className = "config-ui-rows-remove";
        remove.textContent = "Remove";
        // Remove-then-add is how a row is replaced, so removal needs no confirmation here — this
        // control edits a config, and nothing reaches the document until the script runs.
        remove.addEventListener("click", function () {
          var next = collectRows(wrap, field);
          next.splice(index, 1);
          draw(next, Math.max(0, Math.min(index, next.length - 1)));
          wrap.dispatchEvent(new Event("change", { bubbles: true }));
        });
        rowEl.appendChild(remove);
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

      // With `@tabs` the modes are managed by the chips above, so Add does not belong here — two
      // places to add a mode is one too many.
      if (field.tabs) {
        if (field.tabs) selectTab(typeof active === "number" ? active : 0);
        return;
      }

      var add = document.createElement("button");
      add.type = "button";
      add.className = "config-ui-rows-add";
      add.textContent = "Add";
      add.addEventListener("click", function () {
        var next = collectRows(wrap, field);
        var blank = {};
        (field.columns || []).forEach(function (column) {
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

  function buildRowCell(column, value, groupName) {
    if (column.type === "list") {
      // `extras: [0, 1, 2]` is a list in a cell. Text on screen, an array in the config — a string
      // there would read as an array of one to `rampExtras` and quietly generate nothing.
      var list = document.createElement("input");
      list.type = "text";
      list.className = "config-ui-input config-ui-input--text";
      list.setAttribute("data-row-field", column.key);
      list.setAttribute("data-row-list", "true");
      list.value = p.listToText(value);
      return list;
    }
    if (column.type === "radio") {
      // The group carries `data-row-field`, not the inputs: one cell, one value, read by asking which
      // input is checked. `groupName` has to be unique per row or the tabs share one group and picking
      // a scale type on Desktop clears Mobile's.
      var group = document.createElement("span");
      group.className = "config-ui-radio-group";
      group.setAttribute("data-row-field", column.key);
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
      return group;
    }
    if (column.type === "select") {
      var sel = document.createElement("select");
      sel.className = "config-ui-input config-ui-input--select";
      sel.setAttribute("data-row-field", column.key);
      (column.options || []).forEach(function (opt) {
        var o = document.createElement("option");
        o.value = p.columnOptionValue(opt);
        o.textContent = p.columnOptionLabel(opt);
        if (String(value) === o.value) o.selected = true;
        sel.appendChild(o);
      });
      return sel;
    }
    if (column.type === "checkbox") {
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "config-ui-toggle";
      cb.setAttribute("data-row-field", column.key);
      cb.checked = value === true;
      return cb;
    }
    var input = document.createElement("input");
    input.type = column.type === "number" ? "number" : "text";
    // The **modifier has to match the type**, or the narrow-number width never applies: this always
    // said `--text`, so `.config-ui-input--number { width: 96px }` matched nothing and the mode fields
    // filled their column.
    input.className = "config-ui-input config-ui-input--" +
      (column.type === "number" ? "number" : "text");
    input.setAttribute("data-row-field", column.key);
    input.value = value == null ? "" : String(value);
    return input;
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
  function collectRows(wrap, field) {
    var out = [];
    var existing = Array.isArray(field.value) ? field.value : [];
    wrap.querySelectorAll(".config-ui-rows-item").forEach(function (rowEl, index) {
      var row = {};
      var was = existing[index];
      if (was && typeof was === "object") {
        for (var key in was) row[key] = was[key];
      }
      (field.columns || []).forEach(function (column) {
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
        if (column.type === "radio") {
          // Left alone when nothing is checked, rather than blanked. `buildRowCell` always checks
          // something, so no-selection means the DOM is not what this code thinks it is — and keeping
          // the value the config already had is the answer that cannot lose data.
          var picked = el.querySelector("input:checked");
          if (picked) row[column.key] = picked.value;
        } else if (column.type === "list") {
          row[column.key] = p.textToList(el.value);
        } else if (column.type === "number") {
          var n = parseFloat(el.value, 10);
          row[column.key] = Number.isNaN(n) ? 0 : n;
        } else if (column.type === "select" && allNumericOptions(column)) {
          // A select over numbers reads back a number. A `<select>`'s value is always a string, so
          // picking *1.25 Major third* wrote `ratio: "1.25"` — which `resolveModularRatio` answers
          // with "unknown ratio" and an empty scale. The config also stops looking like the one that
          // shipped, and this is a file people read.
          var picked = parseFloat(el.value, 10);
          row[column.key] = Number.isNaN(picked) ? el.value : picked;
        } else if (column.type === "checkbox") {
          row[column.key] = !!el.checked;
        } else {
          row[column.key] = el.value;
        }
      });
      out.push(row);
    });
    return out;
  }

  function attachListeners(container, schema, onChange) {
    if (!onChange || typeof onChange !== "function") return;

    function getValues() {
      var vals = {};
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
        if (field) vals[n] = collectRows(wrap, field);
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
      function showWhenValueStr(v) {
        return v === undefined || v === null ? "" : String(v);
      }
      function visRules(row) {
        var rs = row.getAttribute("data-show-when-rules");
        if (rs) {
          try {
            var rules = JSON.parse(rs);
            for (var i = 0; i < rules.length; i++) {
              var cur = showWhenValueStr(vals[rules[i].field]);
              if (rules[i].values.indexOf(cur) === -1) return false;
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
      container.querySelectorAll(".config-ui-rows-item").forEach(function (item) {
        var own = {};
        item.querySelectorAll("[data-row-field]").forEach(function (el) {
          var key = el.getAttribute("data-row-field");
          if (!key) return;
          if (el.getAttribute("data-row-radio")) {
            var on = el.querySelector("input:checked");
            own[key] = on ? on.value : "";
          } else {
            own[key] = el.type === "checkbox" ? (el.checked ? "true" : "false") : el.value;
          }
        });
        item.querySelectorAll("[data-row-show-when]").forEach(function (cell) {
          var rules;
          try {
            rules = JSON.parse(cell.getAttribute("data-row-show-when"));
          } catch (e) {
            return;
          }
          var show = true;
          for (var i = 0; i < rules.length; i++) {
            if (rules[i].values.indexOf(showWhenValueStr(own[rules[i].field])) === -1) show = false;
          }
          cell.style.display = show ? "" : "none";
        });
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

    applyVisibility();
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
      if (typeof target.closest === "function" && target.closest("[data-collection-field]")) return true;
      if (typeof target.closest === "function" && target.closest("[data-mode-field]")) return true;
      return false;
    }

    container.addEventListener("change", function (e) {
      if (isControlEvent(e.target)) {
        applyVisibility();
        refreshModePickers();
        onChange(getValues());
      }
    });
    container.addEventListener("input", function (e) {
      if (isControlEvent(e.target) && e.target.type !== "checkbox") {
        applyVisibility();
        refreshModePickers();
        onChange(getValues());
      }
    });
    return {
      getValues: getValues,
      applyVisibility: applyVisibility,
      refreshModePickers: refreshModePickers,
    };
  }

  // The renderer's public API. `bridge.js` copies this object onto `window.CodeFigConfigUI` the same
  // way it copies the parser's, so adding a function here is the whole of publishing it.
  return {
    buildForm: buildForm,
    buildField: buildField,
    buildSection: buildSection,
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
  };
});
