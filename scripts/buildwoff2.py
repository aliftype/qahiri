from fontTools.ttLib import TTFont
from fontTools.ttLib.woff2 import WOFF2FlavorData


def compress(args):
    font = TTFont(args.input, recalcBBoxes=False, recalcTimestamp=False)
    font.flavor = "woff2"

    if "SVG " in font:
        del font["SVG "]

    font.flavorData = WOFF2FlavorData(
        data=font.flavorData, transformedTables=["glyf", "loca"]
    )

    font.save(args.output, reorderTables=False)


def main():
    import argparse
    from pathlib import Path

    parser = argparse.ArgumentParser(description="Build Raqq WOFF2 font.")
    parser.add_argument("input", help="input TTF file", type=Path)
    parser.add_argument("output", help="output WOFF2 file", type=Path)
    args = parser.parse_args()

    compress(args)


main()
