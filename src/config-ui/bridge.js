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
  };
})(typeof self !== "undefined" ? self : this);
