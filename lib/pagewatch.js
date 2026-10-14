// Pages whose content is drawn in the browser by JavaScript (booking systems
// such as BRS, and any URL with a #/ route). The weekly watcher can't read
// them, so admin lists them for checking by hand instead.
function isScriptedPage(url) {
  return /#\//.test(url || '') || /visitors\.brsgolf\.com|members\.brsgolf\.com/i.test(url || '');
}

module.exports = { isScriptedPage };
