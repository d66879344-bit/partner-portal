/* City -> 2-letter code used as the first two characters of auto-generated order
   numbers (see assets/admin.js). Admin-only; not used anywhere on the partner side.

   How a code is chosen for a partner's "City of service":
   1. If the city (lowercased, trimmed) is listed in OVERRIDES below, that code wins.
   2. Otherwise it's generated automatically:
      - two or more words -> first letter of each of the first two words (New York -> NY)
      - one word -> its first two letters (Madrid -> MA)
      - empty / unusable -> "XX"

   To pin a specific code for a city (e.g. because the automatic one isn't the one
   you want), just add a line to OVERRIDES — lowercase the city name exactly as
   partners type it in "City of service".
*/
(function (global) {
  var OVERRIDES = {
    "barcelona": "BC",
  };

  function algoCode(city) {
    var words = (city || "").trim().split(/\s+/).filter(Boolean);
    if (!words.length) return "XX";
    if (words.length >= 2) {
      var a = words[0].replace(/[^a-zA-Z]/g, "").charAt(0) || "X";
      var b = words[1].replace(/[^a-zA-Z]/g, "").charAt(0) || "X";
      return (a + b).toUpperCase();
    }
    var letters = words[0].replace(/[^a-zA-Z]/g, "");
    if (letters.length >= 2) return letters.slice(0, 2).toUpperCase();
    if (letters.length === 1) return (letters + "X").toUpperCase();
    return "XX";
  }

  function codeFor(city) {
    var key = (city || "").trim().toLowerCase();
    if (key && Object.prototype.hasOwnProperty.call(OVERRIDES, key)) return OVERRIDES[key];
    return algoCode(city);
  }

  global.CityCodes = { codeFor: codeFor, OVERRIDES: OVERRIDES };
})(typeof window !== "undefined" ? window : this);
