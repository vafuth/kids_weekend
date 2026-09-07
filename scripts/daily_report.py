#!/usr/bin/env python3
"""매일 오전 9시(KST) 점검 리포트.

- 이미 끝난 행사 → 정리 대상
- 7일 안에 시작하는 행사 → 예약 마감 임박
- 30일 넘게 갱신되지 않은 데이터 → 재조사 필요

GitHub Actions에서는 결과가 잡 요약(Job Summary)에 붙습니다.
    python3 scripts/daily_report.py
"""
from __future__ import annotations
import json, os, sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "events.json"
KST = timezone(timedelta(hours=9))


def main() -> int:
    today = datetime.now(KST).date()
    db = json.loads(DATA.read_text(encoding="utf-8"))
    events = db["events"]

    expired, soon, running = [], [], []
    for ev in events:
        if ev.get("always"):
            continue
        start = date.fromisoformat(ev["start"])
        end = date.fromisoformat(ev.get("end") or ev["start"])
        if end < today:
            expired.append((ev, end))
        elif start <= today:
            running.append((ev, end))
        elif (start - today).days <= 7:
            soon.append((ev, start))

    updated = date.fromisoformat(db["meta"]["updated"])
    stale_days = (today - updated).days

    lines = [f"# 나들이 달력 점검 · {today:%Y-%m-%d} (KST)", ""]
    lines.append(f"- 전체 {len(events)}건 · 데이터 갱신 {updated} ({stale_days}일 전)")
    lines.append(f"- 진행 중 {len(running)}건 · 임박 {len(soon)}건 · 종료 {len(expired)}건")
    lines.append("")

    if soon:
        lines += ["## 7일 안에 시작 — 예약 확인", ""]
        lines += [f"- **{ev['title']}** · {d} · {ev['rsv']} · {ev['link']}" for ev, d in sorted(soon, key=lambda x: x[1])]
        lines.append("")
    if running:
        lines += ["## 진행 중", ""]
        lines += [f"- **{ev['title']}** · {d}까지" for ev, d in sorted(running, key=lambda x: x[1])]
        lines.append("")
    if expired:
        lines += ["## 종료 — data/events.json에서 정리 대상", ""]
        lines += [f"- **{ev['title']}** · {d} 종료 · `id: {ev['id']}`" for ev, d in sorted(expired, key=lambda x: x[1])]
        lines.append("")
    if stale_days > 30:
        lines += [f"> 데이터가 {stale_days}일째 그대로입니다. 새 행사를 조사해 `data/events.json`을 갱신하세요.", ""]

    report = "\n".join(lines)
    print(report)

    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        Path(summary).write_text(report, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
