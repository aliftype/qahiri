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

import { TAG, Stream } from "./OpenType.js"

class OStream {
  constructor(len) {
    let buffer = new ArrayBuffer(len);
    this._view = new DataView(buffer);
    this._bytes = new Uint8Array(buffer);;
    this._pos = 0;
  }

  get data() {
    return this._view.buffer;
  }

  get pos() {
    return this._pos;
  }

  writeBytesAt(offset, bytes) {
    this._bytes.set(bytes, offset);
  }

  writeUInt16(num) {
    this._view.setUint16(this._pos, num);
    this._pos += 2;
  }

  writeUInt32(num) {
    this._view.setUint32(this._pos, num);
    this._pos += 4;
  }
}

let DROP_TABLES = [TAG("GSUB"), TAG("GPOS"), TAG("GDEF"), TAG("DSIG")];

let TABLES_OFFSET = 12;
let TABLE_ENTRY_SIZE = 16;

export let PUA_OFFSET = 0xF0000;

export class FontRemapper {
  constructor(blob, drop) {
    let stream = new Stream(new Uint8Array(blob));
    let dropTables = drop || [];

    this.sfntVersion = stream.readUInt32();
    let numTables = stream.readUInt16();
    stream.pos = TABLES_OFFSET;

    this.tables = {};
    this.tableTags = [];
    for (let i = 0; i < numTables; i++) {
      let tableTag = stream.readUInt32();
      let checksum = stream.readUInt32();
      let offset = stream.readUInt32();
      let length = stream.readUInt32();

      if (DROP_TABLES.includes(tableTag) || dropTables.includes(tableTag))
        continue;

      let pos = stream.pos;
      let data = stream.readBytes(offset, length);
      stream.pos = pos;
      this.tables[tableTag] = { tableTag, checksum, length, offset, data };
      this.tableTags.push(tableTag);
    }
  }

  getNumGlyphs() {
    let maxp = new Stream(this.tables[TAG("maxp")].data);
    let version = maxp.readInt32();
    let numGlyphs = maxp.readInt16();
    return numGlyphs;
  }

  remapCmap() {
    // Build new cmap table mapping all glyphs to PUA + glyph index.
    // This way we can fake glyph indices on the canvas by using PUA code
    // points.

    let numGlyphs = this.getNumGlyphs();
    let pua = PUA_OFFSET;

    let cmap = new OStream(44);

    // Header
    cmap.writeUInt16(0);                   // version
    cmap.writeUInt16(1);                   // numTables

    // EncodingRecords
    cmap.writeUInt16(0);                   // platformID
    cmap.writeUInt16(4);                   // encodingID
    cmap.writeUInt32(cmap.pos + 4);        // subtableOffset

    // Subtable Format 12
    cmap.writeUInt16(12);                  // format
    cmap.writeUInt16(0);                   // reserved
    cmap.writeUInt32(2 * 2 + 6 * 4);       // length
    cmap.writeUInt32(0);                   // language
    cmap.writeUInt32(1);                   // numGroups

    // SequentialMapGroup
    cmap.writeUInt32(pua);                 // startCharCode
    cmap.writeUInt32(pua + numGlyphs - 1); // endCharCode
    cmap.writeUInt32(0);                   // startGlyphID

    this.tables[TAG("cmap")].data = new Uint8Array(cmap.data);
  }

  remap() {
    this.remapCmap();

    let tables = this.tables;
    let tableTags = this.tableTags;
    let numTables = tableTags.length;

    // calculate table offsets
    let offset = TABLES_OFFSET + numTables * TABLE_ENTRY_SIZE;
    for (let i = 0; i < numTables; i++) {
      let table = tables[tableTags[i]];
      let paddedLength = ((table.length + 3) & ~3) >>> 0;
      table.offset = offset;
      offset += paddedLength;
    }

    let out = new OStream(offset);

    // table directory
    let entrySelector = 0;
    while (1 << (entrySelector + 1) <= numTables)
      entrySelector++;
    let searchRange = (1 << entrySelector) << 4;
    let rangeShift = 16 * numTables - searchRange;

    out.writeUInt32(this.sfntVersion);
    out.writeUInt16(numTables);
    out.writeUInt16(searchRange);
    out.writeUInt16(entrySelector);
    out.writeUInt16(rangeShift);

    for (let i = 0; i < numTables; i++) {
      let table = tables[tableTags[i]];

      out.writeUInt32(table.tableTag);
      out.writeUInt32(table.checksum)
      out.writeUInt32(table.offset)
      out.writeUInt32(table.length)
    }

    // table data
    for (let i = 0; i < numTables; i++) {
      let table = tables[tableTags[i]];
      out.writeBytesAt(table.offset, table.data);
    }

    return out.data;
  }
}
