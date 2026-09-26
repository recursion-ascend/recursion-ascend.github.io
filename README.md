# recursion-ascend.github.io

Plain HTML/CSS/JS, no build step — GitHub Pages serves it as is.

```
index.html              home page
blog/                   blog list (index.html) + reader (post.html)
  posts.json            post index: slug, title(_zh), date, tags, summary(_zh)
  posts/<slug>.md       post bodies (Markdown + $math$ + fenced code)
leetcode/               problem list (index.html) + solution reader (problem.html)
  problems.json         problem index + optional profile links
  solutions/NNNN-*.md   solution bodies
assets/                 md.js (markdown/KaTeX/highlight), blog.js, leetcode.js
tools/new.py            scaffold a post or a solution and register it in the index
```

## Add content

```bash
python3 tools/new.py post "Post title" --zh "中文标题" --tags hpc,notes
python3 tools/new.py lc 70 "Climbing Stairs" --zh 爬楼梯 --difficulty Easy --tags "Dynamic Programming,Math"
```

Then edit the generated `.md` file and push. To show LeetCode profile buttons, fill in
`profile.leetcode` / `profile.leetcode_cn` in `leetcode/problems.json`.

## Preview locally

```bash
python3 -m http.server 8000
```

Open http://localhost:8000 (pages load JSON/Markdown with `fetch`, so opening the files directly won't work).
