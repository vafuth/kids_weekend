#!/usr/bin/env python3
"""data/events.json 무결성 검사.

CI와 로컬에서 같은 규칙을 씁니다. 실패하면 종료 코드 1.
    python3 scripts/validate.py
"""
from __future__ import annotations
import json, re, sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "events.json"

REQUIRED = ["id", "region", "title", "place", "cost", "rsv", "hours", "stay",
            "types", "younger", "older", "hook", "why", "tipYounger", "tipOlder",
            "link", "linkLabel"]
ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []

    db = json.loads(DATA.read_text(encoding="utf-8"))
    regions = db["regions"]
    seen: set[str] = set()

    kids = {k["key"] for k in db["meta"].get("kids", [])}
    if kids != {"younger", "older"}:
        errors.append("meta.kids는 younger/older 두 항목이어야 합니다")
    for kid in db["meta"].get("kids", []):
        by = kid.get("birthYear")
        if not isinstance(by, int) or not (1990 <= by <= date.today().year):
            errors.append(f"meta.kids[{kid.get('key')}] birthYear가 이상합니다: {by}")

    for i, ev in enumerate(db["events"]):
        tag = ev.get("id", f"#{i}")

        for key in REQUIRED:
            if not ev.get(key):
                errors.append(f"[{tag}] 필수 항목 누락: {key}")

        if ev.get("id") in seen:
            errors.append(f"[{tag}] id 중복")
        seen.add(ev.get("id"))

        if ev.get("region") not in regions:
            errors.append(f"[{tag}] 알 수 없는 지역: {ev.get('region')}")

        for k in ("younger", "older"):
            if ev.get(k) not in (1, 2, 3):
                errors.append(f"[{tag}] {k}는 1~3이어야 합니다 (현재 {ev.get(k)})")

        if not str(ev.get("link", "")).startswith("https://"):
            warnings.append(f"[{tag}] 링크가 https가 아닙니다: {ev.get('link')}")

        if ev.get("always"):
            if ev.get("start") or ev.get("end"):
                errors.append(f"[{tag}] always 항목에는 start/end를 두지 마세요")
            continue

        start, end = ev.get("start"), ev.get("end") or ev.get("start")
        if not (start and ISO.match(start)):
            errors.append(f"[{tag}] start 날짜 형식 오류: {start}")
            continue
        if not ISO.match(end):
            errors.append(f"[{tag}] end 날짜 형식 오류: {end}")
            continue
        if end < start:
            errors.append(f"[{tag}] end({end})가 start({start})보다 빠릅니다")

        recur = ev.get("recur")
        if recur:
            if not recur.get("weekdays"):
                errors.append(f"[{tag}] recur.weekdays가 비어 있습니다")
            for d in recur.get("exclude", []):
                if not ISO.match(d):
                    errors.append(f"[{tag}] recur.exclude 날짜 형식 오류: {d}")

    for w in warnings:
        print(f"경고  {w}")
    for e in errors:
        print(f"오류  {e}", file=sys.stderr)

    total = len(db["events"])
    dated = sum(1 for e in db["events"] if not e.get("always"))
    print(f"\n{total}건 검사 완료 (날짜 확정 {dated}건 / 상설 {total - dated}건)"
          f" · 데이터 갱신일 {db['meta']['updated']}")

    if db["meta"]["updated"] > date.today().isoformat():
        print("경고  meta.updated가 미래 날짜입니다")

    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
