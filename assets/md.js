/* Markdown rendering for blog posts.
   Needs marked (+ optional katex / marked-katex-extension / highlight.js) loaded first. */
(function () {
  "use strict";

  var ready = false;
  function setup() {
    if (ready) return;
    ready = true;
    marked.use({ gfm: true });
    if (window.markedKatex && window.katex) {
      // nonStandard lets $x$ sit right next to CJK characters.
      marked.use(window.markedKatex({ throwOnError: false, nonStandard: true }));
    }
  }

  function slugify(text, used) {
    var base = text.toLowerCase().trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s+/g, "-") || "section";
    var id = base, i = 2;
    while (used[id]) id = base + "-" + i++;
    used[id] = true;
    return id;
  }

  var COPY = '<span class="en">Copy</span><span class="zh" lang="zh-CN">复制</span>';
  var COPIED = '<span class="en">Copied</span><span class="zh" lang="zh-CN">已复制</span>';

  function render(md, el) {
    setup();
    md = md.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n/, ""); // tolerate front matter
    el.innerHTML = marked.parse(md);

    var used = {};
    el.querySelectorAll("h2, h3").forEach(function (h) { h.id = slugify(h.textContent, used); });

    el.querySelectorAll("table").forEach(function (t) {
      var w = document.createElement("div");
      w.className = "table-wrap";
      t.parentNode.insertBefore(w, t);
      w.appendChild(t);
    });

    el.querySelectorAll("pre > code").forEach(function (code) {
      var pre = code.parentNode;
      var m = /language-([\w+#-]+)/.exec(code.className);
      var lang = m ? m[1] : "";
      if (window.hljs && lang && window.hljs.getLanguage(lang)) window.hljs.highlightElement(code);

      var box = document.createElement("div");
      box.className = "code-block";
      pre.parentNode.insertBefore(box, pre);
      box.appendChild(pre);
      if (lang) {
        var label = document.createElement("span");
        label.className = "code-lang";
        label.textContent = lang;
        box.appendChild(label);
      } else {
        pre.style.paddingTop = "18px";
      }
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "copy-code";
      btn.innerHTML = COPY;
      btn.addEventListener("click", function () {
        if (!navigator.clipboard) return;
        navigator.clipboard.writeText(code.textContent).then(function () {
          btn.innerHTML = COPIED;
          setTimeout(function () { btn.innerHTML = COPY; }, 1500);
        });
      });
      box.appendChild(btn);
    });

    el.querySelectorAll('a[href^="http"]').forEach(function (a) {
      a.target = "_blank";
      a.rel = "noopener";
    });
    return el;
  }

  // Table of contents from h2/h3 + scroll spy.
  function toc(contentEl, tocEl) {
    var heads = Array.prototype.slice.call(contentEl.querySelectorAll("h2, h3"));
    if (heads.length < 2) { tocEl.hidden = true; return; }
    tocEl.hidden = false;
    var ol = tocEl.querySelector("ol");
    ol.innerHTML = heads.map(function (h) {
      return '<li class="lvl-' + h.tagName.charAt(1) + '"><a href="#' + h.id + '">' + window.Site.esc(h.textContent) + "</a></li>";
    }).join("");
    var links = ol.querySelectorAll("a");
    var tick = false;
    function spy() {
      tick = false;
      var cur = 0;
      var line = Math.max(140, window.innerHeight * 0.3);
      heads.forEach(function (h, i) { if (h.getBoundingClientRect().top < line) cur = i; });
      links.forEach(function (a, i) { a.classList.toggle("active", i === cur); });
    }
    window.addEventListener("scroll", function () {
      if (!tick) { tick = true; requestAnimationFrame(spy); }
    }, { passive: true });
    spy();
  }

  // ~400 CJK chars or ~220 English words per minute.
  function readingMinutes(text) {
    var cjk = (text.match(/[㐀-鿿]/g) || []).length;
    var words = (text.replace(/[㐀-鿿]/g, " ").match(/[A-Za-z0-9_]+/g) || []).length;
    return Math.max(1, Math.round(cjk / 400 + words / 220));
  }

  function fetchText(path) {
    return fetch(window.Site.root + path, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error(r.status + " " + path);
      return r.text();
    });
  }

  function param(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  window.MD = { render: render, toc: toc, readingMinutes: readingMinutes, fetchText: fetchText, param: param };
})();
