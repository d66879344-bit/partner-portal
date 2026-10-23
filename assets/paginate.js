/* Tiny shared client-side pagination helper, used by the admin panel and the
   partner dashboard wherever a list is rendered in full from already-loaded
   data (Partners, Orders, Finance everywhere) and can grow large enough that
   scrolling through it all gets tedious. Nothing here talks to the server —
   it just slices an already-filtered/sorted array and renders a small
   Prev/Next bar; the labels are passed in so the partner-facing pages can
   translate them while the English-only admin panel just hardcodes English. */
window.Paginate = (function () {
  function clamp(page, pages) {
    page = Number(page) || 1;
    return Math.max(1, Math.min(pages, page));
  }
  function totalPages(count, pageSize) {
    return Math.max(1, Math.ceil((count || 0) / pageSize));
  }
  // Slices `items` to the given page (1-based), clamping the page first so a
  // stale page number (e.g. after a filter removes rows) never returns [].
  function slice(items, page, pageSize) {
    var pages = totalPages(items.length, pageSize);
    var p = clamp(page, pages);
    var start = (p - 1) * pageSize;
    return { page: p, pages: pages, items: items.slice(start, start + pageSize) };
  }
  function barHtml(page, pages, opts) {
    if (pages <= 1) return "";
    opts = opts || {};
    var prevLabel = opts.prevLabel || "← Prev";
    var nextLabel = opts.nextLabel || "Next →";
    var pageLabel = (opts.pageLabel || "Page {page} of {pages}")
      .replace("{page}", page).replace("{pages}", pages);
    return '<div class="pager">' +
      '<button type="button" class="minibtn" data-pager-prev' + (page <= 1 ? " disabled" : "") + ">" + prevLabel + "</button>" +
      '<span class="pager-label">' + pageLabel + "</span>" +
      '<button type="button" class="minibtn" data-pager-next' + (page >= pages ? " disabled" : "") + ">" + nextLabel + "</button>" +
      "</div>";
  }
  return { clamp: clamp, totalPages: totalPages, slice: slice, barHtml: barHtml };
})();
