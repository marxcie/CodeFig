(function (root, factory) {
  var P = root.ConfigUIParser;
  var R = root.ConfigUIRenderer;
  if (P && R) root.ConfigUIFormController = factory(P, R);
})(typeof self !== "undefined" ? self : this, function (P, R) {
  "use strict";

  function createForm(container, initialSchema, opts) {
    var schema = initialSchema || null;
    var getV = null;
    var applyV = null;
    var onCh = (opts && opts.onChange) || null;

    function render(s) {
      schema = s;
      R.buildForm(schema, container);
      var attached = R.attachListeners(
        container,
        schema,
        onCh
          ? function (v) {
              onCh(v);
            }
          : null
      );
      getV = attached.getValues;
      applyV = attached.applyVisibility;
    }

    if (schema && schema.rows && schema.rows.length) render(schema);

    return {
      getValues: function () {
        return getV ? getV() : {};
      },
      setValues: function (vals) {
        if (!vals || !container) return;
        Object.keys(vals).forEach(function (n) {
          var els = container.querySelectorAll('[data-field="' + n + '"]');
          if (!els.length) return;
          var first = els[0];
          if (first.classList && first.classList.contains("config-ui-multiselect")) {
            var arr = Array.isArray(vals[n])
              ? vals[n]
              : vals[n] != null && String(vals[n]).trim() !== ""
                ? [String(vals[n])]
                : [];
            first.querySelectorAll(".config-ui-multiselect-cb").forEach(function (cb) {
              cb.checked = arr.indexOf(cb.value) !== -1;
            });
            return;
          }
          if (els[0].type === "radio") {
            els.forEach(function (r) {
              r.checked = r.value === String(vals[n] || "");
            });
          } else {
            var el = els[0];
            if (el.type === "checkbox" && el.classList.contains("config-ui-toggle"))
              el.checked = !!vals[n];
            else el.value = vals[n] == null ? "" : String(vals[n]);
          }
        });
        if (applyV) applyV();
      },
      updateFromCode: function (code) {
        try {
          var s = P.parse(code);
          if (s && s.rows && s.rows.length) {
            var cur = (getV && getV()) || {};
            render(s);
            this.setValues(cur);
          }
        } catch (e) {
          console.warn("ConfigUI: updateFromCode parse failed", e);
        }
      },
      destroy: function () {
        if (container) container.innerHTML = "";
        schema = null;
        getV = null;
        applyV = null;
      },
    };
  }

  return { createForm: createForm };
});
