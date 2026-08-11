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
    var lab = document.createElement("label");
    lab.className = "config-ui-field__label";
    lab.htmlFor = id;
    lab.textContent = l;
    if (tip) (wrap.title = tip), lab.classList.add("config-ui-field__label--has-tooltip");
    row.appendChild(lab);
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
    wrap.appendChild(row);
    return wrap;
  }

  function buildRow(r, idx) {
    if (r.type === "lineBreak") {
      var wr = document.createElement("div");
      wr.className = "config-ui-row config-ui-row--line-break";
      wr.setAttribute("aria-hidden", "true");
      return wr;
    }
    if (r.type === "divider") {
      var wr2 = document.createElement("div");
      wr2.className = "config-ui-row config-ui-row--divider";
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
    if (r.type === "field") {
      var wrap3 = document.createElement("div");
      wrap3.className = "config-ui-row config-ui-row--field";
      var frules = r.showWhenRules || (r.showWhen ? [r.showWhen] : []);
      if (frules && frules.length) {
        wrap3.setAttribute("data-show-when-rules", JSON.stringify(frules));
      }
      var f = {
        name: r.name,
        type: r.inputType,
        value: r.value,
        label: r.label,
        tooltip: r.tooltip,
        optionSource: r.optionSource,
        options: r.options,
        placeholder: r.placeholder,
        showWhenRules: r.showWhenRules,
        showWhen: r.showWhen,
      };
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
        var el = buildRow(r, r.type === "field" ? fieldIdx++ : 0);
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
        rowEl.className = "config-ui-rows-item";
        rowEl.setAttribute("data-row-index", String(index));

        (field.columns || []).forEach(function (column) {
          var cell = document.createElement("label");
          cell.className = "config-ui-rows-cell";
          var caption = document.createElement("span");
          caption.className = "config-ui-rows-cell-label";
          caption.textContent = column.label;
          cell.appendChild(caption);
          cell.appendChild(buildRowCell(column, row ? row[column.key] : undefined));
          rowEl.appendChild(cell);
        });

        var remove = document.createElement("button");
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
        body.appendChild(rowEl);

        if (tabBar) {
          var tab = document.createElement("button");
          tab.type = "button";
          tab.className = "config-ui-rows-tab";
          tab.textContent = rowLabel(row, index);
          tab.addEventListener("click", function () { selectTab(index); });
          tabBar.appendChild(tab);
        }
      });

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
            : column.type === "select" ? (column.options || [])[0] || ""
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

  function buildRowCell(column, value) {
    if (column.type === "select") {
      var sel = document.createElement("select");
      sel.className = "config-ui-input config-ui-input--select";
      sel.setAttribute("data-row-field", column.key);
      (column.options || []).forEach(function (opt) {
        var o = document.createElement("option");
        o.value = opt;
        o.textContent = opt;
        if (String(value) === opt) o.selected = true;
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
    input.className = "config-ui-input config-ui-input--text";
    input.setAttribute("data-row-field", column.key);
    input.value = value == null ? "" : String(value);
    return input;
  }

  /** The rows of one control, read back out of the DOM in their displayed order. */
  function collectRows(wrap, field) {
    var out = [];
    wrap.querySelectorAll(".config-ui-rows-item").forEach(function (rowEl) {
      var row = {};
      (field.columns || []).forEach(function (column) {
        var el = rowEl.querySelector('[data-row-field="' + column.key + '"]');
        if (!el) return;
        if (column.type === "number") {
          var n = parseFloat(el.value, 10);
          row[column.key] = Number.isNaN(n) ? 0 : n;
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
      container.querySelectorAll("[data-show-when-field]").forEach(function (row) {
        if (row.getAttribute("data-show-when-rules")) return;
        var field = row.getAttribute("data-show-when-field");
        var valsStr = row.getAttribute("data-show-when-values");
        var valsList = valsStr ? valsStr.split("|") : [];
        var cur = showWhenValueStr(vals[field]);
        row.style.display = valsList.indexOf(cur) !== -1 ? "" : "none";
      });
    }

    applyVisibility();
    container.addEventListener("change", function (e) {
      if (
        e.target.getAttribute("data-field") ||
        e.target.classList.contains("config-ui-multiselect-cb")
      ) {
        applyVisibility();
        onChange(getValues());
      }
    });
    container.addEventListener("input", function (e) {
      if (e.target.getAttribute("data-field") && e.target.type !== "checkbox") {
        applyVisibility();
        onChange(getValues());
      }
    });
    return { getValues: getValues, applyVisibility: applyVisibility };
  }

  return {
    buildForm: buildForm,
    buildField: buildField,
    buildSection: buildSection,
    attachListeners: attachListeners,
  };
});
