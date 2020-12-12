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

NAME = Qahiri

MAKEFLAGS := -sr
SHELL = bash

BUILDDIR = build
CONFIG = _config.yml
VERSION = $(shell python version.py $(CONFIG))
DIST = $(NAME)-$(VERSION)

.SECONDARY:
.ONESHELL:
.PHONY: all dist

all: $(NAME)-Regular.otf

$(BUILDDIR)/%.otf: $(NAME).glyphs $(CONFIG)
	$(info   BUILD  $(@F))
	mkdir -p $(BUILDDIR)
	python build.py $< $(VERSION) $@

%.otf: $(BUILDDIR)/%.otf
	$(info   SUBR   $(@F))
	python -m cffsubr --cff-version 1 -o $@ $<

%.ttf: %.otf
	$(info   BUILD  $(@F))
	python otf2ttf.py $< -o $@ --post-format 3

dist: all
	$(info   DIST   $(DIST).zip)
	install -Dm644 -t $(DIST) $(NAME)-Regular.otf
	install -Dm644 -t $(DIST) {README,README-Arabic}.txt
	zip -rq $(DIST).zip $(DIST)
