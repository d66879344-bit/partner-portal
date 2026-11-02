// A tiny, dependency-free .xlsx (OOXML SpreadsheetML) writer built directly
// on the ZIP file format (STORED entries only - no DEFLATE compression).
// Written from scratch because this project has no build step / npm install
// at deploy time, so nothing outside the Workers runtime's own APIs can be
// relied on to produce a real Excel file.

const CRC_TABLE = (function () {
  var table = new Uint32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  var crc = 0xffffffff;
  for (var i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toBytes(str) {
  return new TextEncoder().encode(str);
}

function u16(n) {
  return [n & 0xff, (n >>> 8) & 0xff];
}

function u32(n) {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

function dosDateTime(d) {
  var time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() >> 1) & 0x1f);
  var date = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0xf) << 5) | (d.getDate() & 0x1f);
  return { time: time & 0xffff, date: date & 0xffff };
}

function concatBytes(chunks) {
  var total = 0;
  for (var i = 0; i < chunks.length; i++) total += chunks[i].length;
  var out = new Uint8Array(total);
  var offset = 0;
  for (var j = 0; j < chunks.length; j++) {
    out.set(chunks[j], offset);
    offset += chunks[j].length;
  }
  return out;
}

function buildZip(files) {
  var now = new Date();
  var dt = dosDateTime(now);
  var localParts = [];
  var centralParts = [];
  var offset = 0;

  files.forEach(function (f) {
    var nameBytes = toBytes(f.name);
    var data = f.data;
    var crc = crc32(data);
    var size = data.length;

    var localHeader = concatBytes([
      new Uint8Array(u32(0x04034b50)),
      new Uint8Array(u16(20)),
      new Uint8Array(u16(0)),
      new Uint8Array(u16(0)),
      new Uint8Array(u16(dt.time)),
      new Uint8Array(u16(dt.date)),
      new Uint8Array(u32(crc)),
      new Uint8Array(u32(size)),
      new Uint8Array(u32(size)),
      new Uint8Array(u16(nameBytes.length)),
      new Uint8Array(u16(0)),
    ]);

    var localEntry = concatBytes([localHeader, nameBytes, data]);
    localParts.push(localEntry);

    var centralHeader = concatBytes([
      new Uint8Array(u32(0x02014b50)),
      new Uint8Array(u16(20)),
      new Uint8Array(u16(20)),
      new Uint8Array(u16(0)),
      new Uint8Array(u16(0)),
      new Uint8Array(u16(dt.time)),
      new Uint8Array(u16(dt.date)),
      new Uint8Array(u32(crc)),
      new Uint8Array(u32(size)),
      new Uint8Array(u32(size)),
      new Uint8Array(u16(nameBytes.length)),
      new Uint8Array(u16(0)),
      new Uint8Array(u16(0)),
      new Uint8Array(u16(0)),
      new Uint8Array(u16(0)),
      new Uint8Array(u32(0)),
      new Uint8Array(u32(offset)),
    ]);
    centralParts.push(concatBytes([centralHeader, nameBytes]));

    offset += localEntry.length;
  });

  var centralDirectory = concatBytes(centralParts);
  var localSection = concatBytes(localParts);
  var centralDirOffset = localSection.length;
  var centralDirSize = centralDirectory.length;

  var eocd = concatBytes([
    new Uint8Array(u32(0x06054b50)),
    new Uint8Array(u16(0)),
    new Uint8Array(u16(0)),
    new Uint8Array(u16(files.length)),
    new Uint8Array(u16(files.length)),
    new Uint8Array(u32(centralDirSize)),
    new Uint8Array(u32(centralDirOffset)),
    new Uint8Array(u16(0)),
  ]);

  return concatBytes([localSection, centralDirectory, eocd]);
}

function xmlEscape(s) {
  return String(s == null ? "" : s)
    .replace(/[&<>"']/g, function (ch) {
      if (ch === "&") return "&amp;";
      if (ch === "<") return "&lt;";
      if (ch === ">") return "&gt;";
      if (ch === '"') return "&quot;";
      return "&apos;";
    })
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
}

function colLetter(idx) {
  var s = "";
  var n = idx + 1;
  while (n > 0) {
    var rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function inlineStrCell(ref, value) {
  return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + xmlEscape(value) + "</t></is></c>";
}

function buildSheetXml(header, rows) {
  var xml = [];
  xml.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  xml.push('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">');
  xml.push("<sheetData>");

  var headerCells = header.map(function (h, i) { return inlineStrCell(colLetter(i) + "1", h); }).join("");
  xml.push('<row r="1">' + headerCells + "</row>");

  rows.forEach(function (row, rIdx) {
    var r = rIdx + 2;
    var cells = row.map(function (val, cIdx) { return inlineStrCell(colLetter(cIdx) + r, val); }).join("");
    xml.push('<row r="' + r + '">' + cells + "</row>");
  });

  xml.push("</sheetData>");
  xml.push("</worksheet>");
  return xml.join("");
}

var CONTENT_TYPES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  "</Types>";

var ROOT_RELS_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  "</Relationships>";

var WORKBOOK_RELS_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  "</Relationships>";

function buildWorkbookXml(sheetName) {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    "<sheets>" +
    '<sheet name="' + xmlEscape(sheetName) + '" sheetId="1" r:id="rId1"/>' +
    "</sheets>" +
    "</workbook>";
}

function buildXlsx(header, rows, sheetName) {
  var name = (sheetName || "Sheet1").slice(0, 31);
  var files = [
    { name: "[Content_Types].xml", data: toBytes(CONTENT_TYPES_XML) },
    { name: "_rels/.rels", data: toBytes(ROOT_RELS_XML) },
    { name: "xl/workbook.xml", data: toBytes(buildWorkbookXml(name)) },
    { name: "xl/_rels/workbook.xml.rels", data: toBytes(WORKBOOK_RELS_XML) },
    { name: "xl/worksheets/sheet1.xml", data: toBytes(buildSheetXml(header, rows)) },
  ];
  return buildZip(files);
}

// Builds a .xlsx file for the admin Passengers export: one row per trip.
export function buildPassengersXlsx(passengers) {
  var header = ["Name", "Phone", "City", "Trip date", "Order #", "Partner"];
  var rows = passengers.map(function (p) {
    return [
      p.name || "",
      p.phone || "",
      p.city || "",
      p.tripDate || "",
      p.orderNumber != null ? String(p.orderNumber) : "",
      p.companyName || "",
    ];
  });
  return buildXlsx(header, rows, "Passengers");
}
