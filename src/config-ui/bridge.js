/**
 * `window.CodeFigConfigUI` — the UI's handle on the config-ui modules.
 *
 * This file used to list the parser's functions by hand, one three-line forwarder each. That list
 * was a seam by construction: it existed to be forgotten, and forgetting it produced a call that
 * was `undefined` at run time and a guard that blamed the wrong thing — import reported "could not
 * read the config this file holds" about a block that parsed perfectly, because `fillConfigBlock`
 * had never been added here.
 *
 * So the facade is **derived**. What the UI may reach is exactly what `parser.js` chooses to
 * export, which puts the decision in the module that owns the functions and leaves one list
 * instead of two. Adding a function to the parser's exports is the whole of publishing it.
 */
(function (root) {
  var P = root.ConfigUIParser;
  var R = root.ConfigUIRenderer;
  var C = root.ConfigUIFormController;
  if (!P || !R || !C) return;

  var api = {};
  for (var name in P) {
    if (Object.prototype.hasOwnProperty.call(P, name) && typeof P[name] === "function") {
      api[name] = P[name];
    }
  }

  // The one member that is not a parser function. Wiring the renderer to the controller — and
  // refusing to build a form with nowhere to put it — is the only thing this file does itself.
  api.render = function (schema, opts) {
    var container = opts && opts.container;
    if (!container) throw new Error("CodeFigConfigUI.render: options.container is required");
    return C.createForm(container, schema, opts);
  };

  root.CodeFigConfigUI = api;
})(typeof self !== "undefined" ? self : this);
