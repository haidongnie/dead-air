# DEAD AIR · 死寂频率

**Don't trust familiar faces. 别相信熟悉的脸。**

▶ **Play: https://haidongnie.github.io/dead-air/** (desktop browser, headphones recommended · 电脑浏览器，建议戴耳机)

A 2–4 player co-op horror escape game that runs in the browser. Three.js rendering, Playroom Kit multiplayer, WebRTC proximity voice, and every model generated with the Meshy API (`meshy-t2.5` smart topology).

浏览器里的 2–4 人合作恐怖解谜逃脱游戏。Three.js 渲染、Playroom Kit 联机、WebRTC 近距离语音，所有 3D 模型由 Meshy API（`meshy-t2.5` 智能拓扑）生成。

## The story · 剧情

October 31, 1983, Millbrook, Ohio. At 11:35 PM every TV in town cuts to an emergency broadcast: *DO NOT TRUST FAMILIAR FACES.* The signal comes from the Whitlock farm, where radio preacher Elias Whitlock and his family vanished during a live sermon in 1959. You and your friends run a pirate radio show and followed the signal there. The door locks behind you. Shut the transmitter down before midnight.

Something in the house wears your friends' faces.

1983 年万圣节夜，俄亥俄州米尔布鲁克。全镇电视切进紧急广播：「不要相信熟悉的脸」。信号来自 1959 年电台牧师一家在直播中失踪的怀特洛克农舍。你们循着信号进门，门锁上了。午夜前关掉发射机——而屋子里有个东西，会变成你队友的样子。

## How to play · 玩法

| | |
|---|---|
| WASD / Shift | Move / run · 移动 / 奔跑 |
| Mouse | Look (click the screen to capture the mouse) · 环顾 |
| E | Interact; hold for valves and reviving · 互动；按住转阀门、救队友 |
| F | Flashlight on/off · 手电筒 |
| Right mouse | Focus beam: hold it on the monster to drive it off (limited charge) · 聚光驱魔 |
| M | Mute mic · 静音 |

**Objectives 目标链**: find 3 fuses → throw the switch → tune the parlor radio to the frequency written in the study → the radio reads the 4-digit safe code → safe holds the basement key and the music box → **two players turn the two basement valves at the same time** → the grandfather clock opens → place the music box, doll and pocket watch on the altar → run out the front door.

**The mimic 拟态怪**: after the power comes back, the monster walks the house disguised as one of your teammates: same character, same name tag. Tells: it carries no light, makes no footsteps, walks a little too slowly, and its eyes catch your flashlight. With proximity voice on, it can replay what your friends said earlier, locally on your device. If it gets close it reveals its true form (a preacher with a 1950s radio for a head) and lunges. Caught players go down; a teammate holds E to pull them up. Solo players crawl back to the hall after a few seconds.

断电恢复后，怪物会伪装成你的某个队友（同样的模型和名字）在屋里走动。识别方法：它不拿手电、没有脚步声、走路略慢、眼睛会反光。开启语音时，它还会在你本地回放队友说过的话。靠近后它会现出原形扑过来，用右键聚光照住它可以驱散。

Share the room link (the "Copy invite link" button, or the URL with `#r=...`) with friends to play together.

## TikTok LIVE gifts · 直播打赏互动（TikFinity）

Viewers' gifts make the streamer's pocket radio squawk, and the ghost comes for the noise. 观众在 TikTok 直播间打赏，主播身上的收音机就会响，把鬼引过去。

| Gift (diamonds per gift event) | Effect |
|---|---|
| 1–9 💎 (e.g. Rose) | A noise at the streamer. The ghost walks toward it and returns from hiding sooner. 发出声响，鬼循声而来 |
| 10–99 💎 | The ghost hunts the streamer for 15 s, a little faster. 鬼追猎主播 15 秒 |
| 100+ 💎 | Its true form appears near the streamer (never in plain sight) and hunts for 20 s; lights flicker. 在主播附近召唤真身 |

- Combos stack: a quick Rose streak is bundled, so 12 roses in a row count as 12 💎 (tier 2). 连击会合并计算。
- Cooldowns (3 s / 10 s / 30 s per tier) keep a gift storm from making the round unwinnable. A gift during a cooldown drops to a lower tier; it always makes a sound and shows its toast. 有冷却，刷礼物不会让游戏无法通关。
- Big gifts get an on-air dedication ("This one goes out to …") read by the thing in the radio.
- Before the lights are on, a 10+ 💎 gift can summon the ghost early for a short visit.

**Setup for the streamer 主播设置**

1. Install and open the **TikFinity Desktop App** (Windows only; the web version has no local Event API) and start your LIVE. 安装并打开 TikFinity 桌面版（仅 Windows），开始直播。
2. Open the game in **Chrome or Edge** on the same PC. Expand "TikTok LIVE gifts (TikFinity)" on the title screen and tick the box. 在同一台电脑上用 Chrome / Edge 打开游戏，展开标题页的「TikTok 直播互动」并勾选。
3. Chrome/Edge will ask whether the site may access **apps on this device**: click **Allow**. If you clicked Block: click the icon left of the address bar → Site settings → "Apps on device" → Allow, then reload. 浏览器询问「访问此设备上的应用」时点「允许」。
4. The status turns to "Receiving LIVE events ✓" after the first event arrives. Use the 1💎 / 30💎 / 500💎 test buttons to preview the effects. Only the streamer needs this; friends just join with the invite link.

Safari can't connect to a local app from an HTTPS page yet. Firefox works but may ask again after 24 h unless you tick "Remember". The address defaults to `ws://localhost:21213/` (TikFinity's documented port) and only accepts addresses on your own computer.

For development without going LIVE, `node tools/mock-tikfinity.mjs` serves the same message format (streaks, duplicates, a lost final combo event, a nested-format gift) on port 21213; add `--random 8` for a gift every 8 seconds.

## Run locally · 本地运行

```bash
npm install
npm run dev
```

## Deploy · 部署

Pushing to `main` builds and publishes to GitHub Pages through `.github/workflows/deploy.yml`.

Optional: Playroom works without a game id, but it logs a warning and may enforce limits later. Create a free project at https://dev.joinplayroom.com, then add its id under the repo's **Settings → Secrets and variables → Actions → Variables** as `PLAYROOM_GAME_ID` and re-run the workflow.

## Assets · 资源

- 3D models: generated with the Meshy API (`tools/assets.json` lists every prompt). Preview `meshy-t2.5` smart topology → PBR texture refine → auto-rigging and animation library clips for the characters. `tools/meshy-generate.mjs` regenerates them (reads `MESHY_API_KEY` from the environment; task ids are kept in `tools/meshy-state.json` so a rerun never pays twice), and `tools/optimize.mjs` converts them to WebP textures + meshopt geometry (~12 MB total).
- The monster's radio head is a separate generated prop attached to the rig's neck at runtime, with the original head bone collapsed.
- Surface textures: [Poly Haven](https://polyhaven.com) (CC0), fetched by `tools/fetch-textures.mjs`.
- All audio (EAS alert tones, rain, thunder, footsteps, screams, music box) is synthesized with WebAudio at runtime. The music box plays Brahms' Lullaby (public domain).
- Fonts: Special Elite and VT323 (SIL OFL) via Google Fonts.

## Tech notes

- Host-authoritative: the Playroom host validates every action (`src/game/host.ts`) and runs the creature AI; if the host leaves, the next host picks up from the last synced state.
- Rendering: `WebGLRenderer`, AgX tone mapping, PCF shadows from the local flashlight (with a light cookie), MSAA render target, bloom, and a custom VHS pass (chromatic aberration, tracking wobble, grain, proximity-driven static). A NaN guard pass sits before bloom because a few generated meshes shipped zero-length normals (they are also repaired on load).
- Voice: WebRTC mesh with Playroom RPC as the signaling channel, HRTF panners per player, muffled through walls and floors. STUN only, so a small share of networks (symmetric NAT) may not connect voice; the game itself still works.
