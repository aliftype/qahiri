/*
 * Copyright (c) 2019-2020 Khaled Hosny
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

class Layout {
  constructor(font, buffer, text) {
    this._font = font;
    this._buffer = buffer;
    this._text = text.map(c => ({...c}));

    this._adjustDots = false;
    this._removeDots = false;
    this._nocolorDots = false;

    this._svg = null;
    this._width = null;
    this._glyphs = null;

    this._svgs = [];

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
      this._svg = null;
    this._adjustDots = v;
  }

  set removeDots(v) {
    if (v != this._removeDots)
      this._svg = null;
    this._removeDots = v;
  }

  set nocolorDots(v) {
    if (v != this._nocolorDots)
      this._svg = null;
    this._nocolorDots = v;
  }

  get svg() {
    this._makeSVG();
    return this._svgURL;
  }

  get width() {
    this._shape();
    return this._width + (this._margin * 2);
  }

  get height() { return this.ascender - this.descender + (this._margin * 2); }
  get baseline() { return this.ascender + this._margin; }
  get ascender() { return this._font.extents.ascender; }
  get descender() { return this._font.extents.descender; }

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
    return x + this._margin;
  }

  indexAtPoint(x) {
    this._shape();

    for (let i = 0; i < this._text.length; i++) {
      let c = this._text[i];
      let left = c.x + this._margin;
      let right = c.x + c.ax + this._margin;
      if (x > left && x < right)
        return i;
    }

    if (x < 0)
      return this._text.length;
    return 0;
  }

  getGlyphSVG(glyph) {
    if (this._svgs[glyph] === undefined) {
      let extents = this._font.getGlyphExtents(glyph)
      let ns = "http://www.w3.org/2000/svg";
      let svg = document.createElementNS(ns, "svg");
      svg.setAttribute("xmlns", ns);
      svg.setAttributeNS(ns, "version", '1.1');
      svg.setAttributeNS(ns, "width", extents.width);
      svg.setAttributeNS(ns, "height", this.height);

      let x = -extents.x_bearing, y = this.ascender;
      let path = document.createElementNS(ns, "path");
      path.setAttributeNS(ns, "transform", `translate(${x},${y})`);
      path.setAttributeNS(ns, "d", this._font.getGlyphOutline(glyph));
      svg.appendChild(path);

      let blob = new Blob([svg.outerHTML], {type: "image/svg+xml"});
      this._svgs[glyph] = window.URL.createObjectURL(blob);
    }

    return this._svgs[glyph];
  }

  _shape() {
    if (this._glyphs !== null)
      return;

    // Shape once without features to get the base glyphs, which we use to get
    // list of glyph alternates.
    let glyphs = this._buffer.shape(this._font, this._text, false);
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
    glyphs = this._buffer.shape(this._font, this._text, true);

    let x = 0, y = this.ascender;
    let maxY = Number.NEGATIVE_INFINITY;
    this._width = 0;
    for (const g of glyphs) {
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
    }

    this._glyphs = glyphs;
    this._dotMaxY = maxY;
  }

  _makeSVG() {
    if (this._svg !== null)
      return;

    this._shape();

    let ns = "http://www.w3.org/2000/svg";
    this._svg = document.createElementNS(ns, "svg");
    this._svg.setAttribute("xmlns", ns);
    this._svg.setAttributeNS(ns, "version", '1.1');
    this._svg.setAttributeNS(ns, "width", this.width);
    this._svg.setAttributeNS(ns, "height", this.height);
    this._svg.setAttributeNS(ns, "viewBox", `${-this._margin} ${-this._margin} ${this.width} ${this.height}`);

    for (const g of this._glyphs) {
      if (this._removeDots && g.isDot)
        continue;

      if (g.layers.length && !(this._nocolorDots && g.isDot))
        for (const l of g.layers)
          this._svg.appendChild(this._pathElement(l, g.isDot));
      else
        this._svg.appendChild(this._pathElement(g, g.isDot));
    }

    let blob = new Blob([this._svg.outerHTML], {type: "image/svg+xml"});
    this._svgURL = window.URL.createObjectURL(blob);
  }

  _pathElement(g, isDot) {
    let x = g.x;
    let y = g.y;
    let fill = g.color && g.color.slice(0, -2);
    // Inkscape does not support RGBA colors, opacity must be set separately.
    let opacity = g.color && parseInt(g.color.slice(-2), 16) / 255;

    if (this._adjustDots &&
        g.dy > 0 && g.dy < this._dotMaxY && isDot)
      y += g.dy - this._dotMaxY;

    if (!g.index && !fill)
      fill = "red";

    let ns = this._svg.namespaceURI;
    let path = document.createElementNS(ns, "path");
    path.setAttributeNS(ns, "transform", `translate(${x},${y})`);
    if (fill)
      path.setAttributeNS(ns, "style", `fill:${fill};fill-opacity:${opacity}`);
    path.setAttributeNS(ns, "d", g.outline);
    return path;
  }
}

let sample = `
[{"code":1575,"features":["dlig","cv10"]},{"code":1604,"features":["dlig"]},{"code":1582},{"code":1591,"features":["cv05"]},{"code":32},{"code":1575,"features":[]},{"code":1604,"features":[]},{"code":1603,"features":["cv05"]},{"code":1608,"features":[]},{"code":1601,"features":[]},{"code":1610,"features":["cv06"]},{"code":32},{"code":1575,"features":["dlig","cv01"]},{"code":1604,"features":["dlig"]},{"code":1601,"features":["cv01"]},{"code":1575,"features":[]},{"code":1591,"features":["cv05"]},{"code":1605,"features":[]},{"code":1610,"features":["cv10"]}]
`;

export class View {
  constructor(data) {
    this._font = new Font(data, window.devicePixelRatio);
    this._buffer = new Buffer();

    this._canvas = document.getElementById("canvas");
    this._backing = document.createElement('canvas');

    this._cursor = 0;
    this._text = null;
    this._layout = null;

    this._canvas.focus();
    this._canvas.addEventListener('keydown', e => this._keydown(e));
    this._canvas.addEventListener('keypress', e => this._keypress(e));
    this._canvas.addEventListener('click', e => this._click(e));

    document.addEventListener('paste', e => {
      if (document.activeElement === this._canvas)
        this._insert((e.clipboardData || window.clipboardData).getData('text'));
    });
  }

  update() {
    if (this._layout === null) {
      if (this._text === null)
        this._text = JSON.parse(window.sessionStorage.text || window.localStorage.text || sample);
      else
        window.sessionStorage.text = window.localStorage.text = JSON.stringify(this._text);

      this._layout = new Layout(this._font, this._buffer, this._text);
    }

    let adjustDots = document.getElementById("adjust-dots").checked;
    this._layout.adjustDots = adjustDots;

    let removeDots = document.getElementById("remove-dots").checked;
    this._layout.removeDots = removeDots;

    let nocolorDots = document.getElementById("nocolor-dots").checked;
    this._layout.nocolorDots = nocolorDots;

    this._draw();
  }

  _invalidate() {
    this._layout = null;
  }

  _draw() {
    let canvas = this._backing;
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
    ctx.save();
    ctx.fillStyle = "#0000003f";
    let pos = layout.posOfIndex(this._cursor - 1);
    ctx.fillRect(pos, layout.baseline - layout.descender, 100, layout.descender - layout.ascender);
    ctx.restore();

    let mainCanvas = this._canvas;
    let img = new Image;
    img.onload = function() {
      ctx.drawImage(img, 0, 0);

      // Use the parent node width for canvas so that it does not overflow
      // (wrecks havoc on mobile, and not a good idea in general).
      let width = mainCanvas.parentNode.clientWidth;
      mainCanvas.width = width * window.devicePixelRatio;
      mainCanvas.height = canvas.height;
      mainCanvas.style.width = `${width}px`;
      mainCanvas.style.height = canvas.style.height;

      let mainCtx = mainCanvas.getContext("2d");
      mainCtx.drawImage(canvas, mainCanvas.width - canvas.width, 0);
    }
    img.src = layout.svg;

  }

  open(file) {
    let input = document.createElement("input");
    input.type = "file";
    input.onchange = e => {
      let file = e.target.files[0];
      file.text().then(text => {
        this._text = JSON.parse(text);
        this._invalidate();
        this.update();
      });
    }
    input.click();
  }

  save() {
    var link = document.createElement('a');
    let blob = new Blob([JSON.stringify(this._text)], {type: "application/json"});
    link.href = window.URL.createObjectURL(blob);
    link.download = "document.json";
    link.click();
  }

  export() {
    var link = document.createElement('a');
    link.href = this._layout.svg;
    link.download = "document.svg";
    link.click();
  }

  _keydown(e) {
    if (e.key === "ArrowLeft")
      this._moveCursor(1);
    else if (e.key === "ArrowRight")
      this._moveCursor(-1);
    else if (e.key === "Backspace") {
      e.preventDefault();
      this._text.splice(this._cursor - 1, 1);
      this._invalidate();
      this._moveCursor(-1);
    }
  }

  _keypress(e) {
    if (e.ctrlKey || e.metaKey)
      return;
    this._insert(e.key);
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

  _moveCursor(movement) {
    let cursor = this._cursor + movement;
    if (cursor >= 0 && cursor <= this._text.length) {
      this._cursor = cursor;
      this.update();
      this._updateAlternates();
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

        button.dataset.feature = setting;
        button.title = setting;
        button.href = "#";

        let img = document.createElement('img');
        img.height = 70;
        img.src = this._layout.getGlyphSVG(alt);
        button.appendChild(img);
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
        if (features.includes(button.dataset.feature) ||
            (selectbase && !button.dataset.feature))
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
    let offsetX = (this._canvas.width - this._backing.width) / dpr;
    let x = (e.clientX - this._canvas.offsetLeft - offsetX) * scale;

    let cursor = this._layout.indexAtPoint(x) + 1;
    this._moveCursor(cursor - this._cursor);
  }
}
