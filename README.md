Qahiri is a [Kufic][1] typeface based on the modernized and regularized old
manuscript Kufic calligraphy style of the late master of Arabic calligraphy
[Mohammad Abdul Qadir][2].

Following the convention of naming Kufic styles after the cities they appeared
in, Qahiri (قاهری) is named after the city of Cairo, Egypt (القاهرة).

Download
--------

The latest version of the font can be downloaded from the [releases][3] page.

The app
-------

The font provides many alternate shapes for many of its glyphs, which should be
usable in any OpenType-savvy application. But since many apps have poor
OpenType support, or bad UI, or don’t allow controlling features for single
glyphs, Qahiri comes with a web application that provides easy access to glyph
alternates.

Visit the app [web page][4] and type Arabic in the text area. Below the text
will appear the alternates of the character before the text cursor (the gray
bar). Clicking on an alternate form will cause it to be used instead of the
current form:

![Screen shot of the app](assets/images/screenshot.png)

The slider and the input box next to it control the text size.

There are two buttons that control the dots, the ![remove
dots](app/assets/images/remove-dots.svg) button will remove all the dots, to
get a dot-less version of the text resembling early Kufic manuscripts.

![Screenshot with no dots](assets/images/screenshot-dotless.png)

The ![rounded dots](app/assets/images/round-dots.svg) button, on the other
hand, replaces the default rectangular dots with more familiar rounded dots.

![Screenshot with rounded dots](assets/images/screenshot-rounded-dots.png)

The app allows exporting SVG file that can be further modified in any vector
graphics application. Pressing ![export](app/assets/images/export.svg) button
will download the SVG.

The current text with the selected alternates can be saved by pressing the
![save](app/assets/images/save.svg) button, and can be loaded again any time in
the app using the ![open](app/assets/images/open.svg) button.

Pressing the ![clear](app/assets/images/clear.svg) button will delete all the
text.


[1]: https://en.wikipedia.org/wiki/Kufic
[2]: https://ar.wikipedia.org/wiki/محمد_عبد_القادر_عبد_الله_(خطاط)
[3]: https://github.com/alif-type/qahiri/releases/latest
[4]: https://alif-type.github.io/qahiri/app/
