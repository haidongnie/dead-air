import './style.css';
import { sound } from './core/audio';
import { loadModels, setAnisotropy } from './core/assets';
import { Game } from './game/game';
import { TikFinity, DEFAULT_URL, loopbackUrl, type GiftEvent, type TikState } from './game/tiktok';
import { giftTier, isRescueGift } from './game/state';
import { t, type Key } from './i18n';

const MODELS = [
  'altar', 'barrel', 'basement_shelf', 'bookshelf', 'coat_rack', 'crt_tv', 'desk', 'dining_chair', 'dining_table',
  'doll', 'fireplace', 'floor_lamp', 'fridge', 'front_door', 'furnace', 'fuse', 'fuse_box', 'grandfather_clock',
  'kitchen_counter', 'music_box', 'pendant_lamp', 'phone_table', 'pocket_watch', 'portrait', 'radio_head',
  'rocking_chair', 'safe', 'skeleton_key', 'sofa', 'stove', 'transmitter', 'tube_radio', 'valve',
  ...['player_a', 'player_b', 'player_c', 'player_d', 'listener2b'].flatMap((c) => [c, `${c}_walk`, `${c}_run`, `${c}_anims`]),
];

const $ = (id: string) => document.getElementById(id)!;

function applyText() {
  document.querySelectorAll<HTMLElement>('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t as Key); });
  document.querySelectorAll<HTMLInputElement>('[data-ph]').forEach((el) => { el.placeholder = t(el.dataset.ph as Key); });
}
applyText();

const canvas = $('scene') as HTMLCanvasElement;
const game = new Game(canvas);
setAnisotropy(Math.min(8, game.renderer.renderer.capabilities.getMaxAnisotropy()));

$('invite').onclick = async () => {
  try { await navigator.clipboard.writeText(game.net.roomCode ?? ''); } catch { /* clipboard blocked */ }
  $('invite').textContent = t('copied');
  setTimeout(() => { $('invite').textContent = t('invite'); }, 2500);
};

// ---------------------------------------------------------------------------
// Lobby: create a room (Playroom picks a 4-character code) or type a friend's code.

/** Playroom room codes: 4 characters from 1-9 and A-Z without O (see its room id generator). */
const CODE = /^[1-9A-NP-Z]{4}$/;

/** Accepts "ABCD", "abcd", "RABCD" (the URL hash form) or a pasted invite link; '' if it has no code. */
function normalizeCode(input: string): string {
  let s = input.trim();
  const m = s.match(/#r=([A-Za-z0-9_]+)/);
  if (m) s = m[1];
  else if (s.includes('://')) return ''; // a link without a room in it
  s = s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length === 5 && s.startsWith('R')) s = s.slice(1);
  return s;
}

function setStatus(key: Key | null, vars?: Record<string, string | number>) {
  $('status').textContent = key ? t(key, vars) : '';
}

const nameInput = $('player-name') as HTMLInputElement;
const roomInput = $('room-input') as HTMLInputElement;
try { nameInput.value = localStorage.getItem('deadair.name') ?? ''; } catch { /* storage blocked */ }

// an invite link (#r=RABCD) pre-fills the code
const invited = location.hash.includes('r=') ? normalizeCode(location.hash) : '';
if (invited) {
  roomInput.value = invited;
  $('join').classList.add('primary');
  $('invite-hint').textContent = t('inviteFor', { code: invited });
  $('invite-hint').classList.remove('hidden');
}
roomInput.addEventListener('input', () => {
  // a pasted invite link turns into its code right away
  const v = roomInput.value;
  roomInput.value = /#r=|:\/\//.test(v) ? normalizeCode(v) : v.toUpperCase();
  $('join').classList.toggle('primary', !!roomInput.value);
});
roomInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('join').click(); });

let entering = false;
let built = false;
function lobbyBusy(busy: boolean) {
  entering = busy;
  for (const id of ['create', 'join']) $(id).toggleAttribute('disabled', busy);
}

async function enter(roomCode?: string) {
  if (entering) return;
  lobbyBusy(true);
  sound.init();
  sound.resume();
  const withMic = ($('voice-opt') as HTMLInputElement).checked;
  const name = nameInput.value.trim().slice(0, 16);
  try { localStorage.setItem('deadair.name', name); } catch { /* storage blocked */ }
  if (!built) {
    setStatus('loading');
    await loadModels(MODELS, (done, total) => { $('status').textContent = `${t('loading')} ${Math.round((done / total) * 100)}%`; });
    game.build();
    // warm up shaders so the first frames don't hitch
    game.renderer.renderer.compile(game.scene, game.camera);
    built = true;
  }
  setStatus('connecting');
  // Playroom takes the room from the URL first. Joining writes the chosen code there, so a
  // reload (Playroom reloads by itself after repeated connection failures) keeps the invite;
  // creating clears it, and Playroom writes the new room's code once connected.
  history.replaceState(null, '', location.pathname + location.search + (roomCode ? `#r=R${roomCode}` : ''));
  try {
    await game.connect({ roomCode, name });
  } catch (e) {
    // Playroom resets itself when insertCoin fails, so the player can simply try again
    const msg = (e as Error)?.message ?? String(e);
    if (msg === 'ROOM_LIMIT_EXCEEDED') setStatus('roomFull', { code: roomCode ?? '' });
    else setStatus('connectFail', { e: msg });
    lobbyBusy(false);
    return;
  }
  setStatus(null);
  $('title').classList.add('hidden');
  await game.begin(withMic);
  // Joined a code nobody is in: most likely a typo. Checked after the intro, which covers the
  // screen, so the warning is actually seen (and the player list has long since synced).
  if (roomCode && game.net.players.size <= 1) game.hud.subtitle(t('roomEmpty', { code: roomCode }), 9);
}

$('create').onclick = () => enter();
$('join').onclick = () => {
  const code = normalizeCode(roomInput.value);
  if (!CODE.test(code)) {
    setStatus('codeInvalid');
    roomInput.focus();
    return;
  }
  roomInput.value = code;
  enter(code);
};

// ---------------------------------------------------------------------------
// TikTok LIVE gifts through TikFinity (only the streamer turns this on)

const tt = new TikFinity();
const ttEnable = $('tt-enable') as HTMLInputElement;
const ttUrl = $('tt-url') as HTMLInputElement;
const ttStatus = $('tt-status');

interface TtSettings { on: boolean; url: string }
function loadTt(): TtSettings {
  try {
    const s = JSON.parse(localStorage.getItem('deadair.tt') ?? '{}');
    return { on: !!s.on, url: typeof s.url === 'string' && s.url ? s.url : DEFAULT_URL };
  } catch { return { on: false, url: DEFAULT_URL }; }
}
function saveTt() {
  try { localStorage.setItem('deadair.tt', JSON.stringify({ on: ttEnable.checked, url: ttUrl.value })); } catch { /* storage blocked */ }
}

const STATUS_KEY: Record<TikState, Key | null> = {
  off: null, connecting: 'ttS_connecting', prompt: 'ttS_prompt', on: 'ttS_on', live: 'ttS_live', notlive: 'ttS_notlive',
  denied: 'ttS_denied', error: 'ttS_error',
};
let openedAt = 0;
let lastGift: GiftEvent | null = null;
function renderTt() {
  let k = STATUS_KEY[tt.state];
  if (tt.state === 'on' && tt.diag.config) k = 'ttS_config';
  // socket open for a while but nothing from the stream: almost always TikFinity showing "Disconnected"
  const quiet = tt.state === 'on' && openedAt && Date.now() - openedAt > 20000;
  const last = lastGift && t(game.started ? 'ttLast' : 'ttLastIdle', { n: lastGift.nick, g: lastGift.name, c: lastGift.count, d: lastGift.diamonds });
  ttStatus.textContent = [k ? t(k) : '', quiet ? t('ttS_quiet') : '', last].filter(Boolean).join(' · ');
  ttStatus.className = `note ${tt.state === 'live' || (tt.state === 'on' && !quiet) ? 'on' : tt.state === 'on' ? '' : tt.state === 'off' ? '' : 'error'}`;
  $('tt-platform').classList.toggle('hidden', onWindows || tt.state === 'off');
  $('tt-diag-text').textContent = diagText();
  game.setTikTokReady(tt.state === 'live' || (tt.state === 'on' && !quiet));
  const d = tt.diag;
  game.hud.tiktok(
    tt.state === 'off' ? 'off' : tt.state === 'live' ? 'on' : tt.state === 'on' || tt.state === 'connecting' || tt.state === 'prompt' ? 'connecting' : 'error',
    tt.state === 'off' ? '' : `${d.liveEvents} / ${d.gifts}🎁`,
  );
}
tt.onState = (st) => {
  if (st === 'on') openedAt = Date.now();
  renderTt();
};
// re-check the "quiet for 20 s" hint while connected
setInterval(() => { if (tt.state === 'on') renderTt(); }, 5000);

// TikFinity desktop only runs on Windows, and the game must open on that same PC.
const ua = navigator as Navigator & { userAgentData?: { platform?: string } };
const onWindows = /win/i.test(ua.userAgentData?.platform || navigator.platform || navigator.userAgent);

/** Plain-text report of what the TikFinity connection has seen, for the panel and for bug reports. */
function diagText(): string {
  const d = tt.diag;
  const ago = d.lastAt ? `${Math.round((Date.now() - d.lastAt) / 1000)}s ago` : 'never';
  const events = Object.entries(d.events).map(([k, v]) => `${k} ${v}`).join(', ') || 'none';
  return [
    `DEAD AIR · TikFinity diagnostics`,
    `page: ${location.origin}${location.pathname}`,
    `browser: ${navigator.userAgent}`,
    `windows: ${onWindows ? 'yes' : 'NO'} · state: ${tt.state} · loopback permission: ${tt.permission}`,
    `address: ${d.url || '-'} · opened: ${d.opens}x of ${d.attempts} attempts${d.openedUrl ? ` (last ok: ${d.openedUrl})` : ''}`,
    `last disconnect: ${d.lastClose || '-'}`,
    `tikfinity greeting (config): ${d.config ? 'yes' : 'no'} · live events: ${d.liveEvents}`,
    `frames: ${d.frames} (binary ${d.binary}, unparsed ${d.unparsed}) · last frame: ${ago}`,
    `events: ${events}`,
    `gifts to game: ${d.gifts} · in game: ${game.started ? 'yes' : 'no (title screen)'}`,
    `recent:`,
    ...(d.recent.length ? d.recent.map((r) => `  ${r}`) : ['  (nothing received yet)']),
  ].join('\n');
}
let diagT = 0;
tt.onDiag = () => {
  // a busy LIVE sends many likes per second: redraw at most a few times a second
  if (diagT) return;
  diagT = window.setTimeout(() => { diagT = 0; renderTt(); }, 250);
};
$('tt-copy').onclick = async () => {
  try { await navigator.clipboard.writeText(diagText()); } catch { /* clipboard blocked */ }
  $('tt-copy').textContent = t('ttCopied');
  setTimeout(() => { $('tt-copy').textContent = t('ttCopy'); }, 2000);
};
tt.onGift = (g) => {
  lastGift = g;
  renderTt();
  if (game.started) game.onTikTokGift(g);
  else if (sound.ready) {
    if (isRescueGift(g.giftId, g.name)) sound.heartChime({ x: 0, y: 0, z: -1.5 }, false);
    else sound.giftNoise({ x: 0, y: 0, z: -1.5 }, giftTier(g.diamonds));
  }
};

const saved = loadTt();
ttUrl.value = saved.url;
ttEnable.checked = saved.on;
if (saved.on) {
  ($('tt-panel') as HTMLDetailsElement).open = true;
  tt.start(saved.url);
}
ttEnable.onchange = () => {
  saveTt();
  if (ttEnable.checked) tt.start(ttUrl.value); else tt.stop();
};
ttUrl.onchange = () => {
  if (!loopbackUrl(ttUrl.value)) ttUrl.value = DEFAULT_URL;
  saveTt();
  if (ttEnable.checked) tt.start(ttUrl.value);
};
document.querySelectorAll<HTMLButtonElement>('[data-test]').forEach((b) => {
  b.onclick = () => {
    sound.init();
    sound.resume();
    tt.simulate(b.dataset.test === 'heart' ? 'heart' : Number(b.dataset.test));
  };
});
renderTt();


// dev-only handle for inspecting the scene from the console
if (import.meta.env.DEV) {
  Promise.all([import('./world/layout'), import('./world/nav')]).then(([layout, nav]) => {
    Object.assign(window as object, { __game: game, __tt: tt, __layout: layout, __nav: nav });
  });
}
