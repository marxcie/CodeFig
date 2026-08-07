(function (root, factory) {
  if (typeof define === "function" && define.amd) define([], factory);
  else if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.ConfigUIParser = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function inferType(v) {
    if (v === null || v === undefined) return "string";
    if (typeof v === "boolean") return "boolean";
    if (typeof v === "number" && !Number.isNaN(v)) return "number";
    if (typeof v === "string") return "string";
    if (Array.isArray(v)) return "array";
    if (typeof v === "object") return "object";
    return "string";
  }

  function labelFromName(n) {
    if (!n || typeof n !== "string") return "";
    return n
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, function (s) {
        return s.toUpperCase();
      })
      .trim();
  }

  /**
   * A value written the way a person writes one — bare keys, single quotes, trailing commas,
   * comments explaining the options — rewritten as strict JSON so `JSON.parse` can read it.
   *
   * **Never evaluated.** Config text arrives from pastes, from colleagues and from canvas text
   * layers, and this runs in the iframe. Evaluation would also quietly turn `4 * 2` into `8`,
   * which is a different value from the one someone wrote down.
   *
   * A character-by-character walk rather than regexes, because every interesting case is a
   * bracket, a comma or a `//` inside a string.
   */
  function looseJsonToJson(text) {
    var out = "";
    var stack = [];
    var expectKey = false;
    var i = 0;

    function dropTrailingComma() {
      var trimmed = out.replace(/\s+$/, "");
      if (trimmed.charAt(trimmed.length - 1) === ",") {
        out = trimmed.slice(0, -1);
      }
    }

    while (i < text.length) {
      var ch = text.charAt(i);
      var next = text.charAt(i + 1);

      if (ch === "/" && next === "/") {
        while (i < text.length && text.charAt(i) !== "\n") i++;
        continue;
      }
      if (ch === "/" && next === "*") {
        i += 2;
        while (i < text.length && !(text.charAt(i) === "*" && text.charAt(i + 1) === "/")) i++;
        i += 2;
        continue;
      }

      if (ch === '"' || ch === "'") {
        // Read the string's actual characters, resolving escapes as we go, and stringify once at
        // the end. Keeping the escapes and re-escaping afterwards double-escapes every quote —
        // `"say \"hi\""` then fails to parse and the whole value silently degrades to a string.
        var quote = ch;
        var value = "";
        i++;
        while (i < text.length && text.charAt(i) !== quote) {
          if (text.charAt(i) === "\\") {
            var escaped = text.charAt(i + 1);
            if (escaped === "n") value += "\n";
            else if (escaped === "t") value += "\t";
            else if (escaped === "r") value += "\r";
            else value += escaped;
            i += 2;
            continue;
          }
          value += text.charAt(i);
          i++;
        }
        i++;
        out += JSON.stringify(value);
        continue;
      }

      if (ch === "{") { stack.push("object"); expectKey = true; out += ch; i++; continue; }
      if (ch === "[") { stack.push("array"); expectKey = false; out += ch; i++; continue; }
      if (ch === "}" || ch === "]") { stack.pop(); expectKey = false; dropTrailingComma(); out += ch; i++; continue; }
      if (ch === ",") { expectKey = stack[stack.length - 1] === "object"; out += ch; i++; continue; }
      if (ch === ":") { expectKey = false; out += ch; i++; continue; }

      if (expectKey && /[A-Za-z_$]/.test(ch)) {
        var key = "";
        while (i < text.length && /[A-Za-z0-9_$]/.test(text.charAt(i))) {
          key += text.charAt(i);
          i++;
        }
        out += JSON.stringify(key);
        continue;
      }

      out += ch;
      i++;
    }
    return out;
  }

  function parseValue(s) {
    s = (s || "").trim();
    if (s === "true") return true;
    if (s === "false") return false;
    if (s === "null") return null;
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    if (/^-?\d*\.\d+([eE][+-]?\d+)?$/.test(s)) return parseFloat(s);
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
      return s
        .slice(1, -1)
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"')
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r");
    if ((s.startsWith("[") && s.endsWith("]")) || (s.startsWith("{") && s.endsWith("}"))) {
      try {
        return JSON.parse(s);
      } catch (_) {}
      try {
        return JSON.parse(looseJsonToJson(s));
      } catch (_) {
        return s;
      }
    }
    return s;
  }

  /**
   * Is this bracket real, or inside a string? Only the real ones count towards depth — a value
   * holding "] not the end" must not finish there.
   */
  function scanBrackets(text, state) {
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (state.quote) {
        if (ch === "\\") i++;
        else if (ch === state.quote) state.quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") { state.quote = ch; continue; }
      if (ch === "[" || ch === "{") state.depth++;
      else if (ch === "]" || ch === "}") state.depth--;
    }
    return state;
  }

  /**
   * A `var x = ...;` whose value runs past the end of its line.
   *
   * Returns a match in the same shape the one-line regex produces, plus the line it ended on, or
   * null when the value never closes — in which case the caller leaves it alone. Guessing at the
   * end would fail quietly by matching the wrong thing; the one-line regex at least failed loudly
   * by not matching at all.
   */
  function readMultiLineValue(lines, start) {
    var head = lines[start].match(/^\s*var\s+(\w+)\s*=\s*([\s\S]*)$/);
    if (!head) return null;

    var state = { depth: 0, quote: null };
    var collected = head[2];
    scanBrackets(collected, state);
    if (state.depth <= 0) return null;

    for (var i = start + 1; i < lines.length; i++) {
      scanBrackets(lines[i], state);
      collected += "\n" + lines[i];
      if (state.depth <= 0) {
        var closed = collected.match(/^([\s\S]*?)\s*;(?:\s*\/\/\s*(.*))?\s*$/);
        if (!closed) return null;
        // match[0] is the whole statement, not just the value: it is what serialize writes back
        // verbatim when the field was never edited.
        return {
          match: [lines.slice(start, i + 1).join("\n"), head[1], closed[1], closed[2]],
          endLine: i
        };
      }
    }
    return null;
  }

  function parse(code) {
    var rows = [];
    var lines = (code || "").split(/\r?\n/);
    var i = 0;
    var lastWasBlank = true;

    while (i < lines.length) {
      var line = lines[i];
      var t = line.trim();
      if (!t) {
        // A blank line has never produced a row — which is why shipped scripts use a bare `//`
        // as a spacer, and why serialize used to swallow the empty lines a person left in their
        // config. It gets a row of its own so it survives, with a type the renderer does not
        // know: `buildRow` returns an empty div for those, so a form looks exactly as it did.
        rows.push({ type: "blank", raw: line });
        lastWasBlank = true;
        i++;
        continue;
      }
      if (t.startsWith("//")) {
        var c = t.slice(2).trim();
        if (!c) {
          rows.push({ type: "lineBreak", raw: line });
          lastWasBlank = true;
          i++;
          continue;
        }
        if (/^\s*var\s+/.test(c) || /^=+$/.test(c)) {
          i++;
          continue;
        }
        var hm = c.match(/^(#+)\s+(.*)$/);
        if (hm) {
          var lvl = hm[1].length;
          var hrest = (hm[2] || "").replace(/^=\s*|\s*=$/g, "").trim();
          var hSwRe = /@showWhen:\s*(\w+)\s*=\s*([\w|]+)/g;
          var hSwAll = [];
          var hm2;
          while ((hm2 = hSwRe.exec(hrest)) !== null) {
            hSwAll.push({
              field: hm2[1],
              values: hm2[2]
                .split("|")
                .map(function (s) {
                  return s.trim();
                })
                .filter(Boolean),
            });
          }
          var htext = hrest.replace(/\s+@showWhen:\s*\w+\s*=\s*[\w|]+/g, "").trim();
          rows.push({
            type: "heading",
            level: lvl,
            text: htext,
            raw: line,
            showWhenRules: hSwAll.length ? hSwAll : undefined,
          });
          lastWasBlank = false;
          i++;
          continue;
        }
        if (/^(---|\*\*\*|___)\s*$/.test(c)) {
          rows.push({ type: "divider", raw: line });
          lastWasBlank = false;
          i++;
          continue;
        }
        var pSwRe = /@showWhen:\s*(\w+)\s*=\s*([\w|]+)/g;
        var pSwAll = [];
        var psm;
        while ((psm = pSwRe.exec(c)) !== null) {
          pSwAll.push({
            field: psm[1],
            values: psm[2]
              .split("|")
              .map(function (s) {
                return s.trim();
              })
              .filter(Boolean),
          });
        }
        var ptext = c.replace(/\s+@showWhen:\s*\w+\s*=\s*[\w|]+/g, "").trim();
        var hasShowWhen = pSwAll.length > 0;
        if (hasShowWhen || lastWasBlank || !rows.length || rows[rows.length - 1].type !== "paragraph") {
          rows.push({
            type: "paragraph",
            text: ptext,
            raw: line,
            showWhenRules: pSwAll.length ? pSwAll : undefined,
          });
        } else {
          rows[rows.length - 1].text += "\n" + ptext;
          rows[rows.length - 1].raw += "\n" + line;
        }
        lastWasBlank = false;
        i++;
        continue;
      }
      // A value may span lines. Accumulate from `var x =` until the brackets balance on a
      // closing `];` or `};`, then read the span as one. The annotation follows the semicolon,
      // wherever that lands — one rule, not two.
      var m = t.match(/^\s*var\s+(\w+)\s*=\s*(.+?)\s*;(?:\s*\/\/\s*(.*))?$/);
      if (!m && /^\s*var\s+\w+\s*=/.test(t)) {
        var span = readMultiLineValue(lines, i);
        if (span) {
          m = span.match;
          i = span.endLine;
        } else {
          // A value that never closes is not a field, but it is still the user's text. Keep it
          // verbatim so serialize writes it back: emitting only what parsed is how this
          // serializer has always deleted things.
          rows.push({ type: "unparsed", text: line });
          lastWasBlank = false;
          i++;
          continue;
        }
      }
      if (m) {
        var val = parseValue(m[2].trim());
        var tip = (m[3] || "").trim();
        var phMatch = tip.match(/@placeholder\s*=\s*["']([^"']*)["']/);
        if (phMatch) {
          tip = tip.replace(/@placeholder\s*=\s*["'][^"']*["']/g, "").trim();
        }
        var optsMatch = tip.match(/@options:\s*(.+?)(?=\s+@|$)/);
        var inputType = inferType(val);
        if (optsMatch) {
          inputType = tip.match(/@radio/) ? "radio" : "select";
        }
        if (tip.match(/@textarea/)) {
          inputType = "textarea";
        }
        if (tip.match(/@multi\b/)) {
          inputType = "multiselect";
        }
        // An object, or an array no control has claimed, has nowhere to be edited: it used to
        // fall through to a text input holding "[object Object]" or "px,xs", which getValues
        // then collected and serialize wrote back over the real value — triggered by editing any
        // other field, since the whole block is serialised on every change. Marked here, rendered
        // read-only, and deliberately not collected.
        if (inputType === "object" || inputType === "array") {
          inputType = "unsupported";
        }
        var labelMatch = tip.match(/@label:\s*(.+?)(?=\s+@|$)/);
        var fieldLabel = labelFromName(m[1]);
        if (labelMatch) {
          fieldLabel = labelMatch[1].trim();
          tip = tip.replace(/@label:\s*.+?(?=\s+@|$)/, "").trim();
        }
        var f = {
          type: "field",
          name: m[1],
          value: val,
          label: fieldLabel,
          tooltip: tip,
          inputType: inputType,
        };
        if (phMatch) f.placeholder = phMatch[1];
        // Exactly as the user wrote it. serialize() re-emits this verbatim unless the form
        // actually changed the value, so bare keys, single quotes and the comments explaining
        // each option all survive a form interaction untouched.
        f.raw = m[0].indexOf("\n") === -1 ? line : m[0];
        // Anything annotation-shaped that this parser has no meaning for is carried through
        // untouched. `@rows` survives here before the control that reads it exists, and so does
        // whatever a later plan adds.
        var known = /^@(options|radio|multi|textarea|label|showWhen|placeholder|fromFile)\b/;
        var unknown = tip.match(/@[A-Za-z][\w-]*(?::[^@]*)?/g) || [];
        var carried = unknown
          .map(function (token) { return token.trim(); })
          .filter(function (token) { return !known.test(token); });
        if (carried.length) f.unknownAnnotations = carried;
        // Where this field's value comes from when the user presses sync — a path into the
        // foundation's v1 config. Nothing reads the file unless that button is pressed.
        var fromFileMatch = tip.match(/@fromFile:\s*([A-Za-z0-9_$.]+)/);
        if (fromFileMatch) f.fromFile = fromFileMatch[1];
        if (optsMatch) {
          var optsVal = optsMatch[1]
            .trim()
            .replace(/\s*@radio\b/gi, "")
            .replace(/\s*@multi\b/gi, "")
            .trim();
          if (optsVal.indexOf("|") >= 0) {
            f.options = optsVal.split("|").map(function (s) {
              return s.trim();
            });
          } else {
            f.optionSource = optsVal;
          }
        }
        var swRe = /@showWhen:\s*(\w+)\s*=\s*([\w|]+)/g;
        var swAll = [];
        var swm;
        while ((swm = swRe.exec(tip)) !== null) {
          swAll.push({
            field: swm[1],
            values: swm[2]
              .split("|")
              .map(function (s) {
                return s.trim();
              })
              .filter(Boolean),
          });
        }
        if (swAll.length) f.showWhenRules = swAll;
        rows.push(f);
        lastWasBlank = false;
        i++;
        continue;
      }
      i++;
    }
    return { rows: rows };
  }

  function serialize(schema, values) {
    if (!schema || !schema.rows) return "";
    var out = [];
    var vm = values || {};

    /**
     * Objects, and arrays holding them, are written one value per line — the same shape
     * formatConfigBlock produces for the clipboard, so the two agree by construction. Arrays of
     * primitives stay inline, where a line each would be noise.
     */
    function fmt(v) {
      if (v === null) return "null";
      if (typeof v === "boolean") return v ? "true" : "false";
      if (typeof v === "number") return String(v);
      if (typeof v === "string") return JSON.stringify(v);
      if (Array.isArray(v)) {
        var holdsObjects = v.some(function (item) {
          return item !== null && typeof item === "object";
        });
        return holdsObjects ? JSON.stringify(v, null, 2) : JSON.stringify(v);
      }
      if (typeof v === "object") {
        return Object.keys(v).length === 0 ? "{}" : JSON.stringify(v, null, 2);
      }
      return JSON.stringify(v);
    }

    schema.rows.forEach(function (r) {
      // Everything that is not an edited field is written back exactly as it was written, before
      // any branch gets a chance to regenerate it. A config block is something a person reads:
      // its indentation, its spacing and the comments explaining each option are part of it, and
      // rebuilding them from a parsed shape drops whatever the parser had no field for.
      if (r.type !== "field" && typeof r.raw === "string") {
        out.push(r.raw);
        return;
      }
      if (r.type === "lineBreak") {
        out.push("//");
        return;
      }
      if (r.type === "divider") {
        out.push("// ---");
        return;
      }
      if (r.type === "heading") {
        var prefix = r.level >= 3 ? "###" : r.level === 2 ? "##" : "#";
        var hl = "// " + prefix + (prefix.length ? " " : "") + r.text;
        var hr = r.showWhenRules || (r.showWhen ? [r.showWhen] : []);
        if (hr && hr.length)
          hr.forEach(function (rule) {
            hl += " @showWhen: " + rule.field + "=" + rule.values.join("|");
          });
        out.push(hl);
        return;
      }
      if (r.type === "paragraph") {
        var plines = r.text.split("\n");
        plines.forEach(function (l, idx) {
          var pl = "// " + l;
          if (idx === plines.length - 1) {
            var pr = r.showWhenRules || (r.showWhen ? [r.showWhen] : []);
            if (pr && pr.length) {
              pr.forEach(function (rule) {
                pl += " @showWhen: " + rule.field + "=" + rule.values.join("|");
              });
            }
          }
          out.push(pl);
        });
        return;
      }
      if (r.type === "unparsed") {
        out.push(r.text);
        return;
      }
      if (r.type === "field") {
        var v = vm[r.name];
        // Untouched means untouched: only a value the form actually edited is rewritten.
        if (typeof r.raw === "string" && (v === undefined || JSON.stringify(v) === JSON.stringify(r.value))) {
          out.push(r.raw);
          return;
        }
        if (v === undefined) v = r.value;
        if (r.inputType === "multiselect" && !Array.isArray(v)) {
          v = v != null && String(v).trim() !== "" ? [String(v)] : [];
        }
        var parts = [];
        if (r.options && r.options.length) parts.push("@options: " + r.options.join("|"));
        else if (r.optionSource) parts.push("@options: " + r.optionSource);
        if (r.inputType === "radio") parts.push("@radio");
        if (r.inputType === "multiselect") parts.push("@multi");
        if (r.inputType === "textarea") parts.push("@textarea");
        // Emitted before @label so the annotation order stays stable across a round trip; a
        // dropped @fromFile would silently remove the sync button from the script.
        if (r.fromFile) parts.push("@fromFile: " + r.fromFile);
        if (r.label && r.label !== labelFromName(r.name)) parts.push("@label: " + r.label);
        var sr = r.showWhenRules || (r.showWhen ? [r.showWhen] : []);
        if (sr && sr.length)
          sr.forEach(function (rule) {
            parts.push("@showWhen: " + rule.field + "=" + rule.values.join("|"));
          });
        if (r.placeholder)
          parts.push(
            '@placeholder="' +
              r.placeholder.replace(/\\/g, "\\\\").replace(/"/g, '\\"') +
              '"'
          );
        if (r.unknownAnnotations && r.unknownAnnotations.length) {
          parts = parts.concat(r.unknownAnnotations);
        }
        var comment = parts.length ? " // " + parts.join(" ") : "";
        out.push("var " + r.name + " = " + fmt(v) + ";" + comment);
      }
    });
    return out.join("\n").trim();
  }

  // ---------------------------------------------------------------------------
  // Loading the file's config into a form — what one press of the sync button changes.
  //
  // No precedence and no dirty tracking: the form never fills itself, so a click is the only
  // way the file is ever read and there is nothing to arbitrate. The whole job is to say, field
  // by field, what changed — a button that silently rewrites six fields is a surprise in a
  // different costume.
  // ---------------------------------------------------------------------------

  function rowsOf(schema) {
    if (Array.isArray(schema)) return schema;
    return (schema && Array.isArray(schema.rows)) ? schema.rows : [];
  }

  /** `domains.spacing.tokens` against the payload, or undefined if any step is missing. */
  function valueAtPath(payload, path) {
    var parts = String(path || "").split(".");
    var cursor = payload;
    for (var i = 0; i < parts.length; i++) {
      if (cursor === null || typeof cursor !== "object") return undefined;
      if (!Object.prototype.hasOwnProperty.call(cursor, parts[i])) return undefined;
      cursor = cursor[parts[i]];
    }
    return cursor;
  }

  /**
   * Coerce a value from the file into what this control can hold, or return undefined to refuse.
   * Refusing is reported; guessing would put a shape into a control that cannot show it.
   */
  function valueForControl(field, value) {
    var t = field.inputType;
    if (value === undefined || value === null) return undefined;
    if (t === "boolean") return typeof value === "boolean" ? value : undefined;
    if (t === "number") return typeof value === "number" ? value : undefined;
    if (t === "multiselect") return Array.isArray(value) ? value.map(String) : undefined;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    // A list or an object reaching a text control is how a token list arrives: show it as the
    // JSON the control already holds for that kind of field.
    if (typeof value === "object") {
      var current = field.value;
      var currentLooksJson = typeof current === "string" && /^[\[{]/.test(current.trim());
      if (currentLooksJson || Array.isArray(value)) return JSON.stringify(value);
      return undefined;
    }
    return undefined;
  }

  function loadSummary(changes, unchanged, mismatches) {
    var parts = [];
    if (changes.length === 0) {
      parts.push("Nothing to load — this file matches the form already.");
    } else {
      parts.push("Loaded " + changes.length + " field" + (changes.length === 1 ? "" : "s") +
        ": " + changes.map(function (c) { return c.name; }).join(", ") + ".");
    }
    if (unchanged.length > 0) {
      parts.push(unchanged.length + " unchanged.");
    }
    if (mismatches.length > 0) {
      parts.push(mismatches.length + " could not be read: " +
        mismatches.map(function (m) { return m.name; }).join(", ") + ".");
    }
    if (changes.length > 0) {
      parts.push("These values are in the editor only — the file stays as it is until you run the script.");
    }
    return parts.join(" ");
  }

  /**
   * Apply a v1 config payload to a form's values.
   * → { values, changes: [{name, from, to}], unchanged: [{name, reason}], mismatches, summary }
   */
  function applyFileConfig(schema, currentValues, payload) {
    var rows = rowsOf(schema);
    var values = {};
    var key;
    for (key in currentValues || {}) {
      if (Object.prototype.hasOwnProperty.call(currentValues, key)) values[key] = currentValues[key];
    }

    var changes = [];
    var unchanged = [];
    var mismatches = [];
    var usable = payload && typeof payload === "object" && !Array.isArray(payload);

    for (var i = 0; i < rows.length; i++) {
      var field = rows[i];
      if (field.type !== "field" || !field.fromFile) continue;

      var raw = usable ? valueAtPath(payload, field.fromFile) : undefined;
      if (raw === undefined) {
        unchanged.push({ name: field.name, reason: "not in this file" });
        continue;
      }
      var next = valueForControl(field, raw);
      if (next === undefined) {
        mismatches.push({ name: field.name, path: field.fromFile });
        continue;
      }
      var before = values[field.name] !== undefined ? values[field.name] : field.value;
      if (JSON.stringify(before) === JSON.stringify(next)) {
        unchanged.push({ name: field.name, reason: "same as the form" });
        continue;
      }
      values[field.name] = next;
      changes.push({ name: field.name, from: before, to: next, path: field.fromFile });
    }

    return {
      values: values,
      changes: changes,
      unchanged: unchanged,
      mismatches: mismatches,
      summary: loadSummary(changes, unchanged, mismatches)
    };
  }

  /**
   * The import button's whole state, derived in one place from the two things that decide it:
   * what the open script's config block declares, and what the file was last found to hold.
   *
   * It replaced three cached booleans — has-annotation, probe-found-something and
   * taken-this-session — computed at different moments and invalidated by nothing. A CLI run
   * writing a manifest behind the UI's back made all three disagree at once: the dot said "you
   * already took it" about a config that had just changed. State that contradicts itself is
   * exactly the silent-failure class these tests exist for, so the derivation is pure and the
   * caller only decides *when* to ask.
   *
   * probe: { checked, hasRegistry, domains: { spacing: true, … } }
   * → { path, domain, visible, dot, reason }
   */
  function configImportState(configBlock, probe) {
    var state = { path: null, domain: null, visible: false, dot: false, reason: "no-annotation" };
    var text = typeof configBlock === "string" ? configBlock : "";
    var declared = /@fromFile:\s*([A-Za-z0-9_$.]+)/.exec(text);
    if (!declared) return state;

    state.path = declared[1];
    var domain = /^domains\.([A-Za-z0-9_$]+)/.exec(state.path);
    state.domain = domain ? domain[1] : null;

    var p = probe || {};
    if (!p.checked) {
      // Nothing has been read yet. Not "no config" — a different answer, and the button stays
      // out of the way rather than claiming either.
      state.reason = "not-checked";
      return state;
    }

    // A block naming a domain asks about that domain. A form whose fields carry their own paths
    // reads top-level v1 fields, which the registry alone can satisfy.
    var available = state.domain ? !!(p.domains || {})[state.domain] : !!p.hasRegistry;
    state.visible = available;
    state.dot = available;
    state.reason = available
      ? "available"
      : (state.domain ? "no-config-for-domain" : "no-foundation");
    return state;
  }

  /** Does this config block declare any field that can be loaded from the file? */
  function hasFileFields(schema) {
    var rows = rowsOf(schema);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].type === "field" && rows[i].fromFile) return true;
    }
    return false;
  }

  return {
    parse: parse,
    serialize: serialize,
    inferType: inferType,
    parseValue: parseValue,
    applyFileConfig: applyFileConfig,
    hasFileFields: hasFileFields,
    configImportState: configImportState
  };
});
