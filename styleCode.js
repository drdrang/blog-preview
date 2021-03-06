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
    
    // Get the language, if it's given, and remove it.
    var lang = oldContent.match(/^(applescript|bash|cpp|cs|css|diff|http|ini|java|javascript|json|lisp|xml|markdown|matlab|objectivec|perl|php|python|r|ruby|sql|tex):\n/);
    if (lang) {
      lang = lang[1];
      oldContent = oldContent.split("\n").slice(1).join("\n");
    }
    
    // Get the starting line number, if it's given, and remove the line numbers.
    var line = oldContent.match(/^( *)(\d+):(  )/);
    if (line) {
      line = parseInt(line[2]);
      oldContent = oldContent.replace(/^( *)(\d+):(  )/mg, "");
    }
    
    // Remove trailing empty lines, if any.
    oldContent = oldContent.replace(/\n+$/, "");
    
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
  // Make a copy and remove the button and line numbers.
  var oldCode = code.cloneNode(true);
  $(':button', oldCode).remove();
  $(oldCode).find('span.ln').remove();
  
  // Show the remainder in a new window.
  var w = window.open("", "", "width=800,height=500,resizable=yes,scrollbars=yes");
  var d = w.document;
  d.open();
  d.write("<html><head><title>Code</title></head><body><pre><code>", oldCode.innerHTML, "</code></pre></body></html>");
  d.close();
}