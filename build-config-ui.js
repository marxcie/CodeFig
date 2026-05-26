const fs = require("fs");
const path = require("path");

function escapeScriptContent(js) {
  return js.replace(/<\/script>/gi, "<\\/script>");
}

const files = ["parser.js", "renderer.js", "controller.js", "bridge.js"];
const dir = path.join(__dirname, "src", "config-ui");
const bundle = files
  .map((f) => fs.readFileSync(path.join(dir, f), "utf8").trim())
  .join("\n");

const uiPath = path.join(__dirname, "src", "ui.html");
let html = fs.readFileSync(uiPath, "utf8");
const replacement =
  '<script id="config-ui-js">\n' + escapeScriptContent(bundle) + "\n</script>";
const re = /<script id="config-ui-js">[\s\S]*?<\/script>/;
if (!re.test(html)) {
  console.error("config-ui-js block not found in src/ui.html");
  process.exit(1);
}
html = html.replace(re, replacement);
fs.writeFileSync(uiPath, html, "utf8");
console.log("✅ Inlined config-ui bundle into src/ui.html");
