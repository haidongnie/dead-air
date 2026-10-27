import './style.css';
import { sound } from './core/audio';
import { loadModels, setAnisotropy } from './core/assets';
import { Game } from './game/game';
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
$('lang').onclick = () => { setLang(lang === 'zh' ? 'en' : 'zh'); applyText(); };

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

// The Playroom lobby can be skipped back into from an invite link (#r=...).
if (location.hash.includes('r=')) $('invite-hint').classList.remove('hidden');

// dev-only handle for inspecting the scene from the console
if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
