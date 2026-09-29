/* bowen-su(1): shared runtime for every page.
   Exposes window.Site for the page scripts (blog.js, gallery.js, md.js). */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
  var ROOT = root.getAttribute("data-root") || "";

  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  function lang() { return root.getAttribute("data-lang") === "zh" ? "zh" : "en"; }
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
  function theme() { return root.getAttribute("data-theme") || (darkQuery.matches ? "dark" : "light"); }

  function syncControls() {
    document.querySelectorAll("[data-set-lang]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-set-lang") === lang()));
    });
    document.querySelectorAll("[data-set-theme]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-set-theme") === theme()));
    });
    var t = document.getElementById("sb-theme");
    if (t) t.textContent = theme();
  }
  function setLang(l) {
    root.setAttribute("data-lang", l);
    root.lang = l === "zh" ? "zh-CN" : "en";
    document.title = titles[l];
    store.set("lang", l);
    syncControls();
    langListeners.forEach(function (fn) { fn(l); });
  }
  function setTheme(th) {
    root.setAttribute("data-theme", th);
    store.set("theme", th);
    syncControls();
    themeListeners.forEach(function (fn) { fn(th); });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-set-lang],[data-set-theme],[data-toggle-lang],[data-toggle-theme]");
    if (!b) return;
    if (b.hasAttribute("data-set-lang")) setLang(b.getAttribute("data-set-lang"));
    else if (b.hasAttribute("data-set-theme")) setTheme(b.getAttribute("data-set-theme"));
    else if (b.hasAttribute("data-toggle-lang")) setLang(lang() === "zh" ? "en" : "zh");
    else setTheme(theme() === "dark" ? "light" : "dark");
  });
  if (darkQuery.addEventListener) darkQuery.addEventListener("change", function () {
    syncControls();
    themeListeners.forEach(function (fn) { fn(theme()); });
  });
  document.title = titles[lang()];
  syncControls();

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
  function copyEmail() {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(EMAIL).then(function () {
        toast(lang() === "zh" ? "已复制 " + EMAIL : "copied " + EMAIL);
      }, function () { window.location.href = "mailto:" + EMAIL; });
    } else {
      window.location.href = "mailto:" + EMAIL;
    }
  }
  document.querySelectorAll(".copy-email").forEach(function (b) { b.addEventListener("click", copyEmail); });

  window.Site = {
    root: ROOT, lang: lang, esc: esc, fmtDate: fmtDate, pick: pick, getJSON: getJSON, reduceMotion: reduceMotion,
    toast: toast,
    onLang: function (fn) { langListeners.push(fn); },
    onTheme: function (fn) { themeListeners.push(fn); },
    setTitle: function (en, zh) { titles = { en: en, zh: zh || en }; document.title = titles[lang()]; }
  };

  /* ---------------- status bar: clock + current section ---------------- */
  var clock = document.getElementById("sb-clock");
  function tickClock() {
    if (!clock) return;
    var d = new Date();
    clock.textContent = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  tickClock();
  setInterval(tickClock, 20000);

  var secLabel = document.getElementById("sb-section");
  var sections = Array.prototype.slice.call(document.querySelectorAll("[data-sec]"));
  var secTick = false;
  function updateSection() {
    secTick = false;
    if (!secLabel || !sections.length) return;
    var line = window.innerHeight * 0.3, cur = sections[0];
    sections.forEach(function (s) { if (!s.hidden && s.getBoundingClientRect().top <= line) cur = s; });
    secLabel.textContent = "§ " + cur.getAttribute("data-sec");
  }
  window.addEventListener("scroll", function () {
    if (!secTick) { secTick = true; requestAnimationFrame(updateSection); }
  }, { passive: true });
  updateSection();

  var updated = document.getElementById("updated");
  if (updated) {
    var lm = new Date(document.lastModified);
    if (!isNaN(lm)) updated.textContent = lm.getFullYear() + "-" + String(lm.getMonth() + 1).padStart(2, "0") + "-" + String(lm.getDate()).padStart(2, "0");
  }

  /* ---------------- VISITORS: hide the section only if the widget failed to load ----------------
     (the globe itself stays hidden until it is scrolled fully into view, by design) */
  (function () {
    var sec = document.getElementById("visitors");
    if (!sec) return;
    setTimeout(function () {
      if (!sec.querySelector(".mmvst_outer")) sec.hidden = true; // blocked or offline
    }, 15000);
  })();

  /* ---------------- publications: flags + grep ---------------- */
  var items = Array.prototype.slice.call(document.querySelectorAll(".bib-item"));
  var groups = document.querySelectorAll(".bib-group");
  var flags = document.querySelectorAll(".flag[data-filter]");
  var emptyMsg = document.querySelector("#publications .empty");
  function matches(it, f) {
    return f === "all" || it.getAttribute("data-status") === f || it.getAttribute("data-topic") === f;
  }
  function applyFilter(f, term) {
    if (!items.length) return;
    term = (term || "").toLowerCase();
    flags.forEach(function (b) { b.classList.toggle("active", !term && b.getAttribute("data-filter") === f); });
    var any = false;
    items.forEach(function (it) {
      var show = matches(it, f) && (!term || it.textContent.toLowerCase().indexOf(term) !== -1);
      it.hidden = !show;
      if (show) any = true;
    });
    groups.forEach(function (g) {
      var k = g.getAttribute("data-group");
      g.hidden = !items.some(function (it) { return !it.hidden && it.getAttribute("data-status") === k; });
    });
    if (emptyMsg) emptyMsg.hidden = any;
  }
  flags.forEach(function (b) {
    var f = b.getAttribute("data-filter");
    b.querySelector("i").textContent = items.filter(function (it) { return matches(it, f); }).length;
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

  /* ---------------- home: FILES (latest posts, photo count) ---------------- */
  (function () {
    var list = document.getElementById("home-files");
    if (!list) return;
    var posts = null, photos = null;
    function render() {
      if (!posts || !photos) return;
      var rows = [];
      posts.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).slice(0, 4).forEach(function (p) {
        rows.push('<li><span class="perm">-rw-r--r--</span><span class="d">' + esc(p.date) + '</span><a href="blog/post.html?p=' +
          encodeURIComponent(p.slug) + '">blog/' + esc(p.slug) + '.md <span class="dim">— ' + esc(pick(p, "title")) + "</span></a></li>");
      });
      rows.push('<li><span class="perm">drwxr-xr-x</span><span class="d">' + photos.length +
        (lang() === "zh" ? " 张照片" : " photos") + '</span><a class="dir" href="gallery/">gallery/</a></li>');
      list.innerHTML = rows.join("");
    }
    getJSON("blog/posts.json").then(function (d) { posts = d; render(); }).catch(function () { posts = []; render(); });
    getJSON("gallery/photos.json").then(function (d) { photos = d; render(); }).catch(function () { photos = []; render(); });
    langListeners.push(render);
  })();

  /* ---------------- EXAMPLES: ring all-reduce, step by step ----------------
     p ranks, buffer split into p chunks; cnt[r][c] = how many ranks' data
     rank r's copy of chunk c already sums.
     reduce-scatter step s (0..p-2): rank r sends chunk (r-s) mod p to r+1, which adds it.
     all-gather     step s (0..p-2): rank r sends chunk (r+1-s) mod p to r+1, which copies it. */
  (function () {
    var panel = document.getElementById("ring");
    if (!panel) return;
    var grid = document.getElementById("ring-grid");
    var elPhase = document.getElementById("ring-phase"), elStep = document.getElementById("ring-step");
    var elTotal = document.getElementById("ring-total"), elSent = document.getElementById("ring-sent");
    var elBar = document.getElementById("ring-bar"), elOk = document.getElementById("ring-ok");
    var elP = document.getElementById("ring-p-label"), playBtn = document.getElementById("ring-play");

    var p = 8, cnt, cells, notes, step, total;
    var playing = !reduceMotion, visible = true, token = 0;

    function mod(a) { return ((a % p) + p) % p; }
    function transfers(s) {
      var out = [];
      for (var r = 0; r < p; r++) {
        var c = s < p - 1 ? mod(r - s) : mod(r + 1 - (s - (p - 1)));
        out.push({ from: r, to: mod(r + 1), c: c, reduce: s < p - 1 });
      }
      return out;
    }

    function build() {
      total = 2 * (p - 1);
      cnt = []; cells = []; notes = [];
      var html = '<span class="rk hdr"></span><span class="buf hdr">';
      for (var c = 0; c < p; c++) html += "<span>c" + c + "</span>";
      html += '</span><span class="hdr"></span>';
      for (var r = 0; r < p; r++) {
        html += '<span class="rk">r' + r + '</span><span class="buf">';
        for (c = 0; c < p; c++) html += '<span class="cell" data-r="' + r + '" data-c="' + c + '"></span>';
        html += '</span><span class="tx-note" data-r="' + r + '"></span>';
      }
      grid.innerHTML = html;
      for (r = 0; r < p; r++) {
        cnt.push([]); cells.push([]);
        for (c = 0; c < p; c++) {
          cnt[r].push(1);
          cells[r].push(grid.querySelector('.cell[data-r="' + r + '"][data-c="' + c + '"]'));
        }
        notes.push(grid.querySelector('.tx-note[data-r="' + r + '"]'));
      }
      step = 0;
      elP.textContent = p;
      elTotal.textContent = total;
      document.querySelectorAll("[data-ring-p]").forEach(function (b) {
        b.setAttribute("aria-pressed", String(+b.getAttribute("data-ring-p") === p));
      });
      render();
    }

    function render() {
      for (var r = 0; r < p; r++) {
        for (var c = 0; c < p; c++) {
          var el = cells[r][c], k = cnt[r][c];
          el.textContent = k;
          el.classList.toggle("full", k === p);
          el.style.setProperty("--a", (0.06 + 0.5 * (k - 1) / (p - 1)).toFixed(3));
        }
      }
      var gather = step >= p - 1;
      elPhase.textContent = step === total ? "done" : gather ? "all-gather" : "reduce-scatter";
      elPhase.className = gather ? "phase-ag" : "phase-rs";
      elStep.textContent = String(step).padStart(2, "0");
      elSent.textContent = "sent/rank " + step + "/" + p + "·n";
      var bar = "[";
      for (var i = 0; i < total; i++) bar += i < step ? (i < p - 1 ? "=" : "#") : ".";
      elBar.textContent = bar + "]  " + (lang() === "zh" ? "= reduce-scatter，# all-gather" : "= reduce-scatter, # all-gather");
      elOk.textContent = step === total ? "✓ " + total + "/" + p + "·n = 2(p−1)/p·n" : "";
    }

    function clearMarks() {
      for (var r = 0; r < p; r++) {
        notes[r].innerHTML = "";
        for (var c = 0; c < p; c++) cells[r][c].classList.remove("tx", "rx");
      }
    }
    function highlight() {
      clearMarks();
      transfers(step).forEach(function (t) {
        cells[t.from][t.c].classList.add("tx");
        notes[t.from].innerHTML = '<span class="arrow">→</span> r' + t.to + " c" + t.c + (t.reduce ? " +=" : " :=");
      });
    }
    function apply() {
      var ts = transfers(step), next = cnt.map(function (row) { return row.slice(); });
      ts.forEach(function (t) { next[t.to][t.c] = t.reduce ? cnt[t.to][t.c] + cnt[t.from][t.c] : cnt[t.from][t.c]; });
      cnt = next;
      step++;
      render();
      ts.forEach(function (t) {
        cells[t.from][t.c].classList.remove("tx");
        var el = cells[t.to][t.c];
        el.classList.remove("rx"); void el.offsetWidth; el.classList.add("rx");
      });
    }

    function loop(my) {
      if (my !== token || !playing || !visible || document.hidden) return;
      if (step >= total) {
        setTimeout(function () {
          if (my !== token) return;
          build();
          setTimeout(function () { loop(my); }, 700);
        }, 2600);
        return;
      }
      highlight();
      setTimeout(function () {
        if (my !== token) return;
        apply();
        setTimeout(function () { loop(my); }, 600);
      }, 650);
    }
    function start() { token++; if (playing) loop(token); }

    function setPlaying(v) {
      playing = v;
      playBtn.textContent = v ? "pause" : "play";
      playBtn.setAttribute("aria-pressed", String(!v));
      start();
    }
    playBtn.addEventListener("click", function () { setPlaying(!playing); });
    document.getElementById("ring-stepbtn").addEventListener("click", function () {
      if (playing) setPlaying(false);
      token++;
      if (step >= total) { build(); return; }
      highlight();
      setTimeout(apply, 250);
    });
    document.getElementById("ring-reset").addEventListener("click", function () { token++; build(); start(); });
    document.querySelectorAll("[data-ring-p]").forEach(function (b) {
      b.addEventListener("click", function () { p = +b.getAttribute("data-ring-p"); token++; build(); start(); });
    });

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) {
        var was = visible;
        visible = es[0].isIntersecting;
        if (visible && !was) start();
      }).observe(panel);
    }
    document.addEventListener("visibilitychange", function () { if (!document.hidden) start(); });
    langListeners.push(render);

    build();
    setPlaying(playing);
  })();

  /* ---------------- command line ---------------- */
  (function () {
    var box = document.getElementById("cmd");
    if (!box) return;
    var input = document.getElementById("cmd-input");
    var list = document.getElementById("cmd-list");
    var sel = 0, shown = [], lastFocus = null;

    function go(hash) {
      var el = document.querySelector(hash);
      if (el) el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
      else window.location.href = ROOT + hash;
    }
    function nav(path) { window.location.href = ROOT + path; }

    var C = [
      { c: "help", en: "list commands", zh: "列出所有命令", run: function () { input.value = ""; render(); return true; } },
      { c: "about", en: "DESCRIPTION", zh: "简介", run: function () { go("#description"); } },
      { c: "demo", en: "ring all-reduce simulation", zh: "Ring AllReduce 演示", run: function () { go("#examples"); } },
      { c: "research", en: "OPTIONS — current work", zh: "当前方向", run: function () { go("#options"); } },
      { c: "phd", en: "HISTORY — Ph.D. research", zh: "博士期间研究", run: function () { go("#history"); } },
      { c: "pubs", en: "PUBLICATIONS", zh: "论文", run: function () { applyFilter("all"); go("#publications"); } },
      { c: "grep <term>", en: "search publications", zh: "搜索论文", fill: "grep " },
      { c: "log", en: "news, as git log", zh: "动态", run: function () { go("#log"); } },
      { c: "exp", en: "EXPERIENCE", zh: "经历与教育", run: function () { go("#experience"); } },
      { c: "env", en: "ENVIRONMENT — toolbox", zh: "技术栈", run: function () { go("#environment"); } },
      { c: "home", en: "~/", zh: "主页", run: function () { nav(""); } },
      { c: "blog", en: "~/blog/", zh: "博客", run: function () { nav("blog/"); } },
      { c: "gallery", en: "~/gallery/", zh: "相册", run: function () { nav("gallery/"); } },
      { c: "cv", en: "open cv.pdf", zh: "简历", run: function () { nav("cv.pdf"); } },
      { c: "github", en: "github.com/recursion-ascend", zh: "GitHub 主页", run: function () { window.location.href = "https://github.com/recursion-ascend"; } },
      { c: "email", en: "copy " + EMAIL, zh: "复制邮箱", run: function () { copyEmail(); } },
      { c: "lang en", en: "English", zh: "切换到英文", run: function () { setLang("en"); } },
      { c: "lang zh", en: "中文", zh: "切换到中文", run: function () { setLang("zh"); } },
      { c: "theme dark", en: "dark theme", zh: "深色主题", run: function () { setTheme("dark"); } },
      { c: "theme light", en: "light theme", zh: "浅色主题", run: function () { setTheme("light"); } },
      { c: "top", en: "scroll to top", zh: "回到顶部", run: function () { window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" }); } }
    ];
    items.forEach(function (it) {
      var t = it.querySelector(".t").textContent.replace(/\.$/, "");
      C.push({
        c: it.querySelector(".n").textContent + " " + t, en: "", zh: "", paper: true, run: function () {
          applyFilter("all");
          it.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
          it.classList.remove("flash"); void it.offsetWidth; it.classList.add("flash");
        }
      });
    });

    function grep() {
      var term = input.value.trim().slice(5).trim();
      if (!items.length) { window.location.href = ROOT + "#publications"; return; }
      applyFilter("all", term);
      go("#publications");
      toast("grep '" + term + "'");
    }
    function render() {
      var q = input.value.trim().toLowerCase();
      if (/^grep\s/.test(q)) {
        shown = [{ c: "grep " + q.slice(5), en: "filter publications", zh: "筛选论文", run: grep }];
      } else {
        shown = C.filter(function (x) {
          if (!q) return !x.paper;
          return (x.c + " " + x.en + " " + x.zh).toLowerCase().indexOf(q) !== -1;
        }).slice(0, 12);
      }
      sel = Math.min(sel, Math.max(0, shown.length - 1));
      list.innerHTML = shown.length ? shown.map(function (x, i) {
        return '<li class="cmd-item" role="option" data-i="' + i + '" aria-selected="' + (i === sel) + '"><span class="c">' +
          esc(x.c) + '</span><span class="h">' + esc(x[lang()] || "") + "</span></li>";
      }).join("") : '<li class="cmd-empty">' + (lang() === "zh" ? "未找到命令：" : "command not found: ") + esc(q) + "</li>";
    }
    function highlight() {
      list.querySelectorAll(".cmd-item").forEach(function (li) {
        var on = +li.getAttribute("data-i") === sel;
        li.setAttribute("aria-selected", String(on));
        if (on) li.scrollIntoView({ block: "nearest" });
      });
    }
    function open(prefill) {
      lastFocus = document.activeElement;
      box.hidden = false;
      input.value = prefill || "";
      sel = 0;
      render();
      input.focus();
    }
    function close() {
      box.hidden = true;
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    function run(x) {
      if (!x) return;
      if (x.fill) { input.value = x.fill; render(); input.focus(); return; }
      var keep = x.run();
      if (!keep) close();
    }

    document.getElementById("cmd-open").addEventListener("click", function () { open(); });
    input.addEventListener("input", function () { sel = 0; render(); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); sel = (sel + 1) % Math.max(1, shown.length); highlight(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); sel = (sel - 1 + shown.length) % Math.max(1, shown.length); highlight(); }
      else if (e.key === "Tab") { e.preventDefault(); if (shown[sel] && !shown[sel].paper) { input.value = shown[sel].fill || shown[sel].c; render(); } }
      else if (e.key === "Enter") {
        e.preventDefault();
        var q = input.value.trim().toLowerCase();
        var exact = C.filter(function (x) { return x.c === q; })[0];
        run(exact || shown[sel]);
      } else if (e.key === "Escape") { e.preventDefault(); close(); }
    });
    list.addEventListener("mousemove", function (e) {
      var li = e.target.closest(".cmd-item");
      if (li && +li.getAttribute("data-i") !== sel) { sel = +li.getAttribute("data-i"); highlight(); }
    });
    list.addEventListener("click", function (e) {
      var li = e.target.closest(".cmd-item");
      if (li) run(shown[+li.getAttribute("data-i")]);
    });
    document.addEventListener("keydown", function (e) {
      var typing = /input|textarea|select/i.test((document.activeElement || {}).tagName || "");
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); if (box.hidden) open(); else close(); }
      else if (!typing && box.hidden && (e.key === ":" || e.key === "/")) { e.preventDefault(); open(); }
    });
    document.addEventListener("click", function (e) {
      if (!box.hidden && !box.contains(e.target) && !e.target.closest("#cmd-open")) close();
    });
    langListeners.push(function () { if (!box.hidden) render(); });
  })();
})();
