// The Whitlock farmhouse floor plan. Units are meters; +X east, +Z south (front porch), +Y up.
// Everything that needs to agree on geometry (rendering, collision, AI navigation,
// interaction) reads from this file.

export const H = 2.9; // main floor ceiling height
export const BASEMENT_Y = -3;
export const BASEMENT_CEIL = -0.3;
export const WALL_T = 0.2;
export const DOOR_H = 2.15;

export interface Opening { from: number; to: number; bottom?: number; top?: number; }
export interface WallDef {
  a: [number, number]; b: [number, number];
  y0: number; y1: number;
  openings?: Opening[];
  mat: 'wallpaper' | 'stone' | 'siding';
  exterior?: boolean;
}

// Door openings (shared by walls, door leaves and nav graph)
export const DOORS = {
  front: { x: 0, z: 7, w: 1.2 },
  basement: { x: 6.4, z: -6.2, w: 1.0 },
};

const win = (from: number, to: number): Opening => ({ from, to, bottom: 0.95, top: 2.2 });
const door = (from: number, to: number, top = DOOR_H): Opening => ({ from, to, bottom: 0, top });

export const WALLS: WallDef[] = [
  // exterior, main floor
  { a: [-8, -7], b: [8, -7], y0: 0, y1: H, mat: 'wallpaper', exterior: true, openings: [win(-5.5, -4.3), win(3, 4.2)] },
  { a: [-8, 7], b: [8, 7], y0: 0, y1: H, mat: 'wallpaper', exterior: true, openings: [win(-5.6, -4.1), door(-0.6, 0.6, 2.25), win(4.1, 5.6)] },
  { a: [-8, -7], b: [-8, 7], y0: 0, y1: H, mat: 'wallpaper', exterior: true, openings: [win(-3.9, -2.7)] },
  { a: [8, -7], b: [8, 7], y0: 0, y1: H, mat: 'wallpaper', exterior: true, openings: [win(3, 4.4)] },
  // interior partitions
  { a: [-1.4, -7], b: [-1.4, 7], y0: 0, y1: H, mat: 'wallpaper', openings: [door(-3.6, -2.4), door(3.5, 4.7)] },
  { a: [1.4, -7], b: [1.4, 7], y0: 0, y1: H, mat: 'wallpaper', openings: [door(-3.6, -2.4), door(3.5, 4.7)] },
  { a: [-8, 0], b: [-1.4, 0], y0: 0, y1: H, mat: 'wallpaper', openings: [door(-6.1, -4.9)] },
  { a: [1.4, 0], b: [8, 0], y0: 0, y1: H, mat: 'wallpaper', openings: [door(4.5, 5.7)] },
  // stairwell enclosure inside the kitchen
  { a: [6.4, -7], b: [6.4, -1], y0: 0, y1: H, mat: 'wallpaper', openings: [door(-6.7, -5.7)] },
  { a: [6.4, -1], b: [8, -1], y0: 0, y1: H, mat: 'wallpaper' },
  // basement (fieldstone foundation)
  { a: [-8, -7], b: [8, -7], y0: BASEMENT_Y, y1: BASEMENT_CEIL, mat: 'stone', exterior: true },
  { a: [-8, 0], b: [8, 0], y0: BASEMENT_Y, y1: BASEMENT_CEIL, mat: 'stone', exterior: true },
  { a: [-8, -7], b: [-8, 0], y0: BASEMENT_Y, y1: BASEMENT_CEIL, mat: 'stone', exterior: true },
  { a: [8, -7], b: [8, 0], y0: BASEMENT_Y, y1: BASEMENT_CEIL, mat: 'stone', exterior: true },
  { a: [6.4, -7], b: [6.4, -1.6], y0: BASEMENT_Y, y1: 0, mat: 'stone' },
];

export interface Room {
  id: string; x0: number; x1: number; z0: number; z1: number; y: number;
  floor: 'woodfloor' | 'linoleum' | 'concrete';
}
export const ROOMS: Room[] = [
  { id: 'hall', x0: -1.4, x1: 1.4, z0: -7, z1: 7, y: 0, floor: 'woodfloor' },
  { id: 'parlor', x0: -8, x1: -1.4, z0: 0, z1: 7, y: 0, floor: 'woodfloor' },
  { id: 'study', x0: -8, x1: -1.4, z0: -7, z1: 0, y: 0, floor: 'woodfloor' },
  { id: 'dining', x0: 1.4, x1: 8, z0: 0, z1: 7, y: 0, floor: 'woodfloor' },
  { id: 'kitchen', x0: 1.4, x1: 6.4, z0: -7, z1: 0, y: 0, floor: 'linoleum' },
  { id: 'kitchen', x0: 6.4, x1: 8, z0: -1, z1: 0, y: 0, floor: 'linoleum' },
  { id: 'landing', x0: 6.4, x1: 8, z0: -7, z1: -5.6, y: 0, floor: 'woodfloor' },
  { id: 'basement', x0: -8, x1: 6.4, z0: -7, z1: 0, y: BASEMENT_Y, floor: 'concrete' },
  { id: 'basement', x0: 6.4, x1: 8, z0: -1.6, z1: 0, y: BASEMENT_Y, floor: 'concrete' },
];

export const STAIRS = { x0: 6.4, x1: 8, zTop: -5.6, zBottom: -1.6 };
export const PORCH = { x0: -3, x1: 3, z0: 7, z1: 10 };

/** Height of the walkable surface at (x, z) given where the walker currently is. */
export function groundY(x: number, z: number, currentY: number): number {
  if (x > STAIRS.x0 && x < STAIRS.x1) {
    if (z >= STAIRS.zTop && z <= STAIRS.zBottom) {
      const t = (z - STAIRS.zTop) / (STAIRS.zBottom - STAIRS.zTop);
      return t * BASEMENT_Y;
    }
    if (z < STAIRS.zTop) return 0;
    // Below the stairs is the basement landing, but its last metre (z > -1) also lies under
    // the kitchen corner east of the stairwell: someone standing up there stays upstairs.
    if (z > STAIRS.zBottom && z < 0) return z > -1 && currentY > BASEMENT_Y / 2 ? 0 : BASEMENT_Y;
  }
  if (z > 7) return -0.05; // porch
  return currentY < BASEMENT_Y / 2 ? BASEMENT_Y : 0;
}

export function roomAt(x: number, y: number, z: number): string {
  for (const r of ROOMS) {
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1 && Math.abs(y - r.y) < 1.4) return r.id;
  }
  if (x > STAIRS.x0 && x < STAIRS.x1 && z > STAIRS.zTop && z < STAIRS.zBottom) return 'stairs';
  if (z > 7) return 'porch';
  return 'hall';
}

// ---------------------------------------------------------------------------
// Collision: axis-aligned boxes with a vertical span. Walkers are vertical capsules
// approximated as circles in XZ that collide with any box overlapping their height.
export interface Box { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number; wall?: boolean; id?: string; }

export const colliders: Box[] = [];

export function wallBoxes(): Box[] {
  const out: Box[] = [];
  for (const w of WALLS) {
    const horizontal = w.a[1] === w.b[1];
    const lo = horizontal ? Math.min(w.a[0], w.b[0]) : Math.min(w.a[1], w.b[1]);
    const hi = horizontal ? Math.max(w.a[0], w.b[0]) : Math.max(w.a[1], w.b[1]);
    const fixed = horizontal ? w.a[1] : w.a[0];
    // door openings (bottom 0) are gaps; windows still block
    const gaps = (w.openings ?? []).filter((o) => !o.bottom).sort((p, q) => p.from - q.from);
    let cursor = lo;
    const pieces: [number, number][] = [];
    for (const g of gaps) { if (g.from > cursor) pieces.push([cursor, g.from]); cursor = g.to; }
    if (cursor < hi) pieces.push([cursor, hi]);
    for (const [s, e] of pieces) {
      const t = WALL_T / 2;
      // overlap half a thickness only at the wall's own ends (to close corners), never into a doorway
      const s2 = s === lo ? s - t : s, e2 = e === hi ? e + t : e;
      out.push(horizontal
        ? { x0: s2, x1: e2, z0: fixed - t, z1: fixed + t, y0: w.y0, y1: w.y1, wall: true }
        : { x0: fixed - t, x1: fixed + t, z0: s2, z1: e2, y0: w.y0, y1: w.y1, wall: true });
    }
  }
  // porch railing / yard edge
  out.push({ x0: PORCH.x0 - 0.2, x1: PORCH.x0, z0: 7, z1: PORCH.z1, y0: -1, y1: 3, wall: true });
  out.push({ x0: PORCH.x1, x1: PORCH.x1 + 0.2, z0: 7, z1: PORCH.z1, y0: -1, y1: 3, wall: true });
  out.push({ x0: PORCH.x0, x1: PORCH.x1, z0: PORCH.z1, z1: PORCH.z1 + 0.2, y0: -1, y1: 3, wall: true });
  // open side of the staircase in the basement gets a railing
  out.push({ x0: 6.3, x1: 6.45, z0: -1.6, z1: -1.55, y0: BASEMENT_Y, y1: 0, wall: true });
  return out;
}

export function addCollider(b: Box) { colliders.push(b); return b; }
export function removeCollider(id: string) {
  for (let i = colliders.length - 1; i >= 0; i--) if (colliders[i].id === id) colliders.splice(i, 1);
}

/** Push a circle at (x, z) with radius r and vertical span [y, y+h] out of all colliders. */
export function resolveCircle(p: { x: number; z: number }, y: number, r: number, h = 1.7) {
  for (let iter = 0; iter < 3; iter++) {
    for (const b of colliders) {
      if (y + h <= b.y0 || y + 0.25 >= b.y1) continue;
      const cx = Math.max(b.x0, Math.min(p.x, b.x1));
      const cz = Math.max(b.z0, Math.min(p.z, b.z1));
      const dx = p.x - cx, dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r;
      } else {
        // center inside the box: push out along the shallowest axis
        const l = p.x - b.x0, rr = b.x1 - p.x, t = p.z - b.z0, bt = b.z1 - p.z;
        const m = Math.min(l, rr, t, bt);
        if (m === l) p.x = b.x0 - r; else if (m === rr) p.x = b.x1 + r;
        else if (m === t) p.z = b.z0 - r; else p.z = b.z1 + r;
      }
    }
  }
}

/** True when the straight XZ segment between two points at height y crosses no wall. */
export function lineOfSight(ax: number, az: number, bx: number, bz: number, y: number, ignore?: string): boolean {
  for (const b of colliders) {
    if (!b.wall && !b.id?.startsWith('door')) continue;
    if (ignore && b.id === ignore) continue;
    if (y < b.y0 || y > b.y1) continue;
    if (segmentHitsBox(ax, az, bx, bz, b)) return false;
  }
  return true;
}

function segmentHitsBox(ax: number, az: number, bx: number, bz: number, b: Box): boolean {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  const clip = (p: number, q: number) => {
    if (Math.abs(p) < 1e-9) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  return clip(-dx, ax - b.x0) && clip(dx, b.x1 - ax) && clip(-dz, az - b.z0) && clip(dz, b.z1 - az) && t0 < t1;
}

// ---------------------------------------------------------------------------
// Navigation graph for the creature. Nodes sit in room centers and doorways.
export interface NavNode { id: string; x: number; y: number; z: number; links: string[]; gate?: 'basement'; }
const N = (id: string, x: number, z: number, y = 0, gate?: 'basement'): NavNode => ({ id, x, y, z, links: [], gate });
export const NAV: Record<string, NavNode> = Object.fromEntries([
  N('hallS', 0, 5.2), N('hallM', 0, 0.6), N('hallN', 0, -4.8),
  N('dPH', -1.4, 4.1), N('parlor', -4.4, 3.4), N('parlorW', -6.4, 5.4),
  N('dSH', -1.4, -3.0), N('study', -4.4, -3.4), N('dPS', -5.5, 0),
  N('dDH', 1.4, 4.1), N('dining', 4.6, 5.6), N('diningE', 6.8, 2.2),
  N('dKH', 1.4, -3.0), N('kitchen', 3.2, -1.6), N('kitchenE', 5.6, -4.8), N('dDK', 5.1, 0),
  N('dBase', 6.4, -6.2, 0, 'basement'), N('landing', 7.2, -6.3), N('stairsBottom', 7.2, -0.8, BASEMENT_Y),
  N('bEast', 4.6, -0.9, BASEMENT_Y), N('bMid', 0, -1.3, BASEMENT_Y), N('bWest', -4.6, -1.5, BASEMENT_Y),
  N('bNW', -4.4, -5.3, BASEMENT_Y), N('bNE', 3.8, -5.0, BASEMENT_Y),
].map((n) => [n.id, n]));

const LINKS: [string, string][] = [
  ['hallS', 'hallM'], ['hallM', 'hallN'], ['hallS', 'dPH'], ['hallS', 'dDH'], ['hallM', 'dPH'], ['hallM', 'dDH'],
  ['hallM', 'dSH'], ['hallM', 'dKH'], ['hallN', 'dSH'], ['hallN', 'dKH'],
  ['dPH', 'parlor'], ['parlor', 'parlorW'], ['parlor', 'dPS'], ['dPS', 'study'], ['dSH', 'study'],
  ['dDH', 'dining'], ['dining', 'diningE'], ['dining', 'dDK'], ['diningE', 'dDK'], ['dDK', 'kitchen'], ['dKH', 'kitchen'],
  ['kitchen', 'kitchenE'], ['kitchenE', 'dBase'], ['dBase', 'landing'], ['landing', 'stairsBottom'],
  ['stairsBottom', 'bEast'], ['bEast', 'bMid'], ['bMid', 'bWest'], ['bWest', 'bNW'], ['bMid', 'bNE'], ['bEast', 'bNE'], ['bNW', 'bMid'],
];
for (const [a, b] of LINKS) { NAV[a].links.push(b); NAV[b].links.push(a); }

export function nearestNode(x: number, y: number, z: number): NavNode {
  let best = NAV.hallM, bd = Infinity;
  for (const n of Object.values(NAV)) {
    const d = (n.x - x) ** 2 + (n.z - z) ** 2 + ((n.y - y) * 3) ** 2;
    if (d < bd && (Math.abs(n.y - y) > 1.4 || lineOfSight(x, z, n.x, n.z, y + 1))) { bd = d; best = n; }
  }
  return best;
}

export function findPath(from: NavNode, to: NavNode, basementOpen: boolean): NavNode[] {
  const prev = new Map<string, string | null>([[from.id, null]]);
  const queue = [from.id];
  while (queue.length) {
    const id = queue.shift()!;
    if (id === to.id) break;
    for (const l of NAV[id].links) {
      if (prev.has(l)) continue;
      if (NAV[l].gate === 'basement' && !basementOpen) continue;
      prev.set(l, id); queue.push(l);
    }
  }
  if (!prev.has(to.id)) return [];
  const path: NavNode[] = [];
  for (let id: string | null = to.id; id; id = prev.get(id) ?? null) path.unshift(NAV[id]);
  return path;
}

export const SPAWN = { x: 0, y: 0, z: 5.6, yaw: 0 };
