// 30-DAY – Speaking Studio. One screen: navigator + 7 steps (Zone A), topic and pattern cards (Zone B),
// beep timer + voice studio (Zone C), missing words + correction & diary (Zone D), mock interview on Day 30.
(function () {
  'use strict';
  const TD = window.TD, AK = window.AudioKit;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = sec => { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };
  const fmtDur = sec => sec % 60 === 0 ? (sec / 60) + ' min' : sec < 60 ? sec + ' s' : fmt(sec);

  // ---------- Storage keys (never rename) ----------
  const LS = 'thirtyday_v1', UIK = 'thirtyday_ui', KEY = 'thirtyday_sync_key', NOISE = 'thirtyday_noise';
  const blankDay = () => ({ variations: ['', '', ''], words: [], diary: { time: '', unsure: ['', '', ''], learned: '', words: '', repeat: '' }, done: false, doneAt: null, updatedAt: 0 });
  const defSettings = () => ({ lock60: false, ticks: true, autoRec: true, autoTr: true, durs: { 1: 60, 2: 90, 3: 120, 4: 180 }, updatedAt: 0 });
  function load() {
    let s = null; try { s = JSON.parse(localStorage.getItem(LS)); } catch { /* fresh */ }
    s = s && typeof s === 'object' ? s : {};
    s.days = s.days || {}; s.settings = Object.assign(defSettings(), s.settings || {});
    s.settings.durs = Object.assign(defSettings().durs, s.settings.durs || {});
    return s;
  }
  let S = load();
  let UI = (() => { try { return Object.assign({ day: 0, step: 1, week: 'all', retryOf: 'r1', mockOrder: null, mockIdx: 0 }, JSON.parse(localStorage.getItem(UIK)) || {}); } catch { return { day: 0, step: 1, week: 'all', retryOf: 'r1', mockOrder: null, mockIdx: 0 }; } })();
  const saveUI = () => { try { localStorage.setItem(UIK, JSON.stringify(UI)); } catch { /* full */ } };
  const dayRec = d => { const k = String(d); if (!S.days[k]) S.days[k] = blankDay(); const x = S.days[k]; x.diary = Object.assign(blankDay().diary, x.diary || {}); if (!Array.isArray(x.diary.unsure)) x.diary.unsure = ['', '', '']; if (!Array.isArray(x.variations)) x.variations = ['', '', '']; if (!Array.isArray(x.words)) x.words = []; return x; };
  function save() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch { toast('Browser storage is full'); } schedulePush(); }
  const touchDay = d => { dayRec(d).updatedAt = Date.now(); save(); };
  const touchSettings = () => { S.settings.updatedAt = Date.now(); save(); };
  if (!UI.day) { const open = TD.DAYS.find(x => !(S.days[x.d] && S.days[x.d].done)); UI.day = open ? open.d : 30; }
  const DAY = () => TD.DAYS[UI.day - 1];
  const STEP = () => TD.STEPS[UI.step - 1];

  // ---------- Toast ----------
  let toastT = null;
  function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }

  // ---------- Server: health, sync, Gemini ----------
  let server = null; // {syncKey, blob, gemini} from /api/health, null when there is no API (opened locally)
  const syncKey = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
  const aiReady = () => !!(server && server.gemini && server.syncKey && syncKey());
  async function api(path, { method = 'GET', body, raw = false } = {}) {
    const r = await fetch(path, { method, headers: { 'content-type': 'application/json', 'x-sync-key': syncKey() }, body: body ? JSON.stringify(body) : undefined });
    if (raw) return r;
    let j = null; try { j = await r.json(); } catch { /* empty */ }
    if (!r.ok) { const e = new Error((j && (j.detail || j.error)) || ('HTTP ' + r.status)); e.status = r.status; e.retryAfter = j && j.retryAfter; throw e; }
    return j;
  }
  function mergeDocs(a, b) {
    const out = { days: {}, settings: {} };
    const da = (a && a.days) || {}, db = (b && b.days) || {};
    for (const k of new Set([...Object.keys(da), ...Object.keys(db)])) { const x = da[k], y = db[k]; out.days[k] = !x ? y : !y ? x : ((y.updatedAt || 0) > (x.updatedAt || 0) ? y : x); }
    const sa = (a && a.settings) || {}, sb = (b && b.settings) || {};
    out.settings = (sb.updatedAt || 0) > (sa.updatedAt || 0) ? sb : sa;
    return out;
  }
  let syncState = 'local', pushT = null, pushing = false;
  const syncOn = () => !!(server && server.syncKey && server.blob && syncKey());
  function applyRemote(doc) {
    const m = mergeDocs(S, doc);
    S.days = m.days; S.settings = Object.assign(defSettings(), m.settings || {}); S.settings.durs = Object.assign(defSettings().durs, S.settings.durs || {});
    try { localStorage.setItem(LS, JSON.stringify(S)); } catch { /* full */ }
  }
  async function pull() {
    if (!syncOn()) return renderSync();
    syncState = 'busy'; renderSync();
    try { applyRemote(await api('/api/progress')); await push(true); renderAll(); }
    catch (e) { syncState = e.status === 401 ? 'badkey' : 'error'; renderSync(); }
  }
  function schedulePush() { if (!syncOn()) return; clearTimeout(pushT); pushT = setTimeout(() => push(), 1500); }
  async function push(silent) {
    if (!syncOn() || pushing) return;
    pushing = true; syncState = 'busy'; renderSync();
    try { const doc = await api('/api/progress', { method: 'PUT', body: { days: S.days, settings: S.settings } }); applyRemote(doc); syncState = 'ok'; if (!silent) renderNav(); }
    catch (e) { syncState = e.status === 401 ? 'badkey' : 'error'; }
    pushing = false; renderSync();
  }
  function renderSync() {
    const b = $('#syncBtn');
    let label, title, cls;
    if (!server) { label = 'Local only'; title = 'No server here: progress is saved in this browser only.'; cls = 'off'; }
    else if (!server.syncKey) { label = 'Sync off'; title = 'Set SYNC_KEY in the Vercel project to switch sync on.'; cls = 'off'; }
    else if (!syncKey()) { label = 'Connect sync'; title = 'Enter your sync password once on this device.'; cls = 'warn'; }
    else if (!server.blob) { label = 'No storage'; title = 'Connect a Blob store to the Vercel project.'; cls = 'warn'; }
    else if (syncState === 'busy') { label = 'Syncing…'; title = ''; cls = 'busy'; }
    else if (syncState === 'badkey') { label = 'Wrong password'; title = 'Click to enter the sync password again.'; cls = 'err'; }
    else if (syncState === 'error') { label = 'Sync error'; title = 'Click to try again.'; cls = 'err'; }
    else { label = 'Synced'; title = 'Diary, variations, missing words and days are synced. Recordings stay on this device.'; cls = 'ok'; }
    b.textContent = label; b.title = title; b.className = 'sync ' + cls;
    const sb = $('#srvBadge');
    if (server && !server.gemini) { sb.hidden = false; sb.textContent = 'No Gemini key'; sb.title = 'Set GEMINI_API_KEY in Vercel for transcripts, pattern checks and the German voice.'; } else sb.hidden = true;
  }
  $('#syncBtn').addEventListener('click', () => {
    if (!server || !server.syncKey) return toast($('#syncBtn').title);
    if (!syncKey() || syncState === 'badkey') return askKey();
    pull();
  });
  function askKey() {
    const k = prompt('Sync password (the SYNC_KEY you set in Vercel):', '');
    if (k == null) return;
    try { localStorage.setItem(KEY, k.trim()); } catch { /* full */ }
    syncState = 'local'; pull(); renderAll();
  }

  // ---------- Takes (IndexedDB) ----------
  let takes = [];               // takes of the current day
  const trBusy = {};            // take id → progress text
  async function loadTakes() { try { takes = (await AK.store.byDay(UI.day)).sort((a, b) => a.createdAt - b.createdAt); } catch { takes = []; } }
  const checksOfDay = () => { const c = {}; for (const t of takes) for (const [k, v] of Object.entries(t.checks || {})) if (v.used) (c[k] = c[k] || []).push(v); return c; };

  // ---------- Zone A: navigator ----------
  function renderNav() {
    const done = TD.DAYS.filter(d => S.days[d.d] && S.days[d.d].done).length;
    $('#progLabel').textContent = `${done} / 30 days`; $('#progPct').textContent = Math.round(done / 30 * 100) + '%';
    $('#progBar').style.width = (done / 30 * 100) + '%';
    $('#weekTabs').innerHTML = ['all', 1, 2, 3, 4].map(w => `<button type="button" role="tab" aria-selected="${UI.week == w}" data-week="${w}">${w === 'all' ? 'All' : 'W' + w}</button>`).join('');
    $('#dayGrid').innerHTML = TD.DAYS.filter(d => UI.week === 'all' || d.w == UI.week).map(d => {
      const r = S.days[d.d] || {}; const cur = d.d === UI.day;
      return `<button type="button" class="day${cur ? ' cur' : ''}${r.done ? ' done' : ''} k-${d.kind}" data-day="${d.d}" aria-label="Day ${d.d}${r.done ? ', done' : ''}" title="${esc(d.topic)}">${r.done ? '✓' : d.d}</button>`;
    }).join('');
    const w = DAY().w, W = TD.WEEKS[w];
    $('#weekBox').innerHTML = `<b>Week ${w}</b> · days ${W.days} · <b>${W.range}</b> per round<p>${esc(TD.WEEK_INTRO[w])}</p><p class="muted">Move up to this time when: ${esc(W.up)}. If a step up feels too hard, stay at the shorter time for a few more days. The warm-up always stays at 60 s.</p>`;
    const st = stepStatus();
    $('#steps').innerHTML = TD.STEPS.map(s => `<li><button type="button" class="step${UI.step === s.n ? ' cur' : ''}${st[s.n] ? ' ok' : ''}" data-step="${s.n}"><span class="n">${st[s.n] ? '✓' : s.n}</span><span class="t"><b>${esc(s.title)}</b><small>${esc(stepTime(s))}</small></span></button></li>`).join('');
    $('#stepBar').innerHTML = TD.STEPS.map(s => `<button type="button" class="chip${UI.step === s.n ? ' cur' : ''}${st[s.n] ? ' ok' : ''}" data-step="${s.n}">${st[s.n] ? '✓' : s.n} ${esc(s.title.split(' · ')[0])}</button>`).join('');
  }
  function stepStatus() {
    const r = dayRec(UI.day), has = k => takes.some(t => t.round === k);
    const dr = r.diary;
    return { 1: has('warmup'), 2: r.variations.filter(v => v.trim()).length >= 3, 3: has('r1'), 4: has('r2'), 5: has('r3'), 6: has('retry'), 7: !!(dr.learned.trim() && dr.repeat.trim()) };
  }
  const stepTime = s => s.dur === 'warmup' ? '60 s · locked' : s.dur === 'round' ? fmtDur(roundDur()) + (s.key === 'retry' ? ' · 1× repeat' : '') : fmtDur(s.dur);
  const roundDur = () => S.settings.lock60 ? 60 : (S.settings.durs[DAY().w] || TD.WEEKS[DAY().w].def);
  const durFor = s => s.dur === 'warmup' ? 60 : s.dur === 'round' ? roundDur() : s.dur;

  document.addEventListener('click', e => {
    const w = e.target.closest('[data-week]'); if (w) { UI.week = w.dataset.week === 'all' ? 'all' : Number(w.dataset.week); saveUI(); renderNav(); return; }
    const d = e.target.closest('[data-day]'); if (d) { goDay(Number(d.dataset.day)); closeNav(); return; }
    const s = e.target.closest('[data-step]'); if (s) { selectStep(Number(s.dataset.step)); closeNav(); return; }
    const dr = e.target.closest('[data-drawer]'); if (dr) { openDrawer(dr.dataset.drawer); closeNav(); return; }
    const sp = e.target.closest('[data-say]'); if (sp) { say(sp.dataset.say, sp); return; }
  });
  async function goDay(d) {
    if (T.running) return toast('Stop the timer first');
    UI.day = d; UI.step = 1; saveUI(); await loadTakes(); renderAll(); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function selectStep(n) {
    if (T.running) return toast('Stop the timer first');
    UI.step = n; saveUI(); renderNav(); renderCards(); renderPinned(); renderTimer(); renderRec();
    focusZones();
  }
  function focusZones() {
    const f = STEP().focus;
    $('#varBuilder').classList.toggle('focus', f.includes('var'));
    $('#vault').classList.toggle('focus', f.includes('vault'));
    $('#diary').classList.toggle('focus', f.includes('diary'));
  }
  // Mobile: Zone A slides in.
  const navToggle = $('#navToggle');
  const closeNav = () => { document.body.classList.remove('nav-open'); navToggle.setAttribute('aria-expanded', 'false'); $('#scrim').hidden = true; };
  navToggle.addEventListener('click', () => { const open = !document.body.classList.contains('nav-open'); document.body.classList.toggle('nav-open', open); navToggle.setAttribute('aria-expanded', String(open)); $('#scrim').hidden = !open; });
  $('#scrim').addEventListener('click', closeNav);
  $('#brand').addEventListener('click', e => { e.preventDefault(); const open = TD.DAYS.find(x => !(S.days[x.d] && S.days[x.d].done)); goDay(open ? open.d : 30); });

  // ---------- Zone B: banner + cards ----------
  function renderBanner() {
    const d = DAY(), W = TD.WEEKS[d.w];
    const cat = d.kind === 'q' ? `Interview question #${d.q}` : TD.KIND_LABEL[d.kind];
    const qBase = TD.qText(d.q).replace(/[?.!]$/, '');
    const parent = d.kind === 'q' && d.say.replace(/[?.!]$/, '') !== qBase && !d.topic.startsWith(qBase) ? `<p class="parent">Question #${d.q}: ${esc(TD.qText(d.q))}</p>` : '';
    $('#banner').innerHTML = `
      <div class="meta"><span class="tag t-day">TAG ${d.d} · WOCHE ${d.w}</span><span class="tag t-${d.kind}">${esc(cat)}</span><span class="tag t-time">${esc(W.range)} per round</span>${dayRec(d.d).done ? '<span class="tag t-done">✓ done</span>' : ''}</div>
      <h1 class="prompt">${esc(d.topic)}</h1>${parent}
      <button type="button" class="btn ghost say" data-say="${esc(d.say)}">🔊 Read question aloud</button>`;
  }
  function typeBadges(p) {
    return TD.typesOf(p).map(n => `<div class="type"><span class="tbadge t${n}">Type ${n}</span><b>${esc(TD.TYPES[n].name)}</b><p>${esc(TD.TYPES[n].rule)}</p></div>`).join('');
  }
  function renderCards() {
    const d = DAY(), f = STEP().focus, chk = checksOfDay();
    const mark = id => chk[id] ? `<span class="used" title="${esc(chk[id][0].quote)}">✓ used ${chk[id].reduce((a, v) => a + (v.count || 1), 0)}×</span>` : '';
    let aBody;
    if (d.kind === 'mock') {
      const top = repeatList().slice(0, 2);
      aBody = `<p class="pattern">Your choice</p><p class="ex">${esc(d.a.ex)}</p>` + (top.length ? `<ol class="choice">${top.map(x => `<li><b>${esc(x.text)}</b> <span class="muted">${x.n}×</span></li>`).join('')}</ol>` : '<p class="muted">Nothing under „Was möchte ich wiederholen?“ yet.</p>');
    } else {
      aBody = `<p class="pattern">${esc(d.a.p)}</p><p class="ex">${esc(d.a.ex)} <button type="button" class="mini" data-say="${esc(d.a.ex)}" aria-label="Listen">🔊</button></p>${typeBadges(d.a.p)}`;
    }
    const bBody = d.kind === 'mock'
      ? `<p class="pattern">${esc(d.b.p)}</p><p class="ex">${esc(d.b.ex)}</p>`
      : `<p class="pattern">${esc(d.b.p)}</p><p class="ex">${esc(d.b.ex)} <button type="button" class="mini" data-say="${esc(d.b.ex)}" aria-label="Listen">🔊</button></p>${typeBadges(d.b.p)}`;
    const wvBody = d.wv
      ? `<p class="pattern">${esc(d.wv.p)} <span class="ending">${esc(TD.WV[d.wv.p].ending)}</span></p><p class="ex">${esc(d.wv.ex)} <button type="button" class="mini" data-say="${esc(d.wv.ex)}" aria-label="Listen">🔊</button></p><p class="rule">${esc(TD.WV[d.wv.p].rule)}</p>`
      : '<p class="muted none">No Wortverbindung today.</p>';
    $('#cards').innerHTML = `
      <article class="card a${f.includes('a') ? ' focus' : ''}"><header><span class="lbl">Satz A</span><span class="sub">${esc(d.a.tag)}</span>${mark('a')}</header>${aBody}</article>
      <article class="card b${f.includes('b') ? ' focus' : ''}"><header><span class="lbl">Satz B</span><span class="sub">${esc(d.b.tag)}</span>${mark('b')}</header>${bBody}</article>
      <article class="card wv${f.includes('wv') ? ' focus' : ''}${d.wv ? '' : ' empty'}"><header><span class="lbl">Wortverbindung</span>${d.wv ? `<span class="sub">${d.wv.n === 1 ? '1st · new' : '2nd · review'} · Dativ</span>` : ''}${mark('wv')}</header>${wvBody}</article>`;
  }
  // Step 2: three variations of Satz A
  function renderVar() {
    const d = DAY(), r = dayRec(d.d);
    if (d.kind === 'mock') { $('#varBuilder').innerHTML = ''; $('#varBuilder').hidden = true; return; }
    $('#varBuilder').hidden = false;
    $('#varBuilder').innerHTML = `<h3>Step 2 · Your 3 variations of Satz A <span class="muted">change the second half</span></h3>
      <div class="vars">${[0, 1, 2].map(i => `<div class="var"><span class="vn">${i + 1}</span><input type="text" lang="de" spellcheck="true" data-var="${i}" value="${esc(r.variations[i])}" placeholder="${esc(d.a.p)}"><button type="button" class="mini dict" data-dict="${i}" ${aiReady() ? '' : 'disabled'} title="${aiReady() ? 'Speak the sentence (Gemini writes it down)' : 'Needs the sync password and the Gemini key'}" aria-label="Dictate">🎙</button></div>`).join('')}</div>`;
  }
  $('#varBuilder').addEventListener('input', e => {
    const i = e.target.dataset.var; if (i == null) return;
    dayRec(UI.day).variations[i] = e.target.value; touchDay(UI.day); renderNav();
  });
  $('#varBuilder').addEventListener('click', e => { const b = e.target.closest('[data-dict]'); if (b) dictate(Number(b.dataset.dict), b); });
  let dict = null;
  async function dictate(i, btn) {
    if (T.running) return toast('Stop the timer first');
    if (dict) { dict.stop(); return; }
    try { await AK.mic(); } catch { return toast('Microphone blocked: allow it in the browser'); }
    const rec = AK.recorder(await AK.mic());
    btn.classList.add('rec'); btn.textContent = '■';
    const auto = setTimeout(() => dict && dict.stop(), 20000);
    dict = { stop: async () => {
      clearTimeout(auto); const d0 = dict; dict = null; if (!d0) return;
      btn.textContent = '…';
      try {
        const blob = await rec.stop();
        const text = await transcribeBlob(blob);
        const r = dayRec(UI.day); r.variations[i] = text; touchDay(UI.day);
        renderVar(); renderNav();
      } catch (e) { toast('Could not transcribe: ' + e.message); renderVar(); }
    } };
  }
  function renderPinned() {
    const words = dayRec(UI.day).words.filter(w => w.de);
    const show = UI.step === 6 && words.length;
    $('#pinned').hidden = !show;
    if (show) $('#pinned').innerHTML = `<b>Pinned for the repeat round:</b> ${words.map(w => `<span class="pin">${esc(w.de)}${w.concept ? ` <small>${esc(w.concept)}</small>` : ''}</span>`).join('')}`;
  }

  // ---------- Voice: Gemini clips cached in IndexedDB, browser voice as fallback ----------
  let playing = null;
  async function say(text, btn) {
    if (playing) { playing.pause(); playing = null; }
    if (window.speechSynthesis) speechSynthesis.cancel();
    btn && btn.classList.add('busy');
    try {
      let hit = null; try { hit = await AK.store.get('tts', text); } catch { /* no db */ }
      if (!hit && aiReady()) {
        const r = await api('/api/tts', { method: 'POST', body: { text }, raw: true });
        if (r.ok) { hit = { text, blob: await r.blob() }; AK.store.put('tts', hit).catch(() => {}); }
      }
      if (hit) { playing = new Audio(URL.createObjectURL(hit.blob)); await playing.play(); }
      else browserVoice(text);
    } catch { browserVoice(text); }
    btn && btn.classList.remove('busy');
  }
  function browserVoice(text) {
    if (!window.speechSynthesis) return toast('No voice available in this browser');
    const u = new SpeechSynthesisUtterance(text); u.lang = 'de-DE'; u.rate = 0.92;
    const v = speechSynthesis.getVoices().find(x => /^de(-|_)DE/i.test(x.lang)); if (v) u.voice = v;
    speechSynthesis.speak(u);
  }

  // ---------- Zone C: timer ----------
  const T = { running: false, phase: 'idle', dur: 60, endAt: 0, stopReq: false, label: '', pauses: 0 };
  function renderTimer() {
    const s = STEP(), d = DAY(), dur = durFor(s);
    const locked = s.dur === 'warmup';
    const fixed = s.dur !== 'round';
    const w = d.w, W = TD.WEEKS[w];
    const presets = [60, 90, 120, 180, 240, 300];
    const cur = S.settings.durs[w];
    $('#timerPanel').innerHTML = `
      <div class="ph"><h3>Step ${s.n} · ${esc(s.title)}</h3><span class="muted">${esc(s.text)}</span></div>
      ${s.key === 'retry' ? `<div class="retry-of">Repeat: ${['r1', 'r2', 'r3'].map(k => `<button type="button" class="chip${UI.retryOf === k ? ' cur' : ''}" data-retry="${k}">${TD.ROUND_LABEL[k]}</button>`).join('')}</div>` : ''}
      <div class="clock" id="tClock" aria-live="off">${fmt(T.running ? T.dur : dur)}</div>
      <div class="bar big"><span id="tBar"></span></div>
      <div class="controls">
        <button type="button" class="btn primary start" id="tStart">${T.running ? '■ Stop' : '▶ Start ' + (s.record ? (S.settings.autoRec ? '+ record' : '(no recording)') : 'timer')}</button>
        <button type="button" class="btn ghost" id="tTest">🔔 Test beep</button>
      </div>
      <div class="dur ${fixed ? 'disabled' : ''}">
        ${locked ? '<p class="note">The warm-up is always 60 s.</p>' : fixed ? `<p class="note">This step is ${fmtDur(dur)}.</p>` : ''}
        <label class="switch"><input type="checkbox" id="lock60" ${S.settings.lock60 ? 'checked' : ''} ${fixed ? 'disabled' : ''}> Strict 60 s lock</label>
        <div class="presets">${presets.map(p => `<button type="button" class="chip${!S.settings.lock60 && cur === p ? ' cur' : ''}" data-preset="${p}" ${fixed || S.settings.lock60 ? 'disabled' : ''}>${fmtDur(p)}</button>`).join('')}</div>
        <input type="range" id="durSlider" min="60" max="300" step="15" value="${cur}" ${fixed || S.settings.lock60 ? 'disabled' : ''} aria-label="Round time">
        <p class="note">Week ${w} plan: <b>${W.range}</b>. Your round time: <b id="durVal">${fmtDur(cur)}</b>${S.settings.lock60 ? ' (locked to 60 s)' : ''}.</p>
        <label class="switch"><input type="checkbox" id="ticks" ${S.settings.ticks ? 'checked' : ''}> Ticks in the last 5 seconds</label>
      </div>`;
  }
  $('#timerPanel').addEventListener('click', e => {
    if (e.target.id === 'tStart') return T.running ? (T.stopReq = true) : startStep();
    if (e.target.id === 'tTest') { AK.beepStart().then(() => AK.wait(400)).then(() => { AK.tick(); return AK.wait(300); }).then(() => AK.chime()); return; }
    const p = e.target.closest('[data-preset]'); if (p) { S.settings.durs[DAY().w] = Number(p.dataset.preset); touchSettings(); renderTimer(); renderNav(); return; }
    const r = e.target.closest('[data-retry]'); if (r) { UI.retryOf = r.dataset.retry; saveUI(); renderTimer(); renderCards(); }
  });
  $('#timerPanel').addEventListener('change', e => {
    if (e.target.id === 'lock60') { S.settings.lock60 = e.target.checked; touchSettings(); renderTimer(); renderNav(); }
    if (e.target.id === 'ticks') { S.settings.ticks = e.target.checked; touchSettings(); }
    if (e.target.id === 'durSlider') { S.settings.durs[DAY().w] = Number(e.target.value); touchSettings(); renderTimer(); renderNav(); }
  });
  $('#timerPanel').addEventListener('input', e => { if (e.target.id === 'durSlider') $('#durVal').textContent = fmtDur(Number(e.target.value)); });

  function startStep() {
    const s = STEP();
    return runTimer({ dur: durFor(s), record: s.record && S.settings.autoRec, label: s.key === 'prepare' || s.key === 'diary' ? null : s.key, extra: s.key === 'retry' ? { repeatOf: UI.retryOf } : {}, after: () => { if ([1, 2, 3, 4].includes(UI.step)) { UI.step++; saveUI(); } } });
  }

  async function runTimer({ dur, record, label, extra = {}, after }) {
    if (T.running) return;
    AK.ac();
    if (playing) { playing.pause(); playing = null; }
    let stream = null;
    if (record) { try { stream = await AK.mic(); } catch { toast('Microphone blocked: the timer runs without recording'); record = false; } }
    Object.assign(T, { running: true, phase: 'beep', dur, stopReq: false, label, pauses: 0 });
    renderTimer(); renderRec(); setStartLabel('■ Stop');
    await AK.beepStart();
    await AK.wait(350);                       // recording starts 350 ms after the start beep
    let rec = null, pd = null;
    if (record && stream) {
      rec = AK.recorder(stream);
      pd = AK.pauseDetector({ floor: Number(localStorage.getItem(NOISE)) || 0.004, onPause: n => { T.pauses = n; pauseAlert(true); }, onSpeech: () => pauseAlert(false) });
    }
    T.phase = 'run'; const t0 = performance.now(); T.endAt = t0 + dur * 1000;
    const wv = $('#wave'); if (wv && rec) wv.classList.add('live');
    let lock = null; try { if (navigator.wakeLock) lock = await navigator.wakeLock.request('screen'); } catch { /* not allowed */ }
    let lastTick = null;
    await new Promise(res => {
      const loop = () => {
        const left = (T.endAt - performance.now()) / 1000;
        const c = $('#tClock'), b = $('#tBar');
        if (c) c.textContent = fmt(Math.ceil(left));
        if (b) b.style.width = Math.min(100, (1 - left / dur) * 100) + '%';
        const sec = Math.ceil(left);
        if (S.settings.ticks && sec <= 5 && sec >= 1 && sec !== lastTick) { lastTick = sec; AK.tick(); }
        if (left <= 0 || T.stopReq) return res();
        setTimeout(loop, 50);
      };
      loop();
    });
    const ms = Math.round(performance.now() - t0);
    let blobP = null, stats = null;
    if (rec) { blobP = rec.stop(); stats = pd.stop(); }  // recording stops 50 ms before the end chime
    pauseAlert(false);
    if (lock) lock.release().catch(() => {});
    await AK.wait(50);
    AK.chime();
    T.running = false; T.phase = 'idle';
    if (blobP) {
      const blob = await blobP;
      if (blob.size > 1000) {
        const take = { id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), day: UI.day, round: label || 'free', mime: blob.type, blob, ms, planned: dur, pauses: stats.pauses, longestMs: stats.longestMs, createdAt: Date.now(), ...extra };
        await AK.store.put('takes', take);
        await loadTakes();
        if (S.settings.autoTr && aiReady()) transcribeTake(take.id);
      }
    }
    if (after && !T.stopReq) after();
    renderAll();
  }
  const setStartLabel = t => { const b = $('#tStart'); if (b) b.textContent = t; };
  function pauseAlert(on) {
    const a = $('#pauseAlert'); if (!a) return;
    a.hidden = !on; $('#pauseCount').textContent = T.pauses;
  }

  // ---------- Zone C: voice recorder + takes ----------
  let wave = null;
  function renderRec() {
    const noise = Number(localStorage.getItem(NOISE)) || 0;
    $('#recPanel').innerHTML = `
      <div class="ph"><h3>Voice studio</h3></div>
      <label class="switch"><input type="checkbox" id="autoRec" ${S.settings.autoRec ? 'checked' : ''}> Auto-record with the timer</label>
      <canvas class="wave${T.running && T.phase === 'run' ? ' live' : ''}" id="wave" aria-hidden="true"></canvas>
      <div class="pause-alert" id="pauseAlert" hidden>⚡ Pause &gt; 3 s erkannt! Weiterreden – umschreiben Sie das fehlende Wort!</div>
      <p class="live">Pauses &gt; 3 s this take: <b id="pauseCount">${T.pauses}</b></p>
      <div class="row"><button type="button" class="btn ghost small" id="noiseBtn">Measure room noise (2 s)</button><span class="muted">${noise ? 'Measured ✓' : 'Not measured yet: stay quiet while it measures'}</span></div>
      <label class="switch"><input type="checkbox" id="autoTr" ${S.settings.autoTr ? 'checked' : ''} ${aiReady() ? '' : 'disabled'}> Transcribe each take with Gemini after the round</label>
      ${aiReady() ? '' : `<p class="note">${!server ? 'Transcripts need the Vercel app (not available when opened as a local file).' : !server.gemini ? 'Set GEMINI_API_KEY in Vercel for transcripts.' : 'Enter your sync password (button at the top) for transcripts.'}</p>`}
      <h4>Takes · Day ${UI.day}</h4>
      <div class="takes" id="takes">${takesHtml(takes)}</div>`;
    if (wave) wave.stop();
    wave = AK.waveform($('#wave'));
  }
  function takeLabel(t) {
    let l = TD.ROUND_LABEL[t.round] || t.round;
    if (t.round === 'retry' && t.repeatOf) l += ' of ' + TD.ROUND_LABEL[t.repeatOf];
    if (t.round === 'mock' && t.q) l += ' · Q' + t.q;
    return l;
  }
  function takesHtml(list, opts = {}) {
    if (!list.length) return '<p class="muted">No recordings yet for this day.</p>';
    return list.map(t => {
      const time = new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const busy = trBusy[t.id];
      const checks = t.checks ? Object.entries(t.checks).map(([k, v]) => `<span class="ck ${v.used ? 'yes' : 'no'}">${v.used ? '✓' : '✗'} ${k === 'a' ? 'Satz A' : k === 'b' ? 'Satz B' : 'Wortverbindung'}${v.note ? ` <small>${esc(v.note)}</small>` : ''}</span>`).join('') : '';
      return `<div class="take" data-take="${t.id}">
        <div class="th"><b>${esc(takeLabel(t))}</b><span class="muted">${time} · ${fmt(t.ms / 1000)} · ${t.pauses} pause${t.pauses === 1 ? '' : 's'} &gt; 3 s · longest ${(t.longestMs / 1000).toFixed(1)} s</span></div>
        <audio controls preload="none" data-src="${t.id}"></audio>
        <div class="tb">
          <span class="speeds">${[0.85, 1, 1.25].map(r => `<button type="button" class="chip" data-rate="${r}">${r}×</button>`).join('')}</span>
          <button type="button" class="mini" data-dl="${t.id}" title="Download">⬇ .${AK.extOf(t.mime)}</button>
          ${opts.noTools ? '' : `<button type="button" class="mini" data-tr="${t.id}" ${aiReady() && !busy ? '' : 'disabled'}>${busy ? esc(busy) : t.transcript != null ? '↻ Transcript' : 'Transcribe'}</button>
          <button type="button" class="mini danger" data-del="${t.id}" title="Delete">Delete</button>`}
        </div>
        ${t.trError ? `<p class="err">${esc(t.trError)}</p>` : ''}
        ${checks ? `<div class="checks">${checks}</div>` : ''}
        ${t.transcript != null ? `<details><summary>Transcript</summary><p class="transcript" lang="de">${esc(t.transcript || '(no speech recognised)')}</p></details>` : ''}
      </div>`;
    }).join('');
  }
  // audio sources are attached lazily (blobs live in IndexedDB)
  const urls = {};
  async function attachAudio(root) {
    for (const a of $$('audio[data-src]', root)) {
      const id = a.dataset.src;
      if (!urls[id]) { const t = (takes.find(x => x.id === id)) || await AK.store.get('takes', id); if (!t) continue; urls[id] = URL.createObjectURL(t.blob); }
      a.src = urls[id];
    }
  }
  $('#main').addEventListener('click', async e => {
    const rate = e.target.closest('[data-rate]');
    if (rate) { const box = rate.closest('.take'); const a = $('audio', box); a.playbackRate = Number(rate.dataset.rate); a.preservesPitch = true; $$('[data-rate]', box).forEach(b => b.classList.toggle('cur', b === rate)); a.play(); return; }
    const dl = e.target.closest('[data-dl]');
    if (dl) { const t = await AK.store.get('takes', dl.dataset.dl); if (!t) return; const a = document.createElement('a'); a.href = URL.createObjectURL(t.blob); a.download = `30-DAY_Tag${String(t.day).padStart(2, '0')}_${takeLabel(t).replace(/[^\wäöüß]+/gi, '-')}_${new Date(t.createdAt).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.${AK.extOf(t.mime)}`; a.click(); return; }
    const tr = e.target.closest('[data-tr]'); if (tr) { transcribeTake(tr.dataset.tr); return; }
    const del = e.target.closest('[data-del]');
    if (del) { if (!confirm('Delete this recording?')) return; await AK.store.del('takes', del.dataset.del); await loadTakes(); renderAll(); }
  });
  $('#recPanel').addEventListener('change', e => {
    if (e.target.id === 'autoRec') { S.settings.autoRec = e.target.checked; touchSettings(); renderTimer(); }
    if (e.target.id === 'autoTr') { S.settings.autoTr = e.target.checked; touchSettings(); }
  });
  $('#recPanel').addEventListener('click', async e => {
    if (e.target.id !== 'noiseBtn') return;
    if (T.running) return toast('Stop the timer first');
    try { e.target.disabled = true; e.target.textContent = 'Measuring… stay quiet'; const v = await AK.measureNoise(2000); localStorage.setItem(NOISE, String(v)); toast('Room noise measured'); }
    catch { toast('Microphone blocked: allow it in the browser'); }
    renderRec(); attachAudio($('#recPanel'));
  });

  // ---------- Transcription (Gemini, after the take) ----------
  async function transcribeBlob(blob, onProgress) {
    const pieces = await AK.wavPieces(blob, 60);
    const out = [];
    for (let i = 0; i < pieces.length; i++) {
      if (onProgress) onProgress(pieces.length > 1 ? `Transcribing ${i + 1}/${pieces.length}…` : 'Transcribing…');
      const r = await api('/api/transcribe', { method: 'POST', body: { mode: 'audio', audio: await AK.toBase64(pieces[i]) } });
      out.push(r.transcript);
    }
    return out.join(' ').replace(/\s+/g, ' ').trim();
  }
  function targetsFor(t) {
    const d = TD.DAYS[t.day - 1]; if (d.kind === 'mock') return [];
    const A = { id: 'a', kind: 'pattern', p: d.a.p }, B = { id: 'b', kind: 'pattern', p: d.b.p }, WV = d.wv ? { id: 'wv', kind: 'wv', p: d.wv.p } : null;
    const map = { r1: [A], r2: [B], r3: [A, B, WV], retry: [A, B, WV], free: [A, B, WV] };
    return (map[t.round] || []).filter(Boolean);
  }
  async function transcribeTake(id) {
    if (trBusy[id]) return;
    const t = await AK.store.get('takes', id); if (!t) return;
    const upd = msg => { trBusy[id] = msg; const box = document.querySelector(`[data-tr="${id}"]`); if (box) { box.textContent = msg; box.disabled = true; } };
    upd('Transcribing…');
    try {
      t.transcript = await transcribeBlob(t.blob, upd);
      const targets = targetsFor(t);
      if (targets.length) { upd('Checking patterns…'); t.checks = (await api('/api/transcribe', { method: 'POST', body: { mode: 'check', transcript: t.transcript, targets } })).checks; }
      t.trError = '';
    } catch (e) {
      t.trError = e.status === 429 ? `Gemini quota reached: try again in ${e.retryAfter || 30} s.` : 'Transcript failed: ' + e.message;
    }
    delete trBusy[id];
    await AK.store.put('takes', t);
    await loadTakes(); if (t.day === UI.day) { renderCards(); renderRec(); attachAudio($('#recPanel')); renderNav(); }
  }

  // ---------- Zone D: missing words vault ----------
  function renderVault() {
    const r = dayRec(UI.day);
    $('#vault').innerHTML = `
      <div class="ph"><h3>Step 6 · Wortlücken</h3><span class="muted">Words you talked around. Look them up after the round, then repeat it once.</span></div>
      <form class="add-word" id="addWord"><input name="concept" placeholder="Concept (Spanish / English)" autocomplete="off"><span class="arr">→</span><input name="de" lang="de" placeholder="German word" autocomplete="off"><button class="btn small" type="submit">Add</button></form>
      <ul class="words">${r.words.map(w => `<li><span class="c">${esc(w.concept)}</span><span class="arr">→</span><span class="w" lang="de">${esc(w.de) || '<span class="muted">look up…</span>'}</span>${w.de ? `<button type="button" class="mini" data-say="${esc(w.de)}" aria-label="Listen">🔊</button>` : ''}<button type="button" class="mini danger" data-delword="${w.id}" aria-label="Remove">✕</button></li>`).join('') || '<li class="muted">No missing words logged today.</li>'}</ul>
      <button type="button" class="btn primary" id="repeatBtn">🔁 Run repeat round</button>`;
  }
  $('#vault').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target, concept = f.concept.value.trim(), de = f.de.value.trim();
    if (!concept && !de) return;
    dayRec(UI.day).words.push({ id: Date.now().toString(36), concept, de }); touchDay(UI.day);
    renderVault(); renderPinned(); $('#addWord input').focus();
  });
  $('#vault').addEventListener('click', e => {
    const d = e.target.closest('[data-delword]');
    if (d) { const r = dayRec(UI.day); r.words = r.words.filter(w => w.id !== d.dataset.delword); touchDay(UI.day); renderVault(); renderPinned(); return; }
    if (e.target.id === 'repeatBtn') { selectStep(6); $('#timerPanel').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  });

  // ---------- Zone D: correction + Challenge-Tagebuch ----------
  function longestRound() { const ms = takes.filter(t => ['r1', 'r2', 'r3', 'retry', 'final'].includes(t.round)).reduce((m, t) => Math.max(m, t.ms), 0); return ms ? fmt(ms / 1000) : ''; }
  function renderDiary() {
    const r = dayRec(UI.day), dr = r.diary, sug = longestRound();
    $('#diary').innerHTML = `
      <div class="ph"><h3>Step 7 · Correction &amp; Challenge-Tagebuch</h3><span class="muted">Saved automatically.</span></div>
      <label class="fld">Time reached <span class="inline"><input data-dk="time" value="${esc(dr.time)}" placeholder="e.g. 1:30 without stopping">${sug && sug !== dr.time ? `<button type="button" class="mini" id="useTime">Use ${sug}</button>` : ''}</span></label>
      <div class="fld">2–3 sentences I wasn't sure about
        ${[0, 1, 2].map(i => `<textarea lang="de" rows="2" data-unsure="${i}" placeholder="Satz ${i + 1}">${esc(dr.unsure[i] || '')}</textarea>`).join('')}
        <button type="button" class="btn ghost" id="copyPrompt">✨ Copy AI correction prompt</button>
      </div>
      <label class="fld">Was habe ich heute gelernt?<textarea rows="2" data-dk="learned">${esc(dr.learned)}</textarea></label>
      <label class="fld">Wörter / Wortverbindungen / Sätze<textarea lang="de" rows="2" data-dk="words">${esc(dr.words)}</textarea></label>
      <label class="fld">Was möchte ich wiederholen? <small class="muted">one pattern per line: Day 30 counts them</small><textarea lang="de" rows="2" data-dk="repeat">${esc(dr.repeat)}</textarea></label>
      <button type="button" class="btn ${r.done ? 'done' : 'primary'}" id="doneBtn">${r.done ? '✓ Day ' + UI.day + ' complete · undo' : 'Mark day ' + UI.day + ' complete'}</button>`;
  }
  $('#diary').addEventListener('input', e => {
    const r = dayRec(UI.day);
    if (e.target.dataset.dk) r.diary[e.target.dataset.dk] = e.target.value;
    else if (e.target.dataset.unsure != null) r.diary.unsure[Number(e.target.dataset.unsure)] = e.target.value;
    else return;
    touchDay(UI.day); renderNav();
  });
  $('#diary').addEventListener('click', async e => {
    if (e.target.id === 'useTime') { dayRec(UI.day).diary.time = longestRound(); touchDay(UI.day); renderDiary(); }
    if (e.target.id === 'copyPrompt') copyText(correctionPrompt(), 'Prompt copied: paste it into a Claude chat');
    if (e.target.id === 'doneBtn') { const r = dayRec(UI.day); r.done = !r.done; r.doneAt = r.done ? Date.now() : null; touchDay(UI.day); renderAll(); if (r.done) toast(`Day ${UI.day} complete`); }
  });
  function correctionPrompt() {
    const d = DAY(), dr = dayRec(d.d).diary, sents = dr.unsure.map(s => s.trim()).filter(Boolean);
    return [
      'Please correct my spoken German. I am practising answers for job interviews in Germany (target: natural, confident spoken German at C1 level).',
      '',
      `Day ${d.d}, topic: ${d.topic}`,
      d.kind === 'mock' ? '' : `Satz A: „${d.a.p}“ (e.g. ${d.a.ex})`,
      d.kind === 'mock' ? '' : `Satz B: „${d.b.p}“ (e.g. ${d.b.ex})`,
      d.wv ? `Wortverbindung: „${d.wv.p}“ (e.g. ${d.wv.ex})` : '',
      '',
      'Sentences I was not sure about:',
      ...(sents.length ? sents.map((s, i) => `${i + 1}. ${s}`) : ['1. ']),
      '',
      'For each sentence:',
      '1. Give the corrected sentence, ready to read aloud in an interview.',
      '2. List each change and explain it in one short English sentence (word order and verb position, case, article, adjective ending, word choice).',
      '3. Give one more natural variant that uses the day\'s sentence pattern.',
      'Explanations in English; German only for the sentences themselves.',
    ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
  }
  async function copyText(text, msg) {
    try { await navigator.clipboard.writeText(text); toast(msg); }
    catch { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast(msg); }
  }

  // ---------- Day 30: repeat patterns, mock interview, Day 1 vs Day 30 ----------
  function repeatList() {
    const m = new Map();
    for (let d = 1; d <= 29; d++) {
      const r = S.days[d]; if (!r || !r.diary || !r.diary.repeat) continue;
      for (const raw of r.diary.repeat.split(/\n|;/)) {
        const text = raw.replace(/^[-•*\d.)\s]+/, '').trim(); if (!text) continue;
        const k = text.toLowerCase(); const e = m.get(k) || { text, n: 0, days: [] };
        e.n++; e.days.push(d); m.set(k, e);
      }
    }
    return [...m.values()].sort((a, b) => b.n - a.n || a.days[0] - b.days[0]);
  }
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  let day1Takes = [];
  async function renderMock() {
    const box = $('#mock');
    if (DAY().kind !== 'mock') { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    if (!UI.mockOrder) { UI.mockOrder = shuffle(TD.QUESTIONS.map(q => q.n)); UI.mockIdx = 0; saveUI(); }
    try { day1Takes = (await AK.store.byDay(1)).sort((a, b) => a.createdAt - b.createdAt); } catch { day1Takes = []; }
    const done = new Set(takes.filter(t => t.round === 'mock').map(t => t.q));
    const qn = UI.mockOrder[UI.mockIdx] || UI.mockOrder[0], q = TD.QUESTIONS.find(x => x.n === qn);
    const reps = repeatList();
    const finals = takes.filter(t => t.round === 'final');
    const d1 = dayRec(1).diary, d30 = dayRec(30).diary;
    const unsureN = dr => dr.unsure.filter(s => s.trim()).length;
    box.innerHTML = `
      <div class="panel">
        <div class="ph"><h3>Your choice · most repeated under „Was möchte ich wiederholen?“ (Days 1–29)</h3></div>
        ${reps.length ? `<ol class="reps">${reps.slice(0, 8).map((x, i) => `<li class="${i < 2 ? 'top' : ''}"><b>${esc(x.text)}</b> <span class="muted">${x.n}× · days ${x.days.join(', ')}</span></li>`).join('')}</ol>` : '<p class="muted">Your diary has no entries under „Was möchte ich wiederholen?“ yet.</p>'}
      </div>
      <div class="panel mock-run">
        <div class="ph"><h3>Probe-Interview · all nine questions, 2 minutes each, random order</h3></div>
        <div class="mock-list">${UI.mockOrder.map((n, i) => `<button type="button" class="chip${i === UI.mockIdx ? ' cur' : ''}${done.has(n) ? ' ok' : ''}" data-mock="${i}">${done.has(n) ? '✓' : i + 1} · Q${n}</button>`).join('')}</div>
        <p class="mock-q"><span class="tag">Q${q.n}</span> ${esc(q.de)}</p>
        <div class="controls">
          <button type="button" class="mini" data-say="${esc(q.de)}">🔊 Read aloud</button>
          <button type="button" class="btn primary" id="mockStart">▶ Start 2:00 + record</button>
          <button type="button" class="btn ghost" id="mockShuffle">New random order</button>
        </div>
      </div>
      <div class="panel">
        <div class="ph"><h3>Day 30 final check · 3 minutes on the Day 1 question</h3><span class="muted">${esc(TD.qText(2))}</span></div>
        <div class="controls"><button type="button" class="mini" data-say="${esc(TD.qText(2))}">🔊 Read aloud</button><button type="button" class="btn primary" id="finalStart">▶ Start 3:00 + record</button></div>
        <div class="compare">
          <div><h4>Day 1</h4>${day1Takes.length ? `<select id="cmp1">${day1Takes.map(t => `<option value="${t.id}">${esc(takeLabel(t))} · ${fmt(t.ms / 1000)}</option>`).join('')}</select><div id="cmp1Box"></div>` : '<p class="muted">No Day 1 recording on this device.</p>'}
            <p class="stat">Time reached: <b>${esc(d1.time || '–')}</b> · unsure sentences: <b>${unsureN(d1)}</b></p></div>
          <div><h4>Day 30</h4>${finals.length ? `<select id="cmp30">${finals.map(t => `<option value="${t.id}">${esc(takeLabel(t))} · ${new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</option>`).join('')}</select><div id="cmp30Box"></div>` : '<p class="muted">Record the final check first.</p>'}
            <p class="stat">Time reached: <b>${esc(d30.time || '–')}</b> · unsure sentences: <b>${unsureN(d30)}</b></p></div>
        </div>
      </div>`;
    fillCompare('cmp1', day1Takes); fillCompare('cmp30', finals);
  }
  function fillCompare(id, list) {
    const sel = $('#' + id); if (!sel) return;
    const show = () => { const t = list.find(x => x.id === sel.value); $('#' + id + 'Box').innerHTML = t ? takesHtml([t], { noTools: true }) : ''; attachAudio($('#' + id + 'Box')); };
    sel.addEventListener('change', show); show();
  }
  $('#mock').addEventListener('click', e => {
    const m = e.target.closest('[data-mock]'); if (m) { UI.mockIdx = Number(m.dataset.mock); saveUI(); renderMock(); return; }
    if (e.target.id === 'mockShuffle') { UI.mockOrder = shuffle(TD.QUESTIONS.map(q => q.n)); UI.mockIdx = 0; saveUI(); renderMock(); return; }
    if (e.target.id === 'mockStart') {
      const n = UI.mockOrder[UI.mockIdx];
      runTimer({ dur: 120, record: true, label: 'mock', extra: { q: n }, after: () => { if (UI.mockIdx < 8) UI.mockIdx++; saveUI(); } });
      $('#timerPanel').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (e.target.id === 'finalStart') { runTimer({ dur: 180, record: true, label: 'final' }); $('#timerPanel').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  });

  // ---------- Drawers: word-order types, Tagebuch, export ----------
  function openDrawer(kind) {
    const w = $('#drawer'), d = $('.drawer', w);
    let title = '', body = '';
    if (kind === 'types') {
      title = 'The 6 word-order types';
      body = `<p>Before a round, check which type the day's pattern is: the verb position is where most spoken sentences break.</p>
        <div class="tbl"><table><thead><tr><th>Type</th><th>Rule</th><th>Patterns</th><th>Example</th></tr></thead><tbody>
        ${Object.entries(TD.TYPES).map(([n, t]) => `<tr><td><span class="tbadge t${n}">Type ${n}</span><br><b>${esc(t.name)}</b></td><td>${esc(t.rule)}</td><td lang="de">${esc(t.patterns)}</td><td lang="de">${esc(t.ex)}</td></tr>`).join('')}
        </tbody></table></div>
        <h3>Case in the word combinations</h3>
        <p>All ten take the Dativ after the preposition. With no article, the adjective carries the ending: masculine and neuter <b>-em</b> (aus gutem Grund, von großem Interesse, unter starkem Druck), feminine <b>-er</b> (mit ernster Miene, mit lauter Stimme, mit voller Absicht, mit letzter Kraft), plural <b>-en</b> and the noun <b>-n</b> (mit leeren Händen). „am“ = an dem, so the adjective takes <b>-en</b> (am frühen Morgen, am späten Abend). „Im Vergleich zu“ also takes the Dativ: zum Kurs, zur Schule.</p>
        <h3>Time per round</h3>
        <div class="tbl"><table><thead><tr><th>Days</th><th>Time per round</th><th>Move up when</th></tr></thead><tbody>${Object.values(TD.WEEKS).map(x => `<tr><td>${x.days}</td><td>${x.range}</td><td>${esc(x.up)}</td></tr>`).join('')}</tbody></table></div>`;
    } else if (kind === 'diary') {
      title = 'Challenge-Tagebuch';
      body = `<div class="tbl"><table class="diary-tbl"><thead><tr><th>Tag</th><th>Time reached</th><th>Was habe ich heute gelernt?</th><th>Wörter / Wortverbindungen / Sätze</th><th>Was möchte ich wiederholen?</th></tr></thead><tbody>
        ${TD.DAYS.map(x => { const r = S.days[x.d], dr = (r && r.diary) || {}; return `<tr><td><button type="button" class="mini" data-day="${x.d}">${r && r.done ? '✓ ' : ''}${x.d}</button></td><td>${esc(dr.time || '')}</td><td>${esc(dr.learned || '')}</td><td lang="de">${esc(dr.words || '')}</td><td lang="de">${esc(dr.repeat || '')}</td></tr>`; }).join('')}
        </tbody></table></div>
        <div class="controls"><button type="button" class="btn" id="expMd">Export Markdown</button><button type="button" class="btn ghost" id="expJson">Export JSON backup</button></div>`;
    } else {
      title = 'Export · backup · settings';
      body = `<h3>Diary</h3><div class="controls"><button type="button" class="btn" id="expMd">Export Markdown table</button><button type="button" class="btn ghost" id="expJson">Export JSON backup</button><button type="button" class="btn ghost" id="impJson">Import JSON backup</button></div>
        <p class="note">The JSON backup holds the diary, variations, missing words, completed days and settings. Recordings stay in this browser: download a take with its ⬇ button to keep it.</p>
        <h3>Sync</h3><p>${syncKey() ? 'A sync password is saved on this device.' : 'No sync password on this device.'}</p>
        <div class="controls"><button type="button" class="btn ghost" id="setKey">${syncKey() ? 'Change' : 'Enter'} sync password</button>${syncKey() ? '<button type="button" class="btn ghost" id="forgetKey">Forget on this device</button>' : ''}</div>`;
    }
    d.innerHTML = `<header><h2 id="drawerTitle">${esc(title)}</h2><button type="button" class="icon-btn" id="drawerClose" aria-label="Close">✕</button></header><div class="drawer-body">${body}</div>`;
    w.hidden = false; $('#drawerClose').focus();
  }
  const closeDrawer = () => { $('#drawer').hidden = true; };
  $('#drawer').addEventListener('click', e => {
    if (e.target.id === 'drawer' || e.target.id === 'drawerClose') return closeDrawer();
    if (e.target.closest('[data-day]')) return closeDrawer();
    if (e.target.id === 'expMd') download('30-DAY_Challenge-Tagebuch.md', exportMd(), 'text/markdown');
    if (e.target.id === 'expJson') download(`30-DAY_backup_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: '30-DAY', version: 1, exportedAt: new Date().toISOString(), days: S.days, settings: S.settings }, null, 2), 'application/json');
    if (e.target.id === 'impJson') $('#importFile').click();
    if (e.target.id === 'setKey') { closeDrawer(); askKey(); }
    if (e.target.id === 'forgetKey') { localStorage.removeItem(KEY); syncState = 'local'; closeDrawer(); renderAll(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeDrawer(); closeNav(); } });
  $('#importFile').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (!j || typeof j.days !== 'object') throw new Error('not a 30-DAY backup');
      applyRemote(j); save(); renderAll(); closeDrawer(); toast('Backup imported');
    } catch (err) { toast('Import failed: ' + err.message); }
  });
  function exportMd() {
    const cell = s => String(s || '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
    const rows = TD.DAYS.map(x => { const dr = (S.days[x.d] && S.days[x.d].diary) || {}; return `| ${x.d} | ${cell(dr.time)} | ${cell(dr.learned)} | ${cell(dr.words)} | ${cell(dr.repeat)} |`; });
    return `## Challenge-Tagebuch\n\n| Tag | Time reached | Was habe ich heute gelernt? | Wörter / Wortverbindungen / Sätze | Was möchte ich wiederholen? |\n| --- | --- | --- | --- | --- |\n${rows.join('\n')}\n`;
  }
  function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); }

  // ---------- Render all ----------
  function renderAll() {
    renderSync(); renderNav(); renderBanner(); renderCards(); renderVar(); renderPinned();
    renderTimer(); renderRec(); renderVault(); renderDiary(); renderMock(); focusZones();
    attachAudio($('#recPanel'));
  }

  // ---------- Start ----------
  (async function init() {
    await loadTakes();
    renderAll();
    try {
      const r = await fetch('/api/health', { cache: 'no-store' });
      const j = r.ok && /json/.test(r.headers.get('content-type') || '') ? await r.json() : null;
      server = j && j.ok ? j : null;
    } catch { server = null; }
    if (syncOn()) await pull(); else renderAll();
    window.addEventListener('online', () => pull());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !T.running) pull(); });
  })();
})();
