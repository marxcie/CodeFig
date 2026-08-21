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

    // The listeners `attachListeners` puts on the container, so a re-render can take the previous set off.
    // Without this they accumulate and every keystroke does the work of every render that came before it.
    var attached = null;

    function render(s) {
      // The host's fitted curves, published before anything is built — `buildCurveControl` reads them while
      // it constructs each preset dropdown, so they have to be in place first.
      if (R.setCurveBaselines) R.setCurveBaselines((opts && opts.curveBaselines) || {});
      schema = s;
      if (attached && attached.detach) attached.detach();
      R.buildForm(schema, container);
      attached = R.attachListeners(
        container,
        schema,
        onCh
          ? function (v, o) {
              // **Both arguments.** The second says whether this change is `live` — drawn mid-drag but not
              // yet written through to the config editor. Dropping it here made the host treat every frame
              // of a drag as a committed edit, which is the whole cost the flag exists to avoid.
              onCh(v, o);
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
        if (attached && attached.detach) attached.detach();
        attached = null;
        if (container) container.innerHTML = "";
        schema = null;
        getV = null;
        applyV = null;
      },
    };
  }

  return { createForm: createForm };
});
