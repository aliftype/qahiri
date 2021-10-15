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

import { View } from "./TextView.js"
import { FONT_FILE } from "./Config.js"
import Module from "./hb.js"

if ('serviceWorker' in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./ServiceWorker.js");
  });
}

Module().then(function (m) {
  window.M = m;
  fetch(FONT_FILE).then(res => {
    return res.arrayBuffer();
  }).then(blob => {
    let view = new View(blob);
    view.update();

    document.getElementById("open").addEventListener("click", e => view.open());
    document.getElementById("save").addEventListener("click", e => view.save());
    document.getElementById("clear").addEventListener("click", e => view.clear());

    const isMac = ~navigator.userAgent.indexOf('Mac OS X');
    document.addEventListener("keydown", e => {
      if (((!isMac && e.ctrlKey) || (isMac && e.metaKey)) && !e.isComposing) {
        if (e.key == "s") {
          e.preventDefault();
          view.save();
        } else if (e.key == "o") {
          e.preventDefault();
          view.open();
        }
      }
    });

    [].forEach.call(document.getElementsByClassName("opts"), function(el) {
      el.addEventListener("change", e => view.update());
    });

    let range = document.getElementById("font-size");
    let number = document.getElementById("font-size-number");
    range.addEventListener('input', e => {
      number.value = e.target.value;
      view.update(true)
    });
    number.addEventListener('change', e => {
      range.value = e.target.value;
      view.update(true)
    });
    window.addEventListener("resize", e => {
      view.update()
    });
  });
});
