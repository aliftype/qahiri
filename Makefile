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

all: $(NAME)-Regular.otf $(NAME)-Regular.ttx

$(BUILDDIR)/%.otf: $(NAME).glyphs $(CONFIG)
	$(info   BUILD  $(*F))
	mkdir -p $(BUILDDIR)
	python build.py $< $(VERSION) $@ $(BUILDDIR)/$(*F).cff $(BUILDDIR)/$(*F).cidinfo $(BUILDDIR)/$(*F).cidmap

$(BUILDDIR)/%.cid: $(BUILDDIR)/%.otf
	$(info   CID    $(*F))
	mergefonts -cid $(BUILDDIR)/$(*F).cidinfo $@ $(BUILDDIR)/$(*F).cidmap $(BUILDDIR)/$(*F).cff 2>/dev/null

$(BUILDDIR)/%.subr.cff: $(BUILDDIR)/%.cid
	$(info   SUBR   $(*F))
	tx -cff +S +b $< $@

%.otf: $(BUILDDIR)/%.subr.cff $(BUILDDIR)/%.otf
	sfntedit -a CFF=$+ $@

%.ttx: $(BUILDDIR)/%.otf
	$(info   TTX    $(*F))
	ttx -q -o $@ $<

dist: all
	$(info   DIST   $(DIST).zip)
	install -Dm644 -t $(DIST) $(NAME)-Regular.otf
	install -Dm644 -t $(DIST) {README,README-Arabic}.txt
	zip -rq $(DIST).zip $(DIST)
