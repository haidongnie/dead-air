// TikTok LIVE gifts via TikFinity's local Event API (https://tikfinity.zerody.one/tiktok/dapi).
//
// The TikFinity Desktop App (Windows) serves ws://localhost:21213/ and sends
// {"event": "<name>", "data": {...}} with TikTok-Live-Connector v1 style (flat) data.
// Notes that shape this file:
// - Streakable gifts (giftType 1) send an update per tap with a cumulative repeatCount;
//   the final repeatEnd event is occasionally lost, so count increments instead.
// - Every event carries its own msgId; drop repeats.
// - Chrome 147+ asks "Apps on this device" before a public HTTPS page may open a
//   socket to loopback, and keeps the handshake pending while the prompt is open,
//   so there is no short connect timeout here.

export interface GiftEvent {
  user: string;     // @handle
  nick: string;     // display name
  giftId: string;
  name: string;     // gift name for display (may be localized by TikFinity)
  count: number;    // gifts in this batch
  diamonds: number; // total diamonds in this batch
}

export type TikState = 'off' | 'connecting' | 'prompt' | 'on' | 'live' | 'denied' | 'error';

export const DEFAULT_URL = 'ws://localhost:21213/';
const FALLBACK_URL = 'ws://127.0.0.1:21213/';

/** Only plain ws:// to this machine: anything else would be mixed content or point somewhere else. */
export function loopbackUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== 'ws:') return null;
    const h = u.hostname;
    if (h === 'localhost' || h === '[::1]' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return u.href;
  } catch { /* not a URL */ }
  return null;
}

/** A page served from this machine needs no loopback permission, whatever the browser reports. */
const pageIsLocal = () => /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/.test(location.hostname);

interface Streak { max: number; lastSeen: number; ended: boolean; }
interface Pending extends GiftEvent { first: number; last: number; }

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export class TikFinity {
  state: TikState = 'off';
  onState: (s: TikState) => void = () => {};
  onGift: (g: GiftEvent) => void = () => {};

  private ws: WebSocket | null = null;
  private urls: string[] = [DEFAULT_URL, FALLBACK_URL];
  private urlIdx = 0;
  private attempt = 0;
  private retryTimer = 0;
  private enabled = false;
  private perm: PermissionStatus | null = null;
  private seen = new Set<string>();
  private seenOrder: string[] = [];
  private streaks = new Map<string, Streak>();
  private pending = new Map<string, Pending>();
  private simSeq = 0;

  constructor() {
    window.setInterval(() => this.flush(), 200);
  }

  get running() { return this.enabled; }

  /** Call from a user gesture the first time, so the browser's permission prompt is expected. */
  async start(url?: string) {
    const custom = url ? loopbackUrl(url) : null;
    this.urls = custom && custom !== DEFAULT_URL ? [custom] : [DEFAULT_URL, FALLBACK_URL];
    this.urlIdx = 0;
    this.attempt = 0;
    this.enabled = true;
    await this.watchPermission();
    // The permission state only words the error message: a page served from this
    // machine needs no permission at all, and some browsers report it inaccurately.
    this.connect();
  }

  stop() {
    this.enabled = false;
    clearTimeout(this.retryTimer);
    this.drop();
    this.set('off');
  }

  private set(s: TikState) {
    if (s === this.state) return;
    this.state = s;
    this.onState(s);
  }

  /** Chrome 145+: 'loopback-network'; 142-144: 'local-network-access'. Others: unknown (null). */
  private async watchPermission() {
    if (this.perm || !navigator.permissions?.query) return;
    for (const name of ['loopback-network', 'local-network-access']) {
      try {
        this.perm = await navigator.permissions.query({ name } as unknown as PermissionDescriptor);
        this.perm.onchange = () => {
          // the user just answered the browser prompt or changed site settings: try again right away
          if (this.enabled && this.perm!.state === 'granted' && this.state !== 'on' && this.state !== 'live') {
            this.attempt = 0;
            this.connect();
          }
        };
        return;
      } catch { /* this browser doesn't know the name */ }
    }
  }

  private drop() {
    const ws = this.ws;
    if (!ws) return;
    ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
    try { ws.close(); } catch { /* already closed */ }
    this.ws = null;
  }

  private connect() {
    if (!this.enabled) return;
    clearTimeout(this.retryTimer);
    this.drop();
    const url = this.urls[this.urlIdx % this.urls.length];
    this.set(!pageIsLocal() && this.perm?.state === 'prompt' ? 'prompt' : 'connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(url); // no options bag: older browsers would treat it as a subprotocol
    } catch {
      this.retry();
      return;
    }
    this.ws = ws;
    ws.onopen = () => { this.attempt = 0; this.set('on'); };
    ws.onmessage = (e) => {
      if (typeof e.data !== 'string') return;
      // only real traffic from TikFinity proves the LIVE link, never the test buttons
      if (this.handle(e.data) && this.state === 'on') this.set('live');
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.retry();
    };
  }

  private retry() {
    if (!this.enabled) return;
    const denied = !pageIsLocal() && this.perm?.state === 'denied';
    this.set(denied ? 'denied' : 'error');
    this.urlIdx++;
    // keep trying, slowly when blocked, so fixing the setting or opening TikFinity reconnects on its own
    const delay = denied ? 15000 : Math.min(15000, 1000 * 2 ** Math.min(this.attempt++, 4)) + Math.random() * 500;
    this.retryTimer = window.setTimeout(() => this.connect(), delay);
  }

  // ---------------------------------------------------------------------------
  // events

  /**
   * Parse one TikFinity message; returns whether it was a well-formed event.
   * Public so tests and the "simulate" buttons can feed it.
   */
  handle(raw: string): boolean {
    let msg: { event?: unknown; data?: unknown };
    try { msg = JSON.parse(raw); } catch { return false; }
    if (!msg || typeof msg.event !== 'string' || !msg.data || typeof msg.data !== 'object') return false;
    if (msg.event === 'gift') this.gift(msg.data as Record<string, any>);
    return true;
  }

  private gift(d: Record<string, any>) {
    const compat = d.gift && typeof d.gift === 'object' ? d.gift : {};

    const msgId = str(d.msgId ?? d.common?.msgId);
    if (msgId) {
      if (this.seen.has(msgId)) return;
      this.seen.add(msgId);
      this.seenOrder.push(msgId);
      if (this.seenOrder.length > 1500) this.seen.delete(this.seenOrder.shift()!);
    }

    const user = str(d.uniqueId ?? d.user?.uniqueId);
    const nick = str(d.nickname ?? d.user?.nickname) || user;
    const userId = str(d.userId ?? d.user?.userId) || user;
    const giftId = str(d.giftId ?? compat.gift_id ?? d.giftDetails?.id);
    const giftType = num(d.giftType ?? compat.gift_type ?? d.giftDetails?.giftType);
    const each = num(d.diamondCount ?? d.giftDetails?.diamondCount ?? compat.diamondCount);
    const repeat = Math.max(1, Math.floor(num(d.repeatCount ?? compat.repeat_count) || 1));
    const ended = d.repeatEnd === true || d.repeatEnd === 1 || d.repeatEnd === 'true' || compat.repeat_end === 1;
    const groupId = str(d.groupId);
    const name = str(d.giftName ?? d.originalName ?? d.giftDetails?.giftName ?? compat.name) || 'Gift';
    if (!userId && !giftId) return;

    let count = repeat;
    if (giftType === 1) {
      // streak: only the increase since the last update for this streak is new
      const hasGroup = !!groupId && groupId !== '0';
      const key = `${userId}|${giftId}|${hasGroup ? groupId : ''}`;
      const now = performance.now();
      let s = this.streaks.get(key);
      if (s && !hasGroup) {
        // Without a groupId every combo of this gift from this viewer shares the key, and the
        // final event of the previous one may have been lost. A count that went down, or a
        // new tap after the combo ended or timed out (TikTok combos last ~5 s), is a new combo.
        // A late final (same count, repeatEnd) is the old combo's tombstone: count nothing.
        const lateFinal = ended && repeat === s.max;
        if (repeat < s.max || (!lateFinal && repeat <= s.max && (s.ended || now - s.lastSeen > 5000))) s = undefined;
      }
      // with a groupId the key is unique to one combo: never restart, so late events can't recount
      if (!s) { s = { max: 0, lastSeen: now, ended: false }; this.streaks.set(key, s); }
      count = Math.max(0, repeat - s.max);
      s.max = Math.max(s.max, repeat);
      s.lastSeen = now;
      s.ended ||= ended;
      if (this.streaks.size > 500) {
        // keep finished streaks for a few minutes as tombstones, so a late final event isn't recounted
        for (const [k, v] of this.streaks) if (now - v.lastSeen > 300000) this.streaks.delete(k);
      }
      if (count === 0) return;
      this.queue(userId, { user, nick, giftId, name, count, diamonds: count * each }, false);
    } else {
      this.queue(userId, { user, nick, giftId, name, count, diamonds: count * each }, true);
    }
  }

  /** Taps in a combo arrive one by one; bundle them so a fast streak lands as one bigger gift. */
  private queue(userId: string, g: GiftEvent, immediate: boolean) {
    if (immediate) { this.onGift(g); return; }
    // keyed on the stable userId (like the streaks), not the changeable @handle
    const key = `${userId}|${g.giftId}`;
    const now = performance.now();
    const p = this.pending.get(key);
    if (p) { p.count += g.count; p.diamonds += g.diamonds; p.last = now; }
    else this.pending.set(key, { ...g, first: now, last: now });
  }

  private flush() {
    const now = performance.now();
    for (const [k, p] of this.pending) {
      if (now - p.last > 900 || now - p.first > 3000) {
        this.pending.delete(k);
        const { first: _f, last: _l, ...g } = p;
        this.onGift(g);
      }
    }
  }

  /** Feed a fake TikFinity gift through the real parser (for the test buttons). */
  simulate(diamonds: number) {
    const seq = ++this.simSeq;
    const base = {
      userId: '7000000000000000000', uniqueId: 'test_viewer', nickname: 'Test Viewer',
      groupId: String(Date.now()), profilePictureUrl: '',
    };
    if (diamonds < 10) {
      // a Rose combo: three taps, the last one marked as the end of the streak
      for (let i = 1; i <= 3; i++) {
        this.handle(JSON.stringify({
          event: 'gift',
          data: {
            ...base, msgId: `sim-${seq}-${i}`, giftId: 5655, giftName: 'Rose', giftType: 1,
            diamondCount: Math.max(1, Math.round(diamonds / 3)), repeatCount: i, repeatEnd: i === 3,
          },
        }));
      }
    } else {
      this.handle(JSON.stringify({
        event: 'gift',
        data: {
          ...base, msgId: `sim-${seq}`, giftId: diamonds >= 100 ? 'sim-lion' : 'sim-rocket',
          giftName: diamonds >= 100 ? 'Lion' : 'Rocket', giftType: 2, diamondCount: diamonds, repeatCount: 1, repeatEnd: true,
        },
      }));
    }
  }
}
