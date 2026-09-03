// Dump CodeFig Scripts STRING vars to console (dev only).
(async function () {
  try {
    var cols = await figma.variables.getLocalVariableCollectionsAsync();
    var col = null;
    for (var i = 0; i < cols.length; i++) {
      if (cols[i].name === 'CodeFig Scripts') { col = cols[i]; break; }
    }
    if (!col) {
      console.log('DUMP_ERR no collection');
      window.codefigRunComplete();
      return;
    }
    var modeId = col.modes[0].modeId;
    var summary = [];
    console.log('DUMP_META vars=' + col.variableIds.length);
    for (var j = 0; j < col.variableIds.length; j++) {
      var v = await figma.variables.getVariableByIdAsync(col.variableIds[j]);
      if (!v) continue;
      var raw = v.valuesByMode[modeId];
      var text = typeof raw === 'string' ? raw : '';
      // Envelope unwrap
      var code = text;
      var env = null;
      if (text.trim().charAt(0) === '{') {
        try {
          env = JSON.parse(text);
          if (env && typeof env.code === 'string') code = env.code;
        } catch (e) { /* keep raw */ }
      }
      var item = {
        name: v.name,
        desc: String(v.description || ''),
        rawLen: text.length,
        codeLen: code.length,
        envelope: !!(env && env.v),
        hasPanel: code.indexOf('@PANEL_START') !== -1,
        hasObj: code.indexOf('__codefigPanel') !== -1,
        hasUI: code.indexOf('@UI_CONFIG') !== -1,
        hasAnn: /@options:|@label:|@radio|@showWhen:|@placeholder:/.test(code),
        head: code.slice(0, 100).replace(/\n/g, '\\n')
      };
      summary.push(item);
      // Emit body in chunks so the bridge can capture it
      console.log('DUMP_SCRIPT_BEGIN ' + JSON.stringify({ name: v.name, desc: item.desc, envelope: item.envelope, id: env && env.id }));
      var CHUNK = 8000;
      for (var off = 0; off < code.length; off += CHUNK) {
        console.log('DUMP_CHUNK ' + JSON.stringify(code.slice(off, off + CHUNK)));
      }
      console.log('DUMP_SCRIPT_END ' + v.name);
    }
    console.log('DUMP_SUMMARY ' + JSON.stringify(summary));
  } catch (e) {
    console.log('DUMP_ERR ' + (e && e.message ? e.message : String(e)));
  }
  window.codefigRunComplete();
})();
