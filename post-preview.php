<?php
$home = getenv("HOME");
require_once("$home/git/php-markdown-extra-math/markdown.php");
require_once("$home/git/php-smartypants/smartypants.php");
$full = stream_get_contents(STDIN);
$parts = preg_split("/\n\n/", $full, 2);
$header_lines = preg_split("/\n/", $parts[0]);
$title_lines = array_values(preg_grep("/^Title/", $header_lines));
$title_parts = preg_split("/: /", $title_lines[0]);
?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN"
   "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html>
<head>
  <title>Preview - <?php echo $title_parts[1] ?></title>
	<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <link rel="stylesheet" type="text/css" media="all" href="style.css" />
  <script type="text/javascript" src="<?php echo "$home/Library/JavaScript/MathJax/MathJax.js" ?>"></script>
  <script type="text/javascript" src="styleLineNumbers.js"></script>
  <script type="text/javascript" src="jquery-1.4.2.min.js"></script>
  <script type="text/javascript" src="footnote-popup.js"></script>
</head>
<body onload="styleLN()">
   <div id="container">
      <div id="header">
         <h1>And now it's all this</h1>
         <h2>I just said what I said and it was wrong. Or was taken wrong.</h2>
      </div> <!-- header -->
      
      <div id="content">
        <h1><?php echo $title_parts[1] ?></h1>
        <?php echo SmartyPants(Markdown($parts[1])) ?>
      </div> <!-- content -->
      
      <div id="sidebar">
       </div> <!-- sidebar -->
       
      <div id="footer">
      </div> <!-- footer -->
    </div> <!-- container -->
    
  </body>
</html>

