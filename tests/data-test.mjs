// node tests/data-test.mjs — checks the 30-day data against the training plan's own claims.
import { readFileSync } from 'fs';
import vm from 'vm';
const ctx = {}; vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('../data.js', import.meta.url), 'utf8'), ctx);
const TD = ctx.TD;

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.error('FAIL', msg); } };

ok(TD.DAYS.length === 30, '30 days');
TD.DAYS.forEach((d, i) => ok(d.d === i + 1, 'day order ' + d.d));

const kinds = k => TD.DAYS.filter(d => d.kind === k).map(d => d.d);
const interview = [...kinds('q'), ...kinds('mock')];
ok(interview.length === 24, '24 interview days, got ' + interview.length);
ok(JSON.stringify(kinds('pdf')) === '[2,9,12,18]', 'PDF days 2, 9, 12, 18');
ok(JSON.stringify(kinds('ask')) === '[28,29]', 'asking-back days 28, 29');

// every one of the nine questions is used 2–4 times
for (const q of TD.QUESTIONS) {
  const n = TD.DAYS.filter(d => d.q === q.n).length;
  ok(n >= 2 && n <= 4, `question ${q.n} used ${n} times`);
}
ok(JSON.stringify(TD.DAYS.filter(d => d.q === 8).map(d => d.d)) === '[8,11,19,25]', 'customer story on days 8, 11, 19, 25');

// 30 patterns: 29 Satz A (days 1–29) + Day 1's second new pattern
const newPatterns = new Set(TD.DAYS.filter(d => d.d < 30).map(d => d.a.p));
newPatterns.add(TD.DAYS[0].b.p);
ok(newPatterns.size === 30, '30 distinct new patterns, got ' + newPatterns.size);

// every pattern on a card has a word-order type
TD.DAYS.filter(d => d.d < 30).forEach(d => {
  ok(TD.typesOf(d.a.p).length > 0, `day ${d.d} Satz A type: ${d.a.p}`);
  ok(TD.typesOf(d.b.p).length > 0, `day ${d.d} Satz B type: ${d.b.p}`);
});

// each review pattern was introduced on an earlier day
TD.DAYS.filter(d => d.b.tag === 'review').forEach(d => {
  const base = d.b.p === 'Normalerweise …' ? 'Normalerweise mache ich …' : d.b.p.replace('(nicht) ', '');
  const first = TD.DAYS.find(x => x.a.p === base || (x.d === 1 && x.b.p === base));
  ok(first && first.d < d.d, `day ${d.d} review "${d.b.p}" introduced earlier`);
});

// ten Wortverbindungen, each exactly twice: once as 1st, once later as 2nd
const wv = {};
TD.DAYS.forEach(d => { if (d.wv) (wv[d.wv.p] = wv[d.wv.p] || []).push(d); });
ok(Object.keys(wv).length === 10, '10 Wortverbindungen');
for (const [p, ds] of Object.entries(wv)) {
  ok(ds.length === 2 && ds[0].wv.n === 1 && ds[1].wv.n === 2 && ds[0].d < ds[1].d, `"${p}" introduced once, repeated later`);
  ok(!!TD.WV[p], `"${p}" has a Dativ rule`);
  ds.forEach(d => ok(d.wv.ex.toLowerCase().includes(p.toLowerCase()), `day ${d.d} example contains "${p}"`));
}

// model sentence contains the fixed start of its pattern (sanity check against copy errors)
TD.DAYS.filter(d => d.d < 30).forEach(d => {
  for (const s of [d.a, d.b]) {
    const head = s.p.split(/[ ,…(]/).filter(Boolean)[0];
    ok(s.ex.toLowerCase().includes(head.toLowerCase()), `day ${d.d} "${s.p}" example contains "${head}"`);
  }
});

console.log(fails ? `${fails} failure(s)` : 'data: all checks passed');
process.exit(fails ? 1 : 0);
