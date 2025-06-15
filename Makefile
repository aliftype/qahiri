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
SCRIPTDIR = scripts
FONTDIR = fonts
TESTDIR = tests
BUILDDIR = build

FONT = ${FONTDIR}/${NAME}-Regular.ttf

GLYPHSFILE = ${SOURCEDIR}/${NAME}.glyphspackage

export SOURCE_DATE_EPOCH ?= $(shell stat -c "%Y" ${GLYPHSFILE})

TAG = $(shell git describe --tags --abbrev=0)
VERSION = ${TAG:v%=%}
DIST = ${NAME}-${VERSION}


.SECONDARY:
.ONESHELL:
.PHONY: all clean dist ttf

all: ttf
ttf: ${FONT}

${FONT}: ${GLYPHSFILE}
	$(info   BUILD  ${@F})
	${PYTHON} ${SCRIPTDIR}/build.py $< ${VERSION} $@

dist: ${FONT}
	$(info   DIST   ${DIST}.zip)
	install -Dm644 -t ${DIST} ${FONT}
	install -Dm644 -t ${DIST} {README,README-Arabic}.md
	install -Dm644 -t ${DIST} OFL.txt
	zip -rq ${DIST}.zip ${DIST}

clean:
	rm -rf ${BUILDDIR} ${FONT} ${SVG} ${DIST} ${DIST}.zip
