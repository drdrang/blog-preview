This is unlikely to be of use to anyone other than me, but…

I wanted a TextMate command that would generate a local preview of my blog posts that matched the look of the published posts. I write my posts in a variant of Markdown and use some JavaScript to further reformat some of the content (equations, numbered lines of code, and footnotes). The `post-preview.py` script converts the Markdown to an HTML fragment, wraps that fragment in boilerplate HTML that references the necessary JavaScript and style files, and saves the result to a file, `post-preview.html`, on my Desktop. The TextMate command I use to preview my posts is this addition to the Blogging Bundle, called Good Preview:

<img src="http://www.leancrew.com/all-this/images2010/good-preview-tm.png" />

The two lines of code are

    ~/blog-preview/post-preview.py
    open ~/Desktop/post-preview.html

The first line runs the `post-preview.py` script, creating or overwriting the `post-preview.html` file. The second line opens `post-preview.html` in my default browser. In addition to writing a file on the Desktop, `post-preview.py` writes "Done" to standard output, which Good Preview shows as a tooltip when the command finishes successfully. The Good Preview TextMate command is not included in the repository, which is why I've reproduced it here.

I deleted the original Preview command from the Blogging bundle and removed the ⌃⌥⌘P Key Equivalent from the Preview commands in the Markdown bundle. It might have been smarter to use a different key combination for Good Preview and preserve ⌃⌥⌘P for the standard behavior.
