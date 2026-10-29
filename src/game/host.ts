import type { PlayerState } from 'playroomkit';
import type { Net } from './net';
import {
  newGame, teamItems, giftTier, RELICS, ROUND_MS, type Action, type CreatureNet, type GameState, type GiftTier, type Relic,
} from './state';
import { NAV, groundY, lineOfSight, resolveCircle } from '../world/layout';
import { findWay, nearestWalkable, walkableCells, type P3 } from '../world/nav';
import { SPOTS } from '../world/house';

// Host-only simulation: validates actions, advances the round, and drives the
// creature. If the host leaves, Playroom promotes another player and this
// code simply starts running there from the last synced state.

interface Seen { id: string; x: number; y: number; z: number; yaw: number; pitch: number; flash: boolean; focus: boolean; down: boolean; out: boolean; }

const CATCH_DIST = 0.85;
const LUNGE_DIST = 3.4;
const SIGHT = 15;

export class Host {
  private valveT = 0;
  private brain = new Brain();
  private phoneT = -1;
  ringing = false;

  constructor(private net: Net) {
    net.onAction = (a, from) => this.handle(a, from);
  }

  /** Create the round state if nobody has yet (first host after insertCoin). */
  ensureGame() {
    if (!this.net.game()) this.net.setGame(newGame(1));
  }

  /** Took over as host mid-round: continue the creature from its last synced state. */
  adopt() {
    const g = this.net.game();
    const c = this.net.creature();
    if (g && c) this.brain.adopt(c, g);
  }

  private commit(g: GameState) { this.net.setGame(g); }

  handle(a: Action, from: PlayerState) {
    const cur = this.net.game();
    if (!cur) return;
    const g: GameState = structuredClone(cur);
    const n = this.net.name(from);
    const items = teamItems(g);
    const at = (v: { x: number; y: number; z: number }) => ({ x: v.x, y: v.y, z: v.z });

    if (g.phase !== 'play' && a.k !== 'restart') return;
    switch (a.k) {
      case 'pickup': {
        if (g.picked.includes(a.id)) return;
        if ((a.id === 'key' || a.id === 'musicbox') && !g.safe) return;
        if (a.id === 'watch' && !g.clock) return;
        g.picked.push(a.id);
        if (a.id.startsWith('f')) this.net.fx({ k: 'toast', key: 'tFuse', n });
        else if (a.id === 'key') this.net.fx({ k: 'toast', key: 'tKey', n });
        else this.net.fx({ k: 'toast', key: 'tRelic', n, r: a.id });
        if (a.id === 'doll') this.net.fx({ k: 'scare', s: 'doll' });
        break;
      }
      case 'install': {
        if (items.fuses <= 0) return;
        g.installed = Math.min(3, g.installed + items.fuses);
        this.net.fx({ k: 'toast', key: 'tInstalled', n });
        this.net.fx({ k: 'sound', s: 'click', ...at(SPOTS.fuseBox) });
        break;
      }
      case 'lever': {
        if (g.installed < 3 || g.power) return;
        g.power = true;
        this.net.fx({ k: 'sound', s: 'power', ...at(SPOTS.fuseBox) });
        this.net.fx({ k: 'toast', key: 'tPower' });
        this.brain.wake();
        break;
      }
      case 'tune': {
        if (!g.power) return;
        g.radio = Math.max(530, Math.min(1700, Math.round(a.f)));
        break;
      }
      case 'safe': {
        if (g.safe || !g.power) return;
        if (a.code === g.code) {
          g.safe = true;
          this.net.fx({ k: 'toast', key: 'tSafeOpen', n });
          this.net.fx({ k: 'sound', s: 'unlock', ...at(SPOTS.safe) });
        } else {
          this.net.fx({ k: 'sound', s: 'buzz', ...at(SPOTS.safe) });
          this.net.fx({ k: 'toast', key: 'tSafeWrong' });
          this.brain.alert(SPOTS.safe.x, 0, SPOTS.safe.z);
        }
        break;
      }
      case 'unlock': {
        if (!items.key) return;
        g.basement = true;
        this.net.fx({ k: 'sound', s: 'unlock', ...at(SPOTS.basementDoor) });
        this.net.fx({ k: 'toast', key: 'tBasement' });
        break;
      }
      case 'place': {
        const placed = items.relics as Relic[];
        if (!placed.length) return;
        for (const r of placed) {
          g.altar.push(r);
          this.net.fx({ k: 'toast', key: 'tPlaced', n, r });
        }
        if (placed.includes('musicbox')) this.net.fx({ k: 'sound', s: 'musicbox', ...at(SPOTS.altar) });
        if (RELICS.every((r) => g.altar.includes(r))) {
          g.exit = true;
          this.net.fx({ k: 'toast', key: 'tExit' });
          this.net.fx({ k: 'scare', s: 'exit' });
          this.brain.enrage();
        }
        break;
      }
      case 'revive': {
        if (!g.downed[a.target] || a.target === from.id) return;
        delete g.downed[a.target];
        this.net.fx({ k: 'toast', key: 'tRevived', n: this.net.name(a.target) });
        break;
      }
      case 'escape': {
        if (!g.exit || g.escaped[from.id] || g.downed[from.id]) return;
        g.escaped[from.id] = Date.now();
        this.net.fx({ k: 'toast', key: 'tEscaped', n });
        break;
      }
      case 'doc': {
        if (!g.docs.includes(a.id)) g.docs.push(a.id);
        break;
      }
      case 'heard': {
        if (!g.docs.includes('radio-heard')) g.docs.push('radio-heard');
        break;
      }
      case 'answer': {
        if (!this.ringing) return;
        this.ringing = false;
        const others = [...this.net.players.keys()].filter((id) => id !== from.id);
        const who = others.length ? others[Math.floor(Math.random() * others.length)] : from.id;
        this.net.fx({ k: 'scare', s: 'answered', n: from.id, r: this.net.name(who) });
        this.net.fx({ k: 'toast', key: 'tPhone', n });
        return;
      }
      case 'gift': {
        this.gift(a, from);
        return;
      }
      case 'restart': {
        if (g.phase === 'play') return;
        const fresh = newGame(g.round + 1);
        this.brain = new Brain();
        this.phoneT = -1;
        this.ringing = false;
        this.net.setCreature(this.brain.net);
        this.commit(fresh);
        return;
      }
    }
    this.commit(g);
  }

  /** Called every frame on the host. */
  update(dt: number) {
    const cur = this.net.game();
    if (!cur) return;
    const seen = this.collect(cur);
    for (const k of [1, 2, 3] as GiftTier[]) this.giftCooldown[k] = Math.max(0, this.giftCooldown[k] - dt);
    if (cur.phase === 'play') {
      this.phone(cur, dt);
      this.checkValves(cur, seen, dt);
      this.checkEnd(cur, seen, dt);
      const caught = this.brain.update(dt, cur, seen, this.net);
      if (caught) {
        const g = structuredClone(this.net.game()!);
        if (!g.downed[caught]) {
          g.downed[caught] = Date.now();
          this.commit(g);
          this.net.fx({ k: 'toast', key: 'tDowned', n: this.net.name(caught) });
          this.net.fx({ k: 'scare', s: 'caught' });
        }
      }
    }
    this.brain.publish(dt, this.net);
  }

  private collect(g: GameState): Seen[] {
    const out: Seen[] = [];
    for (const [id, p] of this.net.players) {
      const v = this.net.pose(p);
      if (!v) continue;
      out.push({
        id, x: v[0], y: v[1], z: v[2], yaw: v[3], pitch: v[4], flash: !!v[6], focus: !!v[7],
        down: !!g.downed[id], out: !!g.escaped[id],
      });
    }
    return out;
  }

  // seconds until each tier may move the creature again (noise + toast always happen)
  private giftCooldown: Record<GiftTier, number> = { 1: 0, 2: 0, 3: 0 };

  /**
   * A TikTok LIVE gift relayed by the streamer's client. The noise happens at the
   * streamer's position; bigger gifts pull the creature harder. Cooldowns keep a
   * gift storm from making the round unwinnable.
   */
  private gift(a: Extract<Action, { k: 'gift' }>, from: PlayerState) {
    const g = this.net.game();
    if (!g || g.phase !== 'play') return;
    const pose = this.net.pose(from);
    if (!pose) return;
    const name = String(a.n ?? '').slice(0, 32) || '???';
    const giftName = String(a.g ?? '').slice(0, 32);
    const count = Math.max(1, Math.min(9999, Math.floor(Number(a.c) || 1)));
    const diamonds = Math.max(0, Math.min(1e6, Math.floor(Number(a.d) || 0)));
    let tier = giftTier(diamonds);
    // a big gift during its cooldown still counts as a medium one
    while (tier > 1 && this.giftCooldown[tier] > 0) tier = (tier - 1) as GiftTier;
    // A streamer who escaped or is down can't be hunted; luring the creature to the porch
    // or to a downed body would only camp the exit or the revive. Noise and toast still play.
    const huntable = !g.escaped[from.id] && !g.downed[from.id];
    const lured = huntable && this.giftCooldown[tier] <= 0;
    if (lured) {
      this.giftCooldown[tier] = tier === 3 ? 30 : tier === 2 ? 10 : 3;
      this.brain.lure({ x: pose[0], y: pose[1], z: pose[2] }, tier, from.id, g);
      if (tier === 3) this.net.fx({ k: 'sound', s: 'power', x: pose[0], y: pose[1] + 1, z: pose[2] });
    }
    this.net.fx({ k: 'gift', n: name, g: giftName, c: count, d: diamonds, t: tier, lured, x: pose[0], y: pose[1] + 1.2, z: pose[2] });
  }

  /** About a minute after the lights come back, the hall phone rings. */
  private phone(g: GameState, dt: number) {
    if (!g.power) { this.phoneT = -1; return; }
    if (this.phoneT < 0) this.phoneT = 75;
    if (this.phoneT > 0) {
      this.phoneT -= dt;
      if (this.phoneT <= 0) { this.ringing = true; this.phoneT = 0; this.ringFor = 25; this.net.fx({ k: 'scare', s: 'phone' }); }
    } else if (this.ringing) {
      this.ringFor -= dt;
      if (this.ringFor <= 0) { this.ringing = false; this.net.fx({ k: 'scare', s: 'phone-stop' }); }
    }
  }
  private ringFor = 0;

  private checkValves(g: GameState, seen: Seen[], dt: number) {
    if (g.clock || !g.basement) { this.valveT = 0; return; }
    const holders = { a: '', b: '' };
    for (const [id, p] of this.net.players) {
      const h = p.getState('hold') as '' | 'a' | 'b';
      const s = seen.find((q) => q.id === id);
      if (!h || !s || s.down) continue;
      const spot = h === 'a' ? SPOTS.valveA : SPOTS.valveB;
      if (Math.hypot(s.x - spot.x, s.z - spot.z) < 2.2 && Math.abs(s.y - (spot.y - 1.25)) < 1) holders[h] = id;
    }
    const active = seen.filter((s) => !s.out).length;
    const together = holders.a && holders.b && holders.a !== holders.b;
    const solo = active <= 1 && (holders.a || holders.b);
    if (together || solo) {
      this.valveT += dt;
      if (this.valveT > (solo ? 3.5 : 2.5)) {
        const ng = structuredClone(g);
        ng.clock = true;
        this.commit(ng);
        this.net.fx({ k: 'sound', s: 'chime', ...SPOTS.clock, n: 12 });
        this.net.fx({ k: 'toast', key: 'tClock' });
        this.valveT = 0;
      }
    } else {
      this.valveT = Math.max(0, this.valveT - dt * 2);
    }
  }

  private soloDownT = 0;

  private checkEnd(g: GameState, seen: Seen[], dt: number) {
    const elapsed = Date.now() - g.t0;
    let end: GameState['end'] | undefined;
    if (elapsed > ROUND_MS) end = 'midnight';
    // Alone in the house there is nobody to pull you up: crawl back to the hall instead.
    if (!end && seen.length === 1 && seen[0].down) {
      this.soloDownT += dt;
      if (this.soloDownT > 7) {
        this.soloDownT = 0;
        const ng = structuredClone(g);
        delete ng.downed[seen[0].id];
        this.commit(ng);
        this.net.fx({ k: 'scare', s: 'respawn', n: seen[0].id });
      }
      return;
    }
    this.soloDownT = 0;
    const inside = seen.filter((s) => !s.out);
    const escaped = seen.length - inside.length;
    if (!end && seen.length && inside.every((s) => s.down)) end = escaped > 0 ? 'escaped' : 'taken';
    if (!end) return;
    const ng = structuredClone(g);
    ng.phase = end === 'escaped' ? 'won' : 'lost';
    ng.end = end;
    ng.endAt = Date.now();
    this.commit(ng);
  }
}

// ---------------------------------------------------------------------------
// The mimic

type Mode = 'dormant' | 'hidden' | 'roam' | 'stalk' | 'lunge' | 'banished';

class Brain {
  net: CreatureNet = { x: 0, y: -50, z: 0, r: 0, m: 0, d: '', s: 0, a: 0 };
  private mode: Mode = 'dormant';
  private timer = 0;
  private path: P3[] = [];          // waypoints from the grid planner
  private planGoal: P3 | null = null;
  private unreachable = false;
  private repath = 0;
  private target = '';
  private lostSight = 0;
  private charge = new Map<string, number>();
  private publishT = 0;
  private enraged = false;
  private alertAt: { x: number; y: number; z: number } | null = null;
  private stuckRef = { x: 0, z: 0, t: 0 };
  // gift lures
  private lureT = 0;          // seconds the creature may roam even without power
  private huntT = 0;          // seconds it locks onto the lure target
  private revealT = 0;        // seconds it shows its true form regardless of phase
  private lureTarget = '';
  private spawnNear = '';     // next spawn goes close to this player
  private spawnCap = Infinity; // caps the hidden timer for the next spawn
  private capT = 0;           // seconds that spawn boost stays in effect
  private focusT = 0;         // seconds it goes for the gifter (tier 1: no speed boost)

  wake() { if (this.mode === 'dormant') { this.mode = 'hidden'; this.timer = 6; } }
  adopt(c: CreatureNet, g: GameState) {
    this.net = { ...c };
    if (!g.power && !g.exit) { this.net.m = 0; this.net.s = 0; }
    this.enraged = g.exit;
    this.mode = !g.power ? 'dormant' : c.m === 0 || c.m === 3 ? 'hidden' : 'roam';
    this.timer = 4;
  }
  enrage() { this.enraged = true; if (this.mode === 'hidden') this.timer = Math.min(this.timer, 3); }
  /** Noise spots snap to the nearest place the creature can actually stand. */
  private noiseAt(x: number, y: number, z: number): P3 {
    return nearestWalkable({ x, y, z }) ?? { x, y, z };
  }

  alert(x: number, y: number, z: number) {
    this.alertAt = this.noiseAt(x, y, z);
    if (this.mode === 'hidden' || this.mode === 'dormant') { this.mode = 'hidden'; this.timer = 0.5; }
  }

  /** A gift made noise at `at`. Tier 1 draws it over, 2 makes it hunt, 3 summons its true form. */
  lure(at: { x: number; y: number; z: number }, tier: GiftTier, target: string, g: GameState) {
    const powered = g.power || g.exit;
    this.alertAt = this.noiseAt(at.x, at.y, at.z);
    this.repath = 0;
    this.lureTarget = target;
    if (tier === 1) {
      // a small noise: it comes for the gifter, soon, even before the lights are on (a short visit)
      this.focusT = Math.max(this.focusT, 14);
      this.spawnCap = Math.min(this.spawnCap, 6);
      this.capT = Math.max(this.capT, 10);
      if (!powered) this.lureT = Math.max(this.lureT, 14);
    } else {
      this.huntT = Math.max(this.huntT, tier === 3 ? 20 : 15);
      this.spawnCap = Math.min(this.spawnCap, tier === 3 ? 0.3 : 2);
      this.capT = Math.max(this.capT, this.huntT);
      if (tier === 3) { this.revealT = 20; this.spawnNear = target; }
      if (!powered) this.lureT = Math.max(this.lureT, tier === 3 ? 30 : 20);
    }
    if (this.mode === 'dormant') { this.mode = 'hidden'; this.timer = Math.min(this.timer || 2, 2); }
  }

  /** Returns the id of a player caught this frame, if any. */
  update(dt: number, g: GameState, seen: Seen[], net: Net): string | null {
    this.lureT = Math.max(0, this.lureT - dt);
    this.huntT = Math.max(0, this.huntT - dt);
    this.revealT = Math.max(0, this.revealT - dt);
    this.capT = Math.max(0, this.capT - dt);
    this.focusT = Math.max(0, this.focusT - dt);
    if (this.capT <= 0) {
      // the gift window is over: later banishes and catches hide it for the normal time
      this.spawnCap = Infinity;
      this.spawnNear = '';
    }
    if (!g.power && !g.exit) {
      // before the lights are on it only walks when a gift called it
      if (this.lureT <= 0) {
        this.mode = 'dormant';
        this.net.m = 0; this.net.s = 0;
        this.alertAt = null;
        this.spawnCap = Infinity; this.spawnNear = '';
        return null;
      }
    } else if (this.mode === 'dormant') this.wake();
    const live = seen.filter((s) => !s.down && !s.out);
    const c = this.net;
    // boosts don't stack: a summoned true form is as fast as the enraged finale, never faster
    const speedMul = this.enraged || this.revealT > 0 ? 1.3 : this.huntT > 0 ? 1.15 : 1;
    const trueForm = this.enraged || this.revealT > 0;

    // flashlight focus banishes it
    if (this.mode === 'roam' || this.mode === 'stalk' || this.mode === 'lunge') {
      for (const s of live) {
        if (!s.flash || !s.focus) { this.charge.set(s.id, 0); continue; }
        const ex = s.x, ey = s.y + 1.6, ez = s.z;
        const dx = c.x - ex, dy = c.y + 1.3 - ey, dz = c.z - ez;
        const dist = Math.hypot(dx, dy, dz);
        const fx = -Math.sin(s.yaw) * Math.cos(s.pitch), fy = Math.sin(s.pitch), fz = -Math.cos(s.yaw) * Math.cos(s.pitch);
        const cos = (dx * fx + dy * fy + dz * fz) / Math.max(dist, 1e-3);
        const inBeam = dist < 13 && cos > Math.cos(0.22) && Math.abs(dy) < 2 && lineOfSight(ex, ez, c.x, c.z, s.y + 1);
        const v = inBeam ? (this.charge.get(s.id) ?? 0) + dt : 0;
        this.charge.set(s.id, v);
        if (v > 0.75) {
          this.mode = 'banished';
          this.timer = 1.5;
          c.m = 3; c.s = 0;
          net.fx({ k: 'toast', key: 'tBanished', n: net.name(s.id) });
          net.fx({ k: 'sound', s: 'scream', x: c.x, y: c.y + 1.5, z: c.z });
          this.charge.clear();
          return null;
        }
      }
    }

    switch (this.mode) {
      case 'hidden': {
        c.m = 0; c.s = 0;
        if (this.timer > this.spawnCap) this.timer = this.spawnCap;
        this.timer -= dt;
        if (this.timer <= 0 && live.length) this.spawn(live, g, seen, net);
        return null;
      }
      case 'banished': {
        this.timer -= dt;
        if (this.timer <= 0) { this.mode = 'hidden'; this.timer = this.enraged ? 9 : 22 + Math.random() * 14; c.m = 0; }
        return null;
      }
      case 'roam':
      case 'stalk':
      case 'lunge': {
        if (!live.length) { this.mode = 'hidden'; this.timer = 5; return null; }
        if ((this.huntT > 0 || this.focusT > 0) && live.some((s) => s.id === this.lureTarget)) this.target = this.lureTarget;
        let tgt = live.find((s) => s.id === this.target);
        if (!tgt) { tgt = this.closest(live); this.target = tgt.id; }
        const dist = Math.hypot(tgt.x - c.x, tgt.z - c.z);
        const sameFloor = Math.abs(tgt.y - c.y) < 1.2;
        const sees = sameFloor && dist < SIGHT && lineOfSight(c.x, c.z, tgt.x, tgt.z, c.y + 1.2);

        if (this.mode === 'lunge') {
          this.timer -= dt;
          this.chase(tgt, 4.6 * speedMul, dt);
          c.m = 2;
          if (dist < CATCH_DIST && Math.abs(tgt.y - c.y) < 1) {
            c.a++;
            this.mode = 'hidden';
            this.timer = this.enraged ? 8 : 16;
            this.target = '';
            return tgt.id;
          }
          if (this.timer <= 0 || !sees) { this.mode = 'stalk'; c.m = trueForm ? 2 : 1; }
          return null;
        }

        if (sees) {
          this.lostSight = 0;
          if (this.mode !== 'stalk') this.mode = 'stalk';
          if (dist < LUNGE_DIST) { this.mode = 'lunge'; this.timer = 2.4; c.a++; return null; }
          // closer than a few meters it stops walking like a person
          this.chase(tgt, (dist < 7 ? 1.25 : 1.9) * speedMul, dt);
          c.m = trueForm ? 2 : 1;
        } else {
          this.lostSight += dt;
          if (this.mode === 'stalk' && this.lostSight > 5) this.mode = 'roam';
          // a gift hunt follows the streamer, not the spot where the noise was made
          const hunting = this.huntT > 0 && tgt.id === this.lureTarget;
          const goal = hunting || !this.alertAt ? tgt : this.alertAt;
          this.chase(goal, (this.mode === 'stalk' || hunting ? 1.9 : 1.45) * speedMul, dt);
          // investigated (or unreachable): forget the noise and go back to hunting people
          const a = this.alertAt;
          if (a && ((Math.hypot(a.x - c.x, a.z - c.z) < 1.2 && Math.abs(a.y - c.y) < 1) || (goal === a && this.unreachable))) this.alertAt = null;
          c.m = trueForm ? 2 : 1;
        }
        this.unstick(dt);
        return null;
      }
    }
    return null;
  }

  private closest(live: Seen[]) {
    const c = this.net;
    return live.reduce((best, s) => {
      const d = Math.hypot(s.x - c.x, s.z - c.z) + Math.abs(s.y - c.y) * 6;
      const bd = Math.hypot(best.x - c.x, best.z - c.z) + Math.abs(best.y - c.y) * 6;
      return d < bd ? s : best;
    });
  }

  /** Appear somewhere out of sight, wearing someone's face. */
  private spawn(live: Seen[], g: GameState, seen: Seen[], _net: Net) {
    const c = this.net;
    const summoned = live.find((s) => s.id === this.spawnNear);
    // a gift's ghost comes for the gifter; otherwise anyone
    const lured = this.huntT > 0 || this.focusT > 0 ? live.find((s) => s.id === this.lureTarget) : undefined;
    const target = summoned ?? lured ?? live[Math.floor(Math.random() * live.length)];
    // a summon may appear closer than a normal spawn, but never in plain sight
    const minDist = summoned ? 6 : 7;
    const hidden = (n: P3) => {
      for (const s of seen) {
        const d = Math.hypot(n.x - s.x, n.z - s.z);
        if (Math.abs(n.y - s.y) < 1.5 && (d < minDist || lineOfSight(n.x, n.z, s.x, s.z, s.y + 1))) return false;
      }
      return true;
    };
    let candidates: P3[] = Object.values(NAV).filter((n) => (g.basement || (n.gate !== 'basement' && n.y > -1)) && hidden(n));
    // nearest hidden spot to the target, so the encounter comes sooner rather than later
    candidates.sort((p, q) => {
      const dp = Math.hypot(p.x - target.x, p.z - target.z) + Math.abs(p.y - target.y) * 4;
      const dq = Math.hypot(q.x - target.x, q.z - target.z) + Math.abs(q.y - target.y) * 4;
      return dp - dq;
    });
    // only spots it can stand on (checked again after snapping) and walk from to the target
    const pick = (list: P3[]) => {
      const out: P3[] = [];
      for (const n of list) {
        const p = nearestWalkable(n);
        if (p && hidden(p) && findWay(p, target).length) out.push(p);
        if (out.length >= 2) break;
      }
      return out;
    };
    let usable = pick(candidates);
    if (!usable.length) {
      // a crowded house can hide every waypoint: fall back to any hidden walkable cell
      const near = (p: P3) => Math.hypot(p.x - target.x, p.z - target.z) + Math.abs(p.y - target.y) * 4;
      candidates = walkableCells().filter((p) => (g.basement || p.y > -1) && hidden(p)).sort((p, q) => near(p) - near(q));
      usable = pick(candidates.slice(0, 40));
    }
    if (!usable.length) { this.timer = 2; return; }
    const n = usable[summoned ? 0 : Math.floor(Math.random() * usable.length)];
    c.x = n.x; c.y = n.y; c.z = n.z;
    this.target = target.id;
    this.spawnNear = '';
    this.spawnCap = Infinity;
    // wear the face of someone who is NOT the target, if possible
    const others = seen.filter((s) => s.id !== target.id && !s.out);
    c.d = (others.length ? others[Math.floor(Math.random() * others.length)] : target).id;
    this.mode = 'roam';
    this.path = [];
    this.planGoal = null;
    this.repath = 0;
    this.stuckRef = { x: c.x, z: c.z, t: 0 };
    c.m = this.enraged || this.revealT > 0 ? 2 : 1;
  }

  private moveDirect(tx: number, tz: number, speed: number, dt: number) {
    const c = this.net;
    const dx = tx - c.x, dz = tz - c.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.01) return;
    const step = Math.min(d, speed * dt);
    const p = { x: c.x + (dx / d) * step, z: c.z + (dz / d) * step };
    resolveCircle(p, c.y, 0.28, 2.2);
    c.x = p.x; c.z = p.z;
    c.y = groundY(c.x, c.z, c.y);
    c.r = Math.atan2(dx, dz);
    c.s = speed;
  }

  /** Walk toward `goal` along a grid path, replanning as the goal moves. */
  private chase(goal: P3, speed: number, dt: number) {
    const c = this.net;
    this.repath -= dt;
    const pg = this.planGoal;
    const drift = pg ? Math.hypot(goal.x - pg.x, goal.z - pg.z) + Math.abs(goal.y - pg.y) : Infinity;
    if (this.repath <= 0 || drift > 0.75 || (!this.path.length && drift > 0.3)) {
      this.path = findWay(c, goal);
      this.unreachable = !this.path.length;
      this.planGoal = { x: goal.x, y: goal.y, z: goal.z };
      this.repath = 0.5;
    }
    this.follow(speed, dt);
    // the path ends at the centre of the goal's cell: close the last few centimetres directly
    if (!this.path.length && !this.unreachable && Math.abs(goal.y - c.y) < 1) this.moveDirect(goal.x, goal.z, speed, dt);
  }

  private follow(speed: number, dt: number) {
    const c = this.net;
    while (this.path.length) {
      const n = this.path[0];
      if (Math.hypot(n.x - c.x, n.z - c.z) < 0.25 && Math.abs(n.y - c.y) < 0.8) this.path.shift();
      else break;
    }
    const n = this.path[0];
    if (!n) { c.s = 0; return; }
    this.moveDirect(n.x, n.z, speed, dt);
  }

  /** A ghost doesn't stay snagged on furniture: if it hasn't got anywhere in 1.5 s, it flickers ahead. */
  private unstick(dt: number) {
    const c = this.net, r = this.stuckRef;
    r.t += dt;
    if (r.t < 1.5) return;
    if (this.path.length && Math.hypot(c.x - r.x, c.z - r.z) < 0.35) {
      const n = this.path[0];
      // flicker forward along its own floor only; a waypoint on another floor means replan
      if (Math.abs(n.y - c.y) < 0.6) { this.path.shift(); c.x = n.x; c.y = n.y; c.z = n.z; }
      this.repath = 0;
      this.planGoal = null;
    }
    this.stuckRef = { x: c.x, z: c.z, t: 0 };
  }

  publish(dt: number, net: Net) {
    this.publishT -= dt;
    if (this.publishT > 0) return;
    this.publishT = 0.1;
    const c = this.net;
    net.setCreature({ ...c, x: +c.x.toFixed(2), y: +c.y.toFixed(2), z: +c.z.toFixed(2), r: +c.r.toFixed(2) });
  }
}
