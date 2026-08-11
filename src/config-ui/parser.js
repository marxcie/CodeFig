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
      // A `//` comment runs to end of line, and every caller passes at most one line, so the rest
      // of this text is prose. `// Array ["s", "m", "l"] or a template` is a real line in a shipped
      // config block: counting its brackets as structure would leave the reader hunting for a
      // closing brace that does not exist.
      if (ch === "/" && text.charAt(i + 1) === "/") return state;
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

  /**
   * `name:text|appliesTo:text|min:number|model:(metric|modular)` → the columns of a `@rows` control.
   *
   * One control with two renderings, not two controls. A parallel "tab" control would need its own
   * serialization and would drift from this one the first time either changed; a rendering choice
   * cannot drift from the data it renders.
   *
   * A parenthesised list is a fixed set of options for that column, reusing the option plumbing the
   * flat controls already have rather than inventing a second mechanism. Parentheses because the
   * column separator is `|`, so options cannot also be `|`-delimited at the top level.
   */
  function parseRowColumns(spec) {
    var columns = [];
    var depth = 0;
    var current = "";
    var parts = [];
    for (var i = 0; i < spec.length; i++) {
      var ch = spec.charAt(i);
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "|" && depth === 0) { parts.push(current); current = ""; continue; }
      current += ch;
    }
    if (current.trim()) parts.push(current);

    for (var p = 0; p < parts.length; p++) {
      var text = parts[p].trim();
      if (!text) continue;
      var at = text.indexOf(":");
      var key = (at === -1 ? text : text.slice(0, at)).trim();
      var typeText = (at === -1 ? "text" : text.slice(at + 1)).trim();
      if (!key) continue;

      var column = { key: key, label: labelFromName(key), type: "text" };
      var optionMatch = typeText.match(/^\((.*)\)$/);
      if (optionMatch) {
        column.type = "select";
        column.options = optionMatch[1].split("|").map(function (o) { return o.trim(); })
          .filter(function (o) { return o.length > 0; });
      } else if (typeText === "number" || typeText === "checkbox" || typeText === "text") {
        column.type = typeText;
      }
      columns.push(column);
    }
    return columns;
  }

  /**
   * A trailing `// comment`, split off without being fooled by one inside a string.
   *
   * The `var` path uses a regex for this and is wrong for `nameTemplate: "https://x"`. The property
   * path does not inherit that, because a config block is exactly where a URL or a path shows up.
   */
  function scanPropertyValue(text) {
    var depth = 0;
    var quote = null;
    var i = 0;
    var end = -1;
    var comment = null;
    var comma = false;

    while (i < text.length) {
      var ch = text.charAt(i);
      var next = text.charAt(i + 1);
      if (quote) {
        if (ch === "\\") { i += 2; continue; }
        if (ch === quote) quote = null;
        i++;
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; i++; continue; }
      if (ch === "/" && next === "/") {
        var nl = text.indexOf("\n", i);
        if (depth === 0) {
          // The value ended before this. At depth 0 a comment is the entry's annotation.
          end = i;
          comment = (nl === -1 ? text.slice(i + 2) : text.slice(i + 2, nl)).trim();
          break;
        }
        // Inside the value: prose between an object's own keys, which is most of a config block.
        // Taking the first `//` in the whole span is what read `fontScaling: {` as the string
        // `"{"` and lost typography's scaling settings.
        i = nl === -1 ? text.length : nl;
        continue;
      }
      if (ch === "[" || ch === "{" || ch === "(") { depth++; i++; continue; }
      if (ch === "]" || ch === "}" || ch === ")") { depth--; i++; continue; }
      if (ch === "," && depth === 0) {
        end = i;
        comma = true;
        // A comment after the comma, on the same line, belongs to this entry. On a later line it
        // belongs to whatever comes next.
        var rest = text.slice(i + 1);
        var at = rest.indexOf("//");
        if (at !== -1 && rest.slice(0, at).indexOf("\n") === -1) {
          var stop = rest.indexOf("\n", at);
          comment = (stop === -1 ? rest.slice(at + 2) : rest.slice(at + 2, stop)).trim();
        }
        break;
      }
      i++;
    }
    if (end === -1) end = text.length;
    return { body: text.slice(0, end), comment: comment, comma: comma };
  }

  /** `key:` or `"key":` at the head of a line → the key, or null. */
  function propertyKeyAt(line) {
    var m = line.match(/^\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))\s*:/);
    if (!m) return null;
    return { key: m[1] || m[2] || m[3], length: m[0].length };
  }

  /**
   * One entry of a **property list** — the shape a `@CONFIG_START` block has:
   *
   *     collectionName: "Responsive System",
   *     modes: [
   *       { name: "desktop" }
   *     ],
   *
   * The form could previously only read `var x = …;` rows, so an object-literal config produced no
   * fields at all and every Design System Foundations script was formless. Migrating those blocks to
   * `var` rows was the alternative, and it would have changed what a user pastes — the one thing
   * that must not break. So the reader learns the second syntax instead.
   *
   * → { match: [whole, key, valueText, annotation], endLine, trailingComma }
   */
  function readPropertyEntry(lines, start) {
    var head = propertyKeyAt(lines[start]);
    if (!head) return null;

    var state = { depth: 0, quote: null };
    var first = lines[start].slice(head.length);
    scanBrackets(first, state);

    var collected = first;
    var end = start;
    while (state.depth > 0) {
      end++;
      if (end >= lines.length) return null;
      scanBrackets(lines[end], state);
      collected += "\n" + lines[end];
    }

    var split = scanPropertyValue(collected);
    return {
      match: [lines.slice(start, end + 1).join("\n"), head.key, split.body.trim(), split.comment],
      endLine: end,
      trailingComma: split.comma
    };
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
      var syntax = "var";
      var trailingComma = false;
      if (!m && !/^\s*var\s+\w+\s*=/.test(t) && propertyKeyAt(t)) {
        // A property list, the shape `@CONFIG_START` uses.
        var entry = readPropertyEntry(lines, i);
        if (entry) {
          m = entry.match;
          i = entry.endLine;
          syntax = "property";
          trailingComma = entry.trailingComma;
        }
      }
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
        // A repeatable group: a list of objects, edited as rows. Claimed before the fallback
        // below, which is what an unclaimed array falls into.
        var rowsMatch = tip.match(/@rows:\s*(.+?)(?=\s+@|$)/);
        var rowColumns = null;
        if (rowsMatch && Array.isArray(val)) {
          rowColumns = parseRowColumns(rowsMatch[1]);
          if (rowColumns.length > 0) inputType = "rows";
        }
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
        // Which syntax this row was written in, so serialize puts it back the same way. A block is
        // one or the other in practice, but recording it per row means a mixed block round-trips too.
        f.syntax = syntax;
        if (syntax === "property") f.trailingComma = trailingComma;
        if (inputType === "rows") {
          f.columns = rowColumns;
          // A display choice on one control. Same values, same serialization.
          f.tabs = /@tabs\b/.test(tip);
        }
        // Exactly as the user wrote it. serialize() re-emits this verbatim unless the form
        // actually changed the value, so bare keys, single quotes and the comments explaining
        // each option all survive a form interaction untouched.
        f.raw = m[0].indexOf("\n") === -1 ? line : m[0];
        // Anything annotation-shaped that this parser has no meaning for is carried through
        // untouched. `@rows` survives here before the control that reads it exists, and so does
        // whatever a later plan adds.
        var known = /^@(options|radio|multi|textarea|label|showWhen|placeholder|fromFile|rows|tabs)\b/;
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
        if (r.inputType === "rows" && r.columns) {
          parts.push("@rows: " + r.columns.map(function (c) {
            if (c.type === "select") return c.key + ":(" + (c.options || []).join("|") + ")";
            return c.key + ":" + c.type;
          }).join("|"));
          if (r.tabs) parts.push("@tabs");
        }
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
        if (r.syntax === "property") {
          out.push(r.name + ": " + fmt(v) + (r.trailingComma ? "," : "") + comment);
        } else {
          out.push("var " + r.name + " = " + fmt(v) + ";" + comment);
        }
      }
    });
    // Trailing whitespace only. `.trim()` also removed the **first** line's indentation, which is
    // invisible on a `@UI_CONFIG` block (those start at column 0) and ragged on a `@CONFIG_START`
    // one, where every other line keeps the indent `raw` preserved. `mergeConfigIntoMain` strips and
    // re-adds the trailing newline itself, so nothing downstream wanted the leading trim.
    return out.join("\n").replace(/\s+$/, "");
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


  // ==========================================================================
  // FILLING A CONFIG BLOCK FROM A FILE
  //
  // The block is the human format — comments, key order and nesting are the point. So import does
  // not print a new block; it fills values into the one the script already ships, and everything
  // it had no value for comes out byte-identical.
  //
  // Values are the easy half. Shape is the hard half, and it has three directions:
  //
  //   1. shapes match          → substitute in place
  //   2. file has more entries → insert one, in the style of the nearest sibling
  //   3. block has more        → remove it, and the comments attached to it
  //
  // Direction 3 is the one to be loud about. A comment was written for the entry it sits above,
  // so leaving it behind would describe something that is no longer there — and deleting an
  // annotated `tablet` block because an imported config had two viewports is a loss you find a
  // week later. Every removal is reported by name with the comment lines that went with it.
  //
  // A key the payload never mentions is NOT direction 3. "The file does not say" and "the file
  // says there are two of these" are different statements; only the second is about shape.
  // ==========================================================================

  /** Split an object body or array body on commas at its own depth, ignoring strings and comments. */
  function splitConfigItems(inner) {
    var items = [];
    var depth = 0, start = 0, i = 0;
    var inString = null, inLine = false, inBlock = false;

    while (i < inner.length) {
      var c = inner.charAt(i), n = inner.charAt(i + 1);
      if (inLine) { if (c === "\n") inLine = false; i++; continue; }
      if (inBlock) { if (c === "*" && n === "/") { inBlock = false; i += 2; continue; } i++; continue; }
      if (inString) {
        if (c === "\\") { i += 2; continue; }
        if (c === inString) inString = null;
        i++; continue;
      }
      if (c === "/" && n === "/") { inLine = true; i += 2; continue; }
      if (c === "/" && n === "*") { inBlock = true; i += 2; continue; }
      if (c === '"' || c === "'") { inString = c; i++; continue; }
      if (c === "[" || c === "{" || c === "(") { depth++; i++; continue; }
      if (c === "]" || c === "}" || c === ")") { depth--; i++; continue; }
      if (c === "," && depth === 0) { items.push(inner.slice(start, i)); start = i + 1; i++; continue; }
      i++;
    }

    var rest = inner.slice(start);
    // Whitespace and comments after the final comma are the body's, not an item's.
    var hadTrailingComma = false;
    if (rest.replace(/\s|\/\/[^\n]*/g, "").length > 0) { items.push(rest); rest = ""; }
    else if (items.length > 0) hadTrailingComma = true;
    return { items: items, tail: rest, trailingComma: hadTrailingComma };
  }

  /**
   * A comment sitting on the same line as the previous item's comma belongs to that item, not to
   * the one whose slice it happens to start.
   */
  function reattachTrailingComments(items) {
    for (var i = 1; i < items.length; i++) {
      var nl = items[i].indexOf("\n");
      if (nl === -1) continue;
      var head = items[i].slice(0, nl);
      if (head.indexOf("//") === -1) continue;
      items[i - 1] = items[i - 1] + "," + head;
      items[i] = items[i].slice(nl);
      // The comma is now inside the previous item, so the joiner must not add a second one.
      items[i - 1] = { text: items[i - 1], joined: true };
    }
    return items.map(function (it) { return typeof it === "string" ? { text: it, joined: false } : it; });
  }

  /** The comment lines an item owns: the unbroken run of `//` lines at its head. */
  function itemComments(text) {
    var lines = text.split("\n");
    var found = [];
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (t === "") continue;
      if (t.indexOf("//") === 0) { found.push(t); continue; }
      break;
    }
    return found;
  }

  /** `  key: value` → the key, unquoted. Null when the item is not a property. */
  function itemKey(text) {
    var stripped = text.replace(/^(\s*\/\/[^\n]*\n)+/, "");
    var m = stripped.match(/^\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))\s*:/);
    if (!m) return null;
    return m[1] || m[2] || m[3];
  }

  /** The source offset where an item's value begins, i.e. just after its `key:`. */
  function itemValueStart(text) {
    var stripped = text.replace(/^(\s*\/\/[^\n]*\n)+/, "");
    var offset = text.length - stripped.length;
    var m = stripped.match(/^\s*(?:"[^"]+"|'[^']+'|[A-Za-z_$][\w$]*)\s*:/);
    return m ? offset + m[0].length : -1;
  }

  /** The indentation of the first non-blank, non-comment line of an item. */
  function itemIndent(text) {
    var lines = text.split("\n");
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (t === "" || t.indexOf("//") === 0) continue;
      return lines[i].slice(0, lines[i].length - lines[i].replace(/^\s*/, "").length);
    }
    return "";
  }

  /** A value as a config block writes it: double quotes, no JSON pretty-printer look. */
  function formatConfigValue(value, indent, multiline) {
    if (value === null) return "null";
    if (typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) {
      var scalars = value.every(function (v) {
        return v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean";
      });
      if (value.length === 0) return "[]";
      if (scalars) {
        if (!multiline) {
          return "[" + value.map(function (v) { return formatConfigValue(v, indent); }).join(", ") + "]";
        }
        return "[\n" + value.map(function (v) {
          return indent + "  " + formatConfigValue(v, indent + "  ");
        }).join(",\n") + "\n" + indent + "]";
      }
      var entries = value.map(function (v) {
        return indent + "  " + formatConfigValue(v, indent + "  ");
      });
      return "[\n" + entries.join(",\n") + "\n" + indent + "]";
    }
    if (value && typeof value === "object") {
      var keys = Object.keys(value);
      if (keys.length === 0) return "{}";
      var props = keys.map(function (k) {
        return indent + "  " + k + ": " + formatConfigValue(value[k], indent + "  ");
      });
      return "{\n" + props.join(",\n") + "\n" + indent + "}";
    }
    return "null";
  }

  /**
   * A new entry, written the way its nearest sibling is written: the sibling's key order, and its
   * choice of inline or expanded for each nested object. An insert that looks foreign is a diff
   * you have to read twice to see is only an addition.
   */
  function formatLikeSibling(value, sibling, indent) {
    if (!sibling || !value || typeof value !== "object" || Array.isArray(value)) {
      return formatConfigValue(value, indent);
    }
    var order = [];
    var inline = {};
    var body = sibling.replace(/^\s*\{/, "").replace(/\}\s*$/, "");
    var parts = splitConfigItems(body).items;
    for (var i = 0; i < parts.length; i++) {
      var k = itemKey(parts[i]);
      if (!k || !Object.prototype.hasOwnProperty.call(value, k) || order.indexOf(k) !== -1) continue;
      order.push(k);
      var at = itemValueStart(parts[i]);
      if (at !== -1) inline[k] = parts[i].slice(at).replace(/\/\/[^\n]*/g, "").indexOf("\n") === -1;
    }
    var rest = Object.keys(value).filter(function (k) { return order.indexOf(k) === -1; });

    var keys = order.concat(rest);
    if (keys.length === 0) return "{}";
    var props = keys.map(function (k) {
      var v = value[k];
      var written = (inline[k] && v && typeof v === "object" && !Array.isArray(v))
        ? inlineObject(v)
        : formatConfigValue(v, indent + "  ");
      return indent + "  " + k + ": " + written;
    });
    return "{\n" + props.join(",\n") + "\n" + indent + "}";
  }

  /** `{ level: "xs", size: 4 }` — one line, because that is how the block next to it is written. */
  function inlineObject(value) {
    var keys = Object.keys(value);
    if (keys.length === 0) return "{}";
    return "{ " + keys.map(function (k) {
      return k + ": " + formatConfigValue(value[k], "");
    }).join(", ") + " }";
  }

  /** How an entry is recognised across the two shapes: by name if it has one, else by position. */
  function entryIdentity(value) {
    if (value && typeof value === "object" && typeof value.name === "string") {
      return value.name.trim().toLowerCase();
    }
    return null;
  }

  function fillArrayValue(valueText, list, path, report) {
    var open = valueText.indexOf("[");
    var close = valueText.lastIndexOf("]");
    if (open === -1 || close === -1) return valueText;

    var head = valueText.slice(0, open + 1);
    var tailText = valueText.slice(close);
    var split = splitConfigItems(valueText.slice(open + 1, close));
    var items = reattachTrailingComments(split.items);

    // Whatever sits between the last entry and the `]` closes the list. Without a trailing comma
    // it is part of the last item's text, and leaving it there would strand it mid-list the first
    // time an entry was appended.
    var closer = split.tail;
    if (!closer && items.length > 0) {
      var last = items[items.length - 1].text;
      var trimmedLast = last.replace(/\s+$/, "");
      closer = last.slice(trimmedLast.length);
      items[items.length - 1] = { text: trimmedLast, joined: items[items.length - 1].joined };
    }
    if (!closer) closer = "\n" + (report.blockIndent || "  ");

    var objects = list.every(function (v) { return v && typeof v === "object" && !Array.isArray(v); });
    if (!objects) {
      // A list of scalars has no entries to keep, and no comments inside to lose.
      var before = valueText.slice(open, close + 1);
      // One per line if that is how it was written: the layout is the author's, not the printer's.
      var after = formatConfigValue(list, itemIndent(valueText) || "  ", before.indexOf("\n") !== -1);
      if (before !== after) report.substituted.push(path);
      return valueText.slice(0, open) + after + valueText.slice(close + 1);
    }

    var indent = items.length > 0 ? itemIndent(items[0].text) : (report.blockIndent || "  ") + "  ";
    var sibling = null;
    for (var s = 0; s < items.length; s++) {
      var t = items[s].text.replace(/^(\s*\/\/[^\n]*\n)+/, "").trim();
      if (t.charAt(0) === "{") { sibling = t; break; }
    }

    var claimed = {};
    var kept = [];

    for (var i = 0; i < items.length; i++) {
      var text = items[i].text;
      var parsed = parseConfigBlockObject("x: " + text.replace(/^(\s*\/\/[^\n]*\n)+/, ""));
      var id = parsed && parsed.x ? entryIdentity(parsed.x) : null;
      var match = null;

      if (id !== null) {
        for (var m = 0; m < list.length; m++) {
          if (entryIdentity(list[m]) === id && !claimed[m]) { match = m; break; }
        }
      } else if (!claimed[i] && i < list.length && entryIdentity(list[i]) === null) {
        match = i;
      }

      if (match === null) {
        report.removed.push({
          path: path,
          name: (parsed && parsed.x && parsed.x.name) || "entry " + (i + 1),
          comments: itemComments(text)
        });
        continue;
      }
      claimed[match] = true;
      if (i !== match) report.reordered.push({ path: path, name: list[match].name });
      kept.push({ text: fillObjectValue(text, list[match], path, report), order: match });
    }

    for (var n = 0; n < list.length; n++) {
      if (claimed[n]) continue;
      var written = formatLikeSibling(list[n], sibling, indent);
      kept.push({ text: "\n" + indent + written, order: n, added: true });
      report.inserted.push({ path: path, name: list[n].name || "entry " + (n + 1) });
    }

    if (kept.length === 0) return valueText.slice(0, open) + "[]" + valueText.slice(close + 1);

    var joined = "";
    for (var k = 0; k < kept.length; k++) {
      joined += (k === 0 ? "" : ",") + kept[k].text;
    }
    if (split.trailingComma) joined += ",";
    return head + joined + closer + tailText;
  }

  function fillObjectValue(itemText, value, path, report) {
    var open = itemText.indexOf("{");
    var close = itemText.lastIndexOf("}");
    if (open === -1 || close === -1) return itemText;

    var split = splitConfigItems(itemText.slice(open + 1, close));
    var items = reattachTrailingComments(split.items);
    var out = [];

    for (var i = 0; i < items.length; i++) {
      var key = itemKey(items[i].text);
      if (key === null || !Object.prototype.hasOwnProperty.call(value, key)) {
        out.push(items[i]);
        continue;
      }
      out.push({ text: fillProperty(items[i].text, value[key], path ? path + "." + key : key, report), joined: items[i].joined });
    }

    var joined = "";
    for (var j = 0; j < out.length; j++) joined += (j === 0 ? "" : (out[j - 1].joined ? "" : ",")) + out[j].text;
    if (split.trailingComma) joined += ",";
    return itemText.slice(0, open + 1) + joined + split.tail + itemText.slice(close);
  }

  /** One `key: value` item, with the payload's value put into it. */
  function fillProperty(itemText, value, path, report) {
    var start = itemValueStart(itemText);
    if (start === -1) return itemText;

    var valueText = itemText.slice(start);
    var trimmed = valueText.replace(/^\s*/, "");

    // Already says what the file says. Leave the text exactly as written — this is what keeps a
    // ten-line `fontScale` array ten lines long, rather than reformatting it to prove a point.
    var existing = parseConfigBlockObject("x:" + valueText);
    if (existing && JSON.stringify(existing.x) === JSON.stringify(value)) return itemText;

    if (trimmed.charAt(0) === "[" && Array.isArray(value)) {
      return itemText.slice(0, start) + fillArrayValue(valueText, value, path, report);
    }
    if (trimmed.charAt(0) === "{" && value && typeof value === "object" && !Array.isArray(value)) {
      return itemText.slice(0, start) + fillObjectValue(valueText, value, path, report);
    }

    // A scalar. Replace the value text and keep any trailing comment on the line.
    var lead = valueText.slice(0, valueText.length - trimmed.length);
    var commentAt = -1;
    var depth = 0, inString = null;
    for (var i = 0; i < trimmed.length; i++) {
      var c = trimmed.charAt(i), n = trimmed.charAt(i + 1);
      if (inString) {
        if (c === "\\") { i++; continue; }
        if (c === inString) inString = null;
        continue;
      }
      if (c === '"' || c === "'") { inString = c; continue; }
      if (c === "[" || c === "{") depth++;
      if (c === "]" || c === "}") depth--;
      if (c === "/" && n === "/" && depth === 0) { commentAt = i; break; }
    }
    var body = commentAt === -1 ? trimmed : trimmed.slice(0, commentAt);
    var after = commentAt === -1 ? "" : trimmed.slice(commentAt);
    var trailingWs = body.slice(body.replace(/\s+$/, "").length);
    body = body.replace(/\s+$/, "");

    var written = formatConfigValue(value, itemIndent(itemText));
    if (written !== body) report.substituted.push(path);
    return itemText.slice(0, start) + lead + written + trailingWs + after;
  }

  /** The config block's body as a plain object. Never evaluated — the tolerant reader does it. */
  function parseConfigBlockObject(text) {
    try {
      return JSON.parse(looseJsonToJson("{" + text + "}"));
    } catch (e) {
      return null;
    }
  }

  function fillSummary(report) {
    var parts = [];
    if (report.substituted.length > 0) {
      parts.push("Filled " + report.substituted.length + " value" +
        (report.substituted.length === 1 ? "" : "s") + ".");
    }
    var byPath = function (list) {
      var groups = {}, order = [];
      list.forEach(function (e) {
        if (!groups[e.path]) { groups[e.path] = []; order.push(e.path); }
        groups[e.path].push(e);
      });
      return order.map(function (p) { return { path: p, entries: groups[p] }; });
    };

    byPath(report.inserted).forEach(function (g) {
      parts.push("Added " + g.entries.length + (g.entries.length === 1 ? " entry" : " entries") +
        " to " + g.path + ": " + g.entries.map(function (e) { return e.name; }).join(", ") + ".");
    });

    byPath(report.removed).forEach(function (g) {
      var comments = 0;
      g.entries.forEach(function (e) { comments += e.comments.length; });
      var line = "Removed " + g.entries.length + (g.entries.length === 1 ? " entry" : " entries") +
        " from " + g.path + ": " + g.entries.map(function (e) { return e.name; }).join(", ") +
        " — not in this file.";
      if (comments > 0) {
        line += " " + comments + " comment line" + (comments === 1 ? "" : "s") + " went with " +
          (g.entries.length === 1 ? "it" : "them") + ".";
      }
      parts.push(line);
    });

    if (report.reordered.length > 0) {
      parts.push("This file lists them in a different order; the block's order was kept, " +
        "so its comments stay with what they describe.");
    }
    if (parts.length === 0) parts.push("Nothing to fill — the block already matches this file.");
    return parts.join(" ");
  }

  /**
   * Fill a config block's values from a payload, preserving everything the payload does not touch.
   * → { text, substituted, inserted, removed, reordered, skipped, summary }
   */
  function fillConfigBlock(blockText, payload) {
    var report = { substituted: [], inserted: [], removed: [], reordered: [], skipped: [], blockIndent: "  " };
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return {
        text: blockText, substituted: [], inserted: [], removed: [], reordered: [], skipped: [],
        summary: "Nothing to fill — this file has no config for this script."
      };
    }

    var split = splitConfigItems(blockText);
    var items = reattachTrailingComments(split.items);
    var seen = {};
    var out = [];

    for (var i = 0; i < items.length; i++) {
      var key = itemKey(items[i].text);
      if (key !== null) seen[key] = true;
      if (key === null || !Object.prototype.hasOwnProperty.call(payload, key)) {
        out.push(items[i]);
        continue;
      }
      out.push({ text: fillProperty(items[i].text, payload[key], key, report), joined: items[i].joined });
    }

    // A key the file has and the block does not is not inserted: the block declares what this
    // script reads, so a field it never mentions would be inert. Said, rather than dropped in.
    for (var k in payload) {
      if (Object.prototype.hasOwnProperty.call(payload, k) && !seen[k]) report.skipped.push(k);
    }

    var joined = "";
    for (var j = 0; j < out.length; j++) joined += (j === 0 ? "" : (out[j - 1].joined ? "" : ",")) + out[j].text;
    if (split.trailingComma) joined += ",";

    return {
      text: joined + split.tail,
      substituted: report.substituted,
      inserted: report.inserted,
      removed: report.removed,
      reordered: report.reordered,
      skipped: report.skipped,
      summary: fillSummary(report)
    };
  }

  /** Does this config block declare any field that can be loaded from the file? */
  function hasFileFields(schema) {
    var rows = rowsOf(schema);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].type === "field" && rows[i].fromFile) return true;
    }
    return false;
  }

  // The public API. `bridge.js` copies this object onto `window.CodeFigConfigUI`, so this list is
  // the only place that decides what the UI may call — leaving a function out is how you say it is
  // internal. `inferType` and `parseValue` were exported and never called from outside; they are
  // module-private now, which is a statement rather than an omission.
  return {
    parse: parse,
    serialize: serialize,
    applyFileConfig: applyFileConfig,
    fillConfigBlock: fillConfigBlock,
    parseConfigBlockObject: parseConfigBlockObject,
    hasFileFields: hasFileFields,
    configImportState: configImportState
  };
});
