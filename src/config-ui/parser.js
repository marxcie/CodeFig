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

      // `containerWidth:number=Width` — a label of its own, because the frames say *Width* and
      // *Margins* where the config says `containerWidth` and `padding`. The label belongs to the
      // panel and the key belongs to the config; neither should have to bend to the other.
      var label = null;
      var eq = typeText.indexOf("=");
      if (eq !== -1) {
        label = typeText.slice(eq + 1).trim();
        typeText = typeText.slice(0, eq).trim();
      }

      // `labelSpelled` records that the source wrote `=Label` out, even when it matches the
      // prettified key. Without it, serialize drops what it can infer — and `columns:number=Columns`
      // came back as `columns:number` the first time anyone typed in a cell. Semantically identical,
      // visibly not what was written, and this is a file people read and paste.
      var column = {
        key: key, label: label || labelFromName(key), type: "text", labelSpelled: label != null
      };
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
        // `@collectionModes: Collection modes` — a marker row that renders a **control**, not a
        // field. The chips are a view of the collection's modes, not of a config key: a mode is a
        // thing in the file and a set of values in the config at once, and only the second is a key.
        // So this row owns no value, serializes back verbatim, and the tab strip below takes its
        // names and order from it. Ahead of the heading and paragraph branches, which would each
        // otherwise claim it.
        // `@preview` — a marker row for a section the panel draws rather than a field. It is a row so
        // the config block can say where it goes, which is also what lets a divider sit before it.
        // `@fromFile: domains.grid` on its own line is a **directive**: it tells the panel which domain
        // to read and is not something to show anyone. It has to stay in the block — `configBlockFromFilePath`
        // reads it for the preview and for auto-import — so it is kept verbatim and rendered as nothing.
        if (/^@fromFile\b/.test(c)) {
          rows.push({ type: "directive", raw: line });
          lastWasBlank = false;
          i++;
          continue;
        }

        if (/^@suggestions\b/.test(c)) {
          rows.push({ type: "suggestions", raw: line });
          lastWasBlank = false;
          i++;
          continue;
        }

        if (/^@preview\b/.test(c)) {
          rows.push({ type: "preview", raw: line });
          lastWasBlank = false;
          i++;
          continue;
        }

        var chipsMatch = c.match(/^@collectionModes\s*:\s*(.*)$/);
        if (chipsMatch) {
          rows.push({
            type: "chips",
            label: (chipsMatch[1] || "Collection modes").trim(),
            // Where the per-mode values live, so the control can seed itself before a collection has
            // been chosen — which is the whole of the layout pass.
            from: "modes",
            raw: line
          });
          lastWasBlank = false;
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
        if (/^(---|\*\*\*|___)(\s+@section\b)?\s*$/.test(c)) {
          // Two lengths. `// ---` separates items and stays within the content; `// --- @section`
          // separates sections and reaches the panel's edges. A divider is always asked for — none
          // appears between blocks on its own.
          rows.push({ type: "divider", section: /@section\b/.test(c), raw: line });
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

        // `@helper: …` — a note that belongs to *this field* and renders under its control, which is
        // where the frames put it. A comment line above the field is a paragraph row instead: it sits
        // at the label's left edge and reads as prose about the section, not about the input.
        //
        // Read **first, and to the end of the line**, so `@helper:` has to be the last annotation on
        // it. It used to stop at the next ` @word`, which meant a note could not mention an
        // annotation — in a config UI where every annotation starts with `@`. The style reference's
        // own notes came back as "the same" and "an object with no", truncated mid-sentence at
        // ` @options` and ` @rows`. Taking it first also keeps `@placeholder="…"` inside a note from
        // being eaten by the placeholder strip below, which is a global replace.
        var helperMatch = tip.match(/@helper:\s*(.+)$/);
        if (helperMatch) {
          tip = tip.slice(0, helperMatch.index).trim();
        }

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
        // The collection picker: a select of this file's collections, plus "create a new one", which
        // is an affordance for typing a name that is not in the list rather than a second setting.
        // `getOrCreateCollection` already creates when the name does not exist, so the config stays
        // one string — a `createNew` flag would be a second source of truth for what the name
        // already says, and nonsense in a pasted config, which is the case that matters: paste into
        // a file without that collection and it should be created without the config having
        // predicted it.
        if (/@collection\b/.test(tip) && typeof val === "string") {
          inputType = "collection";
        }

        // The mode picker: the same control one level down. A mode only means anything inside a
        // collection, so this field names the collection field it follows — `@mode: targetCollection`
        // — and written bare it binds to the block's only collection picker, which is what a script
        // with one target has.
        //
        // What is *recorded* is what was written, never the resolved name: a bare `@mode` that
        // serialised as `@mode: targetCollection` would silently rewrite somebody's block on the
        // first keystroke in an unrelated field, since the whole block is re-emitted on every change.
        var modeMatch = tip.match(/@mode\b(?::\s*([A-Za-z0-9_$]+))?/);
        if (modeMatch && typeof val === "string") {
          inputType = "mode";
        }

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
        var labelSpelled = !!labelMatch;
        if (labelMatch) {
          fieldLabel = labelMatch[1].trim();
          tip = tip.replace(/@label:\s*.+?(?=\s+@|$)/, "").trim();
        }
        var f = {
          type: "field",
          name: m[1],
          value: val,
          label: fieldLabel,
          labelSpelled: labelSpelled,
          tooltip: tip,
          inputType: inputType,
        };
        if (phMatch) f.placeholder = phMatch[1];
        if (helperMatch) f.helper = helperMatch[1].trim();
        if (inputType === "mode") {
          // `null` for a bare `@mode`, and it stays null: resolution happens against the rendered
          // form, so the two spellings serialise back exactly as they were written.
          f.collectionField = modeMatch[1] ? modeMatch[1] : null;
        }
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
        var known = /^@(options|radio|multi|textarea|label|showWhen|placeholder|fromFile|rows|tabs|collection|mode|helper)\b/;
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
     * A value printed the way the block is written, not the way `JSON.stringify` writes it.
     *
     * This used to be `JSON.stringify(v, null, 2)` for anything holding objects, which quoted every
     * key and indented from column 0. Editing one Gap in the Mode settings tabs therefore rewrote
     * Grid's whole `modes` array from
     *
     *     modes: [
     *       {
     *         name: "desktop",
     *
     * to `"name": "desktop"` hanging off the left margin — the block still ran, and it was no longer
     * something a person would have written. **The block is the human format**: its keys are bare, its
     * indentation is the block's own, and a config is read and pasted far more often than it is
     * generated. So the printer matches the source style, and `indent` is the row's own leading
     * whitespace rather than a constant.
     *
     * Arrays of primitives stay on one line, where a line each would be noise.
     */
    function fmt(v, indent) {
      var pad = indent || "";
      var inner = pad + "  ";
      if (v === null) return "null";
      if (typeof v === "boolean") return v ? "true" : "false";
      if (typeof v === "number") return String(v);
      if (typeof v === "string") return JSON.stringify(v);
      if (Array.isArray(v)) {
        var holdsObjects = v.some(function (item) {
          return item !== null && typeof item === "object";
        });
        if (!holdsObjects) {
          return "[" + v.map(function (item) { return fmt(item, ""); }).join(", ") + "]";
        }
        return "[\n" + v.map(function (item) {
          return inner + fmt(item, inner);
        }).join(",\n") + "\n" + pad + "]";
      }
      if (typeof v === "object") {
        var keys = Object.keys(v);
        if (keys.length === 0) return "{}";
        return "{\n" + keys.map(function (key) {
          return inner + printKey(key) + ": " + fmt(v[key], inner);
        }).join(",\n") + "\n" + pad + "}";
      }
      return JSON.stringify(v);
    }

    /** Bare where JavaScript allows it, quoted where it does not. */
    function printKey(key) {
      return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
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
        if (r.inputType === "collection") parts.push("@collection");
        if (r.inputType === "mode") {
          parts.push("@mode" + (r.collectionField ? ": " + r.collectionField : ""));
        }
        if (r.inputType === "rows" && r.columns) {
          parts.push("@rows: " + r.columns.map(function (c) {
            var spec = c.type === "select" ? "(" + (c.options || []).join("|") + ")" : c.type;
            var named = c.label && (c.labelSpelled || c.label !== labelFromName(c.key))
              ? "=" + c.label : "";
            return c.key + ":" + spec + named;
          }).join("|"));
          if (r.tabs) parts.push("@tabs");
        }
        // Emitted before @label so the annotation order stays stable across a round trip; a
        // dropped @fromFile would silently remove the sync button from the script.
        if (r.fromFile) parts.push("@fromFile: " + r.fromFile);
        if (r.label && (r.labelSpelled || r.label !== labelFromName(r.name))) {
          parts.push("@label: " + r.label);
        }
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
        // **Last, always.** The parser reads a note to the end of the line, so anything written after
        // one becomes part of it. Emitting it here is what makes that rule survive a round trip.
        if (r.helper) parts.push("@helper: " + r.helper);
        var comment = parts.length ? " // " + parts.join(" ") : "";
        // The row's own indentation, taken from the line it was read from. Reprinting without it
        // left every edited row hanging at column 0 while its neighbours kept theirs — ragged in a
        // `@CONFIG_START` block, invisible in a `@UI_CONFIG` one, where rows start at column 0
        // anyway. That is why it went unnoticed.
        var indent = /^[ \t]*/.exec(r.raw || "")[0];
        if (r.syntax === "property") {
          out.push(indent + r.name + ": " + fmt(v, indent) + (r.trailingComma ? "," : "") + comment);
        } else {
          out.push(indent + "var " + r.name + " = " + fmt(v, indent) + ";" + comment);
        }
      }
    });
    // Trailing whitespace only. `.trim()` also removed the **first** line's indentation, which is
    // invisible on a `@UI_CONFIG` block (those start at column 0) and ragged on a `@CONFIG_START`
    // one, where every other line keeps the indent `raw` preserved. `mergeConfigIntoMain` strips and
    // re-adds the trailing newline itself, so nothing downstream wanted the leading trim.
    return out.join("\n").replace(/\s+$/, "");
  }

  /**
   * Apply one chip operation to the config's `modes` array and to the panel's parallel list of
   * `modeId`s — together, in one place, because the whole design rests on them staying parallel.
   *
   * `entries` is the config's array of per-mode settings; `ids[i]` is the Figma `modeId` entry `i` was
   * read from, or `null` for a mode that does not exist in the file yet. Returns new arrays plus what
   * to remember:
   *
   *     { entries, ids, removed: { modeId, name } | null, added: name | null }
   *
   * A **removal** hands back the id it dropped so the panel can record that this one was asked for.
   * That record is the only remembered intent in the whole feature, and it exists because "the config
   * has no mode with this id" cannot distinguish a deliberate removal from a config pasted out of
   * another file. Deleting on the latter would destroy values nobody offered up.
   *
   * A **new mode** is seeded from the last entry rather than from zeros: its fields have to hold
   * something, the tab appears immediately, and copying the neighbour is both obvious on screen and
   * closer to right than `0` for every width and column count. `name` is then overwritten, so the only
   * thing inherited is the shape and the numbers.
   */
  function applyChipOp(entries, ids, op) {
    var list = Array.isArray(entries) ? entries.slice() : [];
    var idList = Array.isArray(ids) ? ids.slice() : [];
    while (idList.length < list.length) idList.push(null);
    var result = { entries: list, ids: idList, removed: null, added: null };
    if (!op || !op.op) return result;

    if (op.op === "rename") {
      if (op.index < 0 || op.index >= list.length) return result;
      var renamed = {};
      // Rebuilt key by key so `name` keeps its position in the object — first, where every block
      // writes it. Assigning to a copy would move it to the end on some engines.
      for (var key in list[op.index]) {
        renamed[key] = key === "name" ? op.to : list[op.index][key];
      }
      if (!Object.prototype.hasOwnProperty.call(renamed, "name")) renamed.name = op.to;
      list[op.index] = renamed;
      return result;
    }

    if (op.op === "remove") {
      if (op.index < 0 || op.index >= list.length) return result;
      var goneId = idList[op.index] || null;
      var goneName = list[op.index] && list[op.index].name;
      list.splice(op.index, 1);
      idList.splice(op.index, 1);
      if (goneId) result.removed = { modeId: goneId, name: goneName || op.name || null };
      return result;
    }

    if (op.op === "add") {
      var template = list.length ? list[list.length - 1] : null;
      var fresh = {};
      if (template) {
        for (var k in template) fresh[k] = template[k];
      }
      fresh.name = op.name;
      list.push(fresh);
      idList.push(null);
      result.added = op.name;
      return result;
    }

    if (op.op === "reorder") {
      if (op.from < 0 || op.from >= list.length || op.to < 0 || op.to >= list.length) return result;
      list.splice(op.to, 0, list.splice(op.from, 1)[0]);
      idList.splice(op.to, 0, idList.splice(op.from, 1)[0]);
      return result;
    }

    return result;
  }

  /**
   * Are these two the same mode name?
   *
   * Case-insensitively, and the reason is not tolerance — it is that **the generator makes the
   * difference itself**. A config block writes viewport keys (`desktop`), and `viewportLabel` in
   * `@Foundation` capitalises the first letter on the way to the document, so the collection holds
   * `Desktop`. Every real file therefore disagrees with every shipped config, in a way nobody chose.
   *
   * Two consequences, both wanted:
   *   - a chip can be linked to the mode it actually came from, instead of every mode reading as new;
   *   - opening a panel never proposes renaming `Desktop` to `desktop`. That rename would be silent,
   *     wrong, and undone by the next run's own capitalisation anyway.
   *
   * A deliberate case-only rename by hand is therefore not applied. That is the honest outcome rather
   * than a lie: `setupModes` would capitalise it straight back.
   */
  function sameModeName(a, b) {
    if (typeof a !== "string" || typeof b !== "string") return false;
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }

  /**
   * Link a config's mode entries to the file's modes, by name, once.
   *
   * The only place a name match is sound: a config that was just read from this file, or is about to
   * be, agrees with it by definition. Everywhere after this the link is positional and travels with
   * the chip operation, because a renamed chip no longer matches the name the file has.
   *
   * **Ambiguity yields nothing.** If two of the file's modes fold to the same name, neither is linked:
   * an unlinked chip is treated as a new mode, which adds. A wrong link would rename the wrong mode.
   */
  function matchModeIds(entries, fileModes) {
    var file = Array.isArray(fileModes) ? fileModes : [];
    var seen = {};
    file.forEach(function (mode) {
      var key = String(mode.name || "").trim().toLowerCase();
      seen[key] = Object.prototype.hasOwnProperty.call(seen, key) ? null : mode.modeId;
    });
    return (Array.isArray(entries) ? entries : []).map(function (entry) {
      var key = String((entry && entry.name) || "").trim().toLowerCase();
      return Object.prototype.hasOwnProperty.call(seen, key) ? seen[key] : null;
    });
  }

  /**
   * Put the config's mode entries in the **collection's** order.
   *
   * The chips and the Mode settings tabs are drawn from this array, so this is what "chip order is
   * mode order" actually requires. Without it the order is whatever the config happened to hold: a
   * manifest's write order, a pasted block's order, or the order someone typed them in — which on a
   * five-mode system reads as no order at all.
   *
   * **The file wins, and that is not arbitrary.** For a collection that already has variables the
   * plugin API cannot reorder modes, so Figma's order is the one you see in the variables panel and
   * the one nothing else can change. A config that disagrees is a config that displays its modes in an
   * order the document does not have.
   *
   * Entries the file does not have — a new mode, or one from a pasted config — keep their relative
   * order and follow the ones it does. They are not evidence of an order, so they do not get to set
   * one, and they are certainly not dropped.
   *
   * **It also adopts the file's spelling.** A config ships `desktop` and the collection holds
   * `Desktop`, because `viewportLabel` capitalises on the way into the document — so an unloaded panel
   * displayed the script's own keys while the variables panel two inches away said something else.
   * Márton's spec is that a chip and a tab show *whatever the API reports for that mode*, and the way
   * to make a view show the file is to give it the file's names rather than to relabel it on the way
   * out. Case-only differences still never produce a **rename of the mode** — `sameModeName` sees to
   * that — so this changes what the config says and nothing about what a run does.
   *
   * Returns `{ entries, ids, changed }`; `changed` covers order *and* spelling, so a caller can avoid
   * writing the block for nothing.
   */
  function alignModesToFile(entries, ids, fileModes) {
    var list = Array.isArray(entries) ? entries.slice() : [];
    var idList = Array.isArray(ids) ? ids.slice() : [];
    while (idList.length < list.length) idList.push(null);
    var file = Array.isArray(fileModes) ? fileModes : [];
    if (!list.length || !file.length) return { entries: list, ids: idList, changed: false };

    var taken = {};
    var ordered = [];
    var orderedIds = [];

    file.forEach(function (mode) {
      for (var i = 0; i < list.length; i++) {
        if (taken[i]) continue;
        // By id where the panel has one, by name otherwise — a renamed chip no longer matches the
        // file's name for its mode, and it must still land in that mode's position.
        var matches = idList[i] ? idList[i] === mode.modeId
          : sameModeName(list[i] && list[i].name, mode.name);
        if (!matches) continue;
        taken[i] = true;
        ordered.push(list[i]);
        orderedIds.push(idList[i]);
        return;
      }
    });

    for (var j = 0; j < list.length; j++) {
      if (taken[j]) continue;
      ordered.push(list[j]);
      orderedIds.push(idList[j]);
    }

    // The file's spelling, for the entries that are linked to one of its modes.
    var nameById = {};
    file.forEach(function (mode) { nameById[mode.modeId] = mode.name; });
    var renamed = ordered.map(function (entry, i) {
      var id = orderedIds[i];
      var fileName = id ? nameById[id] : null;
      if (!fileName || !entry || entry.name === fileName) return entry;
      // **Only a difference in spelling, never a difference in name.** A chip renamed `Tablet` to `Pad`
      // is a *pending rename of the Figma mode*, and the file still says `Tablet` until the run happens
      // — so adopting the file's name here would quietly undo what someone just typed. `sameModeName`
      // is the same predicate that decides a case difference is not a rename; it decides this too, and
      // the two cannot drift apart because there is one of it.
      if (!sameModeName(entry.name, fileName)) return entry;
      var copy = {};
      // Key by key, so `name` keeps its position — first, where every block writes it.
      for (var key in entry) copy[key] = key === "name" ? fileName : entry[key];
      return copy;
    });

    var changed = false;
    for (var k = 0; k < list.length; k++) {
      if (list[k] !== renamed[k]) { changed = true; break; }
    }
    return { entries: renamed, ids: orderedIds, changed: changed };
  }

  /**
   * What a run should do to the collection's modes: the panel's chips against the file's modes.
   *
   * Derived, not remembered — with one exception, and the exception is the point. Renames and
   * additions fall out of comparing the two lists by `modeId`. Removals cannot: a file mode that no
   * chip carries is *either* a mode someone removed *or* a mode this config has never heard of,
   * because it came from another file. So `removedIds` is passed in, holding only what was removed by
   * clicking the dash, and nothing else can ever produce a removal.
   *
   *     { collection, renames: [{ modeId, from, to }], removals: [{ modeId, name }], additions: [names] }
   */
  function modeIntents(collectionName, entries, ids, fileModes, removedIds) {
    var out = { collection: collectionName || null, renames: [], removals: [], additions: [] };
    var list = Array.isArray(entries) ? entries : [];
    var idList = Array.isArray(ids) ? ids : [];
    var file = Array.isArray(fileModes) ? fileModes : [];
    var removed = removedIds || [];

    var nameById = {};
    file.forEach(function (mode) { nameById[mode.modeId] = mode.name; });

    list.forEach(function (entry, i) {
      var name = entry && entry.name;
      if (!name) return;
      var id = idList[i] || null;
      if (!id) {
        out.additions.push(name);
        return;
      }
      var was = nameById[id];
      // A mode the file no longer has: not a rename and not an error. `setupModes` will create the
      // name, which is the same outcome a chip with no id would have had.
      if (was === undefined) {
        out.additions.push(name);
        return;
      }
      if (!sameModeName(was, name)) out.renames.push({ modeId: id, from: was, to: name });
    });

    var carried = {};
    idList.forEach(function (id) { if (id) carried[id] = true; });
    removed.forEach(function (id) {
      if (carried[id]) return; // Removed, then added back by name: nothing to do.
      if (nameById[id] === undefined) return; // Already gone from the file.
      out.removals.push({ modeId: id, name: nameById[id] });
    });

    return out;
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

    // `key: value, // note` — the comma is inside this item, because `reattachTrailingComments`
    // moved it here with the comment it precedes. It is punctuation, not part of the value: leaving
    // it in `body` made every such line count as changed and then wrote the new value over the comma.
    var comma = "";
    if (/,$/.test(body)) {
      comma = ",";
      body = body.slice(0, -1).replace(/\s+$/, "");
    }

    var written = formatConfigValue(value, itemIndent(itemText));
    if (written !== body) report.substituted.push(path);
    return itemText.slice(0, start) + lead + written + comma + trailingWs + after;
  }

  /** The config block's body as a plain object. Never evaluated — the tolerant reader does it. */
  function parseConfigBlockObject(text) {
    try {
      // `\n` before the brace, and it is load-bearing. Grid's block now **ends with a comment** —
      // `// @suggestions` — and `serialize` trims trailing whitespace, so `"{" + text + "}"` put the
      // closing brace on the comment's own line, where the comment skip swallowed it. The whole config
      // then failed to parse and the preview read "Waiting for a config this can read", which is true
      // and says nothing about why.
      return JSON.parse(looseJsonToJson("{" + text + "\n}"));
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
      // **States the fact, and claims nothing about what happens next.** It used to say "the block's
      // order was kept, so its comments stay with what they describe" — true of the fill, and false
      // of the outcome once the panel started putting a collection's modes into the collection's own
      // order. A message that describes a policy another step reverses is worse than a shorter one:
      // Márton read that sentence under a list that was visibly in the wrong order.
      var paths = [];
      report.reordered.forEach(function (entry) {
        if (paths.indexOf(entry.path) === -1) paths.push(entry.path);
      });
      parts.push("This file lists " + paths.join(" and ") + " in a different order.");
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
    applyChipOp: applyChipOp,
    modeIntents: modeIntents,
    matchModeIds: matchModeIds,
    alignModesToFile: alignModesToFile,
    // Exported because the panel asks the same question when it words the removal note, and "the same
    // mode name" must have exactly one definition. It did not, and the note said "Removing" for a
    // replacement — understating what was about to happen, in the one place that exists to state it.
    sameModeName: sameModeName,
    parseConfigBlockObject: parseConfigBlockObject,
    hasFileFields: hasFileFields
  };
});
