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
    if (Array.isArray(v)) {
      // **A list of names is editable; a list of objects is not.** `spacings: ["none", "px", …]` is the
      // Tokens field in Márton's frames — one input holding a comma list — and it used to fall through
      // to `unsupported`, which renders read-only and sends you to Source for a row of
      // words. A list of *objects* is a different thing and still needs `@rows` to say what its columns
      // are.
      return isPrimitiveList(v) ? "list" : "array";
    }
    if (typeof v === "object") return "object";
    return "string";
  }

  function isPrimitiveList(v) {
    for (var i = 0; i < v.length; i++) {
      var item = v[i];
      if (item === null || item === undefined) continue;
      var t = typeof item;
      if (t !== "string" && t !== "number" && t !== "boolean") return false;
    }
    return true;
  }

  /** `["none", "px", 3]` ⇄ `"none, px, 3"`. The config keeps the array; the panel shows the list. */
  function listToText(value) {
    if (!Array.isArray(value)) return value === undefined || value === null ? "" : String(value);
    return value.join(", ");
  }

  /**
   * A comma list back to an array, keeping numbers numeric.
   *
   * `"0, 1, 2"` has to come back as `[0, 1, 2]` and not `["0", "1", "2"]`, because `rampExtras` reads
   * numbers and a quoted 0 in a config block is a different thing to the person reading it.
   */
  function splitOnTopLevelCommas(text) {
    var out = [];
    var current = "";
    var depth = 0;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch === "{") depth++;
      if (ch === "}") depth = Math.max(0, depth - 1);
      if (ch === "," && depth === 0) { out.push(current); current = ""; continue; }
      current += ch;
    }
    out.push(current);
    return out;
  }

  function textToList(text) {
    if (Array.isArray(text)) return text;
    // Split on the commas between terms, not on the one inside `spacing-{1,10}`. The series form is
    // Márton's and so is the comma-separated field, so both use the same character and this has to
    // count braces — otherwise typing a series into Tokens stores `spacing-{1` and `10}`, which then
    // read as two perfectly ordinary token names and ship as two variables.
    // `expandTokenList` in `@Foundation` splits the same way for the same reason; the two live in
    // different runtimes (this is the iframe, that is the sandbox) and `token-series.test.js` pins them
    // to one answer.
    var parts = splitOnTopLevelCommas(String(text === undefined || text === null ? "" : text));
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var piece = parts[i].trim();
      if (!piece) continue;
      out.push(/^-?\d+(\.\d+)?$/.test(piece) ? Number(piece) : piece);
    }
    return out;
  }

  /**
   * A variable name as a label — **sentence case**, which is what Figma writes and what the labels
   * somebody actually authored in this repo already use.
   *
   * This split the camelCase humps and then left them capitalised, so `fileKeyOrUrl` came out as
   * *File Key Or Url*. 87 of the plugin's 123 field labels are generated here — no `@label:` was ever
   * written for them — so two thirds of the labels in the panel were Title Case and the other third,
   * the hand-written ones, were sentence case. The plugin disagreed with itself on the first thing
   * anyone reads.
   *
   * `serialize` compares a row's label against this function to decide whether `@label:` needs writing
   * out, and both sides of that comparison call it — so changing the casing here does not start
   * spelling labels into anyone's config block.
   */
  var LABEL_ACRONYMS = { url: "URL", id: "ID", json: "JSON", css: "CSS", api: "API", ui: "UI" };

  function labelFromName(n) {
    if (!n || typeof n !== "string") return "";
    var words = n
      .replace(/([A-Z])/g, " $1")
      .trim()
      .split(/\s+/);
    return words
      .map(function (w, i) {
        var lower = w.toLowerCase();
        if (LABEL_ACRONYMS[lower]) return LABEL_ACRONYMS[lower];
        // Sentence case: the first word carries the capital and the rest do not.
        return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
      })
      .join(" ");
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

      // **A bare *numeric* key.** `{ 400: 400 }` is legal JS and not legal JSON, and it is exactly what
      // Typography's font weights look like — so the whole value failed to parse and degraded to the
      // string `"{ 400: 400, 600: 600 }"`. The panel then showed that string in a text field, collected
      // it, wrote it back into the block as a quoted string, and the run enumerated its *characters*:
      // a text style per index, 0 to 28. A key position is the only place a number can appear here
      // without a `:` before it, so reading it as a key is unambiguous.
      if (expectKey && (/[0-9]/.test(ch) || (ch === "-" && /[0-9]/.test(next)))) {
        var numKey = ch === "-" ? "-" : "";
        if (ch === "-") i++;
        while (i < text.length && /[0-9.]/.test(text.charAt(i))) {
          numKey += text.charAt(i);
          i++;
        }
        out += JSON.stringify(numKey);
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
   * **What a `curve(...)` spec says**, applied onto the column. One reader, because the same three settings
   * arrive two ways — `curve(ends:a..b)` on a row column and `@ends: a..b` on a field — and two readers of
   * one vocabulary is how a setting comes to mean something slightly different depending on where it is
   * written.
   *
   *   `original`        offer *Original*, the empty curve. Colours only: it means "leave the steps this
   *                     file already has", which a scale has no equivalent of.
   *   `growth:<key>`    the **open-ended** editor. The plot's y axis is logarithmic, so a constant ratio is
   *                     a straight line and its slope is the growth; one handle drags that slope and the
   *                     value is written out under `<key>`. Spacing, radius and typography do not know
   *                     their largest value, and pinning one would mean adding a token re-subdivides the
   *                     range and moves every value below it.
   *   `ends:<a>..<b>`   the two fields holding the values the curve runs **between**. With them the y axis
   *                     stops being 0..1 and starts being the quantity — 98% down to 19% — so the ends are
   *                     draggable and dragging one edits that field. Without them a curve is a shape and
   *                     the axis has nothing to be.
   *   `range:<lo>..<hi>` the channel's own limits, for the zoom rail to be zoomed *out* to. You cannot be
   *                     112% dark, and the axis has to know that before it can offer to show you 112.
   */
  function applyCurveSpec(column, spec) {
    (spec || "").split(",").forEach(function (piece) {
      var part = piece.trim();
      if (!part) return;
      if (part === "original") { column.allowOriginal = true; return; }
      /**
       * `ramp:<css colour>` — what the bar beside the chart is a picture of.
       *
       * A template in the channel's **own** colour space, with `$` where the axis value goes and `~key`
       * for a sibling field's value:
       *
       *     ramp:hsl($ 100% 50%)                              a hue wheel
       *     ramp:hsl(~bright.hslHue $% 50%)                   that hue, losing its saturation
       *     ramp:hsl(~bright.hslHue ~bright.saturation% $%)   that colour, going dark
       *
       * The browser mixes it, so **no colour maths lives in the UI** — which matters, because the only
       * other way to draw this bar is a second copy of `@oklch.js` beside the one the sandbox runs, and
       * `build-bezier.js` exists precisely so that does not happen for the curve maths.
       *
       * It replaced a bar drawn from the collection's *token* colours. That is a lightness ramp, so it
       * looked right on the Lightness tab and showed a light-to-dark green sweep on Hue and Saturation —
       * where the honest answer is a hue wheel and a saturation fade. It also could not follow a drag,
       * because the tokens are the file's and the drag has not been run yet.
       *
       * Space-separated CSS on purpose: `curve(...)` splits its settings on commas.
       */
      var ramp = part.match(/^ramp:(.+)$/);
      if (ramp) { column.ramp = ramp[1].trim(); return; }
      var growth = part.match(/^growth:([A-Za-z0-9_$]+)$/);
      if (growth) { column.growth = growth[1]; return; }
      /**
       * `ends:a..b` — the two the curve runs between. `ends:a..m..b` when the channel also has a **real**
       * middle anchor of its own.
       *
       * The difference is not cosmetic. On lightness there is no middle field: the curve's own handle *is*
       * the middle, so the box under the chart is a view of the handle. On chroma and hue there is one —
       * the engine interpolates bright to `middle.chroma` to dark and paces it with the curve — and those
       * are two different numbers. A box showing the handle there shows neither the anchor nor anything
       * the engine reads, which is worse than showing nothing.
       */
      var trio = part.match(/^ends:([A-Za-z0-9_$.]+)\.\.([A-Za-z0-9_$.]+)\.\.([A-Za-z0-9_$.]+)$/);
      if (trio) { column.ends = { from: trio[1], mid: trio[2], to: trio[3] }; return; }
      var ends = part.match(/^ends:([A-Za-z0-9_$.]+)\.\.([A-Za-z0-9_$.]+)$/);
      if (ends) { column.ends = { from: ends[1], to: ends[2] }; return; }
      var range = part.match(/^range:(-?[0-9.]+)\.\.(-?[0-9.]+)$/);
      if (range) {
        var lo = parseFloat(range[1], 10), hi = parseFloat(range[2], 10);
        if (isFinite(lo) && isFinite(hi) && hi > lo) column.range = { lo: lo, hi: hi };
      }
    });
  }

  /** The spec text a column round-trips back to. Empty when it has nothing to say. */
  function curveSpecText(c) {
    var parts = [];
    if (c.allowOriginal) parts.push("original");
    if (c.ramp) parts.push("ramp:" + c.ramp);
    if (c.growth) parts.push("growth:" + c.growth);
    if (c.ends) {
      parts.push("ends:" + c.ends.from + (c.ends.mid ? ".." + c.ends.mid : "") + ".." + c.ends.to);
    }
    if (c.range) parts.push("range:" + c.range.lo + ".." + c.range.hi);
    return parts.join(", ");
  }
  /**
   * `1.2:1.2 Minor third|1.25:1.25 Major third` — an option's value, then the words for it.
   *
   * An option is a `{ value, label }` pair rather than a string plus a lookup table beside it. Two
   * lists that have to agree is the bug class this file has hit most often, and a label is exactly the
   * kind of thing that gets added for six of eight options.
   *
   * A bare `1.2` is its own label, which is what every column held before this existed — so nothing
   * that does not spell a label out changes.
   */
  function parseColumnOptions(text) {
    return text.split("|").map(function (o) { return o.trim(); })
      .filter(function (o) { return o.length > 0; })
      .map(function (o) {
        var at = o.indexOf(":");
        if (at === -1) return { value: o, label: o };
        var value = o.slice(0, at).trim();
        var label = o.slice(at + 1).trim();
        return { value: value, label: label || value };
      });
  }

  /** An option's value, whether it is a pair or the bare string an older column held. */
  function columnOptionValue(option) {
    return option && typeof option === "object" && option.value != null ? String(option.value)
      : String(option);
  }

  /** An option's words. Falls back to its value, so a label is never blank on screen. */
  function columnOptionLabel(option) {
    if (option && typeof option === "object") {
      return option.label != null && String(option.label) !== "" ? String(option.label)
        : columnOptionValue(option);
    }
    return String(option);
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
  /** Where the brace opened at `from` closes, or -1. Counted rather than searched, so a nested group's own
   *  braces do not end its parent's. */
  function matchingBrace(text, from) {
    var depth = 0;
    for (var i = from; i < text.length; i++) {
      if (text.charAt(i) === "{") depth++;
      else if (text.charAt(i) === "}") {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  function parseRowColumns(spec) {
    var columns = [];
    var depth = 0;
    var current = "";
    var parts = [];
    for (var i = 0; i < spec.length; i++) {
      var ch = spec.charAt(i);
      if (ch === "(" || ch === "{") depth++;
      if (ch === ")" || ch === "}") depth--;
      if (ch === "|" && depth === 0) { parts.push(current); current = ""; continue; }
      current += ch;
    }
    if (current.trim()) parts.push(current);

    for (var p = 0; p < parts.length; p++) {
      var text = parts[p].trim();
      if (!text) continue;

      // **`#Seed` — a heading among the columns.**
      //
      // `bright:{hue|chroma}` groups *cells*; *Seed* and *Palette* group *rows*. Those are two different
      // jobs, and the second one already has a mechanism: a `// # Heading` line at block level is what
      // separates *General* from *Mode settings*. This is that, one level deeper, so it renders as the same
      // `h2.config-ui-heading` the form uses and inherits the size ladder rather than starting a second one.
      //
      // Not a third layout for a group, and not a new annotation — Márton's instruction was to reuse the
      // heading rather than invent something, and the reuse is this one branch plus one in the renderer.
      // **`@preview` among the columns.** Every one of the five frames draws the colour strip *inside* its
      // mode block, and none of them has a Preview section — so the bottom slot was not in the wrong place,
      // it was never in the design. Written as a pseudo-column for the same reason `#Heading` is: it is a
      // thing that appears between an entry's rows, and the row loop is what knows where those are.
      if (/^@preview$/.test(text)) {
        columns.push({ type: "preview" });
        continue;
      }

      /**
       * **`#>Hue` — a heading that is a tab.**
       *
       * The same one branch `#Seed` already is, with one character's difference in meaning: a section
       * heading separates the columns after it from the ones before, a tab heading does that *and* hides
       * every other tab's columns. Márton's Colors frames put Hue, Saturation and Lightness over one chart,
       * and each is a curve plus that channel's three anchors — the split is exactly where a heading would
       * already go.
       *
       * Reusing the heading rather than adding a tab container is deliberate, and it is the same call as
       * `#Seed`: the row loop already knows where a section starts, and a tab is a section you can only see
       * one of.
       */
      var tabInColumns = text.match(/^#>\s*(.+)$/);
      if (tabInColumns) {
        /**
         * **A tab may carry a condition**, the same `{…}` a column and a section heading already do — and
         * **two tabs written next to each other are one tab under two names**, each named for the model it
         * belongs to. HSL calls the channel Saturation and OKLCH calls it Chroma; they are different
         * quantities with different units, and the columns underneath already say so one condition at a
         * time. The alternative — two real tabs with the columns split between them — collides in
         * `collectRows`, where two `bright:` groups in one row overwrite rather than merge.
         */
        var tabText = tabInColumns[1].trim();
        var tabWhen = null;
        var twhen = tabText.match(/\{([^}]*)\}\s*$/);
        if (twhen) {
          tabWhen = parseConditionRules(twhen[1]);
          tabText = tabText.slice(0, twhen.index).trim();
        }
        var tab = { type: "tab", text: tabText };
        if (tabWhen) tab.showWhen = tabWhen;
        columns.push(tab);
        continue;
      }

      var headingInColumns = text.match(/^(#+)\s*(.+)$/);
      if (headingInColumns) {
        // A heading may carry a condition, the same `{…}` a column does. *Seed* is drawn only once a curve is
        // chosen, and a heading left behind over nothing reads as a section that failed to render.
        var headingText = headingInColumns[2].trim();
        var headingWhen = null;
        var hwhen = headingText.match(/\{([^}]*)\}\s*$/);
        if (hwhen) {
          headingWhen = parseConditionRules(hwhen[1]);
          headingText = headingText.slice(0, hwhen.index).trim();
        }
        var heading = {
          type: "heading",
          level: Math.min(6, headingInColumns[1].length + 1),
          text: headingText
        };
        if (headingWhen) heading.showWhen = headingWhen;
        columns.push(heading);
        continue;
      }

      var at = text.indexOf(":");
      var key = (at === -1 ? text : text.slice(0, at)).trim();
      var typeText = (at === -1 ? "text" : text.slice(at + 1)).trim();
      if (!key) continue;

      // `containerWidth:number=Width` — a label of its own, because the frames say *Width* and
      // *Margins* where the config says `containerWidth` and `padding`. The label belongs to the
      // panel and the key belongs to the config; neither should have to bend to the other.
      // `{scaleType=metric}` — this column appears only when another column in the **same row** holds
      // one of those values. A mode's fields depend on the scale it uses: a modular scale needs a
      // ratio and a metric one needs a step, and showing both means half of every tab is inert.
      // Márton's instruction: *"add the fields that are required, and remove the ones that are not
      // used in that mode."*
      //
      // `{}` rather than a second annotation because it belongs to the column it guards. Values are
      // separated by `|` inside the braces, which is why the split above counts brace depth.
      // Taken out **first**, and from anywhere in the spec: a condition contains an `=`, so splitting
      // the label off before removing it would hand `Scaling method` the wrong half.
      // **A nested group: `bright:{hue:number=Hue|chroma:number=Chroma}=Bright`.**
      //
      // An anchor is one thing you set and two numbers you set it with, so the config says so — a mode
      // entry holds `bright: { hue, chroma }` and the block reads the way a person would write it. The
      // alternative was six flat keys named `hueBright`, `chromaBright` and so on, with an annotation
      // explaining which belonged together; Márton chose the nesting.
      //
      // **Told apart from `showWhen` by position, not by content.** Both use braces. A condition follows a
      // type (`ratio:text{scaleType=modular}`); a group's braces *are* the type, immediately after the
      // colon. Sniffing the contents instead — "a condition has an `=` and a group has a `:`" — would
      // break the day someone writes a group with one column and no label.
      //
      // One level only. Two would be a form inside a form inside a row, and nothing asks for it.
      var groupColumns = null;
      if (typeText.charAt(0) === "{") {
        var close = matchingBrace(typeText, 0);
        if (close !== -1) {
          groupColumns = parseRowColumns(typeText.slice(1, close));
          typeText = typeText.slice(close + 1).trim();
        }
      }

      // `@helper:` on a column, taken out **first** and to the end of the segment — the same rule the
      // field-level one has, for the same reason: it is prose, and prose about this plugin says things
      // like "an object with no `@rows`", so it cannot stop at the next `@word`.
      //
      // A column helper therefore cannot contain a `|`, because that is what separates columns and the
      // split above has already happened. Stated rather than escaped: the alternative is a quoting rule
      // in a format whose whole point is that a person reads and pastes it.
      //
      // Extracted before the label, because the label is split at the *first* `=` and a helper may well
      // contain one — and *after* the group above, because a part's own helper lives inside the braces.
      // Taking this first swallowed the closing brace and the group's label with it, and the column came
      // back as a plain text field with no parts and nothing said so.
      // Prose, so it runs to the end of the segment exactly as `@helper:` does — which means a column may
      // carry one or the other, not both, and this one is taken first. It appears only while the disable
      // applies, so the note and the state are one fact: a static helper reading "anchors take effect once
      // you choose a curve" is false the moment a curve is chosen.
      var disabledNote = null;
      var noteInColumn = typeText.match(/@disabledNote:\s*(.*)$/);
      if (noteInColumn) {
        disabledNote = noteInColumn[1].trim();
        typeText = typeText.slice(0, noteInColumn.index).trim();
      }

      var columnHelper = null;
      var helperInColumn = typeText.match(/@helper:\s*(.*)$/);
      if (helperInColumn) {
        columnHelper = helperInColumn[1].trim();
        typeText = typeText.slice(0, helperInColumn.index).trim();
      }

      // `@placeholder="…"` on a column, spelled the same way a field spells it. Frame 2065:4154 is the panel
      // as it opens and every cell in it carries a grey example — a hue, a chroma, a hex — which is the only
      // thing telling a first-time reader what belongs in a numeric cell called *Chroma*. Taken out before
      // the condition and the label because it is quoted and may contain either character.
      // `@unit="%"` — a unit printed inside the input at its right edge. Quoted like a placeholder and
      // taken out before the label for the same reason: it is free text and may contain an `=`.
      var columnUnit = null;
      var unitInColumn = typeText.match(/@unit\s*=\s*["']([^"']*)["']/);
      if (unitInColumn) {
        columnUnit = unitInColumn[1];
        typeText = typeText.replace(/@unit\s*=\s*["'][^"']*["']/g, "").trim();
      }

      var columnPlaceholder = null;
      var phInColumn = typeText.match(/@placeholder\s*=\s*["']([^"']*)["']/);
      if (phInColumn) {
        columnPlaceholder = phInColumn[1];
        typeText = typeText.replace(/@placeholder\s*=\s*["'][^"']*["']/g, "").trim();
      }

      // **`[field=value]` — inert, not absent.** Márton, on the Palette while a mode is on Original:
      // *"disabled, not hidden. They hold the anchors auto-import read from my file, and that is information
      // I want to see."* Hiding a field holding a real value read out of someone's file throws that value
      // away visually; disabling says "this is what is there, and it is not doing anything yet".
      //
      // Brackets rather than an `@keyword`, and for the same reason `{…}` is braces: a condition contains
      // `=`, and the label is split at the *first* `=`. An `@disabledWhen: a=x` written before the label
      // swallowed it — the column came back labelled from its key with the condition eaten. Positional and
      // bracketed cannot do that.
      //
      // Same rule grammar as `{…}`, so `a=x;b=y` is an AND: the Palette is inert only while *both* segments
      // are on Original.
      var disabledWhen = null;
      var off = typeText.match(/\[([^\]]*)\]/);
      if (off) {
        typeText = (typeText.slice(0, off.index) + typeText.slice(off.index + off[0].length)).trim();
        disabledWhen = parseConditionRules(off[1]);
      }

      var showWhen = null;
      var when = typeText.match(/\{([^}]*)\}/);
      if (when) {
        typeText = (typeText.slice(0, when.index) + typeText.slice(when.index + when[0].length)).trim();
        showWhen = parseConditionRules(when[1]);
      }

      var label = null;
      var eq = typeText.indexOf("=");
      if (eq !== -1) {
        label = typeText.slice(eq + 1).trim();
        typeText = typeText.slice(0, eq).trim();
      }
      // Which is why an option's own label is spelled `value:Label` and not `value=Label`: the label
      // above is split off at the **first** `=`, so an `=` inside the parentheses would hand
      // *Scaling method* to the first ratio.

      // `labelSpelled` records that the source wrote `=Label` out, even when it matches the
      // prettified key. Without it, serialize drops what it can infer — and `columns:number=Columns`
      // came back as `columns:number` the first time anyone typed in a cell. Semantically identical,
      // visibly not what was written, and this is a file people read and paste.
      var column = {
        key: key, label: label || labelFromName(key), type: "text", labelSpelled: label != null
      };
      if (showWhen) column.showWhen = showWhen;
      if (disabledWhen) column.disabledWhen = disabledWhen;
      if (disabledNote) column.disabledNote = disabledNote;
      if (columnHelper) column.helper = columnHelper;
      if (columnPlaceholder != null) column.placeholder = columnPlaceholder;
      if (columnUnit != null) column.unit = columnUnit;
      if (groupColumns && groupColumns.length) {
        column.type = "group";
        column.columns = groupColumns;
        columns.push(column);
        continue;
      }
      // `lower:curve=Lower curve`, or `lower:curve(original)=Lower curve` to add *Original* to its preset
      // list. The parenthesis is the same one an options column uses, rather than a new annotation: this is
      // a fixed extra choice offered by the control, which is what those parentheses have always meant.
      //
      // *Original* is not a curve — it is Colors saying "leave the steps this file already has". It reaches
      // the config as an **empty array**, which is the honest spelling: no points, no curve. Only the scripts
      // that have something to fall back to ask for it.
      // **Greedy to the last `)`, not the first.** A `ramp:` template is CSS and brings its own brackets —
      // `hsl($ 100% 50%)` — and stopping at the first one made the whole `curve(...)` fail to match, so the
      // column silently fell back to a plain text field. Nothing said so; the chart just was not there.
      var curveMatch = typeText.match(/^curve(?:\((.*)\))?$/);
      if (curveMatch) {
        column.type = "curve";
        var curveMode = (curveMatch[1] || "").trim();
        // **Comma-separated settings, not one word.** `curve(original)` and `curve(growth:ratio)` were the
        // whole vocabulary while a curve was a shape in a unit square. A curve bound to an axis needs to say
        // which two cells hold its ends and what the channel's limits are, and those are three facts, not one.
        applyCurveSpec(column, curveMode);
        columns.push(column);
        continue;
      }
      var optionMatch = typeText.match(/^(radio)?\((.*)\)$/);
      if (optionMatch) {
        column.type = optionMatch[1] ? "radio" : "select";
        column.options = parseColumnOptions(optionMatch[2]);
      } else if (typeText === "number" || typeText === "checkbox" || typeText === "text" ||
                 typeText === "list" || typeText === "mode") {
        // `mode` is the collection's own mode list plus *New mode*, the same control `@mode` builds at field
        // level. Every Colors frame draws a mode block's Mode field as that dropdown; as a `text` column it
        // was a plain input, so the modes a file actually has were nowhere on screen.
        column.type = typeText;
      }
      columns.push(column);
    }
    return columns;
  }

  /** `a=x|y;b=z` → rules, ANDed. One implementation, used by the brace form and by `@disabledWhen:`. */
  function parseConditionRules(text) {
    var rules = String(text == null ? "" : text).split(";").map(function (rule) {
      var bits = rule.split("=");
      if (bits.length < 2) return null;
      return {
        field: bits[0].trim(),
        values: bits[1].split("|").map(function (v) { return v.trim(); }).filter(Boolean)
      };
    }).filter(function (rule) { return rule && rule.field && rule.values.length; });
    return rules.length ? rules : null;
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

  // --- @PANEL_START: the panel recipe beside the values --------------------------------------
  //
  // See .plans/31-panel-spec-json.md and .plans/37-config-format-decision.md.
  // `@CONFIG_START` stays a value list — this is a second, separate region naming the panel's
  // structure.
  //
  // **Two Source shapes (Plan 37 / 2.0):**
  //   1. Live object (shipped): `var __codefigPanel = { blocks: […] };` — syntax-highlighted.
  //   2. Comment JSON (legacy): `// {` … `// }` — still accepted so saved scripts keep loading.
  // Both compile to the same IR. Bare `{…}` at statement level is illegal JS (a block); the
  // reserved binding is required for the live form.
  //
  // **Dispatch lives at the top of `parse()`, not in the caller.** Every existing call site keeps
  // calling `parse(code)` with one argument; `panelSpecText` is a second, optional parameter.

  /** Strips a leading `// ` (or bare `//`) from every line — the same convention @DOC_START uses. */
  function stripLinePrefixes(text) {
    return String(text || "").split(/\r?\n/).map(function (line) {
      return line.replace(/^\s*\/\/ ?/, "");
    }).join("\n");
  }

  /**
   * Turn extracted `@PANEL_START`…`@PANEL_END` body into the object text `looseJsonToJson` expects.
   *
   * Live form wins when present; otherwise comment prefixes are stripped (legacy).
   */
  function normalizePanelSpecText(text) {
    var raw = String(text || "");
    var trimmed = raw.replace(/^\s+/, "").replace(/\s+$/, "");
    var assign = /^(?:var|let|const)\s+__codefigPanel\s*=\s*/.exec(trimmed);
    if (assign) {
      return trimmed.slice(assign[0].length).replace(/;\s*$/, "").replace(/^\s+/, "").replace(/\s+$/, "");
    }
    return stripLinePrefixes(raw).replace(/^\s+/, "").replace(/\s+$/, "");
  }

  /** `{ value: label }` or `[{value,label}]` → `[{value,label}]`, the shape columns already carry. */
  function panelOptions(raw) {
    if (!raw) return undefined;
    if (Array.isArray(raw)) {
      return raw.map(function (o) {
        if (o && typeof o === "object") {
          var k = Object.keys(o)[0];
          return { value: k, label: o[k] };
        }
        return { value: String(o), label: String(o) };
      });
    }
    return Object.keys(raw).map(function (k) { return { value: k, label: raw[k] }; });
  }

  /** `{ field: value|values }` → `[{field, values}]` — one key, ANDed if more are added later. */
  function panelConditionRules(cond) {
    if (!cond || typeof cond !== "object") return undefined;
    return Object.keys(cond).map(function (field) {
      var v = cond[field];
      return { field: field, values: Array.isArray(v) ? v.map(String) : [String(v)] };
    });
  }

  /**
   * A field's own `options`, in the shape `renderer.js`'s field-level `fieldOptionValue`/
   * `fieldOptionLabel` expect (`renderer.js:3680`) — raw `"value:Label"` strings, bare when the
   * label matches the value. **Not** the `{value,label}` object `panelOptions()` returns: that
   * shape is `parseColumnOptions`'s, for an `@rows` column, and a radio/select *field* fed objects
   * there reads `String(option)` as `"[object Object]"` for both value and label — silently, since
   * nothing there throws. `multiselect` is its own third shape again (bare strings, no `:` split
   * at all — `renderer.js`'s multiselect branch uses the string as-is), so it is kept plain.
   */
  function panelFieldOptions(raw, fieldType) {
    var objs = panelOptions(raw);
    if (!objs) return undefined;
    if (fieldType === "multiselect") return objs.map(function (o) { return o.value; });
    return objs.map(function (o) { return o.value === o.label ? o.value : o.value + ":" + o.label; });
  }

  /**
   * `"a..b"` or `"a..b..c"` → `{from,to}` / `{from,mid,to}` — the shape a curve's `ends` has always
   * carried, parsed by `applyCurveSpec` for the one-line format. Plan 31's own worked example
   * writes `ends` as exactly this string; `panelColumn` used to store it verbatim, so a curve
   * column read from JSON carried a string where the renderer expects an object — never checked,
   * because nothing reads `column.ends.from` without first confirming `column.ends` is truthy.
   * Also accepts the already-parsed `{from[,mid],to}` object, so an author (or an older draft of
   * this file) who wrote the structured shape directly still works.
   */
  function panelEnds(raw) {
    if (raw && typeof raw === "object") return raw;
    var text = String(raw == null ? "" : raw);
    var trio = text.match(/^([A-Za-z0-9_$.]+)\.\.([A-Za-z0-9_$.]+)\.\.([A-Za-z0-9_$.]+)$/);
    if (trio) return { from: trio[1], mid: trio[2], to: trio[3] };
    var pair = text.match(/^([A-Za-z0-9_$.]+)\.\.([A-Za-z0-9_$.]+)$/);
    if (pair) return { from: pair[1], to: pair[2] };
    throw new Error('ends "' + text + '" is not "a..b" or "a..b..c"');
  }

  /** `[lo, hi]` → `{lo,hi}` — same reasoning as `panelEnds`, for `range`. Accepts `{lo,hi}` too. */
  function panelRange(raw) {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
    if (!Array.isArray(raw) || raw.length !== 2) {
      throw new Error("range " + JSON.stringify(raw) + " is not [lo, hi]");
    }
    var lo = raw[0], hi = raw[1];
    if (typeof lo !== "number" || typeof hi !== "number" || !(hi > lo)) {
      throw new Error("range " + JSON.stringify(raw) + " is not two numbers with hi > lo");
    }
    return { lo: lo, hi: hi };
  }

  /** Marker entries a `columns` list may carry instead of a keyed field — no `key` of their own. */
  var PANEL_COLUMN_MARKER_TYPES = { heading: true, divider: true, preview: true };

  /**
   * One `@rows` column, from its JSON block to the shape `parseRowColumns` already produces.
   *
   * **A `columns` entry is not always a field.** A bare `#Heading` and the trailing `@preview`
   * inside Colors' real `@rows` line are marker entries with no `key` — `parseRowColumns` gives
   * each its own branch before it ever looks for a key. This used to fall straight into the
   * keyed-field path below, which built `{key: undefined, label: labelFromName(undefined), ...}` —
   * nonsense the renderer had never seen, rather than the marker it needed.
   *
   * **`tab` and `anchors` never reach this function.** Both expand into several sibling entries,
   * not one — `expandColumnsList`, below, handles them before a single block ever gets here.
   */
  function panelColumn(block) {
    if (block.key == null) {
      if (!PANEL_COLUMN_MARKER_TYPES[block.type]) {
        throw new Error("a keyless column has an unrecognised type: " +
          (block.type == null ? "(none)" : JSON.stringify(block.type)));
      }
      if (block.type === "heading") {
        var headingWhen = panelConditionRules(block.showWhen);
        var heading = { type: "heading", level: block.level || 1, text: block.text };
        if (headingWhen) heading.showWhen = headingWhen;
        return heading;
      }
      if (block.type === "divider") return { type: "divider" };
      return { type: "preview" };
    }
    if (!block.type) throw new Error("column \"" + block.key + "\" has no type");
    var column = {
      key: block.key, label: block.label || labelFromName(block.key), type: block.type,
      labelSpelled: !!block.label
    };
    var options = panelOptions(block.options);
    if (options) column.options = options;
    var showWhen = panelConditionRules(block.showWhen);
    if (showWhen) column.showWhen = showWhen;
    var disabledWhen = panelConditionRules(block.disabledWhen);
    if (disabledWhen) column.disabledWhen = disabledWhen;
    if (block.disabledNote) column.disabledNote = block.disabledNote;
    if (block.helper) column.helper = block.helper;
    if (block.placeholder) column.placeholder = block.placeholder;
    // `@unit="%"` in the one-liner — a unit printed inside the input at its right edge.
    // Typography's letterSpacing / lineHeight groups carry it; Colors never needed one.
    if (block.unit != null) column.unit = block.unit;
    if (block.ends) column.ends = panelEnds(block.ends);
    if (block.range) column.range = panelRange(block.range);
    if (block.ramp) column.ramp = block.ramp;
    if (block.growth) column.growth = block.growth;
    if (block.allowOriginal) column.allowOriginal = true;
    // **A curve's own height may leave `[0,1]`, opt-in.** Off by default because the same shape is
    // shared by Spacing, Radius and Typography's own scale curves, where an overshoot would let an
    // interior step exceed the scale's own defined ends. See `@Bezier`'s `bezierNormalise`.
    if (block.overshoot) column.overshoot = true;
    if (block.fields) {
      // A nested group ("bright", "middle", "dark"): the group's own fields, each a column in turn.
      column.columns = expandColumnsList(block.fields);
      column.group = block.group || block.key;
    }
    if (block.section) column.section = block.section;
    return column;
  }

  /**
   * One `positions` × `fields` cross-product, expanded into the group columns
   * `parseRowColumns` would have produced from N near-identical `bright:{...}`/`middle:{...}`/
   * `dark:{...}` blocks. This is what makes Colors' nine anchor blocks (three positions each for
   * Hue, three for Saturation/Chroma, two for Lightness) three declarations instead of nine —
   * a position axis and a field-per-colour-model axis, the two facts an anchor actually varies
   * by, named once instead of repeated with one word changed each time.
   *
   * `labels`/`placeholders` are per-position maps rather than a `{channel} {position}` template:
   * Hue's start/middle/end suffix pattern does not hold for Lightness (`"Bright"`, not
   * `"Lightness start"`) or for the placeholder examples (Lightness's are real boundary values,
   * `"eg. 98"`/`"eg. 4"`, not one example repeated). Deriving a label from a formula would have
   * been magic that broke on the second real case; a map costs one line per position and breaks
   * on nothing.
   *
   * `notes`, optional: the old format's `@disabledNote:` could only attach to whichever column's
   * segment it was written in — Colors' has it on `dark` only, not `bright`, an artifact of where
   * the one-liner happened to put it rather than a rule about which position deserves one. Kept as
   * a per-position escape hatch rather than smoothed into "every position gets one" or "none do,"
   * either of which would change what the old parser produces.
   */
  /**
   * A per-position value, written once for every position or spelled out per position — for
   * `placeholders` and `notes`, never for `labels` (see `expandAnchors`'s own comment on why not).
   * Three of `anchors`' four real uses have the *same* placeholder at every position (Hue's,
   * Chroma's, Saturation's — an abstract example that doesn't change shape by position); only
   * Lightness's genuinely differs (`"eg. 98"` near white, `"eg. 4"` near black). Before this, every
   * one of the four had to spell out the same map shape regardless, so the one block that actually
   * varies read no differently from the three that don't. A bare scalar now says "every position,
   * unconditionally" — a map is still there for exactly the case where positions disagree, and
   * only that case looks like one.
   */
  function perPosition(value, position) {
    if (value == null) return undefined;
    if (typeof value === "string") return value;
    return value[position];
  }

  /**
   * `positions` × `fields`, expanded into the group columns `parseRowColumns` would have produced
   * from N near-identical `bright:{...}`/`middle:{...}`/`dark:{...}` blocks — one declaration for
   * an idea that used to need one block per position.
   *
   * **`labels` stays an explicit map, deliberately, unlike `placeholders`/`notes`.** Hue's
   * "start"/"middle"/"end" suffix is not a rule the format could apply on the author's behalf:
   * Lightness's own labels are `"Bright"`/`"Dark"`, not `"Lightness start"`/`"Lightness end"` — so
   * a template would need a way to say "don't template me" for the one case that doesn't fit,
   * which is worse than the map it would replace. A scalar shorthand has no such trap: "the same
   * value at every position" is unambiguous, and the map is still there the moment a position
   * needs to differ, which is exactly what happened to `placeholders` (three anchors share one
   * value, one doesn't) and not to `labels` (none of the four share theirs).
   */
  function expandAnchors(block) {
    if (!Array.isArray(block.positions) || !block.positions.length) {
      throw new Error("an anchors block needs a non-empty positions list");
    }
    if (!Array.isArray(block.fields) || !block.fields.length) {
      throw new Error("an anchors block needs a non-empty fields list");
    }
    var disabledWhen = panelConditionRules(block.disabledWhen);
    return block.positions.map(function (position) {
      var group = {
        // A position's group label is always spelled in the anchors block that names it
        // (`labelFromName` only supplies a *default* when nothing was given — here something
        // always was, just once instead of per position), matching the old parser recording
        // `labelSpelled: true` for every `bright`/`middle`/`dark` group it has ever produced.
        key: position, label: labelFromName(position), type: "group", labelSpelled: true
      };
      if (disabledWhen) group.disabledWhen = disabledWhen;
      var note = perPosition(block.notes, position);
      if (note) group.disabledNote = note;
      group.columns = block.fields.map(function (field) {
        if (!field.labels || field.labels[position] == null) {
          throw new Error('anchors field "' + field.key + '" has no label for position "' + position + '"');
        }
        var col = {
          key: field.key, label: field.labels[position], type: field.type || "number",
          labelSpelled: true
        };
        // **Not for `middle`.** Bright and dark are always real — a read fills them the moment
        // there is a collection to read, so an example placeholder there is inert decoration. The
        // middle position is the one that can genuinely have nothing in it (an unfitted mode,
        // `.plans/36-lazy-fit-on-demand.md`), and an example number in a greyed box next to a real
        // one reads as data, not as a prompt — confirmed live: "eg. 12" in the middle box was read
        // as a value. An empty field stays visibly empty instead.
        var placeholder = position === "middle" ? null : perPosition(field.placeholders, position);
        if (placeholder != null) col.placeholder = placeholder;
        var fieldWhen = panelConditionRules(field.showWhen);
        if (fieldWhen) col.showWhen = fieldWhen;
        return col;
      });
      group.group = position;
      return group;
    });
  }

  /**
   * A `columns` (or group `fields`) list, with `tab` and `anchors` entries expanded in place —
   * the one function every list of columns goes through, so a tab or an anchors block nested
   * inside a group's own `fields` expands exactly the same way a top-level one does.
   *
   * **`tab` nests its contents; `parseRowColumns` still emits a flat marker.** Indentation answers
   * "which columns belong to this tab" while writing the spec; the columns handed to the renderer
   * are exactly the flat `{type:"tab",...}` marker followed by its columns that the old format
   * always produced — this function is where the un-nesting happens, once, so nothing downstream
   * has to know the JSON was ever nested at all.
   *
   * **A merged tab is one container, several `names`.** `#>Saturation{colorModel=hsl}` and
   * `#>Chroma{colorModel=oklch}` sit adjacent in the old format with no columns between them,
   * because they are one tab shown under two labels depending on which model is active — the
   * columns after them are shared, not duplicated per name. `names` is a list for exactly that:
   * each becomes its own marker row, in order, before the (one, shared) set of columns.
   */
  function expandColumnsList(list) {
    var out = [];
    (list || []).forEach(function (block) {
      if (block.type === "tab") {
        if (!Array.isArray(block.names) || !block.names.length) {
          throw new Error('a tab needs a non-empty "names" list');
        }
        if (!Array.isArray(block.columns)) {
          throw new Error('tab "' + block.names[0].text + '" has no columns — ' +
            "a tab nests its contents now, it does not mark a position in a flat list");
        }
        block.names.forEach(function (name) {
          if (!name.text) throw new Error("a tab name needs text");
          var tab = { type: "tab", text: name.text };
          var tabWhen = panelConditionRules(name.showWhen);
          if (tabWhen) tab.showWhen = tabWhen;
          out.push(tab);
        });
        out = out.concat(expandColumnsList(block.columns));
        return;
      }
      if (block.type === "anchors") {
        out = out.concat(expandAnchors(block));
        return;
      }
      out.push(panelColumn(block));
    });
    return out;
  }

  /** One plain field, from its JSON panel block plus its live value from the values region. */
  function panelFieldRow(block, values, idx) {
    var row = {
      type: "field", name: block.key, value: values ? values[block.key] : undefined,
      label: block.label || labelFromName(block.key), labelSpelled: !!block.label, tooltip: "",
      inputType: block.type,
      // Placeholder only — `serializePanelValues` detects property-list vs `var` from the indexed
      // raw of each key in `configText`, so a utility script's `@UI_CONFIG` values round-trip as
      // `var name = …;` without this flag needing to be right. Set because the row carries no
      // `.raw` on purpose (see `serialize()`'s own comment on why one is never invented here),
      // so the old branch's fast path never fires for it and its full-reconstruction path throws
      // rather than building a line from a spec grammar that cannot express `anchors` or nested
      // `tab` containers.
      syntax: "property"
    };
    if (block.placeholder) row.placeholder = block.placeholder;
    if (block.helper) row.helper = block.helper;
    if (block.fillIfEmpty) row.fillIfEmpty = String(block.fillIfEmpty);
    // Dynamic lists (`@options: localVariableCollections`) are a string source name, not a
    // static option array — same split the one-liner path makes on `|`. A bare string in
    // `options` is that source; `optionSource` is accepted as an explicit spelling of the same
    // fact. Feeding a string into `panelFieldOptions` used to treat it as an object and emit
    // character-index "options" (0, 1, 2, …), which is how a migrated multiselect would open
    // looking like a list of digits.
    if (typeof block.options === "string") {
      row.optionSource = block.options;
    } else if (block.optionSource) {
      row.optionSource = block.optionSource;
    } else if (block.options) {
      row.options = panelFieldOptions(block.options, block.type);
    }
    var showWhen = panelConditionRules(block.showWhen);
    if (showWhen) row.showWhenRules = showWhen;
    if (block.type === "rows") {
      row.columns = expandColumnsList(block.columns);
      row.tabs = block.layout === "tabs";
      row.blocks = block.layout === "blocks";
      // Opt-in: Spacing / Corner radius / Typography mode tabs. Copies the open mode's settings
      // onto the others (names stay). Grid and Colors leave this off — their modes are meant to differ.
      if (block.copyToOthers) row.copyToOthers = true;
    }
    // A top-level `@group:` field ("lightness": bright/dark) — the same nested-columns shape a
    // `@rows` group cell carries, read the same way (`block.fields`, not `block.columns`, so a
    // group's own members are never confused with a rows table's columns).
    if (block.type === "group") {
      row.columns = (block.fields || []).map(panelColumn);
    }
    // A top-level curve field (Colors' collection-scope OKLCH curve). `panelColumn` already reads
    // these five keys for a `@rows` curve column; a plain field never did, so `@curve @allowOriginal
    // @ramp:... @ends:... @range:...` rendered — an editor with no ramp swatch, no axis range and no
    // Original preset, because nothing here ever looked at the JSON block for them.
    if (block.type === "curve") {
      if (block.ramp) row.ramp = block.ramp;
      if (block.growth) row.growth = block.growth;
      if (block.ends) row.ends = panelEnds(block.ends);
      if (block.range) row.range = panelRange(block.range);
      if (block.allowOriginal) row.allowOriginal = true;
    }
    // `@mode: targetCollection` — the mode picker names the collection field it follows. Recorded
    // even when bare (`null`), matching the one-liner path: serialisation and the renderer both
    // distinguish "explicitly unbound" from "never a mode field".
    if (block.type === "mode") {
      row.collectionField = block.collection != null ? block.collection : null;
    }
    return row;
  }

  /**
   * `@PANEL_START`'s parsed object (top-level `blocks`, optionally nested under `section`) plus the
   * values `parseConfigBlockObject` already reads from `@CONFIG_START` or `@UI_CONFIG_START`, merged
   * into the `{ rows }` shape `parse()` builds. Sections stay in the tree so the renderer can wrap
   * them in the DOM; callers that need a flat field list use `flattenPanelRows`.
   */
  /** Leaf marker types (no nested `blocks`). Spacers and `section` are handled separately. */
  var PANEL_MARKER_TYPES = {
    heading: true, divider: true, chips: true, suggestions: true, preview: true,
    directive: true, paragraph: true
  };

  var PANEL_SPACER_TYPES = {
    "spacer-s": "s", "spacer-m": "m", "spacer-l": "l"
  };

  /**
   * Depth-first leaf list. Sections are containers, not fields — key parity, chips discovery and
   * differential tests walk this rather than inventing a second scan each time.
   */
  function flattenPanelRows(rows) {
    var out = [];
    (rows || []).forEach(function (r) {
      if (r && r.type === "section") {
        Array.prototype.push.apply(out, flattenPanelRows(r.blocks));
      } else if (r) {
        out.push(r);
      }
    });
    return out;
  }

  /** AND parent readiness onto children that do not already name those fields (Plan 37 readiness). */
  function inheritShowWhen(rows, rules) {
    if (!rules || !rules.length) return;
    (rows || []).forEach(function (r) {
      if (!r) return;
      if (r.type === "section") {
        inheritShowWhen(r.blocks, rules);
        return;
      }
      var existing = r.showWhenRules || [];
      var have = {};
      existing.forEach(function (rule) { have[rule.field] = true; });
      var extra = rules.filter(function (rule) { return !have[rule.field]; });
      if (extra.length) r.showWhenRules = existing.concat(extra);
    });
  }

  /**
   * One level of `blocks` → row nodes. `depth === 0` is the panel root: a divider there is a
   * section rule (edge to edge). Inside a `section`, a divider stays short unless `section: true`
   * is still written (legacy; prefer moving the rule between sections).
   */
  function parsePanelBlocks(blocks, values, depth) {
    var rows = [];
    (blocks || []).forEach(function (block, idx) {
      if (block.key != null) {
        if (!block.type) {
          throw new Error("block " + idx + " (\"" + block.key + "\") has no type");
        }
        rows.push(panelFieldRow(block, values, idx));
        return;
      }

      var spacerSize = PANEL_SPACER_TYPES[block.type];
      if (spacerSize) {
        rows.push({ type: "spacer", size: spacerSize });
        return;
      }
      if (block.type === "spacer") {
        var size = String(block.size || "").toLowerCase();
        if (size !== "s" && size !== "m" && size !== "l") {
          throw new Error('block ' + idx + ' spacer size must be "s", "m", or "l"');
        }
        rows.push({ type: "spacer", size: size });
        return;
      }

      if (block.type === "section") {
        if (!Array.isArray(block.blocks)) {
          throw new Error("block " + idx + " (section) needs a blocks array");
        }
        var section = {
          type: "section",
          blocks: parsePanelBlocks(block.blocks, values, depth + 1)
        };
        var sWhen = panelConditionRules(block.showWhen);
        if (sWhen) {
          section.showWhenRules = sWhen;
          inheritShowWhen(section.blocks, sWhen);
        }
        if (block.id != null && String(block.id).trim()) {
          section.id = String(block.id).trim();
        }
        rows.push(section);
        return;
      }

      // A field is recognised by carrying `key`, not by a `type` wrapper — `type` on a field block is
      // its *control* type ("collection", "number", "rows", …), the same word `heading`/`divider`/
      // `chips`/`suggestions`/`preview`/`directive`/`paragraph` use for their own kind. Two meanings
      // for one word would either collide or need a second key nobody could remember the name of.
      //
      // **Refuses rather than drops.** A block this loop does not recognise used to fall through
      // every branch and vanish — no row, no error, nothing on screen. That is how every paragraph in
      // a real migration attempt disappeared silently: correct-looking JSON, an empty panel section,
      // and nothing to say why. Same principle as `src/style-scoper.js`'s `url()` rule: a hard error
      // the author sees is better than output that is quietly wrong.
      if (!PANEL_MARKER_TYPES[block.type]) {
        throw new Error("block " + idx + " has an unrecognised type: " +
          (block.type == null ? "(none)" : JSON.stringify(block.type)));
      }
      if (block.type === "heading") {
        var hWhen = panelConditionRules(block.showWhen);
        var heading = { type: "heading", level: block.level || 1, text: block.text };
        if (hWhen) heading.showWhenRules = hWhen;
        rows.push(heading);
      } else if (block.type === "divider") {
        var dWhen = panelConditionRules(block.showWhen);
        // Position decides weight when sections are in play: a divider *between* top-level
        // sections is edge-to-edge; a divider *inside* a section is short. Flat recipes (no
        // `section` siblings) keep the old rule — only `section: true` reaches the edges.
        var asSection = !!block.section;
        if (depth > 0) {
          asSection = !!block.section;
        } else if ((blocks || []).some(function (b) { return b && b.type === "section"; })) {
          asSection = true;
        }
        var divider = { type: "divider", section: asSection };
        if (dWhen) divider.showWhenRules = dWhen;
        rows.push(divider);
      } else if (block.type === "chips") {
        var cWhen = panelConditionRules(block.showWhen);
        var chips = { type: "chips", label: block.label || "Collection modes", from: block.from || "modes" };
        if (cWhen) chips.showWhenRules = cWhen;
        rows.push(chips);
      } else if (block.type === "suggestions") {
        var sWhen = panelConditionRules(block.showWhen);
        var suggestions = { type: "suggestions" };
        if (sWhen) suggestions.showWhenRules = sWhen;
        rows.push(suggestions);
      } else if (block.type === "preview") {
        var pvWhen = panelConditionRules(block.showWhen);
        var preview = { type: "preview" };
        if (pvWhen) preview.showWhenRules = pvWhen;
        rows.push(preview);
      } else if (block.type === "directive") {
        rows.push({ type: "directive", directive: block.name });
      } else if (block.type === "paragraph") {
        // The one bit a blank `// ` line carries in the old format: does this explain what
        // comes before it or what comes after? JSON has no blank-line equivalent, so the format
        // asks for the bit directly rather than guessing a default that would be right for some
        // paragraphs and silently wrong for others — see `foldProse` in renderer.js, which reads
        // this instead of its own adjacency search whenever it is set.
        if (block.attachTo !== "next" && block.attachTo !== "previous") {
          throw new Error('block ' + idx + ' is a paragraph with no attachTo ' +
            '("next" or "previous" — which row does it explain?)');
        }
        var pWhen = panelConditionRules(block.showWhen);
        var paragraph = { type: "paragraph", text: block.text, attachTo: block.attachTo };
        if (pWhen) paragraph.showWhenRules = pWhen;
        rows.push(paragraph);
      }
    });
    return rows;
  }

  function parsePanelSpec(panelSpecText, values) {
    var spec;
    try {
      spec = JSON.parse(looseJsonToJson(normalizePanelSpecText(panelSpecText)));
    } catch (e) {
      return { rows: [], error: "unreadable @PANEL_START: " + e.message };
    }
    try {
      return { rows: parsePanelBlocks(spec.blocks || [], values, 0) };
    } catch (e) {
      return { rows: [], error: "invalid @PANEL_START: " + e.message };
    }
  }

  /**
   * One `var name = …;` line, same match shape the old one-line path uses, or null.
   * Kept local so `indexConfigProperties` and `parseConfigBlockAssignments` cannot disagree.
   */
  function readOneLineVar(line) {
    var m = String(line || "").match(/^\s*var\s+(\w+)\s*=\s*(.+?)\s*;(?:\s*\/\/\s*(.*))?$/);
    return m || null;
  }

  /**
   * Walks a values region's text into `{ key, raw, syntax, trailingComma }` entries plus
   * whatever sits between them, in source order. Accepts both shapes a values block can have:
   *
   *   - property list (`key: value,`) — `@CONFIG_START`, DSF scripts
   *   - `var` assignments (`var key = value;`) — `@UI_CONFIG_START`, utility scripts
   *
   * Reuses `readPropertyEntry` / `readMultiLineValue` rather than a second brace-depth scan, so a
   * multi-line value is one entry here exactly as it is one value to the readers that already
   * know these texts.
   *
   * This is what lets a `@PANEL_START`-backed save reprint an untouched value **verbatim** —
   * byte for byte, not reconstructed from the parsed shape — and an edited one in the same
   * indentation and comma/`var` style the file already had, without a per-row `.raw` to carry it.
   */
  function indexConfigProperties(text) {
    var lines = String(text == null ? "" : text).split(/\r?\n/);
    var parts = [];
    var byKey = {};
    var i = 0;
    while (i < lines.length) {
      var oneLine = readOneLineVar(lines[i]);
      if (oneLine) {
        var varPart = { key: oneLine[1], raw: lines[i], syntax: "var", trailingComma: false };
        parts.push(varPart);
        byKey[varPart.key] = varPart;
        i++;
        continue;
      }
      if (/^\s*var\s+\w+\s*=/.test(lines[i])) {
        var span = readMultiLineValue(lines, i);
        if (span) {
          var multiPart = {
            key: span.match[1], raw: span.match[0], syntax: "var", trailingComma: false
          };
          parts.push(multiPart);
          byKey[multiPart.key] = multiPart;
          i = span.endLine + 1;
          continue;
        }
      }
      var entry = readPropertyEntry(lines, i);
      if (entry) {
        var propPart = {
          key: entry.match[1], raw: entry.match[0], syntax: "property",
          trailingComma: entry.trailingComma
        };
        parts.push(propPart);
        byKey[propPart.key] = propPart;
        i = entry.endLine + 1;
      } else {
        parts.push({ key: null, raw: lines[i] });
        i++;
      }
    }
    return { parts: parts, byKey: byKey };
  }

  /**
   * Whether `@PANEL_START`'s fields and the values region agree — the same comparison
   * `validatePanelKeyParity` makes in `validate-scripts.js`, at build time, over a script already
   * committed. This is the runtime half: a script pasted into `clientStorage` never goes through
   * a build, so nothing has checked it until now. Checked at **load**, not only at save, so a
   * mismatch is something the author is told about before they start editing, not something they
   * find out afterwards because a field they could not see never had anywhere to save.
   *
   * Not data loss either way — `serializePanelValues` never drops a value with no field, it
   * reprints it untouched — but a value with no field cannot be edited from the panel, and a
   * field with no value opens blank, and both are worth saying plainly rather than leaving the
   * author to notice on their own.
   *
   * → a status string, or `null` when the two agree.
   */
  function panelKeyDrift(rows, values) {
    var leaves = flattenPanelRows(rows);
    var fieldKeys = {};
    leaves.forEach(function (r) { if (r.type === "field") fieldKeys[r.name] = true; });
    var valueKeys = Object.keys(values || {});
    var missing = leaves.filter(function (r) { return r.type === "field" && valueKeys.indexOf(r.name) === -1; })
      .map(function (r) { return r.name; });
    var extra = valueKeys.filter(function (k) { return !fieldKeys[k]; });
    if (!missing.length && !extra.length) return null;

    function list(keys) { return keys.map(function (k) { return '"' + k + '"'; }).join(", "); }
    var parts = [];
    if (missing.length) {
      parts.push((missing.length === 1 ? list(missing) + " is a field" : list(missing) + " are fields") +
        " with no value here, so " + (missing.length === 1 ? "it opens" : "they open") + " blank.");
    }
    if (extra.length) {
      parts.push((extra.length === 1 ? list(extra) + " has" : list(extra) + " have") +
        " a value here with no matching field, so " + (extra.length === 1 ? "it won't" : "they won't") +
        " show in the form.");
    }
    return parts.join(" ");
  }

  function parse(code, panelSpecText) {
    if (panelSpecText) {
      var values = parseConfigBlockObject(code) || {};
      var result = parsePanelSpec(panelSpecText, values);
      // `fromPanelSpec` is what `serialize()` dispatches on, and `configText` is the values
      // region's own raw text (`@CONFIG_START` or `@UI_CONFIG_START`) — carried on the schema
      // rather than threaded through as a third argument to `serialize()`, so every existing
      // call site (which passes exactly `(schema, values)`) is unaffected whether or not it
      // ever touches a `@PANEL_START` script.
      result.fromPanelSpec = true;
      result.configText = code;
      if (!result.error) result.driftWarning = panelKeyDrift(result.rows, values);
      return result;
    }
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
        // `@prose` on its own line is the other **directive**: this block's paragraphs are its
        // content, so leave them on the page.
        //
        // Everywhere else a paragraph explains the control it sits against, and the renderer folds it
        // into that control's ⓘ. The Help script's specimen shelf is the one block where that is
        // backwards — it is a reference, read top to bottom, and its prose *is* the thing you came
        // for. One flag rather than a per-script exemption in the renderer, because the block is the
        // format: a script that means to be read says so in the block, where the next person editing
        // it will see why their paragraph stayed put.
        if (/^@prose\b/.test(c)) {
          rows.push({ type: "directive", raw: line, directive: "prose" });
          lastWasBlank = false;
          i++;
          continue;
        }

        if (/^@suggestions\b/.test(c)) {
          var sugSwRe = /@showWhen:\s*(\w+)\s*=\s*([\w|*]+)/g;
          var sugSwAll = [];
          var sugm;
          while ((sugm = sugSwRe.exec(c)) !== null) {
            sugSwAll.push({
              field: sugm[1],
              values: sugm[2].split("|").map(function (v) { return v.trim(); }).filter(Boolean)
            });
          }
          rows.push({
            type: "suggestions",
            raw: line,
            showWhenRules: sugSwAll.length ? sugSwAll : undefined
          });
          lastWasBlank = false;
          i++;
          continue;
        }

        if (/^@preview\b/.test(c)) {
          var pvSwRe = /@showWhen:\s*(\w+)\s*=\s*([\w|*]+)/g;
          var pvSwAll = [];
          var pvm;
          while ((pvm = pvSwRe.exec(c)) !== null) {
            pvSwAll.push({
              field: pvm[1],
              values: pvm[2].split("|").map(function (v) { return v.trim(); }).filter(Boolean)
            });
          }
          rows.push({
            type: "preview",
            raw: line,
            showWhenRules: pvSwAll.length ? pvSwAll : undefined
          });
          lastWasBlank = false;
          i++;
          continue;
        }

        var chipsMatch = c.match(/^@collectionModes\s*:\s*(.*)$/);
        if (chipsMatch) {
          // **The chips take conditions too.** They are the one control in *General* that fills itself from
          // the file, so they are the one that has something to say before an address is complete — and
          // saying it is what made choosing a collection look like a flicker of mode names.
          var cRest = chipsMatch[1] || "";
          var cSwRe = /@showWhen:\s*(\w+)\s*=\s*([\w|*]+)/g;
          var cSwAll = [];
          var cSwm;
          while ((cSwm = cSwRe.exec(cRest)) !== null) {
            cSwAll.push({
              field: cSwm[1],
              values: cSwm[2].split("|").map(function (v) { return v.trim(); }).filter(Boolean)
            });
          }
          rows.push({
            type: "chips",
            showWhenRules: cSwAll.length ? cSwAll : undefined,
            label: (cRest.replace(/\s*@showWhen:\s*\w+\s*=\s*[\w|*]+/g, "").trim() ||
                    "Collection modes"),
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
          var hSwRe = /@showWhen:\s*(\w+)\s*=\s*([\w|*]+)/g;
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
          var htext = hrest.replace(/\s+@showWhen:\s*\w+\s*=\s*[\w|*]+/g, "").trim();
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
        if (/^(---|\*\*\*|___)/.test(c)) {
          // Two lengths. `// ---` separates items and stays within the content; `// --- @section`
          // separates sections and reaches the panel's edges. A divider is always asked for — none
          // appears between blocks on its own.
          var dSwRe = /@showWhen:\s*(\w+)\s*=\s*([\w|*]+)/g;
          var dSwAll = [];
          var dsm;
          while ((dsm = dSwRe.exec(c)) !== null) {
            dSwAll.push({
              field: dsm[1],
              values: dsm[2].split("|").map(function (v) { return v.trim(); }).filter(Boolean)
            });
          }
          rows.push({
            type: "divider",
            section: /@section\b/.test(c),
            raw: line,
            showWhenRules: dSwAll.length ? dSwAll : undefined
          });
          lastWasBlank = false;
          i++;
          continue;
        }
        var pSwRe = /@showWhen:\s*(\w+)\s*=\s*([\w|*]+)/g;
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
        var ptext = c.replace(/\s+@showWhen:\s*\w+\s*=\s*[\w|*]+/g, "").trim();
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

        // **`@rows:` comes out first, before the helper grab below.**
        //
        // A column carries its own `@helper:` inside its segment, and the field-level grab is defined as
        // *to the end of the line* — so the first column helper swallowed the rest of the spec, `@tabs` and
        // `@label:` with it. The column lost its type and its label, and nothing said so.
        //
        // Taking the rows spec out of `tip` first resolves the scope by position rather than by inventing a
        // second word for the same thing: an `@helper:` inside the `@rows:` value belongs to the column
        // whose segment it is in, and anything left on the line after that belongs to the field. The
        // negative lookahead is what lets the value span several column helpers and still stop at the next
        // real annotation.
        var rowsMatch = tip.match(/@rows:\s*(.+?)(?=\s+@(?!helper:|disabledNote:)|$)/);
        if (rowsMatch) {
          tip = (tip.slice(0, rowsMatch.index) + tip.slice(rowsMatch.index + rowsMatch[0].length)).trim();
        }

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
        // below, which is what an unclaimed array falls into. `rowsMatch` was taken above, before the
        // helper grab could eat it.
        var rowColumns = null;
        var f_groupColumns = null;
        if (rowsMatch && Array.isArray(val)) {
          rowColumns = parseRowColumns(rowsMatch[1]);
          if (rowColumns.length > 0) inputType = "rows";
        }
        // `@group: hue:number=Hue|chroma:number=Chroma` on an **object** — one labelled row with captioned
        // parts, which is the same control a nested `@rows` column builds and the same shape the frames draw
        // for an anchor. `@rows` cannot serve it: that one needs an array, because it is a *repeatable* group.
        //
        // The OKLCH settings Lightness row is the case. Written as `@rows` it fell through to `unsupported`
        // and rendered as a code textarea — legal, silent, and not the control the design asks for.
        var groupMatch = tip.match(/@group:\s*(.+?)(?=\s+@(?!helper:|disabledNote:)|$)/);
        if (groupMatch && val && typeof val === "object" && !Array.isArray(val)) {
          var groupCols = parseRowColumns(groupMatch[1]);
          if (groupCols.length) {
            inputType = "group";
            f_groupColumns = groupCols;
          }
        }
        // `@curve` on an array — the bezier editor. Four numbers is one segment, ten is two, and `[]` is no
        // curve at all. Claimed here, ahead of the fallback below, for the same reason `@rows` is: an array
        // nothing has claimed becomes a read-only block.
        var f_curveOriginal = false;
        var f_curveOvershoot = false;
        // The same three settings a `curve(...)` column takes, spelled the way a field spells things.
        // Collected here and applied below, because `f` does not exist yet.
        var f_curveSpec = null;
        if (/@curve\b/.test(tip) && (Array.isArray(val) || val == null)) {
          inputType = "curve";
          f_curveOriginal = /@allowOriginal\b/.test(tip);
          f_curveOvershoot = /@overshoot\b/.test(tip);
          f_curveSpec = {};
          var f_trio = tip.match(/@ends:\s*([A-Za-z0-9_$.]+)\.\.([A-Za-z0-9_$.]+)\.\.([A-Za-z0-9_$.]+)/);
          var f_ends = f_trio || tip.match(/@ends:\s*([A-Za-z0-9_$.]+)\.\.([A-Za-z0-9_$.]+)/);
          if (f_ends) applyCurveSpec(f_curveSpec, "ends:" + f_ends.slice(1).join(".."));
          var f_range = tip.match(/@range:\s*(-?[0-9.]+)\.\.(-?[0-9.]+)/);
          if (f_range) applyCurveSpec(f_curveSpec, "range:" + f_range[1] + ".." + f_range[2]);
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
          // **The prose in the comment, not the rest of the comment.**
          //
          // `tip` is the annotation soup with the four that slice themselves out already gone, so it
          // still holds `@options: a|b|c`, `@showWhen: x=y`, `@textarea` and the rest — the syntax that
          // built the control rather than anything to say about it. That never showed, because this
          // fed a native `title` and the class the renderer added for it had no rule anywhere; the ⓘ
          // shows it, and 66 of the 82 fields in `scripts/` would have opened a bubble reading
          // "@textarea".
          //
          // An annotation runs to the next `@` or to the end of the line — that is the rule everywhere
          // in this block — so the prose is what comes before the first one. Which is also where people
          // write it: 16 fields carry a real description here, every one of them ahead of the
          // annotations, because `@helper:` has to be last and the rest read to end of line.
          tooltip: tip.split("@")[0].trim(),
          inputType: inputType,
        };
        if (phMatch) f.placeholder = phMatch[1];
        if (helperMatch) f.helper = helperMatch[1].trim();
        if (inputType === "curve" && f_curveOriginal) f.allowOriginal = true;
        if (inputType === "curve" && f_curveOvershoot) f.overshoot = true;
        if (f_curveSpec) {
          if (f_curveSpec.ends) f.ends = f_curveSpec.ends;
          if (f_curveSpec.range) f.range = f_curveSpec.range;
          var f_ramp = tip.match(/@ramp:\s*([^@]+)/);
          if (f_ramp) f.ramp = f_ramp[1].trim();
        }
        if (inputType === "mode") {
          // `null` for a bare `@mode`, and it stays null: resolution happens against the rendered
          // form, so the two spellings serialise back exactly as they were written.
          f.collectionField = modeMatch[1] ? modeMatch[1] : null;
        }
        // Which syntax this row was written in, so serialize puts it back the same way. A block is
        // one or the other in practice, but recording it per row means a mixed block round-trips too.
        f.syntax = syntax;
        if (syntax === "property") f.trailingComma = trailingComma;
        if (inputType === "group") f.columns = f_groupColumns;
        if (inputType === "rows") {
          f.columns = rowColumns;
          // A display choice on one control. Same values, same serialization.
          //
          // Three of them now: the stacked table (neither flag), `@tabs` (one row at a time behind a tab
          // strip), and `@blocks` (every row in full, one under the next, each titled). Colours needed the
          // third because a ramp is eleven swatches judged by the joins between neighbours, and two ramps
          // you want to compare are two strips on one page rather than two tabs you flip between.
          f.tabs = /@tabs\b/.test(tip);
          f.blocks = /@blocks\b/.test(tip);
        }
        // Exactly as the user wrote it. serialize() re-emits this verbatim unless the form
        // actually changed the value, so bare keys, single quotes and the comments explaining
        // each option all survive a form interaction untouched.
        f.raw = m[0].indexOf("\n") === -1 ? line : m[0];
        // Anything annotation-shaped that this parser has no meaning for is carried through
        // untouched. `@rows` survives here before the control that reads it exists, and so does
        // whatever a later plan adds.
        var known = /^@(options|radio|multi|textarea|label|showWhen|placeholder|fromFile|rows|group|tabs|blocks|collection|mode|curve|allowOriginal|overshoot|ends|range|ramp|helper)\b/;
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
        var swRe = /@showWhen:\s*(\w+)\s*=\s*([\w|*]+)/g;
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
   *
   * **An object is printed the way the source wrote it**, inline or expanded. Not by a heuristic: the
   * first attempt was "an object of primitives stays inline", which is right for Colours' `bright: { hue,
   * chroma }` and wrong for Grid's mode entries, which are also objects of primitives and are written a
   * key per line. Reshaping one block to stop reshaping another is not a fix.
   *
   * So `sourceText` is the row's own raw text, and a key written as `key: { … }` on one line stays that
   * way. Without it, editing a single hue reprinted a 43-line block as 69 — still valid, and no longer
   * something a person would have written, which is the failure this printer exists to prevent.
   *
   * Module-level (not a `serialize()`-local closure) so `serializePanelValues` can reuse it — a
   * `@PANEL_START`-backed save formats a value exactly the same way an old-format one does, since
   * the value itself (`{hue:0, chroma:0}`) looks identical regardless of which spec format
   * described the field it belongs to.
   */
  function fmt(v, indent, sourceText, key) {
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
        return inner + fmt(item, inner, sourceText);
      }).join(",\n") + "\n" + pad + "]";
    }
    if (typeof v === "object") {
      var keys = Object.keys(v);
      if (keys.length === 0) return "{}";
      if (key && wasInlineInSource(sourceText, key)) {
        return "{ " + keys.map(function (k) {
          return printKey(k) + ": " + fmt(v[k], "", sourceText, k);
        }).join(", ") + " }";
      }
      return "{\n" + keys.map(function (k) {
        return inner + printKey(k) + ": " + fmt(v[k], inner, sourceText, k);
      }).join(",\n") + "\n" + pad + "}";
    }
    return JSON.stringify(v);
  }

  /**
   * Did the source write `key: { … }` on one line?
   *
   * Deliberately literal: a brace-to-brace match with no newline in it. A key whose object the source
   * expanded stays expanded, and a key the source has no opinion about — a value the panel just invented —
   * expands too, which is the safer default in a file people read.
   */
  function wasInlineInSource(sourceText, key) {
    if (typeof sourceText !== "string" || !sourceText) return false;
    var escaped = String(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp('["\']?' + escaped + '["\']?\\s*:\\s*\\{[^\\n{}]*\\}').test(sourceText);
  }

  /** Bare where JavaScript allows it, quoted where it does not. */
  function printKey(key) {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
  }

  /**
   * Values only, for a `@PANEL_START`-backed schema — the values region has no annotations left
   * to reprint as field specs (those live in `@PANEL_START`), so this never builds one. Every
   * entry in `configText` is reprinted **verbatim** unless its value actually changed, and an
   * edited one keeps the same indentation and syntax (`key: value,` or `var key = value;`) the
   * file already had — `indexConfigProperties` (this file) reads that directly from `configText`
   * per key, the same way a per-row `.raw` would have, if this format had one.
   *
   * A schema field with no matching key in `configText` throws: that is exactly the drift
   * `panelKeyDrift` warns about at load, and a save has no correct place to put a value with
   * nowhere to land. A `configText` key with no matching schema field is left alone, verbatim —
   * not this function's problem to solve, and never silently dropped.
   *
   * On edit of a `var` line, trailing `// …` annotations are dropped: they belong in
   * `@PANEL_START` once the script has migrated, and reprinting them beside a new value would
   * keep a second, stale copy of the field recipe. Unchanged lines stay byte-identical, comments
   * and all.
   */
  function serializePanelValues(schema, values) {
    var configText = schema.configText;
    if (typeof configText !== "string") {
      throw new Error("serialize: a @PANEL_START-sourced schema has no configText to write into");
    }
    var index = indexConfigProperties(configText);
    var vm = values || {};
    var fieldsByName = {};
    flattenPanelRows(schema.rows).forEach(function (r) {
      if (r.type === "field") fieldsByName[r.name] = r;
    });

    Object.keys(fieldsByName).forEach(function (name) {
      if (!index.byKey[name]) {
        throw new Error('serialize: field "' + name + '" has no value in the values block to write back into');
      }
    });

    var out = index.parts.map(function (part) {
      if (part.key == null) return part.raw;
      var r = fieldsByName[part.key];
      if (!r) return part.raw;
      var v = vm[r.name];
      if (v === undefined || JSON.stringify(v) === JSON.stringify(r.value)) return part.raw;
      var indent = /^[ \t]*/.exec(part.raw)[0];
      if (part.syntax === "var") {
        return indent + "var " + r.name + " = " + fmt(v, indent, part.raw, r.name) + ";";
      }
      return indent + printKey(r.name) + ": " + fmt(v, indent, part.raw, r.name) +
        (part.trailingComma ? "," : "");
    });
    return out.join("\n").replace(/\s+$/, "");
  }

  function serialize(schema, values) {
    if (!schema || !schema.rows) return "";
    // A `@PANEL_START`-backed schema never reaches the reconstruction below: `panelFieldRow`
    // deliberately gives its rows no `.raw`, so the old per-row branch — built around a spec
    // grammar that cannot express `anchors` or a nested `tab` — would either misprint or throw
    // trying. Dispatching here is the primary guard; the field branch's own check further down
    // is the second one, in case a future refactor ever lets a `.raw`-less field reach it some
    // other way.
    if (schema.fromPanelSpec) return serializePanelValues(schema, values);

    var out = [];
    var vm = values || {};

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
        // Refuses rather than misprints. Every field this loop has ever produced carries its own
        // `.raw` — it is how the fast path below works at all — so a field with none did not come
        // from here. The only other source is `panelFieldRow`, which withholds `.raw` on purpose;
        // reconstructing one from `@rows:`/`@group:`/`@curve` syntax that has never heard of
        // `anchors` or a nested `tab` would be a corrupted script, not a slow correct one.
        if (typeof r.raw !== "string") {
          throw new Error('serialize: field "' + r.name + '" has no raw text — this looks like a ' +
            "@PANEL_START-sourced row reaching the old reconstruction path, which cannot express it");
        }
        var v = vm[r.name];
        // Untouched means untouched: only a value the form actually edited is rewritten.
        if (v === undefined || JSON.stringify(v) === JSON.stringify(r.value)) {
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
        if (r.inputType === "curve") {
          parts.push("@curve");
          if (r.allowOriginal) parts.push("@allowOriginal");
          if (r.overshoot) parts.push("@overshoot");
          if (r.ends) {
            parts.push("@ends: " + r.ends.from + (r.ends.mid ? ".." + r.ends.mid : "") + ".." + r.ends.to);
          }
          if (r.range) parts.push("@range: " + r.range.lo + ".." + r.range.hi);
          if (r.ramp) parts.push("@ramp: " + r.ramp);
        }
        if (r.inputType === "mode") {
          parts.push("@mode" + (r.collectionField ? ": " + r.collectionField : ""));
        }
        if (r.inputType === "group" && r.columns) {
          parts.push("@group: " + r.columns.map(function (c) {
            var named = c.label && (c.labelSpelled || c.label !== labelFromName(c.key)) ? "=" + c.label : "";
            return c.key + ":" + c.type + named;
          }).join("|"));
        }
        if (r.inputType === "rows" && r.columns) {
          parts.push("@rows: " + r.columns.map(function serialiseColumn(c) {
            // A heading among the columns has no key and no type; it re-emits as it was written. `level - 1`
            // because one `#` means "a step below the block's own title", which is level 2.
            if (c.type === "heading") {
              var hw = c.showWhen && c.showWhen.length
                ? "{" + c.showWhen.map(function (rule) {
                  return rule.field + "=" + rule.values.join("|");
                }).join(";") + "}"
                : "";
              return new Array(Math.max(1, (c.level || 2) - 1) + 1).join("#") + c.text + hw;
            }
            if (c.type === "preview") return "@preview";
            if (c.type === "tab") {
              var tw = c.showWhen && c.showWhen.length
                ? "{" + c.showWhen.map(function (rule) {
                  return rule.field + "=" + rule.values.join("|");
                }).join(";") + "}"
                : "";
              return "#>" + c.text + tw;
            }
            var spec = c.type;
            if (c.type === "curve") {
              var curveSpec = curveSpecText(c);
              if (curveSpec) spec = "curve(" + curveSpec + ")";
            }
            // A group re-emits its own columns through this same function, so a nested spec round-trips by
            // construction rather than by a second printer that could disagree with the parser.
            if (c.type === "group") {
              spec = "{" + (c.columns || []).map(serialiseColumn).join("|") + "}";
            } else if (c.type === "select" || c.type === "radio") {
              spec = (c.type === "radio" ? "radio" : "") + "(" +
                (c.options || []).map(function (o) {
                  var value = columnOptionValue(o);
                  var words = columnOptionLabel(o);
                  return words === value ? value : value + ":" + words;
                }).join("|") + ")";
            }
            var named = c.label && (c.labelSpelled || c.label !== labelFromName(c.key))
              ? "=" + c.label : "";
            // The condition trails the type, before the label, so `ratio:text{scaleType=modular}=Scaling
            // method` reads as "a text column, when modular, called Scaling method".
            var when = c.showWhen && c.showWhen.length
              ? "{" + c.showWhen.map(function (rule) {
                return rule.field + "=" + rule.values.join("|");
              }).join(";") + "}"
              : "";
            // Last within the segment, for the same reason the field-level one is last on the line: it
            // runs to the end, so anything emitted after it would be swallowed into the prose.
            var note = c.helper ? " @helper: " + c.helper : "";
            // Before the label, like the condition: the label is split at the first `=` and a placeholder is
            // free text that may well contain one.
            var hint = c.placeholder != null
              ? '@placeholder="' + String(c.placeholder).replace(/"/g, "") + '"' : "";
            var unit = c.unit != null ? '@unit="' + String(c.unit).replace(/"/g, "") + '"' : "";
            // Bracketed, before the label, for the same reason the condition is.
            var off = c.disabledWhen && c.disabledWhen.length
              ? "[" + c.disabledWhen.map(function (rule) {
                return rule.field + "=" + rule.values.join("|");
              }).join(";") + "]"
              : "";
            // Prose, so last — and a column carries this or `@helper:`, not both.
            var offNote = c.disabledNote ? " @disabledNote: " + c.disabledNote : "";
            return c.key + ":" + spec + when + off + unit + hint + named + note + offNote;
          }).join("|"));
          if (r.tabs) parts.push("@tabs");
          if (r.blocks) parts.push("@blocks");
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
          out.push(indent + r.name + ": " + fmt(v, indent, r.raw, r.name) +
            (r.trailingComma ? "," : "") + comment);
        } else {
          out.push(indent + "var " + r.name + " = " + fmt(v, indent, r.raw, r.name) + ";" + comment);
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
   * closer to right than `0` for every width and column count. Nested objects (Colors' anchors and
   * seed) are deep-cloned so the new mode starts filled and stays independent. `name` is then
   * overwritten, so the only thing inherited is the shape and the numbers.
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
      // Deep clone of the last mode — Colors nests bright/middle/dark and seed objects, and a shallow
      // copy left the new tab sharing those references (and looking empty once serialize rewrote them).
      // Same helper alignModesToFile uses when the file gains a mode the config does not have yet.
      var template = list.length ? list[list.length - 1] : null;
      list.push(freshModeEntry(op.name, template));
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
   * Look up a mode-keyed map entry with the same name rule the chips use.
   * Returns the actual key that matched, or null.
   */
  function findModeKeyedName(map, name) {
    if (!map || typeof map !== "object" || typeof name !== "string") return null;
    if (Object.prototype.hasOwnProperty.call(map, name)) return name;
    var keys = Object.keys(map);
    for (var i = 0; i < keys.length; i++) {
      if (sameModeName(keys[i], name)) return keys[i];
    }
    return null;
  }

  /**
   * Held file colours (and any other mode-keyed map) follow chip edits the way the mode block does.
   * Deep-cloning a mode on *Original* (`curve: []`) is not enough without hexes under the new name —
   * that is what left a fresh chip saying "Original has no colours…".
   *
   * Returns a new object, or the input unchanged when there is nothing to do.
   */
  function copyModeKeyedArrays(map, fromName, toName) {
    if (!map || typeof map !== "object" || typeof toName !== "string") return map;
    var fromKey = findModeKeyedName(map, fromName);
    if (!fromKey) return map;
    var values = map[fromKey];
    if (!Array.isArray(values) || !values.length) return map;
    var next = {};
    for (var key in map) {
      if (Object.prototype.hasOwnProperty.call(map, key)) next[key] = map[key];
    }
    next[toName] = values.slice();
    return next;
  }

  function renameModeKeyedEntry(map, fromName, toName) {
    if (!map || typeof map !== "object" || typeof toName !== "string") return map;
    var fromKey = findModeKeyedName(map, fromName);
    if (!fromKey || fromKey === toName) return map;
    var next = {};
    for (var key in map) {
      if (!Object.prototype.hasOwnProperty.call(map, key)) continue;
      if (key === fromKey) continue;
      next[key] = map[key];
    }
    next[toName] = map[fromKey];
    return next;
  }

  function dropModeKeyedEntry(map, name) {
    if (!map || typeof map !== "object") return map;
    var key = findModeKeyedName(map, name);
    if (!key) return map;
    var next = {};
    for (var k in map) {
      if (Object.prototype.hasOwnProperty.call(map, k) && k !== key) next[k] = map[k];
    }
    return Object.keys(next).length ? next : null;
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
   * **A mode the file has and the config does not gets a block.** This is the other half of "a 1:1 view
   * of the collection's modes", and it was the half that did not exist: the read of the collection was
   * used to reorder, re-spell and report, so a five-mode collection facing a three-mode config kept
   * showing three tabs — correctly spelled, in the file's order, with real `modeId`s hung on them, and
   * silently missing two of the file's modes. Selecting a collection is the instruction; a panel that
   * answers with a subset of it is describing the script's defaults and calling them the file.
   *
   * The new entry is cloned from its **nearest sibling in the file's order**, which is the same rule
   * `applyChipOp`'s `add` already uses — there it appends, so "the last entry" *is* the nearest one.
   * Cloning rather than starting empty because every column here is a number and a form has no way to
   * show "unset": a blank `base` is a scale that generates zeros. The clone is a starting point and
   * says so in the note, and it is what recognition will overwrite once it can read the values.
   *
   * **And a block for a mode the collection does not have is dropped.** The shipped Spacing block ships
   * `desktop, tablet, mobile`; point it at a collection whose modes are `Desktop / Pad / Mobile` and
   * `tablet` matches nothing. It is not a mode of this file, and leaving it produced a fourth tab beside
   * three real modes — worse, `setupModes` takes the config's mode list literally, so running *created*
   * a `Tablet` mode nobody asked for. Selecting a collection is the instruction, and the collection is
   * the authority on what modes exist.
   *
   * **Neither intent can be derived, so both are passed in.** `intent.removedIds` is the difference
   * between "this config never heard of that mode" and "I just took it out"; `intent.addedNames` is the
   * difference between a mode someone typed with `+` and residue from the template. Both entries look
   * identical in state — a name and a null id — which is exactly why the answer cannot be read off it.
   * A mode in `addedNames` survives with no id and is created by the run; anything else with no id is
   * residue and goes.
   *
   * Returns `{ entries, ids, changed, inserted, dropped }`; `changed` covers order, spelling, insertion
   * *and* dropping, so a caller can avoid writing the block for nothing. `inserted` and `dropped` name
   * what happened, because a write nobody asked for has to be able to say what it did — and a removed
   * entry is the half to be loudest about.
   */
  function alignModesToFile(entries, ids, fileModes, intent) {
    var list = Array.isArray(entries) ? entries.slice() : [];
    var idList = Array.isArray(ids) ? ids.slice() : [];
    while (idList.length < list.length) idList.push(null);
    var file = Array.isArray(fileModes) ? fileModes : [];
    var wishes = intent && typeof intent === "object" ? intent : {};
    var removed = {};
    (Array.isArray(wishes.removedIds) ? wishes.removedIds : []).forEach(function (id) {
      removed[id] = true;
    });
    var keep = {};
    (Array.isArray(wishes.addedNames) ? wishes.addedNames : []).forEach(function (name) {
      keep[String(name == null ? "" : name).trim().toLowerCase()] = true;
    });
    // No collection read yet, so nothing is residue: "the file does not have this mode" is not a
    // statement anyone can make before the file has been asked.
    if (!file.length) {
      return { entries: list, ids: idList, changed: false, inserted: [], dropped: [] };
    }

    var taken = {};
    var ordered = [];
    var orderedIds = [];
    var inserted = [];
    var dropped = [];
    // Two passes, because a fresh entry is cloned from a *sibling* and the siblings are only known
    // once the matching is done. A one-pass version would clone whatever happened to be previous at
    // the time, which for the first mode in the file is nothing at all.
    var slots = [];

    file.forEach(function (mode) {
      for (var i = 0; i < list.length; i++) {
        if (taken[i]) continue;
        // By id where the panel has one, by name otherwise — a renamed chip no longer matches the
        // file's name for its mode, and it must still land in that mode's position.
        var matches = idList[i] ? idList[i] === mode.modeId
          : sameModeName(list[i] && list[i].name, mode.name);
        if (!matches) continue;
        taken[i] = true;
        slots.push({ index: i, mode: mode });
        return;
      }
      // Not in the config. A mode someone removed stays removed; anything else is a mode of this
      // collection with no settings here, which is what this fills in.
      if (!removed[mode.modeId]) slots.push({ index: null, mode: mode });
    });

    slots.forEach(function (slot, position) {
      if (slot.index !== null) {
        ordered.push(list[slot.index]);
        orderedIds.push(idList[slot.index]);
        return;
      }
      ordered.push(freshModeEntry(slot.mode.name, modeTemplateFor(slots, position, list)));
      orderedIds.push(slot.mode.modeId || null);
      inserted.push(slot.mode.name);
    });

    // What the file did not claim. An entry still carrying an id is a mode of *this* collection that
    // moved or was renamed out from under the panel — it stays, because dropping it would throw away a
    // link to a real mode. An entry with no id is residue unless someone typed it.
    for (var j = 0; j < list.length; j++) {
      if (taken[j]) continue;
      var name = list[j] && list[j].name;
      if (!idList[j] && !keep[String(name == null ? "" : name).trim().toLowerCase()]) {
        dropped.push(name || "entry " + (j + 1));
        continue;
      }
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

    // Length first: an insertion is a change even when every entry that was already there stayed
    // exactly where it was, which is the common case — three matched modes and two added below them.
    // Comparing entry by entry alone would also miss an insert-and-drop that happens to net to zero.
    var changed = renamed.length !== list.length || inserted.length > 0 || dropped.length > 0;
    for (var k = 0; !changed && k < list.length; k++) {
      if (list[k] !== renamed[k]) changed = true;
    }
    return {
      entries: renamed, ids: orderedIds, changed: changed,
      inserted: inserted, dropped: dropped
    };
  }

  /**
   * A block for a mode the config has none for, in the shape of the ones around it.
   *
   * `name` is written first, on its own, so the key order matches every entry a config block ships —
   * the template's own `name` is skipped rather than copied and overwritten, because an assignment
   * afterwards moves the key to the end on some engines and a mode block whose `name` is last reads as
   * a different kind of object.
   */
  function freshModeEntry(name, template) {
    var fresh = { name: name };
    if (!template || typeof template !== "object") return fresh;
    for (var key in template) {
      if (!Object.prototype.hasOwnProperty.call(template, key) || key === "name") continue;
      fresh[key] = cloneModeValue(template[key]);
    }
    return fresh;
  }

  /** Deep enough for a mode block: numbers, strings, and the lists and objects a column can hold. */
  function cloneModeValue(value) {
    if (Array.isArray(value)) return value.map(cloneModeValue);
    if (value && typeof value === "object") {
      var out = {};
      for (var key in value) {
        if (Object.prototype.hasOwnProperty.call(value, key)) out[key] = cloneModeValue(value[key]);
      }
      return out;
    }
    return value;
  }

  /**
   * The entry a new mode is written like: its nearest neighbour in the file's own order.
   *
   * Backwards first, then forwards. `Tablet-small` sits between `Tablet` and `Mobile` in Márton's file,
   * and it should look like `Tablet` — taking the last entry in the array instead, the way an appended
   * chip does, would hand it `Mobile`'s settings for no reason other than where the loop ended.
   */
  function modeTemplateFor(slots, position, list) {
    for (var back = position - 1; back >= 0; back--) {
      if (slots[back].index !== null) return list[slots[back].index];
    }
    for (var fwd = position + 1; fwd < slots.length; fwd++) {
      if (slots[fwd].index !== null) return list[slots[fwd].index];
    }
    // No mode of this file is in the config at all, so there is no sibling to follow. Anything the
    // config does hold — a mode from a pasted block — is still a mode block, and its shape is closer
    // to right than an object with only a name in it.
    return list.length ? list[0] : null;
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
    if (Array.isArray(schema)) return flattenPanelRows(schema);
    return flattenPanelRows((schema && Array.isArray(schema.rows)) ? schema.rows : []);
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
      // **Trailing whitespace trimmed before the newline test.** The last property of an entry runs to the
      // entry's own closing brace, so its text carries the line break that *closes the object* — read as
      // "this value was written across lines", and the last key of every inserted entry came out expanded
      // while its siblings stayed inline. Visible in Colors as a `dark:` anchor three lines tall next to a
      // one-line `bright:`, from a sibling where all three are written the same way.
      if (at !== -1) {
        inline[k] = parts[i].slice(at)
          .replace(/\/\/[^\n]*/g, "").replace(/\s+$/, "").indexOf("\n") === -1;
      }
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

    // **A key the payload has and the object does not is added.** The top-level rule is the opposite — the
    // block declares what the script reads, so a stray field would be inert — but that reasoning does not
    // reach *inside* a value the block already declares. `lightness: {}` is the block saying "three anchors,
    // shape not known yet", and filling nothing into it meant reading a collection loaded the steps and left
    // every anchor empty. It then appeared to work on the second try, because by then the form had written
    // the keys in, which is exactly how this looked like "the palette only loads after you edit it".
    var added = [];
    for (var key2 in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key2)) continue;
      var already = false;
      for (var m = 0; m < items.length; m++) {
        if (itemKey(items[m].text) === key2) { already = true; break; }
      }
      if (already) continue;
      added.push(printKeyForFill(key2) + ": " + formatConfigValue(value[key2], ""));
      report.substituted.push(path ? path + "." + key2 : key2);
    }

    var joined = "";
    for (var j = 0; j < out.length; j++) joined += (j === 0 ? "" : (out[j - 1].joined ? "" : ",")) + out[j].text;
    if (split.trailingComma) joined += ",";
    if (added.length) {
      // Written the way the object is written: inside `{}` there is nothing to copy, so one line.
      // The existing text carries the space that sat before the closing brace; appending after it leaves
      // `98.5 , dark` — a comma with a space in front of it, in a file people read.
      var kept = joined.replace(/\s+$/, "");
      var hadItems = kept !== "";
      joined = (hadItems ? kept + (split.trailingComma ? " " : ", ") : " ") + added.join(", ") + " ";
    }
    return itemText.slice(0, open + 1) + joined + split.tail + itemText.slice(close);
  }

  /** Bare where JavaScript allows it, quoted where it does not. The fill's own copy — `serialize` has one
   *  in its closure and this runs outside it. */
  function printKeyForFill(key) {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
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

  /**
   * Values from a values-region body that is not a property-list object — primarily
   * `var name = value;` lines from `@UI_CONFIG_START`, also property entries when the JSON wrap
   * path failed. Skips comments, headings and blank lines. → plain object, or null when nothing
   * matched (so callers that treat null as "unreadable" keep that signal).
   */
  function parseConfigBlockAssignments(text) {
    var lines = String(text == null ? "" : text).split(/\r?\n/);
    var values = {};
    var found = false;
    var i = 0;
    while (i < lines.length) {
      var oneLine = readOneLineVar(lines[i]);
      if (oneLine) {
        values[oneLine[1]] = parseValue(oneLine[2].trim());
        found = true;
        i++;
        continue;
      }
      if (/^\s*var\s+\w+\s*=/.test(lines[i])) {
        var span = readMultiLineValue(lines, i);
        if (span) {
          values[span.match[1]] = parseValue(span.match[2].trim());
          found = true;
          i = span.endLine + 1;
          continue;
        }
      }
      var entry = readPropertyEntry(lines, i);
      if (entry) {
        values[entry.match[1]] = parseValue(entry.match[2].trim());
        found = true;
        i = entry.endLine + 1;
        continue;
      }
      i++;
    }
    return found ? values : null;
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
      // Property-list path failed: a `@UI_CONFIG` body is live `var` statements, not an object
      // literal. Walk those (and any property entries the wrap could not swallow) instead of
      // returning null — otherwise a `@PANEL_START` + `@UI_CONFIG` script opens every field blank.
      return parseConfigBlockAssignments(text);
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
    // Renderer "Copy these values to: Mode…" reuses the same seed shape as a new chip / file-aligned mode.
    freshModeEntry: freshModeEntry,
    modeIntents: modeIntents,
    matchModeIds: matchModeIds,
    listToText: listToText,
    textToList: textToList,
    // The renderer draws options and reads them back; both need the same answer to "what is this
    // option's value" for a pair and for the bare string older columns hold.
    columnOptionValue: columnOptionValue,
    columnOptionLabel: columnOptionLabel,
    alignModesToFile: alignModesToFile,
    // Exported because the panel asks the same question when it words the removal note, and "the same
    // mode name" must have exactly one definition. It did not, and the note said "Removing" for a
    // replacement — understating what was about to happen, in the one place that exists to state it.
    sameModeName: sameModeName,
    copyModeKeyedArrays: copyModeKeyedArrays,
    renameModeKeyedEntry: renameModeKeyedEntry,
    dropModeKeyedEntry: dropModeKeyedEntry,
    parseConfigBlockObject: parseConfigBlockObject,
    hasFileFields: hasFileFields,
    // `@PANEL_START` reader (.plans/31-panel-spec-json.md). `parse(code, panelSpecText)` dispatches
    // to `parsePanelSpec` on its own; these are exported so the differential test can call the new
    // reader directly without needing a script on disk that uses it yet.
    parsePanelSpec: parsePanelSpec,
    flattenPanelRows: flattenPanelRows,
    stripLinePrefixes: stripLinePrefixes,
    normalizePanelSpecText: normalizePanelSpecText
  };
});
