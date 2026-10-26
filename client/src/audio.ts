// Sound effects, made on the spot with the Web Audio API: no files are downloaded. Each sound is a few oscillators and a burst of
// filtered noise. The player's choice (on/off, volume) is kept in localStorage; reading or writing it may fail (private windows,
// blocked storage) and then the defaults simply apply.

export type SoundName =
  | 'click' | 'sword' | 'arrow' | 'death' | 'castleHit' | 'castleFall'
  | 'warning' | 'scoutBack' | 'battleStart' | 'win' | 'lose';

interface Prefs { muted: boolean; volume: number }

const KEY = 'keepfall.sound';
/** Quiet by default: the game is played with other things on. */
const DEFAULTS: Prefs = { muted: false, volume: 0.3 };
/** The slider's 0–1 becomes this much of the full level. */
const MASTER_SCALE = 0.5;
/** At most this many sounds at once; a crowded battle plays the first few and drops the rest. */
const MAX_VOICES = 8;
/** The same sound is not played again within this many ms (hundreds of hits in a big battle would be a roar of clicks). */
const MIN_GAP_MS: Record<SoundName, number> = {
  click: 25, sword: 70, arrow: 110, death: 120, castleHit: 300, castleFall: 1500,
  warning: 2500, scoutBack: 800, battleStart: 2000, win: 3000, lose: 3000,
};

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as Partial<Prefs>;
    return {
      muted: p.muted === true,
      volume: typeof p.volume === 'number' && p.volume >= 0 && p.volume <= 1 ? p.volume : DEFAULTS.volume,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function savePrefs(p: Prefs): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage is not available: the choice lasts until the page is closed */ }
}

class Sfx {
  private prefs = loadPrefs();
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices = 0;
  private lastAt = new Map<SoundName, number>();

  get muted(): boolean { return this.prefs.muted; }
  get volume(): number { return this.prefs.volume; }

  setMuted(muted: boolean): void {
    this.prefs = { ...this.prefs, muted };
    savePrefs(this.prefs);
    this.applyLevel();
  }

  setVolume(volume: number): void {
    this.prefs = { ...this.prefs, volume: Math.min(1, Math.max(0, volume)) };
    savePrefs(this.prefs);
    this.applyLevel();
  }

  /** Browsers only let sound start after the player has done something: call this from a click or key press. */
  unlock(): void {
    const ctx = this.context();
    if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => {});
  }

  /** <paramref name="loudness"/> 0–1: how loud this one is (e.g. far from the camera = quieter). */
  play(name: SoundName, loudness = 1): void {
    if (this.prefs.muted || this.prefs.volume <= 0 || loudness <= 0.02) return;
    const now = performance.now();
    if (now - (this.lastAt.get(name) ?? -1e9) < MIN_GAP_MS[name]) return;
    if (this.voices >= MAX_VOICES) return;
    const ctx = this.context();
    if (!ctx || ctx.state !== 'running') { if (ctx?.state === 'suspended') void ctx.resume().catch(() => {}); return; }
    this.lastAt.set(name, now);
    try {
      const seconds = this.make(name, ctx, Math.min(1, loudness));
      this.voices++;
      window.setTimeout(() => { this.voices = Math.max(0, this.voices - 1); }, seconds * 1000 + 60);
    } catch {
      /* a sound that cannot be made is just not heard */
    }
  }

  // ---- the sounds ----------------------------------------------------------------------------

  /** Builds one sound starting now; returns how long it lasts (s). */
  private make(name: SoundName, ctx: AudioContext, v: number): number {
    switch (name) {
      case 'click':
        this.tone(ctx, 760, 520, 0.05, 'square', 0.12 * v);
        return 0.06;
      case 'sword':
        this.noise_(ctx, 0.07, 'bandpass', 2600, 1400, 0.4 * v, 1.5);
        this.tone(ctx, 1500 + Math.random() * 500, 900, 0.09, 'triangle', 0.14 * v);
        return 0.1;
      case 'arrow':
        this.noise_(ctx, 0.16, 'highpass', 1500, 5200, 0.22 * v);
        this.tone(ctx, 320, 180, 0.06, 'triangle', 0.1 * v);
        return 0.17;
      case 'death':
        this.tone(ctx, 260, 70, 0.28, 'sawtooth', 0.14 * v, 0, 700);
        this.noise_(ctx, 0.12, 'lowpass', 900, 300, 0.2 * v);
        return 0.3;
      case 'castleHit':
        this.tone(ctx, 110, 38, 0.35, 'sine', 0.5 * v);
        this.noise_(ctx, 0.3, 'lowpass', 700, 120, 0.4 * v);
        return 0.36;
      case 'castleFall':
        this.noise_(ctx, 1.1, 'lowpass', 900, 60, 0.55 * v);
        this.tone(ctx, 130, 30, 1.0, 'sawtooth', 0.28 * v, 0, 500);
        this.tone(ctx, 98, 24, 1.2, 'sine', 0.4 * v, 0.1);
        return 1.3;
      case 'warning':
        this.tone(ctx, 392, 392, 0.4, 'sawtooth', 0.2 * v, 0, 900);
        this.tone(ctx, 294, 294, 0.5, 'sawtooth', 0.2 * v, 0.45, 800);
        return 1;
      case 'scoutBack':
        [523, 659, 784].forEach((f, i) => this.tone(ctx, f, f, 0.12, 'triangle', 0.2 * v, i * 0.09));
        return 0.4;
      case 'battleStart':
        this.tone(ctx, 140, 60, 0.3, 'sine', 0.55 * v);
        this.tone(ctx, 140, 60, 0.3, 'sine', 0.55 * v, 0.25);
        this.tone(ctx, 330, 330, 0.55, 'sawtooth', 0.14 * v, 0.5, 700);
        return 1.1;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(ctx, f, f, 0.22, 'triangle', 0.26 * v, i * 0.14));
        this.tone(ctx, 1047, 1047, 0.7, 'triangle', 0.22 * v, 0.56);
        return 1.4;
      case 'lose':
        [392, 349, 311, 262].forEach((f, i) => this.tone(ctx, f, f * 0.97, 0.3, 'triangle', 0.26 * v, i * 0.2));
        this.tone(ctx, 196, 150, 0.9, 'sine', 0.3 * v, 0.8);
        return 1.8;
    }
  }

  /** One oscillator gliding from <paramref name="f0"/> to <paramref name="f1"/>, with a quick attack and a fade; <paramref name="cutoff"/> darkens it. */
  private tone(ctx: AudioContext, f0: number, f1: number, dur: number, type: OscillatorType, peak: number, delay = 0, cutoff = 0): void {
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let tail: AudioNode = osc;
    if (cutoff > 0) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = cutoff;
      osc.connect(lp);
      tail = lp;
    }
    tail.connect(amp).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** A burst of noise through a filter that sweeps from <paramref name="f0"/> to <paramref name="f1"/>. */
  private noise_(ctx: AudioContext, dur: number, type: BiquadFilterType, f0: number, f1: number, peak: number, q = 0.7): void {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(amp).connect(this.master!);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  // ---- plumbing ------------------------------------------------------------------------------

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.applyLevel();
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  private applyLevel(): void {
    if (this.master) this.master.gain.value = this.prefs.muted ? 0 : this.prefs.volume * MASTER_SCALE;
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noise) return this.noise;
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return this.noise = buffer;
  }
}

export const sfx = new Sfx();
