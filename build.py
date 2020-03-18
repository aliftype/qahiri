# Copyright (c) 2020 Khaled Hosny
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

import argparse

from fontTools.designspaceLib import DesignSpaceDocument
from fontTools.fontBuilder import FontBuilder
from fontTools.ttLib import TTFont, newTable, getTableModule
from fontTools.misc.timeTools import epoch_diff
from fontTools.misc.transform import Transform
from fontTools.pens.pointPen import PointToSegmentPen
from fontTools.pens.reverseContourPen import ReverseContourPen
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.transformPen import TransformPen
from glyphsLib import GSFont, GSAnchor
from glyphsLib.builder.constants import CODEPAGE_RANGES
from glyphsLib.glyphdata import get_glyph as getGlyphInfo
from pathops import Path


DEFAULT_TRANSFORM = [1, 0, 0, 1, 0, 0]


def draw(layer, instance, pen):
    pen = PointToSegmentPen(pen)

    for path in layer.paths:
        nodes = list(path.nodes)

        pen.beginPath()
        if nodes:
            if not path.closed:
                node = nodes.pop(0)
                assert node.type == "line", "Open path starts with off-curve points"
                pen.addPoint(tuple(node.position), segmentType="move")
            else:
                # In Glyphs.app, the starting node of a closed contour is always
                # stored at the end of the nodes list.
                nodes.insert(0, nodes.pop())
            for node in nodes:
                node_type = node.type
                if node_type not in ["line", "curve", "qcurve"]:
                    node_type = None
                pen.addPoint(tuple(node.position), segmentType=node_type, smooth=node.smooth)
        pen.endPath();

    for component in layer.components:
        componentLayer = getLayer(component.component, instance)
        transform = component.transform.value
        componentPen = pen.pen
        if transform != DEFAULT_TRANSFORM:
            componentPen = TransformPen(pen.pen, transform)
            xx, xy, yx, yy = transform[:4]
            if xx * yy - xy * yx < 0:
                componentPen = ReverseContourPen(componentPen)
        draw(componentLayer, instance, componentPen)

    return pen.pen


def makeKerning(font, master):
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

    kerning = font.kerning[master.id]
    pairs = ""
    classes = "";
    enums = "";
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


def getLayer(glyph, instance):
    for layer in glyph.layers:
        if layer.name == instance.name:
            return layer
    return glyph.layers[0]


def makeMark(instance):
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

        layer = getLayer(glyph, instance)
        for anchor in layer.anchors:
            name, x, y = anchor.name, anchor.position.x, anchor.position.y
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
        for component, anchors in components.items():
            if component != "1":
                mark += " ligComponent"
            for anchor, (x, y) in anchors:
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


def makeFeatures(instance, master):
    font = instance.parent

    fea = ""
    for gclass in font.classes:
        if gclass.disabled:
            continue
        fea += f"@{gclass.name} = [{gclass.code}];\n"

    for prefix in font.featurePrefixes:
        if prefix.disabled:
            continue
        fea += prefix.code + "\n"

    for feature in font.features:
        if feature.disabled:
            continue
        if feature.name == "mark":
            fea += makeMark(instance)

        fea += f"""
feature {feature.name} {{
{feature.notes}
{feature.code}
}} {feature.name};
"""
        if feature.name == "kern":
            fea += makeKerning(font, master)

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

        layer = getLayer(glyph, instance)
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

    with open(f"{instance.fontName}.fea", "w") as f:
        f.write(fea)
    return fea, mark


def calcFsSelection(instance):
    font = instance.parent
    fsSelection = 0
    if font.customParameters["Use Typo Metrics"]:
        fsSelection |= (1 << 7)
    if instance.isItalic:
        fsSelection |= (1 << 1)
    if instance.isBold:
        fsSelection |= (1 << 5)
    if not (instance.isItalic or instance.isBold):
        fsSelection |= (1 << 6)

    return fsSelection


def calcBits(bits, start, end):
    b = 0
    for i in reversed(range(start, end)):
        b = b << 1
        if i in bits:
            b = b | 0x1
    return b



def build(instance, opts):
    font = instance.parent
    master = font.masters[0]

    fea, marks = makeFeatures(instance, master)

    glyphOrder = []
    advanceWidths = {}
    characterMap = {}
    charStrings = {}
    for glyph in font.glyphs:
        if not glyph.export:
            continue
        name = glyph.name

        glyphOrder.append(name)
        if glyph.unicode:
            characterMap[int(glyph.unicode, 16)] = name

        layer = getLayer(glyph, instance)
        width = 0 if name in marks else layer.width
        path = Path()
        draw(layer, instance, path.getPen())
        path.simplify(fix_winding=True, keep_starting_points=True)
        pen = T2CharStringPen(width, None)
        path.draw(pen)
        charStrings[name] = pen.getCharString(optimize=False)
        advanceWidths[name] = width

    # XXX
    glyphOrder.pop(glyphOrder.index(".notdef"))
    glyphOrder.pop(glyphOrder.index("space"))
    glyphOrder.insert(0, ".notdef")
    glyphOrder.insert(1, "space")

    version = float(opts.version)
    vendor = font.customParameters["vendorID"]
    names = {
        "copyright": font.copyright,
        "familyName": instance.familyName,
        "styleName": instance.name,
        "uniqueFontIdentifier": f"{version:.03f};{vendor};{instance.fontName}",
        "fullName": instance.fullName,
        "version": f"Version {version:.03f}",
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
    fb = FontBuilder(font.upm, isTTF=False)
    fb.updateHead(fontRevision=version, created=date, modified=date)
    fb.setupGlyphOrder(glyphOrder)
    fb.setupCharacterMap(characterMap)
    fb.setupNameTable(names, mac=False)
    fb.setupHorizontalHeader(ascent=master.ascender, descent=master.descender,
                             lineGap=master.customParameters["typoLineGap"])

    privateDict = {
        "BlueValues": [],
        "OtherBlues": [],
        "StemSnapH": master.horizontalStems,
        "StemSnapV": master.verticalStems,
        "StdHW": master.horizontalStems[0],
        "StdVW": master.verticalStems[0],
    }
    for zone in sorted(master.alignmentZones):
        pos = zone.position
        size = zone.size
        vals = privateDict["BlueValues"] if pos == 0 or size >= 0 else privateDict["OtherBlues"]
        vals.extend(sorted((pos, pos + size)))

    fontInfo = {
        "FullName": names["fullName"],
        "Notice": names["copyright"].replace("©", "\(c\)"),
        "version": f"{version:07.03f}",
        "Weight": instance.name,
    }
    fb.setupCFF(names["psName"], fontInfo, charStrings, privateDict)

    metrics = {}
    for i, (name, width) in enumerate(advanceWidths.items()):
        bounds = charStrings[name].calcBounds(None) or [0]
        metrics[name] = (width, bounds[0])
    fb.setupHorizontalMetrics(metrics)

    codePages = [CODEPAGE_RANGES[v] for v in font.customParameters["codePageRanges"]]
    fb.setupOS2(version=4, sTypoAscender=master.ascender,
                sTypoDescender=master.descender,
                sTypoLineGap=master.customParameters["typoLineGap"],
                usWinAscent=master.ascender, usWinDescent=-master.descender,
                sxHeight=master.xHeight, sCapHeight=master.capHeight,
                achVendID=vendor,
                fsType=calcBits(font.customParameters["fsType"], 0, 16),
                fsSelection=calcFsSelection(instance),
                ulUnicodeRange1=calcBits(font.customParameters["unicodeRanges"], 0, 32),
                ulCodePageRange1=calcBits(codePages, 0, 32))

    ut = int(master.customParameters["underlineThickness"])
    up = int(master.customParameters["underlinePosition"])
    fb.setupPost(underlineThickness=ut, underlinePosition=up + ut//2)

    fb.addOpenTypeFeatures(fea)

    cidinfo = f"""
FontName	({names["psName"]})
FamilyName	({names["familyName"]})
Weight	({fontInfo["Weight"]})
version	({fontInfo["version"]})
Notice	({fontInfo["Notice"]})
Registry	Adobe
Ordering	Identity
Supplement	0
"""

    cidmap = f"mergefonts {instance.fontName}\n" \
            + "\n".join([f"{i} {n}" for i, n in enumerate(glyphOrder)])

    return fb.font, cidinfo, cidmap


def propogateAnchors(layer):
    for component in layer.components:
        clayer = component.layer or component.component.layers[0]
        propogateAnchors(clayer)
        for anchor in clayer.anchors:
            names = [a.name for a in layer.anchors]
            name = anchor.name
            if name.startswith("_") or name in names:
                continue
            if name in ("entry", "exit"):
                continue
            x, y = anchor.position.x, anchor.position.y
            if component.transform != DEFAULT_TRANSFORM:
                t = Transform(*component.transform.value)
                x, y = t.transformPoint((x, y))
            new = GSAnchor(name)
            new.position.x, new.position.y = (x, y)
            layer.anchors[name] = new


def prepare(font):
    for glyph in font.glyphs:
        if not glyph.export:
            continue
        for layer in glyph.layers:
            propogateAnchors(layer)


def main():
    parser = argparse.ArgumentParser(description="Build Rana Kufi.")
    parser.add_argument("glyphs", help="input Glyphs source file")
    parser.add_argument("version",help="font version")
    parser.add_argument("otf",    help="output OTF file")
    parser.add_argument("cidinfo",help="output CID info file")
    parser.add_argument("cidmap", help="output CID map file")
    args = parser.parse_args()

    font = GSFont(args.glyphs)
    prepare(font)
    instance = font.instances[0] # XXX
    otf, cidinfo, cidmap = build(instance, args)

    with open(args.cidinfo, "w") as fp:
        fp.write(cidinfo)
    with open(args.cidmap, "w") as fp:
        fp.write(cidmap)
    otf.save(args.otf)

main()
