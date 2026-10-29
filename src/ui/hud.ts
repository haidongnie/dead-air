import { t, lang, type Key } from '../i18n';

// DOM overlay for everything that isn't the 3D view.
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export interface TeamRow { id: string; name: string; color: string; you: boolean; down: boolean; out: boolean; speaking: boolean; }

export class Hud {
  private toastBox = $('toasts');
  private subtitleEl = $('subtitle');
  private subtitleT = 0;
  modalOpen = false;
  onModalClose: () => void = () => {};

  show(on: boolean) { $('hud').classList.toggle('hidden', !on); }

  setClock(ms: number) {
    // 11:35 PM + elapsed
    const total = 23 * 60 + 35 + Math.floor(ms / 60000);
    const h = Math.floor(total / 60) % 24, m = total % 60;
    const hh = h % 12 || 12;
    const s = Math.floor(ms / 1000) % 60;
    $('vhs-time').textContent = `${hh}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} ${h >= 12 && h < 24 ? 'PM' : 'AM'}`;
    $('vhs-time').classList.toggle('late', total >= 23 * 60 + 55);
  }

  setObjective(text: string) {
    const el = $('objective');
    if (el.dataset.text === text) return;
    el.dataset.text = text;
    el.textContent = text;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  prompt(text: string | null, actionable: boolean, hold = 0) {
    const el = $('prompt');
    el.classList.toggle('hidden', !text);
    if (!text) return;
    el.innerHTML = actionable ? `<kbd>E</kbd> ${escape(text)}` : escape(text);
    const bar = $('holdbar');
    bar.classList.toggle('hidden', hold <= 0);
    (bar.firstElementChild as HTMLElement).style.width = `${Math.min(1, hold) * 100}%`;
  }

  crosshair(active: boolean) { $('crosshair').classList.toggle('active', active); }

  toast(text: string) {
    const d = document.createElement('div');
    d.className = 'toast';
    d.textContent = text;
    this.toastBox.prepend(d);
    setTimeout(() => d.classList.add('out'), 5000);
    setTimeout(() => d.remove(), 6000);
    while (this.toastBox.children.length > 5) this.toastBox.lastElementChild!.remove();
  }

  /** Gift feed for TikTok LIVE: its own column so viewers can spot their names on stream. */
  giftToast(text: string, tier: 1 | 2 | 3) {
    const box = $('gifts');
    const d = document.createElement('div');
    d.className = `gift t${tier}`;
    d.textContent = text;
    box.prepend(d);
    setTimeout(() => d.classList.add('out'), tier === 3 ? 9000 : 6000);
    setTimeout(() => d.remove(), tier === 3 ? 10000 : 7000);
    while (box.children.length > 6) box.lastElementChild!.remove();
  }

  /** detail: "frames / gifts" so the streamer can see on stream that events are arriving */
  tiktok(state: 'off' | 'connecting' | 'on' | 'error', detail = '') {
    const el = $('tiktok');
    el.className = `${state === 'off' ? 'hidden ' : ''}${state}`;
    el.textContent = t(state === 'on' ? 'ttOn' : state === 'connecting' ? 'ttConnecting' : state === 'error' ? 'ttError' : 'ttOff') + (detail ? ` · ${detail}` : '');
    $('tiktok-legend').classList.toggle('hidden', state !== 'on');
  }

  subtitle(text: string, seconds = 4) {
    this.subtitleEl.textContent = text;
    this.subtitleEl.classList.remove('hidden');
    this.subtitleT = seconds;
  }

  tick(dt: number) {
    if (this.subtitleT > 0) {
      this.subtitleT -= dt;
      if (this.subtitleT <= 0) this.subtitleEl.classList.add('hidden');
    }
  }

  team(rows: TeamRow[]) {
    const html = rows.map((r) => `<div class="row ${r.down ? 'down' : ''} ${r.out ? 'out' : ''}">
      <span class="dot" style="background:${r.color}"></span>
      <span class="nm">${escape(r.name)}${r.you ? ` <i>(${t('you')})</i>` : ''}</span>
      ${r.speaking ? '<span class="spk">◉</span>' : ''}
      ${r.down ? '<span class="st">✖</span>' : r.out ? '<span class="st">⇥</span>' : ''}
    </div>`).join('');
    const el = $('team');
    if (el.dataset.html !== html) { el.dataset.html = html; el.innerHTML = `<h4>${t('team')}</h4>${html}`; }
  }

  items(list: string[]) {
    const html = list.length ? list.map((s) => `<div>${escape(s)}</div>`).join('') : '<div class="none">—</div>';
    const el = $('items');
    if (el.dataset.html !== html) { el.dataset.html = html; el.innerHTML = `<h4>${t('items')}</h4>${html}`; }
  }

  bars(beam: number, stamina: number, locked: boolean) {
    ($('beam').firstElementChild as HTMLElement).style.width = `${beam * 100}%`;
    $('beam').classList.toggle('locked', locked);
    ($('stamina').firstElementChild as HTMLElement).style.width = `${stamina * 100}%`;
  }

  mic(state: 'on' | 'off' | 'none') {
    const el = $('mic');
    el.textContent = state === 'on' ? `🎙 ${t('micOn')}` : state === 'off' ? `🔇 ${t('micOff')}` : t('noMic');
    el.className = state;
  }

  room(code: string | undefined) {
    $('room-code').textContent = code ? `${t('room')} ${code}` : '';
  }

  lockHint(show: boolean) { $('lockhint').classList.toggle('hidden', !show); }

  danger(d: number) { document.body.style.setProperty('--danger', d.toFixed(2)); }

  // ---------------------------------------------------------------------------
  // modals

  private openModal(id: string) {
    this.modalOpen = true;
    $('modal').classList.remove('hidden');
    for (const c of Array.from($('modal').children)) (c as HTMLElement).classList.toggle('hidden', c.id !== id);
  }

  closeModal() {
    if (!this.modalOpen) return;
    this.modalOpen = false;
    $('modal').classList.add('hidden');
    this.onModalClose();
  }

  openDoc(title: string, en: string, zh: string) {
    $('doc-title').textContent = title;
    $('doc-body').textContent = en;
    $('doc-trans').textContent = lang === 'zh' ? zh : '';
    $('doc-trans').classList.toggle('hidden', lang !== 'zh');
    $('doc-close').textContent = t('close');
    this.openModal('doc');
  }

  /** Returns a key handler for Input.modal. */
  openKeypad(onSubmit: (code: string) => void): (e: KeyboardEvent) => void {
    let code = '';
    const render = () => { $('keypad-display').textContent = code.padEnd(4, '_').split('').join(' '); };
    $('keypad-title').textContent = t('keypadTitle');
    $('keypad-help').textContent = t('keypadHelp');
    render();
    this.openModal('keypad');
    const press = (k: string) => {
      if (/^\d$/.test(k) && code.length < 4) code += k;
      else if (k === 'Backspace') code = code.slice(0, -1);
      else if (k === 'Enter' && code.length === 4) { onSubmit(code); code = ''; }
      render();
    };
    $('keypad-keys').onclick = (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b) press(b.dataset.k!);
    };
    return (e: KeyboardEvent) => {
      if (e.code === 'Escape') { this.closeModal(); return; }
      press(e.key);
    };
  }

  keypadResult(ok: boolean) {
    const el = $('keypad-display');
    el.classList.remove('ok', 'bad');
    void el.offsetWidth;
    el.classList.add(ok ? 'ok' : 'bad');
  }

  openTuner(get: () => number, set: (f: number) => void): (e: KeyboardEvent) => void {
    $('tuner-title').textContent = t('radioTitle');
    $('tuner-help').textContent = t('radioHelp');
    this.openModal('tuner');
    const scale = $('tuner-scale');
    if (!scale.childElementCount) {
      for (let f = 550; f <= 1600; f += 50) {
        const s = document.createElement('span');
        s.style.left = `${((f - 530) / 1170) * 100}%`;
        s.textContent = f % 100 === 0 || f === 550 ? String(f / 10) : '';
        s.className = f % 100 === 0 ? 'major' : '';
        scale.appendChild(s);
      }
    }
    const wheel = (e: WheelEvent) => { set(get() + Math.sign(e.deltaY) * -10); };
    $('tuner').onwheel = wheel;
    return (e: KeyboardEvent) => {
      if (e.code === 'Escape') { this.closeModal(); return; }
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') set(get() - (e.shiftKey ? 50 : 10));
      if (e.code === 'KeyD' || e.code === 'ArrowRight') set(get() + (e.shiftKey ? 50 : 10));
    };
  }

  tuner(freq: number, signal: number) {
    $('tuner-needle').style.left = `${((freq - 530) / 1170) * 100}%`;
    $('tuner-freq').textContent = `${freq} kHz`;
    ($('tuner-signal').firstElementChild as HTMLElement).style.width = `${signal * 100}%`;
  }

  // ---------------------------------------------------------------------------
  // full-screen sequences

  eas(lines: string[], zh: string, seconds: number): Promise<void> {
    const el = $('eas');
    $('eas-lines').innerHTML = lines.map((l) => `<div>${escape(l)}</div>`).join('');
    $('eas-zh').textContent = lang === 'zh' ? zh : '';
    el.classList.remove('hidden');
    return new Promise((res) => {
      const done = () => { el.classList.add('hidden'); removeEventListener('keydown', skip); res(); };
      const skip = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'Escape' || e.code === 'Enter') { clearTimeout(timer); done(); } };
      const timer = setTimeout(done, seconds * 1000);
      addEventListener('keydown', skip);
    });
  }

  end(title: string, text: string, stats: string, isHost: boolean, onAgain: () => void) {
    $('end').classList.remove('hidden');
    $('end').classList.toggle('lost', title === t('loseTitle'));
    $('end-title').textContent = title;
    $('end-text').textContent = text;
    $('end-stats').textContent = stats;
    const btn = $<HTMLButtonElement>('end-again');
    btn.textContent = isHost ? t('again') : t('waitHost');
    btn.disabled = !isHost;
    btn.onclick = onAgain;
  }
  hideEnd() { $('end').classList.add('hidden'); }
}

export function escape(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function tk(key: string, vars?: Record<string, string>) { return t(key as Key, vars); }
