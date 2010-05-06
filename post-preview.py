#!/usr/bin/python

from sys import stdin
from subprocess import *
from os.path import expanduser

# Customize these paths as needed.
page = expanduser('~/blog-preview/post-preview.html')
markdown = expanduser('~/bin/mmmd')
smartypants = expanduser('~/bin/SmartyPants')
style = expanduser('~/blog-preview/style.css')
styleLineNumbers = expanduser('~/blog-preview/styleLineNumbers.js')
footnotePopup = expanduser('~/blog-preview/footnote-popup.js')
jsMath = expanduser('~/Library/JavaScript/jsMath/easy/load.js')

# Read in the post and split into header and body.
full = stdin.read()
parts = full.split('\n\n', 1)

# Extract the title from the header.
def isTitle (s):
  return s[0:5] == 'Title'

titleHeader = filter(isTitle, parts[0].splitlines())[0]
title = titleHeader.split(':')[1].strip()

# Convert the body to HTML and smarten up the quotes.
article = Popen([markdown], stdin=PIPE, stdout=PIPE).communicate(input=parts[1])[0]
article = Popen([smartypants], stdin=PIPE, stdout=PIPE).communicate(input=article)[0]

# Save the HTML for the full page to the specified file.
html =  '''<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN"
   "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html>
<head>
   <title>Preview - %s</title>
	 <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
   <link rel="stylesheet" type="text/css" media="all" href="%s" />
   <script type="text/javascript" src="http://ajax.googleapis.com/ajax/libs/jquery/1.4.2/jquery.min.js"></script>
   <script type="text/javascript" src="%s"></script>
   <script type="text/javascript" src="%s"></script>
   <script type="text/javascript" src="%s"></script>
</head>
<body onload="styleLN()">
   <div id="container">
      <div id="header">
         <h1>And now it's all this</h1>
         <h2>I just said what I said and it was wrong. Or was taken wrong.</h2>
      </div> <!-- header -->
      <div id="sidebar">
      </div> <!-- sidebar -->
      
      <div id="content">
        <h1>%s</h1>
        %s
      </div> <!-- note -->
    </div> <!-- container -->
  </body>
</html>''' % (title, style, styleLineNumbers, footnotePopup, jsMath, title, article)

open(page, 'w').write(html)
print "Done"
