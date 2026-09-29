/* Shared runtime for every page of the notebook.
   Exposes window.Site for the page scripts (blog.js, gallery.js, md.js). */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
  var ROOT = root.getAttribute("data-root") || "";

  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lang() { return root.getAttribute("data-lang") === "zh" ? "zh" : "en"; }
  function theme() { return root.getAttribute("data-theme") || (darkQuery.matches ? "dark" : "light"); }
  function css(name) { return getComputedStyle(root).getPropertyValue(name).trim(); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // "2026-09-26" -> "Sep 26, 2026" / "2026年9月26日"
  function fmtDate(iso, short) {
    var p = String(iso || "").split("-");
    if (p.length < 3) return iso || "";
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    var opts = short ? { month: "short", day: "numeric", timeZone: "UTC" } : { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" };
    return new Intl.DateTimeFormat(lang() === "zh" ? "zh-CN" : "en-US", opts).format(d);
  }
  function pick(obj, key) { return lang() === "zh" && obj[key + "_zh"] ? obj[key + "_zh"] : obj[key]; }
  function getJSON(path) {
    return fetch(ROOT + path, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error(r.status + " " + path);
      return r.json();
    });
  }

  /* ---------------- language + theme ---------------- */
  var langListeners = [], themeListeners = [];
  var titles = {
    en: root.getAttribute("data-title-en") || document.title,
    zh: root.getAttribute("data-title-zh") || document.title
  };
  function syncThemeLabel() {
    var t = theme();
    document.querySelectorAll("[data-when]").forEach(function (el) { el.hidden = el.getAttribute("data-when") !== t; });
  }
  function setLang(l) {
    root.setAttribute("data-lang", l);
    root.lang = l === "zh" ? "zh-CN" : "en";
    document.title = titles[l];
    store("lang", l);
    langListeners.forEach(function (fn) { fn(l); });
  }
  function setTheme(t) {
    root.setAttribute("data-theme", t);
    store("theme", t);
    syncThemeLabel();
    themeListeners.forEach(function (fn) { fn(t); });
  }
  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-toggle-lang]")) setLang(lang() === "zh" ? "en" : "zh");
    else if (e.target.closest("[data-toggle-theme]")) setTheme(theme() === "dark" ? "light" : "dark");
  });
  if (darkQuery.addEventListener) darkQuery.addEventListener("change", function () {
    syncThemeLabel();
    themeListeners.forEach(function (fn) { fn(theme()); });
  });
  document.title = titles[lang()];
  syncThemeLabel();

  /* ---------------- toast + email ---------------- */
  var toastEl = document.getElementById("toast"), toastTimer;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 1800);
  }
  var EMAIL = "subowen@msu.edu";
  document.querySelectorAll(".copy-email").forEach(function (b) {
    b.addEventListener("click", function () {
      if (!navigator.clipboard) { window.location.href = "mailto:" + EMAIL; return; }
      navigator.clipboard.writeText(EMAIL).then(function () {
        toast(lang() === "zh" ? "邮箱已复制" : "email copied");
      }, function () { window.location.href = "mailto:" + EMAIL; });
    });
  });

  window.Site = {
    root: ROOT, lang: lang, esc: esc, fmtDate: fmtDate, pick: pick, getJSON: getJSON, reduceMotion: reduceMotion,
    toast: toast,
    onLang: function (fn) { langListeners.push(fn); },
    onTheme: function (fn) { themeListeners.push(fn); },
    setTitle: function (en, zh) { titles = { en: en, zh: zh || en }; document.title = titles[lang()]; }
  };

  var updated = document.getElementById("updated");
  if (updated) {
    var lm = new Date(document.lastModified);
    if (!isNaN(lm)) updated.textContent = lm.getFullYear() + "-" + String(lm.getMonth() + 1).padStart(2, "0") + "-" + String(lm.getDate()).padStart(2, "0");
  }

  /* ---------------- math on the home page ---------------- */
  if (window.renderMathInElement && document.getElementById("problem")) {
    window.renderMathInElement(document.querySelector("main") || document.body, {
      delimiters: [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }],
      throwOnError: false
    });
    document.querySelectorAll(".note").forEach(function (n) {
      window.renderMathInElement(n, { delimiters: [{ left: "$", right: "$", display: false }], throwOnError: false });
    });
  }

  /* ---------------- papers: filters ---------------- */
  var items = Array.prototype.slice.call(document.querySelectorAll(".bib-item"));
  var reviewHead = document.querySelector('.refs-group[data-group="review"]');
  var emptyMsg = document.querySelector("#papers .empty");
  var filterBtns = document.querySelectorAll("[data-filter]");
  function matches(it, f) {
    return f === "all" || it.getAttribute("data-status") === f || it.getAttribute("data-topic") === f;
  }
  function applyFilter(f) {
    if (!items.length) return;
    filterBtns.forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-filter") === f); });
    var any = false, anyReview = false;
    items.forEach(function (it) {
      var show = matches(it, f);
      it.hidden = !show;
      if (show) { any = true; if (it.getAttribute("data-status") === "review") anyReview = true; }
    });
    if (reviewHead) reviewHead.hidden = !anyReview;
    if (emptyMsg) emptyMsg.hidden = any;
    requestAnimationFrame(refreshAnnotations);
  }
  filterBtns.forEach(function (b) {
    var f = b.getAttribute("data-filter");
    b.querySelector("sup").textContent = items.filter(function (it) { return matches(it, f); }).length;
    b.addEventListener("click", function () { applyFilter(f); });
  });
  document.querySelectorAll("[data-goto-filter]").forEach(function (a) {
    var f = a.getAttribute("data-goto-filter");
    var n = items.filter(function (it) { return matches(it, f); }).length;
    a.querySelector(".n").textContent = n;
    var en = a.querySelector(".en");
    if (en) en.textContent = n === 1 ? "paper" : "papers";
    a.addEventListener("click", function () { applyFilter(f); });
  });

  /* ---------------- home: latest notes + taped-in photos ---------------- */
  (function () {
    var postsEl = document.getElementById("home-posts");
    var photosEl = document.getElementById("home-photos");
    if (!postsEl && !photosEl) return;
    var posts = null, photos = null;
    function byDateDesc(a, b) { return String(b.date || "").localeCompare(String(a.date || "")); }
    function render() {
      if (postsEl && posts) {
        postsEl.innerHTML = posts.slice().sort(byDateDesc).slice(0, 4).map(function (p) {
          return '<li><a href="blog/post.html?p=' + encodeURIComponent(p.slug) + '"><span class="d">' + esc(p.date) +
            '</span><span class="ti">' + esc(pick(p, "title")) + "</span></a></li>";
        }).join("");
      }
      if (photosEl && photos) {
        photosEl.innerHTML = photos.slice(0, 3).map(function (p) {
          var cap = pick(p, "caption") || pick(p, "location") || String(p.name).replace(/-/g, " ");
          return '<a class="pola" href="gallery/#' + encodeURIComponent(p.name) + '"><img src="gallery/thumbs/' +
            encodeURIComponent(p.name) + '.jpg" alt="' + esc(cap) + '" loading="lazy"><span class="cap">' + esc(cap) + "</span></a>";
        }).join("");
      }
    }
    getJSON("blog/posts.json").then(function (d) { posts = d; render(); }).catch(function () { posts = []; render(); });
    getJSON("gallery/photos.json").then(function (d) { photos = d; render(); }).catch(function () { photos = []; render(); });
    langListeners.push(render);
  })();

  /* ---------------- hand-drawn figures (rough.js) ---------------- */
  var SVGNS = "http://www.w3.org/2000/svg";
  function label(svg, x, y, text, size, color, anchor) {
    var t = document.createElementNS(SVGNS, "text");
    t.setAttribute("x", x); t.setAttribute("y", y);
    t.setAttribute("text-anchor", anchor || "middle");
    t.setAttribute("font-family", "Caveat, 'Long Cang', cursive");
    t.setAttribute("font-size", size); t.setAttribute("fill", color);
    t.textContent = text;
    svg.appendChild(t);
  }
  function arrowHead(rc, svg, x1, y1, x2, y2, o) {
    var a = Math.atan2(y2 - y1, x2 - x1), L = 9;
    svg.appendChild(rc.line(x2, y2, x2 - L * Math.cos(a - .45), y2 - L * Math.sin(a - .45), o));
    svg.appendChild(rc.line(x2, y2, x2 - L * Math.cos(a + .45), y2 - L * Math.sin(a + .45), o));
  }

  function drawRing(svg) {
    var rc = rough.svg(svg), ink = css("--ink"), red = css("--red");
    var o = { stroke: ink, roughness: 1.3, strokeWidth: 1.4, seed: 7 };
    var p = 8, cx = 130, cy = 128, R = 92, r = 17, pts = [];
    for (var i = 0; i < p; i++) {
      var a = -Math.PI / 2 + i * 2 * Math.PI / p;
      pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
    }
    pts.forEach(function (q, i) {
      svg.appendChild(rc.circle(q[0], q[1], 2 * r, o));
      label(svg, q[0], q[1] + 6, "r" + i, 19, ink);
      var n = pts[(i + 1) % p], dx = n[0] - q[0], dy = n[1] - q[1], d = Math.hypot(dx, dy);
      var sx = q[0] + dx / d * (r + 4), sy = q[1] + dy / d * (r + 4);
      var ex = n[0] - dx / d * (r + 5), ey = n[1] - dy / d * (r + 5);
      var ro = { stroke: red, roughness: 1.1, strokeWidth: 1.3, seed: 11 + i };
      svg.appendChild(rc.line(sx, sy, ex, ey, ro));
      arrowHead(rc, svg, sx, sy, ex, ey, ro);
    });
    label(svg, cx, cy + 7, "n/p", 22, red);
  }

  function drawSimplex(svg) {
    var rc = rough.svg(svg), ink = css("--ink"), red = css("--red"), pencil = css("--pencil");
    var A = [30, 200], B = [230, 200], C = [130, 26];
    svg.appendChild(rc.polygon([A, B, C], { stroke: ink, roughness: 1.2, strokeWidth: 1.4, seed: 3 }));
    label(svg, A[0] - 10, A[1] + 20, "e1", 21, pencil);
    label(svg, B[0] + 10, B[1] + 20, "e2", 21, pencil);
    label(svg, C[0], C[1] - 8, "e3", 21, pencil);
    var path = [[70, 180], [95, 150], [118, 128], [128, 98], [131, 68], [131, 50]];
    var o = { stroke: red, roughness: 0.9, strokeWidth: 1.6, seed: 5 };
    svg.appendChild(rc.curve(path, o));
    arrowHead(rc, svg, 131, 62, 131, 48, o);
    svg.appendChild(rc.circle(70, 180, 7, { fill: red, fillStyle: "solid", stroke: red, roughness: .6, seed: 2 }));
    label(svg, 58, 172, "x0", 20, red, "end");
    label(svg, 146, 118, "x(t)", 20, red, "start");
  }

  function drawLine(svg) {
    var rc = rough.svg(svg), ink = css("--ink"), red = css("--red"), pencil = css("--pencil");
    var y0 = 2013, y1 = 2027, X0 = 24, X1 = 600, Y = 128;
    function X(y) { return X0 + (y - y0) / (y1 - y0) * (X1 - X0); }
    var o = { stroke: ink, roughness: 1, strokeWidth: 1.4, seed: 9 };
    svg.appendChild(rc.line(X0 - 8, Y, X1 + 22, Y, o));
    arrowHead(rc, svg, X1, Y, X1 + 22, Y, o);
    for (var y = 2013; y <= 2026; y++) {
      svg.appendChild(rc.line(X(y), Y - 5, X(y), Y + 5, { stroke: ink, roughness: .6, seed: y }));
      if ((y - 2013) % 3 === 0 || y === 2026) label(svg, X(y), Y + 26, String(y), 18, pencil);
    }
    function span(a, b, h, text, color, open) {
      var oo = { stroke: color, roughness: 1, strokeWidth: 1.3, seed: Math.round(a * 7) }, top = Y - h;
      svg.appendChild(rc.line(X(a), Y - 8, X(a), top, oo));
      svg.appendChild(rc.line(X(a), top, X(b), top, oo));
      if (open) arrowHead(rc, svg, X(a), top, X(b), top, oo);
      else svg.appendChild(rc.line(X(b), top, X(b), Y - 8, oo));
      label(svg, (X(a) + X(b)) / 2, top - 7, text, 20, color);
    }
    span(2013.7, 2017.5, 34, "JLU · B.A.", ink);
    span(2017.7, 2020.6, 34, "NKU · M.S.", ink);
    span(2020.7, 2025.5, 34, "MSU · Ph.D.", ink);
    span(2024.35, 2024.95, 70, "LANL", pencil);
    span(2025.6, 2027, 100, "Huawei →", red, true);
  }

  var FIGS = { "fig-ring": drawRing, "fig-simplex": drawSimplex, "fig-line": drawLine };
  function drawFigures() {
    if (!window.rough) return;
    Object.keys(FIGS).forEach(function (id) {
      var svg = document.getElementById(id);
      if (!svg) return;
      svg.innerHTML = "";
      FIGS[id](svg);
    });
  }

  /* ---------------- pen annotations (rough-notation) ---------------- */
  var anns = [];
  var io = "IntersectionObserver" in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      anns.forEach(function (a) { if (a._el === e.target && !a.isShowing()) a.show(); });
      io.unobserve(e.target);
    });
  }, { rootMargin: "0px 0px -15% 0px" }) : null;

  function annotate() {
    if (!window.RoughNotation) return;
    anns.forEach(function (a) { a.remove(); });
    anns = [];
    var red = css("--red"), hl = css("--hl");
    document.querySelectorAll(".mark[data-a]").forEach(function (el) {
      if (!el.offsetParent) return; // hidden language / filtered out
      var kind = el.getAttribute("data-a");
      var opt = { animate: !reduceMotion, animationDuration: 900, multiline: true, padding: 3, color: red };
      if (kind === "highlight") { opt.type = "highlight"; opt.color = hl; }
      else if (kind === "circle") { opt.type = "circle"; opt.padding = 6; }
      else if (kind === "underline") { opt.type = "underline"; }
      else if (kind === "strike") { opt.type = "crossed-off"; opt.strokeWidth = 1.5; }
      else if (kind === "box") { opt.type = "box"; opt.padding = 4; opt.strokeWidth = 1.6; }
      var a = window.RoughNotation.annotate(el, opt);
      a._el = el;
      anns.push(a);
    });
    anns.forEach(function (a) {
      if (reduceMotion || !io) a.show(); else io.observe(a._el);
    });
  }
  // after a layout change, redraw marks that were already visible without re-animating
  function refreshAnnotations() {
    if (!anns.length) return;
    var shown = anns.filter(function (a) { return a.isShowing(); }).map(function (a) { return a._el; });
    annotate();
    anns.forEach(function (a) {
      if (shown.indexOf(a._el) !== -1 && !a.isShowing()) { a.animate = false; a.show(); }
    });
  }

  if (document.querySelector(".mark[data-a]") || document.querySelector("svg[id^='fig-']")) {
    drawFigures();
    var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    ready.then(function () { drawFigures(); annotate(); });
    langListeners.push(function () { annotate(); });
    themeListeners.push(function () { drawFigures(); refreshAnnotations(); });
    var rt;
    window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(refreshAnnotations, 200); });
  }

  /* ---------------- visitors: hide the section only if the widget failed to load ----------------
     (the globe itself stays hidden until it is scrolled fully into view, by design) */
  (function () {
    var sec = document.getElementById("visitors");
    if (!sec) return;
    setTimeout(function () {
      if (!sec.querySelector(".mmvst_outer")) sec.hidden = true;
    }, 15000);
  })();
})();
