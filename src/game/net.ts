import {
  insertCoin, onPlayerJoin, myPlayer, isHost, getState, setState, RPC, getRoomCode,
  type PlayerState,
} from 'playroomkit';
import type { Action, CreatureNet, Fx, GameState, PlayerNet } from './state';

// Thin wrapper over Playroom Kit. Room state:
//   g  GameState    reliable, host writes on change
//   c  CreatureNet  unreliable, host writes ~10 Hz
// Player state: p (pose, unreliable ~12 Hz), hold, model.

export class Net {
  readonly players = new Map<string, PlayerState>();
  onJoin: (p: PlayerState) => void = () => {};
  onQuit: (p: PlayerState) => void = () => {};
  onAction: (a: Action, from: PlayerState) => void = () => {};
  onFx: (f: Fx) => void = () => {};
  onSignal: (msg: any, from: PlayerState) => void = () => {};

  /**
   * Join `roomCode`, or create a new room (Playroom generates a 4-character code) when omitted.
   * The game has its own lobby on the title screen, so Playroom's lobby (with its QR code) is skipped.
   * Rejects with message "ROOM_LIMIT_EXCEEDED" when the room is full.
   */
  async start(opts: { roomCode?: string; name?: string } = {}) {
    const gameId = import.meta.env.VITE_PLAYROOM_GAME_ID as string | undefined;
    await insertCoin({
      ...(gameId ? { gameId } : {}),
      ...(opts.roomCode ? { roomCode: opts.roomCode } : {}),
      skipLobby: true,
      maxPlayersPerRoom: 4,
      reconnectGracePeriod: 20000,
      defaultPlayerStates: { hold: '', model: -1, name: '' },
    });
    if (opts.name) myPlayer().setState('name', opts.name.slice(0, 16), true);
    RPC.register('act', async (a: Action, from: PlayerState) => {
      if (isHost()) this.onAction(a, from);
    });
    RPC.register('fx', async (f: Fx) => { this.onFx(f); });
    RPC.register('rtc', async (msg: any, from: PlayerState) => {
      if (msg.to === myPlayer().id) this.onSignal(msg, from);
    });
    onPlayerJoin((p) => {
      this.players.set(p.id, p);
      this.onJoin(p);
      p.onQuit(() => {
        this.players.delete(p.id);
        this.onQuit(p);
      });
    });
  }

  get me() { return myPlayer(); }
  get isHost() { return isHost(); }
  get roomCode() { return getRoomCode(); }

  game(): GameState | undefined { return getState('g'); }
  setGame(g: GameState) { setState('g', g, true); }
  creature(): CreatureNet | undefined { return getState('c'); }
  setCreature(c: CreatureNet) { setState('c', c, false); }

  pose(p: PlayerState): PlayerNet['p'] | undefined { return p.getState('p'); }
  setPose(v: PlayerNet['p']) { myPlayer().setState('p', v, false); }

  /** The nickname typed on the title screen, else Playroom's generated name. */
  name(p: PlayerState | string | undefined) {
    const pl = typeof p === 'string' ? this.players.get(p) : p;
    const chosen = pl?.getState('name');
    return (typeof chosen === 'string' && chosen.trim().slice(0, 16)) || pl?.getProfile().name || '???';
  }
  color(p: PlayerState | string | undefined) {
    const pl = typeof p === 'string' ? this.players.get(p) : p;
    return pl?.getProfile().color?.hexString || '#cccccc';
  }

  act(a: Action) {
    if (isHost()) this.onAction(a, myPlayer());
    else RPC.call('act', a, RPC.Mode.HOST);
  }

  /** Broadcast an effect to everyone, including this client, exactly once. */
  fx(f: Fx) {
    this.onFx(f);
    RPC.call('fx', f, RPC.Mode.OTHERS);
  }

  signal(to: string, msg: object) {
    RPC.call('rtc', { ...msg, to }, RPC.Mode.OTHERS);
  }
}
