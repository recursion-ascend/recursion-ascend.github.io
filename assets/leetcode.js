/* LeetCode list (leetcode/index.html) and single solution (leetcode/problem.html). */
(function () {
  "use strict";
  var S = window.Site;
  var listEl = document.getElementById("lc-list");
  var probEl = document.getElementById("lc-content");
  if (!S || (!listEl && !probEl)) return;

  var MSG = {
    loadError: '<span class="en">Could not load problems.</span><span class="zh" lang="zh-CN">题目加载失败。</span>',
    none: '<span class="en">No problems match.</span><span class="zh" lang="zh-CN">没有符合条件的题目。</span>',
    notFound: '<span class="en">Problem not found.</span><span class="zh" lang="zh-CN">找不到这道题。</span>'
  };
  var EXT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';

  function byDateDesc(a, b) { return String(b.date).localeCompare(String(a.date)) || (+b.id - +a.id); }

  S.getJSON("leetcode/problems.json").then(function (data) {
    var probs = (data.problems || []).slice();
    if (listEl) initList(data, probs);
    if (probEl) initProblem(probs);
  }).catch(function () {
    var st = document.getElementById("state");
    st.hidden = false;
    st.innerHTML = MSG.loadError;
  });

  /* ---------- date helpers (local calendar days) ---------- */
  function iso(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function today() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }

  function streaks(dates) {
    var set = {};
    dates.forEach(function (d) { set[d] = true; });
    var days = Object.keys(set).sort();
    var longest = 0, run = 0, prev = null;
    days.forEach(function (d) {
      var cur = new Date(d + "T00:00:00");
      run = prev && iso(addDays(prev, 1)) === d ? run + 1 : 1;
      longest = Math.max(longest, run);
      prev = cur;
    });
    var cursor = today();
    if (!set[iso(cursor)]) cursor = addDays(cursor, -1);
    var current = 0;
    while (set[iso(cursor)]) { current++; cursor = addDays(cursor, -1); }
    return { active: days.length, longest: longest, current: current };
  }

  /* ---------- heatmap (sequential, one hue) ---------- */
  var LEVEL_STYLE = [
    "fill: rgba(var(--ink-rgb), .07)",
    "fill: rgba(var(--accent-rgb), .30)",
    "fill: rgba(var(--accent-rgb), .52)",
    "fill: rgba(var(--accent-rgb), .76)",
    "fill: rgb(var(--accent-rgb))"
  ];
  function level(n) { return n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n <= 4 ? 3 : 4; }

  function heatmap(el, probs) {
    var counts = {};
    probs.forEach(function (p) { counts[p.date] = (counts[p.date] || 0) + 1; });
    var CELL = 11, GAP = 3, STEP = CELL + GAP, LEFT = 26, TOP = 18;
    var width = el.clientWidth || 600;
    var weeks = Math.max(12, Math.min(53, Math.floor((width - LEFT) / STEP)));
    var end = today();
    var dow = (end.getDay() + 6) % 7; // Monday = 0
    var start = addDays(end, -dow - (weeks - 1) * 7);
    var zh = S.lang() === "zh";
    var monthFmt = new Intl.DateTimeFormat(zh ? "zh-CN" : "en-US", { month: "short" });

    var svg = '<svg width="' + (LEFT + weeks * STEP) + '" height="' + (TOP + 7 * STEP) + '" role="img" aria-label="' +
      (zh ? "刷题活跃度热力图" : "Problem-solving activity heatmap") + '">';
    var rowLabels = zh ? ["一", "", "三", "", "五", "", ""] : ["Mon", "", "Wed", "", "Fri", "", ""];
    rowLabels.forEach(function (l, r) {
      if (l) svg += '<text x="0" y="' + (TOP + r * STEP + 9) + '">' + l + "</text>";
    });
    var lastMonth = -1, lastLabelCol = -10;
    for (var w = 0; w < weeks; w++) {
      var colStart = addDays(start, w * 7);
      var m = colStart.getMonth();
      if (m !== lastMonth) {
        if (w - lastLabelCol >= 3 && w < weeks - 1) {
          svg += '<text x="' + (LEFT + w * STEP) + '" y="10">' + monthFmt.format(colStart) + "</text>";
          lastLabelCol = w;
        }
        lastMonth = m;
      }
      for (var r = 0; r < 7; r++) {
        var d = addDays(colStart, r);
        if (d > end) break;
        var key = iso(d), n = counts[key] || 0;
        svg += '<rect class="cell" x="' + (LEFT + w * STEP) + '" y="' + (TOP + r * STEP) + '" width="' + CELL + '" height="' + CELL +
          '" rx="2" style="' + LEVEL_STYLE[level(n)] + '" data-d="' + key + '" data-n="' + n + '"></rect>';
      }
    }
    el.innerHTML = svg + "</svg>";
  }

  function heatTip(e) {
    var c = e.target.closest("rect.cell");
    if (!c) { S.tip(null); return; }
    var n = +c.getAttribute("data-n"), zh = S.lang() === "zh";
    var what = zh ? (n ? n + " 题" : "无提交") : (n ? n + (n === 1 ? " problem" : " problems") : "No problems");
    var r = c.getBoundingClientRect();
    S.tip("<b>" + what + "</b> · <small>" + S.esc(S.fmtDate(c.getAttribute("data-d"))) + "</small>", r.left + r.width / 2, r.top);
  }

  /* ---------- list page ---------- */
  function initList(data, probs) {
    var q = document.getElementById("q");
    var sortSel = document.getElementById("sort");
    var diffChips = document.querySelectorAll(".chip[data-diff]");
    var tagsEl = document.getElementById("tags");
    var state = document.getElementById("state");
    var heatEl = document.getElementById("heat");
    var diff = "all", activeTag = null;

    // profile buttons
    var prof = data.profile || {};
    var links = [];
    if (prof.leetcode) links.push('<a class="btn" href="' + S.esc(prof.leetcode) + '" target="_blank" rel="noopener">LeetCode ' + EXT + "</a>");
    if (prof.leetcode_cn) links.push('<a class="btn" href="' + S.esc(prof.leetcode_cn) + '" target="_blank" rel="noopener">力扣 ' + EXT + "</a>");
    var linksEl = document.getElementById("lc-profile");
    linksEl.innerHTML = links.join("");
    linksEl.hidden = !links.length;

    // counts on difficulty chips
    diffChips.forEach(function (c) {
      var d = c.getAttribute("data-diff");
      c.querySelector("i").textContent = d === "all" ? probs.length : probs.filter(function (p) { return p.difficulty === d; }).length;
      c.addEventListener("click", function () {
        diff = d;
        diffChips.forEach(function (x) { x.classList.toggle("active", x === c); });
        render();
      });
    });

    var counts = {};
    probs.forEach(function (p) { (p.tags || []).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; }); });
    var tags = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || a.localeCompare(b); });

    function renderTags() {
      tagsEl.hidden = !tags.length;
      tagsEl.innerHTML = tags.map(function (t) {
        return '<button class="chip' + (activeTag === t ? " active" : "") + '" data-tag="' + S.esc(t) + '">' +
          S.esc(S.tagName(t)) + '<i class="mono">' + counts[t] + "</i></button>";
      }).join("");
    }
    tagsEl.addEventListener("click", function (e) {
      var b = e.target.closest(".chip");
      if (!b) return;
      var t = b.getAttribute("data-tag");
      activeTag = activeTag === t ? null : t;
      renderTags();
      render();
    });

    function renderStats() {
      document.getElementById("total").textContent = probs.length;
      S.diffBar(document.getElementById("bar"), document.getElementById("legend"), probs);
      var st = streaks(probs.map(function (p) { return p.date; }));
      document.getElementById("s-active").textContent = st.active;
      document.getElementById("s-current").textContent = st.current;
      document.getElementById("s-longest").textContent = st.longest;
      heatmap(heatEl, probs);
    }

    function render() {
      var term = q.value.trim().toLowerCase();
      var shown = probs.filter(function (p) {
        if (diff !== "all" && p.difficulty !== diff) return false;
        if (activeTag && (p.tags || []).indexOf(activeTag) === -1) return false;
        if (!term) return true;
        var hay = [p.id, p.title, p.title_zh, (p.tags || []).join(" "), (p.tags || []).map(S.tagName).join(" ")].join(" ").toLowerCase();
        return hay.indexOf(term) !== -1;
      });
      shown.sort(sortSel.value === "id" ? function (a, b) { return +a.id - +b.id; } : byDateDesc);
      listEl.innerHTML = shown.map(function (p) {
        return '<li class="lc-row"><a href="problem.html?id=' + encodeURIComponent(p.id) + '">' +
          '<span class="lc-id">' + S.esc(p.id) + "</span>" +
          '<span class="lc-title">' + S.esc(S.pick(p, "title")) + "</span>" +
          '<span class="mini-tags">' + (p.tags || []).slice(0, 2).map(function (t) { return "<span>" + S.esc(S.tagName(t)) + "</span>"; }).join("") + "</span>" +
          '<span class="lc-diff"><i class="ddot ' + S.esc(p.difficulty) + '"></i>' + S.esc(S.diffName(p.difficulty)) + "</span>" +
          '<span class="lc-date">' + S.esc(S.fmtDate(p.date, true)) + "</span></a></li>";
      }).join("");
      state.hidden = shown.length > 0;
      state.innerHTML = MSG.none;
    }

    function placeholder() {
      var zh = S.lang() === "zh";
      q.placeholder = zh ? "搜索题号、题目或标签…" : "Search number, title or tag…";
      sortSel.options[0].text = zh ? "按日期（最新）" : "Newest first";
      sortSel.options[1].text = zh ? "按题号" : "By number";
    }

    q.addEventListener("input", render);
    sortSel.addEventListener("change", render);
    heatEl.addEventListener("pointermove", heatTip);
    heatEl.addEventListener("pointerleave", function () { S.tip(null); });
    var rt;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(function () { heatmap(heatEl, probs); }, 150);
    });
    S.onLang(function () { placeholder(); renderTags(); renderStats(); render(); });

    placeholder();
    renderTags();
    renderStats();
    render();
  }

  /* ---------- single problem ---------- */
  function initProblem(probs) {
    var id = window.MD.param("id");
    var state = document.getElementById("state");
    probs.sort(function (a, b) { return +a.id - +b.id; });
    var idx = -1;
    probs.forEach(function (p, i) { if (String(p.id) === String(id)) idx = i; });
    if (idx === -1) {
      state.hidden = false;
      state.innerHTML = MSG.notFound;
      document.getElementById("lc-head").hidden = true;
      return;
    }
    var p = probs[idx];

    function renderHead() {
      document.getElementById("lc-num").textContent = "#" + p.id;
      document.getElementById("lc-title").textContent = S.pick(p, "title");
      S.setTitle(p.id + ". " + p.title + " — LeetCode", p.id + ". " + (p.title_zh || p.title) + " — 力扣");
      var meta = ['<span class="lc-diff"><i class="ddot ' + S.esc(p.difficulty) + '"></i>' + S.esc(S.diffName(p.difficulty)) + "</span>",
        "<span>" + S.esc(S.fmtDate(p.date)) + "</span>"];
      if (p.lang && p.lang.length) meta.push("<span>" + p.lang.map(S.esc).join(" · ") + "</span>");
      document.getElementById("lc-meta").innerHTML = meta.join("");
      document.getElementById("lc-tags").innerHTML = (p.tags || []).map(function (t) { return "<span>" + S.esc(S.tagName(t)) + "</span>"; }).join("");
      var slug = p.slug ? encodeURIComponent(p.slug) : "";
      document.getElementById("lc-ext").innerHTML = slug ?
        '<a class="btn" href="https://leetcode.com/problems/' + slug + '/" target="_blank" rel="noopener">LeetCode ' + EXT + "</a>" +
        '<a class="btn" href="https://leetcode.cn/problems/' + slug + '/" target="_blank" rel="noopener">力扣 ' + EXT + "</a>" : "";

      var prev = probs[idx - 1], next = probs[idx + 1], zh = S.lang() === "zh";
      var html = "";
      if (prev) html += '<a class="prev" href="problem.html?id=' + encodeURIComponent(prev.id) + '"><small>' + (zh ? "← 上一题" : "← Previous") + "</small><span>" + S.esc(prev.id + ". " + S.pick(prev, "title")) + "</span></a>";
      if (next) html += '<a class="next" href="problem.html?id=' + encodeURIComponent(next.id) + '"><small>' + (zh ? "下一题 →" : "Next →") + "</small><span>" + S.esc(next.id + ". " + S.pick(next, "title")) + "</span></a>";
      document.getElementById("pager").innerHTML = html;
    }

    renderHead();
    S.onLang(renderHead);

    window.MD.fetchText("leetcode/solutions/" + p.file).then(function (md) {
      window.MD.render(md, probEl);
      window.MD.toc(probEl, document.getElementById("toc"));
    }).catch(function () {
      state.hidden = false;
      state.innerHTML = MSG.notFound;
    });
  }
})();
