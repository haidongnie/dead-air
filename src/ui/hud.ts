import { t, type Key } from '../i18n';

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

  /** Objective panel: step counter, title, one plain instruction and an optional checklist. */
  setObjective(step: string, title: string, detail: string, checklist: { label: string; state: 'done' | 'have' | 'todo' }[] = []) {
    const el = $('objective');
    const key = [step, title, detail, ...checklist.map((c) => c.label + c.state)].join('|');
    if (el.dataset.key === key) return;
    const titleChanged = el.dataset.title !== title;
    el.dataset.key = key;
    el.dataset.title = title;
    $('obj-step').textContent = step;
    $('obj-title').textContent = title;
    $('obj-detail').textContent = detail;
    const list = $('obj-list');
    list.replaceChildren(...checklist.map((c) => {
      const li = document.createElement('li');
      li.className = c.state;
      li.textContent = `${c.state === 'done' ? '✓' : c.state === 'have' ? '●' : '○'} ${c.label}`;
      return li;
    }));
    if (titleChanged) {
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
    }
  }

  /** Big centre-screen announcement when a new step starts. */
  banner(title: string) {
    const el = $('banner');
    $('banner-title').textContent = title;
    $('banner-kicker').textContent = t('newObjective');
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
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
  giftToast(text: string, tier: 1 | 2 | 3 | 'heart') {
    const box = $('gifts');
    const d = document.createElement('div');
    d.className = `gift ${tier === 'heart' ? 'heart' : `t${tier}`}`;
    d.textContent = text;
    box.prepend(d);
    setTimeout(() => d.classList.add('out'), tier === 3 ? 9000 : 6000);
    setTimeout(() => d.remove(), tier === 3 ? 10000 : 7000);
    while (box.children.length > 6) box.lastElementChild!.remove();
  }

  /** detail: "frames / gifts" so the streamer can see on stream that events are arriving */
  rescueCta(show: boolean) { $('rescue-cta').classList.toggle('hidden', !show); }

  tiktok(state: 'off' | 'connecting' | 'on' | 'error', detail = '') {
    const el = $('tiktok');
    el.className = `${state === 'off' ? 'hidden ' : ''}${state}`;
    el.textContent = t(state === 'on' ? 'ttOn' : state === 'connecting' ? 'ttConnecting' : state === 'error' ? 'ttError' : 'ttOff') + (detail ? ` · ${detail}` : '');
    $('tiktok-legend').classList.toggle('hidden', state !== 'on');
  }

  clearSubtitle() {
    this.subtitleT = 0;
    this.subtitleEl.classList.add('hidden');
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
    $('room-code').innerHTML = code ? `${escape(t('room'))} <b>${escape(code)}</b>` : '';
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

  openDoc(title: string, body: string) {
    $('doc-title').textContent = title;
    $('doc-body').textContent = body;
    $('doc-close').textContent = t('close');
    this.openModal('doc');
  }

  // ---------------------------------------------------------------------------
  // full-screen sequences

  eas(lines: string[], seconds: number): Promise<void> {
    const el = $('eas');
    $('eas-lines').innerHTML = lines.map((l) => `<div>${escape(l)}</div>`).join('');
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
