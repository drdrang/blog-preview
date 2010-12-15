function styleLN() {
  var isIE = navigator.appName.indexOf('Microsoft') != -1;
  if (isIE) return;
  $('pre code').each( function(i, v) {
    var oldContent = v.innerHTML;
    var newContent = oldContent.replace(/^( *)(\d+):(  )/mg, 
               '<span class="ln">$1$2$3<' + '/span>');
     if (oldContent.match(/^( *)(\d+):(  )/mg)) {
       newContent += "\n" + '<button onclick="showPlain(this.parentNode)">Without line numbers</button>';
     }
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