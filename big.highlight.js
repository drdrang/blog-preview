/*
Syntax highlighting with language autodetection.
http://softwaremaniacs.org/soft/highlight/
*/

var hljs = new function() {
  var LANGUAGES = {}
  // selected_languages is used to support legacy mode of selecting languages
  // available for highlighting by passing them as arguments into
  // initHighlighting function. Currently the whole library is expected to
  // contain only those language definitions that are actually get used.
  var selected_languages = {};

  /* Utility functions */

  function escape(value) {
    return value.replace(/&/gm, '&amp;').replace(/</gm, '&lt;').replace(/>/gm, '&gt;');
  }

  function contains(array, item) {
    if (!array)
      return false;
    for (var i = 0; i < array.length; i++)
      if (array[i] == item)
        return true;
    return false;
  }

  function langRe(language, value, global) {
    var mode =  'm' + (language.case_insensitive ? 'i' : '') + (global ? 'g' : '');
    return new RegExp(value, mode);
  }

  function findCode(pre) {
    for (var i = 0; i < pre.childNodes.length; i++) {
      node = pre.childNodes[i];
      if (node.nodeName == 'CODE')
        return node;
      if (!(node.nodeType == 3 && node.nodeValue.match(/\s+/)))
        return null;
    }
  }

  function blockText(block, ignoreNewLines) {
    var result = '';
    for (var i = 0; i < block.childNodes.length; i++)
      if (block.childNodes[i].nodeType == 3) {
        var chunk = block.childNodes[i].nodeValue;
        if (ignoreNewLines)
          chunk = chunk.replace(/\n/g, '');
        result += chunk;
      } else if (block.childNodes[i].nodeName == 'BR')
        result += '\n';
      else
        result += blockText(block.childNodes[i]);
    // Thank you, MSIE...
    result = result.replace(/\r/g, '\n');
    return result;
  }

  function blockLanguage(block) {
    var classes = block.className.split(/\s+/)
    classes = classes.concat(block.parentNode.className.split(/\s+/));
    for (var i = 0; i < classes.length; i++) {
      var class_ = classes[i].replace(/^language-/, '');
      if (LANGUAGES[class_] || class_ == 'no-highlight') {
        return class_;
      }
    }
  }

  /* Stream merging */

  function nodeStream(node) {
    var result = [];
    (function (node, offset) {
      for (var i = 0; i < node.childNodes.length; i++) {
        if (node.childNodes[i].nodeType == 3)
          offset += node.childNodes[i].nodeValue.length;
        else if (node.childNodes[i].nodeName == 'BR')
          offset += 1
        else {
          result.push({
            event: 'start',
            offset: offset,
            node: node.childNodes[i]
          });
          offset = arguments.callee(node.childNodes[i], offset)
          result.push({
            event: 'stop',
            offset: offset,
            node: node.childNodes[i]
          });
        }
      }
      return offset;
    })(node, 0);
    return result;
  }

  function mergeStreams(stream1, stream2, value) {
    var processed = 0;
    var result = '';
    var nodeStack = [];

    function selectStream() {
      if (stream1.length && stream2.length) {
        if (stream1[0].offset != stream2[0].offset)
          return (stream1[0].offset < stream2[0].offset) ? stream1 : stream2;
        else
          return (stream1[0].event == 'start' && stream2[0].event == 'stop') ? stream2 : stream1;
      } else {
        return stream1.length ? stream1 : stream2;
      }
    }

    function open(node) {
      var result = '<' + node.nodeName.toLowerCase();
      for (var i = 0; i < node.attributes.length; i++) {
        var attribute = node.attributes[i];
        result += ' ' + attribute.nodeName.toLowerCase();
        if (attribute.nodeValue != undefined) {
          result += '="' + escape(attribute.nodeValue) + '"';
        }
      }
      return result + '>';
    }

    function close(node) {
      return '</' + node.nodeName.toLowerCase() + '>';
    }

    while (stream1.length || stream2.length) {
      var current = selectStream().splice(0, 1)[0];
      result += escape(value.substr(processed, current.offset - processed));
      processed = current.offset;
      if ( current.event == 'start') {
        result += open(current.node);
        nodeStack.push(current.node);
      } else if (current.event == 'stop') {
        var i = nodeStack.length;
        do {
          i--;
          var node = nodeStack[i];
          result += close(node);
        } while (node != current.node);
        nodeStack.splice(i, 1);
        while (i < nodeStack.length) {
          result += open(nodeStack[i]);
          i++;
        }
      }
    }
    result += value.substr(processed);
    return result;
  }

  /* Core highlighting function */

  function highlight(language_name, value) {

    function subMode(lexem, mode) {
      for (var i = 0; i < mode.sub_modes.length; i++) {
        if (mode.sub_modes[i].beginRe.test(lexem)) {
          return mode.sub_modes[i];
        }
      }
      return null;
    }

    function endOfMode(mode_index, lexem) {
      if (modes[mode_index].end && modes[mode_index].endRe.test(lexem))
        return 1;
      if (modes[mode_index].endsWithParent) {
        var level = endOfMode(mode_index - 1, lexem);
        return level ? level + 1 : 0;
      }
      return 0;
    }

    function isIllegal(lexem, mode) {
      return mode.illegalRe && mode.illegalRe.test(lexem);
    }

    function compileTerminators(mode, language) {
      var terminators = [];

      for (var i = 0; i < mode.sub_modes.length; i++) {
        terminators.push(mode.sub_modes[i].begin);
      }

      var index = modes.length - 1;
      do {
        if (modes[index].end) {
          terminators.push(modes[index].end);
        }
        index--;
      } while (modes[index + 1].endsWithParent);

      if (mode.illegal) {
        terminators.push(mode.illegal);
      }

      return langRe(language, '(' + terminators.join('|') + ')', true);
    }

    function eatModeChunk(value, index) {
      var mode = modes[modes.length - 1];
      if (!mode.terminators) {
        mode.terminators = compileTerminators(mode, language);
      }
      mode.terminators.lastIndex = index;
      var match = mode.terminators.exec(value);
      if (match)
        return [value.substr(index, match.index - index), match[0], false];
      else
        return [value.substr(index), '', true];
    }

    function keywordMatch(mode, match) {
      var match_str = language.case_insensitive ? match[0].toLowerCase() : match[0]
      for (var className in mode.keywordGroups) {
        if (!mode.keywordGroups.hasOwnProperty(className))
          continue;
        var value = mode.keywordGroups[className].hasOwnProperty(match_str);
        if (value)
          return [className, value];
      }
      return false;
    }

    function processKeywords(buffer, mode) {
      if (!mode.keywords || !mode.lexems)
        return escape(buffer);
      if (!mode.lexemsRe) {
        var lexems_re = '(' + mode.lexems.join('|') + ')';
        mode.lexemsRe = langRe(language, lexems_re, true);
      }
      var result = '';
      var last_index = 0;
      mode.lexemsRe.lastIndex = 0;
      var match = mode.lexemsRe.exec(buffer);
      while (match) {
        result += escape(buffer.substr(last_index, match.index - last_index));
        var keyword_match = keywordMatch(mode, match);
        if (keyword_match) {
          keyword_count += keyword_match[1];
          result += '<span class="'+ keyword_match[0] +'">' + escape(match[0]) + '</span>';
        } else {
          result += escape(match[0]);
        }
        last_index = mode.lexemsRe.lastIndex;
        match = mode.lexemsRe.exec(buffer);
      }
      result += escape(buffer.substr(last_index, buffer.length - last_index));
      return result;
    }

    function processBuffer(buffer, mode) {
      if (mode.subLanguage && selected_languages[mode.subLanguage]) {
        var result = highlight(mode.subLanguage, buffer);
        keyword_count += result.keyword_count;
        relevance += result.relevance;
        return result.value;
      } else {
        return processKeywords(buffer, mode);
      }
    }

    function startNewMode(mode, lexem) {
      var markup = mode.noMarkup?'':'<span class="' + mode.displayClassName + '">';
      if (mode.returnBegin) {
        result += markup;
        mode.buffer = '';
      } else if (mode.excludeBegin) {
        result += escape(lexem) + markup;
        mode.buffer = '';
      } else {
        result += markup;
        mode.buffer = lexem;
      }
      modes[modes.length] = mode;
    }

    function processModeInfo(buffer, lexem, end) {
      var current_mode = modes[modes.length - 1];
      if (end) {
        result += processBuffer(current_mode.buffer + buffer, current_mode);
        return false;
      }

      var new_mode = subMode(lexem, current_mode);
      if (new_mode) {
        result += processBuffer(current_mode.buffer + buffer, current_mode);
        startNewMode(new_mode, lexem);
        relevance += new_mode.relevance;
        return new_mode.returnBegin;
      }

      var end_level = endOfMode(modes.length - 1, lexem);
      if (end_level) {
        var markup = current_mode.noMarkup?'':'</span>';
        if (current_mode.returnEnd) {
          result += processBuffer(current_mode.buffer + buffer, current_mode) + markup;
        } else if (current_mode.excludeEnd) {
          result += processBuffer(current_mode.buffer + buffer, current_mode) + markup + escape(lexem);
        } else {
          result += processBuffer(current_mode.buffer + buffer + lexem, current_mode) + markup;
        }
        while (end_level > 1) {
          markup = modes[modes.length - 2].noMarkup?'':'</span>';
          result += markup;
          end_level--;
          modes.length--;
        }
        var last_ended_mode = modes[modes.length - 1];
        modes.length--;
        modes[modes.length - 1].buffer = '';
        if (last_ended_mode.starts) {
          for (var i = 0; i < language.modes.length; i++) {
            if (language.modes[i].className == last_ended_mode.starts) {
              startNewMode(language.modes[i], '');
              break;
            }
          }
        }
        return current_mode.returnEnd;
      }

      if (isIllegal(lexem, current_mode))
        throw 'Illegal';
    }

    var language = LANGUAGES[language_name];
    var modes = [language.defaultMode];
    var relevance = 0;
    var keyword_count = 0;
    var result = '';
    try {
      var index = 0;
      language.defaultMode.buffer = '';
      do {
        var mode_info = eatModeChunk(value, index);
        var return_lexem = processModeInfo(mode_info[0], mode_info[1], mode_info[2]);
        index += mode_info[0].length;
        if (!return_lexem) {
          index += mode_info[1].length;
        }
      } while (!mode_info[2]);
      if(modes.length > 1)
        throw 'Illegal';
      return {
        language: language_name,
        relevance: relevance,
        keyword_count: keyword_count,
        value: result
      }
    } catch (e) {
      if (e == 'Illegal') {
        return {
          language: null,
          relevance: 0,
          keyword_count: 0,
          value: escape(value)
        }
      } else {
        throw e;
      }
    }
  }

  /* Initialization */

  function compileModes() {

    function compileMode(mode, language) {
      if (mode.compiled)
        return;

      if (mode.begin)
        mode.beginRe = langRe(language, '^' + mode.begin);
      if (mode.end)
        mode.endRe = langRe(language, '^' + mode.end);
      if (mode.illegal)
        mode.illegalRe = langRe(language, '^(?:' + mode.illegal + ')');
      if (mode.relevance == undefined)
        mode.relevance = 1;
      if (!mode.displayClassName)
        mode.displayClassName = mode.className;
      if (!mode.className)
        mode.noMarkup = true;
      for (var key in mode.keywords) {
        if (!mode.keywords.hasOwnProperty(key))
          continue;
        if (mode.keywords[key] instanceof Object)
          mode.keywordGroups = mode.keywords;
        else
          mode.keywordGroups = {'keyword': mode.keywords};
        break;
      }
      mode.sub_modes = [];
      if (mode.contains) {
        for (var i = 0; i < mode.contains.length; i++) {
          if (mode.contains[i] instanceof Object) { // inline mode
            mode.sub_modes.push(mode.contains[i]);
          } else { // named mode
            for (var j = 0; j < language.modes.length; j++) {
              if (language.modes[j].className == mode.contains[i]) {
                mode.sub_modes.push(language.modes[j]);
              }
            }
          }
        }
      }
      // compiled flag is set before compiling submodes to avoid self-recursion
      // (see lisp where quoted_list contains quoted_list)
      mode.compiled = true;
      for (var i = 0; i < mode.sub_modes.length; i++) {
        compileMode(mode.sub_modes[i], language);
      }
    }

    for (var i in LANGUAGES) {
      if (!LANGUAGES.hasOwnProperty(i))
        continue;
      var modes = [LANGUAGES[i].defaultMode].concat(LANGUAGES[i].modes);
      for (var j = 0; j < modes.length; j++) {
        compileMode(modes[j], LANGUAGES[i]);
      }
    }
  }

  function initialize() {
    if (initialize.called)
        return;
    initialize.called = true;
    compileModes();
    selected_languages = LANGUAGES;
  }

  /* Public library functions */

  function highlightBlock(block, tabReplace, useBR) {
    initialize();

    var text = blockText(block, useBR);
    var language = blockLanguage(block);
    if (language == 'no-highlight')
        return;
    if (language) {
      var result = highlight(language, text);
    } else {
      var result = {language: '', keyword_count: 0, relevance: 0, value: escape(text)};
      var second_best = result;
      for (var key in selected_languages) {
        if (!selected_languages.hasOwnProperty(key))
          continue;
        var current = highlight(key, text);
        if (current.keyword_count + current.relevance > second_best.keyword_count + second_best.relevance) {
          second_best = current;
        }
        if (current.keyword_count + current.relevance > result.keyword_count + result.relevance) {
          second_best = result;
          result = current;
        }
      }
    }

    var class_name = block.className;
    if (!class_name.match(result.language)) {
      class_name = class_name ? (class_name + ' ' + result.language) : result.language;
    }
    var original = nodeStream(block);
    if (original.length) {
      var pre = document.createElement('pre');
      pre.innerHTML = result.value;
      result.value = mergeStreams(original, nodeStream(pre), text);
    }
    if (tabReplace) {
      result.value = result.value.replace(/^((<[^>]+>|\t)+)/gm, function(match, p1, offset, s) {
        return p1.replace(/\t/g, tabReplace);
      })
    }
    if (useBR) {
      result.value = result.value.replace(/\n/g, '<br>');
    }
    if (/MSIE [678]/.test(navigator.userAgent) && block.tagName == 'CODE' && block.parentNode.tagName == 'PRE') {
      // This is for backwards compatibility only. IE needs this strange
      // hack becasue it cannot just cleanly replace <code> block contents.
      var pre = block.parentNode;
      var container = document.createElement('div');
      container.innerHTML = '<pre><code>' + result.value + '</code></pre>';
      block = container.firstChild.firstChild;
      container.firstChild.className = pre.className;
      pre.parentNode.replaceChild(container.firstChild, pre);
    } else {
      block.innerHTML = result.value;
    }
    block.className = class_name;
    block.dataset = {};
    block.dataset.result = {
      language: result.language,
      kw: result.keyword_count,
      re: result.relevance
    };
    if (second_best && second_best.language) {
      block.dataset.second_best = {
        language: second_best.language,
        kw: second_best.keyword_count,
        re: second_best.relevance
      };
    }
  }

  function initHighlighting() {
    if (initHighlighting.called)
      return;
    initHighlighting.called = true;
    initialize();
    if (arguments.length) {
      for (var i = 0; i < arguments.length; i++) {
        if (LANGUAGES[arguments[i]]) {
          selected_languages[arguments[i]] = LANGUAGES[arguments[i]];
        }
      }
    }
    var pres = document.getElementsByTagName('pre');
    for (var i = 0; i < pres.length; i++) {
      var code = findCode(pres[i]);
      if (code)
        highlightBlock(code, hljs.tabReplace);
    }
  }

  function initHighlightingOnLoad() {
    var original_arguments = arguments;
    var handler = function(){initHighlighting.apply(null, original_arguments)};
    if (window.addEventListener) {
      window.addEventListener('DOMContentLoaded', handler, false);
      window.addEventListener('load', handler, false);
    } else if (window.attachEvent)
      window.attachEvent('onload', handler);
    else
      window.onload = handler;
  }

  /* Interface definition */

  this.LANGUAGES = LANGUAGES;
  this.initHighlightingOnLoad = initHighlightingOnLoad;
  this.highlightBlock = highlightBlock;
  this.initHighlighting = initHighlighting;
  this.highlight = highlight;
  this.initialize = initialize;

  // Common regexps
  this.IMMEDIATE_RE = '\\b|\\B'
  this.IDENT_RE = '[a-zA-Z][a-zA-Z0-9_]*';
  this.UNDERSCORE_IDENT_RE = '[a-zA-Z_][a-zA-Z0-9_]*';
  this.NUMBER_RE = '\\b\\d+(\\.\\d+)?';
  this.C_NUMBER_RE = '\\b(0x[A-Za-z0-9]+|\\d+(\\.\\d+)?)';
  this.RE_STARTERS_RE = '!|!=|!==|%|%=|&|&&|&=|\\*|\\*=|\\+|\\+=|,|\\.|-|-=|/|/=|:|;|<|<<|<<=|<=|=|==|===|>|>=|>>|>>=|>>>|>>>=|\\?|\\[|\\{|\\(|\\^|\\^=|\\||\\|=|\\|\\||~';

  // Common modes
  this.APOS_STRING_MODE = {
    className: 'string',
    begin: '\'', end: '\'',
    illegal: '\\n',
    contains: ['escape'],
    relevance: 0
  };
  this.QUOTE_STRING_MODE = {
    className: 'string',
    begin: '"', end: '"',
    illegal: '\\n',
    contains: ['escape'],
    relevance: 0
  };
  this.BACKSLASH_ESCAPE = {
    className: 'escape',
    begin: '\\\\.', end: this.IMMEDIATE_RE, noMarkup: true,
    relevance: 0
  };
  this.C_LINE_COMMENT_MODE = {
    className: 'comment',
    begin: '//', end: '$',
    relevance: 0
  };
  this.C_BLOCK_COMMENT_MODE = {
    className: 'comment',
    begin: '/\\*', end: '\\*/'
  };
  this.HASH_COMMENT_MODE = {
    className: 'comment',
    begin: '#', end: '$'
  };
  this.NUMBER_MODE = {
    className: 'number',
    begin: this.NUMBER_RE, end: this.IMMEDIATE_RE,
    relevance: 0
  };
  this.C_NUMBER_MODE = {
    className: 'number',
    begin: this.C_NUMBER_RE, end: this.IMMEDIATE_RE,
    relevance: 0
  };

  // Utility functions
  this.inherit = function(parent, obj) {
    var result = {}
    for (var key in parent)
      result[key] = parent[key];
    if (obj)
      for (var key in obj)
        result[key] = obj[key];
    return result;
  }
}();

var initHighlightingOnLoad = hljs.initHighlightingOnLoad;
/*
Language: Bash
Author: vah <vahtenberg@gmail.com>
*/

hljs.LANGUAGES.bash = function(){
  var BASH_LITERAL = {'true' : 1, 'false' : 1}
  return {
    defaultMode: {
      lexems: [hljs.IDENT_RE],
      contains: ['string', 'shebang', 'comment', 'number', 'test_condition', 'string', 'variable'],
      keywords: {
        'keyword': {'if' : 1, 'then' : 1, 'else' : 1, 'fi' : 1, 'for' : 1, 'break' : 1, 'continue' : 1, 'while' : 1, 'in' : 1, 'do' : 1, 'done' : 1, 'echo' : 1, 'exit' : 1, 'return' : 1, 'set' : 1, 'declare' : 1},
        'literal': BASH_LITERAL
      }
    },
    case_insensitive: false,
    modes: [
      {
        className: 'shebang',
        begin: '(#!\\/bin\\/bash)|(#!\\/bin\\/sh)',
        end: hljs.IMMEDIATE_RE,
        relevance: 10
      },
      hljs.HASH_COMMENT_MODE,
      {
        className: 'test_condition',
        begin: '\\[ ',
        end: ' \\]',
        contains: ['string', 'variable', 'number'],
        lexems: [hljs.IDENT_RE],
        keywords: {
          'literal': BASH_LITERAL
        },
        relevance: 0
      },
      {
        className: 'test_condition',
        begin: '\\[\\[ ',
        end: ' \\]\\]',
        contains: ['string', 'variable', 'number'],
        lexems: [hljs.IDENT_RE],
        keywords: {
          'literal': BASH_LITERAL
        }
      },
      {
        className: 'variable',
        begin: '\\$([a-zA-Z0-9_]+)\\b',
        end: hljs.IMMEDIATE_RE
      },
      {
        className: 'variable',
        begin: '\\$\\{(([^}])|(\\\\}))+\\}',
        end: hljs.IMMEDIATE_RE,
        contains: ['number']
      },
      {
        className: 'string',
        begin: '"', end: '"',
        illegal: '\\n',
        contains: ['escape', 'variable'],
        relevance: 0
      },
      {
        className: 'string',
        begin: '"', end: '"',
        illegal: '\\n',
        contains: ['escape', 'variable'],
        relevance: 0
      },
      hljs.BACKSLASH_ESCAPE,
      hljs.C_NUMBER_MODE,
      {
        className: 'comment',
        begin: '\\/\\/', end: '$',
        illegal: '.'
      }
    ]
  };
}();
/*
Language: CMake
Description: CMake is an open-source cross-platform system for build automation.
Author: Igor Kalnitsky <igor.kalnitsky@gmail.com>
Website: http://kalnitsky.org.ua/
*/

hljs.LANGUAGES.cmake = {

  defaultMode: {
    lexems: [hljs.IDENT_RE],

    keywords: {
    'add_custom_command': 2, 'add_custom_target': 2, 'add_definitions': 2, 'add_dependencies': 2, 'add_executable': 2, 'add_library': 2, 'add_subdirectory': 2, 'add_executable': 2, 'add_library': 2, 'add_subdirectory': 2, 'add_test': 2, 'aux_source_directory': 2, 'break': 1, 'build_command': 2, 'cmake_minimum_required': 3, 'cmake_policy': 3, 'configure_file': 1, 'create_test_sourcelist': 1, 'define_property': 1, 'else': 1, 'elseif': 1, 'enable_language': 2, 'enable_testing': 2, 'endforeach': 1, 'endfunction': 1, 'endif': 1, 'endmacro': 1, 'endwhile': 1, 'execute_process': 2, 'export': 1, 'find_file': 1, 'find_library': 2, 'find_package': 2, 'find_path': 1, 'find_program': 1, 'fltk_wrap_ui': 2, 'foreach': 1, 'function': 1, 'get_cmake_property': 3, 'get_directory_property': 1, 'get_filename_component': 1, 'get_property': 1, 'get_source_file_property': 1, 'get_target_property': 1, 'get_test_property': 1, 'if': 1, 'include': 1, 'include_directories': 2, 'include_external_msproject': 1, 'include_regular_expression': 2, 'install': 1, 'link_directories': 1, 'load_cache': 1, 'load_command': 1, 'macro': 1, 'mark_as_advanced': 1, 'message': 1, 'option': 1, 'output_required_files': 1, 'project': 1, 'qt_wrap_cpp': 2, 'qt_wrap_ui': 2, 'remove_definitions': 2, 'return': 1, 'separate_arguments': 1, 'set': 1, 'set_directory_properties': 1, 'set_property': 1, 'set_source_files_properties': 1, 'set_target_properties': 1, 'set_tests_properties': 1, 'site_name': 1, 'source_group': 1, 'string': 1, 'target_link_libraries': 2, 'try_compile': 2, 'try_run': 2, 'unset': 1, 'variable_watch': 2, 'while': 1, 'build_name': 1, 'exec_program': 1, 'export_library_dependencies': 1, 'install_files': 1, 'install_programs': 1, 'install_targets': 1, 'link_libraries': 1, 'make_directory': 1, 'remove': 1, 'subdir_depends': 1, 'subdirs': 1, 'use_mangled_mesa': 1, 'utility_source': 1, 'variable_requires': 1, 'write_file': 1 },

    contains: ['envvar', 'comment', 'string', 'number']
  },

  case_insensitive: true,
  modes: [
    hljs.HASH_COMMENT_MODE,
    hljs.QUOTE_STRING_MODE,
    hljs.BACKSLASH_ESCAPE,
    hljs.NUMBER_MODE,
    {
      className: 'envvar',
      begin: '\\${',
      end: '}'
    }
  ]
};
/*
Language: C++
*/

hljs.LANGUAGES.cpp = function(){
  var CPP_KEYWORDS = {
    'keyword': {
      'false': 1, 'int': 1, 'float': 1, 'while': 1, 'private': 1, 'char': 1,
      'catch': 1, 'export': 1, 'virtual': 1, 'operator': 2, 'sizeof': 2,
      'dynamic_cast': 2, 'typedef': 2, 'const_cast': 2, 'const': 1,
      'struct': 1, 'for': 1, 'static_cast': 2, 'union': 1, 'namespace': 1,
      'unsigned': 1, 'long': 1, 'throw': 1, 'volatile': 2, 'static': 1,
      'protected': 1, 'bool': 1, 'template': 1, 'mutable': 1, 'if': 1,
      'public': 1, 'friend': 2, 'do': 1, 'return': 1, 'goto': 1, 'auto': 1,
      'void': 2, 'enum': 1, 'else': 1, 'break': 1, 'new': 1, 'extern': 1,
      'using': 1, 'true': 1, 'class': 1, 'asm': 1, 'case': 1, 'typeid': 1,
      'short': 1, 'reinterpret_cast': 2, 'default': 1, 'double': 1,
      'register': 1, 'explicit': 1, 'signed': 1, 'typename': 1, 'try': 1,
      'this': 1, 'switch': 1, 'continue': 1, 'wchar_t': 1, 'inline': 1,
      'delete': 1, 'alignof': 1, 'char16_t': 1, 'char32_t': 1, 'constexpr': 1,
      'decltype': 1, 'noexcept': 1, 'nullptr': 1, 'static_assert': 1,
      'thread_local': 1
    },
    'built_in': {
      'std': 1, 'string': 1, 'cin': 1, 'cout': 1, 'cerr': 1, 'clog': 1,
      'stringstream': 1, 'istringstream': 1, 'ostringstream': 1, 'auto_ptr': 1,
      'deque': 1, 'list': 1, 'queue': 1, 'stack': 1, 'vector': 1, 'map': 1,
      'set': 1, 'bitset': 1, 'multiset': 1, 'multimap': 1, 'unordered_set': 1,
      'unordered_map': 1, 'unordered_multiset': 1, 'unordered_multimap': 1,
      'array': 1, 'shared_ptr': 1
    }
  };
  return {
    defaultMode: {
      lexems: [hljs.UNDERSCORE_IDENT_RE],
      illegal: '</',
      contains: ['comment', 'string', 'number', 'preprocessor', 'stl_container'],
      keywords: CPP_KEYWORDS
    },
    modes: [
      hljs.C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      hljs.C_NUMBER_MODE,
      hljs.QUOTE_STRING_MODE,
      hljs.BACKSLASH_ESCAPE,
      {
        className: 'string',
        begin: '\'', end: '[^\\\\]\'',
        illegal: '[^\\\\][^\']'
      },
      {
        className: 'preprocessor',
        begin: '#', end: '$'
      },
      {
        className: 'stl_container',
        begin: '\\b(deque|list|queue|stack|vector|map|set|bitset|multiset|multimap|unordered_map|unordered_set|unordered_multiset|unordered_multimap|array)\\s*<', end: '>',
        contains: ['stl_container'],
        lexems: [hljs.UNDERSCORE_IDENT_RE],
        keywords: CPP_KEYWORDS['built_in'],
        relevance: 10
      }
    ]
  };
}();
/*
Language: CSS
Requires:  html-xml.js
*/

hljs.LANGUAGES.css = {
  defaultMode: {
    contains: ['at_rule', 'id', 'class', 'attr_selector', 'pseudo', 'rules', 'comment'],
    keywords: hljs.HTML_TAGS,
    lexems: [hljs.IDENT_RE],
    illegal: '='
  },
  case_insensitive: true,
  modes: [
    {
      className: 'at_rule',
      begin: '@', end: '[{;]',
      excludeEnd: true,
      lexems: [hljs.IDENT_RE],
      keywords: {'import': 1, 'page': 1, 'media': 1, 'charset': 1, 'font-face': 1},
      contains: ['function', 'string', 'number', 'pseudo']
    },
    {
      className: 'id',
      begin: '\\#[A-Za-z0-9_-]+', end: hljs.IMMEDIATE_RE
    },
    {
      className: 'class',
      begin: '\\.[A-Za-z0-9_-]+', end: hljs.IMMEDIATE_RE,
      relevance: 0
    },
    {
      className: 'attr_selector',
      begin: '\\[', end: '\\]',
      illegal: '$'
    },
    {
      className: 'pseudo',
      begin: ':(:)?[a-zA-Z0-9\\_\\-\\+\\(\\)\\"\\\']+', end: hljs.IMMEDIATE_RE
    },
    {
      className: 'rules',
      begin: '{', end: '}',
      contains: [
        {
          className: 'rule',
          begin: '[A-Z\\_\\.\\-]+\\s*:', end: ';', endsWithParent: true,
          lexems: ['[A-Za-z-]+'],
          keywords: {'play-during': 1, 'counter-reset': 1, 'counter-increment': 1, 'min-height': 1, 'quotes': 1, 'border-top': 1, 'pitch': 1, 'font': 1, 'pause': 1, 'list-style-image': 1, 'border-width': 1, 'cue': 1, 'outline-width': 1, 'border-left': 1, 'elevation': 1, 'richness': 1, 'speech-rate': 1, 'border-bottom': 1, 'border-spacing': 1, 'background': 1, 'list-style-type': 1, 'text-align': 1, 'page-break-inside': 1, 'orphans': 1, 'page-break-before': 1, 'text-transform': 1, 'line-height': 1, 'padding-left': 1, 'font-size': 1, 'right': 1, 'word-spacing': 1, 'padding-top': 1, 'outline-style': 1, 'bottom': 1, 'content': 1, 'border-right-style': 1, 'padding-right': 1, 'border-left-style': 1, 'voice-family': 1, 'background-color': 1, 'border-bottom-color': 1, 'outline-color': 1, 'unicode-bidi': 1, 'max-width': 1, 'font-family': 1, 'caption-side': 1, 'border-right-width': 1, 'pause-before': 1, 'border-top-style': 1, 'color': 1, 'border-collapse': 1, 'border-bottom-width': 1, 'float': 1, 'height': 1, 'max-height': 1, 'margin-right': 1, 'border-top-width': 1, 'speak': 1, 'speak-header': 1, 'top': 1, 'cue-before': 1, 'min-width': 1, 'width': 1, 'font-variant': 1, 'border-top-color': 1, 'background-position': 1, 'empty-cells': 1, 'direction': 1, 'border-right': 1, 'visibility': 1, 'padding': 1, 'border-style': 1, 'background-attachment': 1, 'overflow': 1, 'border-bottom-style': 1, 'cursor': 1, 'margin': 1, 'display': 1, 'border-left-width': 1, 'letter-spacing': 1, 'vertical-align': 1, 'clip': 1, 'border-color': 1, 'list-style': 1, 'padding-bottom': 1, 'pause-after': 1, 'speak-numeral': 1, 'margin-left': 1, 'widows': 1, 'border': 1, 'font-style': 1, 'border-left-color': 1, 'pitch-range': 1, 'background-repeat': 1, 'table-layout': 1, 'margin-bottom': 1, 'speak-punctuation': 1, 'font-weight': 1, 'border-right-color': 1, 'page-break-after': 1, 'position': 1, 'white-space': 1, 'text-indent': 1, 'background-image': 1, 'volume': 1, 'stress': 1, 'outline': 1, 'clear': 1, 'z-index': 1, 'text-decoration': 1, 'margin-top': 1, 'azimuth': 1, 'cue-after': 1, 'left': 1, 'list-style-position': 1},
          contains: [
            {
              className: 'value',
              begin: hljs.IMMEDIATE_RE, endsWithParent: true, excludeEnd: true,
              contains: ['function', 'number', 'hexcolor', 'string', 'important', 'comment']
            }
          ]
        },
        'comment'
      ],
      illegal: '[^\\s]'
    },
    hljs.C_BLOCK_COMMENT_MODE,
    {
      className: 'number',
      begin: hljs.NUMBER_RE, end: hljs.IMMEDIATE_RE
    },
    {
      className: 'hexcolor',
      begin: '\\#[0-9A-F]+', end: hljs.IMMEDIATE_RE
    },
    {
      className: 'function',
      begin: hljs.IDENT_RE + '\\(', end: '\\)',
      contains: [
        {
          className: 'params',
          begin: hljs.IMMEDIATE_RE, endsWithParent: true, excludeEnd: true,
          contains: ['number', 'string']
        }
      ]
    },
    {
      className: 'important',
      begin: '!important', end: hljs.IMMEDIATE_RE
    },
    hljs.APOS_STRING_MODE,
    hljs.QUOTE_STRING_MODE,
    hljs.BACKSLASH_ESCAPE
  ]
};
/*
Language: diff
Description: Unified and context diff
Author: Vasily Polovnyov <vast@whiteants.net>
*/

hljs.LANGUAGES.diff = {
  case_insensitive: true,
  defaultMode: {
    contains: ['chunk', 'header', 'addition', 'deletion', 'change']
  },
  modes: [
    {
      className: 'chunk',
      begin: '^\\@\\@ +\\-\\d+,\\d+ +\\+\\d+,\\d+ +\\@\\@$', end:hljs.IMMEDIATE_RE,
      relevance: 10
    },
    {
      className: 'chunk',
      begin: '^\\*\\*\\* +\\d+,\\d+ +\\*\\*\\*\\*$', end: hljs.IMMEDIATE_RE,
      relevance: 10
    },
    {
      className: 'chunk',
      begin: '^\\-\\-\\- +\\d+,\\d+ +\\-\\-\\-\\-$', end: hljs.IMMEDIATE_RE,
      relevance: 10
    },
    {
      className: 'header',
      begin: 'Index: ', end: '$'
    },
    {
      className: 'header',
      begin: '=====', end: '=====$'
    },
    {
      className: 'header',
      begin: '^\\-\\-\\-', end: '$'
    },
    {
      className: 'header',
      begin: '^\\*{3} ', end: '$'
    },
    {
      className: 'header',
      begin: '^\\+\\+\\+', end: '$'
    },
    {
      className: 'header',
      begin: '\\*{5}', end: '\\*{5}$'
    },
    {
      className: 'addition',
      begin: '^\\+', end: '$'
    },
    {
      className: 'deletion',
      begin: '^\\-', end: '$'
    },
    {
      className: 'change',
      begin: '^\\!', end: '$'
    }
  ]
};
/*
Language: HTML, XML
*/

(function(){

  var XML_IDENT_RE = '[A-Za-z0-9\\._:-]+';

  var PI = {
    className: 'pi',
    begin: '<\\?', end: '\\?>',
    relevance: 10
  };
  var DOCTYPE = {
    className: 'doctype',
    begin: '<!DOCTYPE', end: '>',
    relevance: 10
  };
  var COMMENT = {
    className: 'comment',
    begin: '<!--', end: '-->'
  };
  var TAG = {
    className: 'tag',
    begin: '</?', end: '/?>',
    contains: ['title', 'tag_internal']
  };
  var TITLE = {
    className: 'title',
    begin: XML_IDENT_RE, end: hljs.IMMEDIATE_RE
  };
  var TAG_INTERNAL = {
    className: 'tag_internal',
    begin: hljs.IMMEDIATE_RE, endsWithParent: true, noMarkup: true,
    contains: ['attribute', 'value_container'],
    relevance: 0
  };
  var ATTR = {
    className: 'attribute',
    begin: XML_IDENT_RE, end: hljs.IMMEDIATE_RE,
    relevance: 0
  };
  var VALUE_CONTAINER_QUOT = {
    className: 'value_container',
    begin: '="', returnBegin: true, end: '"', noMarkup: true,
    contains: [{
        className: 'value',
        begin: '"', endsWithParent: true
    }]
  };
  var VALUE_CONTAINER_APOS = {
    className: 'value_container',
    begin: '=\'', returnBegin: true, end: '\'', noMarkup: true,
    contains: [{
      className: 'value',
      begin: '\'', endsWithParent: true
    }]
  };

  hljs.LANGUAGES.xml = {
    defaultMode: {
      contains: ['pi', 'doctype', 'comment', 'cdata', 'tag']
    },
    case_insensitive: true,
    modes: [
      {
        className: 'cdata',
        begin: '<\\!\\[CDATA\\[', end: '\\]\\]>',
        relevance: 10
      },
      PI,
      DOCTYPE,
      COMMENT,
      TAG,
      hljs.inherit(TITLE, {relevance: 1.75}),
      TAG_INTERNAL,
      ATTR,
      VALUE_CONTAINER_QUOT,
      VALUE_CONTAINER_APOS
    ]
  };

  var HTML_TAGS = {
    'code': 1, 'kbd': 1, 'font': 1, 'noscript': 1, 'style': 1, 'img': 1,
    'title': 1, 'menu': 1, 'tt': 1, 'tr': 1, 'param': 1, 'li': 1, 'tfoot': 1,
    'th': 1, 'input': 1, 'td': 1, 'dl': 1, 'blockquote': 1, 'fieldset': 1,
    'big': 1, 'dd': 1, 'abbr': 1, 'optgroup': 1, 'dt': 1, 'button': 1,
    'isindex': 1, 'p': 1, 'small': 1, 'div': 1, 'dir': 1, 'em': 1, 'frame': 1,
    'meta': 1, 'sub': 1, 'bdo': 1, 'label': 1, 'acronym': 1, 'sup': 1, 'body': 1,
    'basefont': 1, 'base': 1, 'br': 1, 'address': 1, 'strong': 1, 'legend': 1,
    'ol': 1, 'script': 1, 'caption': 1, 's': 1, 'col': 1, 'h2': 1, 'h3': 1,
    'h1': 1, 'h6': 1, 'h4': 1, 'h5': 1, 'table': 1, 'select': 1, 'noframes': 1,
    'span': 1, 'area': 1, 'dfn': 1, 'strike': 1, 'cite': 1, 'thead': 1,
    'head': 1, 'option': 1, 'form': 1, 'hr': 1, 'var': 1, 'link': 1, 'b': 1,
    'colgroup': 1, 'ul': 1, 'applet': 1, 'del': 1, 'iframe': 1, 'pre': 1,
    'frameset': 1, 'ins': 1, 'tbody': 1, 'html': 1, 'samp': 1, 'map': 1,
    'object': 1, 'a': 1, 'xmlns': 1, 'center': 1, 'textarea': 1, 'i': 1, 'q': 1,
    'u': 1, 'section': 1, 'nav': 1, 'article': 1, 'aside': 1, 'hgroup': 1,
    'header': 1, 'footer': 1, 'figure': 1, 'figurecaption': 1, 'time': 1,
    'mark': 1, 'wbr': 1, 'embed': 1, 'video': 1, 'audio': 1, 'source': 1,
    'canvas': 1, 'datalist': 1, 'keygen': 1, 'output': 1, 'progress': 1,
    'meter': 1, 'details': 1, 'summary': 1, 'command': 1
  };

  hljs.LANGUAGES.html = {
    defaultMode: {
      contains: ['comment', 'pi', 'doctype', 'vbscript', 'tag']
    },
    case_insensitive: true,
    modes: [
      {
        className: 'tag',
        begin: '<style', end: '>',
        lexems: [hljs.IDENT_RE],  keywords: {'style': 1},
        contains: ['tag_internal'],
        starts: 'css'
      },
      {
        className: 'tag',
        begin: '<script', end: '>',
        lexems: [hljs.IDENT_RE],  keywords: {'script': 1},
        contains: ['tag_internal'],
        starts: 'javascript'
      },
      {
        className: 'css',
        end: '</style>', returnEnd: true,
        subLanguage: 'css'
      },
      {
        className: 'javascript',
        end: '</script>', returnEnd: true,
        subLanguage: 'javascript'
      },
      {
        className: 'vbscript',
        begin: '<%', end: '%>',
        subLanguage: 'vbscript'
      },
      COMMENT,
      PI,
      DOCTYPE,
      hljs.inherit(TAG),
      hljs.inherit(TITLE, {
        lexems: [hljs.IDENT_RE], keywords: HTML_TAGS
      }),
      hljs.inherit(TAG_INTERNAL),
      ATTR,
      VALUE_CONTAINER_QUOT,
      VALUE_CONTAINER_APOS,
      {
        className: 'value_container',
        begin: '=', end: hljs.IMMEDIATE_RE,
        contains: [
          {
            className: 'unquoted_value', displayClassName: 'value',
            begin: '[^\\s/>]+', end: hljs.IMMEDIATE_RE
          }
        ]
      }
    ]
  };

})();
/*
Language: Ini
*/

hljs.LANGUAGES.ini =
{
  case_insensitive: true,
  defaultMode: {
    contains: ['comment', 'title', 'setting'],
    illegal: '[^\\s]'
  },
  modes: [
    {
      className: 'comment',
      begin: ';', end: '$'
    },
    {
      className: 'title',
      begin: '\\[', end: '\\]'
    },
    {
      className: 'setting',
      begin: '^[a-z0-9_\\[\\]]+[ \\t]*=[ \\t]*', end: '$',
      contains: [{
          className: 'value',
          begin: hljs.IMMEDIATE_RE, endsWithParent: true,
          contains: ['string', 'number'],
          lexems: [hljs.IDENT_RE],
          keywords: {'on': 1, 'off': 1, 'true': 1, 'false': 1, 'yes': 1, 'no': 1}
      }]
    },
    hljs.QUOTE_STRING_MODE,
    hljs.BACKSLASH_ESCAPE,
    hljs.NUMBER_MODE
  ]
};
/*
Language: Java
Author: Vsevolod Solovyov <vsevolod.solovyov@gmail.com>
*/

hljs.LANGUAGES.java  = {
  defaultMode: {
    lexems: [hljs.UNDERSCORE_IDENT_RE],
    contains: ['javadoc', 'comment', 'string', 'class', 'number', 'annotation'],
    keywords: {'false': 1, 'synchronized': 1, 'int': 1, 'abstract': 1, 'float': 1, 'private': 1, 'char': 1, 'interface': 1, 'boolean': 1, 'static': 1, 'null': 1, 'if': 1, 'const': 1, 'for': 1, 'true': 1, 'while': 1, 'long': 1, 'throw': 1, 'strictfp': 1, 'finally': 1, 'protected': 1, 'extends': 1, 'import': 1, 'native': 1, 'final': 1, 'implements': 1, 'return': 1, 'void': 1, 'enum': 1, 'else': 1, 'break': 1, 'transient': 1, 'new': 1, 'catch': 1, 'instanceof': 1, 'byte': 1, 'super': 1, 'class': 1, 'volatile': 1, 'case': 1, 'assert': 1, 'short': 1, 'package': 1, 'default': 1, 'double': 1, 'public': 1, 'try': 1, 'this': 1, 'switch': 1, 'continue': 1, 'throws': 1}
  },
  modes: [
    {
      className: 'class',
      lexems: [hljs.UNDERSCORE_IDENT_RE],
      begin: '(class |interface )', end: '{',
      illegal: ':',
      keywords: {'class': 1, 'interface': 1},
      contains: [
        {
          begin: '(implements|extends)', end: hljs.IMMEDIATE_RE,
          lexems: [hljs.IDENT_RE],
          keywords: {'extends': 1, 'implements': 1},
          relevance: 10
        },
        {
          className: 'title',
          begin: hljs.UNDERSCORE_IDENT_RE, end: hljs.IMMEDIATE_RE
        }
      ]
    },
    hljs.C_NUMBER_MODE,
    hljs.APOS_STRING_MODE,
    hljs.QUOTE_STRING_MODE,
    hljs.BACKSLASH_ESCAPE,
    hljs.C_LINE_COMMENT_MODE,
    {
      className: 'javadoc',
      begin: '/\\*\\*', end: '\\*/',
      contains: [{
        className: 'javadoctag',
        begin: '@[A-Za-z]+', end: hljs.IMMEDIATE_RE
      }],
      relevance: 10
    },
    hljs.C_BLOCK_COMMENT_MODE,
    {
      className: 'annotation',
      begin: '@[A-Za-z]+', end: hljs.IMMEDIATE_RE
    }
  ]
};
/*
Language: Javascript
*/

hljs.LANGUAGES.javascript = {
  defaultMode: {
    lexems: [hljs.UNDERSCORE_IDENT_RE],
    contains: ['string', 'comment', 'number', 'regexp_container', 'function'],
    keywords: {
      'keyword': {'in': 1, 'if': 1, 'for': 1, 'while': 1, 'finally': 1, 'var': 1, 'new': 1, 'function': 1, 'do': 1, 'return': 1, 'void': 1, 'else': 1, 'break': 1, 'catch': 1, 'instanceof': 1, 'with': 1, 'throw': 1, 'case': 1, 'default': 1, 'try': 1, 'this': 1, 'switch': 1, 'continue': 1, 'typeof': 1, 'delete': 1},
      'literal': {'true': 1, 'false': 1, 'null': 1}
    }
  },
  modes: [
    hljs.C_LINE_COMMENT_MODE,
    hljs.C_BLOCK_COMMENT_MODE,
    hljs.C_NUMBER_MODE,
    hljs.APOS_STRING_MODE,
    hljs.QUOTE_STRING_MODE,
    hljs.BACKSLASH_ESCAPE,
    {
      className: 'regexp_container',
      begin: '(' + hljs.RE_STARTERS_RE + '|case|return|throw)\\s*', end: hljs.IMMEDIATE_RE, noMarkup: true,
      lexems: [hljs.IDENT_RE],
      keywords: {'return': 1, 'throw': 1, 'case': 1},
      contains: [
        'comment',
        {
          className: 'regexp',
          begin: '/.*?[^\\\\/]/[gim]*', end: hljs.IMMEDIATE_RE
        }
      ],
      relevance: 0
    },
    {
      className: 'function',
      begin: '\\bfunction\\b', end: '{',
      lexems: [hljs.UNDERSCORE_IDENT_RE],
      keywords: {'function': 1},
      contains: [
        {
          className: 'title',
          begin: '[A-Za-z$_][0-9A-Za-z$_]*', end: hljs.IMMEDIATE_RE
        },
        {
          className: 'params',
          begin: '\\(', end: '\\)',
          contains: ['string', 'comment']
        }
      ]
    }
  ]
};
/*
Language: Lisp
Description: Generic lisp syntax
Author: Vasily Polovnyov <vast@whiteants.net>
*/

hljs.LANGUAGES.lisp = function(){
  var LISP_IDENT_RE = '[a-zA-Z_\\-\\+\\*\\/\\<\\=\\>\\&\\#][a-zA-Z0-9_\\-\\+\\*\\/\\<\\=\\>\\&\\#]*'
  var LISP_SIMPLE_NUMBER_RE = '(\\-|\\+)?\\d+(\\.\\d+|\\/\\d+)?((d|e|f|l|s)(\\+|\\-)?\\d+)?'
  return {
    case_insensitive: true,
    defaultMode: {
      lexems: [LISP_IDENT_RE],
      contains: ['literal', 'number', 'string', 'comment', 'quoted', 'list'],
      illegal: '[^\\s]'
    },
    modes: [
      {
        className: 'string',
        begin: '"', end: '"',
        contains: ['escape'],
        relevance: 0
      },
      hljs.BACKSLASH_ESCAPE,
      {
        className: 'number',
        begin: LISP_SIMPLE_NUMBER_RE, end: hljs.IMMEDIATE_RE
      },
      {
        className: 'number',
        begin: '#b[0-1]+(/[0-1]+)?', end: hljs.IMMEDIATE_RE
      },
      {
        className: 'number',
        begin: '#o[0-7]+(/[0-7]+)?', end: hljs.IMMEDIATE_RE
      },
      {
        className: 'number',
        begin: '#x[0-9a-f]+(/[0-9a-f]+)?', end: hljs.IMMEDIATE_RE
      },
      {
        className: 'number',
        begin: '#c\\(' + LISP_SIMPLE_NUMBER_RE + ' +' + LISP_SIMPLE_NUMBER_RE, end: '\\)'
      },
      {
        className: 'comment',
        begin: ';', end: '$'
      },
      {
        className: 'quoted',
        begin: '[\'`]\\(', end: '\\)',
        contains: ['number', 'string', 'variable', 'keyword', 'quoted_list']
      },
      {
        className: 'quoted',
        begin: '\\(quote ', end: '\\)',
        contains: ['number', 'string', 'variable', 'keyword', 'quoted_list'],
        lexems: [LISP_IDENT_RE],
        keywords: {'title': {'quote': 1}}
      },
      {
        className: 'quoted_list',
        begin: '\\(', end: '\\)',
        contains: ['quoted_list', 'literal', 'number', 'string']
      },
      {
        className: 'list',
        begin: '\\(', end: '\\)',
        contains: ['title','body']
      },
      {
        className: 'title',
        begin: LISP_IDENT_RE, end: hljs.IMMEDIATE_RE,
        endsWithParent: true
      },
      {
        className: 'body',
        begin: hljs.IMMEDIATE_RE, endsWithParent: true, excludeEnd: true,
        contains: ['quoted', 'list', 'literal', 'number', 'string', 'comment', 'variable', 'keyword']
      },
      {
        className: 'keyword',
        begin: '[:&]' + LISP_IDENT_RE, end: hljs.IMMEDIATE_RE
      },
      {
        className: 'variable',
        begin: '\\*', end: '\\*'
      },
      {
        className: 'literal',
        begin: '\\b(t{1}|nil)\\b', end: hljs.IMMEDIATE_RE
      }
    ]
  };
}();
/*
Language: Lua
Author: Andrew Fedorov <dmmdrs@mail.ru>
*/

hljs.LANGUAGES.lua = function(){
  var OPENING_LONG_BRACKET = '\\[=*\\[', CLOSING_LONG_BRACKET = '\\]=*\\]';
  return {
    defaultMode: {
      lexems: [hljs.UNDERSCORE_IDENT_RE],
      keywords: {
        'keyword': {
          'and': 1, 'break': 1, 'do': 1, 'else': 1, 'elseif': 1, 'end': 1,
          'false': 1, 'for': 1, 'if': 1, 'in': 1, 'local': 1, 'nil': 1,
          'not': 1, 'or': 1, 'repeat': 1, 'return': 1, 'then': 1, 'true': 1,
          'until': 1, 'while': 1
        },
        'built_in': {
          '_G': 1, '_VERSION': 1, 'assert': 1, 'collectgarbage': 1, 'dofile': 1,
          'error': 1, 'getfenv': 1, 'getmetatable': 1, 'ipairs': 1, 'load': 1,
          'loadfile': 1, 'loadstring': 1, 'module': 1, 'next': 1, 'pairs': 1,
          'pcall': 1, 'print': 1, 'rawequal': 1, 'rawget': 1, 'rawset': 1,
          'require': 1, 'select': 1, 'setfenv': 1, 'setmetatable': 1,
          'tonumber': 1, 'tostring': 1, 'type': 1, 'unpack': 1, 'xpcall': 1,
          'coroutine': 1, 'debug': 1, 'io': 1, 'math': 1, 'os': 1, 'package': 1,
          'string': 1, 'table': 1
        }
      },
      contains: ['comment', 'function', 'number', 'string']
    },
    modes: [
      // comment
      {
        className: 'comment',
        begin: '--(?!' + OPENING_LONG_BRACKET + ')', end: '$'
      },
      {
        className: 'comment',
        begin: '--' + OPENING_LONG_BRACKET, end: CLOSING_LONG_BRACKET,
        contains: ['long_brackets'],
        relevance: 10
      },
      // long_brackets
      {
        className: 'long_brackets',
        begin: OPENING_LONG_BRACKET, end: CLOSING_LONG_BRACKET,
        contains: ['long_brackets'],
        noMarkup: true
      },
      // function
      {
        className: 'function',
        begin: '\\bfunction\\b', end: '\\)',
        lexems: [hljs.UNDERSCORE_IDENT_RE],
        keywords: {'function': 1},
        contains: [
          {
            className: 'title',
            begin: '([_a-zA-Z]\\w*\\.)*([_a-zA-Z]\\w*:)?[_a-zA-Z]\\w*', end: hljs.IMMEDIATE_RE
          },
          {
            className: 'params',
            begin: '\\(', endsWithParent: true,
            contains: ['comment']
          },
          'comment'
        ]
      },
      // number
      hljs.C_NUMBER_MODE,
      // string
      hljs.APOS_STRING_MODE,
      hljs.QUOTE_STRING_MODE,
      {
        className: 'string',
        begin: OPENING_LONG_BRACKET, end: CLOSING_LONG_BRACKET,
        contains: ['long_brackets'],
        relevance: 10
      },
      hljs.BACKSLASH_ESCAPE
    ]
  };
}();
/*
Language: Perl
Author: Peter Leonov <gojpeg@yandex.ru>
*/

hljs.LANGUAGES.perl = function(){
  var PERL_DEFAULT_CONTAINS = ['comment', 'string', 'number', 'regexp', 'sub', 'variable', 'operator', 'pod'];
  var PERL_KEYWORDS = {'getpwent': 1, 'getservent': 1, 'quotemeta': 1, 'msgrcv': 1, 'scalar': 1, 'kill': 1, 'dbmclose': 1, 'undef': 1, 'lc': 1, 'ma': 1, 'syswrite': 1, 'tr': 1, 'send': 1, 'umask': 1, 'sysopen': 1, 'shmwrite': 1, 'vec': 1, 'qx': 1, 'utime': 1, 'local': 1, 'oct': 1, 'semctl': 1, 'localtime': 1, 'readpipe': 1, 'do': 1, 'return': 1, 'format': 1, 'read': 1, 'sprintf': 1, 'dbmopen': 1, 'pop': 1, 'getpgrp': 1, 'not': 1, 'getpwnam': 1, 'rewinddir': 1, 'qq': 1, 'fileno': 1, 'qw': 1, 'endprotoent': 1, 'wait': 1, 'sethostent': 1, 'bless': 1, 's': 1, 'opendir': 1, 'continue': 1, 'each': 1, 'sleep': 1, 'endgrent': 1, 'shutdown': 1, 'dump': 1, 'chomp': 1, 'connect': 1, 'getsockname': 1, 'die': 1, 'socketpair': 1, 'close': 1, 'flock': 1, 'exists': 1, 'index': 1, 'shmget': 1, 'sub': 1, 'for': 1, 'endpwent': 1, 'redo': 1, 'lstat': 1, 'msgctl': 1, 'setpgrp': 1, 'abs': 1, 'exit': 1, 'select': 1, 'print': 1, 'ref': 1, 'gethostbyaddr': 1, 'unshift': 1, 'fcntl': 1, 'syscall': 1, 'goto': 1, 'getnetbyaddr': 1, 'join': 1, 'gmtime': 1, 'symlink': 1, 'semget': 1, 'splice': 1, 'x': 1, 'getpeername': 1, 'recv': 1, 'log': 1, 'setsockopt': 1, 'cos': 1, 'last': 1, 'reverse': 1, 'gethostbyname': 1, 'getgrnam': 1, 'study': 1, 'formline': 1, 'endhostent': 1, 'times': 1, 'chop': 1, 'length': 1, 'gethostent': 1, 'getnetent': 1, 'pack': 1, 'getprotoent': 1, 'getservbyname': 1, 'rand': 1, 'mkdir': 1, 'pos': 1, 'chmod': 1, 'y': 1, 'substr': 1, 'endnetent': 1, 'printf': 1, 'next': 1, 'open': 1, 'msgsnd': 1, 'readdir': 1, 'use': 1, 'unlink': 1, 'getsockopt': 1, 'getpriority': 1, 'rindex': 1, 'wantarray': 1, 'hex': 1, 'system': 1, 'getservbyport': 1, 'endservent': 1, 'int': 1, 'chr': 1, 'untie': 1, 'rmdir': 1, 'prototype': 1, 'tell': 1, 'listen': 1, 'fork': 1, 'shmread': 1, 'ucfirst': 1, 'setprotoent': 1, 'else': 1, 'sysseek': 1, 'link': 1, 'getgrgid': 1, 'shmctl': 1, 'waitpid': 1, 'unpack': 1, 'getnetbyname': 1, 'reset': 1, 'chdir': 1, 'grep': 1, 'split': 1, 'require': 1, 'caller': 1, 'lcfirst': 1, 'until': 1, 'warn': 1, 'while': 1, 'values': 1, 'shift': 1, 'telldir': 1, 'getpwuid': 1, 'my': 1, 'getprotobynumber': 1, 'delete': 1, 'and': 1, 'sort': 1, 'uc': 1, 'defined': 1, 'srand': 1, 'accept': 1, 'package': 1, 'seekdir': 1, 'getprotobyname': 1, 'semop': 1, 'our': 1, 'rename': 1, 'seek': 1, 'if': 1, 'q': 1, 'chroot': 1, 'sysread': 1, 'setpwent': 1, 'no': 1, 'crypt': 1, 'getc': 1, 'chown': 1, 'sqrt': 1, 'write': 1, 'setnetent': 1, 'setpriority': 1, 'foreach': 1, 'tie': 1, 'sin': 1, 'msgget': 1, 'map': 1, 'stat': 1, 'getlogin': 1, 'unless': 1, 'elsif': 1, 'truncate': 1, 'exec': 1, 'keys': 1, 'glob': 1, 'tied': 1, 'closedir': 1, 'ioctl': 1, 'socket': 1, 'readlink': 1, 'eval': 1, 'xor': 1, 'readline': 1, 'binmode': 1, 'setservent': 1, 'eof': 1, 'ord': 1, 'bind': 1, 'alarm': 1, 'pipe': 1, 'atan2': 1, 'getgrent': 1, 'exp': 1, 'time': 1, 'push': 1, 'setgrent': 1, 'gt': 1, 'lt': 1, 'or': 1, 'ne': 1, 'm': 1};
  return {
    defaultMode: {
      lexems: [hljs.IDENT_RE],
      contains: PERL_DEFAULT_CONTAINS,
      keywords: PERL_KEYWORDS
    },
    modes: [

      // variables
      {
        className: 'variable',
        begin: '\\$\\d', end: hljs.IMMEDIATE_RE
      },
      {
        className: 'variable',
        begin: '[\\$\\%\\@\\*](\\^\\w\\b|#\\w+(\\:\\:\\w+)*|[^\\s\\w{]|{\\w+}|\\w+(\\:\\:\\w*)*)', end: hljs.IMMEDIATE_RE
      },

      // numbers and strings
      {
        className: 'subst',
        begin: '[$@]\\{', end: '\}',
        lexems: [hljs.IDENT_RE],
        keywords: PERL_KEYWORDS,
        contains: PERL_DEFAULT_CONTAINS,
        relevance: 10
      },
      {
        className: 'number',
        begin: '(\\b0[0-7_]+)|(\\b0x[0-9a-fA-F_]+)|(\\b[1-9][0-9_]*(\\.[0-9_]+)?)|[0_]\\b', end: hljs.IMMEDIATE_RE,
        relevance: 0
      },
      {
        className: 'string',
        begin: 'q[qwxr]?\\s*\\(', end: '\\)',
        contains: ['escape', 'subst', 'variable'],
        relevance: 5
      },
      {
        className: 'string',
        begin: 'q[qwxr]?\\s*\\[', end: '\\]',
        contains: ['escape', 'subst', 'variable'],
        relevance: 5
      },
      {
        className: 'string',
        begin: 'q[qwxr]?\\s*\\{', end: '\\}',
        contains: ['escape', 'subst', 'variable'],
        relevance: 5
      },
      {
        className: 'string',
        begin: 'q[qwxr]?\\s*\\|', end: '\\|',
        contains: ['escape', 'subst', 'variable'],
        relevance: 5
      },
      {
        className: 'string',
        begin: 'q[qwxr]?\\s*\\<', end: '\\>',
        contains: ['escape', 'subst', 'variable'],
        relevance: 5
      },
      {
        className: 'string',
        begin: 'qw\\s+q', end: 'q',
        contains: ['escape', 'subst', 'variable'],
        relevance: 5
      },
      {
        className: 'string',
        begin: '\'', end: '\'',
        contains: ['escape'],
        relevance: 0
      },
      {
        className: 'string',
        begin: '"', end: '"',
        contains: ['escape','subst','variable'],
        relevance: 0
      },
      hljs.BACKSLASH_ESCAPE,
      {
        className: 'string',
        begin: '`', end: '`',
        contains: ['escape']
      },

      // regexps
      {
        className: 'regexp',
        begin: '(s|tr|y)/(\\\\.|[^/])*/(\\\\.|[^/])*/[a-z]*', end: hljs.IMMEDIATE_RE,
        relevance: 10
      },
      {
        className: 'regexp',
        begin: '(m|qr)?/', end: '/[a-z]*',
        contains: ['escape'],
        relevance: 0 // allows empty "//" which is a common comment delimiter in other languages
      },

      // bareword context
      {
        className: 'string',
        begin: '{\\w+}', end: hljs.IMMEDIATE_RE,
        relevance: 0
      },
      {
        className: 'string',
        begin: '\-?\\w+\\s*\\=\\>', end: hljs.IMMEDIATE_RE,
        relevance: 0
      },

      // subroutines
      {
        className: 'sub',
        begin: '\\bsub\\b', end: '(\\s*\\(.*?\\))?[;{]',
        lexems: [hljs.IDENT_RE],
        keywords: {'sub':1},
        relevance: 5
      },

      // operators
      {
        className: 'operator',
        begin: '-\\w\\b', end: hljs.IMMEDIATE_RE,
        relevance: 0
      },

      // comments
      hljs.HASH_COMMENT_MODE,
      {
        className: 'comment',
        begin: '^(__END__|__DATA__)', end: '\\n$',
        relevance: 5
      },
      // pod
      {
        className: 'pod',
        begin: '\\=\\w', end: '\\=cut'
      }

    ]
  };
}();/*
Language: PHP
Author: Victor Karamzin <Victor.Karamzin@enterra-inc.com>
*/

hljs.LANGUAGES.php = {
  defaultMode: {
    lexems: [hljs.IDENT_RE],
    contains: ['comment', 'number', 'string', 'variable', 'preprocessor'],
    keywords: {
      'and': 1, 'include_once': 1, 'list': 1, 'abstract': 1, 'global': 1,
      'private': 1, 'echo': 1, 'interface': 1, 'as': 1, 'static': 1,
      'endswitch': 1, 'array': 1, 'null': 1, 'if': 1, 'endwhile': 1, 'or': 1,
      'const': 1, 'for': 1, 'endforeach': 1, 'self': 1, 'var': 1, 'while': 1,
      'isset': 1, 'public': 1, 'protected': 1, 'exit': 1, 'foreach': 1,
      'throw': 1, 'elseif': 1, 'extends': 1, 'include': 1, '__FILE__': 1,
      'empty': 1, 'require_once': 1, 'function': 1, 'do': 1, 'xor': 1,
      'return': 1, 'implements': 1, 'parent': 1, 'clone': 1, 'use': 1,
      '__CLASS__': 1, '__LINE__': 1, 'else': 1, 'break': 1, 'print': 1,
      'eval': 1, 'new': 1, 'catch': 1, '__METHOD__': 1, 'class': 1, 'case': 1,
      'exception': 1, 'php_user_filter': 1, 'default': 1, 'die': 1,
      'require': 1, '__FUNCTION__': 1, 'enddeclare': 1, 'final': 1, 'try': 1,
      'this': 1, 'switch': 1, 'continue': 1, 'endfor': 1, 'endif': 1,
      'declare': 1, 'unset': 1, 'true': 1, 'false': 1, 'namespace': 1
    }
  },
  case_insensitive: true,
  modes: [
    hljs.C_LINE_COMMENT_MODE,
    hljs.HASH_COMMENT_MODE,
    {
      className: 'comment',
      begin: '/\\*', end: '\\*/',
      contains: [{
          className: 'phpdoc',
          begin: '\\s@[A-Za-z]+', end: hljs.IMMEDIATE_RE,
          relevance: 10
      }]
    },
    hljs.C_NUMBER_MODE,
    {
      className: 'string',
      begin: '\'', end: '\'',
      contains: ['escape'],
      relevance: 0
    },
    {
      className: 'string',
      begin: '"', end: '"',
      contains: ['escape'],
      relevance: 0
    },
    hljs.BACKSLASH_ESCAPE,
    {
      className: 'variable',
      begin: '\\$[a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*', end: hljs.IMMEDIATE_RE
    },
    {
      className: 'preprocessor',
      begin: '<\\?php', end: hljs.IMMEDIATE_RE,
      relevance: 10
    },
    {
      className: 'preprocessor',
      begin: '\\?>', end: hljs.IMMEDIATE_RE
    }
  ]
};
/*
Language: Python
*/

hljs.LANGUAGES.python = {
  defaultMode: {
    lexems: [hljs.UNDERSCORE_IDENT_RE],
    illegal: '(</|->|\\?)',
    contains: ['comment', 'string', 'function', 'class', 'number', 'decorator'],
    keywords: {
      'keyword': {'and': 1, 'elif': 1, 'is': 1, 'global': 1, 'as': 1, 'in': 1, 'if': 1, 'from': 1, 'raise': 1, 'for': 1, 'except': 1, 'finally': 1, 'print': 1, 'import': 1, 'pass': 1, 'return': 1, 'exec': 1, 'else': 1, 'break': 1, 'not': 1, 'with': 1, 'class': 1, 'assert': 1, 'yield': 1, 'try': 1, 'while': 1, 'continue': 1, 'del': 1, 'or': 1, 'def': 1, 'lambda': 1, 'nonlocal': 10},
      'built_in': {'None': 1, 'True': 1, 'False': 1, 'Ellipsis': 1, 'NotImplemented': 1}
    }
  },
  modes: [
    {
      className: 'function',
      lexems: [hljs.UNDERSCORE_IDENT_RE],
      begin: '\\bdef ', end: ':',
      illegal: '$',
      keywords: {'def': 1},
      contains: ['title', 'params'],
      relevance: 10
    },
    {
      className: 'class',
      lexems: [hljs.UNDERSCORE_IDENT_RE],
      begin: '\\bclass ', end: ':',
      illegal: '[${]',
      keywords: {'class': 1},
      contains: ['title', 'params'],
      relevance: 10
    },
    {
      className: 'title',
      begin: hljs.UNDERSCORE_IDENT_RE, end: hljs.IMMEDIATE_RE
    },
    {
      className: 'params',
      begin: '\\(', end: '\\)',
      contains: ['string']
    },
    hljs.HASH_COMMENT_MODE,
    hljs.C_NUMBER_MODE,
    {
      className: 'string',
      begin: 'u?r?\'\'\'', end: '\'\'\'',
      relevance: 10
    },
    {
      className: 'string',
      begin: 'u?r?"""', end: '"""',
      relevance: 10
    },
    hljs.APOS_STRING_MODE,
    hljs.QUOTE_STRING_MODE,
    hljs.BACKSLASH_ESCAPE,
    {
      className: 'string',
      begin: '(u|r|ur)\'', end: '\'',
      contains: ['escape'],
      relevance: 10
    },
    {
      className: 'string',
      begin: '(u|r|ur)"', end: '"',
      contains: ['escape'],
      relevance: 10
    },
    {
      className: 'decorator',
      begin: '@', end: '$'
    }
  ]
};
/*
Language: Ruby
Author: Anton Kovalyov <anton@kovalyov.net>
Contributors: Peter Leonov <gojpeg@yandex.ru>, Vasily Polovnyov <vast@whiteants.net>, Loren Segal <lsegal@soen.ca>
*/

hljs.LANGUAGES.ruby = function(){
  var RUBY_IDENT_RE = '[a-zA-Z_][a-zA-Z0-9_]*(\\!|\\?)?';
  var RUBY_METHOD_RE = '[a-zA-Z_]\\w*[!?=]?|[-+~]\\@|<<|>>|=~|===?|<=>|[<>]=?|\\*\\*|[-/+%^&*~`|]|\\[\\]=?';
  var RUBY_DEFAULT_CONTAINS = ['comment', 'string', 'char', 'class', 'function', 'constant', 'symbol', 'number', 'variable', 'identifier', 'regexp_container']
  var RUBY_KEYWORDS = {
    'keyword': {'and': 1, 'false': 1, 'then': 1, 'defined': 1, 'module': 1, 'in': 1, 'return': 1, 'redo': 1, 'if': 1, 'BEGIN': 1, 'retry': 1, 'end': 1, 'for': 1, 'true': 1, 'self': 1, 'when': 1, 'next': 1, 'until': 1, 'do': 1, 'begin': 1, 'unless': 1, 'END': 1, 'rescue': 1, 'nil': 1, 'else': 1, 'break': 1, 'undef': 1, 'not': 1, 'super': 1, 'class': 1, 'case': 1, 'require': 1, 'yield': 1, 'alias': 1, 'while': 1, 'ensure': 1, 'elsif': 1, 'or': 1, 'def': 1},
    'keymethods': {'__id__': 1, '__send__': 1, 'abort': 1, 'abs': 1, 'all?': 1, 'allocate': 1, 'ancestors': 1, 'any?': 1, 'arity': 1, 'assoc': 1, 'at': 1, 'at_exit': 1, 'autoload': 1, 'autoload?': 1, 'between?': 1, 'binding': 1, 'binmode': 1, 'block_given?': 1, 'call': 1, 'callcc': 1, 'caller': 1, 'capitalize': 1, 'capitalize!': 1, 'casecmp': 1, 'catch': 1, 'ceil': 1, 'center': 1, 'chomp': 1, 'chomp!': 1, 'chop': 1, 'chop!': 1, 'chr': 1, 'class': 1, 'class_eval': 1, 'class_variable_defined?': 1, 'class_variables': 1, 'clear': 1, 'clone': 1, 'close': 1, 'close_read': 1, 'close_write': 1, 'closed?': 1, 'coerce': 1, 'collect': 1, 'collect!': 1, 'compact': 1, 'compact!': 1, 'concat': 1, 'const_defined?': 1, 'const_get': 1, 'const_missing': 1, 'const_set': 1, 'constants': 1, 'count': 1, 'crypt': 1, 'default': 1, 'default_proc': 1, 'delete': 1, 'delete!': 1, 'delete_at': 1, 'delete_if': 1, 'detect': 1, 'display': 1, 'div': 1, 'divmod': 1, 'downcase': 1, 'downcase!': 1, 'downto': 1, 'dump': 1, 'dup': 1, 'each': 1, 'each_byte': 1, 'each_index': 1, 'each_key': 1, 'each_line': 1, 'each_pair': 1, 'each_value': 1, 'each_with_index': 1, 'empty?': 1, 'entries': 1, 'eof': 1, 'eof?': 1, 'eql?': 1, 'equal?': 1, 'eval': 1, 'exec': 1, 'exit': 1, 'exit!': 1, 'extend': 1, 'fail': 1, 'fcntl': 1, 'fetch': 1, 'fileno': 1, 'fill': 1, 'find': 1, 'find_all': 1, 'first': 1, 'flatten': 1, 'flatten!': 1, 'floor': 1, 'flush': 1, 'for_fd': 1, 'foreach': 1, 'fork': 1, 'format': 1, 'freeze': 1, 'frozen?': 1, 'fsync': 1, 'getc': 1, 'gets': 1, 'global_variables': 1, 'grep': 1, 'gsub': 1, 'gsub!': 1, 'has_key?': 1, 'has_value?': 1, 'hash': 1, 'hex': 1, 'id': 1, 'include': 1, 'include?': 1, 'included_modules': 1, 'index': 1, 'indexes': 1, 'indices': 1, 'induced_from': 1, 'inject': 1, 'insert': 1, 'inspect': 1, 'instance_eval': 1, 'instance_method': 1, 'instance_methods': 1, 'instance_of?': 1, 'instance_variable_defined?': 1, 'instance_variable_get': 1, 'instance_variable_set': 1, 'instance_variables': 1, 'integer?': 1, 'intern': 1, 'invert': 1, 'ioctl': 1, 'is_a?': 1, 'isatty': 1, 'iterator?': 1, 'join': 1, 'key?': 1, 'keys': 1, 'kind_of?': 1, 'lambda': 1, 'last': 1, 'length': 1, 'lineno': 1, 'ljust': 1, 'load': 1, 'local_variables': 1, 'loop': 1, 'lstrip': 1, 'lstrip!': 1, 'map': 1, 'map!': 1, 'match': 1, 'max': 1, 'member?': 1, 'merge': 1, 'merge!': 1, 'method': 1, 'method_defined?': 1, 'method_missing': 1, 'methods': 1, 'min': 1, 'module_eval': 1, 'modulo': 1, 'name': 1, 'nesting': 1, 'new': 1, 'next': 1, 'next!': 1, 'nil?': 1, 'nitems': 1, 'nonzero?': 1, 'object_id': 1, 'oct': 1, 'open': 1, 'pack': 1, 'partition': 1, 'pid': 1, 'pipe': 1, 'pop': 1, 'popen': 1, 'pos': 1, 'prec': 1, 'prec_f': 1, 'prec_i': 1, 'print': 1, 'printf': 1, 'private_class_method': 1, 'private_instance_methods': 1, 'private_method_defined?': 1, 'private_methods': 1, 'proc': 1, 'protected_instance_methods': 1, 'protected_method_defined?': 1, 'protected_methods': 1, 'public_class_method': 1, 'public_instance_methods': 1, 'public_method_defined?': 1, 'public_methods': 1, 'push': 1, 'putc': 1, 'puts': 1, 'quo': 1, 'raise': 1, 'rand': 1, 'rassoc': 1, 'read': 1, 'read_nonblock': 1, 'readchar': 1, 'readline': 1, 'readlines': 1, 'readpartial': 1, 'rehash': 1, 'reject': 1, 'reject!': 1, 'remainder': 1, 'reopen': 1, 'replace': 1, 'require': 1, 'respond_to?': 1, 'reverse': 1, 'reverse!': 1, 'reverse_each': 1, 'rewind': 1, 'rindex': 1, 'rjust': 1, 'round': 1, 'rstrip': 1, 'rstrip!': 1, 'scan': 1, 'seek': 1, 'select': 1, 'send': 1, 'set_trace_func': 1, 'shift': 1, 'singleton_method_added': 1, 'singleton_methods': 1, 'size': 1, 'sleep': 1, 'slice': 1, 'slice!': 1, 'sort': 1, 'sort!': 1, 'sort_by': 1, 'split': 1, 'sprintf': 1, 'squeeze': 1, 'squeeze!': 1, 'srand': 1, 'stat': 1, 'step': 1, 'store': 1, 'strip': 1, 'strip!': 1, 'sub': 1, 'sub!': 1, 'succ': 1, 'succ!': 1, 'sum': 1, 'superclass': 1, 'swapcase': 1, 'swapcase!': 1, 'sync': 1, 'syscall': 1, 'sysopen': 1, 'sysread': 1, 'sysseek': 1, 'system': 1, 'syswrite': 1, 'taint': 1, 'tainted?': 1, 'tell': 1, 'test': 1, 'throw': 1, 'times': 1, 'to_a': 1, 'to_ary': 1, 'to_f': 1, 'to_hash': 1, 'to_i': 1, 'to_int': 1, 'to_io': 1, 'to_proc': 1, 'to_s': 1, 'to_str': 1, 'to_sym': 1, 'tr': 1, 'tr!': 1, 'tr_s': 1, 'tr_s!': 1, 'trace_var': 1, 'transpose': 1, 'trap': 1, 'truncate': 1, 'tty?': 1, 'type': 1, 'ungetc': 1, 'uniq': 1, 'uniq!': 1, 'unpack': 1, 'unshift': 1, 'untaint': 1, 'untrace_var': 1, 'upcase': 1, 'upcase!': 1, 'update': 1, 'upto': 1, 'value?': 1, 'values': 1, 'values_at': 1, 'warn': 1, 'write': 1, 'write_nonblock': 1, 'zero?': 1, 'zip': 1}
  }
  return {
    defaultMode: {
      lexems: [RUBY_IDENT_RE],
      contains: RUBY_DEFAULT_CONTAINS,
      keywords: RUBY_KEYWORDS
    },
    modes: [
      {
        className: 'comment',
        begin: '#', end: '$',
        contains: ['yardoctag']
      },
      {
        className: 'comment',
        begin: '^\\=begin', end: '^\\=end',
        contains: ['yardoctag'],
        relevance: 10
      },
      {
        className: 'comment',
        begin: '^__END__', end: '\\n$'
      },
      {
        className: 'yardoctag',
        begin: '@[A-Za-z]+', end: hljs.IMMEDIATE_RE
      },
      {
        className: 'function',
        begin: '\\bdef\\s+', end: ' |$|;',
        lexems: [RUBY_IDENT_RE],
        keywords: RUBY_KEYWORDS,
        contains: [
          {
            className: 'ftitle', displayClassName: 'title',
            begin: RUBY_METHOD_RE, end: hljs.IMMEDIATE_RE,
            lexems: [RUBY_IDENT_RE],
            keywords: RUBY_KEYWORDS
          },
          {
            className: 'params',
            begin: '\\(', end: '\\)',
            lexems: [RUBY_IDENT_RE],
            keywords: RUBY_KEYWORDS,
            contains: RUBY_DEFAULT_CONTAINS
          },
          'comment'
        ]
      },
      {
        className: 'class',
        begin: '\\b(class|module)\\b', end: '$|;',
        lexems: [hljs.UNDERSCORE_IDENT_RE],
        keywords: RUBY_KEYWORDS,
        contains: [
          {
            className: 'title',
            begin: '[A-Za-z_]\\w*(::\\w+)*(\\?|\\!)?', end: hljs.IMMEDIATE_RE,
            relevance: 0
          },
          {
            className: 'inheritance',
            begin: '<\\s*', end: hljs.IMMEDIATE_RE,
            contains: [{
              className: 'parent',
              begin: '(' + hljs.IDENT_RE + '::)?' + hljs.IDENT_RE, end: hljs.IMMEDIATE_RE
            }]
          },
          'comment'
        ],
        keywords: {'class': 1, 'module': 1}
      },
      {
        className: 'number',
        begin: '(\\b0[0-7_]+)|(\\b0x[0-9a-fA-F_]+)|(\\b[1-9][0-9_]*(\\.[0-9_]+)?)|[0_]\\b', end: hljs.IMMEDIATE_RE,
        relevance: 0
      },
      {
        className: 'number',
        begin: '\\?\\w', end: hljs.IMMEDIATE_RE
      },
      {
        className: 'string',
        begin: '\'', end: '\'',
        contains: ['escape', 'subst'],
        relevance: 0
      },
      {
        className: 'string',
        begin: '"', end: '"',
        contains: ['escape', 'subst'],
        relevance: 0
      },
      {
        className: 'string',
        begin: '%[qw]?\\(', end: '\\)',
        contains: ['escape', 'subst'],
        relevance: 10
      },
      {
        className: 'string',
        begin: '%[qw]?\\[', end: '\\]',
        contains: ['escape', 'subst'],
        relevance: 10
      },
      {
        className: 'string',
        begin: '%[qw]?{', end: '}',
        contains: ['escape', 'subst'],
        relevance: 10
      },
      {
        className: 'string',
        begin: '%[qw]?<', end: '>',
        contains: ['escape', 'subst'],
        relevance: 10
      },
      {
        className: 'string',
        begin: '%[qw]?/', end: '/',
        contains: ['escape', 'subst'],
        relevance: 10
      },
      {
        className: 'string',
        begin: '%[qw]?%', end: '%',
        contains: ['escape', 'subst'],
        relevance: 10
      },
      {
        className: 'string',
        begin: '%[qw]?-', end: '-',
        contains: ['escape', 'subst'],
        relevance: 10
      },
      {
        className: 'string',
        begin: '%[qw]?\\|', end: '\\|',
        contains: ['escape', 'subst'],
        relevance: 10
      },
      {
        className: 'constant',
        begin: '(::)?([A-Z]\\w*(::)?)+', end: hljs.IMMEDIATE_RE,
        relevance: 0
      },
      {
        className: 'symbol',
        begin: ':', end: hljs.IMMEDIATE_RE,
        contains: ['string', 'identifier']
      },
      {
        className: 'identifier',
        begin: RUBY_IDENT_RE, end: hljs.IMMEDIATE_RE,
        lexems: [RUBY_IDENT_RE],
        keywords: RUBY_KEYWORDS,
        relevance: 0
      },
      hljs.BACKSLASH_ESCAPE,
      {
        className: 'subst',
        begin: '#\\{', end: '}',
        lexems: [RUBY_IDENT_RE],
        keywords: RUBY_KEYWORDS,
        contains: RUBY_DEFAULT_CONTAINS
      },
      {
        className: 'regexp_container',
        begin: '(' + hljs.RE_STARTERS_RE + ')\\s*', end: hljs.IMMEDIATE_RE, noMarkup: true,
        contains: ['comment', 'regexp'],
        relevance: 0
      },
      {
        className: 'regexp',
        begin: '/', end: '/[a-z]*',
        illegal: '\\n',
        contains: ['escape']
      },
      {
        className: 'variable',
        begin: '(\\$\\W)|((\\$|\\@\\@?)(\\w+))', end: hljs.IMMEDIATE_RE
      }
    ]
  };
}();
/*
Language: Scala
Author: Jan Berkel <jan.berkel@gmail.com>
*/

hljs.LANGUAGES.scala  = {
  defaultMode: {
    lexems: [hljs.UNDERSCORE_IDENT_RE],
    contains: ['javadoc', 'comment', 'string', 'class', 'number', 'annotation'],
    keywords: { 'type': 1, 'yield': 1, 'lazy': 1, 'override': 1, 'def': 1, 'with': 1, 'val':1, 'var': 1, 'false': 1, 'true': 1, 'sealed': 1, 'abstract': 1, 'private': 1, 'trait': 1,  'object': 1, 'null': 1, 'if': 1, 'for': 1, 'while': 1, 'throw': 1, 'finally': 1, 'protected': 1, 'extends': 1, 'import': 1, 'final': 1, 'return': 1, 'else': 1, 'break': 1, 'new': 1, 'catch': 1, 'super': 1, 'class': 1, 'case': 1,'package': 1, 'default': 1, 'try': 1, 'this': 1, 'match': 1, 'continue': 1, 'throws': 1}
  },
  modes: [
    {
      className: 'class',
      lexems: [hljs.UNDERSCORE_IDENT_RE],
      begin: '((case )?class |object |trait )', end: '({|$)',
      illegal: ':',
      keywords: {'case' : 1, 'class': 1, 'trait': 1, 'object': 1},
      contains: [
        {
          begin: '(extends|with)', end: hljs.IMMEDIATE_RE,
          lexems: [hljs.IDENT_RE],
          keywords: {'extends': 1, 'with': 1},
          relevance: 10
        },
        {
          className: 'title',
          begin: hljs.UNDERSCORE_IDENT_RE, end: hljs.IMMEDIATE_RE
        },
        {
          className: 'params',
          begin: '\\(', end: '\\)',
          contains: ['string', 'annotation']
        }
      ]
    },
    hljs.C_NUMBER_MODE,
    hljs.APOS_STRING_MODE,
    hljs.QUOTE_STRING_MODE,
    hljs.BACKSLASH_ESCAPE,
    hljs.C_LINE_COMMENT_MODE,
    {
      className: 'javadoc',
      begin: '/\\*\\*', end: '\\*/',
      contains: [{
        className: 'javadoctag',
        begin: '@[A-Za-z]+', end: hljs.IMMEDIATE_RE
      }],
      relevance: 10
    },
    hljs.C_BLOCK_COMMENT_MODE,
    {
      className: 'annotation',
      begin: '@[A-Za-z]+', end: hljs.IMMEDIATE_RE
    },
    {
      className: 'string',
      begin: 'u?r?"""', end: '"""',
      relevance: 10
    }
  ]
};
/*
Language: SQL
*/

hljs.LANGUAGES.sql =
{
  case_insensitive: true,
  defaultMode:
  {
    contains: ['operator', 'comment'],
    illegal: '[^\\s]'
  },

  modes: [
    {
      className: 'operator',
      begin: '(begin|start|commit|rollback|savepoint|lock|alter|create|drop|rename|call|delete|do|handler|insert|load|replace|select|truncate|update|set|show|pragma)\\b', end: ';|$',
      contains: [
        'string',
        'number',
        {begin: '\\n', end: hljs.IMMEDIATE_RE}
      ],
      lexems: ['[a-zA-Z][a-zA-Z0-9_\\.]*'],
      keywords: {
        'keyword': {
          'all': 1, 'partial': 1, 'global': 1, 'month': 1,
          'current_timestamp': 1, 'using': 1, 'go': 1, 'revoke': 1,
          'smallint': 1, 'indicator': 1, 'end-exec': 1, 'disconnect': 1,
          'zone': 1, 'with': 1, 'character': 1, 'assertion': 1, 'to': 1,
          'add': 1, 'current_user': 1, 'usage': 1, 'input': 1, 'local': 1,
          'alter': 1, 'match': 1, 'collate': 1, 'real': 1, 'then': 1,
          'rollback': 1, 'get': 1, 'read': 1, 'timestamp': 1,
          'session_user': 1, 'not': 1, 'integer': 1, 'bit': 1, 'unique': 1,
          'day': 1, 'minute': 1, 'desc': 1, 'insert': 1, 'execute': 1,
          'like': 1, 'ilike': 2, 'level': 1, 'decimal': 1, 'drop': 1,
          'continue': 1, 'isolation': 1, 'found': 1, 'where': 1,
          'constraints': 1, 'domain': 1, 'right': 1, 'national': 1, 'some': 1,
          'module': 1, 'transaction': 1, 'relative': 1, 'second': 1,
          'connect': 1, 'escape': 1, 'close': 1, 'system_user': 1, 'for': 1,
          'deferred': 1, 'section': 1, 'cast': 1, 'current': 1, 'sqlstate': 1,
          'allocate': 1, 'intersect': 1, 'deallocate': 1, 'numeric': 1,
          'public': 1, 'preserve': 1, 'full': 1, 'goto': 1, 'initially': 1,
          'asc': 1, 'no': 1, 'key': 1, 'output': 1, 'collation': 1, 'group': 1,
          'by': 1, 'union': 1, 'session': 1, 'both': 1, 'last': 1,
          'language': 1, 'constraint': 1, 'column': 1, 'of': 1, 'space': 1,
          'foreign': 1, 'deferrable': 1, 'prior': 1, 'connection': 1,
          'unknown': 1, 'action': 1, 'commit': 1, 'view': 1, 'or': 1,
          'first': 1, 'into': 1, 'float': 1, 'year': 1, 'primary': 1,
          'cascaded': 1, 'except': 1, 'restrict': 1, 'set': 1, 'references': 1,
          'names': 1, 'table': 1, 'outer': 1, 'open': 1, 'select': 1,
          'size': 1, 'are': 1, 'rows': 1, 'from': 1, 'prepare': 1,
          'distinct': 1, 'leading': 1, 'create': 1, 'only': 1, 'next': 1,
          'inner': 1, 'authorization': 1, 'schema': 1, 'corresponding': 1,
          'option': 1, 'declare': 1, 'precision': 1, 'immediate': 1, 'else': 1,
          'timezone_minute': 1, 'external': 1, 'varying': 1, 'translation': 1,
          'true': 1, 'case': 1, 'exception': 1, 'join': 1, 'hour': 1,
          'default': 1, 'double': 1, 'scroll': 1, 'value': 1, 'cursor': 1,
          'descriptor': 1, 'values': 1, 'dec': 1, 'fetch': 1, 'procedure': 1,
          'delete': 1, 'and': 1, 'false': 1, 'int': 1, 'is': 1, 'describe': 1,
          'char': 1, 'as': 1, 'at': 1, 'in': 1, 'varchar': 1, 'null': 1,
          'trailing': 1, 'any': 1, 'absolute': 1, 'current_time': 1, 'end': 1,
          'grant': 1, 'privileges': 1, 'when': 1, 'cross': 1, 'check': 1,
          'write': 1, 'current_date': 1, 'pad': 1, 'begin': 1, 'temporary': 1,
          'exec': 1, 'time': 1, 'update': 1, 'catalog': 1, 'user': 1, 'sql': 1,
          'date': 1, 'on': 1, 'identity': 1, 'timezone_hour': 1, 'natural': 1,
          'whenever': 1, 'interval': 1, 'work': 1, 'order': 1, 'cascade': 1,
          'diagnostics': 1, 'nchar': 1, 'having': 1, 'left': 1, 'call': 1,
          'do': 1, 'handler': 1, 'load': 1, 'replace': 1, 'truncate': 1,
          'start': 1, 'lock': 1, 'show': 1, 'pragma': 1},
        'aggregate': {'count': 1, 'sum': 1, 'min': 1, 'max': 1, 'avg': 1}
      }
    },
    hljs.C_NUMBER_MODE,
    hljs.C_BLOCK_COMMENT_MODE,
    {
      className: 'comment',
      begin: '--', end: '$'
    },
    {
      className: 'string',
      begin: '\'', end: '\'',
      contains: ['escape', {begin: '\'\'', end: hljs.IMMEDIATE_RE}],
      relevance: 0
    },
    {
      className: 'string',
      begin: '"', end: '"',
      contains: ['escape', {begin: '""', end: hljs.IMMEDIATE_RE}],
      relevance: 0
    },
    {
      className: 'string',
      begin: '`', end: '`',
      contains: ['escape']
    },
    hljs.BACKSLASH_ESCAPE
  ]
};
/*
Language: TeX
Author: Vladimir Moskva <vladmos@gmail.com>
Website: http://fulc.ru/
*/

hljs.LANGUAGES.tex = {
  defaultMode: {
    contains: ['parameter', 'command', 'special', 'formula', 'comment']
  },
  modes: [
    {
      className: 'parameter',
      begin: '\\\\[a-zA-Zа-яА-я]+[\\*]? *= *-?\\d*\\.?\\d+(pt|pc|mm|cm|in|dd|cc|ex|em)?', end: hljs.IMMEDIATE_RE,
      returnBegin: true,
      contains: ['command', 'number'],
      noMarkup: true,
      relevance: 10
    },
    {
      className: 'command',
      begin: '\\\\[a-zA-Zа-яА-я]+[\\*]?', end: hljs.IMMEDIATE_RE,
      relevance: 10
    },
    {
      className: 'command',
      begin: '\\\\[^a-zA-Zа-яА-я0-9]', end: hljs.IMMEDIATE_RE,
      relevance: 0
    },
    {
      className: 'comment',
      begin: '%', end: '$',
      relevance: 0
    },
    {
      className: 'special',
      begin: '[{}\\[\\]\\&#~]', end: hljs.IMMEDIATE_RE,
      relevance: 0
    },
    {
      className: 'formula',
      begin: '\\$\\$', end: '\\$\\$',
      contains: ['command', 'special'],
      relevance: 0
    },
    {
      className: 'formula',
      begin: '\\$', end: '\\$',
      contains: ['command', 'special'],
      relevance: 0
    },
    {
      className: 'number',
      begin: ' *=', end: '-?\\d*\\.?\\d+(pt|pc|mm|cm|in|dd|cc|ex|em)?',
      excludeBegin: true
    }
  ]
};
