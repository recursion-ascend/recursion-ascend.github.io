#!/usr/bin/env python3
"""Create a new blog post or LeetCode solution and register it in the JSON index.

  python3 tools/new.py post "My Title" --tags hpc,notes [--zh "中文标题"] [--slug my-title]
  python3 tools/new.py lc 42 "Trapping Rain Water" --difficulty Hard --tags "Array,Two Pointers" [--zh 接雨水]
"""
import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def slugify(text):
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s


def split_list(value):
    return [x.strip() for x in value.split(",") if x.strip()] if value else []


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def save(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def new_post(args):
    today = dt.date.today().isoformat()
    slug = args.slug or slugify(args.title) or f"{today}-post"
    index_path = ROOT / "blog" / "posts.json"
    posts = load(index_path)
    if any(p["slug"] == slug for p in posts):
        sys.exit(f"slug '{slug}' already exists; pass --slug to pick another")
    md_path = ROOT / "blog" / "posts" / f"{slug}.md"
    md_path.write_text("## 第一节\n\n正文从这里开始。\n", encoding="utf-8")
    entry = {"slug": slug, "title": args.title, "date": today, "tags": split_list(args.tags), "summary": args.summary or ""}
    if args.zh:
        entry["title_zh"] = args.zh
    posts.insert(0, entry)
    save(index_path, posts)
    print(f"created {md_path.relative_to(ROOT)}  (edit title/summary in blog/posts.json)")


def new_lc(args):
    index_path = ROOT / "leetcode" / "problems.json"
    data = load(index_path)
    probs = data.setdefault("problems", [])
    if any(int(p["id"]) == args.id for p in probs):
        sys.exit(f"problem {args.id} already exists")
    slug = args.slug or slugify(args.title)
    fname = f"{args.id:04d}-{slug}.md"
    md_path = ROOT / "leetcode" / "solutions" / fname
    md_path.write_text(
        "## 题意\n\n\n\n## 思路\n\n\n\n## 复杂度\n\n- 时间 $O(n)$\n- 空间 $O(1)$\n\n"
        "## 代码\n\n### Python\n\n```python\nclass Solution:\n    pass\n```\n",
        encoding="utf-8",
    )
    entry = {
        "id": args.id,
        "title": args.title,
        "slug": slug,
        "difficulty": args.difficulty,
        "tags": split_list(args.tags),
        "lang": split_list(args.lang),
        "date": args.date or dt.date.today().isoformat(),
        "file": fname,
    }
    if args.zh:
        entry["title_zh"] = args.zh
    probs.append(entry)
    probs.sort(key=lambda p: int(p["id"]))
    save(index_path, data)
    print(f"created {md_path.relative_to(ROOT)}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="kind", required=True)

    p = sub.add_parser("post", help="new blog post")
    p.add_argument("title")
    p.add_argument("--zh", help="Chinese title")
    p.add_argument("--slug", help="URL slug (defaults to the title in kebab-case)")
    p.add_argument("--tags", help="comma-separated")
    p.add_argument("--summary")
    p.set_defaults(fn=new_post)

    q = sub.add_parser("lc", help="new LeetCode solution")
    q.add_argument("id", type=int)
    q.add_argument("title", help="English title as on leetcode.com")
    q.add_argument("--zh", help="Chinese title as on leetcode.cn")
    q.add_argument("--slug", help="leetcode URL slug (defaults to the title in kebab-case)")
    q.add_argument("--difficulty", required=True, choices=["Easy", "Medium", "Hard"])
    q.add_argument("--tags", help='comma-separated, e.g. "Array,Two Pointers"')
    q.add_argument("--lang", default="Python", help="comma-separated")
    q.add_argument("--date", help="YYYY-MM-DD, defaults to today")
    q.set_defaults(fn=new_lc)

    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
