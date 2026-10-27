import Phaser from 'phaser';
import { traceOf, type TraceEvent } from '../debug-trace';
import type { Vec } from '../types';
import type { BattlePlayer } from './BattlePlayer';
import type { Movers } from './Movers';
import { toWorld } from './world';

// The debug layer (development only; F9 shows the panel): what is on the map, army by army, checked against what the server says, and a log of
// every fault with the trail of events that led to it (POST /api/client-log, kind "debug-layer", plus a red warning on screen).
//
// Faults it looks for:
//  * double       — an army with more drawings than soldiers it should have, or one id drawn as both ours and someone else's
//  * stray        — a unit sprite on the map that no army, replay, camp or worker owns (a leak: it is never deleted)
//  * deviation    — a column that was more than 2 tiles (plus what a fast game speed allows) from where the server put the army when the news came
//  * off-road     — an army drawn away from every road (a catapult standing on the beach)
//  * no-replay    — one of our armies has been fighting for seconds and no battle replay is being played for it
//  * late-replay  — a replay that began more than 1.5 seconds after the server began the battle
//  * leak         — a replay's soldiers still on screen seconds after it ended
// And the numbers over time: frames a second, sprites on the scene, tweens alive.

const UNIT_TEXTURE = /^(?:[a-z]+-)?(warrior|archer|lancer|pawn|monk|suvari|mancinik)-(idle|run|guard|attack|shoot|work|fire)/;
const TILE = 64;

export interface Violation { at: number; game: number; kind: string; id: string; message: string; trace: TraceEvent[] }
interface Sample { at: number; fps: number; children: number; units: number; tweens: number; armies: number; replays: number }

export class DebugLayer {
  readonly violations: Violation[] = [];
  readonly samples: Sample[] = [];
  private panel: HTMLElement;
  private warn: HTMLElement;
  private visible = false;
  private acc = 0;
  private sampleAcc = 0;
  private fpsSamples: number[] = [];
  private fightingSince = new Map<string, number>();
  private reported = new Map<string, number>();
  private lagsSeen = 0;
  private posted = 0;
  private roads: Vec[][] = [];

  constructor(private readonly scene: Phaser.Scene, private readonly movers: Movers, private readonly battles: BattlePlayer,
    private readonly extraSprites: () => Phaser.GameObjects.Sprite[], private readonly speed: () => number, private readonly gameNow: () => number) {
    this.panel = document.createElement('pre');
    this.panel.style.cssText = 'position:fixed;left:8px;top:48px;z-index:9999;margin:0;padding:6px 8px;background:rgba(0,0,0,.72);color:#9f9;font:11px/1.3 monospace;max-width:560px;max-height:70vh;overflow:auto;display:none;pointer-events:none;white-space:pre';
    this.warn = document.createElement('div');
    this.warn.style.cssText = 'position:fixed;left:50%;bottom:8px;transform:translateX(-50%);z-index:9999;padding:4px 10px;background:#b3261e;color:#fff;font:12px monospace;border-radius:4px;display:none;pointer-events:none;max-width:80vw';
    document.body.append(this.panel, this.warn);
    window.addEventListener('keydown', this.onKey);
    (window as unknown as { keepfallDebug: unknown }).keepfallDebug = this;
  }

  setRoads(roads: Vec[][]): void { this.roads = roads; }

  destroy(): void {
    window.removeEventListener('keydown', this.onKey);
    this.panel.remove();
    this.warn.remove();
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'F9') return;
    e.preventDefault();
    this.visible = !this.visible;
    this.panel.style.display = this.visible ? 'block' : 'none';
  };

  update(dt: number): void {
    this.fpsSamples.push(this.scene.game.loop.actualFps);
    this.acc += dt;
    this.sampleAcc += dt;
    if (this.acc >= 0.5) { this.acc = 0; this.check(); }
    if (this.sampleAcc >= 2) { this.sampleAcc = 0; this.sample(); }
    if (this.visible) this.draw();
  }

  // ---- checks ---------------------------------------------------------------------------------

  private unitSprites(): Phaser.GameObjects.Sprite[] {
    return this.scene.children.list.filter((o): o is Phaser.GameObjects.Sprite => o instanceof Phaser.GameObjects.Sprite && o.active && UNIT_TEXTURE.test(o.texture.key));
  }

  private check(): void {
    const tracks = this.movers.debugTracks();
    const replays = this.battles.debugReplays();

    // double: more drawings than expected; one id as both ours and someone else's
    for (const t of tracks) {
      if (t.drawn !== t.expected) this.fault('double', t.key, `${t.drawn} drawn, ${t.expected} expected`);
      if (t.key.startsWith('seen:') && tracks.some((o) => o.key === `own:${t.key.slice(5)}`)) this.fault('double', t.key, 'the same id is drawn as ours and as someone else\'s');
    }
    // two armies lying on each other with the same soldiers
    const armies = tracks.filter((t) => !t.scout && t.drawn > 0 && !t.fighting);
    for (let i = 0; i < armies.length; i++)
      for (let j = i + 1; j < armies.length; j++)
        if (armies[i].units === armies[j].units && Math.hypot(armies[i].shown.x - armies[j].shown.x, armies[i].shown.y - armies[j].shown.y) < 0.8)
          this.fault('double', `${armies[i].key}+${armies[j].key}`, 'two columns on top of each other with as many soldiers');

    // stray: a unit sprite nobody owns
    const owned = new Set<Phaser.GameObjects.GameObject>([...this.movers.debugSprites(), ...this.battles.debugSprites(), ...this.extraSprites()]);
    for (const s of this.unitSprites()) {
      if (owned.has(s)) continue;
      // a sprite that is fading out or being cleaned (alpha 0 / tweened) is given a moment
      if (s.alpha < 0.05) continue;
      const at = { x: Math.round(s.x / TILE), y: Math.round(s.y / TILE) };
      this.fault('stray', `${s.texture.key}@${at.x},${at.y}`, `an unowned ${s.texture.key} at ${at.x},${at.y} (depth ${Math.round(s.depth)}, alpha ${s.alpha.toFixed(2)})`);
    }

    // deviation from the server's position
    for (const c of this.movers.corrections.splice(0)) {
      const allowed = 2 + c.speed * 0.6;
      if (c.tiles > allowed) this.fault('deviation', c.key, `${c.tiles.toFixed(1)} tiles from the server's position (allowed ${allowed.toFixed(1)} at x${c.speed})`);
    }

    // off-road: an army away from every road
    for (const t of armies) {
      if (!t.route && this.roads.length === 0) continue;
      const near = this.distanceToRoads(t.shown);
      const onOwnRoute = t.route ? distanceToPolyline(t.route, t.shown) : Infinity;
      if (Math.min(near, onOwnRoute) > 1.6) this.fault('off-road', t.key, `drawn at ${t.shown.x.toFixed(1)},${t.shown.y.toFixed(1)}, ${Math.min(near, onOwnRoute).toFixed(1)} tiles from any road`);
    }
    for (const r of replays) {
      if (r.ended) continue;
    }

    // no-replay: ours fighting for seconds with no replay near
    const now = performance.now();
    for (const t of tracks) {
      if (!t.own || !t.fighting) { this.fightingSince.delete(t.key); continue; }
      const since = this.fightingSince.get(t.key) ?? now;
      this.fightingSince.set(t.key, since);
      const near = replays.some((r) => !r.ended && Math.hypot(r.at.x - t.position.x, r.at.y - t.position.y) < 4)
        || [...this.battles.endedAt.values()].some((at) => now - at < 3000);
      if (now - since > 4000 && !near) this.fault('no-replay', t.key, `fighting for ${((now - since) / 1000).toFixed(1)} s and no battle replay is being played near it`);
    }

    // late replays
    for (; this.lagsSeen < this.battles.lags.length; this.lagsSeen++) {
      const l = this.battles.lags[this.lagsSeen];
      if (l.lagReal > 1.5) this.fault('late-replay', l.id, `${l.kind} replay began ${l.lagReal.toFixed(1)} s (${l.lagGame.toFixed(1)} game s) after the server began the battle (fight lasts ${l.fight.toFixed(1)} s)`);
    }

    // leak: soldiers of an ended replay still there
    for (const [id, at] of this.battles.endedAt) {
      if (now - at < 2500) continue;
      const left = this.battles.debugSprites().filter((s) => s.active && s.alpha > 0.05).length;
      const r = replays.find((x) => x.id === id);
      if (r && r.alive > 0 && r.ended) this.fault('leak', id, `${r.alive} soldiers of the ended ${r.kind} replay are still on screen ${((now - at) / 1000).toFixed(1)} s later (${left} fighters alive in all)`);
    }
  }

  private distanceToRoads(p: Vec): number {
    let best = Infinity;
    for (const pts of this.roads) best = Math.min(best, distanceToPolyline(pts, p));
    return best;
  }

  private fault(kind: string, id: string, message: string): void {
    const key = `${kind}|${id}`;
    const now = performance.now();
    const last = this.reported.get(key);
    if (last !== undefined && now - last < 20_000) return;
    this.reported.set(key, now);
    const v: Violation = { at: Math.round(now), game: Math.round(this.gameNow() * 10) / 10, kind, id, message, trace: traceOf(id.replace(/^(own|seen):/, (m) => m), 25, 20) };
    this.violations.push(v);
    this.warn.textContent = `${kind}: ${id} — ${message}`;
    this.warn.style.display = 'block';
    window.setTimeout(() => { if (this.warn.textContent?.startsWith(`${kind}: ${id}`)) this.warn.style.display = 'none'; }, 6000);
    if (this.posted < 300) {
      this.posted++;
      const body = JSON.stringify({ kind: 'debug-layer', message: `${kind} ${id}: ${message}`, stack: JSON.stringify({ game: v.game, speed: this.speed(), trace: v.trace }), url: location.href, userAgent: navigator.userAgent });
      void fetch('/api/client-log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    }
  }

  // ---- numbers over time ------------------------------------------------------------------------

  private sample(): void {
    const f = this.fpsSamples.splice(0);
    const fps = f.length ? f.reduce((a, b) => a + b, 0) / f.length : 0;
    this.samples.push({
      at: Math.round(performance.now()), fps: Math.round(fps), children: this.scene.children.list.length, units: this.unitSprites().length,
      tweens: this.scene.tweens.getTweens().length, armies: this.movers.debugTracks().filter((t) => !t.scout).length, replays: this.battles.debugReplays().filter((r) => !r.ended).length,
    });
    if (this.samples.length > 4000) this.samples.shift();
  }

  /** For the soak test: faults by kind, frame rate and how the sprite counts moved. */
  report(): unknown {
    const byKind: Record<string, number> = {};
    for (const v of this.violations) byKind[v.kind] = (byKind[v.kind] ?? 0) + 1;
    const fps = this.samples.map((s) => s.fps).filter((x) => x > 0).sort((a, b) => a - b);
    const q = (p: number) => fps.length ? fps[Math.min(fps.length - 1, Math.floor(fps.length * p))] : 0;
    const last = this.samples[this.samples.length - 1];
    return {
      violations: this.violations.length, byKind, fps: { avg: fps.length ? Math.round(fps.reduce((a, b) => a + b, 0) / fps.length) : 0, p5: q(0.05), min: fps[0] ?? 0 },
      samples: this.samples.length, last, maxChildren: Math.max(0, ...this.samples.map((s) => s.children)), maxUnits: Math.max(0, ...this.samples.map((s) => s.units)),
      maxTweens: Math.max(0, ...this.samples.map((s) => s.tweens)), lags: this.battles.lags.length,
      worstLagReal: Math.max(0, ...this.battles.lags.map((l) => l.lagReal)),
    };
  }

  private draw(): void {
    const last = this.samples[this.samples.length - 1];
    const lines = [`F9 · fps ${Math.round(this.scene.game.loop.actualFps)} · children ${this.scene.children.list.length} · unit sprites ${this.unitSprites().length} · tweens ${this.scene.tweens.getTweens().length} · faults ${this.violations.length}`,
      `game ${this.gameNow().toFixed(0)} s · x${this.speed()} ${last ? '' : ''}`];
    for (const t of this.movers.debugTracks().filter((x) => !x.scout)) {
      const w = toWorld(t.position);
      lines.push(`${t.key.padEnd(14)} server ${t.position.x.toFixed(1)},${t.position.y.toFixed(1)} (${Math.round(w.x)},${Math.round(w.y)}) drawn ${t.drawn}/${t.expected}${t.fighting ? ' FIGHTING' : ''} · ${t.units} soldiers`);
    }
    for (const r of this.battles.debugReplays()) lines.push(`replay ${r.id.slice(0, 6)} ${r.kind} ${r.ended ? 'ended' : 'live'} alive ${r.alive}`);
    for (const v of this.violations.slice(-6)) lines.push(`! ${v.kind} ${v.id}: ${v.message}`);
    this.panel.textContent = lines.join('\n');
  }
}

function distanceToPolyline(pts: Vec[], p: Vec): number {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    const t = len2 < 1e-9 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    best = Math.min(best, Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t));
  }
  return best;
}
