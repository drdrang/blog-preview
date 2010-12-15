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

function styleLN() {
  var isIE = navigator.appName.indexOf('Microsoft') != -1;
  if (isIE) return;
  $('pre code').each( function(i, v) {
    var oldContent = v.innerHTML;
    var newContent = [];
    
    // Get the language, if it's given.
    var lang = oldContent.match(/^(perl|python|javascript|html|css|ruby|php|bash):\n/);
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
    
    // Turn the content into an array of lines.
    newContent = oldContent.split("\n");
    if (newContent[newContent.length - 1] == "") {
      newContent.pop();
    }
    
    if (lang) {
      // Put the syntax highlighting stuff here. Will have to join,
      // highlight, then split again.
      if (line) {
        newContent = addLineNumbers(newContent, line);
        newContent.push("");
        newContent.push('<button onclick="showPlain(this.parentNode)">Without line numbers</button>');
      }
    }
    else {
      if (line) {
        newContent = addLineNumbers(newContent, line);
        newContent.push("");
        newContent.push('<button onclick="showPlain(this.parentNode)">Without line numbers</button>');
      }
    }
    
    
    newContent = newContent.join("\n");
    v.innerHTML = newContent;
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