// All UI text. The game ships in English only; keeping the strings in one table keeps
// wording consistent and makes variable substitution safe.

const S = {
  tagline: { en: "Don't trust familiar faces" },
  nameLabel: { en: 'Name' },
  namePh: { en: 'Your name (optional)' },
  create: { en: 'Create room' },
  or: { en: 'or enter a code' },
  codePh: { en: 'CODE' },
  join: { en: 'Join' },
  codeInvalid: {
    en: 'The room code is the 4 letters/digits shown at the top of your friend’s screen (no 0 or O)',
  },
  inviteFor: { en: 'You were invited to room {code}: press Join' },
  roomFull: { en: 'Room {code} is full (4 players max). Try another code or create your own room.' },
  roomEmpty: {
    en: 'Nobody else is in room {code} yet. If you mistyped the code, reload and enter it again; you can also play solo.',
  },
  connectFail: { en: 'Could not connect: {e}. Try again, or reload the page.' },
  players: { en: '2–4 player co-op · solo works too' },
  desktop: { en: 'Best on desktop with headphones' },
  voiceOpt: { en: 'Enable proximity voice chat (recommended)' },
  voiceNote: {
    en: "Your mic goes peer-to-peer to teammates only. The monster may imitate teammates' voices locally on your device. Nothing is uploaded or saved.",
  },
  controls: {
    en: 'WASD move · Shift run · Mouse look · E interact · F flashlight · RMB focus beam · M mute mic',
  },
  story: {
    en: "October 31, 1983. Millbrook, Ohio. At 11:35 PM every TV in town cut to an emergency broadcast. The signal comes from the Whitlock farm, where radio preacher Elias Whitlock and his family vanished during a live sermon in 1959. You and your friends run a pirate radio show, and you followed the signal here. The door just locked behind you. Shut the transmitter down before midnight, or the signal reaches every TV in America.",
  },
  clickToPlay: { en: 'Click to continue' },
  connecting: { en: 'Connecting to room…' },
  loading: { en: 'Loading the house…' },
  invite: { en: 'Copy code' },
  copied: { en: 'Copied! Send the code to your friends' },
  room: { en: 'Room code' },

  // objectives
  // guided objectives: a title and one plain instruction per step
  stepOf: { en: 'STEP {n}/{total}' },
  newObjective: { en: 'NEW OBJECTIVE' },
  obj_power: { en: 'Restore the power' },
  objd_power: { en: 'Collect the 3 fuses ({n}/3), then use the fuse box in the kitchen.' },
  objd_powerReady: { en: 'You have the fuses. Use the fuse box in the kitchen.' },
  obj_radio: { en: 'Listen to the radio' },
  objd_radio: { en: 'Use the old radio in the parlor. Something on it knows the safe code.' },
  obj_safe: { en: 'Open the safe' },
  objd_safe: { en: 'Go to the study and open the safe. The code is {code}.' },
  obj_basement: { en: 'Get into the basement' },
  objd_basementKey: { en: 'Take the basement key from the open safe.' },
  objd_basementDoor: { en: 'Unlock the basement door in the kitchen.' },
  obj_valves: { en: 'Turn the valves' },
  objd_valves: { en: 'Two of you hold E on the two basement valves at the same time.' },
  objd_valvesSolo: { en: 'Hold E on a basement valve.' },
  obj_relics: { en: 'Bring the family home' },
  objd_relics: { en: 'Take the keepsakes to the altar in the basement.' },
  obj_escape: { en: 'Get out!' },
  objd_escape: { en: 'The transmitter is dead. Run out the front door.' },
  // marker labels
  mk_fuse: { en: 'Fuse' },
  mk_fusebox: { en: 'Fuse box' },
  mk_radio: { en: 'Radio' },
  mk_safe: { en: 'Safe' },
  mk_key: { en: 'Key' },
  mk_bdoor: { en: 'Basement door' },
  mk_valve: { en: 'Valve' },
  mk_musicbox: { en: 'Music box' },
  mk_doll: { en: 'Doll' },
  mk_watch: { en: 'Pocket watch' },
  mk_altar: { en: 'Altar' },
  mk_exit: { en: 'Front door' },
  mk_down: { en: 'downstairs' },
  mk_up: { en: 'upstairs' },
  objWaiting: { en: 'You made it out. Waiting for the others…' },
  objDowned: { en: 'It got you… wait for a teammate' },

  // prompts
  pickFuse: { en: 'Take fuse' },
  installFuses: { en: 'Install fuses' },
  restorePower: { en: 'Install fuses and restore power' },
  needFuses: { en: 'Fuse box · fuses missing' },
  throwLever: { en: 'Throw the switch' },
  powerOn: { en: 'Power is on' },
  useRadio: { en: 'Turn on the radio' },
  radioPlaying: { en: 'The radio is reading numbers…' },
  noPower: { en: 'No power' },
  enterCode: { en: 'Enter code {code}' },
  safeNeedCode: { en: 'Locked. The radio in the parlor knows the code' },
  safeOpen: { en: 'Safe is open' },
  takeKey: { en: 'Take basement key' },
  takeMusicBox: { en: "Take music box (Ruth's)" },
  takeDoll: { en: "Take porcelain doll (Annie's)" },
  takeWatch: { en: "Take pocket watch (Elias's)" },
  unlock: { en: 'Unlock with key' },
  locked: { en: 'Locked' },
  chained: { en: 'The door is chained shut' },
  escape: { en: 'Escape!' },
  turnValve: { en: 'Hold to turn valve' },
  placeRelics: { en: 'Place keepsakes' },
  altarNeed: { en: 'Altar · keepsakes missing' },
  read: { en: 'Read' },
  revive: { en: 'Hold to revive' },
  answerPhone: { en: 'Answer the phone' },
  clockClosed: { en: 'The case is locked. Something is inside' },

  // documents
  close: { en: 'Close (Esc)' },

  // toasts
  tFuse: { en: '{n} found a fuse' },
  tInstalled: { en: '{n} installed the fuses' },
  tPower: { en: 'The power is back. Something woke up.' },
  tSafeWrong: { en: 'Wrong code. Something in the house heard that.' },
  tCode: { en: '{n} turned on the radio. It is reading the safe code' },
  tSafeOpen: { en: '{n} opened the safe' },
  tKey: { en: '{n} took the basement key' },
  tRelic: { en: '{n} picked up the {r}' },
  tBasement: { en: 'The basement door is open' },
  tClock: { en: 'The grandfather clock strikes twelve. Its case swings open.' },
  tPlaced: { en: '{n} placed the {r} on the altar' },
  tExit: { en: 'The family is together again. The chains on the front door snap. RUN!' },
  tDowned: { en: '{n} was taken!' },
  tRevived: { en: '{n} is back up' },
  tEscaped: { en: '{n} escaped' },
  tBanished: { en: '{n} drove it off with the light' },
  tJoin: { en: '{n} entered the house' },
  tLeft: { en: '{n} disconnected' },
  tPhone: { en: '{n} answered the phone' },
  phoneSub: { en: '[Phone] "It\'s me, {r}. I\'m in the basement. Come down. Come alone."' },
  radioSub: { en: '[Radio] Ruth… {a}. Annie… {b}. Elias… {c}. Home… {d}.' },
  ttsHint: { en: '(That is the safe code. It is in your objective now)' },
  // TikTok LIVE via TikFinity
  giftT1: { en: '🎁 {n} sent {g}×{c} · the radio squawks — it heard that' },
  giftT2: { en: '🔔 {n} sent {g}×{c} · it is hunting the streamer!' },
  giftT3: { en: '👁 {n} sent {g}×{c} · summoned its true form!' },
  giftQuiet: { en: '🎁 {n} sent {g}×{c}' },
  ttTitle: { en: 'TikTok LIVE gifts (TikFinity)' },
  ttEnable: { en: 'Connect TikFinity: viewer gifts make noise that lures the ghost to the streamer' },
  ttUrl: { en: 'WebSocket URL' },
  ttTiers: {
    en: '1–9💎: a noise the ghost follows · 10–99💎: it hunts the streamer for 15s · 100💎+: summons its true form nearby',
  },
  ttHelp: {
    en: 'Run the TikFinity desktop app with your LIVE started. Only the streamer needs this on.',
  },
  ttTest: { en: 'Test' },
  ttS_connecting: { en: 'Connecting to TikFinity… (make sure the TikFinity desktop app is running)' },
  ttS_prompt: { en: 'Your browser will ask to access "apps on this device" — click Allow' },
  ttS_on: { en: 'Socket to TikFinity open · waiting for TikFinity' },
  ttS_config: {
    en: 'Connected to TikFinity ✓ (TikFinity shows "Client connected!") · waiting for LIVE events',
  },
  ttS_quiet: {
    en: 'No LIVE events yet: does TikFinity show "Disconnected"? Go LIVE on TikTok first, then click "Connect to TikTok LIVE" in TikFinity',
  },
  ttS_notlive: {
    en: 'TikFinity reports it is not attached to a LIVE (Disconnected). Go LIVE on TikTok, then click "Connect to TikTok LIVE"',
  },
  ttS_live: { en: 'Receiving LIVE events ✓' },
  ttS_denied: {
    en: 'The browser blocked access. Click the icon left of the address bar → Site settings → "Apps on device" → Allow, then reload.',
  },
  ttS_error: {
    en: 'Cannot connect, retrying… Is the TikFinity desktop app (Windows) open? Safari is not supported yet; use Chrome or Edge.',
  },
  ttNotWindows: {
    en: '⚠️ This computer is not running Windows. The game must run on the same computer as the TikFinity desktop app: if TikFinity is on a Windows PC, open the game there in Chrome or Edge.',
  },
  ttTestNote: { en: 'Local test (does not go through TikFinity)' },
  giftIdle: { en: '🎁 {n} sent {g}×{c} (no round running, no effect)' },
  ttLastIdle: { en: 'Last gift: {n} · {g}×{c} ({d}💎, takes effect once the game starts)' },
  ttDiag: { en: 'Diagnostics (copy this when asking for help)' },
  ttCopy: { en: 'Copy diagnostics' },
  ttCopied: { en: 'Copied ✓' },
  ttLast: { en: 'Last gift: {n} · {g}×{c} ({d}💎)' },
  ttOff: { en: 'TikTok off' },
  ttConnecting: { en: 'TikTok connecting…' },
  ttOn: { en: 'TikTok connected' },
  ttError: { en: 'TikTok connection failed · retrying' },
  tSolo: { en: 'Only you… the other valve turns on its own.' },
  doll: { en: 'doll' },
  musicbox: { en: 'music box' },
  watch: { en: 'pocket watch' },

  // HUD
  team: { en: 'Team' },
  items: { en: 'Items' },
  fuseItem: { en: 'Fuse' },
  keyItem: { en: 'Basement key' },
  beam: { en: 'Beam' },
  stamina: { en: 'Stamina' },
  you: { en: 'you' },
  micOn: { en: 'Mic on' },
  micOff: { en: 'Mic muted' },
  noMic: { en: 'No voice' },
  lockHint: { en: 'Click to look around' },

  // endings
  winTitle: { en: 'SIGNAL LOST' },
  winText: {
    en: 'At 12:01 AM every TV in Millbrook fell back to snow. You stand on the porch and nobody looks back. But… are you sure the one standing next to you is really your friend?',
  },
  loseTitle: { en: 'DEAD AIR' },
  loseMidnight: {
    en: 'Midnight. The broadcast reached every TV in America. The faces on the screens were yours.',
  },
  loseTaken: {
    en: 'All of you were taken. Tomorrow night, someone will hear your voices on the radio.',
  },
  escapedCount: { en: 'Escaped: {a} / {b}' },
  timeLeft: { en: 'Time {t}' },
  again: { en: 'Play again' },
  waitHost: { en: 'Waiting for the host to restart…' },
} as const;

export type Key = keyof typeof S;
export function t(key: Key, vars?: Record<string, string | number>): string {
  // One pass with a function replacer: values (viewer nicknames, gift names) are inserted
  // literally, so "$&" or "{g}" inside a name can't rewrite the template.
  const s: string = S[key].en;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

// ---------------------------------------------------------------------------
// In-world documents. {freq} is filled from the game state.
export interface Doc { title: string; en: string; }
export const DOCS: Record<string, Doc> = {
  newspaper: {
    title: 'The Millbrook Courier — Nov. 2, 1959',
    en: `RADIO PREACHER, FAMILY VANISH DURING LIVE BROADCAST

Listeners of WHIS's "Sunday Hour of the Word" heard Rev. Elias Whitlock stop mid-sermon on Halloween night. For eleven minutes the station carried only dead air. Then, witnesses say, the Reverend's voice returned and calmly read a list of numbers.

When deputies reached the Whitlock farm at dawn, the radio in the parlor was still warm. Elias, his wife Ruth, and their daughter Annie were never found.

Neighbors report that the family's car was seen in town the following week. "It was them," said one. "But they didn't wave back."`,
  },
  sermon: {
    title: 'Sermon schedule, desk drawer',
    en: `SUNDAY HOUR OF THE WORD
Broadcast on WHIS — {freq} kc

Oct. 31 — "The Voice That Calls You Home"

Note to self: the static has a rhythm now. If I hold the dial at {freq} after sign-off, it answers. It knows our names. It asked for the combination to the safe and I read it aloud. Lord forgive me, I read it aloud every night.`,
  },
  ruth: {
    title: "Ruth's note, kitchen table",
    en: `Elias brought something home inside that radio.

It speaks with our voices now. Last night Annie said Daddy came to tuck her in twice. The second one didn't carry a candle. It just stood in the dark and smiled.

If someone you love comes to you without a light, don't answer them. Don't let them get close. Shine the lamp in their eyes and watch.`,
  },
  journal: {
    title: "Elias's last page, inside the safe",
    en: `I opened a door with my voice and something walked through wearing my face.

It cannot hold a family that is whole. Put us back together where the signal begins: Ruth's music box, Annie's doll, my watch. Lay them on the altar beneath the house.

The watch is locked in the clock. The clock only opens when the old pipes are turned together. One man cannot do it alone. That was always the point.`,
  },
  log: {
    title: 'Transmitter log, basement',
    en: `WHIS AUX TRANSMITTER — 50 kW — DO NOT POWER WITHOUT AUTHORIZATION

10/31/59  23:48  carrier up
10/31/59  23:51  signal returning on its own
10/31/59  23:59  it is counting us
11/01/59  00:00  ████████████████`,
  },
};

export const EAS_LINES = [
  'EMERGENCY ALERT SYSTEM',
  'CIVIL AUTHORITIES HAVE ISSUED A',
  'WARNING FOR MILLBROOK COUNTY, OHIO.',
  'DO NOT TRUST FAMILIAR FACES.',
  'DO NOT ANSWER IF THEY CALL YOUR NAME.',
  'A LOVED ONE WITHOUT A LIGHT',
  'IS NOT YOUR LOVED ONE.',
  'STAY INDOORS. THIS IS NOT A TEST.',
];
