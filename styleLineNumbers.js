function padLeft(string, width) {
  var padded = string;
  var needed = width - string.length;
  for (var i=0; i<needed; i++) {
    padded = " " + padded;
  }
  return padded;
}
    
function addLineNumbers(lineArray, start) {
  var currentLine = start;
  var maxLine = start + lineArray.length - 1;
  var lnWidth = maxLine.toString().length;
  var numberedLineArray = [];
  for (var i=0; i<lineArray.length; i++) {
    numberedLineArray.push('<span class="ln">' + padLeft(currentLine.toString(), lnWidth) + '  </span>' + lineArray[i]);
    currentLine++;
  }
  return numberedLineArray;
}

function styleCode() {
  // IE wouldn't work with early versions of this function, so I stopped trying
  // to get it to work. Now that the function's been rewritten, I may need to
  // revisit this decision.
  var isIE = navigator.appName.indexOf('Microsoft') != -1;
  if (isIE) return;
  
  // Go through each of the <pre><code> blocks.
  $('pre code').each( function(i, elem) {
    var oldContent = elem.innerHTML;
    var newContent = [];
    
    // Get the language, if it's given.
    var lang = oldContent.match(/^(bash|cmake|cpp|css|diff|xml|html|ini|java |javascript|lisp|lua|perl|php|python|ruby|scala|sql|tex):\n/);
    if (lang) {
      lang = lang[1];
      oldContent = oldContent.split("\n").slice(1).join("\n");
    }
    
    // Get the starting line number, if it's given.
    var line = oldContent.match(/^( *)(\d+):(  )/);
    if (line) {
      line = parseInt(line[2]);
      oldContent = oldContent.replace(/^( *)(\d+):(  )/mg, "");
    }
    
    // Put the unnumbered code back into the element.
    elem.innerHTML = oldContent;
    
    // Highlight the code if the language is given.
    if (lang) {
      $(this).addClass("language-" + lang);
      hljs.highlightBlock(elem);
    }
    
    // Put the line numbers back in if they were removed.
    if (line) {
      var newContent = elem.innerHTML.split("\n");
      newContent = addLineNumbers(newContent, line);
      newContent.push("");
      newContent.push('<button onclick="showPlain(this.parentNode)">Without line numbers</button>');
      elem.innerHTML = newContent.join("\n");
    }
    
  })
}

function showPlain(code) {
  var oldCode = code.cloneNode(true);
  for (var i=0; i<oldCode.childNodes.length; i++){
    node = oldCode.childNodes[i];
    if (node.nodeName == 'SPAN' || node.nodeName == 'BUTTON'){
      oldCode.removeChild(node);
    }
  }
  var w = window.open("", "", "width=800,height=500,resizable=yes,scrollbars=yes");
  var d = w.document;
  d.open();
  d.write("<html><head><title>Code</title></head><body><pre><code>", oldCode.innerHTML, "</code></pre></body></html>");
  d.close();
}