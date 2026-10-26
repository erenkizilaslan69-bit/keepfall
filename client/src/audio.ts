// Sound: real recordings (CC0, public/audio: Kenney's interface, impact and RPG packs, RandomMind's music; see the README) played through
// the Web Audio API, with the sounds made on the spot (a few oscillators and a burst of filtered noise) as the fallback for any sound without a
// recording (arrows, the win and lose jingles) or whose file did not load. Ogg Vorbis where the browser plays it, MP3 otherwise (Safari).
// Music and effects have their own volumes. The player's choice (on/off, volumes) is kept in localStorage; reading or writing it may fail
// (private windows, blocked storage) and then the defaults simply apply.

export type SoundName =
  | 'click' | 'sword' | 'arrow' | 'death' | 'castleHit' | 'castleFall'
  | 'warning' | 'scoutBack' | 'battleStart' | 'win' | 'lose'
  | 'shield' | 'uiConfirm' | 'uiError' | 'uiOpen' | 'uiClose';

interface Prefs { muted: boolean; volume: number; music: number }

const KEY = 'keepfall.sound';
/** Quiet by default: the game is played with other things on. */
const DEFAULTS: Prefs = { muted: false, volume: 0.3, music: 0.2 };
/** The slider's 0–1 becomes this much of the full level. */
const MASTER_SCALE = 0.5;
/** Music is further down still: it must stay under the fights. */
const MUSIC_SCALE = 0.5;

/**
 * Recordings by sound: one of the files is picked at random (a little pitch variation on top), `gain` evens out the loudness,
 * and with `layers` all of them play together, a little apart (a castle falling is a few heavy things breaking).
 */
interface Bank { files: string[]; gain: number; layers?: boolean }
const SAMPLES: Partial<Record<SoundName, Bank>> = {
  click: { files: ['ui-click-1', 'ui-click-2', 'ui-click-3'], gain: 0.7 },
  uiConfirm: { files: ['ui-confirm'], gain: 0.7 },
  uiError: { files: ['ui-error'], gain: 0.6 },
  uiOpen: { files: ['ui-open'], gain: 0.5 },
  uiClose: { files: ['ui-close'], gain: 0.5 },
  sword: { files: ['sword-1', 'sword-2', 'sword-3'], gain: 0.8 },
  shield: { files: ['shield-1', 'shield-2'], gain: 0.8 },
  death: { files: ['death-1', 'death-2'], gain: 0.7 },
  castleHit: { files: ['castleHit-1', 'castleHit-2'], gain: 1 },
  castleFall: { files: ['castleFall-1', 'castleFall-2', 'castleFall-3'], gain: 1, layers: true },
  battleStart: { files: ['battleStart'], gain: 0.9 },
  warning: { files: ['warning'], gain: 0.9 },
};
/** At most this many sounds at once; a crowded battle plays the first few and drops the rest. */
const MAX_VOICES = 8;
/** The same sound is not played again within this many ms (hundreds of hits in a big battle would be a roar of clicks). */
const MIN_GAP_MS: Record<SoundName, number> = {
  click: 25, sword: 70, arrow: 110, death: 120, castleHit: 300, castleFall: 1500,
  warning: 2500, scoutBack: 800, battleStart: 2000, win: 3000, lose: 3000,
  shield: 90, uiConfirm: 80, uiError: 150, uiOpen: 60, uiClose: 60,
};

/** Ogg Vorbis is the small one, but Safari (older ones: all) cannot play it. */
const EXT = ((): 'ogg' | 'mp3' => {
  try { return new Audio().canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'mp3'; } catch { return 'mp3'; }
})();

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as Partial<Prefs>;
    return {
      muted: p.muted === true,
      volume: typeof p.volume === 'number' && p.volume >= 0 && p.volume <= 1 ? p.volume : DEFAULTS.volume,
      music: typeof p.music === 'number' && p.music >= 0 && p.music <= 1 ? p.music : DEFAULTS.music,
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
  /** Where the music plays into (its own level). */
  musicBus: GainNode | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private loading = false;
  private readonly unlocked: (() => void)[] = [];
  private noise: AudioBuffer | null = null;
  private voices = 0;
  private lastAt = new Map<SoundName, number>();

  get muted(): boolean { return this.prefs.muted; }
  get volume(): number { return this.prefs.volume; }
  get musicVolume(): number { return this.prefs.music; }
  /** The audio context, once there is one (after the first click). */
  get audioContext(): AudioContext | null { return this.ctx; }

  setMusicVolume(music: number): void {
    this.prefs = { ...this.prefs, music: Math.min(1, Math.max(0, music)) };
    savePrefs(this.prefs);
    this.applyLevel();
  }

  /** Something that must start once sound is allowed (the music). Runs at once if it already is. */
  whenUnlocked(fn: () => void): void {
    if (this.ctx?.state === 'running') fn(); else this.unlocked.push(fn);
  }

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
    if (!ctx) return;
    const ready = () => { void this.load(); for (const fn of this.unlocked.splice(0)) fn(); };
    if (ctx.state === 'suspended') void ctx.resume().then(ready).catch(() => {});
    else ready();
  }

  /** The recordings are fetched once, after the first click; until a file is there (or if it never comes) the made-up sound plays. */
  private async load(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || this.loading) return;
    this.loading = true;
    const names = [...new Set(Object.values(SAMPLES).flatMap((b) => b?.files ?? []))];
    await Promise.all(names.map(async (name) => {
      try {
        const res = await fetch(`/audio/sfx/${name}.${EXT}`);
        if (!res.ok) return;
        this.buffers.set(name, await ctx.decodeAudioData(await res.arrayBuffer()));
      } catch { /* this one stays made-up */ }
    }));
  }

  /** Plays a recording from the bank; false if none of its files is loaded. */
  private sample(ctx: AudioContext, bank: Bank, v: number, out: { seconds: number }): boolean {
    const have = bank.files.filter((f) => this.buffers.has(f));
    if (have.length === 0) return false;
    const files = bank.layers ? have : [have[Math.floor(Math.random() * have.length)]];
    files.forEach((file, i) => {
      const buf = this.buffers.get(file)!;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = 0.94 + Math.random() * 0.12;
      const amp = ctx.createGain();
      amp.gain.value = bank.gain * v;
      src.connect(amp).connect(this.master!);
      const delay = i * 0.14;
      src.start(ctx.currentTime + delay);
      out.seconds = Math.max(out.seconds, delay + buf.duration / src.playbackRate.value);
    });
    return true;
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
    const bank = SAMPLES[name];
    const heard = { seconds: 0 };
    if (bank && this.sample(ctx, bank, v, heard)) return Math.min(4, heard.seconds);
    switch (name) {
      case 'shield':
        return this.make('sword', ctx, v);
      case 'uiConfirm':
        [660, 880].forEach((f, i) => this.tone(ctx, f, f, 0.08, 'triangle', 0.12 * v, i * 0.07));
        return 0.2;
      case 'uiError':
        this.tone(ctx, 220, 160, 0.16, 'square', 0.1 * v);
        return 0.18;
      case 'uiOpen':
      case 'uiClose':
        this.tone(ctx, name === 'uiOpen' ? 420 : 560, name === 'uiOpen' ? 560 : 420, 0.07, 'triangle', 0.08 * v);
        return 0.09;
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
      this.musicBus = this.ctx.createGain();
      this.musicBus.connect(this.ctx.destination);
      this.applyLevel();
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  private applyLevel(): void {
    if (this.master) this.master.gain.value = this.prefs.muted ? 0 : this.prefs.volume * MASTER_SCALE;
    if (this.musicBus) this.musicBus.gain.value = this.prefs.muted ? 0 : this.prefs.music * MUSIC_SCALE;
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

export type Track = 'prep' | 'war';
const FADE = 2.5; // seconds of crossfade between the tracks

/**
 * Two loops: calm for the preparation (and the lobby, the end of a match), lively for the war. A change of phase fades one out as the other
 * comes in. Nothing plays before the first click (the browser would refuse); the track asked for by then starts at that click.
 */
class Music {
  private want: Track | null = null;
  private current: { track: Track; gain: GainNode; src: AudioBufferSourceNode } | null = null;
  private readonly buffers = new Map<Track, AudioBuffer>();
  private readonly loading = new Set<Track>();

  /** Which track should be playing now. */
  scene(track: Track): void {
    this.want = track;
    sfx.whenUnlocked(() => this.apply());
  }

  private apply(): void {
    const ctx = sfx.audioContext, bus = sfx.musicBus, want = this.want;
    if (!ctx || !bus || !want || ctx.state !== 'running' || this.current?.track === want) return;
    const buffer = this.buffers.get(want);
    if (!buffer) { void this.fetch(want); return; }
    const t = ctx.currentTime;
    const old = this.current;
    if (old) {
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setValueAtTime(old.gain.gain.value, t);
      old.gain.gain.linearRampToValueAtTime(0, t + FADE);
      old.src.stop(t + FADE + 0.1);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + FADE);
    src.connect(gain).connect(bus);
    src.start(t);
    this.current = { track: want, gain, src };
  }

  private async fetch(track: Track): Promise<void> {
    const ctx = sfx.audioContext;
    if (!ctx || this.loading.has(track)) return;
    this.loading.add(track);
    try {
      const res = await fetch(`/audio/music/${track}.mp3`);
      if (!res.ok) return;
      this.buffers.set(track, await ctx.decodeAudioData(await res.arrayBuffer()));
      this.apply();
    } catch { /* no music then */ } finally { this.loading.delete(track); }
  }
}

export const music = new Music();
