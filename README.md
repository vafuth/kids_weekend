# 남매 나들이 달력

대전·세종·공주·부여·청주에서 **초등 남매**가 함께 즐길 만한
체험활동·행사·전시를 모아 보는 정적 웹페이지입니다.

- 아이별로 난이도·흥미도를 3단계로 따로 매깁니다 (동생 / 형)
- **아이 나이와 학년은 저장하지 않고 출생연도에서 매번 계산합니다.**
  세는 나이는 1월 1일에, 학년은 3월 1일에 저절로 올라갑니다
- 카드마다 **요약 보기**(예약·비용·소요시간·아이별 포인트·주의사항)와
  **공식 사이트** 버튼이 있습니다. 검색 결과가 아니라 주최 기관 공지나 예약 창구로 바로 갑니다
- **‘이번 주 / 이번 달 / 다음 달’ 구분은 페이지를 열 때 한국 시각 기준으로 다시 계산됩니다.**
  날짜가 지난 행사는 자동으로 목록에서 빠지고, 다음 달 행사는 달이 바뀌면 스스로 올라옵니다

## 폴더 구조

```
.
├── index.html                 # 페이지 뼈대 (마크업만)
├── assets/
│   ├── styles.css             # 모바일 우선 반응형 스타일 + 라이트/다크
│   └── app.js                 # 날짜 계산 · 필터 · 요약 모달
├── data/
│   └── events.json            # 행사 데이터 + 아이 설정 — 내용 수정은 이 파일만 고치면 됩니다
├── scripts/
│   ├── validate.py            # 데이터 무결성 검사 (CI에서도 같은 걸 씁니다)
│   ├── daily_report.py        # 종료·임박 행사 점검 리포트
│   └── build_artifact.py      # 단일 파일(dist/artifact.html) 빌드
└── .github/workflows/
    ├── pages.yml              # main 푸시 → 검사 → GitHub Pages 배포
    └── daily.yml              # 매일 09:00 KST 점검, 종료 행사 있으면 이슈 등록
```

## 로컬에서 열기

`index.html`을 파일로 직접 더블클릭하면 브라우저 보안 정책(CORS) 때문에
`data/events.json`을 못 읽습니다. 간단한 서버를 띄우세요.

```bash
python3 -m http.server 8000
```

그다음 <http://localhost:8000> 을 엽니다.

## GitHub에 올리고 배포하기

```bash
git init -b main
git add .
git commit -m "남매 나들이 달력 첫 커밋"
git remote add origin https://github.com/<사용자명>/<저장소명>.git
git push -u origin main
```

저장소 **Settings → Pages → Source**를 `GitHub Actions`로 바꾸면
푸시할 때마다 `https://<사용자명>.github.io/<저장소명>/` 으로 배포됩니다.

## 매일 오전 9시 갱신

갱신은 두 층으로 나뉩니다.

| 층 | 무엇이 갱신되나 | 누가 | 사람 손이 필요한가 |
|---|---|---|---|
| 1. 날짜 롤오버 | 이번 주·이번 달 구분, D-day, 종료 행사 숨김 | 브라우저 (`assets/app.js`) | 없음. 페이지를 열 때마다 자동 |
| 2. 점검 리포트 | 종료·임박 행사 목록, 오래된 데이터 경고 | GitHub Actions `daily.yml` (매일 09:00 KST) | 없음. 정리할 게 있으면 이슈가 생김 |
| 3. 행사 내용 조사 | 새로 뜬 행사 추가, 끝난 행사 삭제 | Claude 스케줄 작업 (매일 09:01) | 없음. 커밋·푸시까지 자동 |

3층은 Claude Code의 예약 작업(`kids-outing-daily-refresh`)이 맡습니다.
각 기관 공지를 다시 조사해 `data/events.json`을 고치고, 검사 → 커밋 → **푸시**까지
자동으로 합니다. 푸시가 들어가면 `pages.yml`이 이어받아 사이트를 다시 배포합니다.

예약 작업은 Claude 앱이 켜져 있을 때 돌고, 꺼져 있었다면 다음 실행 때 밀려서 돕니다.
바뀐 내용이 없는 날에는 아무 커밋도 만들지 않습니다.

### 행사 하나 추가하기

`data/events.json`의 `events` 배열에 넣습니다.

```jsonc
{
  "id": "고유-영문-id",
  "region": "대전",              // 대전 | 세종 | 공주·부여 | 청주
  "start": "2026-10-03",         // 상설 기관이면 start/end 대신 "always": true
  "end":   "2026-10-11",
  "recur": {                     // 선택 — 반복 행사만
    "weekdays": [5, 6],          // 0=일 … 6=토
    "exclude": ["2026-09-25"],
    "label": "매주 금·토"
  },
  "title": "행사 이름",
  "place": "장소",
  "cost":  "무료",
  "rsv":   "예약 필수",           // '필수'가 들어가면 카드에 강조 배지가 붙습니다
  "hours": "10:00 – 17:00",
  "stay":  "2~3시간",
  "types": ["과학", "만들기"],    // 과학 | 역사 | 축제 | 전시 | 만들기 | 자연
  "younger": 3, "older": 2,      // 동생·형 적합도 1~3
  "hook":  "카드에 보이는 한 줄",
  "why":   "왜 이 남매에게 맞는지",
  "tipYounger": "동생에게 어떻게 접근할지",
  "tipOlder":   "형에게 어떻게 접근할지",
  "tips":  ["가기 전 팁"],
  "caution": "주의할 점",
  "link": "https://공식사이트",
  "linkLabel": "버튼에 쓸 문구"
}
```

넣은 뒤 검사합니다.

```bash
python3 scripts/validate.py
```

`meta.updated`를 오늘 날짜로 바꾸는 것도 잊지 마세요. 푸터에 표시됩니다.

## 아이 나이 설정

`data/events.json`의 `meta.kids`에 **출생연도만** 둡니다. 나이와 학년은
페이지를 열 때 계산되므로 해가 바뀌어도 손댈 필요가 없습니다.

```jsonc
"kids": [
  { "key": "younger", "role": "동생", "birthYear": 2019 },
  { "key": "older",   "role": "형",   "birthYear": 2016 }
]
```

- **나이** = 현재연도 − 출생연도 + 1 (세는 나이) → **매년 1월 1일에 한 살**
- **학년** = 현재학년도 − (출생연도 + 7) + 1 → **매년 3월 1일에 한 학년**
  (학년도는 3월에 시작하므로 1~2월은 아직 지난 학년으로 봅니다)
- 초등학교를 넘어가면 `중1`·`고1`로 알아서 바뀝니다

출생연도가 다르면 이 두 줄만 고치세요. `role`은 화면에 그대로 표시되는 호칭입니다.

| 시점 | 동생 | 형 |
|---|---|---|
| 2026.09 (지금) | 8살 초1 | 11살 초4 |
| 2027.01.01 | **9살** 초1 | **12살** 초4 |
| 2027.03.01 | 9살 **초2** | 12살 **초5** |
| 2031.03.01 | 13살 초6 | 16살 **중3** |

## Claude Artifact로 게시하기

```bash
python3 scripts/build_artifact.py
```

`dist/artifact.html` 한 파일에 CSS·JS·데이터가 모두 들어갑니다.
이 파일을 Artifact로 올리면 GitHub Pages 없이도 링크를 공유할 수 있습니다.

## 데이터 출처

날짜가 확정된 항목은 아래 공식 공지에서 확인한 것입니다.

- [대전광역시 행사안내](https://www.daejeon.go.kr/fvu/index.do)
- [공주시 행사정보](https://www.gongju.go.kr/prog/culturalEvent/kr/sub04_05/list.do)
- [국립중앙과학관 행사안내](https://www.science.go.kr/mps/1070/bbs/431/moveBbsNttList.do)
- [백제문화제 공식](https://www.baekjeculturalfestival.kr/)
- [세종한글축제](https://sjfestival.kr/)

`always: true` 항목은 상설 운영 기관입니다. 휴관일과 명절 운영 여부는
각 기관 사이트에서 확인해야 합니다.
