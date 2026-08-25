window.__ModuleLoader__.load({
  id: "dsh-desktop-settings",
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var react = require("react");

    function DesktopSettingsRow(props) {
      var state = react.useState({});
      var s = state[0]; var setS = state[1];
      react.useEffect(function () {
        try { if (window.desktopSetup) setS(window.desktopSetup.get()); } catch (e) {}
      }, []);
      var labelStyle = { fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" };
      var swStyle = { width: 16, height: 16, accentColor: "var(--dsw-alias-state-business-primary)", cursor: "pointer" };
      return react.createElement("div", { style: { width: "100%", padding: "12px 0", borderBottom: "1px solid var(--dsw-alias-border-l2)" } },
        react.createElement("div", { style: { fontWeight: 600, fontSize: 14, marginBottom: 8 } }, "桌面环境"),
        react.createElement("div", { style: { display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap", fontSize: 13 } },
          react.createElement("label", { style: labelStyle },
            "开机自启",
            react.createElement("input", { type: "checkbox", checked: !!s.autoLaunch, style: swStyle, onChange: function (ev) {
              var v = ev.target.checked; try { if (window.desktopSetup) window.desktopSetup.setAutoLaunch(v); } catch (e) {}
              setS(Object.assign({}, s, { autoLaunch: v }));
            } })
          ),
          react.createElement("label", { style: labelStyle },
            "记住窗口大小",
            react.createElement("input", { type: "checkbox", checked: !!s.rememberSize, style: swStyle, onChange: function (ev) {
              var v = ev.target.checked; try { if (window.desktopSetup) window.desktopSetup.setRememberSize(v); } catch (e) {}
              setS(Object.assign({}, s, { rememberSize: v }));
            } })
          ),
          react.createElement("span", { style: { fontSize: 12, color: "var(--dsw-alias-label-tertiary)" } }, "窗口位置：主屏居中")
        )
      );
    }

    function apply(ctx) {
      if (!ctx || !ctx.slots) return;
      try {
        ctx.slots.inject("settings.general.item", function () {
          return ctx.slots.register({ name: "settings.general.item", id: "desktop-environment", order: 20 }, DesktopSettingsRow);
        });
      } catch (e) {}
    }
    exports.name = "dsh-desktop-settings";
    exports.inject = ["slots"];
    exports.apply = apply;
    return module.exports;
  }
});
