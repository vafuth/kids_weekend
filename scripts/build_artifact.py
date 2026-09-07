#!/usr/bin/env python3
"""index.html + assets + data 를 한 파일로 합쳐 dist/artifact.html 생성.

Claude Artifact로 게시할 때 쓰는 단일 파일 빌드입니다. Artifact는
<!doctype>/<html>/<head>/<body> 없이 본문만 받으므로 그 껍데기를 벗겨냅니다.

    python3 scripts/build_artifact.py
"""
from __future__ import annotations
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"


def main() -> None:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "assets" / "styles.css").read_text(encoding="utf-8")
    js = (ROOT / "assets" / "app.js").read_text(encoding="utf-8")
    data = json.loads((ROOT / "data" / "events.json").read_text(encoding="utf-8"))

    body = re.search(r"<body[^>]*>(.*)</body>", html, re.S).group(1)
    title = re.search(r"<title>(.*?)</title>", html, re.S).group(1)
    fonts = re.search(r'<link rel="stylesheet" href="https://fonts\.googleapis[^>]*>', html).group(0)

    body = body.replace('<script src="assets/app.js"></script>', "")

    out = "\n".join([
        f"<title>{title}</title>",
        fonts,
        "<style>", css, "</style>",
        body.strip(),
        "<script>",
        f"window.__EVENTS__ = {json.dumps(data, ensure_ascii=False)};",
        "</script>",
        "<script>", js, "</script>",
    ])

    DIST.mkdir(exist_ok=True)
    target = DIST / "artifact.html"
    target.write_text(out, encoding="utf-8")
    print(f"{target.relative_to(ROOT)} · {len(out.encode()):,} bytes · {len(data['events'])}건")


if __name__ == "__main__":
    main()
