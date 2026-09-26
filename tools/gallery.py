#!/usr/bin/env python3
"""Manage the photo gallery.

Photos are resized for the web, re-encoded WITHOUT metadata (EXIF, including GPS
coordinates, is dropped), and registered in gallery/photos.json. Originals are never
copied into the site. If a photo carries GPS, its city-level place name is looked up
once (OpenStreetMap Nominatim) and stored as text; coordinates are not stored.

  python3 tools/gallery.py add ~/Pictures/trip/*.jpg --album "Kyoto 2025"
  python3 tools/gallery.py add IMG_0042.jpg --caption "Sunset over the lake" --zh "湖边日落"
  python3 tools/gallery.py add IMG_0042.jpg --place "Laguna Beach, California" --place-zh "美国 · 加州 · 拉古纳海滩"
  python3 tools/gallery.py set img_0042 --place "Laguna Beach, California"
  python3 tools/gallery.py remove IMG_0042 "demo-*"
  python3 tools/gallery.py list

Everything can also be edited by hand in gallery/photos.json.
HEIC files are converted with macOS `sips` (or install `pip install pillow-heif`).
"""
import argparse
import datetime as dt
import fnmatch
import json
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("This script needs Pillow:  pip install Pillow")
try:
    import pillow_heif  # optional, for iPhone .heic

    pillow_heif.register_heif_opener()
except ImportError:
    pass

ROOT = Path(__file__).resolve().parent.parent
GALLERY = ROOT / "gallery"
FULL_DIR = GALLERY / "photos"
THUMB_DIR = GALLERY / "thumbs"
INDEX = GALLERY / "photos.json"
FULL_EDGE = 2400   # long edge of the lightbox image
THUMB_EDGE = 900   # long edge of the grid thumbnail


def load():
    return json.loads(INDEX.read_text(encoding="utf-8")) if INDEX.exists() else []


def save(items):
    # newest first; undated photos keep their order at the end
    items.sort(key=lambda p: p.get("date") or "", reverse=True)
    INDEX.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def slug(stem):
    return re.sub(r"[^A-Za-z0-9_-]+", "-", stem).strip("-").lower() or "photo"


def date_taken(img):
    try:
        exif = img.getexif()
        raw = exif.get_ifd(0x8769).get(36867) or exif.get(306)  # DateTimeOriginal, then DateTime
        if raw:
            return dt.datetime.strptime(str(raw)[:19], "%Y:%m:%d %H:%M:%S").date().isoformat()
    except Exception:
        pass
    return None


def gps_coords(img):
    """(lat, lon) in degrees from the EXIF GPS block, or None."""
    try:
        gps = img.getexif().get_ifd(0x8825)
        if 2 not in gps or 4 not in gps:
            return None

        def degrees(v):
            d, m, sec = (float(x) for x in v)
            return d + m / 60 + sec / 3600

        lat, lon = degrees(gps[2]), degrees(gps[4])
        if str(gps.get(1, "N")).strip("b'").upper().startswith("S"):
            lat = -lat
        if str(gps.get(3, "E")).strip("b'").upper().startswith("W"):
            lon = -lon
        return lat, lon
    except Exception:
        return None


_last_request = [0.0]


def place_name(lat, lon, lang):
    """City-level place name via OpenStreetMap Nominatim (max 1 request/second)."""
    wait = 1.1 - (time.time() - _last_request[0])
    if wait > 0:
        time.sleep(wait)
    query = urllib.parse.urlencode({
        "format": "jsonv2", "zoom": 10, "accept-language": lang,
        # ~100 m precision is plenty for a city name
        "lat": f"{lat:.3f}", "lon": f"{lon:.3f}",
    })
    req = urllib.request.Request("https://nominatim.openstreetmap.org/reverse?" + query,
                                 headers={"User-Agent": "personal-site gallery tool"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            addr = json.load(r).get("address", {})
    except Exception as e:
        print(f"  (place lookup failed: {e})")
        return ""
    finally:
        _last_request[0] = time.time()

    def first(v):
        return v.split(";")[0].strip() if v else ""  # "简体;繁體" -> "简体"

    city = first(addr.get("city") or addr.get("town") or addr.get("village") or addr.get("hamlet")
                 or addr.get("municipality") or addr.get("county"))
    parts = [city, first(addr.get("state")), first(addr.get("country"))]
    parts = [p for i, p in enumerate(parts) if p and p not in parts[:i]]
    return " · ".join(reversed(parts)) if lang.startswith("zh") else ", ".join(parts)


def resized(img, edge):
    out = img.copy()
    out.thumbnail((edge, edge), Image.LANCZOS)
    return out


def average_color(img):
    r, g, b = img.resize((1, 1), Image.BOX).getpixel((0, 0))[:3]
    return f"#{r:02x}{g:02x}{b:02x}"


def open_image(path):
    """Open with Pillow; on macOS fall back to `sips` for HEIC (metadata is kept for reading)."""
    try:
        return Image.open(path)
    except Exception:
        if not shutil.which("sips"):
            raise
        tmp = Path(tempfile.mkdtemp()) / (path.stem + ".jpg")
        subprocess.run(["sips", "-s", "format", "jpeg", str(path), "--out", str(tmp)],
                       check=True, capture_output=True)
        img = Image.open(tmp)
        img.load()
        return img


def cmd_add(args):
    FULL_DIR.mkdir(parents=True, exist_ok=True)
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    items = load()
    names = {p["name"] for p in items}
    for path in args.files:
        path = Path(path).expanduser()
        try:
            src = open_image(path)
        except Exception as e:
            print(f"skip {path}: {e}")
            continue
        taken = args.date or date_taken(src)
        place, place_zh = args.place or "", args.place_zh or ""
        coords = None if (args.place or args.no_geocode) else gps_coords(src)
        if coords:
            place = place_name(*coords, "en")
            place_zh = place_name(*coords, "zh-CN")
        img = ImageOps.exif_transpose(src).convert("RGB")  # bake in rotation, then drop metadata

        name = base = slug(path.stem)
        k = 2
        while name in names:
            name = f"{base}-{k}"
            k += 1

        full, thumb = resized(img, FULL_EDGE), resized(img, THUMB_EDGE)
        # No exif=/icc_profile= arguments: the written JPEGs carry no metadata.
        full.save(FULL_DIR / f"{name}.jpg", "JPEG", quality=85, optimize=True, progressive=True)
        thumb.save(THUMB_DIR / f"{name}.jpg", "JPEG", quality=80, optimize=True, progressive=True)

        items.append({
            "name": name,
            "w": full.width,
            "h": full.height,
            "color": average_color(thumb),
            "date": taken,
            "album": args.album or "",
            "caption": args.caption or "",
            "caption_zh": args.zh or "",
            "location": place,
            "location_zh": place_zh or place,
        })
        names.add(name)
        size_kb = (FULL_DIR / f"{name}.jpg").stat().st_size // 1024
        print(f"added {name}  {full.width}x{full.height}  {size_kb} KB  {taken or 'no date'}  {place or 'no location'}")
    save(items)


def cmd_remove(args):
    items = load()
    keep, gone = [], []
    for p in items:
        (gone if any(fnmatch.fnmatch(p["name"], pat) for pat in args.names) else keep).append(p)
    for p in gone:
        for d in (FULL_DIR, THUMB_DIR):
            (d / f"{p['name']}.jpg").unlink(missing_ok=True)
        print(f"removed {p['name']}")
    if not gone:
        print("nothing matched")
    save(keep)


def cmd_set(args):
    items = load()
    hit = [p for p in items if p["name"] == args.name]
    if not hit:
        sys.exit(f"no photo named {args.name!r} (see: python3 tools/gallery.py list)")
    p = hit[0]
    for field, value in [("caption", args.caption), ("caption_zh", args.zh), ("album", args.album),
                         ("date", args.date), ("location", args.place), ("location_zh", args.place_zh)]:
        if value is not None:
            p[field] = value
    if args.place is not None and args.place_zh is None:
        p["location_zh"] = args.place
    save(items)
    print(json.dumps(p, ensure_ascii=False, indent=2))


def cmd_list(_args):
    for p in load():
        print(f"{p['name']:<24} {p.get('date') or '—':<11} {p.get('album') or '':<14} {p.get('location') or '':<34} {p.get('caption') or ''}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("add", help="add photos")
    a.add_argument("files", nargs="+")
    a.add_argument("--album", help="album name, shown as a filter")
    a.add_argument("--caption", help="caption (applied to every file in this call)")
    a.add_argument("--zh", help="Chinese caption")
    a.add_argument("--date", help="YYYY-MM-DD, overrides the EXIF date")
    a.add_argument("--place", help="place name, overrides the GPS lookup")
    a.add_argument("--place-zh", help="Chinese place name")
    a.add_argument("--no-geocode", action="store_true", help="don't look up a place name from GPS")
    a.set_defaults(fn=cmd_add)

    st = sub.add_parser("set", help="edit a photo's caption / album / date / place")
    st.add_argument("name")
    st.add_argument("--caption")
    st.add_argument("--zh", help="Chinese caption")
    st.add_argument("--album")
    st.add_argument("--date")
    st.add_argument("--place")
    st.add_argument("--place-zh")
    st.set_defaults(fn=cmd_set)

    r = sub.add_parser("remove", help="remove photos by name (glob patterns allowed)")
    r.add_argument("names", nargs="+")
    r.set_defaults(fn=cmd_remove)

    ls = sub.add_parser("list", help="list photos")
    ls.set_defaults(fn=cmd_list)

    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
