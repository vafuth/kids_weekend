/* ============================================================
   남매 나들이 달력 — app
   Every bucket ("이번 주" / "이번 달" …) is derived from the
   current date in Asia/Seoul at page load, so the page rolls
   over on its own each day without a rebuild.
   ============================================================ */

const DATA_URL = 'data/events.json';
const WD = ['일', '월', '화', '수', '목', '금', '토'];

/* ── date helpers (Asia/Seoul, date-only, ISO strings) ── */
function seoulNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const get = t => parts.find(p => p.type === t).value;
  return new Date(Date.UTC(+get('year'), +get('month') - 1, +get('day')));
}
const ymd = d => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const parseYmd = s => new Date(s + 'T00:00:00Z');
const dayDiff = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 86400000);
function fmt(iso) { const d = parseYmd(iso); return `${d.getUTCMonth() + 1}.${d.getUTCDate()} ${WD[d.getUTCDay()]}`; }
function fmtLong(d) { return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')} (${WD[d.getUTCDay()]})`; }

/* 세는 나이는 1월 1일에, 학년은 3월 1일에 올라간다.
   두 기준이 다르므로 따로 계산한다. */
function describeKid(kid, c) {
  const age = c.year - kid.birthYear + 1;              // 세는 나이
  const grade = c.schoolYear - (kid.birthYear + 7) + 1; // 입학 학년도 = 출생연도 + 7
  let level;
  if (grade < 1) level = '미취학';
  else if (grade <= 6) level = `초${grade}`;
  else if (grade <= 9) level = `중${grade - 6}`;
  else if (grade <= 12) level = `고${grade - 9}`;
  else level = '졸업';
  return { ...kid, age, grade, level, label: `${age}살`, full: `${age}살 · ${level}` };
}

function buildCtx() {
  const today = seoulNow();
  const dow = today.getUTCDay();                 // 0 Sun … 6 Sat
  const monday = addDays(today, dow === 0 ? -6 : 1 - dow);
  const sunday = addDays(monday, 6);
  const monthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
  const nextEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 2, 0));
  return {
    todayDate: today,
    today: ymd(today), weekStart: ymd(monday), weekEnd: ymd(sunday),
    monthEnd: ymd(monthEnd), nextEnd: ymd(nextEnd),
    year: today.getUTCFullYear(),
    // 학년도는 3월에 시작한다. 1~2월은 아직 지난 학년도.
    schoolYear: today.getUTCFullYear() - (today.getUTCMonth() + 1 < 3 ? 1 : 0),
    thisMonth: today.getUTCMonth() + 1,
    nextMonth: (today.getUTCMonth() + 1) % 12 + 1
  };
}

/* ── bucketing ─────────────────────────────────────────── */
function bucketOf(ev, c) {
  if (ev.always) return 'always';
  const end = ev.end || ev.start;
  if (end < c.today) return 'past';
  if (ev.start <= c.weekEnd) return 'week';      // starts this week, or already running
  if (ev.start <= c.monthEnd) return 'month';
  if (ev.start <= c.nextEnd) return 'next';
  return 'later';
}

/* Next dates a recurring event actually opens, from today on. */
function nextOccurrences(ev, c, limit) {
  if (!ev.recur) return [];
  const out = [];
  const stop = ev.end || ev.start;
  let d = parseYmd(c.today > ev.start ? c.today : ev.start);
  while (ymd(d) <= stop && out.length < limit) {
    const s = ymd(d);
    if (ev.recur.weekdays.includes(d.getUTCDay()) && !(ev.recur.exclude || []).includes(s)) out.push(s);
    d = addDays(d, 1);
  }
  return out;
}

function whenLabel(ev, c) {
  if (ev.always) return ev.kind === 'channel' ? '상시 · 예약/공지 창구' : '상설 운영';
  const end = ev.end || ev.start;
  if (ev.recur) {
    const nx = nextOccurrences(ev, c, 2);
    if (nx.length) return `${ev.recur.label} · 다음 ${nx.map(fmt).join(' · ')}`;
    return `${ev.recur.label} · ${fmt(ev.start)} – ${fmt(end)}`;
  }
  if (end === ev.start) return fmt(ev.start);
  return `${fmt(ev.start)} – ${fmt(end)}`;
}

function ddayOf(ev, c) {
  if (ev.always) return { cls: '', text: '상시' };
  const end = ev.end || ev.start;
  if (end < c.today) return { cls: 'past', text: '종료' };
  if (ev.start <= c.today) {
    const left = dayDiff(c.today, end);
    if (ev.recur) {
      const nx = nextOccurrences(ev, c, 1);
      return nx.length
        ? { cls: nx[0] === c.today ? 'live' : 'soon', text: nx[0] === c.today ? '오늘 열림' : `다음 D-${dayDiff(c.today, nx[0])}` }
        : { cls: '', text: '회차 종료' };
    }
    return { cls: 'live', text: left === 0 ? '오늘 마지막' : `진행 중 · ${left}일 남음` };
  }
  const d = dayDiff(c.today, ev.start);
  return { cls: d <= 7 ? 'soon' : '', text: `D-${d}` };
}

/* ── render ────────────────────────────────────────────── */
const state = { region: 'all', type: 'all', age: 'all', q: '', showPast: false };
let DB = null, CTX = null, KIDS = [];

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const bars = n => '<span class="bars">' + [1, 2, 3].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('') + '</span>';

function bandsFor(c) {
  return [
    { key: 'week', title: '이번 주', range: `${fmt(c.weekStart)} – ${fmt(c.weekEnd)}`,
      note: '오늘부터 이번 주 일요일까지 실제로 문이 열려 있는 것들입니다. 하루만 쓸 수 있다면 여기서 고르세요.' },
    { key: 'month', title: `${c.thisMonth}월 안에`, range: `${fmt(c.weekEnd)} 이후 – 이달 말`,
      note: '날짜가 확정된 이달 남은 일정입니다. 예약이 필요한 것부터 먼저 잡으세요.' },
    { key: 'next', title: `${c.nextMonth}월 큰 행사`, range: '다음 달',
      note: '지금 계획을 잡아둬야 하는 다음 달 일정입니다. 체험 프로그램은 사전예약분이 먼저 마감됩니다.' },
    { key: 'later', title: '그 이후', range: '두 달 뒤부터',
      note: '멀리 잡아둘 일정입니다.' },
    { key: 'always', title: '언제든 가능', range: '상설 운영',
      note: '날짜가 안 맞거나 비가 올 때의 목록입니다. 무료이면서 남매가 함께 즐길 수 있는 곳을 앞쪽에 두었습니다.' }
  ];
}

function match(ev) {
  if (state.region !== 'all' && ev.region !== state.region) return false;
  if (state.type !== 'all' && !ev.types.includes(state.type)) return false;
  if (state.age === 'both' && !(ev.younger === 3 && ev.older === 3)) return false;
  if (state.age === 'younger' && !(ev.younger >= 3 && ev.younger > ev.older)) return false;
  if (state.age === 'older' && !(ev.older >= 3 && ev.older > ev.younger)) return false;
  if (state.q) {
    const hay = [ev.title, ev.place, ev.hook, ev.region, ev.types.join(' ')].join(' ').toLowerCase();
    if (!hay.includes(state.q)) return false;
  }
  return true;
}

function cardHTML(ev) {
  const rc = `var(${DB.regions[ev.region]})`;
  const dd = ddayOf(ev, CTX);
  const rsvCls = ev.rsv.includes('필수') ? 'tag rsv' : ev.rsv.includes('확인') ? 'tag warn' : 'tag';
  return `<article class="card ${ev.always ? '' : 'dated'} ${dd.cls === 'past' ? 'past' : ''}" style="--rc:${rc}" id="card-${ev.id}">
    <div class="chead"><span class="when">${esc(whenLabel(ev, CTX))}</span><span class="region">${esc(ev.region)}</span></div>
    <span class="dday ${dd.cls === 'past' ? '' : dd.cls}">${esc(dd.text)}</span>
    <h3>${esc(ev.title)}</h3>
    <p class="hook">${esc(ev.hook)}</p>
    <div class="meta">
      <div><span class="k">장소</span><span>${esc(ev.place)}</span></div>
      <div><span class="k">비용</span><span>${esc(ev.cost)}</span></div>
    </div>
    <div class="fits">
      ${KIDS.map(k => `<span class="fit"><span class="who">${esc(k.label)}</span>${bars(ev[k.key])}</span>`).join('')}
    </div>
    <div class="tags">${ev.types.map(t => `<span class="tag">${esc(t)}</span>`).join('')}<span class="${rsvCls}">${esc(ev.rsv)}</span></div>
    <div class="acts">
      <button class="btn" type="button" data-open="${esc(ev.id)}">요약 보기</button>
      <a class="btn solid" href="${esc(ev.link)}" target="_blank" rel="noopener noreferrer">공식 사이트 ↗</a>
    </div>
  </article>`;
}

function render() {
  const host = document.getElementById('bands');
  const buckets = {};
  DB.events.forEach(ev => { (buckets[bucketOf(ev, CTX)] ||= []).push(ev); });

  let shown = 0, html = '';
  bandsFor(CTX).forEach(b => {
    const items = (buckets[b.key] || []).filter(match);
    shown += items.length;
    if (!items.length) return;
    html += `<section class="band">
      <div class="bandhead"><h2>${esc(b.title)}</h2><span class="range">${esc(b.range)}</span></div>
      <p class="bandnote">${esc(b.note)}</p>
      <div class="grid">${items.map(cardHTML).join('')}</div>
    </section>`;
  });

  const past = (buckets.past || []).filter(match);
  if (past.length) {
    html += `<div class="pastline"><span>이미 끝난 행사 ${past.length}건이 목록에서 빠져 있습니다.</span>
      <button type="button" id="togglePast">${state.showPast ? '숨기기' : '보기'}</button></div>`;
    if (state.showPast) html += `<div class="grid" style="margin-top:14px">${past.map(cardHTML).join('')}</div>`;
  }
  if (!shown && !past.length) html += '<div class="empty">조건에 맞는 곳이 없습니다. 필터를 하나 풀어보세요.</div>';

  host.innerHTML = html;
  document.getElementById('count').textContent = `${shown} / ${DB.events.length}곳`;

  ['week', 'month', 'next', 'always'].forEach(k => {
    const el = document.getElementById('t-' + k);
    if (el) el.textContent = (buckets[k] || []).length;
  });
  document.getElementById('lbl-month').textContent = `${CTX.thisMonth}월 안에`;
  document.getElementById('lbl-next').textContent = `${CTX.nextMonth}월 큰 행사`;
  const short = iso => { const d = parseYmd(iso); return `${d.getUTCMonth() + 1}.${d.getUTCDate()}`; };
  document.getElementById('lbl-week').textContent = `이번 주 ${short(CTX.weekStart)}–${short(CTX.weekEnd)}`;
}

/* ── highlights: derived, so they never go stale ───────── */
function renderPicks() {
  const upcoming = DB.events
    .filter(ev => !ev.always && ['week', 'month', 'next'].includes(bucketOf(ev, CTX)))
    .filter(ev => ev.younger + ev.older >= 5)
    .sort((a, b) => (a.start === b.start ? (b.younger + b.older) - (a.younger + a.older) : a.start < b.start ? -1 : 1))
    .slice(0, 4);
  const list = upcoming.length ? upcoming : DB.events.filter(e => e.always).slice(0, 4);
  document.getElementById('picks').innerHTML = list.map(ev => `<li>
      <span class="d">${esc(ev.always ? '상시' : whenLabel(ev, CTX).split(' · ')[0])}</span>
      <span class="t"><button class="linkish" type="button" data-open="${esc(ev.id)}">${esc(ev.title)}</button>
      <span class="why">${esc(ev.hook)}</span></span>
    </li>`).join('');
}

/* ── modal ─────────────────────────────────────────────── */
const scrim = document.getElementById('scrim');
const sheet = document.getElementById('sheet');
let lastFocus = null;

function openSheet(id) {
  const ev = DB.events.find(x => x.id === id);
  if (!ev) return;
  lastFocus = document.activeElement;
  const rc = `var(${DB.regions[ev.region]})`;
  const dd = ddayOf(ev, CTX);
  const occ = ev.recur ? nextOccurrences(ev, CTX, 6) : [];
  sheet.innerHTML = `
    <div class="sheet-top" style="--rc:${rc}">
      <button class="close" type="button" aria-label="닫기" data-close>&times;</button>
      <div class="when" style="color:${rc}">${esc(whenLabel(ev, CTX))} · ${esc(ev.region)}</div>
      <h2 id="sheet-title">${esc(ev.title)}</h2>
      <p>${esc(ev.hook)}</p>
    </div>
    <div class="sheet-body">
      <dl class="facts">
        <div><dt>상태</dt><dd>${esc(dd.text)}</dd></div>
        <div><dt>비용</dt><dd>${esc(ev.cost)}</dd></div>
        <div><dt>예약</dt><dd>${esc(ev.rsv)}</dd></div>
        <div><dt>운영</dt><dd>${esc(ev.hours)}</dd></div>
        <div><dt>머무는 시간</dt><dd>${esc(ev.stay)}</dd></div>
        <div><dt>장소</dt><dd>${esc(ev.place)}</dd></div>
      </dl>
      ${occ.length ? `<div class="blk"><h4>남은 회차</h4><p>${occ.map(fmt).join(' · ')}${occ.length === 6 ? ' …' : ''}</p></div>` : ''}
      <div class="blk"><h4>왜 이 남매에게 맞나</h4><p>${esc(ev.why)}</p></div>
      <div class="blk"><h4>아이별 포인트</h4>
        ${KIDS.map(k => `<div class="kid"><span class="badge">${esc(k.full)}</span><p>${esc(ev[k.tipKey])}</p></div>`).join('')}
      </div>
      ${ev.tips && ev.tips.length ? `<div class="blk"><h4>가기 전에</h4><ul class="tiplist">${ev.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
      ${ev.caution ? `<div class="blk"><div class="caution"><strong>확인할 것 · </strong>${esc(ev.caution)}</div></div>` : ''}
    </div>
    <div class="sheet-foot">
      <a class="btn solid" href="${esc(ev.link)}" target="_blank" rel="noopener noreferrer">${esc(ev.linkLabel)} ↗</a>
      <button class="btn" type="button" data-close>닫기</button>
      <span class="src">${esc(ev.link)}</span>
    </div>`;
  scrim.hidden = false;
  document.body.style.overflow = 'hidden';
  sheet.querySelector('.close').focus();
}
function closeSheet() {
  scrim.hidden = true;
  document.body.style.overflow = '';
  if (lastFocus) lastFocus.focus();
}

/* ── wiring ────────────────────────────────────────────── */
document.addEventListener('click', e => {
  const open = e.target.closest('[data-open]');
  if (open) { openSheet(open.dataset.open); return; }
  if (e.target.closest('[data-close]') || e.target === scrim) { closeSheet(); return; }
  if (e.target.id === 'togglePast') { state.showPast = !state.showPast; render(); return; }
  const chip = e.target.closest('.chip');
  if (chip) {
    const f = chip.dataset.f;
    document.querySelectorAll(`.chip[data-f="${f}"]`).forEach(o => o.setAttribute('aria-pressed', 'false'));
    chip.setAttribute('aria-pressed', 'true');
    state[f] = chip.dataset.v;
    render();
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !scrim.hidden) closeSheet(); });
document.getElementById('q').addEventListener('input', e => { state.q = e.target.value.trim().toLowerCase(); render(); });

/* ── boot ──────────────────────────────────────────────── */
(async function boot() {
  CTX = buildCtx();
  document.getElementById('today').textContent = fmtLong(CTX.todayDate);
  if (window.__EVENTS__) {
    DB = window.__EVENTS__;                                     // single-file build
  } else {
    try {
      const res = await fetch(DATA_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      DB = await res.json();
    } catch (err) {
      document.getElementById('bands').innerHTML =
        '<div class="empty">행사 데이터를 불러오지 못했습니다. data/events.json 파일이 같은 폴더에 있는지 확인해 주세요.<br>' +
        '(로컬에서 file:// 로 열면 브라우저 보안 정책 때문에 막힙니다 — README의 로컬 실행 방법을 참고하세요.)</div>';
      return;
    }
  }
  // 나이·학년은 저장하지 않고 출생연도에서 매번 계산한다.
  // 1월 1일이 지나면 나이가, 3월 1일이 지나면 학년이 저절로 올라간다.
  KIDS = DB.meta.kids.map(k => ({
    ...describeKid(k, CTX),
    tipKey: k.key === 'younger' ? 'tipYounger' : 'tipOlder'
  }));
  renderKidCopy();

  const chips = document.getElementById('region-chips');
  chips.insertAdjacentHTML('beforeend', Object.keys(DB.regions).map(r =>
    `<button class="chip" data-f="region" data-v="${esc(r)}" aria-pressed="false"><span class="dot" style="background:var(${DB.regions[r]})"></span>${esc(r)}</button>`
  ).join(''));
  document.getElementById('updated').textContent = DB.meta.updated.replace(/-/g, '.');
  renderPicks();
  render();
})();

/* 아이 나이가 나오는 자리는 전부 여기서 한 번에 채운다. */
function renderKidCopy() {
  const older = KIDS.find(k => k.key === 'older');
  const younger = KIDS.find(k => k.key === 'younger');

  document.getElementById('kid-intro').innerHTML =
    `${esc(older.level)} ${esc(older.role)}(${esc(older.label)})과 ` +
    `${esc(younger.level)} ${esc(younger.role)}(${esc(younger.label)})이 <em>같이</em> ` +
    `재미있어할 만한 것만 골랐습니다.`;

  document.getElementById('q').insertAdjacentHTML('beforebegin',
    KIDS.map(k => `<button class="chip" data-f="age" data-v="${esc(k.key)}" aria-pressed="false">${esc(k.label)} 위주</button>`).join(''));
}
