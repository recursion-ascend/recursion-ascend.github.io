/* Photo gallery: justified rows + lightbox. Data comes from gallery/photos.json,
   which tools/gallery.py maintains. */
(function () {
  "use strict";
  var S = window.Site;
  var grid = document.getElementById("grid");
  if (!S || !grid) return;

  var state = document.getElementById("state");
  var albumsEl = document.getElementById("albums");
  var photos = [], shown = [], album = null;

  var MSG = {
    empty: '<span class="en">No photos yet — add some with <code>python3 tools/gallery.py add …</code></span>' +
      '<span class="zh" lang="zh-CN">还没有照片——用 <code>python3 tools/gallery.py add …</code> 添加。</span>',
    error: '<span class="en">Could not load photos.</span><span class="zh" lang="zh-CN">照片加载失败。</span>'
  };

  function src(p, kind) { return (kind === "thumb" ? "thumbs/" : "photos/") + encodeURIComponent(p.name) + ".jpg"; }
  var PIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>';
  function caption(p) { return S.pick(p, "caption") || ""; }
  function place(p) { return S.pick(p, "location") || ""; }
  function meta(p) {
    var parts = [];
    if (p.date) parts.push(S.esc(S.fmtDate(p.date)));
    if (p.album) parts.push(S.esc(p.album));
    return parts.join(" · ");
  }

  /* ---------- justified rows ---------- */
  function layout() {
    var W = grid.clientWidth;
    if (!W) return;
    var GAP = parseFloat(getComputedStyle(grid).columnGap) || 8;
    var target = W < 640 ? 150 : W < 1000 ? 210 : 270;
    var tiles = grid.children, row = [], sumAR = 0;
    function place(items, h, stretch) {
      var used = 0;
      items.forEach(function (it, i) {
        var w = Math.floor(it.ar * h);
        if (stretch && i === items.length - 1) w = W - used - GAP * (items.length - 1); // absorb rounding
        used += w;
        it.el.style.width = w + "px";
        it.el.style.height = Math.round(h) + "px";
      });
    }
    for (var i = 0; i < tiles.length; i++) {
      var el = tiles[i], p = shown[i];
      var ar = p.w && p.h ? p.w / p.h : 1.5;
      row.push({ el: el, ar: ar });
      sumAR += ar;
      if (sumAR * target + GAP * (row.length - 1) >= W) {
        place(row, (W - GAP * (row.length - 1)) / sumAR, true);
        row = []; sumAR = 0;
      }
    }
    if (row.length) place(row, target, false); // last row keeps its natural height
  }

  function render() {
    shown = photos.filter(function (p) { return !album || p.album === album; });
    grid.innerHTML = shown.map(function (p, i) {
      var cap = caption(p), loc = place(p);
      return '<a class="tile' + (loc ? " has-loc" : "") + '" href="' + src(p, "full") + '" data-i="' + i + '" style="background:' + S.esc(p.color || "") + '">' +
        '<img src="' + src(p, "thumb") + '" alt="' + S.esc(cap || loc || p.name) + '" loading="lazy" decoding="async"' +
        (p.w ? ' width="' + p.w + '" height="' + p.h + '"' : "") + ">" +
        (cap || p.date || loc ? '<span class="tile-cap">' +
          (cap || p.date ? '<span class="cap-main"><span>' + S.esc(cap) + "</span>" +
            (p.date ? '<small class="mono">' + S.esc(S.fmtDate(p.date)) + "</small>" : "") + "</span>" : "") +
          (loc ? '<span class="cap-loc">' + PIN + "<span>" + S.esc(loc) + "</span></span>" : "") +
          "</span>" : "") +
        "</a>";
    }).join("");
    grid.querySelectorAll("img").forEach(function (img) {
      if (img.complete) img.classList.add("loaded");
      else img.addEventListener("load", function () { img.classList.add("loaded"); });
    });
    layout();
    state.hidden = shown.length > 0;
    state.innerHTML = MSG.empty;
  }

  function renderAlbums() {
    var counts = {}, order = [];
    photos.forEach(function (p) {
      if (!p.album) return;
      if (!counts[p.album]) { counts[p.album] = 0; order.push(p.album); }
      counts[p.album]++;
    });
    albumsEl.hidden = order.length < 2;
    if (albumsEl.hidden) return;
    albumsEl.innerHTML = '<button class="chip' + (album ? "" : " active") + '" data-album="">' +
      '<span class="en">All</span><span class="zh" lang="zh-CN">全部</span><i class="mono">' + photos.length + "</i></button>" +
      order.map(function (a) {
        return '<button class="chip' + (album === a ? " active" : "") + '" data-album="' + S.esc(a) + '">' + S.esc(a) +
          '<i class="mono">' + counts[a] + "</i></button>";
      }).join("");
  }
  albumsEl.addEventListener("click", function (e) {
    var b = e.target.closest(".chip");
    if (!b) return;
    album = b.getAttribute("data-album") || null;
    renderAlbums();
    render();
  });

  /* ---------- lightbox ---------- */
  var lb = document.getElementById("lightbox");
  var lbImg = document.getElementById("lb-img");
  var cur = -1, lastFocus = null;

  function show(i) {
    if (!shown.length) return;
    cur = (i + shown.length) % shown.length;
    var p = shown[cur];
    lbImg.classList.remove("loaded");
    lbImg.onload = function () { lbImg.classList.add("loaded"); };
    lbImg.src = src(p, "full");
    lbImg.alt = caption(p) || p.name;
    document.getElementById("lb-cap").textContent = caption(p);
    var locEl = document.getElementById("lb-loc");
    locEl.innerHTML = place(p) ? PIN + "<span>" + S.esc(place(p)) + "</span>" : "";
    locEl.hidden = !place(p);
    document.getElementById("lb-meta").innerHTML = meta(p);
    document.getElementById("lb-count").textContent = (cur + 1) + " / " + shown.length;
    // warm the neighbours
    [cur - 1, cur + 1].forEach(function (j) {
      var q = shown[(j + shown.length) % shown.length];
      if (q) new Image().src = src(q, "full");
    });
    history.replaceState(null, "", "#" + encodeURIComponent(p.name));
  }
  function open(i) {
    lastFocus = document.activeElement;
    lb.hidden = false;
    document.body.style.overflow = "hidden";
    show(i);
    document.getElementById("lb-close").focus();
  }
  function close() {
    lb.hidden = true;
    lbImg.removeAttribute("src");
    document.body.style.overflow = "";
    history.replaceState(null, "", window.location.pathname + window.location.search);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  grid.addEventListener("click", function (e) {
    var t = e.target.closest(".tile");
    if (!t || e.metaKey || e.ctrlKey) return; // let cmd-click open the file
    e.preventDefault();
    open(+t.getAttribute("data-i"));
  });
  document.getElementById("lb-close").addEventListener("click", close);
  document.getElementById("lb-prev").addEventListener("click", function () { show(cur - 1); });
  document.getElementById("lb-next").addEventListener("click", function () { show(cur + 1); });
  lb.addEventListener("click", function (e) { if (e.target === lb) close(); });
  document.addEventListener("keydown", function (e) {
    if (lb.hidden) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowLeft") show(cur - 1);
    else if (e.key === "ArrowRight") show(cur + 1);
  });
  // swipe on touch screens
  var sx = null;
  lb.addEventListener("pointerdown", function (e) { if (e.pointerType !== "mouse") sx = e.clientX; });
  lb.addEventListener("pointerup", function (e) {
    if (sx === null) return;
    var dx = e.clientX - sx;
    sx = null;
    if (Math.abs(dx) > 50) show(cur + (dx < 0 ? 1 : -1));
  });

  /* ---------- boot ---------- */
  var rt;
  window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(layout, 120); });
  S.onLang(function () {
    render();
    if (!lb.hidden) show(cur);
  });

  S.getJSON("gallery/photos.json").then(function (d) {
    photos = Array.isArray(d) ? d : [];
    renderAlbums();
    render();
    var name = decodeURIComponent(window.location.hash.slice(1));
    if (name) {
      var i = -1;
      shown.forEach(function (p, j) { if (p.name === name) i = j; });
      if (i >= 0) open(i);
    }
  }).catch(function () {
    state.hidden = false;
    state.innerHTML = MSG.error;
  });
})();
