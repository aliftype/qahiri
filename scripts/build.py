# Copyright (c) 2020-2021 Khaled Hosny
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

from fontTools.fontBuilder import FontBuilder
from fontTools.misc.fixedTools import otRound
from fontTools.misc.timeTools import epoch_diff
from fontTools.misc.transform import Identity, Transform
from fontTools.pens.basePen import BasePen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import newTable
from glyphsLib import GSAnchor, GSComponent, GSFont, GSGlyph, GSLayer
from glyphsLib.builder.tokens import TokenExpander
from glyphsLib.builder.constants import CODEPAGE_RANGES
from glyphsLib.glyphdata import get_glyph as getGlyphInfo
from pathops import Path, PathPen


class DecomposePathPen(PathPen):
    def __new__(cls, *args, **kwargs):
        return super().__new__(cls, *args, **kwargs)

    def __init__(self, path, layerSet):
        self._layerSet = layerSet

    def addComponent(self, name, transform):
        from fontTools.pens.reverseContourPen import ReverseContourPen

        pen = self
        if transform != Identity:
            pen = TransformPen(pen, transform)
            xx, xy, yx, yy = transform[:4]
            if xx * yy - xy * yx < 0:
                pen = ReverseContourPen(pen)
        self._layerSet[name].draw(pen)


class FlattenComponentsPen(BasePen):
    def __init__(self, pen, glyphSet):
        super().__init__(glyphSet)
        self.pen = pen

    def addComponent(self, name, transform):
        layer = self.glyphSet[name]
        pen = self.pen
        if layer.components and not layer.paths:
            if transform != Identity:
                pen = TransformPen(pen, transform)
            layer.draw(FlattenComponentsPen(pen, self.glyphSet))
        else:
            pen.addComponent(name, transform)


def makeKerning(font, source):
    fea = ""

    groups = {}
    for glyph in font.glyphs:
        if glyph.leftKerningGroup:
            group = f"@MMK_R_{glyph.leftKerningGroup}"
            if group not in groups:
                groups[group] = []
            groups[group].append(glyph.name)
        if glyph.rightKerningGroup:
            group = f"@MMK_L_{glyph.rightKerningGroup}"
            if group not in groups:
                groups[group] = []
            groups[group].append(glyph.name)
    for group, glyphs in groups.items():
        fea += f"{group} = [{' '.join(glyphs)}];\n"

    kerning = font.kerning[source.id]
    pairs = ""
    classes = ""
    enums = ""
    for left in kerning:
        for right in kerning[left]:
            value = kerning[left][right]
            kern = f"<{value} 0 {value} 0>"
            if left.startswith("@") and right.startswith("@"):
                if value:
                    classes += f"pos {left} {right} {kern};\n"
            elif left.startswith("@") or right.startswith("@"):
                enums += f"enum pos {left} {right} {kern};\n"
            else:
                pairs += f"pos {left} {right} {kern};\n"

    fea += f"""
feature kern {{
lookupflag IgnoreMarks;
{pairs}
{enums}
{classes}
}} kern;
"""

    return fea


def makeMark(instance, source):
    font = instance.parent

    fea = ""
    mark = ""
    curs = ""
    liga = ""

    exit = {}
    entry = {}
    lig = {}

    for glyph in font.glyphs:
        if not glyph.export:
            continue

        layer = glyph.layers[source.id]
        for anchor in layer.anchors:
            name = anchor.name
            x = otRound(anchor.position.x)
            y = otRound(anchor.position.y)
            if name.startswith("_"):
                fea += f"markClass {glyph.name} <anchor {x} {y}> @mark_{name[1:]};\n"
            elif name.startswith("caret_"):
                pass
            elif "_" in name:
                name, index = name.split("_")
                if glyph.name not in lig:
                    lig[glyph.name] = {}
                if index not in lig[glyph.name]:
                    lig[glyph.name][index] = []
                lig[glyph.name][index].append((name, (x, y)))
            elif name == "exit":
                exit[glyph.name] = (x, y)
            elif name == "entry":
                entry[glyph.name] = (x, y)
            else:
                mark += f"pos base {glyph.name} <anchor {x} {y}> mark @mark_{name};\n"

    for name, components in lig.items():
        mark += f"pos ligature {name}"
        for component, anchors in sorted(components.items()):
            if component != "1":
                mark += " ligComponent"
            for anchor, (x, y) in anchors:
                x = otRound(x)
                y = otRound(y)
                mark += f" <anchor {x} {y}> mark @mark_{anchor}"
        mark += ";\n"

    for glyph in font.glyphs:
        if glyph.name in exit or glyph.name in entry:
            pos1 = entry.get(glyph.name)
            pos2 = exit.get(glyph.name)
            anchor1 = pos1 and f"{pos1[0]} {pos1[1]}" or "NULL"
            anchor2 = pos2 and f"{pos2[0]} {pos2[1]}" or "NULL"
            curs += f"pos cursive {glyph.name} <anchor {anchor1}> <anchor {anchor2}>;\n"

    fea += f"""
feature curs {{
lookupflag IgnoreMarks RightToLeft;
{curs}
}} curs;
feature mark {{
{mark}
}} mark;
"""

    return fea


def makeFeatures(instance, source):
    font = instance.parent

    expander = TokenExpander(font, source)
    for x in list(font.featurePrefixes) + list(font.classes) + list(font.features):
        x.code = expander.expand(x.code)

    fea = ""
    for gclass in font.classes:
        if gclass.disabled:
            continue

        if gclass.automatic and "Temp" in gclass.name:
            other, ext1, ext2 = gclass.name.partition("Temp")
            other = font.classes[other]

            gclass.code = ""
            for name in other.code.split():
                newName = f"{name}.{ext1}{ext2}"
                if newName not in font.glyphs:
                    newGlyph = GSGlyph(newName)
                    newGlyph.category = "Other"
                    font.glyphOrder.append(newGlyph.name)
                    font.glyphs.append(newGlyph)

                    glyph = font.glyphs[name]
                    newLayer = GSLayer()
                    newLayer.associatedMasterId = glyph.layers[0].associatedMasterId
                    newLayer.layerId = glyph.layers[0].layerId
                    newGlyph.layers[newLayer.associatedMasterId] = newLayer
                gclass.code += " " + newName

        fea += f"@{gclass.name} = [{gclass.code}];\n"

    for prefix in font.featurePrefixes:
        if prefix.disabled:
            continue
        fea += prefix.code + "\n"

    for feature in font.features:
        if feature.disabled:
            continue
        if feature.name == "mark":
            fea += makeMark(instance, source)

        fea += f"""
feature {feature.name} {{
{feature.notes}
{feature.code}
}} {feature.name};
"""
        if feature.name == "kern":
            fea += makeKerning(font, source)

    mark = set()
    liga = set()
    base = set()
    carets = ""
    for glyph in font.glyphs:
        if not glyph.export:
            continue

        info = getGlyphInfo(glyph.name)
        if glyph.category:
            if glyph.category == "Mark" and glyph.subCategory == "Nonspacing":
                mark.add(glyph.name)
            elif glyph.category == "Letter" and glyph.subCategory == "Ligature":
                liga.add(glyph.name)
            elif glyph.category == "Letter":
                base.add(glyph.name)
        elif info.category:
            if info.category == "Mark" and info.subCategory == "Nonspacing":
                mark.add(glyph.name)
            elif info.category == "Letter" and info.subCategory == "Ligature":
                liga.add(glyph.name)
            elif info.category == "Letter":
                base.add(glyph.name)

        layer = glyph.layers[source.id]
        caret = ""
        for anchor in layer.anchors:
            if anchor.name.startswith("_"):
                mark.add(glyph.name)
            elif anchor.name.startswith("caret_"):
                _, index = anchor.name.split("_")
                if not caret:
                    caret = f"LigatureCaretByPos {glyph.name}"
                caret += f" {anchor.position.x}"
        if caret:
            carets += f"{caret};\n"

    fea += f"""
@BASE = [{" ".join(sorted(base))}];
@LIGA = [{" ".join(sorted(liga))}];
@MARK = [{" ".join(sorted(mark))}];
table GDEF {{
 GlyphClassDef @BASE, @LIGA, @MARK, ;
{carets}
}} GDEF;
"""

    return fea, mark


def calcFsSelection(instance):
    font = instance.parent
    fsSelection = 0
    if font.customParameters["Use Typo Metrics"]:
        fsSelection |= 1 << 7
    if instance.isItalic:
        fsSelection |= 1 << 1
    if instance.isBold:
        fsSelection |= 1 << 5
    if not (instance.isItalic or instance.isBold):
        fsSelection |= 1 << 6

    return fsSelection


def calcBits(bits, start, end):
    b = 0
    for i in reversed(range(start, end)):
        b = b << 1
        if i in bits:
            b = b | 0x1
    return b


def build(instance, isTTF, version):
    font = instance.parent
    source = font.masters[0]

    fea, marks = makeFeatures(instance, source)

    source.blueValues = []
    source.otherBlues = []

    for zone in sorted(source.alignmentZones):
        pos = zone.position
        size = zone.size
        vals = sorted((pos, pos + size))
        if pos == 0 or size >= 0:
            source.blueValues.extend(vals)
        else:
            source.otherBlues.extend(vals)

    fontinfo = f"""
        FontName {instance.fontName}
        OrigEmSqUnits {font.upm}
        DominantV {source.verticalStems}
        DominantH {source.horizontalStems}
        BaselineOvershoot {source.blueValues[0]}
        BaselineYCoord {source.blueValues[1]}
        LcHeight {source.blueValues[2]}
        LcOvershoot {source.blueValues[3] - source.blueValues[2]}
        CapHeight {source.blueValues[4]}
        CapOvershoot {source.blueValues[5] - source.blueValues[4]}
        AscenderHeight {source.blueValues[6]}
        AscenderOvershoot {source.blueValues[7] - source.blueValues[6]}
        Baseline5 {source.otherBlues[1]}
        Baseline5Overshoot {source.otherBlues[0] - source.otherBlues[1]}

        FlexOK true
        BlueFuzz 1
    """

    characterMap = {}
    glyphs = {}
    metrics = {}
    layerSet = {g.name: g.layers[source.id] for g in font.glyphs}

    if isTTF:
        from fontTools.pens.cu2quPen import Cu2QuPen
        from fontTools.pens.recordingPen import RecordingPen

        for glyph in font.glyphs:
            layer = glyph.layers[source.id]
            pen = RecordingPen()
            layer.draw(pen)
            layer.paths = []
            layer.components = []
            pen.replay(Cu2QuPen(layer.getPen(), 1.0, reverse_direction=True))

    for glyph in font.glyphs:
        if not glyph.export and not isTTF:
            continue
        name = glyph.name

        for code in glyph.unicodes:
            characterMap[int(code, 16)] = name

        layer = glyph.layers[source.id]
        width = 0 if name in marks else layer.width

        pen = BoundsPen(layerSet)
        layer.draw(pen)
        metrics[name] = (width, pen.bounds[0] if pen.bounds else 0)

        if isTTF:
            from fontTools.pens.ttGlyphPen import TTGlyphPen

            pen = TTGlyphPen(layerSet)
            if layer.paths:
                # Decompose and remove overlaps.
                path = Path()
                layer.draw(DecomposePathPen(path, layerSet))
                path.simplify(fix_winding=True, keep_starting_points=True)
                path.draw(pen)
            else:
                # Composite-only glyph, no need to decompose.
                layer.draw(FlattenComponentsPen(pen, layerSet))
            glyphs[name] = pen.glyph()
        else:
            from fontTools.pens.t2CharStringPen import T2CharStringPen

            # Draw glyph and remove overlaps.
            path = Path()
            layer.draw(DecomposePathPen(path, layerSet))
            path.simplify(fix_winding=True, keep_starting_points=True)

            # Build CharString.
            pen = T2CharStringPen(width, None)
            path.draw(pen)
            glyphs[name] = pen.getCharString()

    vendor = font.customParameters["vendorID"]
    names = {
        "copyright": font.copyright,
        "familyName": instance.familyName,
        "styleName": instance.name,
        "uniqueFontIdentifier": f"{version};{vendor};{instance.fontName}",
        "fullName": instance.fullName,
        "version": f"Version {version}",
        "psName": instance.fontName,
        "manufacturer": font.manufacturer,
        "designer": font.designer,
        "description": font.customParameters["description"],
        "vendorURL": font.manufacturerURL,
        "designerURL": font.designerURL,
        "licenseDescription": font.customParameters["license"],
        "licenseInfoURL": font.customParameters["licenseURL"],
        "sampleText": font.customParameters["sampleText"],
    }

    date = int(font.date.timestamp()) - epoch_diff
    fb = FontBuilder(font.upm, isTTF=isTTF)
    fb.updateHead(fontRevision=float(version), created=date, modified=date)
    fb.setupGlyphOrder(font.glyphOrder)
    fb.setupCharacterMap(characterMap)
    fb.setupNameTable(names, mac=False)
    fb.setupHorizontalHeader(
        ascent=source.ascender,
        descent=source.descender,
        lineGap=source.customParameters["typoLineGap"],
    )

    fb.setupHorizontalMetrics(metrics)

    if isTTF:
        from fontTools.ttLib.removeOverlaps import componentsOverlap
        from fontTools.ttLib.tables._g_l_y_f import OVERLAP_COMPOUND

        fb.setupGlyf(glyphs)

        # Set OVERLAP_COMPOUND flag on composite glyphs with overlapping
        # components.
        glyphSet = fb.font.getGlyphSet()
        for name in glyphs:
            glyph = glyphs[name]
            if glyph.isComposite() and componentsOverlap(glyph, glyphSet):
                glyph.components[0].flags |= OVERLAP_COMPOUND
    else:
        privateDict = {
            "BlueValues": source.blueValues,
            "OtherBlues": source.otherBlues,
            "StemSnapH": source.horizontalStems,
            "StemSnapV": source.verticalStems,
            "StdHW": source.horizontalStems[0],
            "StdVW": source.verticalStems[0],
        }

        fontInfo = {
            "FullName": names["fullName"],
            "Notice": names["copyright"].replace("©", "\(c\)"),
            "version": f"{version}",
            "Weight": instance.name,
        }

        fb.setupCFF(names["psName"], fontInfo, glyphs, privateDict)

    codePages = [CODEPAGE_RANGES[v] for v in font.customParameters["codePageRanges"]]
    fb.setupOS2(
        version=4,
        sTypoAscender=source.ascender,
        sTypoDescender=source.descender,
        sTypoLineGap=source.customParameters["typoLineGap"],
        usWinAscent=source.ascender,
        usWinDescent=-source.descender,
        sxHeight=source.xHeight,
        sCapHeight=source.capHeight,
        achVendID=vendor,
        fsType=calcBits(font.customParameters["fsType"], 0, 16),
        fsSelection=calcFsSelection(instance),
        ulUnicodeRange1=calcBits(font.customParameters["unicodeRanges"], 0, 32),
        ulCodePageRange1=calcBits(codePages, 0, 32),
    )

    underlineThickness = int(source.customParameters["underlineThickness"])
    underlinePosition = int(source.customParameters["underlinePosition"])
    fb.setupPost(
        keepGlyphNames=False,
        underlineThickness=underlineThickness,
        underlinePosition=underlinePosition + underlineThickness // 2,
    )

    fb.font["meta"] = meta = newTable("meta")
    meta.data = {"dlng": "Arab", "slng": "Arab"}

    fb.addOpenTypeFeatures(fea)

    if isTTF:
        from fontTools.ttLib.tables import ttProgram

        fb.font["gasp"] = gasp = newTable("gasp")
        gasp.gaspRange = {0xFFFF: 15}

        fb.font["prep"] = prep = newTable("prep")
        prep.program = ttProgram.Program()
        assembly = ["PUSHW[]", "511", "SCANCTRL[]", "PUSHB[]", "4", "SCANTYPE[]"]
        prep.program.fromAssembly(assembly)

    return fb.font


def propagateAnchors(layer):
    for component in layer.components:
        clayer = component.layer or component.component.layers[0]
        propagateAnchors(clayer)
        for anchor in clayer.anchors:
            names = [a.name for a in layer.anchors]
            name = anchor.name
            if name.startswith("_") or name in names:
                continue
            if name in ("entry", "exit"):
                continue
            x, y = anchor.position.x, anchor.position.y
            if component.transform != Identity:
                t = Transform(*component.transform.value)
                x, y = t.transformPoint((x, y))
            new = GSAnchor(name)
            new.position.x, new.position.y = (x, y)
            layer.anchors[name] = new


def prepare(font, isTTF):
    glyphOrder = []
    end = []
    for glyph in font.glyphs:
        if glyph.color == 0:
            end.append(glyph.name)
            for layer in glyph.layers:
                layer.components = []
                layer.width = 600
            continue
        glyphOrder.append(glyph.name)
        for layer in glyph.layers:
            propagateAnchors(layer)

    numbers = {
        "zero",
        "one",
        "two",
        "three",
        "four",
        "five",
        "six",
        "seven",
        "eight",
        "nine",
    }
    font.glyphOrder = [".notdef"]
    for name in glyphOrder:
        glyph = font.glyphs[name]
        if not glyph.export and not isTTF:
            continue
        if name == ".notdef":
            continue

        font.glyphOrder.append(name)
        if "." in name or name.split("-")[0] not in numbers:
            continue

        for tag in ["numr", "dnom"]:
            newGlyph = GSGlyph(f"{name}.{tag}")
            font.glyphOrder.append(newGlyph.name)

            font.glyphs.append(newGlyph)
            for feature in font.features:
                if feature.name == tag:
                    feature.code += f"sub {name} by {newGlyph.name};\n"

            newLayer = GSLayer()
            newLayer.associatedMasterId = glyph.layers[0].associatedMasterId
            newLayer.layerId = glyph.layers[0].layerId
            newGlyph.layers[newLayer.associatedMasterId] = newLayer

            scale = 0.7
            offset = 0 if tag == "dnom" else 300
            newComponent = GSComponent(name, (0, offset), (scale, scale))
            newLayer.components.append(newComponent)
            newLayer.width = ((glyph.layers[0].width - 40) * scale) + 40

    font.glyphOrder += end


def main():
    from argparse import ArgumentParser
    from pathlib import Path

    parser = ArgumentParser(description="Build Qahiri font.")
    parser.add_argument("input", help="input Glyphs source file", type=Path)
    parser.add_argument("version", help="font version", type=str)
    parser.add_argument("output", help="output font file", type=Path)
    args = parser.parse_args()

    isTTF = False
    if args.output.suffix == ".ttf":
        isTTF = True

    font = GSFont(args.input)
    prepare(font, isTTF)
    instance = font.instances[0]  # XXX

    otf = build(instance, isTTF, args.version)
    otf.save(args.output)


main()
