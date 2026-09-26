#!/usr/bin/env python3
"""Create a new blog post and register it in blog/posts.json.

  python3 tools/new.py post "My Title" --tags hpc,notes [--zh "中文标题"] [--slug my-title]
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

    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
