// Shared game state. The host owns it and is the only writer; clients send
// actions over RPC and render whatever state arrives.

export type Relic = 'doll' | 'musicbox' | 'watch';
export const RELICS: Relic[] = ['musicbox', 'doll', 'watch'];

export interface GameState {
  round: number;          // increments on restart so clients can reset local effects
  phase: 'play' | 'won' | 'lost';
  t0: number;             // ms timestamp when the round started (host clock)
  freq: number;           // the radio frequency that carries the code (kHz)
  code: string;           // 4-digit safe code
  picked: string[];       // world pickups taken: f1 f2 f3 key musicbox doll watch
  installed: number;      // fuses in the fuse box
  power: boolean;
  radio: number;          // frequency the parlor radio is tuned to
  safe: boolean;
  basement: boolean;
  clock: boolean;
  altar: Relic[];
  exit: boolean;
  downed: Record<string, number>;
  escaped: Record<string, number>;
  docs: string[];
  end?: 'escaped' | 'midnight' | 'taken';
  endAt?: number;
}

export const ROUND_MS = 25 * 60 * 1000; // 11:35 PM -> midnight

export function newGame(round: number): GameState {
  const freqs = [550, 640, 730, 860, 970, 1080, 1170, 1240, 1350, 1460, 1570];
  return {
    round,
    phase: 'play',
    t0: Date.now(),
    freq: freqs[Math.floor(Math.random() * freqs.length)],
    code: String(Math.floor(Math.random() * 9000) + 1000),
    picked: [],
    installed: 0,
    power: false,
    radio: 1010,
    safe: false,
    basement: false,
    clock: false,
    altar: [],
    exit: false,
    downed: {},
    escaped: {},
    docs: [],
  };
}

/** The main story as a guided task list: one step at a time, always in this order. */
export const STEPS = ['power', 'radio', 'safe', 'basement', 'valves', 'relics', 'escape'] as const;
export type Objective = (typeof STEPS)[number];

export function objective(g: GameState): Objective {
  if (g.exit) return 'escape';
  if (!g.power) return 'power';
  if (!g.safe) return codeKnown(g) ? 'safe' : 'radio';
  if (!g.basement) return 'basement';
  if (!g.clock) return 'valves';
  return 'relics';
}

/** The radio has read the safe code to the team. */
export function codeKnown(g: GameState) { return g.docs.includes('radio-heard'); }

/** Items the team carries (inventory is shared). */
export function teamItems(g: GameState) {
  const fuses = g.picked.filter((p) => p.startsWith('f')).length - g.installed;
  const relics = RELICS.filter((r) => g.picked.includes(r) && !g.altar.includes(r));
  const key = g.picked.includes('key') && !g.basement;
  return { fuses, relics, key };
}

export function radioTuned(g: GameState) { return g.power && Math.abs(g.radio - g.freq) <= 5; }

export interface PlayerNet {
  // compact pose for the wire: x, y, z, yaw, pitch, moveState (0 idle 1 walk 2 run), flashlight, focus
  p: [number, number, number, number, number, number, number, number];
  hold: '' | 'a' | 'b';   // which valve this player is turning
  model: number;           // character variant index
}

export interface CreatureNet {
  x: number; y: number; z: number; r: number;
  m: 0 | 1 | 2 | 3;  // hidden, disguised, revealed (hunting), banished (screaming, vanishing)
  d: string;          // player id being imitated
  s: number;          // movement speed for animation
  a: number;          // action counter, bumps on attack so clients can play the clip once
}

export type Action =
  | { k: 'pickup'; id: string }
  | { k: 'install' }
  | { k: 'lever' }
  | { k: 'tune'; f: number }
  | { k: 'safe'; code: string }
  | { k: 'unlock' }
  | { k: 'place' }
  | { k: 'revive'; target: string }
  | { k: 'escape' }
  | { k: 'doc'; id: string }
  | { k: 'heard' }
  | { k: 'answer' }
  | { k: 'gift'; n: string; g: string; c: number; d: number }
  | { k: 'restart' };

export type Fx =
  | { k: 'toast'; key: string; n?: string; r?: string }
  | { k: 'sound'; s: string; x: number; y: number; z: number; n?: number }
  | { k: 'scare'; s: string; n?: string; r?: string }
  // a TikTok LIVE gift landed: noise at (x,y,z), t = tier 1..3, lured = whether it moved the creature
  | { k: 'gift'; n: string; g: string; c: number; d: number; t: GiftTier; lured: boolean; x: number; y: number; z: number };

export type GiftTier = 1 | 2 | 3;

/** Diamonds in one gift event -> how hard it pulls the creature. */
export function giftTier(diamonds: number): GiftTier {
  return diamonds >= 100 ? 3 : diamonds >= 10 ? 2 : 1;
}
