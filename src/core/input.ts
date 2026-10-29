// Keyboard + mouse with pointer lock. Modal UI (documents) takes
// the keyboard by setting `modal`, which also suppresses movement.
export class Input {
  readonly keys = new Set<string>();
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  rmb = false;
  wheel = 0;
  modal: ((e: KeyboardEvent) => void) | null = null;
  onLockChange: (locked: boolean) => void = () => {};

  constructor(private canvas: HTMLCanvasElement) {
    addEventListener('keydown', (e) => {
      if (this.modal) { this.modal(e); return; }
      // typing a name or room code is not gameplay: an "M" must not mute the mic later
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable]')) return;
      if (e.code === 'Tab' && this.locked) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.rmb = false; });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked && !this.modal) { this.lock(); return; }
      if (e.button === 2) this.rmb = true;
      if (e.button === 0) this.pressed.add('Mouse0');
    });
    addEventListener('mouseup', (e) => { if (e.button === 2) this.rmb = false; });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      if (!this.locked) { this.rmb = false; this.keys.clear(); }
      this.onLockChange(this.locked);
    });
  }

  get locked() { return document.pointerLockElement === this.canvas; }

  lock() {
    // Some browsers reject the promise when called too soon after an unlock; retrying on the next click is fine.
    const p = this.canvas.requestPointerLock?.() as unknown as Promise<void> | undefined;
    p?.catch?.(() => {});
  }
  unlock() { if (this.locked) document.exitPointerLock(); }

  down(code: string) { return !this.modal && this.keys.has(code); }
  /** True once per physical key press. */
  hit(code: string) { return !this.modal && this.pressed.has(code); }

  /** Forget everything pressed so far (e.g. keys typed on the title screen). */
  reset() {
    this.keys.clear();
    this.pressed.clear();
    this.rmb = false;
    this.mouseDX = this.mouseDY = 0;
  }

  endFrame() {
    this.pressed.clear();
    this.mouseDX = this.mouseDY = 0;
    this.wheel = 0;
  }
}
