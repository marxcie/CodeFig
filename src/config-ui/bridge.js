(function (root) {
  var P = root.ConfigUIParser;
  var R = root.ConfigUIRenderer;
  var C = root.ConfigUIFormController;
  if (!P || !R || !C) return;
  root.CodeFigConfigUI = {
    parse: function (c) {
      return P.parse(c);
    },
    serialize: function (s, v) {
      return P.serialize(s, v);
    },
    render: function (schema, opts) {
      var c = opts && opts.container;
      if (!c) throw new Error("CodeFigConfigUI.render: options.container is required");
      return C.createForm(c, schema, opts);
    },
    applyFileConfig: function (schema, values, payload) {
      return P.applyFileConfig(schema, values, payload);
    },
    hasFileFields: function (schema) {
      return P.hasFileFields(schema);
    },
    configImportState: function (configBlock, probe) {
      return P.configImportState(configBlock, probe);
    },
    fillConfigBlock: function (blockText, payload) {
      return P.fillConfigBlock(blockText, payload);
    },
    parseConfigBlockObject: function (text) {
      return P.parseConfigBlockObject(text);
    },
  };
})(typeof self !== "undefined" ? self : this);
