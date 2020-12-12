_Qahiri_ is a [Kufic][1] typeface based on the modernized and regularized old
manuscript Kufic calligraphy style of the late master of Arabic calligraphy
[_Mohammad Abdul Qadir_][2].

Following the convention of naming Kufic styles after the cities they appeared
in, _Qahiri_ (قاهري) is named after the city of Cairo, Egypt (القاهرة).

_Qahiri_ is a free and open source project, any one is welcomed to use and
modify it under the terms of the [version 1.1 of SIL Open Font License][5].

## The app
The font provides many alternate shapes for many of its glyphs, which should be
usable in any OpenType-savvy application. But since many apps have poor
OpenType support, or bad UI, or don’t allow controlling features for single
glyphs, _Qahiri_ comes with a web application that provides easy access to glyph
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

### Installing on mobile devices
The application works also offline, and supports mobile browsers and small
screens. It is also possible to add the application to the home screen for
quick access without opining the browser.

On Android devices, open the [application web page][4] in _Google Chrome_ and
go to the menu, click on __Add to Home screen__ and you will be prompted to add
the application to your home screen:

![Installing on Android](./assets/images/install-android-1-en.png#install)
![Installing on Android](./assets/images/install-android-2-en.png#install)

On iOS devices, open the [application web page][4] in _Safari_, click on the
download icon, then on __Add to Home Screen__ and you will be prompted to add
the application to your home screen:

![Installing on iOS](./assets/images/install-ios-1-en.png#install)
![Installing on iOS](./assets/images/install-ios-2-en.png#install)

## Font features
The font tries to remain faithful to the rules laid out by _Mohammad
Abdul Qadir_, and one aspect of that is spacing. The space between letters,
connected or not, as well as between words is always about half the thickness
of vertical stems. There is distinction between inter-word and inter-letter
spacing. Inserting more than one space character will increase the inter-word
spacing.

![Screenshot showing spacing](assets/images/screenshot-spacing.png)

The letter-forms used by default are designed to work together in harmony, but
some of the alternate forms should be selected with care. For example,
_returning ya’_ can clash with preceding letters with descenders and should be
avoided in such cases. The font will try to solve clashes in such cases, but
this does not always work.

![Screenshot showing clashing letters](assets/images/screenshot-clash.png)

## Issues
The font is built using some advanced OpenType techniques that are not equally
supported by software, and this might result in the font being broken in
certain applications.

Performance of the application is also far from being optimal, so pasting large
amounts of text should be avoided. Also it does not support multiple line, it
works with one line at a time.

[1]: https://en.wikipedia.org/wiki/Kufic
[2]: https://ar.wikipedia.org/wiki/محمد_عبد_القادر_عبد_الله_(خطاط)
[3]: https://github.com/alif-type/qahiri/releases/latest
[4]: https://aliftype.com/qahiri/app/
[5]: https://github.com/alif-type/qahiri/blob/main/OFL.txt
