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

class Stream {
  constructor(bytes) {
    this.bytes = bytes;
    this.pos = 0;
  }

  readByte(pos) {
    if (pos !== undefined)
      this.pos = pos;
    return this.bytes[this.pos++];
  }

  readUInt16(pos) {
    let b0 = this.readByte(pos);
    let b1 = this.readByte();
    return (b0 << 8) + b1;
  }

  readInt16(pos) {
    let v = this.readUInt16(pos);
    return (v << 16) >> 16;
  }

  readUInt32(pos) {
    let b0 = this.readByte(pos);
    let b1 = this.readByte();
    let b2 = this.readByte();
    let b3 = this.readByte();
    return (b0 << 24) + (b1 << 16) + (b2 << 8) + b3;
  }

  readTag(pos) {
    let b0 = this.readByte(pos);
    let b1 = this.readByte();
    let b2 = this.readByte();
    let b3 = this.readByte();
    return String.fromCodePoint(b0, b1, b2, b3);
  }
}

class Coverage {
  constructor(stream, offset) {
    this.glyphs = [];

    let pos = stream.pos;

    let coverageFormat = stream.readUInt16(offset);
    switch (coverageFormat) {
      case 1:
        let glyphCount = stream.readUInt16();
        for (let i = 0; i < glyphCount; i++)
          this.glyphs.push(stream.readUInt16());
        break;

      case 2:
        let rangeCount = stream.readUInt16();
        for (let i = 0; i < rangeCount; i++) {
          let startGlyphID = stream.readUInt16();
          let endGlyphID = stream.readUInt16();
          let startCoverageIndex = stream.readUInt16();
          for (let j = 0; j <= endGlyphID - startGlyphID; j++)
            this.glyphs[startCoverageIndex + j] = startGlyphID + j;
        }
        break;

      default:
        console.warn("Unsupported coverage format: %d", coverageFormat);
    }

    stream.pos = pos;
  }
}


class Lookup {
  constructor(stream, lookupOffset) {
    this.mapping = {};

    let pos = stream.pos;

    this.type = stream.readUInt16(lookupOffset);
    this.flag = stream.readUInt16();
    let subtableCount = stream.readUInt16();

    let subtableOffsets = []
    for (let i = 0; i < subtableCount; i++)
      subtableOffsets.push(lookupOffset + stream.readUInt16());

    if (this.flag & 0x0010)
      this.markFilteringSet = stream.readUInt16();

    for (const subtableOffset of subtableOffsets) {
      switch (this.type) {
        case 1: {
          let substFormat = stream.readUInt16(subtableOffset);
          switch (substFormat) {
            case 1: {
              let coverage = new Coverage(stream, subtableOffset + stream.readUInt16());
              let deltaGlyphID = stream.readInt16();
              for (let glyphID of coverage.glyphs)
                this.mapping[glyphID] = glyphID + deltaGlyphID;
            }
            break;

            case 2: {
              let coverage = new Coverage(stream, subtableOffset + stream.readUInt16());
              let glyphCount = stream.readUInt16();
              let substituteGlyphIDs = [];
              for (let i = 0; i < glyphCount; i++)
                this.mapping[coverage.glyphs[i]] = stream.readUInt16();
            }
            break;

            default:
              console.warn("Unsupported single substitution subtable format: %d",
                           substFormat);
          }
        }
        break;

        /*
        case 2: {
          let substFormat = stream.readUInt16(subtableOffset);
          switch (substFormat) {
            case 1: {
              let coverage = new Coverage(stream, subtableOffset + stream.readUInt16());
              let sequenceCount = stream.readUInt16();
              let sequenceOffsets = []
              for (let i = 0; i < sequenceCount; i++)
                sequenceOffsets[i] = stream.readUInt16();

              for (let i = 0; i < sequenceCount; i++) {
                let sequenceOffset = subtableOffset + sequenceOffsets[i];
                let glyphCount = stream.readUInt16(sequenceOffset);
                this.mapping[coverage.glyphs[i]] = [];
                for (let j = 0; j < glyphCount; j++)
                  this.mapping[coverage.glyphs[i]].push(stream.readUInt16());
              }
            }
            break;

            default:
              console.warn("Unsupported multiple substitution subtable format: %d",
                           substFormat);
          }
        }
        break;
        */

        case 3: {
          let substFormat = stream.readUInt16(subtableOffset);
          switch (substFormat) {
            case 1: {
              let coverage = new Coverage(stream, subtableOffset + stream.readUInt16());
              let alternateSetCount = stream.readUInt16();
              let alternateSetOffsets = [];
              for (let i = 0; i < alternateSetCount; i++)
                alternateSetOffsets[i] = stream.readUInt16();

              for (let i = 0; i < alternateSetCount; i++) {
                let alternateSetOffset = subtableOffset + alternateSetOffsets[i];
                let glyphCount = stream.readUInt16(alternateSetOffset);
                let alternateGlyphIDs = [];
                for (let j = 0; j < glyphCount; j++)
                  alternateGlyphIDs[j] = stream.readUInt16();
                this.mapping[coverage.glyphs[i]] = alternateGlyphIDs;
              }
            }
            break;

            default:
              console.warn("Unsupported alternate substitution subtable format: %d",
                           substFormat);
          }
        }
        break;

        case 4: {
          let substFormat = stream.readUInt16(subtableOffset);
          switch (substFormat) {
            case 1: {
              let coverage = new Coverage(stream, subtableOffset + stream.readUInt16());
              let ligatureSetCount = stream.readUInt16();
              let ligatureSetOffsets = [];
              for (let i = 0; i < ligatureSetCount; i++)
                ligatureSetOffsets[i] = stream.readUInt16();

              for (let i = 0; i < ligatureSetCount; i++) {
                let ligatureSetOffset = subtableOffset + ligatureSetOffsets[i];
                let ligatureCount = stream.readUInt16(ligatureSetOffset);
                let ligatureOffsets = [];
                for (let j = 0; j < ligatureCount; j++)
                  ligatureOffsets[j] = stream.readUInt16();

                for (let j = 0; j < ligatureCount; j++) {
                  let ligatureOffset = ligatureSetOffset + ligatureOffsets[j];
                  let ligatureGlyph = stream.readUInt16(ligatureOffset);
                  let componentCount = stream.readUInt16();
                  let componentGlyphIDs = [coverage.glyphs[i]];
                  for (let k = 0; k < componentCount - 1; k++)
                    componentGlyphIDs.push(stream.readUInt16());
                  this.mapping[componentGlyphIDs] = ligatureGlyph;
                }
              }
            }
            break;

            default:
              console.warn("Unsupported ligature substitution subtable format: %d",
                           substFormat);
          }
        }
        break;

        default:
          console.warn("Unsupported lookup type: %d", this.type);
      }
    }

    stream.pos = pos;
  }
}

export class GSUB {
  constructor(data) {
    this.stream = new Stream(data);

    this.major = this.stream.readUInt16();
    this.minor = this.stream.readUInt16();
    this._scriptListOffset = this.stream.readUInt16();
    this._featureListOffset = this.stream.readUInt16();
    this._lookupListOffset = this.stream.readUInt16();

    this._scripts = null;
    this._features = null;
    this._lookupOffsets = null;
    this._lookups = [];
  }

  get features() {
    if (this._features == null) {
      let pos = this.stream.pos;

      let featureListOffset = this._featureListOffset;

      let featureCount = this.stream.readUInt16(featureListOffset);
      let featureOffsets = [];
      for (let i = 0; i < featureCount; i++) {
        let featureTag = this.stream.readTag();
        featureOffsets.push([featureTag, featureListOffset + this.stream.readUInt16()]);
      }

      let features = {};
      for (const [featureTag, featureOffset] of featureOffsets) {
        features[featureTag] = [];

        let featureParams = this.stream.readUInt16(featureOffset);
        let lookupIndexCount = this.stream.readUInt16();
        for (let j = 0; j < lookupIndexCount; j++) {
          let lookupIndex = this.stream.readUInt16();
          features[featureTag].push(lookupIndex);
        }
      }
      this._features = features;

      this.stream.pos = pos;
    }

    return this._features;
  }

  lookup(index) {
    if (this._lookups[index] == undefined) {
      if (this._lookupOffsets == null) {
        let pos = this.stream.pos;

        let lookupListOffset = this._lookupListOffset;
        let lookupCount = this.stream.readUInt16(lookupListOffset);
        let lookupOffsets = [];
        for (let i = 0; i < lookupCount; i++)
          lookupOffsets.push(lookupListOffset + this.stream.readUInt16());

        this._lookupOffsets = lookupOffsets;
        this.stream.pos = pos;
      }
      this._lookups[index] = new Lookup(this.stream, this._lookupOffsets[index]);
    }

    return this._lookups[index];
  }
}

export class COLR {
  constructor(data) {
    let stream = new Stream(data);

    let version = stream.readUInt16();
    if (version > 0) {
      console.warn("Unsupported COLR table version: %d", version);
      return;
    }

    let numBaseGlyphRecords = stream.readUInt16();
    let baseGlyphRecordsOffset = stream.readUInt32();
    let layerRecordsOffset = stream.readUInt32();
    let numLayerRecords = stream.readUInt16();

    let layerRecords = [];
    stream.pos = layerRecordsOffset;
    for (let i = 0; i < numLayerRecords; i++) {
      let gID = stream.readUInt16();
      let paletteIndex = stream.readUInt16();
      layerRecords.push([gID, paletteIndex]);
    }

    this.layers = {};
    stream.pos = baseGlyphRecordsOffset;
    for (let i = 0; i < numBaseGlyphRecords; i++) {
      let gID = stream.readUInt16();
      let firstLayerIndex = stream.readUInt16();
      let numLayers = stream.readUInt16();
      this.layers[gID] = layerRecords.slice(firstLayerIndex, firstLayerIndex + numLayers);
    }
  }
}

export class CPAL {
  constructor(data) {
    let stream = new Stream(data);

    let version = stream.readUInt16();
    if (version > 1) {
      console.warn("Unsupported CPAL table version: %d", version);
      return;
    }

    let numPaletteEntries = stream.readUInt16();
    let numPalettes = stream.readUInt16();
    let numColorRecords = stream.readUInt16();

    let offsetFirstColorRecord = stream.readUInt32();
    let colorRecordIndices = [];
    for (let i = 0; i < this.numPalettes; i++)
      colorRecordIndices.push(stream.readUInt16());

    let colorRecords = [];
    stream.pos = offsetFirstColorRecord;
    for (let i = 0; i < numColorRecords; i++) {
      let b = stream.readByte().toString(16);
      let g = stream.readByte().toString(16);
      let r = stream.readByte().toString(16);
      let a = stream.readByte().toString(16);
      colorRecords.push(`#${r}${g}${b}${a}`);
    }

    this.colors = [];
    for (let i = 0; i < numPalettes; i++)
      this.colors.push(colorRecords.slice(colorRecordIndices[i],
                                          numPaletteEntries));
  }
}
