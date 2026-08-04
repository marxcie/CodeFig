/**
 * Escape script content for safe embedding inside <script> in HTML.
 * </script> -> <\/script> so the HTML parser doesn't close the tag.
 */
function escapeScriptContent(js) {
  return js.replace(/<\/script>/gi, '<\\/script>');
}

module.exports = { escapeScriptContent };
