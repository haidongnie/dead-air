import { colliders, groundY, BASEMENT_Y, STAIRS } from './layout';

// Grid pathfinding for the creature. The house is rasterised into 0.2 m cells on two
// layers (main floor and basement) joined along the staircase; a cell is walkable when a
// circle of the creature's radius fits there between walls, furniture and locked doors.
// A* runs on the grid and the result is shortened by string pulling, so the creature can
// reach any spot a player can stand on: no hand-placed waypoints to get stuck on.

export interface P3 { x: number; y: number; z: number; }

const CELL = 0.2;
const X0 = -8, Z0 = -7;
const NX = 80, NZ = 70;            // 16 m x 14 m
const LAYER = NX * NZ;
const R = 0.29;                    // creature radius (0.28) plus a hair
const H = 2.2;                     // creature height for the collision span
const STEP = 0.6;                  // max height change between neighbouring cells

let walk = new Uint8Array(0);
let height = new Float32Array(0);
let signature = '';

const layerY = (l: number) => (l === 0 ? 0 : BASEMENT_Y);

function blocked(x: number, y: number, z: number): boolean {
  for (const b of colliders) {
    if (y + H <= b.y0 || y + 0.25 >= b.y1) continue;
    const cx = Math.max(b.x0, Math.min(x, b.x1));
    const cz = Math.max(b.z0, Math.min(z, b.z1));
    if ((x - cx) ** 2 + (z - cz) ** 2 < R * R) return true;
  }
  return false;
}

/** Rebuild when colliders change (doors opening or closing). */
function ensure() {
  const sig = `${colliders.length}|${colliders.filter((b) => b.id).map((b) => b.id).join(',')}`;
  if (sig === signature && walk.length) return;
  signature = sig;
  walk = new Uint8Array(LAYER * 2);
  height = new Float32Array(LAYER * 2);
  for (let l = 0; l < 2; l++) {
    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) {
        const x = X0 + (i + 0.5) * CELL, z = Z0 + (j + 0.5) * CELL;
        if (l === 1 && z > 0) continue;            // the basement ends under the hall front
        const y = groundY(x, z, layerY(l));
        // a layer only holds cells at its own level (the ramp belongs to both)
        const onRamp = x > STAIRS.x0 && x < STAIRS.x1 && z >= STAIRS.zTop && z <= STAIRS.zBottom;
        if (!onRamp && Math.abs(y - layerY(l)) > 0.5) continue;
        const k = l * LAYER + j * NX + i;
        height[k] = y;
        walk[k] = blocked(x, y, z) ? 0 : 1;
      }
    }
  }
}

const cellOf = (x: number, z: number) => [Math.floor((x - X0) / CELL), Math.floor((z - Z0) / CELL)] as const;
const center = (k: number): P3 => {
  const c = k % LAYER, i = c % NX, j = (c / NX) | 0;
  return { x: X0 + (i + 0.5) * CELL, y: height[k], z: Z0 + (j + 0.5) * CELL };
};

/** Nearest walkable cell to a world position (searching outward up to ~2 m). */
function snap(p: P3): number {
  ensure();
  const l = p.y < BASEMENT_Y / 2 ? 1 : 0;
  const [ci, cj] = cellOf(p.x, p.z);
  let best = -1, bd = Infinity;
  for (let r = 0; r <= 10 && best < 0; r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= NX || j >= NZ) continue;
        for (const ll of [l, 1 - l]) {
          const k = ll * LAYER + j * NX + i;
          if (!walk[k] || Math.abs(height[k] - p.y) > 1.2) continue;
          const c = center(k);
          const d = (c.x - p.x) ** 2 + (c.z - p.z) ** 2 + (ll === l ? 0 : 0.01);
          if (d < bd) { bd = d; best = k; }
        }
      }
    }
  }
  return best;
}

/** Closest walkable point to `p` (used to snap noise spots and spawn points). */
export function nearestWalkable(p: P3): P3 | null {
  const k = snap(p);
  return k < 0 ? null : center(k);
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

function neighbours(k: number, out: number[]) {
  out.length = 0;
  const l = k >= LAYER ? 1 : 0, c = k % LAYER, i = c % NX, j = (c / NX) | 0;
  const base = l * LAYER;
  for (const [di, dj] of DIRS) {
    const ni = i + di, nj = j + dj;
    if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue;
    const nk = base + nj * NX + ni;
    if (!walk[nk] || Math.abs(height[nk] - height[k]) > STEP) continue;
    // no cutting corners past a blocked cell
    if (di && dj && (!walk[base + j * NX + ni] || !walk[base + nj * NX + i])) continue;
    out.push(nk);
  }
  // the staircase exists in both layers: step across
  const twin = l === 0 ? k + LAYER : k - LAYER;
  if (walk[twin] && Math.abs(height[twin] - height[k]) < 0.05) out.push(twin);
}

/**
 * Straight walk between two cells is clear when every sample along it is walkable at a smooth
 * height and the walk ends on b itself. Samples stay on one layer and may only switch where the
 * other layer continues at the same height (the staircase), so a straight line can never join
 * the main floor to the basement cell beneath it.
 */
function clear(a: number, b: number): boolean {
  const pa = center(a), pb = center(b);
  let layer = a >= LAYER ? 1 : 0;
  const n = Math.ceil(Math.hypot(pb.x - pa.x, pb.z - pa.z) / (CELL * 0.25));
  let prevY = pa.y, k = a;
  for (let s = 1; s <= n; s++) {
    const t = s / n;
    const [i, j] = cellOf(pa.x + (pb.x - pa.x) * t, pa.z + (pb.z - pa.z) * t);
    if (i < 0 || j < 0 || i >= NX || j >= NZ) return false;
    k = layer * LAYER + j * NX + i;
    if (!walk[k] || Math.abs(height[k] - prevY) > STEP) {
      const other = (1 - layer) * LAYER + j * NX + i;
      if (!walk[other] || Math.abs(height[other] - prevY) > STEP) return false;
      layer = 1 - layer;
      k = other;
    }
    prevY = height[k];
  }
  return k % LAYER === b % LAYER && Math.abs(height[k] - pb.y) < 0.05;
}

/**
 * Path from `from` to `to` as world waypoints (excluding the start), or [] if unreachable.
 * The basement layer is only reachable through the staircase, so a locked basement door
 * (a collider) cuts it off automatically.
 */
export function findWay(from: P3, to: P3): P3[] {
  ensure();
  const s = snap(from), g = snap(to);
  if (s < 0 || g < 0) return [];
  if (s === g) return [center(g)];
  const gp = center(g);
  const cost = new Float32Array(LAYER * 2).fill(Infinity);
  const prev = new Int32Array(LAYER * 2).fill(-1);
  const open: number[] = [s];       // binary heap keyed by f
  const f = new Float32Array(LAYER * 2).fill(Infinity);
  const h = (k: number) => { const c = center(k); return Math.hypot(c.x - gp.x, c.z - gp.z) + Math.abs(c.y - gp.y); };
  cost[s] = 0; f[s] = h(s);
  const push = (k: number) => {
    open.push(k);
    let i = open.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (f[open[p]] <= f[open[i]]) break; [open[p], open[i]] = [open[i], open[p]]; i = p; }
  };
  const pop = () => {
    const top = open[0], last = open.pop()!;
    if (open.length) {
      open[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < open.length && f[open[l]] < f[open[m]]) m = l;
        if (r < open.length && f[open[r]] < f[open[m]]) m = r;
        if (m === i) break;
        [open[m], open[i]] = [open[i], open[m]]; i = m;
      }
    }
    return top;
  };
  const nb: number[] = [];
  const closed = new Uint8Array(LAYER * 2);
  while (open.length) {
    const k = pop();
    if (k === g) break;
    if (closed[k]) continue;
    closed[k] = 1;
    neighbours(k, nb);
    const ck = center(k);
    for (const n of nb) {
      const cn = center(n);
      const c = cost[k] + Math.hypot(cn.x - ck.x, cn.z - ck.z) + Math.abs(cn.y - ck.y) * 0.5 + (n % LAYER === k % LAYER ? 0.01 : 0);
      if (c < cost[n]) { cost[n] = c; prev[n] = k; f[n] = c + h(n); push(n); }
    }
  }
  if (prev[g] < 0) return [];
  const cells: number[] = [];
  for (let k = g; k !== -1; k = prev[k]) cells.push(k);
  cells.reverse();
  // string pulling: keep only the turns that a straight walk can't skip
  const way: P3[] = [];
  let a = 0;
  while (a < cells.length - 1) {
    let b = cells.length - 1;
    while (b > a + 1 && !clear(cells[a], cells[b])) b--;
    way.push(center(cells[b]));
    a = b;
  }
  return way;
}

let cellList: P3[] = [];
let cellListSig = '';
/** Every walkable cell centre (cached until colliders change). */
export function walkableCells(): P3[] {
  ensure();
  if (cellListSig !== signature) {
    cellListSig = signature;
    cellList = [];
    for (let k = 0; k < walk.length; k++) if (walk[k] && !(k >= LAYER && walk[k - LAYER] && Math.abs(height[k - LAYER] - height[k]) < 0.05)) cellList.push(center(k));
  }
  return cellList;
}

/** True when `p` stands on a walkable cell reachable by walking (used for spawn checks). */
export function walkableAt(p: P3): boolean {
  ensure();
  const [i, j] = cellOf(p.x, p.z);
  if (i < 0 || j < 0 || i >= NX || j >= NZ) return false;
  const l = p.y < BASEMENT_Y / 2 ? 1 : 0;
  return !!walk[l * LAYER + j * NX + i];
}
