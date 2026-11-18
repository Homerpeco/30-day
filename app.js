// 30-DAY – one simple card per round: topic, sentence structure, examples, one record button.
// Everything else (diary, missing words, recordings, settings, days) lives in the ⋯ menu.
(function () {
  'use strict';
  const TD = window.TD, AK = window.AudioKit;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = sec => { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };
  const fmtDur = sec => sec % 60 === 0 ? (sec / 60) + ' min' : sec < 60 ? sec + ' s' : fmt(sec);

  // ---------- Storage (keys unchanged from the first version) ----------
  const LS = 'thirtyday_v1', UIK = 'thirtyday_ui2', KEY = 'thirtyday_sync_key', NOISE = 'thirtyday_noise';
  const blankDay = () => ({ variations: [], words: [], diary: { time: '', unsure: ['', '', ''], learned: '', words: '', repeat: '' }, done: false, doneAt: null, updatedAt: 0 });
  const defSettings = () => ({ ticks: true, autoTr: true, durs: { 1: 60, 2: 90, 3: 120, 4: 180 }, updatedAt: 0 });
  function load() {
    let s = null; try { s = JSON.parse(localStorage.getItem(LS)); } catch { /* fresh */ }
    s = s && typeof s === 'object' ? s : {};
    s.days = s.days || {}; s.settings = Object.assign(defSettings(), s.settings || {});
    s.settings.durs = Object.assign(defSettings().durs, s.settings.durs || {});
    return s;
  }
  let S = load();
  let UI = (() => { try { return Object.assign({ day: 0, tab: 'r1', mockOrder: null, mockIdx: 0 }, JSON.parse(localStorage.getItem(UIK)) || {}); } catch { return { day: 0, tab: 'r1', mockOrder: null, mockIdx: 0 }; } })();
  const saveUI = () => { try { localStorage.setItem(UIK, JSON.stringify(UI)); } catch { /* full */ } };
  function dayRec(d) {
    const k = String(d); if (!S.days[k]) S.days[k] = blankDay();
    const x = S.days[k];
    x.diary = Object.assign(blankDay().diary, x.diary || {});
    if (!Array.isArray(x.diary.unsure)) x.diary.unsure = ['', '', ''];
    if (!Array.isArray(x.variations)) x.variations = [];
    if (!Array.isArray(x.words)) x.words = [];
    return x;
  }
  function save() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch { toast('Browser storage is full'); } schedulePush(); }
  const touchDay = d => { dayRec(d).updatedAt = Date.now(); save(); };
  const touchSettings = () => { S.settings.updatedAt = Date.now(); save(); };
  if (!UI.day) { const open = TD.DAYS.find(x => !(S.days[x.d] && S.days[x.d].done)); UI.day = open ? open.d : 30; }
  const DAY = () => TD.DAYS[UI.day - 1];
  const isMock = () => DAY().kind === 'mock';
  const tabsOf = () => isMock() ? ['mock', 'final'] : ['r1', 'r2', 'r3'];
  if (!tabsOf().includes(UI.tab)) UI.tab = tabsOf()[0];
  const roundDur = () => S.settings.durs[DAY().w] || TD.WEEKS[DAY().w].def;
  const tabDur = t => t === 'mock' ? 120 : t === 'final' ? 180 : t === 'warmup' ? 60 : roundDur();

  let toastT = null;
  function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }

  // ---------- Server: health, sync, Gemini ----------
  let server = null;
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
    for (const k of Object.keys(S.days)) { const v = S.days[k]; if (v && Array.isArray(v.variations)) v.variations = v.variations.filter(x => x && x.trim()); }
    try { localStorage.setItem(LS, JSON.stringify(S)); } catch { /* full */ }
  }
  async function pull() {
    if (!syncOn() || T.running) return;
    syncState = 'busy';
    try { applyRemote(await api('/api/progress')); await push(true); renderAll(); }
    catch (e) { syncState = e.status === 401 ? 'badkey' : 'error'; }
  }
  function schedulePush() { if (!syncOn()) return; clearTimeout(pushT); pushT = setTimeout(() => push(), 1500); }
  async function push() {
    if (!syncOn() || pushing) return;
    pushing = true; syncState = 'busy';
    try { applyRemote(await api('/api/progress', { method: 'PUT', body: { days: S.days, settings: S.settings } })); syncState = 'ok'; }
    catch (e) { syncState = e.status === 401 ? 'badkey' : 'error'; }
    pushing = false;
  }
  const syncLabel = () => !server ? 'Local only (no server)' : !server.syncKey ? 'Sync off: SYNC_KEY missing in Vercel' : !syncKey() ? 'Not connected on this device' : syncState === 'badkey' ? 'Wrong sync password' : syncState === 'error' ? 'Sync error' : 'Synced';

  // ---------- Takes ----------
  let takes = [];
  const trBusy = {};
  async function loadTakes() { try { takes = (await AK.store.byDay(UI.day)).sort((a, b) => a.createdAt - b.createdAt); } catch { takes = []; } }
  const takesOf = t => takes.filter(x => x.round === t);
  const lastOf = t => takesOf(t).slice(-1)[0];
  const urls = {};
  const urlOf = t => urls[t.id] || (urls[t.id] = URL.createObjectURL(t.blob));

  // ---------- Highlighting ----------
  // The pattern itself: fixed words marked, "…" shown as a gap to fill.
  const patternHtml = p => p.split('…').map(s => s.trim() ? `<mark>${esc(s.trim())}</mark>` : '').join(' <span class="gap"></span> ').trim();
  // An example sentence: the pattern's fixed words marked where they appear, in order.
  // Whole words first; a short word such as "zu" may also sit inside a word (einzuarbeiten).
  function exampleHtml(text, pattern) {
    const words = pattern.replace(/[…?]/g, ' ').replace(/\(nicht\)/g, 'nicht').split(/[\s,.:]+/).filter(Boolean);
    const q = w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const spans = []; let from = 0;
    for (const w of words) {
      const rest = text.slice(from);
      let m = new RegExp('(?<![\\p{L}])' + q(w) + '(?![\\p{L}])', 'iu').exec(rest);
      if (!m && w.length <= 2) m = new RegExp(q(w), 'iu').exec(rest);
      if (!m) continue;
      const at = from + m.index; spans.push([at, at + w.length]); from = at + w.length;
    }
    let out = '', i = 0;
    for (const [a, b] of spans) { out += esc(text.slice(i, a)) + '<mark>' + esc(text.slice(a, b)) + '</mark>'; i = b; }
    return (out + esc(text.slice(i))).replace(/<\/mark>(\s*)<mark>/g, '$1');
  }
  const typeLine = p => TD.typesOf(p).map(n => `<b>Type ${n} · ${esc(TD.TYPES[n].name)}:</b> ${esc(TD.TYPES[n].rule)}`).join('<br>');

  // ---------- Render ----------
  function renderTop() {
    const d = DAY(), r = S.days[d.d];
    $('#dayPick').innerHTML = `<b>Tag ${d.d} / 30</b><small>Woche ${d.w} · ${fmtDur(roundDur())} per round${r && r.done ? ' · <span class="done">✓ done</span>' : ''}</small>`;
    $('#prevDay').disabled = d.d === 1; $('#nextDay').disabled = d.d === 30;
  }
  function currentQuestion() {
    const d = DAY();
    if (UI.tab === 'mock') { const n = mockOrder()[UI.mockIdx]; return { text: TD.qText(n), say: TD.qText(n), chip: `Mock interview · question ${UI.mockIdx + 1} of 9` }; }
    if (UI.tab === 'final') return { text: TD.qText(2), say: TD.qText(2), chip: 'Final check · the Day 1 question' };
    const chip = d.kind === 'q' ? `Interview question #${d.q}` : TD.KIND_LABEL[d.kind];
    return { text: d.topic, say: d.say, chip };
  }
  function renderThema() {
    const q = currentQuestion();
    $('#thema').innerHTML = `<span class="label">Topic</span><h1 class="q">${esc(q.text)}</h1>
      <div class="row"><button type="button" class="say" data-say="${esc(q.say)}">🔊 Listen</button><span class="chip">${esc(q.chip)}</span></div>`;
  }
  function renderTabs() {
    const names = { r1: 'Satz A', r2: 'Satz B', r3: 'Kombinieren', mock: 'Probe-Interview', final: 'Final check' };
    const ts = tabsOf();
    $('#tabs').style.gridTemplateColumns = `repeat(${ts.length}, 1fr)`;
    $('#tabs').innerHTML = ts.map((t, i) => `<button type="button" class="tab${UI.tab === t ? ' cur' : ''}${takesOf(t).length ? ' ok' : ''}" data-tab="${t}"><small>0${i + 1}</small>${names[t]}</button>`).join('');
  }
  function usedBadge(t, ids) {
    const lt = lastOf(t); if (!lt || !lt.checks) return '';
    const parts = ids.filter(id => lt.checks[id]).map(id => (lt.checks[id].used ? '✓ ' : '✗ ') + ({ a: 'Satz A', b: 'Satz B', wv: 'Wortverbindung' })[id] + (lt.checks[id].used ? ' used' : ' not heard'));
    return parts.length ? `<span class="used">${esc(parts.join(' · '))}</span>` : '';
  }
  function renderStructure() {
    const d = DAY();
    let html = '<span class="label">Sentence structure</span>';
    if (UI.tab === 'r1') html += `<p class="pattern">${patternHtml(d.a.p)}</p><p class="rule">${typeLine(d.a.p)}</p>${usedBadge('r1', ['a'])}`;
    else if (UI.tab === 'r2') html += `<p class="pattern">${patternHtml(d.b.p)}</p><p class="rule">${typeLine(d.b.p)}</p>${usedBadge('r2', ['b'])}`;
    else if (UI.tab === 'r3') {
      html += `<p class="pattern">${patternHtml(d.a.p)}</p><p class="pattern">${patternHtml(d.b.p)}</p>`;
      if (d.wv) html += `<p class="pattern"><mark>${esc(d.wv.p)}</mark></p>`;
      html += `<p class="rule">Combine both structures in longer sentences${d.wv ? ' and work the Wortverbindung in' : ''}.</p>${usedBadge('r3', ['a', 'b', 'wv'])}`;
    } else {
      const top = repeatList().slice(0, 2);
      html += top.length ? top.map(x => `<p class="pattern">${patternHtml(x.text)}</p>`).join('') + '<p class="rule">The two structures your diary lists most often under „Was möchte ich wiederholen?“</p>'
        : '<p class="rule">Your diary has nothing under „Was möchte ich wiederholen?“ yet. Use any structures from the 30 days.</p>';
    }
    $('#structure').innerHTML = html;
  }
  function exBlock(key, text, pattern, extra = '') {
    return `<div class="ex"><div class="k">${esc(key)}</div><p>${pattern ? exampleHtml(text, pattern) : esc(text)} <button type="button" class="mini" data-say="${esc(text)}" aria-label="Listen">🔊</button></p>${extra}</div>`;
  }
  function renderBuild() {
    const d = DAY(), r = dayRec(d.d);
    let html = '<span class="label">Build your sentences</span>';
    if (UI.tab === 'r1') {
      html += exBlock('Example', d.a.ex, d.a.p);
      html += `<div class="ex"><div class="k">Your sentences · change the second half</div>
        <ul class="mine">${r.variations.map((v, i) => `<li><span lang="de">${exampleHtml(v, d.a.p)}</span><button type="button" data-delvar="${i}" aria-label="Remove">✕</button></li>`).join('')}</ul>
        <form class="add" id="addVar"><input name="v" lang="de" autocomplete="off" placeholder="${esc(d.a.p)}"><button type="submit">Add</button></form></div>`;
    } else if (UI.tab === 'r2') {
      html += exBlock('Example', d.b.ex, d.b.p);
    } else if (UI.tab === 'r3') {
      html += exBlock('Satz A', d.a.ex, d.a.p) + exBlock('Satz B', d.b.ex, d.b.p);
      if (d.wv) html += exBlock('Wortverbindung', d.wv.ex, d.wv.p, `<p class="rule">${esc(TD.WV[d.wv.p].rule)}<span class="ending">${esc(TD.WV[d.wv.p].ending)}</span></p>`);
      const words = r.words.filter(w => w.de);
      if (words.length) html += `<div class="ex"><div class="k">Your missing words</div><p>${words.map(w => esc(w.de)).join(' · ')}</p></div>`;
    } else if (UI.tab === 'mock') {
      const done = new Set(takesOf('mock').map(t => t.q));
      html += `<div class="ex"><div class="k">Nine questions · 2 minutes each · random order</div><ul class="mine">${mockOrder().map((n, i) => `<li><span>${done.has(n) ? '✓ ' : ''}${i + 1}. ${esc(TD.qText(n))}</span>${i === UI.mockIdx ? '<b>now</b>' : `<button type="button" data-mock="${i}" aria-label="Choose">↺</button>`}</li>`).join('')}</ul>
        <div class="row-btns"><button type="button" class="btn" id="mockShuffle">New random order</button></div></div>`;
    } else {
      html += `<div class="ex"><div class="k">Day 1 vs Day 30</div><p class="note">Speak 3 minutes on the Day 1 question, then compare both recordings under ⋯ → Recordings, and your Day 1 diary with today's.</p></div>`;
    }
    $('#build').innerHTML = html;
  }
  function renderRec() {
    const t = T.running ? T.label : UI.tab, dur = T.running ? T.dur : tabDur(UI.tab);
    const lt = !T.running && lastOf(UI.tab);
    const C = 2 * Math.PI * 45;
    let status = T.running ? (T.phase === 'beep' ? 'Get ready…' : 'Recording · keep talking, don\'t stop') : `Tap to speak ${fmtDur(dur)} · don't stop`;
    if (!T.running && trBusy[lt && lt.id]) status = trBusy[lt.id];
    let last = '';
    if (lt) {
      const ck = lt.checks ? Object.entries(lt.checks).map(([k, v]) => `<span class="ck${v.used ? '' : ' no'}">${v.used ? '✓' : '✗'} ${k === 'a' ? 'A' : k === 'b' ? 'B' : 'WV'}</span>`).join(' ') : '';
      last = `<div class="last"><button type="button" class="play" data-play="${lt.id}" aria-label="Play">▶</button>
        <div class="info"><b>Last take · ${fmt(lt.ms / 1000)}</b>${lt.pauses} pause${lt.pauses === 1 ? '' : 's'} &gt; 3 s ${ck}</div>
        <button type="button" class="more" data-sheet="takes">All</button></div>`;
    }
    $('#rec').innerHTML = `<div class="rec-in">
      <div class="alert" id="pauseAlert" hidden>⚡ Pause &gt; 3 s – weiterreden, umschreiben Sie das fehlende Wort!</div>
      <button type="button" class="rec-btn${T.running ? ' on' : ''}" id="recBtn" aria-label="${T.running ? 'Stop' : 'Record'}">
        <svg class="ring" viewBox="0 0 100 100" width="96" height="96" aria-hidden="true"><circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="5"/><circle id="ring" cx="50" cy="50" r="45" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}"/></svg>
        <span class="in"><span class="dot"></span><span class="t" id="clock">${fmt(dur)}</span></span>
      </button>
      <div class="status" id="status">${esc(status)}</div>${last}</div>`;
    void t;
  }
  function renderAll() { renderTop(); renderThema(); renderTabs(); renderStructure(); renderBuild(); renderRec(); }

  // ---------- Events ----------
  document.addEventListener('click', e => {
    const s = e.target.closest('[data-say]'); if (s) return say(s.dataset.say, s);
    const tb = e.target.closest('[data-tab]'); if (tb) { if (T.running) return toast('Stop the recording first'); UI.tab = tb.dataset.tab; saveUI(); return renderAll(); }
    const p = e.target.closest('[data-play]'); if (p) return playTake(p.dataset.play, p);
    const sh = e.target.closest('[data-sheet]'); if (sh) return openSheet(sh.dataset.sheet);
    const dv = e.target.closest('[data-delvar]'); if (dv) { const r = dayRec(UI.day); r.variations.splice(Number(dv.dataset.delvar), 1); touchDay(UI.day); return renderBuild(); }
    const mk = e.target.closest('[data-mock]'); if (mk) { UI.mockIdx = Number(mk.dataset.mock); saveUI(); return renderAll(); }
    if (e.target.id === 'mockShuffle') { UI.mockOrder = shuffle(TD.QUESTIONS.map(q => q.n)); UI.mockIdx = 0; saveUI(); return renderAll(); }
    if (e.target.closest('#recBtn')) return T.running ? (T.stopReq = true) : startTab();
  });
  document.addEventListener('submit', e => {
    if (e.target.id !== 'addVar') return;
    e.preventDefault();
    const v = e.target.v.value.trim(); if (!v) return;
    dayRec(UI.day).variations.push(v); touchDay(UI.day); renderBuild(); $('#addVar input').focus();
  });
  $('#prevDay').addEventListener('click', () => goDay(UI.day - 1));
  $('#nextDay').addEventListener('click', () => goDay(UI.day + 1));
  $('#dayPick').addEventListener('click', () => openSheet('days'));
  $('#menuBtn').addEventListener('click', () => openSheet('menu'));
  async function goDay(d) {
    if (T.running) return toast('Stop the recording first');
    if (d < 1 || d > 30) return;
    UI.day = d; UI.tab = tabsOf()[0]; saveUI(); await loadTakes(); renderAll(); window.scrollTo({ top: 0 });
  }

  // ---------- Voice (Gemini, cached; browser voice as fallback) ----------
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
  async function playTake(id, btn) {
    const t = takes.find(x => x.id === id) || await AK.store.get('takes', id); if (!t) return;
    if (playing && !playing.paused) { playing.pause(); playing = null; if (btn) btn.textContent = '▶'; return; }
    playing = new Audio(urlOf(t)); if (btn) { btn.textContent = '❚❚'; playing.onended = () => { btn.textContent = '▶'; }; }
    playing.play();
  }

  // ---------- Recording: beep → record → chime ----------
  const T = { running: false, phase: 'idle', dur: 60, stopReq: false, label: 'r1', pauses: 0 };
  function startTab(label = UI.tab) {
    const extra = label === 'mock' ? { q: mockOrder()[UI.mockIdx] } : {};
    const order = tabsOf();
    return run({ dur: tabDur(label), label, extra, after: () => {
      if (label === 'mock') { if (UI.mockIdx < 8) UI.mockIdx++; }
      else if (label !== 'warmup' && order.indexOf(label) < order.length - 1) UI.tab = order[order.indexOf(label) + 1];
      saveUI();
    } });
  }
  async function run({ dur, label, extra = {}, after }) {
    if (T.running) return;
    AK.ac();
    if (playing) { playing.pause(); playing = null; }
    let stream;
    try { stream = await AK.mic(); } catch { return toast('Microphone blocked: allow it in the browser settings'); }
    Object.assign(T, { running: true, phase: 'beep', dur, stopReq: false, label, pauses: 0 });
    renderRec();
    await AK.beepStart();
    await AK.wait(350);                                   // recording starts 350 ms after the start beep
    const rec = AK.recorder(stream);
    const pd = AK.pauseDetector({ floor: Number(localStorage.getItem(NOISE)) || 0.004, onPause: n => { T.pauses = n; alertOn(true); }, onSpeech: () => alertOn(false) });
    T.phase = 'run'; $('#status').textContent = 'Recording · keep talking, don\'t stop';
    let lock = null; try { if (navigator.wakeLock) lock = await navigator.wakeLock.request('screen'); } catch { /* not allowed */ }
    const t0 = performance.now(), end = t0 + dur * 1000, C = 2 * Math.PI * 45;
    let lastTick = null;
    await new Promise(res => {
      const loop = () => {
        const left = (end - performance.now()) / 1000, sec = Math.ceil(left);
        const c = $('#clock'), ring = $('#ring');
        if (c) c.textContent = fmt(sec);
        if (ring) ring.setAttribute('stroke-dashoffset', String(C * (1 - Math.min(1, (dur - left) / dur))));
        if (S.settings.ticks && sec <= 5 && sec >= 1 && sec !== lastTick) { lastTick = sec; AK.tick(); }
        if (left <= 0 || T.stopReq) return res();
        setTimeout(loop, 50);
      };
      loop();
    });
    const ms = Math.round(performance.now() - t0);
    const blobP = rec.stop(), stats = pd.stop();           // recording stops 50 ms before the end chime
    alertOn(false);
    if (lock) lock.release().catch(() => {});
    await AK.wait(50);
    AK.chime();
    T.running = false; T.phase = 'idle';
    const blob = await blobP;
    let id = null;
    if (blob.size > 1000) {
      id = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
      await AK.store.put('takes', { id, day: UI.day, round: label, mime: blob.type, blob, ms, planned: dur, pauses: stats.pauses, longestMs: stats.longestMs, createdAt: Date.now(), ...extra });
      await loadTakes();
    }
    const full = !T.stopReq;
    renderAll();
    if (id && S.settings.autoTr && aiReady()) transcribeTake(id);
    if (full && after) { after(); setTimeout(renderAll, 1600); }
  }
  function alertOn(on) { const a = $('#pauseAlert'); if (a) a.hidden = !on; }

  // ---------- Transcript + pattern check (Gemini, after the take) ----------
  async function transcribeBlob(blob, onProgress) {
    const pieces = await AK.wavPieces(blob, 60), out = [];
    for (let i = 0; i < pieces.length; i++) {
      onProgress && onProgress(pieces.length > 1 ? `Writing down what you said ${i + 1}/${pieces.length}…` : 'Writing down what you said…');
      out.push((await api('/api/transcribe', { method: 'POST', body: { mode: 'audio', audio: await AK.toBase64(pieces[i]) } })).transcript);
    }
    return out.join(' ').replace(/\s+/g, ' ').trim();
  }
  function targetsFor(t) {
    const d = TD.DAYS[t.day - 1]; if (d.kind === 'mock') return [];
    const A = { id: 'a', kind: 'pattern', p: d.a.p }, B = { id: 'b', kind: 'pattern', p: d.b.p }, W = d.wv ? { id: 'wv', kind: 'wv', p: d.wv.p } : null;
    return ({ r1: [A], r2: [B], r3: [A, B, W] }[t.round] || []).filter(Boolean);
  }
  async function transcribeTake(id) {
    if (trBusy[id]) return;
    const t = await AK.store.get('takes', id); if (!t) return;
    const upd = msg => { trBusy[id] = msg; const s = $('#status'); if (s && !T.running && UI.day === t.day) s.textContent = msg; };
    try {
      t.transcript = await transcribeBlob(t.blob, upd);
      const targets = targetsFor(t);
      if (targets.length) { upd('Checking the structures…'); t.checks = (await api('/api/transcribe', { method: 'POST', body: { mode: 'check', transcript: t.transcript, targets } })).checks; }
      t.trError = '';
    } catch (e) { t.trError = e.status === 429 ? `Gemini limit reached: try again in ${e.retryAfter || 30} s` : 'Transcript failed: ' + e.message; }
    delete trBusy[id];
    await AK.store.put('takes', t);
    if (t.day === UI.day) { await loadTakes(); if (!T.running) renderAll(); }
    if (t.trError) toast(t.trError, 4000);
  }

  // ---------- Day 30 helpers ----------
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  function mockOrder() { if (!UI.mockOrder || UI.mockOrder.length !== 9) { UI.mockOrder = shuffle(TD.QUESTIONS.map(q => q.n)); UI.mockIdx = 0; saveUI(); } return UI.mockOrder; }
  function repeatList() {
    const m = new Map();
    for (let d = 1; d <= 29; d++) {
      const r = S.days[d]; if (!r || !r.diary || !r.diary.repeat) continue;
      for (const raw of r.diary.repeat.split(/\n|;/)) {
        const text = raw.replace(/^[-•*\d.)\s]+/, '').trim(); if (!text) continue;
        const k = text.toLowerCase(), e = m.get(k) || { text, n: 0, days: [] }; e.n++; e.days.push(d); m.set(k, e);
      }
    }
    return [...m.values()].sort((a, b) => b.n - a.n || a.days[0] - b.days[0]);
  }

  // ---------- Sheets (menu and everything behind it) ----------
  function openSheet(kind) {
    if (T.running && kind !== 'takes') return toast('Stop the recording first');
    const d = DAY(), r = dayRec(d.d), dr = r.diary;
    let title = '', body = '';
    if (kind === 'menu') {
      title = 'Menu';
      const item = (k, ic, t, sub) => `<button type="button" class="item" data-sheet="${k}"><span class="ic">${ic}</span><span>${t}<small>${sub}</small></span></button>`;
      body = `<div class="list">
        ${item('warmup', '🔥', 'Warm-up · 60 s', 'Speak freely about anything to switch German on')}
        ${item('diary', '📝', 'Diary & correction', 'Unsure sentences, AI correction prompt, mark the day done')}
        ${item('words', '🧩', 'Missing words', `${r.words.length} logged today`)}
        ${item('takes', '🎙', 'Recordings', `${takes.length} today · play, transcript, download`)}
        ${item('days', '📅', 'All 30 days', `${TD.DAYS.filter(x => S.days[x.d] && S.days[x.d].done).length} / 30 done`)}
        ${item('types', '📐', 'The 6 word-order types', 'Where the verb goes')}
        ${item('settings', '⚙️', 'Settings', `Round time ${fmtDur(roundDur())} · ${syncLabel()}`)}
        ${item('export', '⬇', 'Export & backup', 'Diary as Markdown, full JSON backup')}
      </div>`;
    } else if (kind === 'warmup') {
      closeSheet(); return run({ dur: 60, label: 'warmup' });
    } else if (kind === 'days') {
      title = 'All 30 days';
      body = [1, 2, 3, 4].map(w => `<div class="wk">Woche ${w} · ${TD.WEEKS[w].range} per round</div><div class="days">${TD.DAYS.filter(x => x.w === w).map(x => `<button type="button" class="${x.d === UI.day ? 'cur' : ''}${S.days[x.d] && S.days[x.d].done ? ' done' : ''}" data-goday="${x.d}" title="${esc(x.topic)}">${S.days[x.d] && S.days[x.d].done ? '✓' : x.d}</button>`).join('')}</div>`).join('');
    } else if (kind === 'diary') {
      title = `Diary · Tag ${d.d}`;
      const longest = takes.filter(t => ['r1', 'r2', 'r3', 'final'].includes(t.round)).reduce((m, t) => Math.max(m, t.ms), 0);
      body = `<label class="fld">Time reached<input data-dk="time" value="${esc(dr.time)}" placeholder="${longest ? 'longest round today: ' + fmt(longest / 1000) : 'e.g. 1:30 without stopping'}"></label>
        <div class="fld">2–3 sentences I wasn't sure about${[0, 1, 2].map(i => `<textarea lang="de" rows="2" data-unsure="${i}" placeholder="Satz ${i + 1}">${esc(dr.unsure[i] || '')}</textarea>`).join('')}</div>
        <div class="row-btns"><button type="button" class="btn" id="copyPrompt">✨ Copy AI correction prompt</button></div>
        <label class="fld">Was habe ich heute gelernt?<textarea rows="2" data-dk="learned">${esc(dr.learned)}</textarea></label>
        <label class="fld">Wörter / Wortverbindungen / Sätze<textarea lang="de" rows="2" data-dk="words">${esc(dr.words)}</textarea></label>
        <label class="fld">Was möchte ich wiederholen? <span class="note">one structure per line</span><textarea lang="de" rows="2" data-dk="repeat">${esc(dr.repeat)}</textarea></label>
        <button type="button" class="btn ${r.done ? 'ok' : 'primary'}" id="doneBtn">${r.done ? '✓ Day ' + d.d + ' done · undo' : 'Mark day ' + d.d + ' done'}</button>`;
    } else if (kind === 'words') {
      title = 'Missing words';
      body = `<p class="note">Words you had to talk around. Look them up after the round; they appear in the Kombinieren tab.</p>
        <form class="add" id="addWord"><input name="concept" placeholder="Spanish / English" autocomplete="off"><input name="de" lang="de" placeholder="German" autocomplete="off"><button type="submit">Add</button></form>
        <ul class="mine">${r.words.map(w => `<li><span>${esc(w.concept)} → <b lang="de">${esc(w.de)}</b></span><button type="button" data-delword="${w.id}" aria-label="Remove">✕</button></li>`).join('')}</ul>`;
    } else if (kind === 'takes') {
      title = `Recordings · Tag ${d.d}`;
      const lbl = t => (TD.ROUND_LABEL[t.round] || t.round) + (t.q ? ' · Q' + t.q : '');
      const day1 = d.d === 30 ? '<div class="row-btns"><button type="button" class="btn" id="showDay1">Show Day 1 recordings</button></div><div id="day1Box"></div>' : '';
      body = day1 + (takes.length ? takes.slice().reverse().map(t => `<div class="take"><b>${esc(lbl(t))}</b> · ${new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${fmt(t.ms / 1000)} · ${t.pauses} pause${t.pauses === 1 ? '' : 's'} &gt; 3 s
        <audio controls preload="none" src="${urlOf(t)}"></audio>
        <div class="acts"><button type="button" data-rate="0.85">0.85×</button><button type="button" data-rate="1">1×</button><button type="button" data-rate="1.25">1.25×</button><button type="button" data-dl="${t.id}">⬇ .${AK.extOf(t.mime)}</button>${aiReady() ? `<button type="button" data-tr="${t.id}">${t.transcript != null ? 'Transcribe again' : 'Transcribe'}</button>` : ''}<button type="button" data-del="${t.id}">Delete</button></div>
        ${t.trError ? `<p class="note">${esc(t.trError)}</p>` : ''}${t.transcript != null ? `<div class="tr" lang="de">${esc(t.transcript || '(no speech recognised)')}</div>` : ''}</div>`).join('') : '<p class="note">No recordings today yet.</p>');
    } else if (kind === 'types') {
      title = 'The 6 word-order types';
      body = Object.entries(TD.TYPES).map(([n, t]) => `<h3>Type ${n} · ${esc(t.name)}</h3><p>${esc(t.rule)}</p><p class="note" lang="de">${esc(t.ex)}</p>`).join('')
        + '<h3>Wortverbindungen (Dativ)</h3><p>No article: masculine and neuter -em, feminine -er, plural -en and the noun -n. „am“ = an dem, so the adjective takes -en.</p>';
    } else if (kind === 'settings') {
      title = 'Settings';
      const cur = roundDur(), noise = localStorage.getItem(NOISE);
      body = `<h3>Round time · Woche ${d.w} (plan: ${TD.WEEKS[d.w].range})</h3>
        <div class="presets">${[60, 90, 120, 150, 180, 240, 300].map(p => `<button type="button" class="${cur === p ? 'cur' : ''}" data-preset="${p}">${fmtDur(p)}</button>`).join('')}</div>
        <p class="note">Move up when: ${esc(TD.WEEKS[d.w].up)}. The warm-up always stays at 60 s.</p>
        <label class="switch"><input type="checkbox" id="ticks" ${S.settings.ticks ? 'checked' : ''}> Ticks in the last 5 seconds</label>
        <label class="switch"><input type="checkbox" id="autoTr" ${S.settings.autoTr ? 'checked' : ''} ${aiReady() ? '' : 'disabled'}> Write down what I said after each round (Gemini)</label>
        <div class="row-btns"><button type="button" class="btn" id="noiseBtn">Measure room noise (2 s)</button><button type="button" class="btn" id="testBeep">🔔 Test beep</button></div>
        <p class="note">${noise ? 'Room noise measured.' : 'Measure the room noise once, in silence, so the pause alert works well.'}</p>
        <h3>Sync</h3><p>${esc(syncLabel())}</p>
        <div class="row-btns"><button type="button" class="btn" id="setKey">${syncKey() ? 'Change' : 'Enter'} sync password</button>${syncKey() ? '<button type="button" class="btn" id="forgetKey">Forget on this device</button>' : ''}</div>`;
    } else if (kind === 'export') {
      title = 'Export & backup';
      body = `<div class="row-btns"><button type="button" class="btn" id="expMd">Diary as Markdown</button><button type="button" class="btn" id="expJson">JSON backup</button><button type="button" class="btn" id="impJson">Import JSON</button></div>
        <p class="note">The backup holds diary, sentences, missing words, done days and settings. Recordings stay in this browser: download them under Recordings.</p>`;
    }
    const sh = $('#sheet');
    $('.sheet', sh).innerHTML = `<header><h2 id="sheetTitle">${esc(title)}</h2><button type="button" class="close" id="closeSheet" aria-label="Close">✕</button></header>${body}`;
    sh.hidden = false; sh.dataset.kind = kind;
  }
  const closeSheet = () => { $('#sheet').hidden = true; };
  const sheetEl = $('#sheet');
  sheetEl.addEventListener('click', async e => {
    const id = e.target.id;
    if (id === 'sheet' || id === 'closeSheet') return closeSheet();
    const g = e.target.closest('[data-goday]'); if (g) { closeSheet(); return goDay(Number(g.dataset.goday)); }
    const pr = e.target.closest('[data-preset]'); if (pr) { S.settings.durs[DAY().w] = Number(pr.dataset.preset); touchSettings(); renderAll(); return openSheet('settings'); }
    const rt = e.target.closest('[data-rate]'); if (rt) { const a = $('audio', rt.closest('.take')); a.playbackRate = Number(rt.dataset.rate); a.preservesPitch = true; return a.play(); }
    const dl = e.target.closest('[data-dl]'); if (dl) { const t = await AK.store.get('takes', dl.dataset.dl); if (!t) return; const a = document.createElement('a'); a.href = urlOf(t); a.download = `30-DAY_Tag${String(t.day).padStart(2, '0')}_${t.round}_${new Date(t.createdAt).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.${AK.extOf(t.mime)}`; return a.click(); }
    const tr = e.target.closest('[data-tr]'); if (tr) { tr.textContent = 'Working…'; tr.disabled = true; await transcribeTake(tr.dataset.tr); return openSheet('takes'); }
    const del = e.target.closest('[data-del]'); if (del) { await AK.store.del('takes', del.dataset.del); await loadTakes(); renderAll(); return openSheet('takes'); }
    const dw = e.target.closest('[data-delword]'); if (dw) { const r = dayRec(UI.day); r.words = r.words.filter(w => w.id !== dw.dataset.delword); touchDay(UI.day); renderBuild(); return openSheet('words'); }
    if (id === 'copyPrompt') return copyText(correctionPrompt(), 'Prompt copied: paste it into a Claude chat');
    if (id === 'doneBtn') { const r = dayRec(UI.day); r.done = !r.done; r.doneAt = r.done ? Date.now() : null; touchDay(UI.day); renderTop(); if (r.done) toast(`Tag ${UI.day} done`); return openSheet('diary'); }
    if (id === 'testBeep') { await AK.beepStart(); await AK.wait(400); AK.tick(); await AK.wait(300); return AK.chime(); }
    if (id === 'noiseBtn') { e.target.textContent = 'Measuring… stay quiet'; try { localStorage.setItem(NOISE, String(await AK.measureNoise(2000))); toast('Room noise measured'); } catch { toast('Microphone blocked'); } return openSheet('settings'); }
    if (id === 'setKey') { closeSheet(); return askKey(); }
    if (id === 'forgetKey') { localStorage.removeItem(KEY); syncState = 'local'; return openSheet('settings'); }
    if (id === 'expMd') return download('30-DAY_Challenge-Tagebuch.md', exportMd(), 'text/markdown');
    if (id === 'expJson') return download(`30-DAY_backup_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: '30-DAY', version: 2, exportedAt: new Date().toISOString(), days: S.days, settings: S.settings }, null, 2), 'application/json');
    if (id === 'impJson') return $('#importFile').click();
    if (id === 'showDay1') {
      const list = (await AK.store.byDay(1)).sort((a, b) => a.createdAt - b.createdAt);
      $('#day1Box').innerHTML = list.length ? list.map(t => `<div class="take"><b>Tag 1 · ${esc(TD.ROUND_LABEL[t.round] || t.round)}</b> · ${fmt(t.ms / 1000)} · ${t.pauses} pauses<audio controls preload="none" src="${urlOf(t)}"></audio></div>`).join('') : '<p class="note">No Day 1 recording on this device.</p>';
    }
  });
  sheetEl.addEventListener('input', e => {
    const r = dayRec(UI.day);
    if (e.target.dataset.dk) r.diary[e.target.dataset.dk] = e.target.value;
    else if (e.target.dataset.unsure != null) r.diary.unsure[Number(e.target.dataset.unsure)] = e.target.value;
    else return;
    touchDay(UI.day);
  });
  sheetEl.addEventListener('change', e => {
    if (e.target.id === 'ticks') { S.settings.ticks = e.target.checked; touchSettings(); }
    if (e.target.id === 'autoTr') { S.settings.autoTr = e.target.checked; touchSettings(); }
  });
  sheetEl.addEventListener('submit', e => {
    if (e.target.id !== 'addWord') return;
    e.preventDefault();
    const concept = e.target.concept.value.trim(), de = e.target.de.value.trim(); if (!concept && !de) return;
    dayRec(UI.day).words.push({ id: Date.now().toString(36), concept, de }); touchDay(UI.day); renderBuild(); openSheet('words'); $('#addWord input').focus();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
  $('#importFile').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { const j = JSON.parse(await f.text()); if (!j || typeof j.days !== 'object') throw new Error('not a 30-DAY backup'); applyRemote(j); save(); renderAll(); closeSheet(); toast('Backup imported'); }
    catch (err) { toast('Import failed: ' + err.message); }
  });
  function askKey() {
    const k = prompt('Sync password (the SYNC_KEY set in Vercel):', '');
    if (k == null) return;
    try { localStorage.setItem(KEY, k.trim()); } catch { /* full */ }
    syncState = 'local'; pull();
  }
  function correctionPrompt() {
    const d = DAY(), dr = dayRec(d.d).diary, sents = dr.unsure.map(s => s.trim()).filter(Boolean);
    return [
      'Please correct my spoken German. I am practising answers for job interviews in Germany (target: natural, confident spoken German at C1 level).', '',
      `Day ${d.d}, topic: ${d.topic}`,
      d.kind === 'mock' ? '' : `Satz A: „${d.a.p}“ (e.g. ${d.a.ex})`,
      d.kind === 'mock' ? '' : `Satz B: „${d.b.p}“ (e.g. ${d.b.ex})`,
      d.wv ? `Wortverbindung: „${d.wv.p}“ (e.g. ${d.wv.ex})` : '', '',
      'Sentences I was not sure about:', ...(sents.length ? sents.map((s, i) => `${i + 1}. ${s}`) : ['1. ']), '',
      'For each sentence:',
      '1. Give the corrected sentence, ready to read aloud in an interview.',
      '2. List each change and explain it in one short English sentence (word order and verb position, case, article, adjective ending, word choice).',
      '3. Give one more natural variant that uses the day\'s sentence structure.',
      'Explanations in English; German only for the sentences themselves.',
    ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
  }
  async function copyText(text, msg) {
    try { await navigator.clipboard.writeText(text); toast(msg); }
    catch { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast(msg); }
  }
  function exportMd() {
    const cell = s => String(s || '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
    const rows = TD.DAYS.map(x => { const dr = (S.days[x.d] && S.days[x.d].diary) || {}; return `| ${x.d} | ${cell(dr.time)} | ${cell(dr.learned)} | ${cell(dr.words)} | ${cell(dr.repeat)} |`; });
    return `## Challenge-Tagebuch\n\n| Tag | Time reached | Was habe ich heute gelernt? | Wörter / Wortverbindungen / Sätze | Was möchte ich wiederholen? |\n| --- | --- | --- | --- | --- |\n${rows.join('\n')}\n`;
  }
  function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); }

  // ---------- Start ----------
  (async function init() {
    // first version stored 3 empty variation slots: drop the empty ones
    for (const k of Object.keys(S.days)) { const v = S.days[k]; if (v && Array.isArray(v.variations)) v.variations = v.variations.filter(x => x && x.trim()); }
    await loadTakes(); renderAll();
    try {
      const r = await fetch('/api/health', { cache: 'no-store' });
      const j = r.ok && /json/.test(r.headers.get('content-type') || '') ? await r.json() : null;
      server = j && j.ok ? j : null;
    } catch { server = null; }
    if (syncOn()) await pull();
    window.addEventListener('online', () => pull());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pull(); });
  })();
})();
