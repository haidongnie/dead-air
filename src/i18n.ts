// UI text in Chinese and English. Diegetic documents keep their English original
// with a translation, because the house is in Ohio.
export type Lang = 'zh' | 'en';

function detect(): Lang {
  try {
    const saved = localStorage.getItem('deadair.lang');
    if (saved === 'zh' || saved === 'en') return saved;
  } catch { /* storage blocked */ }
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export let lang: Lang = detect();
export function setLang(l: Lang) {
  lang = l;
  try { localStorage.setItem('deadair.lang', l); } catch { /* storage blocked */ }
}

const S = {
  tagline: { zh: '别相信熟悉的脸', en: "Don't trust familiar faces" },
  enter: { zh: '进入怀特洛克老宅', en: 'Enter the Whitlock house' },
  players: { zh: '2–4 人合作 · 也可单人', en: '2–4 player co-op · solo works too' },
  desktop: { zh: '建议使用电脑 + 耳机游玩', en: 'Best on desktop with headphones' },
  voiceOpt: { zh: '开启近距离语音（推荐）', en: 'Enable proximity voice chat (recommended)' },
  voiceNote: {
    zh: '你的麦克风只会点对点发给队友。怪物可能会在你的设备上本地模仿队友的声音，不会上传或保存。',
    en: "Your mic goes peer-to-peer to teammates only. The monster may imitate teammates' voices locally on your device. Nothing is uploaded or saved.",
  },
  controls: {
    zh: 'WASD 移动 · Shift 奔跑 · 鼠标 环顾 · E 互动 · F 手电筒 · 右键 聚光驱魔 · M 静音麦克风',
    en: 'WASD move · Shift run · Mouse look · E interact · F flashlight · RMB focus beam · M mute mic',
  },
  story: {
    zh: '1983 年 10 月 31 日，俄亥俄州米尔布鲁克。晚上 11:35，全镇的电视同时切进了一段紧急广播。信号源是怀特洛克农舍——1959 年，电台牧师以利亚·怀特洛克在一场直播中和全家一起消失的地方。你们是办地下电台的朋友，循着信号来到这里。门在你们身后锁上了。午夜之前关掉这台发射机，否则信号会传到全美国的每一台电视。',
    en: "October 31, 1983. Millbrook, Ohio. At 11:35 PM every TV in town cut to an emergency broadcast. The signal comes from the Whitlock farm, where radio preacher Elias Whitlock and his family vanished during a live sermon in 1959. You and your friends run a pirate radio show, and you followed the signal here. The door just locked behind you. Shut the transmitter down before midnight, or the signal reaches every TV in America.",
  },
  clickToPlay: { zh: '点击画面继续', en: 'Click to continue' },
  connecting: { zh: '正在连接房间…', en: 'Connecting to room…' },
  loading: { zh: '正在载入老宅…', en: 'Loading the house…' },
  invite: { zh: '复制邀请链接', en: 'Copy invite link' },
  copied: { zh: '已复制！发给朋友一起玩', en: 'Copied! Send it to your friends' },
  room: { zh: '房间', en: 'Room' },

  // objectives
  objFuses: { zh: '恢复供电：找到保险丝并装进厨房的保险丝盒', en: 'Restore power: find the fuses for the kitchen fuse box' },
  objLever: { zh: '拉下保险丝盒的电闸', en: 'Throw the switch on the fuse box' },
  objRadio: { zh: '把客厅收音机调到以利亚的布道频率（线索在书房）', en: "Tune the parlor radio to Elias's sermon frequency (clue in the study)" },
  objSafe: { zh: '用电台报出的四位数字打开书房的保险柜', en: 'Open the study safe with the four numbers from the radio' },
  objBasement: { zh: '用钥匙打开厨房里的地下室门', en: 'Unlock the basement door in the kitchen' },
  objValves: { zh: '地下室：两人同时转动两端的阀门', en: 'Basement: two people must turn both valves at once' },
  objRelics: { zh: '把一家人的遗物放回地下室祭坛', en: "Return the family's keepsakes to the basement altar" },
  objEscape: { zh: '发射机熄灭了——从前门逃出去！', en: 'The transmitter is dead. GET OUT THE FRONT DOOR!' },
  objWaiting: { zh: '你逃出来了。等待其他人…', en: 'You made it out. Waiting for the others…' },
  objDowned: { zh: '你被抓住了……等队友来救你', en: 'It got you… wait for a teammate' },

  // prompts
  pickFuse: { zh: '拾取保险丝', en: 'Take fuse' },
  installFuses: { zh: '装入保险丝', en: 'Install fuses' },
  needFuses: { zh: '保险丝盒 · 还缺保险丝', en: 'Fuse box · fuses missing' },
  throwLever: { zh: '拉下电闸', en: 'Throw the switch' },
  powerOn: { zh: '供电已恢复', en: 'Power is on' },
  useRadio: { zh: '调节收音机', en: 'Tune the radio' },
  noPower: { zh: '没有电', en: 'No power' },
  useSafe: { zh: '输入密码', en: 'Enter code' },
  safeOpen: { zh: '保险柜已打开', en: 'Safe is open' },
  takeKey: { zh: '拿走地下室钥匙', en: 'Take basement key' },
  takeMusicBox: { zh: '拿走八音盒（露丝的遗物）', en: "Take music box (Ruth's)" },
  takeDoll: { zh: '拿走瓷娃娃（安妮的遗物）', en: "Take porcelain doll (Annie's)" },
  takeWatch: { zh: '拿走怀表（以利亚的遗物）', en: "Take pocket watch (Elias's)" },
  unlock: { zh: '用钥匙开门', en: 'Unlock with key' },
  locked: { zh: '锁住了', en: 'Locked' },
  chained: { zh: '门被铁链锁死了', en: 'The door is chained shut' },
  escape: { zh: '逃出去！', en: 'Escape!' },
  turnValve: { zh: '按住 转动阀门', en: 'Hold to turn valve' },
  placeRelics: { zh: '放上遗物', en: 'Place keepsakes' },
  altarNeed: { zh: '祭坛 · 还缺遗物', en: 'Altar · keepsakes missing' },
  read: { zh: '阅读', en: 'Read' },
  revive: { zh: '按住 拉起队友', en: 'Hold to revive' },
  answerPhone: { zh: '接电话', en: 'Answer the phone' },
  clockClosed: { zh: '钟壳锁着，里面好像有东西', en: 'The case is locked. Something is inside' },

  // radio / keypad
  radioTitle: { zh: 'WHIS 调频旋钮', en: 'WHIS tuning dial' },
  radioHelp: { zh: 'A/D 或 滚轮 调频 · Esc 离开', en: 'A/D or wheel to tune · Esc to leave' },
  keypadTitle: { zh: '保险柜 · 四位密码', en: 'Safe · four-digit code' },
  keypadHelp: { zh: '数字键输入 · Enter 确认 · Esc 离开', en: 'Type digits · Enter to try · Esc to leave' },
  close: { zh: '关闭 (Esc)', en: 'Close (Esc)' },

  // toasts
  tFuse: { zh: '{n} 找到了一根保险丝', en: '{n} found a fuse' },
  tInstalled: { zh: '{n} 装好了保险丝', en: '{n} installed the fuses' },
  tPower: { zh: '电来了。有什么东西醒了。', en: 'The power is back. Something woke up.' },
  tSafeWrong: { zh: '密码错误。屋里有东西听见了。', en: 'Wrong code. Something in the house heard that.' },
  tSafeOpen: { zh: '{n} 打开了保险柜', en: '{n} opened the safe' },
  tKey: { zh: '{n} 拿到了地下室钥匙', en: '{n} took the basement key' },
  tRelic: { zh: '{n} 拿到了 {r}', en: '{n} picked up the {r}' },
  tBasement: { zh: '地下室的门开了', en: 'The basement door is open' },
  tClock: { zh: '落地钟敲了十二下。钟壳打开了。', en: 'The grandfather clock strikes twelve. Its case swings open.' },
  tPlaced: { zh: '{n} 把 {r} 放上了祭坛', en: '{n} placed the {r} on the altar' },
  tExit: { zh: '一家人团聚了。前门的铁链断了。快跑！', en: 'The family is together again. The chains on the front door snap. RUN!' },
  tDowned: { zh: '{n} 被抓走了！', en: '{n} was taken!' },
  tRevived: { zh: '{n} 被救起来了', en: '{n} is back up' },
  tEscaped: { zh: '{n} 逃出去了', en: '{n} escaped' },
  tBanished: { zh: '{n} 用光驱散了它', en: '{n} drove it off with the light' },
  tJoin: { zh: '{n} 进入了老宅', en: '{n} entered the house' },
  tLeft: { zh: '{n} 断开了连接', en: '{n} disconnected' },
  tPhone: { zh: '{n} 接起了电话', en: '{n} answered the phone' },
  phoneSub: { zh: '[电话] "是我，{r}。我在地下室。下来。一个人下来。"', en: '[Phone] "It\'s me, {r}. I\'m in the basement. Come down. Come alone."' },
  radioSub: { zh: '[收音机] 露丝……{a}。安妮……{b}。以利亚……{c}。回家……{d}。', en: '[Radio] Ruth… {a}. Annie… {b}. Elias… {c}. Home… {d}.' },
  ttsHint: { zh: '（记下这四个数字）', en: '(Write those four numbers down)' },
  // TikTok LIVE via TikFinity
  giftT1: { zh: '🎁 {n} 送出 {g}×{c} · 收音机响了，它听见了', en: '🎁 {n} sent {g}×{c} · the radio squawks — it heard that' },
  giftT2: { zh: '🔔 {n} 送出 {g}×{c} · 它在追猎主播！', en: '🔔 {n} sent {g}×{c} · it is hunting the streamer!' },
  giftT3: { zh: '👁 {n} 送出 {g}×{c} · 召唤了它的真身！', en: '👁 {n} sent {g}×{c} · summoned its true form!' },
  giftQuiet: { zh: '🎁 {n} 送出 {g}×{c}', en: '🎁 {n} sent {g}×{c}' },
  ttTitle: { zh: 'TikTok 直播互动（TikFinity）', en: 'TikTok LIVE gifts (TikFinity)' },
  ttEnable: { zh: '连接 TikFinity：观众打赏会发出声音，把鬼引向主播', en: 'Connect TikFinity: viewer gifts make noise that lures the ghost to the streamer' },
  ttUrl: { zh: 'WebSocket 地址', en: 'WebSocket URL' },
  ttTiers: {
    zh: '1–9💎：发出声响，鬼循声而来 · 10–99💎：鬼追猎主播 15 秒 · 100💎+：在主播附近召唤真身',
    en: '1–9💎: a noise the ghost follows · 10–99💎: it hunts the streamer for 15s · 100💎+: summons its true form nearby',
  },
  ttHelp: {
    zh: '需要在电脑上运行 TikFinity 桌面版并开启直播。只有主播本人需要开启此项。',
    en: 'Run the TikFinity desktop app with your LIVE started. Only the streamer needs this on.',
  },
  ttTest: { zh: '测试', en: 'Test' },
  ttS_connecting: { zh: '正在连接 TikFinity…（请确认 TikFinity 桌面版正在运行）', en: 'Connecting to TikFinity… (make sure the TikFinity desktop app is running)' },
  ttS_prompt: { zh: '浏览器会询问是否允许访问「此设备上的应用」——请点「允许」', en: 'Your browser will ask to access "apps on this device" — click Allow' },
  ttS_on: { zh: '已连接 TikFinity · 等待直播事件', en: 'Connected to TikFinity · waiting for LIVE events' },
  ttS_live: { zh: '正在接收直播事件 ✓', en: 'Receiving LIVE events ✓' },
  ttS_denied: {
    zh: '浏览器拒绝了访问。点击地址栏左侧的图标 → 网站设置 →「此设备上的应用」→ 允许，然后刷新页面。',
    en: 'The browser blocked access. Click the icon left of the address bar → Site settings → "Apps on device" → Allow, then reload.',
  },
  ttS_error: {
    zh: '连接不上，正在重试…请确认 TikFinity 桌面版（Windows）已打开。Safari 暂不支持，请用 Chrome / Edge。',
    en: 'Cannot connect, retrying… Is the TikFinity desktop app (Windows) open? Safari is not supported yet; use Chrome or Edge.',
  },
  ttLast: { zh: '最近礼物：{n} · {g}×{c}（{d}💎）', en: 'Last gift: {n} · {g}×{c} ({d}💎)' },
  ttOff: { zh: 'TikTok 未连接', en: 'TikTok off' },
  ttConnecting: { zh: 'TikTok 连接中…', en: 'TikTok connecting…' },
  ttOn: { zh: 'TikTok 已连接', en: 'TikTok connected' },
  ttError: { zh: 'TikTok 连接失败 · 正在重试', en: 'TikTok connection failed · retrying' },
  tSolo: { zh: '只有你一个人……阀门会自己转动另一半。', en: 'Only you… the other valve turns on its own.' },
  doll: { zh: '瓷娃娃', en: 'doll' },
  musicbox: { zh: '八音盒', en: 'music box' },
  watch: { zh: '怀表', en: 'pocket watch' },

  // HUD
  team: { zh: '队伍', en: 'Team' },
  items: { zh: '物品', en: 'Items' },
  fuseItem: { zh: '保险丝', en: 'Fuse' },
  keyItem: { zh: '地下室钥匙', en: 'Basement key' },
  beam: { zh: '聚光', en: 'Beam' },
  stamina: { zh: '体力', en: 'Stamina' },
  you: { zh: '你', en: 'you' },
  micOn: { zh: '麦克风 开', en: 'Mic on' },
  micOff: { zh: '麦克风 关', en: 'Mic muted' },
  noMic: { zh: '无语音', en: 'No voice' },
  lockHint: { zh: '点击画面以控制视角', en: 'Click to look around' },

  // endings
  winTitle: { zh: '信号中断', en: 'SIGNAL LOST' },
  winText: {
    zh: '凌晨 12:01，全镇的电视恢复了雪花屏。你们站在门廊上，没有人回头看。只是……你确定站在你身边的，真的是你的朋友吗？',
    en: 'At 12:01 AM every TV in Millbrook fell back to snow. You stand on the porch and nobody looks back. But… are you sure the one standing next to you is really your friend?',
  },
  loseTitle: { zh: '死寂', en: 'DEAD AIR' },
  loseMidnight: {
    zh: '午夜到了。广播传遍了全美国的每一台电视。屏幕上出现的是你们的脸。',
    en: 'Midnight. The broadcast reached every TV in America. The faces on the screens were yours.',
  },
  loseTaken: {
    zh: '你们全被带走了。明天晚上，会有人在电台里听见你们的声音。',
    en: 'All of you were taken. Tomorrow night, someone will hear your voices on the radio.',
  },
  escapedCount: { zh: '逃出：{a} / {b}', en: 'Escaped: {a} / {b}' },
  timeLeft: { zh: '用时 {t}', en: 'Time {t}' },
  again: { zh: '再来一局', en: 'Play again' },
  waitHost: { zh: '等待房主重新开始…', en: 'Waiting for the host to restart…' },
} as const;

export type Key = keyof typeof S;
export function t(key: Key, vars?: Record<string, string | number>): string {
  // One pass with a function replacer: values (viewer nicknames, gift names) are inserted
  // literally, so "$&" or "{g}" inside a name can't rewrite the template.
  const s: string = S[key][lang];
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

// ---------------------------------------------------------------------------
// In-world documents. {freq} and similar are filled from the game state.
export interface Doc { title: string; en: string; zh: string; }
export const DOCS: Record<string, Doc> = {
  newspaper: {
    title: 'The Millbrook Courier — Nov. 2, 1959',
    en: `RADIO PREACHER, FAMILY VANISH DURING LIVE BROADCAST

Listeners of WHIS's "Sunday Hour of the Word" heard Rev. Elias Whitlock stop mid-sermon on Halloween night. For eleven minutes the station carried only dead air. Then, witnesses say, the Reverend's voice returned and calmly read a list of numbers.

When deputies reached the Whitlock farm at dawn, the radio in the parlor was still warm. Elias, his wife Ruth, and their daughter Annie were never found.

Neighbors report that the family's car was seen in town the following week. "It was them," said one. "But they didn't wave back."`,
    zh: `电台牧师一家在直播中失踪

收听 WHIS「圣言主日时间」的听众在万圣节夜里听到以利亚·怀特洛克牧师的布道突然中断。整整十一分钟，电台只播出一片死寂。之后，据目击者说，牧师的声音回来了，平静地念出一串数字。

警员在黎明赶到怀特洛克农场时，客厅的收音机还是温的。以利亚、他的妻子露丝和女儿安妮再也没有被找到。

邻居说，下一周有人在镇上看见了这家人的车。"就是他们，"一位邻居说，"可他们没有朝我挥手。"`,
  },
  sermon: {
    title: 'Sermon schedule, desk drawer',
    en: `SUNDAY HOUR OF THE WORD
Broadcast on WHIS — {freq} kc

Oct. 31 — "The Voice That Calls You Home"

Note to self: the static has a rhythm now. If I hold the dial at {freq} after sign-off, it answers. It knows our names. It asked for the combination to the safe and I read it aloud. Lord forgive me, I read it aloud every night.`,
    zh: `圣言主日时间
WHIS 电台播出 —— {freq} 千周

10 月 31 日 ——《唤你回家的声音》

自记：雪花噪声现在有了节奏。如果停播后我把旋钮停在 {freq}，它就会回应。它知道我们的名字。它问我要保险柜的密码，我念了出来。主啊宽恕我，我每晚都把它念出来。`,
  },
  ruth: {
    title: "Ruth's note, kitchen table",
    en: `Elias brought something home inside that radio.

It speaks with our voices now. Last night Annie said Daddy came to tuck her in twice. The second one didn't carry a candle. It just stood in the dark and smiled.

If someone you love comes to you without a light, don't answer them. Don't let them get close. Shine the lamp in their eyes and watch.`,
    zh: `以利亚从那台收音机里带回了什么东西。

它现在会用我们的声音说话。昨晚安妮说爸爸来给她盖了两次被子。第二个没有拿蜡烛。它只是站在黑暗里笑。

如果你爱的人不拿灯就朝你走来，不要回应。不要让它靠近。用灯照它的眼睛，然后看着。`,
  },
  journal: {
    title: "Elias's last page, inside the safe",
    en: `I opened a door with my voice and something walked through wearing my face.

It cannot hold a family that is whole. Put us back together where the signal begins: Ruth's music box, Annie's doll, my watch. Lay them on the altar beneath the house.

The watch is locked in the clock. The clock only opens when the old pipes are turned together. One man cannot do it alone. That was always the point.`,
    zh: `我用我的声音打开了一扇门，有东西戴着我的脸走了进来。

它困不住一个完整的家。在信号开始的地方让我们团聚：露丝的八音盒、安妮的娃娃、我的怀表。把它们放在房子下面的祭坛上。

怀表锁在落地钟里。只有同时转动那两根老水管的阀门，钟才会打开。一个人做不到。这本来就是用意所在。`,
  },
  log: {
    title: 'Transmitter log, basement',
    en: `WHIS AUX TRANSMITTER — 50 kW — DO NOT POWER WITHOUT AUTHORIZATION

10/31/59  23:48  carrier up
10/31/59  23:51  signal returning on its own
10/31/59  23:59  it is counting us
11/01/59  00:00  ████████████████`,
    zh: `WHIS 辅助发射机 —— 50 千瓦 —— 未经授权禁止通电

59/10/31  23:48  载波开启
59/10/31  23:51  信号在自己往回传
59/10/31  23:59  它在数我们
59/11/01  00:00  ████████████████`,
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
export const EAS_ZH = '紧急警报系统 · 民政当局对俄亥俄州米尔布鲁克县发布警告：不要相信熟悉的脸。如果他们叫你的名字，不要回应。不拿灯的亲人，不是你的亲人。待在室内。这不是演习。';
