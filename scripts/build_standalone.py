#!/usr/bin/env python3
"""index.html + assets + data 를 한 파일로 합쳐 루트에 standalone.html 생성.

서버 없이 더블클릭으로 열리는 완전한 단일 HTML 문서입니다.
fetch 대신 데이터를 <script> 안에 그대로 심어두므로 file://로 열어도,
어떤 임포트형 미리보기 도구(Gemini Build, Antigravity 등)에 올려도 동작합니다.

dist/artifact.html(Claude Artifact용 — <html> 껍데기 없이 본문만)과는
용도가 다릅니다. 이건 <!doctype>부터 갖춘 완전한 문서입니다.

    python3 scripts/build_standalone.py
"""
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "assets" / "styles.css").read_text(encoding="utf-8")
    js = (ROOT / "assets" / "app.js").read_text(encoding="utf-8")
    data = json.loads((ROOT / "data" / "events.json").read_text(encoding="utf-8"))

    out = html
    out = out.replace(
        '<link rel="stylesheet" href="assets/styles.css">',
        f"<style>\n{css}\n</style>",
    )
    out = out.replace(
        '<script src="assets/app.js"></script>',
        "<script>\n"
        f"window.__EVENTS__ = {json.dumps(data, ensure_ascii=False)};\n"
        "</script>\n"
        f"<script>\n{js}\n</script>",
    )

    target = ROOT / "standalone.html"
    target.write_text(out, encoding="utf-8")
    print(f"{target.relative_to(ROOT)} · {len(out.encode()):,} bytes · {len(data['events'])}건")


if __name__ == "__main__":
    main()
