// A stand-in for the TikFinity Desktop App's Event API (ws://localhost:21213/),
// for testing the game's TikTok gift handling without going LIVE.
//
// Usage:
//   node tools/mock-tikfinity.mjs            # replay the scripted test sequence once per connection
//   node tools/mock-tikfinity.mjs --random 8 # also send a random gift every 8 seconds
//   node tools/mock-tikfinity.mjs --binary   # send JSON in binary frames instead of text
//   node tools/mock-tikfinity.mjs --notlive  # TikFinity open but "Disconnected": greeting only, no LIVE events
//
// Payloads follow the flat TikTok-Live-Connector v1 shape that TikFinity sends.
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 21213);
const randomEvery = process.argv.includes('--random') ? Number(process.argv[process.argv.indexOf('--random') + 1] || 8) : 0;
const binary = process.argv.includes('--binary');
const notLive = process.argv.includes('--notlive');
const wss = new WebSocketServer({ port: PORT });
const out = (ws, text) => ws.send(binary ? Buffer.from(text) : text);
let seq = 0;

const viewer = (n) => ({
  userId: String(7000000000000000000n + BigInt(n)), uniqueId: `viewer_${n}`, nickname: ['小鬼', 'GhostFan', '夜猫子', 'Ana'][n % 4],
  profilePictureUrl: '', followRole: 0, isModerator: false, isNewGifter: false, isSubscriber: false,
});

function gift(user, { giftId, giftName, diamondCount, giftType, repeatCount, repeatEnd, groupId, msgId }) {
  return {
    event: 'gift',
    data: {
      ...user, giftId, repeatCount, repeatEnd, groupId: String(groupId ?? 0), msgId: msgId ?? String(++seq + 1e12),
      gift: { gift_id: giftId, repeat_count: repeatCount, repeat_end: repeatEnd ? 1 : 0, gift_type: giftType },
      describe: `sent ${giftName}`, giftType, diamondCount, giftName, originalName: giftName,
      giftPictureUrl: '', timestamp: Date.now(), createTime: String(Date.now()), receiverUserId: '1',
    },
  };
}

/** [delayMs, message, label] */
function script() {
  const a = viewer(1), b = viewer(2), c = viewer(3), d = viewer(4);
  const g1 = Date.now(), g2 = g1 + 1;
  const dupId = String(++seq + 1e12);
  return [
    [600, { event: 'member', data: { ...a, actionId: 1, label: '{0:user} joined' } }, 'member join (ignored)'],
    [300, { event: 'chat', data: { ...a, comment: 'hello ghost' } }, 'chat (ignored)'],
    // Rose combo x5: cumulative repeatCount, final repeatEnd
    ...[1, 2, 3, 4, 5].map((i) => [250, gift(a, { giftId: 5655, giftName: 'Rose', diamondCount: 1, giftType: 1, repeatCount: i, repeatEnd: i === 5, groupId: g1 }), `rose streak ${i}/5`]),
    // the same final event delivered twice (same msgId) must not count twice
    [400, gift(b, { giftId: 5655, giftName: 'Rose', diamondCount: 1, giftType: 1, repeatCount: 1, repeatEnd: true, groupId: g2, msgId: dupId }), 'single rose'],
    [100, gift(b, { giftId: 5655, giftName: 'Rose', diamondCount: 1, giftType: 1, repeatCount: 1, repeatEnd: true, groupId: g2, msgId: dupId }), 'duplicate msgId (ignored)'],
    // a combo whose final repeatEnd never arrives: 12 roses = 12 diamonds -> tier 2 once bundled
    ...Array.from({ length: 12 }, (_, i) => [120, gift(c, { giftId: 5655, giftName: 'Rose', diamondCount: 1, giftType: 1, repeatCount: i + 1, repeatEnd: false, groupId: g1 + 7 }), `rose streak w/o end ${i + 1}/12`]),
    [2500, gift(d, { giftId: 5827, giftName: 'Hand Heart', diamondCount: 100, giftType: 2, repeatCount: 1, repeatEnd: false, groupId: 0 }), 'Hand Heart 100 (non-streak, tier 3)'],
    [3000, gift(a, { giftId: 6267, giftName: 'Corgi', diamondCount: 299, giftType: 2, repeatCount: 1, repeatEnd: true }), 'Corgi 299 (tier 3, on cooldown -> tier 2)'],
    // newer nested shape, accepted as insurance
    [3000, { event: 'gift', data: { msgId: String(++seq + 1e12), user: { userId: '42', uniqueId: 'nested_user', nickname: 'Nested' }, giftDetails: { id: 5269, giftName: 'TikTok', diamondCount: 1, giftType: 0 }, repeatCount: 1, repeatEnd: true } }, 'nested v2-style gift'],
    [500, { event: 'like', data: { ...b, likeCount: 15, totalLikeCount: 300 } }, 'like (ignored)'],
    [300, 'not json at all', 'garbage (ignored)'],
  ];
}

wss.on('connection', (ws, req) => {
  console.log(`client connected from ${req.headers.origin ?? 'unknown origin'}`);
  let cancelled = false;
  ws.on('close', () => { cancelled = true; console.log('client disconnected'); });
  // like TikFinity: greet every client, answer pings
  out(ws, JSON.stringify({ event: 'config', data: { version: 'mock', language: 'en' } }));
  ws.on('message', (m) => { if (String(m).includes('"ping"')) out(ws, JSON.stringify({ event: 'pong' })); });
  if (notLive) {
    out(ws, JSON.stringify({ event: 'liveStatusChange', data: { isLive: false } }));
    console.log('sent: config + liveStatusChange(isLive=false); no LIVE events in --notlive mode');
    return;
  }
  (async () => {
    for (const [delay, msg, label] of script()) {
      await new Promise((r) => setTimeout(r, delay));
      if (cancelled) return;
      out(ws, typeof msg === 'string' ? msg : JSON.stringify(msg));
      console.log('sent:', label);
    }
    console.log('script done');
  })();
  if (randomEvery) {
    const timer = setInterval(() => {
      if (cancelled) return clearInterval(timer);
      const pick = [[5655, 'Rose', 1], [5827, 'Hand Heart', 100], [6064, 'GG', 1], [5760, 'Weights', 1], [7934, 'Heart Me', 1], [6267, 'Corgi', 299]][Math.floor(Math.random() * 6)];
      out(ws, JSON.stringify(gift(viewer(Math.floor(Math.random() * 4)), { giftId: pick[0], giftName: pick[1], diamondCount: pick[2], giftType: 2, repeatCount: 1, repeatEnd: true })));
      console.log('sent random:', pick[1]);
    }, randomEvery * 1000);
  }
});
console.log(`mock TikFinity listening on ws://localhost:${PORT}/${binary ? ' (binary frames)' : ''}`);
