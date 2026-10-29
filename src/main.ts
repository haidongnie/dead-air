import './style.css';
import { sound } from './core/audio';
import { loadModels, setAnisotropy } from './core/assets';
import { Game } from './game/game';
import { TikFinity, DEFAULT_URL, loopbackUrl, type GiftEvent, type TikState } from './game/tiktok';
import { giftTier } from './game/state';
import { t, lang, setLang, type Key } from './i18n';

const MODELS = [
  'altar', 'barrel', 'basement_shelf', 'bookshelf', 'coat_rack', 'crt_tv', 'desk', 'dining_chair', 'dining_table',
  'doll', 'fireplace', 'floor_lamp', 'fridge', 'front_door', 'furnace', 'fuse', 'fuse_box', 'grandfather_clock',
  'kitchen_counter', 'music_box', 'pendant_lamp', 'phone_table', 'pocket_watch', 'portrait', 'radio_head',
  'rocking_chair', 'safe', 'skeleton_key', 'sofa', 'stove', 'transmitter', 'tube_radio', 'valve',
  ...['player_a', 'player_b', 'player_c', 'player_d', 'listener2b'].flatMap((c) => [c, `${c}_walk`, `${c}_run`, `${c}_anims`]),
];

const $ = (id: string) => document.getElementById(id)!;

function applyText() {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll<HTMLElement>('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t as Key); });
  $('lang').textContent = lang === 'zh' ? 'EN' : '中文';
}
applyText();
$('lang').onclick = () => { setLang(lang === 'zh' ? 'en' : 'zh'); applyText(); renderTt(); };

const canvas = $('scene') as HTMLCanvasElement;
const game = new Game(canvas);
setAnisotropy(Math.min(8, game.renderer.renderer.capabilities.getMaxAnisotropy()));

$('invite').onclick = async () => {
  try { await navigator.clipboard.writeText(location.href); } catch { /* clipboard blocked */ }
  $('invite').textContent = t('copied');
  setTimeout(() => { $('invite').textContent = t('invite'); }, 2500);
};

$('enter').onclick = async () => {
  sound.init();
  sound.resume();
  const withMic = ($('voice-opt') as HTMLInputElement).checked;
  $('enter').setAttribute('disabled', '');
  $('title').classList.add('loading');
  const status = $('status');
  status.textContent = t('loading');
  await loadModels(MODELS, (done, total) => { status.textContent = `${t('loading')} ${Math.round((done / total) * 100)}%`; });
  game.build();
  // warm up shaders so the first frames don't hitch
  game.renderer.renderer.compile(game.scene, game.camera);
  status.textContent = t('connecting');
  $('title').classList.add('hidden');
  await game.connect();
  await game.begin(withMic);
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
  off: null, connecting: 'ttS_connecting', prompt: 'ttS_prompt', on: 'ttS_on', live: 'ttS_live', denied: 'ttS_denied', error: 'ttS_error',
};
let lastGift: GiftEvent | null = null;
function renderTt() {
  const k = STATUS_KEY[tt.state];
  const last = lastGift && t('ttLast', { n: lastGift.nick, g: lastGift.name, c: lastGift.count, d: lastGift.diamonds });
  ttStatus.textContent = [k ? t(k) : '', last].filter(Boolean).join(' · ');
  ttStatus.className = `note ${tt.state === 'on' || tt.state === 'live' ? 'on' : tt.state === 'denied' || tt.state === 'error' ? 'error' : ''}`;
  game.hud.tiktok(tt.state === 'off' ? 'off' : tt.state === 'on' || tt.state === 'live' ? 'on' : tt.state === 'connecting' || tt.state === 'prompt' ? 'connecting' : 'error');
}
tt.onState = renderTt;
tt.onGift = (g) => {
  lastGift = g;
  renderTt();
  if (game.started) game.onTikTokGift(g);
  else if (sound.ready) sound.giftNoise({ x: 0, y: 0, z: -1.5 }, giftTier(g.diamonds));
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
    tt.simulate(Number(b.dataset.test));
  };
});
renderTt();

// The Playroom lobby can be skipped back into from an invite link (#r=...).
if (location.hash.includes('r=')) $('invite-hint').classList.remove('hidden');

// dev-only handle for inspecting the scene from the console
if (import.meta.env.DEV) Object.assign(window as object, { __game: game, __tt: tt });
