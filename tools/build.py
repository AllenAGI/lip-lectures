#!/usr/bin/env python3
"""Rebuild data.js and decks/*.html from skJack/-lip-.

Runs locally or in GitHub Actions. Only text files are fetched (decks, notes,
READMEs); images/videos stay remote and are referenced through a mirror.
"""
import html
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

SRC_REPO = "skJack/-lip-"
RAW = "https://raw.githubusercontent.com/%s/main/" % SRC_REPO
MIRROR = "https://ghproxy.net/https://raw.githubusercontent.com/%s/main/" % SRC_REPO
API = "https://api.github.com/repos/%s" % SRC_REPO

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DECKS = os.path.join(ROOT, "decks")
VIDEOS = os.path.join(ROOT, "videos.json")
TOKEN = (os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN") or "").strip()

H = {"User-Agent": "lip-sync", "Accept": "application/vnd.github+json"}
if TOKEN:
    H["Authorization"] = "Bearer " + TOKEN


def _get(url, headers, timeout=60):
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def api(path, raw=False):
    url = API + path
    headers = dict(H)
    if raw:
        headers["Accept"] = "application/vnd.github.raw"
    data = _get(url, headers)
    return data if raw else json.loads(data.decode("utf8"))


def fetch_text(path):
    """With a token use the API first (fast, 5000 req/h); otherwise raw; mirror last."""
    order = ["api", "raw", "mirror"] if TOKEN else ["raw", "api", "mirror"]
    timeouts = {"api": 90, "raw": 15, "mirror": 180}
    for attempt in order:
        try:
            if attempt == "api" and TOKEN:
                return api("/contents/" + urllib.parse.quote(path) + "?ref=main", raw=True).decode("utf8")
            if attempt == "raw":
                return _get(RAW + urllib.parse.quote(path), {"User-Agent": "lip-sync"}, timeout=timeouts["raw"]).decode("utf8")
            if attempt == "mirror":
                return _get(MIRROR + urllib.parse.quote(path), {"User-Agent": "lip-sync"}, timeout=timeouts["mirror"]).decode("utf8")
        except Exception as exc:  # noqa: BLE001
            print("  retry %s for %s: %s" % (attempt, path[:60], exc), file=sys.stderr)
    raise RuntimeError("cannot fetch " + path)


def strip_tags(s):
    s = re.sub(r"<script[\s\S]*?</script>", " ", s)
    s = re.sub(r"<style[\s\S]*?</style>", " ", s)
    s = re.sub(r"<svg[\s\S]*?</svg>", " ", s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def topics(title):
    out = []
    if re.search(r"VLA|RT-2|OpenVLA|π0|pi0|πstar", title, re.I):
        out.append("VLA")
    if re.search(r"世界模型|World\s*Model|WAM|World Action|JEPA|Dreamer", title, re.I):
        out.append("世界模型")
    if re.search(r"强化学习|PPO|RECAP|RL", title, re.I):
        out.append("强化学习")
    if re.search(r"VLN|导航", title, re.I):
        out.append("导航")
    if re.search(r"机器人|Franka|ALOHA|Spot|宇树|Atlas|MuJoCo|LIBERO|人形", title, re.I):
        out.append("本体与仿真")
    if re.search(r"数据|DROID|OXE|AgiBot", title, re.I):
        out.append("数据")
    if re.search(r"视频|Flow\s*Matching|AdaLN|生成", title, re.I):
        out.append("生成模型")
    return out


def parse_deck(raw):
    sections = re.findall(r"<section\b[^>]*class=\"slide[^\"]*\"[\s\S]*?</section>", raw)
    slides = []
    for i, sec in enumerate(sections):
        m = re.search(r'data-title="([^"]*)"', sec)
        title = html.unescape(m.group(1)) if m else ""
        if not title:
            h = re.search(r"<h1[^>]*>([\s\S]*?)</h1>", sec) or re.search(r"<h2[^>]*>([\s\S]*?)</h2>", sec)
            title = strip_tags(h.group(1)) if h else ""
        slides.append({"n": i + 1, "t": title or "第 %d 页" % (i + 1), "x": strip_tags(sec)[:1200]})
    return slides


def main():
    tree = api("/git/trees/main?recursive=1")
    blobs = [t["path"] for t in tree["tree"] if t["type"] == "blob"]

    dirs = sorted({p.split("/")[0] for p in blobs if "/" in p and re.match(r"^\d{2}-", p)})
    print("lectures in source:", len(dirs))

    videos = {}
    if os.path.exists(VIDEOS):
        videos = json.load(open(VIDEOS, encoding="utf8"))

    os.makedirs(DECKS, exist_ok=True)
    lectures = []
    for dirname in dirs:
        lid = dirname.split("-")[0]
        deck_path = dirname + "/slides/deck.html"
        if deck_path not in blobs:
            continue
        raw = fetch_text(deck_path)

        def repl(mo):
            full = urllib.parse.quote(dirname + "/slides/" + mo.group(2), safe="/()")
            return '%s="%s%s"' % (mo.group(1), MIRROR, full)

        deck = re.sub(r'(src|data-src|poster)="(media/[^"]+)"', repl, raw)
        deck = deck.replace("<img ", '<img loading="lazy" ')
        open(os.path.join(DECKS, lid + ".html"), "w", encoding="utf8").write(deck)

        rest = dirname[len(lid) + 1:]
        ep = ""
        m = re.match(r"第(\d+)期[-—]?", rest)
        if m:
            ep = "第 %s 期" % m.group(1)
            rest = rest[m.end():]
        title = rest.strip(" -—")

        notes = []
        for p in sorted(blobs):
            if p.startswith(dirname + "/notes/") and p.lower().endswith(".md"):
                notes.append({"name": p[len(dirname) + 7:-3], "text": fetch_text(p)[:20000]})
        readme = ""
        if dirname + "/README.md" in blobs:
            readme = fetch_text(dirname + "/README.md")[:6000]

        lectures.append({
            "id": lid,
            "ep": ep,
            "title": title,
            "dir": dirname,
            "slides": parse_deck(raw),
            "notes": notes,
            "readme": readme,
            "video": videos.get(lid),
        })
        print("  ", lid, len(lectures[-1]["slides"]), "slides,", len(notes), "notes")

    DATA_DIR = os.path.join(ROOT, "data")
    os.makedirs(DATA_DIR, exist_ok=True)

    catalog = []
    search = []
    for l in lectures:
        catalog.append({
            "id": l["id"],
            "ep": l["ep"],
            "title": l["title"],
            "dir": l["dir"],
            "slides": len(l["slides"]),
            "notes": len(l["notes"]),
            "tags": topics(l["title"]),
            "video": bool(l["video"]),
        })
        for s in l["slides"]:
            search.append({"i": l["id"], "n": s["n"], "t": s["t"], "x": s["x"]})
        with open(os.path.join(DATA_DIR, "lecture-%s.js" % l["id"]), "w", encoding="utf8") as f:
            f.write("window.LIP_LECTURE = " + json.dumps(l, ensure_ascii=False, separators=(",", ":")) + ";\n")

    with open(os.path.join(DATA_DIR, "catalog.js"), "w", encoding="utf8") as f:
        f.write("window.LIP_CATALOG = " + json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + ";\n")
    with open(os.path.join(DATA_DIR, "search.js"), "w", encoding="utf8") as f:
        f.write("window.LIP_SEARCH = " + json.dumps(search, ensure_ascii=False, separators=(",", ":")) + ";\n")

    keep_js = {"lecture-%s.js" % l["id"] for l in lectures}
    for name in os.listdir(DATA_DIR):
        if name.startswith("lecture-") and name not in keep_js:
            os.remove(os.path.join(DATA_DIR, name))
    legacy = os.path.join(ROOT, "data.js")
    if os.path.exists(legacy):
        os.remove(legacy)

    keep = {l["id"] + ".html" for l in lectures}
    for name in os.listdir(DECKS):
        if name.endswith(".html") and name not in keep:
            os.remove(os.path.join(DECKS, name))

    with open(os.path.join(ROOT, ".source-sha"), "w", encoding="utf8") as f:
        f.write(tree["sha"])
    print("done: %d lectures, %d slides" % (len(lectures), sum(len(l["slides"]) for l in lectures)))


if __name__ == "__main__":
    main()
