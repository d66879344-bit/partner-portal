// A small single-select "type to search" combobox, used for the country and
// city-of-service fields on registration. Shares the .ac-search/.ac-suggest
// markup and styling with the airport picker's search box.
//
// window.Combobox.create(container, {
//   items: [[value, label], ...],   // selectable options
//   placeholder: "…",
//   value: initialValue,            // optional, must match an item's value
//   allowFreeText: false,           // if true, typed text that matches no item
//                                   // is still accepted as a plain-text value
//                                   // (used for "city of service" — our airport
//                                   // data doesn't cover every city)
//   onChange: function (value, label) {},
// })
// returns { getValue(), getLabel(), setItems(items), setValue(value), clear() }
(function () {
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function create(container, opts) {
    opts = opts || {};
    var items = (opts.items || []).slice();
    var allowFreeText = !!opts.allowFreeText;
    var onChange = opts.onChange || function () {};
    var value = null;
    var label = "";

    container.innerHTML =
      '<div class="ac-wrap">' +
      '<input type="text" class="ac-search" autocomplete="off" placeholder="' + esc(opts.placeholder || "Start typing…") + '">' +
      '<div class="ac-suggest" hidden></div>' +
      "</div>";
    var inputEl = container.querySelector(".ac-search");
    var suggestEl = container.querySelector(".ac-suggest");

    function findItem(val) {
      for (var i = 0; i < items.length; i++) if (items[i][0] === val) return items[i];
      return null;
    }
    function findByLabel(text) {
      var q = text.trim().toLowerCase();
      for (var i = 0; i < items.length; i++) if (items[i][1].toLowerCase() === q) return items[i];
      return null;
    }
    function commit(val, lbl) {
      value = val;
      label = lbl;
      onChange(value, label);
    }
    function renderSuggestions(query) {
      var q = query.trim().toLowerCase();
      var matches = !q ? items.slice(0, 8) : items.filter(function (it) {
        return it[1].toLowerCase().indexOf(q) !== -1;
      }).slice(0, 8);

      if (!matches.length) {
        if (!items.length) {
          suggestEl.innerHTML = allowFreeText
            ? '<div class="ac-suggest-empty">No list for this selection yet — your typed text will be used as-is.</div>'
            : '<div class="ac-suggest-empty">No matches.</div>';
        } else {
          suggestEl.innerHTML = '<div class="ac-suggest-empty">No matches.</div>';
        }
        suggestEl.hidden = false;
        return;
      }
      suggestEl.innerHTML = matches.map(function (it) {
        return '<div class="ac-suggest-item" data-pick="' + esc(it[0]) + '">' + esc(it[1]) + "</div>";
      }).join("");
      suggestEl.hidden = false;
    }
    function pick(val) {
      var item = findItem(val);
      if (!item) {
        // Not one of the curated options — in free-text mode (e.g. restoring a
        // previously saved city our airport list doesn't cover) use the raw
        // string itself as both value and label; otherwise this is a no-op.
        if (allowFreeText && val) {
          inputEl.value = String(val);
          commit(String(val), String(val));
          suggestEl.hidden = true;
        }
        return;
      }
      inputEl.value = item[1];
      commit(item[0], item[1]);
      suggestEl.hidden = true;
    }
    function commitTypedText() {
      var text = inputEl.value.trim();
      if (!text) { value = null; label = ""; onChange(null, ""); return; }
      var match = findByLabel(text);
      if (match) { pick(match[0]); return; }
      if (allowFreeText) {
        commit(text, text);
      } else {
        // Strict mode: unresolved text is not a valid selection.
        value = null;
        label = "";
      }
    }

    inputEl.addEventListener("input", function () { renderSuggestions(inputEl.value); });
    inputEl.addEventListener("focus", function () { renderSuggestions(inputEl.value); });
    inputEl.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      e.preventDefault();
      var first = suggestEl.hidden ? null : suggestEl.querySelector("[data-pick]");
      if (first) { pick(first.getAttribute("data-pick")); }
      else { commitTypedText(); suggestEl.hidden = true; }
    });
    inputEl.addEventListener("blur", function () {
      // Let a click on a suggestion register before we close/validate.
      setTimeout(function () {
        if (suggestEl.hidden) commitTypedText();
      }, 150);
    });
    suggestEl.addEventListener("mousedown", function (e) {
      var item = e.target.closest("[data-pick]");
      if (!item) return;
      e.preventDefault();
      pick(item.getAttribute("data-pick"));
    });
    document.addEventListener("click", function (e) {
      if (!container.contains(e.target)) suggestEl.hidden = true;
    });

    if (opts.value != null) pick(opts.value);

    return {
      getValue: function () { return value; },
      getLabel: function () { return label; },
      setItems: function (newItems) { items = (newItems || []).slice(); },
      setValue: function (val) {
        if (val == null) { inputEl.value = ""; value = null; label = ""; return; }
        pick(val);
      },
      clear: function () { inputEl.value = ""; value = null; label = ""; suggestEl.hidden = true; },
    };
  }

  window.Combobox = { create: create };
})();
