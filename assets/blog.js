/* Blog list (blog/index.html) and single post (blog/post.html). */
(function () {
  "use strict";
  var S = window.Site;
  var listEl = document.getElementById("post-list");
  var postEl = document.getElementById("post-content");
  if (!S || (!listEl && !postEl)) return;

  var MSG = {
    loadError: '<span class="en">Could not load posts.</span><span class="zh" lang="zh-CN">文章加载失败。</span>',
    none: '<span class="en">No posts match.</span><span class="zh" lang="zh-CN">没有符合条件的文章。</span>',
    notFound: '<span class="en">Post not found.</span><span class="zh" lang="zh-CN">找不到这篇文章。</span>'
  };

  function byDateDesc(a, b) { return String(b.date).localeCompare(String(a.date)); }

  S.getJSON("blog/posts.json").then(function (posts) {
    posts = posts.slice().sort(byDateDesc);
    if (listEl) initList(posts);
    if (postEl) initPost(posts);
  }).catch(function () {
    var st = document.getElementById("state");
    st.hidden = false;
    st.innerHTML = MSG.loadError;
  });

  /* ---------- list ---------- */
  function initList(posts) {
    var q = document.getElementById("q");
    var tagsEl = document.getElementById("tags");
    var state = document.getElementById("state");
    var activeTag = null;

    var counts = {};
    posts.forEach(function (p) { (p.tags || []).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; }); });
    var tags = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || a.localeCompare(b); });

    function renderTags() {
      if (!tags.length) { tagsEl.hidden = true; return; }
      tagsEl.innerHTML = ['<button class="chip' + (activeTag ? "" : " active") + '" data-tag="">' +
        '<span class="en">all</span><span class="zh" lang="zh-CN">全部</span><i>' + posts.length + "</i></button>"]
        .concat(tags.map(function (t) {
          return '<button class="chip' + (activeTag === t ? " active" : "") + '" data-tag="' + S.esc(t) + '">#' +
            S.esc(t) + "<i>" + counts[t] + "</i></button>";
        })).join("");
    }
    tagsEl.addEventListener("click", function (e) {
      var b = e.target.closest(".chip");
      if (!b) return;
      activeTag = b.getAttribute("data-tag") || null;
      renderTags();
      render();
    });

    function render() {
      var term = q.value.trim().toLowerCase();
      var shown = posts.filter(function (p) {
        if (activeTag && (p.tags || []).indexOf(activeTag) === -1) return false;
        if (!term) return true;
        return [p.title, p.title_zh, p.summary, p.summary_zh, (p.tags || []).join(" ")].join(" ").toLowerCase().indexOf(term) !== -1;
      });
      listEl.innerHTML = shown.map(function (p) {
        // date in pencil, then title, summary and tags
        return '<li class="post-item"><a href="post.html?p=' + encodeURIComponent(p.slug) + '">' +
          "<time>" + S.esc(p.date) + "</time>" +
          '<span class="ti">' + S.esc(S.pick(p, "title")) + "</span>" +
          (S.pick(p, "summary") ? '<span class="su">' + S.esc(S.pick(p, "summary")) + "</span>" : "") +
          ((p.tags || []).length ? '<span class="tg">' + (p.tags || []).map(function (t) { return "#" + S.esc(t); }).join(" ") + "</span>" : "") +
          "</a></li>";
      }).join("");
      state.hidden = shown.length > 0;
      state.innerHTML = MSG.none;
    }

    function placeholder() { q.placeholder = S.lang() === "zh" ? "输入关键词" : "a word or two"; }
    q.addEventListener("input", render);
    S.onLang(function () { placeholder(); render(); });
    placeholder();
    renderTags();
    render();
  }

  /* ---------- single post ---------- */
  function initPost(posts) {
    var slug = window.MD.param("p");
    var idx = -1;
    posts.forEach(function (p, i) { if (p.slug === slug) idx = i; });
    var state = document.getElementById("state");
    if (idx === -1) {
      state.hidden = false;
      state.innerHTML = MSG.notFound;
      document.getElementById("post-head").hidden = true;
      return;
    }
    var post = posts[idx];
    var minutes = null;

    function renderHead() {
      var title = S.pick(post, "title");
      document.getElementById("post-title").textContent = title;
      S.setTitle(post.title + " — Bowen Su", (post.title_zh || post.title) + " — Bowen Su");
      var fileEl = document.getElementById("post-file");
      if (fileEl) fileEl.textContent = post.slug + ".md";
      var meta = [S.esc(post.date)];
      if (minutes) meta.push(S.lang() === "zh" ? minutes + " 分钟阅读" : minutes + " min read");
      meta = meta.concat((post.tags || []).map(function (t) { return "#" + S.esc(t); }));
      document.getElementById("post-meta").innerHTML = meta.map(function (m) { return "<span>" + m + "</span>"; }).join("");
    }

    function renderPager() {
      // posts are newest-first: "newer" is idx-1, "older" is idx+1
      var newer = posts[idx - 1], older = posts[idx + 1];
      var zh = S.lang() === "zh";
      var html = "";
      if (older) html += '<a class="prev" href="post.html?p=' + encodeURIComponent(older.slug) + '"><small>' + (zh ? "← 上一篇" : "← Older") + "</small><span>" + S.esc(S.pick(older, "title")) + "</span></a>";
      if (newer) html += '<a class="next" href="post.html?p=' + encodeURIComponent(newer.slug) + '"><small>' + (zh ? "下一篇 →" : "Newer →") + "</small><span>" + S.esc(S.pick(newer, "title")) + "</span></a>";
      document.getElementById("pager").innerHTML = html;
    }

    renderHead();
    renderPager();
    S.onLang(function () { renderHead(); renderPager(); });

    window.MD.fetchText("blog/posts/" + post.slug + ".md").then(function (md) {
      minutes = window.MD.readingMinutes(md);
      renderHead();
      window.MD.render(md, postEl);
      if (window.location.hash) {
        var target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
        if (target) target.scrollIntoView();
      }
      window.MD.toc(postEl, document.getElementById("toc"));
    }).catch(function () {
      state.hidden = false;
      state.innerHTML = MSG.notFound;
    });
  }
})();
