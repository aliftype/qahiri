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
 *
 * Copyright (c) 2019 Ebrahim Byagowi
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */

import { GSUB, COLR, CPAL } from "./OpenType.js"

function TAG(tag) {
  tag = tag.padEnd(4, " ");
  let c1 = tag.codePointAt(0);
  let c2 = tag.codePointAt(1);
  let c3 = tag.codePointAt(2);
  let c4 = tag.codePointAt(3);
  return (c1&0xFF) << 24 | (c2&0xFF) << 16 | (c3&0xFF) << 8 | c4&0xFF;
}

class Pointer {
  constructor(arg) {
    if (arg instanceof ArrayBuffer) {
      this.byteLength = arg.byteLength;
      this.ptr = stackAlloc(this.byteLength);
      HEAPU8.set(new Uint8Array(arg), this.ptr);
    } else {
      this.byteLength = arg;
      this.ptr = stackAlloc(this.byteLength);
    }
  }

  get int32Array() { return HEAP32.slice(this.ptr / 4, (this.ptr + this.byteLength) / 4); }
  get uint32()     { return HEAPU32[this.ptr / 4]; }
}

export class Font {
  constructor(data, dpr) {
    let dataPtr = new Pointer(data);
    let blob = _hb_blob_create(dataPtr.ptr, dataPtr.byteLength, 2/*writable*/, 0, 0);
    this.face = _hb_face_create(blob, 0);
    this.ptr = _hb_font_create(this.face);
    this.upem = _hb_face_get_upem(this.face);

    let scale = this.upem * dpr;
    _hb_font_set_scale(this.ptr, scale, scale);

    this._outlines = [];
    this._extents = [];
    this._layers = [];
    this._colr = undefined;
    this._cpal = undefined;
    this._gsub = undefined;
    this._decompose_funcs = null;
  }

  getGlyphExtents(glyph) {
    if (this._extents[glyph] !== undefined)
      return this._extents[glyph];

    let extentsPtr = new Pointer(4 * 4);
    _hb_font_get_glyph_extents(this.ptr, glyph, extentsPtr.ptr);

    let extents = extentsPtr.int32Array;
    this._extents[glyph] = {
      x_bearing: extents[0],
      y_bearing: extents[1],
      width: extents[2],
      height: extents[3],
    };
    return this._extents[glyph];
  }

  getGlyphColorLayers(glyph) {
    if (this._layers[glyph] == undefined) {
      let palettes = this.CPAL ? this.CPAL.colors : [];
      let layers = this.COLR ? this.COLR.layers[glyph] || []: [];
      this._layers[glyph] = [];
      for (const layer of layers) {
        this._layers[glyph].push({
          index: layer[0],
          color: palettes[0][layer[1]],
        });
      }
    }
    return this._layers[glyph];
  }

  getGlyphOutline(glyph) {
    let outlines = this._outlines;
    if (outlines[glyph] !== undefined)
      return outlines[glyph];

    if (!this._decompose_funcs) {
      let funcs = this._decompose_funcs = _hb_ot_glyph_decompose_funcs_create();
      _hb_ot_glyph_decompose_funcs_set_move_to_func(funcs,
        addFunction(function(x, y, data) {
          outlines[data] += `M${x},${-y}`
        }));
      _hb_ot_glyph_decompose_funcs_set_line_to_func(funcs,
        addFunction(function(x, y, data) {
          outlines[data] += `L${x},${-y}`
        }));
      _hb_ot_glyph_decompose_funcs_set_conic_to_func(funcs,
        addFunction(function(x1, y1, x2, y2, data) {
          outlines[data] += `Q${x1},${-y1},${x2},${-y2}`
        }));
      _hb_ot_glyph_decompose_funcs_set_cubic_to_func(funcs,
        addFunction(function(x1, y1, x2, y2, x3, y3, data) {
          outlines[data] += `C${x1},${-y1},${x2},${-y2},${x3},${-y3}`
        }));
      _hb_ot_glyph_decompose_funcs_set_close_path_func(funcs,
        addFunction(function(data) { outlines[data] += `Z` }));
    }

    outlines[glyph] = "";
    // I’m abusing pointers here to pass the actual glyph id instead of a user
    // data pointer, don’t shot me.
    _hb_ot_glyph_decompose(this.ptr, glyph, this._decompose_funcs, glyph);

    return outlines[glyph];
  }

  _getTable(name, klass) {
    let lenPtr = new Pointer(4);
    let blob = _hb_face_reference_table(this.face, TAG(name));
    let data = _hb_blob_get_data(blob, lenPtr.ptr);
    if (lenPtr.uint32 != 0)
      return new klass(HEAPU8.slice(data, data + lenPtr.uint32));
    return null;
  }

  get COLR() {
    if (!this._colr) this._colr = this._getTable("COLR", COLR);
    return this._colr;
  }

  get CPAL() {
    if (!this._cpal) this._cpal = this._getTable("CPAL", CPAL);
    return this._cpal;
  }

  get GSUB() {
    if (!this._gsub) this._gsub = this._getTable("GSUB", GSUB);
    return this._gsub;
  }

  getSubstitute(lookupIndex, glyph, next) {
    let lookup = this.GSUB.lookup(lookupIndex);

    if (next) {
      let res = lookup.mapping[[glyph, next]];
      if (res)
        return res;
    }

    return lookup.mapping[glyph];
  }

  get extents() {
    let extentsPtr = new Pointer(12 * 4);
    _hb_font_get_h_extents(this.ptr, extentsPtr.ptr);
    let extents = extentsPtr.int32Array;
    return {
      ascender: extents[0],
      descender: extents[1],
      line_gap: extents[2],
    };
  }
}

class Glyph {
  constructor(font, info, position) {
    this.font = font;
    this.index = info[0];
    this.cl = info[2];
    this.ax = position[0];
    this.ay = position[1];
    this.dx = position[2];
    this.dy = position[3];

    this._features = null;
  }

  get isDot() {
    let layers = this.font.getGlyphColorLayers(this.index);
    return layers.length;
  }
  get layers() {
    let layers = this.font.getGlyphColorLayers(this.index);
    return layers.map(l => {
      let glyph = {...this, index: l.index, color: l.color};
      Object.setPrototypeOf(glyph, Glyph.prototype);
      return glyph;
    });
  }
  get outline() { return this.font.getGlyphOutline(this.index); }

  getSubstitutes(next) {
    if (this._features === null) {
      let required = ["isol", "init", "medi", "fina", "rlig", "dist", "ccmp"];
      let features = this.font.GSUB.features;
      let result = new Set();
      for (const [tag, lookups] of Object.entries(features)) {
        if (!required.includes(tag)) {
          for (const lookup of lookups) {
            let sub = this.font.getSubstitute(lookup, this.index, next && next.index);
            if (sub)
              result.add([tag, sub]);
          }
        }
      }
      this._features = result.size && Array.from(result) || undefined;
    }
    return this._features;
  }
}

export class Buffer {
  constructor() { this.ptr = _hb_buffer_create(); }

  shape(font, text, useFeatures) {
    _hb_buffer_clear_contents(this.ptr);
    _hb_buffer_set_direction(this.ptr, 5/*rtl*/);
    _hb_buffer_set_script(this.ptr, TAG("Arab"));
    _hb_buffer_set_content_type(this.ptr, 1/*unicode*/);

    let features = [];
    for (let i = 0; i < text.length; i++) {
      _hb_buffer_add(this.ptr, text[i].code, i);
      for (const feature of text[i].features || []) {
        let [tag, value] = feature.split("=");
        value = value ? parseInt(value) : 1;
        if (useFeatures || tag == "dlig") {
          features.push(TAG(feature), value, i, i + 1);
        }
      }
    }

    let featuresPtr = new Pointer(new Uint32Array(features).buffer);
    _hb_shape(font.ptr, this.ptr, featuresPtr.ptr, features.length / 4);

    let length = _hb_buffer_get_length(this.ptr);
    let infosPtr32 = _hb_buffer_get_glyph_infos(this.ptr, 0) / 4;
    let positionsPtr32 = _hb_buffer_get_glyph_positions(this.ptr, 0) / 4;
    let infos = HEAPU32.slice(infosPtr32, infosPtr32 + 5 * length);
    let positions = HEAP32.slice(positionsPtr32, positionsPtr32 + 5 * length);
    let glyphs = [];
    for (let i = 0; i < length; ++i) {
      let j = i * 5;
      let info = infos.slice(j, j + 5);
      let position = positions.slice(j, j + 5);
      glyphs.push(new Glyph(font, info, position));
    }
    return glyphs;
  }
}
