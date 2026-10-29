import * as THREE from 'three';
import { t } from '../i18n';

// Objective waypoints drawn over the 3D view: a diamond with a label and distance on the
// target, or an arrow pinned to the screen edge pointing toward it when it is off screen
// or behind the camera. Targets on another floor say "upstairs"/"downstairs".

export interface Target { pos: THREE.Vector3; label: string; }

const EDGE = 56;          // px kept clear at the screen edge
const _v = new THREE.Vector3();
const _to = new THREE.Vector3();
const _fwd = new THREE.Vector3();

export class Markers {
  private els: HTMLElement[] = [];

  constructor(private root: HTMLElement) {}

  private el(i: number) {
    while (this.els.length <= i) {
      const e = document.createElement('div');
      e.className = 'marker';
      e.innerHTML = '<i class="pin"></i><i class="arrow"></i><span class="lbl"></span>';
      this.root.appendChild(e);
      this.els.push(e);
    }
    return this.els[i];
  }

  update(cam: THREE.PerspectiveCamera, targets: Target[], me: THREE.Vector3) {
    const W = innerWidth, H = innerHeight;
    cam.getWorldDirection(_fwd);
    targets.forEach((tg, i) => {
      const e = this.el(i);
      e.style.display = '';
      _to.copy(tg.pos).sub(cam.position);
      const behind = _to.dot(_fwd) < 0;
      _v.copy(tg.pos).project(cam);
      let x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H;
      if (behind) { x = W - x; y = H - y; }   // projection mirrors points behind the camera
      const inside = !behind && x > EDGE && x < W - EDGE && y > EDGE && y < H - EDGE;
      let angle = 0;
      if (!inside) {
        // pin to the edge along the direction from the screen centre
        const dx = x - W / 2, dy = (behind ? Math.max(y, H * 0.6) : y) - H / 2;
        angle = Math.atan2(dy, dx);
        const sx = (W / 2 - EDGE) / Math.max(Math.abs(Math.cos(angle)), 1e-3);
        const sy = (H / 2 - EDGE) / Math.max(Math.abs(Math.sin(angle)), 1e-3);
        const r = Math.min(sx, sy);
        x = W / 2 + Math.cos(angle) * r;
        y = H / 2 + Math.sin(angle) * r;
      }
      const dist = Math.round(Math.hypot(tg.pos.x - me.x, tg.pos.z - me.z));
      const dy = tg.pos.y - (me.y + 1);
      const floor = dy < -1.8 ? ` · ${t('mk_down')}` : dy > 1.8 ? ` · ${t('mk_up')}` : '';
      const text = `${tg.label} · ${dist} m${floor}`;
      const lbl = e.lastElementChild as HTMLElement;
      if (lbl.textContent !== text) lbl.textContent = text;
      e.classList.toggle('edge', !inside);
      // near the sides the label grows inward so it is never clipped
      e.classList.toggle('al-l', x < W * 0.25);
      e.classList.toggle('al-r', x > W * 0.75);
      e.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
      (e.children[1] as HTMLElement).style.transform = `rotate(${angle.toFixed(3)}rad)`;
    });
    for (let i = targets.length; i < this.els.length; i++) this.els[i].style.display = 'none';
  }

  hide() { for (const e of this.els) e.style.display = 'none'; }
}
