// Dump one CodeFig Scripts variable by name. Set TARGET below or pass via // @TARGET: Name
var TARGET = "Scale to print";
(async function () {
  try {
    var cols = await figma.variables.getLocalVariableCollectionsAsync();
    var col = null;
    for (var i = 0; i < cols.length; i++) {
      if (cols[i].name === 'CodeFig Scripts') { col = cols[i]; break; }
    }
    if (!col) { console.log('DUMP1_ERR no collection'); window.codefigRunComplete(); return; }
    var modeId = col.modes[0].modeId;
    var found = null;
    for (var j = 0; j < col.variableIds.length; j++) {
      var v = await figma.variables.getVariableByIdAsync(col.variableIds[j]);
      if (v && v.name === TARGET) { found = v; break; }
    }
    if (!found) {
      console.log('DUMP1_ERR missing ' + TARGET);
      window.codefigRunComplete();
      return;
    }
    var raw = found.valuesByMode[modeId];
    var text = typeof raw === 'string' ? raw : '';
    var code = text;
    if (text.trim().charAt(0) === '{') {
      try {
        var env = JSON.parse(text);
        if (env && typeof env.code === 'string') code = env.code;
      } catch (e) {}
    }
    console.log('DUMP1_BEGIN ' + JSON.stringify({ name: found.name, desc: found.description || '', len: code.length }));
    var CHUNK = 6000;
    for (var off = 0; off < code.length; off += CHUNK) {
      console.log('DUMP1_CHUNK ' + JSON.stringify(code.slice(off, off + CHUNK)));
    }
    console.log('DUMP1_END');
  } catch (e) {
    console.log('DUMP1_ERR ' + (e && e.message ? e.message : String(e)));
  }
  window.codefigRunComplete();
})();
