(function () {
  "use strict";

  var root = document.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  var I18N = {
    en: {
      title: "Bowen Su — AI Infra & Computational Math",
      words: ["efficient LLM inference", "collective communication", "MoE systems", "low-rank & sparse algorithms", "robust control & optimization"],
      copied: "Email copied to clipboard",
      search: "Search sections, papers, actions…",
      empty: "No results",
      groups: { nav: "Navigate", actions: "Actions", papers: "Papers" }
    },
    zh: {
      title: "Bowen Su — AI 基础设施与计算数学",
      words: ["大模型高效推理", "集合通信优化", "MoE 系统", "低秩与稀疏算法", "鲁棒控制与优化"],
      copied: "邮箱已复制到剪贴板",
      search: "搜索章节、论文、操作…",
      empty: "没有匹配结果",
      groups: { nav: "导航", actions: "操作", papers: "论文" }
    }
  };

  function lang() { return root.getAttribute("data-lang") === "zh" ? "zh" : "en"; }
  function t(key) { return I18N[lang()][key]; }

  // Sub-pages live one folder down and set data-root="../" on <html>.
  var ROOT = root.getAttribute("data-root") || "";
  var titles = {
    en: root.getAttribute("data-title-en") || I18N.en.title,
    zh: root.getAttribute("data-title-zh") || I18N.zh.title
  };

  /* ---------------- Language ---------------- */
  var langListeners = [];
  function setLang(l) {
    root.setAttribute("data-lang", l);
    root.lang = l === "zh" ? "zh-CN" : "en";
    document.title = titles[l];
    store.set("lang", l);
    langListeners.forEach(function (fn) { fn(l); });
  }
  document.getElementById("lang-toggle").addEventListener("click", function () {
    setLang(lang() === "zh" ? "en" : "zh");
  });
  document.title = titles[lang()];

  /* ---------------- Theme ---------------- */
  var themeListeners = [];
  function theme() {
    var a = root.getAttribute("data-theme");
    return a || (darkQuery.matches ? "dark" : "light");
  }
  function setTheme(th) {
    root.setAttribute("data-theme", th);
    store.set("theme", th);
    themeListeners.forEach(function (fn) { fn(th); });
  }
  document.getElementById("theme-toggle").addEventListener("click", function () {
    setTheme(theme() === "dark" ? "light" : "dark");
  });
  if (darkQuery.addEventListener) {
    darkQuery.addEventListener("change", function () { themeListeners.forEach(function (fn) { fn(theme()); }); });
  }

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

  window.Site = {
    root: ROOT, lang: lang, esc: esc, fmtDate: fmtDate, pick: pick, getJSON: getJSON, reduceMotion: reduceMotion,
    onLang: function (fn) { langListeners.push(fn); },
    onTheme: function (fn) { themeListeners.push(fn); },
    setTitle: function (en, zh) { titles = { en: en, zh: zh || en }; document.title = titles[lang()]; }
  };

  /* ---------------- Toast + copy email ---------------- */
  var toastEl = document.getElementById("toast");
  var toastTimer;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2000);
  }
  var EMAIL = "subowen@msu.edu";
  function copyEmail() {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(EMAIL).then(function () { toast(t("copied")); },
        function () { window.location.href = "mailto:" + EMAIL; });
    } else {
      window.location.href = "mailto:" + EMAIL;
    }
  }
  document.querySelectorAll(".copy-email").forEach(function (b) { b.addEventListener("click", copyEmail); });
  window.Site.toast = toast;

  /* ---------------- Nav: scrolled state, progress, active link ---------------- */
  var nav = document.getElementById("nav");
  var progress = document.querySelector(".progress");
  function onScroll() {
    var y = window.scrollY;
    nav.classList.toggle("scrolled", y > 30);
    var max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.transform = "scaleX(" + (max > 0 ? Math.min(1, y / max) : 0) + ")";
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  var navLinks = document.querySelectorAll(".nav-links a");
  var sections = Array.prototype.slice.call(document.querySelectorAll("main section[id]"));
  var navTick = false;
  function updateActive() {
    navTick = false;
    if (!sections.length) return;
    var line = window.innerHeight * 0.35, id = null;
    sections.forEach(function (s) { if (s.getBoundingClientRect().top <= line) id = s.id; });
    navLinks.forEach(function (a) { a.classList.toggle("active", a.getAttribute("href") === "#" + id); });
  }
  window.addEventListener("scroll", function () {
    if (!navTick) { navTick = true; requestAnimationFrame(updateActive); }
  }, { passive: true });
  updateActive();

  /* ---------------- Reveal on scroll ---------------- */
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion) {
    var revObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        // stagger siblings that enter together
        var idx = Array.prototype.indexOf.call(el.parentNode.children, el);
        el.style.transitionDelay = Math.min(idx, 6) * 60 + "ms";
        el.classList.add("in");
        revObs.unobserve(el);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    reveals.forEach(function (el) { revObs.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---------------- Spotlight cards ---------------- */
  document.querySelectorAll(".spot").forEach(function (card) {
    card.addEventListener("pointermove", function (e) {
      var r = card.getBoundingClientRect();
      card.style.setProperty("--mx", e.clientX - r.left + "px");
      card.style.setProperty("--my", e.clientY - r.top + "px");
    });
  });

  /* ---------------- Typed line ---------------- */
  (function () {
    var el = document.getElementById("typed");
    if (!el) return;
    var wi = 0, ci = 0, deleting = false, timer;
    function tick() {
      var list = t("words"), w = list[wi % list.length];
      if (!deleting) {
        ci++;
        el.textContent = w.slice(0, ci);
        if (ci >= w.length) { deleting = true; timer = setTimeout(tick, 1900); return; }
        timer = setTimeout(tick, 45 + Math.random() * 55);
      } else {
        ci--;
        el.textContent = w.slice(0, ci);
        if (ci <= 0) { deleting = false; wi++; timer = setTimeout(tick, 350); return; }
        timer = setTimeout(tick, 24);
      }
    }
    function start() {
      clearTimeout(timer);
      if (reduceMotion) { el.textContent = t("words")[0]; return; }
      wi = 0; ci = 0; deleting = false;
      tick();
    }
    langListeners.push(start);
    start();
  })();

  /* ---------------- Publication filters ---------------- */
  var pubs = Array.prototype.slice.call(document.querySelectorAll(".pub"));
  var divider = document.querySelector(".pub-divider");
  var emptyMsg = document.querySelector(".empty");
  var chips = document.querySelectorAll(".chip[data-filter]");
  function matches(p, f) {
    return f === "all" || p.getAttribute("data-status") === f || p.getAttribute("data-topic") === f;
  }
  chips.forEach(function (c) {
    var f = c.getAttribute("data-filter");
    c.querySelector("i").textContent = pubs.filter(function (p) { return matches(p, f); }).length;
    c.addEventListener("click", function () { applyFilter(f); });
  });
  function applyFilter(f) {
    if (!divider) return;
    chips.forEach(function (c) { c.classList.toggle("active", c.getAttribute("data-filter") === f); });
    var anyReview = false, any = false;
    pubs.forEach(function (p) {
      var show = matches(p, f);
      p.hidden = !show;
      if (show) { any = true; p.classList.add("in"); if (p.getAttribute("data-status") === "review") anyReview = true; }
    });
    var anyPublished = pubs.some(function (p) { return !p.hidden && p.getAttribute("data-status") === "published"; });
    divider.hidden = !(anyReview && anyPublished);
    divider.classList.add("in");
    emptyMsg.hidden = any;
  }

  /* ---------------- Command palette ---------------- */
  (function () {
    var pal = document.getElementById("palette");
    var input = document.getElementById("palette-q");
    var list = document.getElementById("palette-list");
    var opener = document.getElementById("palette-open");
    if (!pal) return;
    var lastFocus = null, sel = 0, visible = [];

    var ICON = {
      hash: '<svg viewBox="0 0 24 24"><path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/></svg>',
      bolt: '<svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
      doc: '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>'
    };

    function go(hash) {
      var el = document.querySelector(hash);
      if (el) el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
      else window.location.href = ROOT + hash;
    }

    var items = [
      { g: "nav", icon: "hash", en: "About", zh: "关于我", run: function () { go("#about"); } },
      { g: "nav", icon: "hash", en: "Research", zh: "研究方向", run: function () { go("#research"); } },
      { g: "nav", icon: "hash", en: "Publications", zh: "论文发表", run: function () { go("#publications"); } },
      { g: "nav", icon: "hash", en: "Experience & Education", zh: "经历与教育", run: function () { go("#experience"); } },
      { g: "nav", icon: "hash", en: "Teaching, Awards & Skills", zh: "教学、奖项与技能", run: function () { go("#more"); } },
      { g: "nav", icon: "hash", en: "Contact", zh: "联系我", run: function () { go("#contact"); } },
      { g: "nav", icon: "doc", en: "Blog", zh: "博客", kw: "posts writing notes 文章", run: function () { window.location.href = ROOT + "blog/"; } },
      { g: "actions", icon: "bolt", en: "切换到中文", zh: "Switch to English", kw: "language lang 语言 中文 english", run: function () { setLang(lang() === "zh" ? "en" : "zh"); } },
      { g: "actions", icon: "bolt", en: "Toggle dark / light theme", zh: "切换深色 / 浅色主题", kw: "theme dark light 主题", run: function () { setTheme(theme() === "dark" ? "light" : "dark"); } },
      { g: "actions", icon: "bolt", en: "Copy email address", zh: "复制邮箱地址", kw: "email mail contact 邮箱", run: copyEmail },
      { g: "actions", icon: "bolt", en: "Open GitHub", zh: "打开 GitHub", kw: "github code", run: function () { window.location.href = "https://github.com/recursion-ascend"; } },
      { g: "actions", icon: "bolt", en: "Download CV", zh: "下载简历", kw: "cv resume pdf 简历", run: function () { window.location.href = ROOT + "cv.pdf"; } }
    ];
    pubs.forEach(function (p) {
      var title = p.querySelector(".title").textContent.trim();
      var venue = (p.querySelector(".venue") || {}).textContent || "";
      items.push({
        g: "papers", icon: "doc", en: title, zh: title, kw: venue + " " + p.querySelector(".authors").textContent,
        run: function () {
          applyFilter("all");
          p.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
          p.classList.remove("flash"); void p.offsetWidth; p.classList.add("flash");
        }
      });
    });

    function render() {
      var q = input.value.trim().toLowerCase();
      var l = lang();
      visible = items.filter(function (it) {
        if (!q) return it.g !== "papers";
        return (it.en + " " + it.zh + " " + (it.kw || "")).toLowerCase().indexOf(q) !== -1;
      });
      sel = Math.min(sel, Math.max(0, visible.length - 1));
      var html = "", lastG = null;
      visible.forEach(function (it, i) {
        if (it.g !== lastG) { html += '<li class="palette-group" role="presentation">' + I18N[l].groups[it.g] + "</li>"; lastG = it.g; }
        html += '<li class="palette-item" role="option" data-i="' + i + '" aria-selected="' + (i === sel) + '">' +
          ICON[it.icon] + "<span>" + escapeHtml(it[l]) + "</span></li>";
      });
      if (!visible.length) html = '<li class="palette-empty">' + t("empty") + "</li>";
      list.innerHTML = html;
    }
    function escapeHtml(s) {
      return s.replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
    }
    function highlight() {
      list.querySelectorAll(".palette-item").forEach(function (li) {
        var on = +li.getAttribute("data-i") === sel;
        li.setAttribute("aria-selected", on);
        if (on) li.scrollIntoView({ block: "nearest" });
      });
    }
    function open() {
      lastFocus = document.activeElement;
      pal.hidden = false;
      input.value = "";
      input.placeholder = t("search");
      sel = 0;
      render();
      input.focus();
      document.body.style.overflow = "hidden";
    }
    function close() {
      pal.hidden = true;
      document.body.style.overflow = "";
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    function runSel() {
      var it = visible[sel];
      if (!it) return;
      close();
      it.run();
    }

    opener.addEventListener("click", open);
    input.addEventListener("input", function () { sel = 0; render(); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); sel = (sel + 1) % Math.max(1, visible.length); highlight(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); sel = (sel - 1 + visible.length) % Math.max(1, visible.length); highlight(); }
      else if (e.key === "Enter") { e.preventDefault(); runSel(); }
    });
    list.addEventListener("mousemove", function (e) {
      var li = e.target.closest(".palette-item");
      if (li && +li.getAttribute("data-i") !== sel) { sel = +li.getAttribute("data-i"); highlight(); }
    });
    list.addEventListener("click", function (e) {
      var li = e.target.closest(".palette-item");
      if (li) { sel = +li.getAttribute("data-i"); runSel(); }
    });
    pal.addEventListener("click", function (e) { if (e.target.hasAttribute("data-close")) close(); });
    document.addEventListener("keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        pal.hidden ? open() : close();
      } else if (e.key === "Escape" && !pal.hidden) {
        close();
      } else if (e.key === "/" && pal.hidden && !/input|textarea/i.test(document.activeElement.tagName)) {
        e.preventDefault();
        open();
      }
    });
    langListeners.push(function () { if (!pal.hidden) { input.placeholder = t("search"); render(); } });
  })();

  /* ---------------- Home: latest posts ---------------- */
  (function () {
    var postsEl = document.getElementById("home-posts");
    if (!postsEl) return;
    var posts = null;
    function byDateDesc(a, b) { return String(b.date).localeCompare(String(a.date)); }
    function renderPosts() {
      if (!posts) return;
      var list = posts.slice().sort(byDateDesc).slice(0, 5);
      postsEl.innerHTML = list.length ? list.map(function (p) {
        return '<li><a href="blog/post.html?p=' + encodeURIComponent(p.slug) + '"><span>' + esc(pick(p, "title")) +
          "</span><time>" + esc(fmtDate(p.date)) + "</time></a></li>";
      }).join("") : '<li class="state-msg"><span class="en">No posts yet.</span><span class="zh" lang="zh-CN">还没有文章。</span></li>';
    }
    getJSON("blog/posts.json").then(function (d) { posts = d; renderPosts(); })
      .catch(function () { posts = []; renderPosts(); });
    langListeners.push(renderPosts);
  })();

  /* ---------------- Hero network: ring all-reduce across clusters ---------------- */
  (function () {
    var canvas = document.getElementById("net");
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    var hero = canvas.parentElement;
    var W = 0, H = 0, clusters = [], links = [], packets = [], col = {};
    var mouse = { x: -1e4, y: -1e4 };
    var running = false, raf = 0, inView = true;
    var RING = [0, 1, 2, 3, 7, 6, 5, 4];

    function readColors() {
      var cs = getComputedStyle(root);
      col.ink = cs.getPropertyValue("--ink-rgb").trim();
      col.a = cs.getPropertyValue("--accent-rgb").trim();
      col.b = cs.getPropertyValue("--accent2-rgb").trim();
    }

    function build() {
      var r = hero.getBoundingClientRect();
      W = r.width; H = r.height;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      clusters = []; links = []; packets = [];
      var small = W < 640;
      var s = small ? 15 : 20;
      var x0 = W > 980 ? W * 0.40 : 0;
      var cols = Math.max(2, Math.round((W - x0) / (small ? 120 : 175)));
      var top = small ? 70 : 90;
      var rows = Math.max(3, Math.round((H - top) / (small ? 120 : 150)));
      var cw = (W - x0) / cols, chh = (H - top) / rows;
      var grid = [];
      for (var ry = 0; ry < rows; ry++) {
        grid.push([]);
        for (var cx = 0; cx < cols; cx++) {
          var c = {
            cx: x0 + (cx + 0.5) * cw + (Math.random() - 0.5) * cw * 0.35,
            cy: top + (ry + 0.5) * chh + (Math.random() - 0.5) * chh * 0.3,
            ang: (Math.random() - 0.5) * 0.6,
            phase: Math.random() * Math.PI * 2,
            s: s,
            next: performance.now() + Math.random() * 900,
            step: 0,
            nodes: []
          };
          for (var i = 0; i < 8; i++) {
            c.nodes.push({ lx: ((i % 4) - 1.5) * s, ly: (i < 4 ? -0.5 : 0.5) * s, x: 0, y: 0, heat: reduceMotion ? Math.random() * 0.8 : 0, c: c });
          }
          for (var k = 0; k < 8; k++) {
            links.push({ a: c.nodes[RING[k]], b: c.nodes[RING[(k + 1) % 8]], rail: false, c: c });
          }
          clusters.push(c);
          grid[ry].push(c);
        }
      }
      // rail links between neighbouring servers (nearest node pair)
      positions(performance.now());
      for (ry = 0; ry < rows; ry++) {
        for (cx = 0; cx < cols; cx++) {
          var here = grid[ry][cx];
          if (cx + 1 < cols) links.push(railLink(here, grid[ry][cx + 1]));
          if (ry + 1 < rows && (cx + ry) % 2 === 0) links.push(railLink(here, grid[ry + 1][cx]));
        }
      }
    }

    function railLink(c1, c2) {
      var best = null, bd = Infinity;
      c1.nodes.forEach(function (a) {
        c2.nodes.forEach(function (b) {
          var d = (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);
          if (d < bd) { bd = d; best = { a: a, b: b }; }
        });
      });
      return { a: best.a, b: best.b, rail: true };
    }

    function positions(now) {
      clusters.forEach(function (c) {
        var ox = reduceMotion ? 0 : Math.sin(now * 0.00035 + c.phase) * 4;
        var oy = reduceMotion ? 0 : Math.cos(now * 0.0003 + c.phase) * 5;
        var cos = Math.cos(c.ang), sin = Math.sin(c.ang);
        c.x = c.cx + ox; c.y = c.cy + oy;
        c.nodes.forEach(function (n) {
          n.x = c.x + cos * n.lx - sin * n.ly;
          n.y = c.y + sin * n.lx + cos * n.ly;
        });
      });
    }

    var railLinks = function () { return links.filter(function (l) { return l.rail; }); };

    function schedule(now) {
      clusters.forEach(function (c) {
        if (now < c.next) return;
        c.step++;
        c.next = now + 750;
        links.forEach(function (l) {
          if (l.c === c) packets.push({ a: l.a, b: l.b, t0: now, dur: 620, rail: false });
        });
      });
      // occasional inter-server exchange
      if (Math.random() < 0.035) {
        var rl = railLinks();
        if (rl.length) {
          var l = rl[(Math.random() * rl.length) | 0];
          var fwd = Math.random() < 0.5;
          packets.push({ a: fwd ? l.a : l.b, b: fwd ? l.b : l.a, t0: now, dur: 1100, rail: true });
        }
      }
    }

    function ease(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }

    function draw(now) {
      ctx.clearRect(0, 0, W, H);
      var small = W < 640;

      // server boards
      ctx.lineWidth = 1;
      clusters.forEach(function (c) {
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.ang);
        var pw = c.s * 3 + c.s * 1.1, ph = c.s + c.s * 1.1;
        roundRect(-pw / 2, -ph / 2, pw, ph, 6);
        ctx.strokeStyle = "rgba(" + col.ink + ",0.07)";
        ctx.stroke();
        ctx.restore();
      });

      // links
      links.forEach(function (l) {
        ctx.beginPath();
        ctx.moveTo(l.a.x, l.a.y);
        ctx.lineTo(l.b.x, l.b.y);
        if (l.rail) {
          ctx.setLineDash([2, 5]);
          ctx.strokeStyle = "rgba(" + col.ink + ",0.10)";
        } else {
          ctx.setLineDash([]);
          ctx.strokeStyle = "rgba(" + col.ink + ",0.12)";
        }
        ctx.stroke();
      });
      ctx.setLineDash([]);

      // cursor tethers
      var R = 150;
      clusters.forEach(function (c) {
        c.nodes.forEach(function (n) {
          var dx = n.x - mouse.x, dy = n.y - mouse.y, d = Math.sqrt(dx * dx + dy * dy);
          n.near = d < R ? 1 - d / R : 0;
          if (n.near > 0) {
            ctx.beginPath();
            ctx.moveTo(mouse.x, mouse.y);
            ctx.lineTo(n.x, n.y);
            ctx.strokeStyle = "rgba(" + col.a + "," + (n.near * 0.28).toFixed(3) + ")";
            ctx.stroke();
          }
        });
      });

      // packets
      for (var i = packets.length - 1; i >= 0; i--) {
        var p = packets[i];
        var pr = (now - p.t0) / p.dur;
        if (pr >= 1) { p.b.heat = 1; packets.splice(i, 1); continue; }
        var e = ease(pr), e0 = ease(Math.max(0, pr - 0.28));
        var x = p.a.x + (p.b.x - p.a.x) * e, y = p.a.y + (p.b.y - p.a.y) * e;
        var x0 = p.a.x + (p.b.x - p.a.x) * e0, y0 = p.a.y + (p.b.y - p.a.y) * e0;
        var rgb = p.rail ? col.b : col.a;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x, y);
        ctx.strokeStyle = "rgba(" + rgb + ",0.55)";
        ctx.lineWidth = p.rail ? 2 : 1.6;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, p.rail ? 2.6 : 1.9, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(" + rgb + ",1)";
        ctx.fill();
      }
      ctx.lineWidth = 1;

      // nodes (accelerators)
      var ns = small ? 5 : 6;
      clusters.forEach(function (c) {
        c.nodes.forEach(function (n) {
          var h = Math.max(n.heat, n.near || 0);
          if (h > 0.04) {
            ctx.beginPath();
            ctx.arc(n.x, n.y, ns + 6 * h, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(" + col.a + "," + (h * 0.18).toFixed(3) + ")";
            ctx.fill();
          }
          ctx.save();
          ctx.translate(n.x, n.y);
          ctx.rotate(c.ang);
          roundRect(-ns / 2, -ns / 2, ns, ns, 1.5);
          ctx.fillStyle = "rgba(" + col.ink + "," + (0.28 - 0.2 * h).toFixed(3) + ")";
          ctx.fill();
          if (h > 0.02) {
            ctx.fillStyle = "rgba(" + col.a + "," + h.toFixed(3) + ")";
            ctx.fill();
          }
          ctx.restore();
          if (!reduceMotion) n.heat *= 0.94;
        });
      });
    }

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function frame(now) {
      positions(now);
      schedule(now);
      draw(now);
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (running || reduceMotion) return;
      running = true;
      raf = requestAnimationFrame(frame);
    }
    function stop() { running = false; cancelAnimationFrame(raf); }
    function still() { var n = performance.now(); positions(n); draw(n); }

    readColors();
    build();
    if (reduceMotion) still(); else start();

    themeListeners.push(function () {
      // wait a tick for the new custom properties to apply
      requestAnimationFrame(function () { readColors(); if (!running) still(); });
    });

    var resizeTimer;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { build(); if (!running) still(); }, 150);
    });
    hero.addEventListener("pointermove", function (e) {
      var r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
      if (reduceMotion) still();
    });
    hero.addEventListener("pointerleave", function () {
      mouse.x = mouse.y = -1e4;
      if (reduceMotion) still();
    });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView && !document.hidden) start(); else stop();
      }).observe(hero);
    }
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop(); else if (inView) start();
    });
  })();

  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
