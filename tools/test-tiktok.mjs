// Regression tests for the TikFinity gift parser (src/game/tiktok.ts) and i18n substitution.
// Compiles the two modules with tsc into .test-build/, fakes the browser clock, and replays
// streak/duplicate/lost-final scenarios.  Usage: npm run test:tiktok
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, '.test-build');
execSync(`npx tsc --ignoreConfig src/game/tiktok.ts src/i18n.ts --outDir .test-build --rootDir src --target es2022 --module es2022 --moduleResolution bundler --skipLibCheck --lib es2023,dom`, { cwd: ROOT, stdio: 'inherit' });

let now = 0;
const timers = [];
globalThis.performance = { now: () => now };
globalThis.location = { hostname: 'haidongnie.github.io' };
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.navigator = { language: 'zh-CN' };
globalThis.window = { setInterval: (fn, ms) => { timers.push({ fn, ms, next: now + ms }); return timers.length; }, setTimeout: () => 0 };
const advance = (ms) => { const end = now + ms; while (now < end) { now += 50; for (const t of timers) if (now >= t.next) { t.next += t.ms; t.fn(); } } };
const { TikFinity } = await import(pathToFileURL(path.join(OUT, 'game/tiktok.js')).href);
const { t, setLang } = await import(pathToFileURL(path.join(OUT, 'i18n.js')).href);

let id = 0;
const gift = (o) => JSON.stringify({ event: 'gift', data: { userId: o.u ?? '1', uniqueId: 'v', nickname: o.nick ?? 'V', giftId: o.gift ?? 5655, giftName: 'Rose', diamondCount: o.d ?? 1, giftType: o.type ?? 1, repeatCount: o.n, repeatEnd: !!o.end, groupId: o.g ?? '0', msgId: o.msgId ?? String(++id) } });
function run(name, steps, expect) {
  const tt = new TikFinity(); const out = [];
  tt.onGift = (g) => out.push([g.count, g.diamonds]);
  for (const s of steps) typeof s === 'number' ? advance(s) : tt.handle(s);
  advance(4000);
  const ok = JSON.stringify(out) === JSON.stringify(expect);
  console.log(ok ? 'PASS' : 'FAIL', name, JSON.stringify(out), ok ? '' : 'expected ' + JSON.stringify(expect));
  return ok;
}
const combo = (n, o = {}) => Array.from({ length: n }, (_, i) => gift({ n: i + 1, ...o }));
let all = true;
all &= run('no groupId, lost end, new combo 5s later', [...combo(12), 1500, 5500, ...combo(12)], [[12, 12], [12, 12]]);
all &= run('no groupId, lost end, new combo 2s later (count drops)', [...combo(12), 2000, ...combo(5)], [[12, 12], [5, 5]]);
all &= run('groupId streak, final 40s late is not recounted', [...combo(5, { g: 'g1' }), 40000, gift({ n: 5, end: true, g: 'g1' })], [[5, 5]]);
all &= run('no groupId single taps, lost end, 6s apart', [gift({ n: 1 }), 6000, gift({ n: 1 })], [[1, 1], [1, 1]]);
all &= run('no groupId late final is a tombstone', [...combo(5), 10000, gift({ n: 5, end: true })], [[5, 5]]);
all &= run('duplicate msgId ignored', [gift({ n: 1, end: true, msgId: 'x' }), gift({ n: 1, end: true, msgId: 'x' })], [[1, 1]]);
all &= run('non-streak gifts with groupId 0 each count', [gift({ n: 1, type: 2, d: 30 }), gift({ n: 1, type: 2, d: 30 })], [[1, 30], [1, 30]]);
all &= run('two interleaved viewers', [gift({ n: 1, u: 'a' }), gift({ n: 1, u: 'b' }), gift({ n: 2, u: 'a' }), gift({ n: 2, u: 'b', end: true }), gift({ n: 3, u: 'a', end: true })], [[3, 3], [2, 2]]);
all &= run('garbage and unknown events ignored', ['not json', JSON.stringify({ event: 'like', data: {} }), JSON.stringify({ event: 'gift' })], []);
// connection status: TikFinity's own greeting must not read as "receiving LIVE events"
{
  const sockets = [];
  globalThis.WebSocket = class { constructor(url) { this.url = url; sockets.push(this); } close() {} };
  globalThis.TextDecoder = TextDecoder;
  const tt = new TikFinity();
  await tt.start('ws://localhost:21213/');
  const ws = sockets.at(-1);
  ws.onopen();
  const msg = (o) => ws.onmessage({ data: typeof o === 'string' ? o : JSON.stringify(o) });
  const steps = [];
  msg({ event: 'config', data: { v: 1 } }); steps.push([tt.state, tt.diag.config]);
  msg({ event: 'pong' }); msg({ event: 'state_update', state: {} }); steps.push([tt.state, tt.diag.unparsed]);
  msg({ event: 'liveStatusChange', data: { isLive: false } }); steps.push([tt.state]);
  msg({ event: 'chat', data: { uniqueId: 'a', comment: 'hi' } }); steps.push([tt.state, tt.diag.liveEvents]);
  const bin = new TextEncoder().encode(JSON.stringify({ event: 'gift', data: { userId: '9', giftId: 1, giftName: 'GG', giftType: 2, diamondCount: 1, repeatCount: 1, msgId: 'b1' } }));
  let got = 0; tt.onGift = () => got++;
  ws.onmessage({ data: bin.buffer }); steps.push([tt.diag.binary, got]);
  const want = [['on', true], ['on', 0], ['notlive'], ['live', 1], [1, 1]];
  const ok = JSON.stringify(steps) === JSON.stringify(want);
  all &= ok;
  console.log(ok ? 'PASS' : 'FAIL', 'status: config/pong/notlive/live/binary', JSON.stringify(steps), ok ? '' : 'expected ' + JSON.stringify(want));
  tt.stop();
}
// simulate() must not flip the state to live
{ const tt = new TikFinity(); tt.state = 'on'; tt.simulate(500); const ok = tt.state === 'on'; all &= ok; console.log(ok ? 'PASS' : 'FAIL', 'simulate keeps state', tt.state); }
// t() inserts names literally
setLang('en');
{ const s = t('giftT1', { n: "$'{g}$&", g: 'Rose', c: 5 }); const ok = s.startsWith("🎁 $'{g}$& sent Rose×5"); all &= ok; console.log(ok ? 'PASS' : 'FAIL', 't() literal names:', s); }
console.log(all ? 'ALL PASS' : 'SOME FAILED');
process.exit(all ? 0 : 1);
