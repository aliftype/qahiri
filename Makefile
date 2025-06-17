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

NAME = Qahiri

SHELL = bash
MAKEFLAGS := -sr
PYTHON := venv/bin/python3

SOURCEDIR = sources
FONTDIR = fonts
TESTDIR = tests

FONT = ${FONTDIR}/${NAME}-Regular.ttf
SVG = FontSample.svg

GLYPHSFILE = ${SOURCEDIR}/${NAME}.glyphspackage

export SOURCE_DATE_EPOCH ?= $(shell stat -c "%Y" ${GLYPHSFILE})

TAG = $(shell git describe --tags --abbrev=0)
VERSION = ${TAG:v%=%}
DIST = ${NAME}-${VERSION}


.SECONDARY:
.ONESHELL:
.PHONY: all clean dist ttf doc

all: ttf doc
ttf: ${FONT}
doc: ${SVG}

${FONT}: ${GLYPHSFILE}
	$(info   BUILD  ${@F})
	${PYTHON} -m fontmake $< \
			      --output-path=$@ \
			      --output=ttf \
			      --verbose=WARNING \
			      --flatten-components \
			      --filter ... \
			      --filter DecomposeTransformedComponentsFilter \
			      --filter "alifTools.filters::ClearPlaceholdersFilter()" \
			      --filter "alifTools.filters::FontVersionFilter(fontVersion=${VERSION})"

${SVG}: ${FONT}
	$(info   SVG    ${@F})
	${PYTHON} -m alifTools.sample $< \
				      -t "أبجد هوز حطي كلمن٠١٢٣،؛:؟!" \
				      -f "salt[11:12]=5" \
				      --foreground=000000 \
				      --dark-foreground=FFFFFF \
				      -o $@

dist: ${FONT}
	$(info   DIST   ${DIST}.zip)
	install -Dm644 -t ${DIST} ${FONT}
	install -Dm644 -t ${DIST} {README,README-Arabic}.md
	install -Dm644 -t ${DIST} OFL.txt
	zip -rq ${DIST}.zip ${DIST}

clean:
	rm -rf ${FONT} ${SVG} ${DIST} ${DIST}.zip
