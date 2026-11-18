// 30-DAY audio engine: synthesized beeps, microphone, recorder, >3 s pause detector, waveform,
// WAV conversion for transcription, and IndexedDB storage for takes and voice clips.
(function () {
  'use strict';
  let ctx = null;
  const ac = () => {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // ---------- Beeps (Web Audio oscillators, no files) ----------
  function tone(freq, start, dur, { type = 'sine', gain = 0.25, attack = 0.008, release = 0.05 } = {}) {
    const c = ac();
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + attack);
    g.gain.setValueAtTime(gain, Math.max(start + attack, start + dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(c.destination);
    o.start(start); o.stop(start + dur + 0.02);
  }
  // Start: 660 Hz for 120 ms → 880 Hz for 200 ms. Resolves when the beep has finished (320 ms).
  async function beepStart() {
    const t = ac().currentTime + 0.02;
    tone(660, t, 0.12); tone(880, t + 0.12, 0.2);
    await wait(340);
  }
  // Last-5-seconds tick: short 520 Hz woodblock.
  function tick() {
    const c = ac(), t = c.currentTime + 0.005;
    tone(520, t, 0.05, { type: 'triangle', gain: 0.18, attack: 0.002, release: 0.04 });
    tone(1040, t, 0.025, { type: 'sine', gain: 0.05, attack: 0.001, release: 0.02 });
  }
  // End: D5 → G5 → C6, ringing out as a chord.
  async function chime() {
    const t = ac().currentTime + 0.02;
    [587.33, 783.99, 1046.5].forEach((f, i) => tone(f, t + i * 0.13, 1.3 - i * 0.13, { gain: 0.16, attack: 0.01, release: 0.9 }));
    await wait(1350);
  }

  // ---------- Microphone ----------
  let stream = null, source = null, analyser = null;
  async function mic() {
    if (stream && stream.active) return stream;
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false, channelCount: 1 } });
    const c = ac();
    source = c.createMediaStreamSource(stream);
    analyser = c.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.2;
    source.connect(analyser);
    return stream;
  }
  function rms() {
    if (!analyser) return 0;
    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return Math.sqrt(s / buf.length);
  }

  // ---------- Recorder ----------
  const MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/ogg;codecs=opus'];
  const pickMime = () => (window.MediaRecorder && MIMES.find(m => MediaRecorder.isTypeSupported(m))) || '';
  const extOf = mime => /mp4/.test(mime) ? 'm4a' : /ogg/.test(mime) ? 'ogg' : 'webm';
  function recorder(s) {
    const mime = pickMime();
    const rec = new MediaRecorder(s, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 48000 });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise(r => { rec.onstop = () => r(new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' })); });
    rec.start(1000);
    return { stop: () => { if (rec.state !== 'inactive') rec.stop(); return done; }, mime: rec.mimeType || mime };
  }

  // ---------- Pause detector ----------
  // Speech/silence from the microphone level. The room-noise floor comes from "Measure room noise" (stored per
  // device) and keeps adapting during the take: it drops fast when the room is quieter and rises only slowly.
  function pauseDetector({ floor = 0.004, limitMs = 3000, onPause, onSpeech, onLevel } = {}) {
    let nf = floor, silentSince = null, flagged = false, count = 0, longest = 0, timer = null, started = performance.now();
    const thr = () => Math.max(0.01, nf * 3.2);
    timer = setInterval(() => {
      const v = rms(), now = performance.now();
      if (v < nf) nf = nf * 0.7 + v * 0.3; else if (v < thr()) nf += (v - nf) * 0.01;
      const speaking = v >= thr();
      if (onLevel) onLevel(v, thr());
      if (speaking) {
        if (silentSince != null) { longest = Math.max(longest, now - silentSince); if (flagged && onSpeech) onSpeech(); }
        silentSince = null; flagged = false;
      } else {
        if (silentSince == null) silentSince = now;
        if (!flagged && now - silentSince >= limitMs) { flagged = true; count++; if (onPause) onPause(count); }
      }
    }, 50);
    return {
      stop() { clearInterval(timer); const now = performance.now(); if (silentSince != null) longest = Math.max(longest, now - silentSince); return { pauses: count, longestMs: Math.round(longest), ms: Math.round(now - started) }; },
    };
  }
  async function measureNoise(ms = 2000) {
    await mic();
    const vals = []; const end = performance.now() + ms;
    while (performance.now() < end) { vals.push(rms()); await wait(50); }
    vals.sort((a, b) => a - b);
    return vals[Math.floor(vals.length * 0.5)] || 0.004;
  }

  // ---------- Waveform ----------
  function waveform(canvas) {
    let raf = null;
    const g = canvas.getContext('2d');
    const draw = () => {
      const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      g.strokeStyle = getComputedStyle(canvas).color; g.lineWidth = 2; g.beginPath();
      if (analyser) {
        const buf = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(buf);
        const step = buf.length / w;
        for (let x = 0; x < w; x++) { const y = h / 2 + buf[Math.floor(x * step)] * h * 1.6; x ? g.lineTo(x, y) : g.moveTo(x, y); }
      } else { g.moveTo(0, h / 2); g.lineTo(w, h / 2); }
      g.stroke();
      raf = requestAnimationFrame(draw);
    };
    draw();
    return { stop() { cancelAnimationFrame(raf); } };
  }

  // ---------- WAV for transcription: 16 kHz mono, cut into pieces of `pieceSec` seconds ----------
  async function wavPieces(blob, pieceSec = 60) {
    const raw = await blob.arrayBuffer();
    const decoded = await ac().decodeAudioData(raw.slice(0));
    const rate = 16000, len = Math.ceil(decoded.duration * rate);
    const off = new OfflineAudioContext(1, len, rate);
    const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
    const pcm = (await off.startRendering()).getChannelData(0);
    const pieces = [];
    for (let i = 0; i < pcm.length; i += pieceSec * rate) pieces.push(encodeWav(pcm.subarray(i, Math.min(pcm.length, i + pieceSec * rate)), rate));
    return pieces;
  }
  function encodeWav(f32, rate) {
    const buf = new ArrayBuffer(44 + f32.length * 2), v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + f32.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
    v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, f32.length * 2, true);
    for (let i = 0; i < f32.length; i++) { const s = Math.max(-1, Math.min(1, f32[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
    return new Blob([buf], { type: 'audio/wav' });
  }
  const toBase64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });

  // ---------- IndexedDB: takes (recordings) and tts (voice clips) ----------
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('thirtyday', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('takes')) d.createObjectStore('takes', { keyPath: 'id' }).createIndex('day', 'day');
        if (!d.objectStoreNames.contains('tts')) d.createObjectStore('tts', { keyPath: 'text' });
      };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  const tx = async (store, mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(store, mode); const out = fn(t.objectStore(store)); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error); }); };
  const store = {
    put: (s, v) => tx(s, 'readwrite', o => o.put(v)),
    get: (s, k) => tx(s, 'readonly', o => o.get(k)),
    del: (s, k) => tx(s, 'readwrite', o => o.delete(k)),
    byDay: day => tx('takes', 'readonly', o => o.index('day').getAll(day)),
    all: s => tx(s, 'readonly', o => o.getAll()),
  };
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  window.AudioKit = { ac, beepStart, tick, chime, mic, rms, recorder, pickMime, extOf, pauseDetector, measureNoise, waveform, wavPieces, toBase64, store, wait };
})();
