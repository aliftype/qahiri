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

import { View } from "./TextView.js"

let fontFile = "./assets/fonts/RanaKufi.otf";

window.Module = {
  "onRuntimeInitialized": function() {
    fetch(fontFile).then(function (res) {
      return res.arrayBuffer();
    }).then(function (blob) {
      let view = new View(blob);
      view.update();

      document.getElementById("open").addEventListener("click", e => view.open(e.value));
      document.getElementById("save").addEventListener("click", e => view.save());
      document.getElementById("export").addEventListener("click", e => view.export());

      [].forEach.call(document.getElementsByClassName("opts"), function(el) {
        el.addEventListener("change", e => view.update());
      });

      let range = document.getElementById("font-size");
      let number = document.getElementById("font-size-number");
      range.addEventListener('input', e => {
        number.value = e.target.value;
        view.update()
      });
      number.addEventListener('change', e => {
        range.value = e.target.value;
        view.update()
      });
    });
  }
};
