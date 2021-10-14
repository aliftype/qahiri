/*
 * Copyright (c) 2019-2021 Khaled Hosny
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 */

import { Font, Buffer } from "./HarfBuzz.js"
import { TAG } from "./OpenType.js"
import { FontRemapper, PUA_OFFSET } from "./FontRemapper.js"
import { SAMPLE_TEXT, STAORAGE_KEY } from "./Config.js"

class Layout {
  constructor(font, buffer, text) {
    this._font = font;
    this._buffer = buffer;
    this._text = text.map(c => ({...c}));

    this._adjustDots = false;
    this._removeDots = false;
    this._smallDots = false;
    this._roundDots = false;
    this._nocolorDots = false;
    this._onum = false;

    this._width = null;
    this._glyphs = null;

    this._imgs = [];

    this._margin = 500;
  }

  getWidth(from, to) {
    this._shape();

    if (from === undefined)
      from = this._text.length - 1;
    if (to === undefined)
      to = 0;
    from = this._text[from];
    to = this._text[to];
    return (from.x + from.ax) + (to.x + to.ax);
  }

  set adjustDots(v) {
    if (v != this._adjustDots)
      this._glyphs = null;
    this._adjustDots = v;
  }

  set removeDots(v) {
    if (v != this._removeDots)
      this._glyphs = null;
    this._removeDots = v;
  }

  set smallDots(v) {
    if (v != this._smallDots)
      this._glyphs = null;
    this._smallDots = v;
  }

  set roundDots(v) {
    if (v != this._roundDots)
      this._glyphs = null;
    this._roundDots = v;
  }

  set onum(v) {
    if (v != this._onum)
      this._glyphs = null;
    this._onum = v;
  }

  set nocolorDots(v) {
    this._nocolorDots = v;
  }

  get nocolorDots() {
    return this._nocolorDots;
  }

  get glyphs() {
    this._shape();
    return this._glyphs;
  }

  get width() {
    this._shape();
    return this._width + this._margin;
  }

  get height() { return this.ascender - this.descender + (this._margin * 2); }
  get baseline() { return this.ascender + this._margin; }
  get ascender() { return this._font.extents.ascender; }
  get descender() { return this._font.extents.descender; }
  get clipAscender() { return this._font.extents.clipAscender; }
  get clipDescender() { return this._font.extents.clipDescender; }
  get start() { return this._margin; }

  featuresOfIndex(index) {
    this._shape();
    let c = this._text[index];
    let p = this._text[index - 1];
    let n = this._text[index + 1];
    if (c && c.baseGlyph)
      return c.baseGlyph.getSubstitutes(n && n.baseGlyph);
  }

  posOfIndex(index) {
    let c = this._text[index];
    let x = c ? c.x : this._width;
    return x;
  }

  indexAtPoint(x) {
    this._shape();

    for (let i = 0; i < this._text.length; i++) {
      let c = this._text[i];
      let left = c.x;
      let right = c.x + c.ax;
      if (x > left && x < right)
        return i;
    }

    if (x < 0)
      return this._text.length;
    return 0;
  }

  getGlyphImg(glyph) {
    if (this._imgs[glyph] === undefined) {
      let extents = this._font.getGlyphExtents(glyph)
      let ns = "http://www.w3.org/2000/svg";
      let svg = document.createElementNS(ns, "svg");
      svg.setAttribute("xmlns", ns);
      svg.setAttributeNS(ns, "version", '1.1');
      svg.setAttributeNS(ns, "width", extents.width);
      svg.setAttributeNS(ns, "height", this.clipAscender + this.clipDescender);

      let x = -extents.x_bearing, y = this.ascender;
      let path = document.createElementNS(ns, "path");
      path.setAttributeNS(ns, "transform", `translate(${x},${y})`);
      path.setAttributeNS(ns, "d", this._font.getGlyphOutline(glyph));
      svg.appendChild(path);

      let blob = new Blob([svg.outerHTML], {type: "image/svg+xml"});
      let img = document.createElement('img');
      img.height = 70;
      img.src = window.URL.createObjectURL(blob)
      this._imgs[glyph] = img;
    }

    return this._imgs[glyph];
  }

  _shape() {
    if (this._glyphs !== null)
      return;

    let features = [];
    if (this._removeDots)
      features.push("ss01");

    if (this._smallDots || this._roundDots)
      features.push("ss02");

    if (this._onum)
      features.push("onum");

    // Shape once without features to get the base glyphs, which we use to get
    // list of glyph alternates.
    let glyphs = this._buffer.shape(this._font, this._text, false, features);
    for (const g of glyphs) {
      let c = this._text[g.cl];
      // HACK: this assumes when there are multiple glyphs in a cluster, the
      // last is the base one.
      //assert(!c.baseGlyph);
      c.baseGlyph = g;
    }

    for (let c of this._text) {
      c.x = Number.POSITIVE_INFINITY;
      c.ax = 0;
    }

    // Now do the real shaping with requested features.
    glyphs = this._buffer.shape(this._font, this._text, true, features);

    let x = this.start, y = this.baseline;
    let maxY = Number.NEGATIVE_INFINITY;
    this._width = 0;
    glyphs.forEach(g => {
      let c = this._text[g.cl];

      if (g.dy > 0 && g.isDot)
        maxY = Math.max(maxY, g.dy);

      g.x = x + g.dx;
      g.y = y - g.dy;
      x += g.ax;
      y -= g.ay;

      this._width += g.ax;

      c.x = Math.min(c.x, g.x);
      if (g.x + g.ax > c.x + c.ax)
        c.ax += (g.x + g.ax) - (c.x + c.ax)
    });

    glyphs.forEach(g => {
      if (g.isDot && this._adjustDots && g.dy > 0 && g.dy < maxY)
        g.y += g.dy - maxY;
    });

    this._glyphs = glyphs;
  }

  getSvg(text) {
    this._shape();

    let ns = "http://www.w3.org/2000/svg";
    let svg = document.createElementNS(ns, "svg");
    svg.setAttribute("xmlns", ns);
    svg.setAttributeNS(ns, "version", '1.1');
    svg.setAttributeNS(ns, "width", this.width);
    svg.setAttributeNS(ns, "height", this.height);
    svg.setAttributeNS(ns, "viewBox", `${this._margin/2} 0 ${this.width} ${this.height}`);

    for (const g of this._glyphs) {
      if (g.layers.length && !this._nocolorDots)
        for (const l of g.layers)
          this._appendPathElement(svg, l, g.isDot);
      else
        this._appendPathElement(svg, g, g.isDot);
    }

    svg.dataset.text = JSON.stringify(text);

    let blob = new Blob([svg.outerHTML], {type: "image/svg+xml"});
    return window.URL.createObjectURL(blob);
  }

  _appendPathElement(svg, g, isDot) {
    let fill = g.color && g.color.slice(0, -2);
    // Inkscape does not support RGBA colors, opacity must be set separately.
    let opacity = g.color && parseInt(g.color.slice(-2), 16) / 255;

    if (!g.index && !fill)
      fill = "red";

    let ns = svg.namespaceURI;
    let path = document.createElementNS(ns, "path");
    path.setAttributeNS(ns, "transform", `translate(${g.x},${g.y})`);
    if (fill)
      path.setAttributeNS(ns, "style", `fill:${fill};fill-opacity:${opacity}`);
    path.setAttributeNS(ns, "d", g.outline);
    svg.appendChild(path);
  }
}

export class View {
  constructor(blob) {
    this._font = new Font(blob, window.devicePixelRatio);
    this._buffer = new Buffer();

    this._blob = blob;

    this._fontFace = null;
    this._colorFontFace = null;

    this._canvas = document.getElementById("canvas");
    this._input = document.getElementById("hiddeninput");

    this._cursor = 0;
    this._text = null;
    this._layout = null;
    this._manualFontSize = false;

    this._canvas.addEventListener('click', e => this._click(e));
    this._canvas.addEventListener('focusin', e => this._input.focus({preventScroll: true}));

    this._input.addEventListener('keydown', e => this._keydown(e));
    this._input.addEventListener('input', e => this._keypress(e));
    this._input.addEventListener('focusout', e => this.update());

    document.addEventListener('paste', e => {
      if (document.activeElement === this._input)
        this._insert((e.clipboardData || window.clipboardData).getData('text'));
    });

    this._canvas.focus();
  }

  get fontFace() {
    if (this._layout.nocolorDots) {
      if (this._fontFace === null) {
        let remapper = new FontRemapper(this._blob, [TAG("COLR"), TAG("CPAL")]);
        this._fontFace = new FontFace("TextViewFont", remapper.remap());
      }
      return this._fontFace;
    } else {
      if (this._colorFontFace === null) {
        let remapper = new FontRemapper(this._blob);
        this._colorFontFace = new FontFace("ColorTextViewFont", remapper.remap());
      }
      return this._colorFontFace
    }
  };

  update(manualFontSize) {
    if (manualFontSize)
      this._manualFontSize = true;

    if (this._layout === null) {
      if (this._text === null)
        this._text = JSON.parse(window.localStorage.getItem(STAORAGE_KEY) || SAMPLE_TEXT);
      else
        window.localStorage.setItem(STAORAGE_KEY, JSON.stringify(this._text));

      this._layout = new Layout(this._font, this._buffer, this._text);
      this._updateInput();
    }

    let fontSize = document.getElementById("font-size");
    if (!this._manualFontSize) {
      if (window.screen.width < 700)
        fontSize.value = window.screen.width / 7;
      document.getElementById("font-size-number").value = fontSize.value;
    }

    this._layout.adjustDots = document.getElementById("adjust-dots").checked;
    this._layout.removeDots = document.getElementById("remove-dots").checked;
    this._layout.nocolorDots = document.getElementById("nocolor-dots").checked;
    this._layout.smallDots = document.getElementById("small-dots").checked;
    this._layout.roundDots = document.getElementById("round-dots").checked;
    this._layout.onum = document.getElementById("onum").checked;

    this._draw();
  }

  _invalidate() {
    this._layout = null;
    this._updateInput();
  }

  _draw() {
    let canvas = this._canvas;
    let fontSize = document.getElementById("font-size").value;
    let layout = this._layout;

    this._scale = fontSize / this._font.upem;

    canvas.width = layout.width * this._scale;
    canvas.height = layout.height * this._scale;
    canvas.style.width = `${canvas.width / window.devicePixelRatio}px`;
    canvas.style.height = `${canvas.height / window.devicePixelRatio}px`;

    let ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(this._scale, this._scale);

    // Draw cursor.
    if (document.hasFocus() && document.activeElement == this._input) {
      ctx.save();
      ctx.fillStyle = "#0000003f";
      let pos = layout.posOfIndex(this._cursor - 1);
      ctx.fillRect(pos, layout.baseline - layout.descender, 100, layout.descender - layout.ascender);
      ctx.restore();
    }

    this.fontFace.load().then(fontFace => {
      // Register the font.
      document.fonts.add(fontFace)

      // Setup context.
      ctx.font = this._font.upem * window.devicePixelRatio + "px " + fontFace.family;
      ctx.direction = "ltr";
      ctx.textAlign = "left";

      // Draw glyphs.
      const glyphs = layout.glyphs;
      glyphs.forEach(g => {
        if (g.index) {
          ctx.fillText(String.fromCodePoint(PUA_OFFSET + g.index), g.x, g.y);
        } else {
          ctx.save();
          ctx.fillStyle = "red";
          ctx.fillText(String.fromCodePoint(PUA_OFFSET + g.index), g.x, g.y);
          ctx.restore();
        }
      });
    });

  }

  open(file) {
    let input = document.createElement("input");
    input.type = "file";
    input.onchange = e => {
      let file = e.target.files[0];
      file.text().then(xml => {
        let parser = new DOMParser();
        let svg = parser.parseFromString(xml, "image/svg+xml").documentElement;
        let text = svg.dataset.text;
        if (text) {
          this._text = JSON.parse(text);
          this._invalidate();
          this.update();
        } else {
          window.alert("Can’t open this SVG file, doesn’t contain text data");
        }
      });
    }
    input.click();
  }

  save() {
    var link = document.createElement('a');
    link.href = this._layout.getSvg(this._text);
    link.download = "document.svg";
    link.click();
  }

  clear() {
    this._text = [];
    this._cursor = 0;
    this._invalidate();
    this.update();
    this._canvas.focus();
  }

  _updateInput() {
    this._input.value = String.fromCodePoint(...this._text.map(c => c.code));
  }

  _keydown(e) {
    if (e.key === "ArrowLeft")
      this._moveCursor(1);
    else if (e.key === "ArrowRight")
      this._moveCursor(-1);
  }

  _keypress(e) {
    if (e.inputType == "insertText") {
      this._insert(e.data);
    } else if (e.inputType == "insertFromPaste") {
      // e.data is null in Chrome for input events, but not null for
      // beforeinput, however Firefox does not emit beforeinput events at all!
      // Ignore for now, we use the paste event for this.
      //this._insert(e.data);
    } else if (e.inputType == "deleteContentBackward") {
      this._backspace(1);
    } else if (e.inputType == "deleteContentForward") {
      this._delete(1);
    } else if (e.inputType == "insertCompositionText") {
      // Firefox and Chrome on Android give this instead of innsertText and
      // deleteContentBackward! In both cases they give us a bunch of text, not
      // just what was inserted/deleted, so I have to guess this based on the
      // cursor position.
      if (this._input.selectionStart > this._cursor) {
        this._insert(this._input.value.slice(this._cursor, this._input.selectionStart));
      } else if (this._input.selectionStart < this._cursor) {
        this._backspace(this._cursor - this._input.selectionStart);
      }
    } else {
      console.warn("Unhandled input type: %s", e.inputType);
    }
  }

  _insert(text) {
    let count = 0;
    for (const c of text) {
      this._text.splice(this._cursor + count, 0, {
        code: c.codePointAt(0),
      });
      count++;
    }
    this._invalidate();
    this._moveCursor(count);
  }

  _delete(count) {
    this._text.splice(this._cursor, count);
    this._invalidate();
    this._moveCursor(0);
  }

  _backspace(count) {
    this._text.splice(this._cursor - 1, count);
    this._invalidate();
    this._moveCursor(-count);
  }

  _moveCursor(movement) {
    let cursor = this._cursor + movement;
    if (cursor >= 0 && cursor <= this._text.length) {
      this._cursor = cursor;
      this.update();
      this._updateAlternates();
      this._input.selectionStart = cursor;
      this._input.selectionEnd = cursor;
    }
  }

  _updateAlternates() {
    let alternates = document.getElementById("alternates");
    alternates.innerHTML = "";

    if (this._cursor <= 0)
      return;

    let c = this._text[this._cursor - 1];
    let features = this._layout.featuresOfIndex(this._cursor - 1) || [];
    for (const [feature, glyph] of features) {
      c.features = c.features || [];

      let alts = typeof(glyph) == "number" ? [glyph] : glyph;

      let div = document.createElement("div");
      alternates.appendChild(div);
      for (let i = 0; i < alts.length; i++) {
        let alt = alts[i];
        let button = document.createElement("a");
        let setting = feature + "=" + (i + 1);

        button.title = setting;
        button.href = "#";

        button.appendChild(this._layout.getGlyphImg(alt));
        div.appendChild(button);

        button.onclick = e => {
          e.preventDefault();

          let chars = [c];
          if (feature == "dlig")
            chars.push(this._text[this._cursor]);

          for (let cc of chars) {
            cc.features = cc.features || [];
            if (cc.features.includes("dlig=1"))
              cc.features = ["dlig=1", setting];
            else
              cc.features = [setting];
          }

          this._invalidate();
          this.update();
          if (c.features.includes("dlig=1"))
            this._updateAlternates();
          else
            this._updateFeatureButtons(c.features);
        };
      }

      this._updateFeatureButtons(c.features);
    }
  }

  _updateFeatureButtons(features) {
    let alternates = document.getElementById("alternates");

    let selectbase = false;
    if (features.length == 0)
      selectbase = true;
    else if (features.length == 1 && features[0] == "dlig=1")
      selectbase = true;

    for (let div of alternates.children) {
      for (let button of div.children) {
        if (features.includes(button.title) ||
            (selectbase && !button.title))
          button.className = "feature selected";
        else
          button.className = "feature";
      }
    }
  }

  _click(e) {
    if (this._layout === null)
      return;
    let dpr = window.devicePixelRatio;
    let scale = dpr / this._scale;
    let rect = e.target.getBoundingClientRect();
    let x = (e.clientX - rect.left) * scale;

    let cursor = this._layout.indexAtPoint(x) + 1;
    this._moveCursor(cursor - this._cursor);
  }
}
