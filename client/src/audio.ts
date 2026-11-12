import { asset } from './env';
// Sound: real recordings (CC0, public/audio: Kenney's interface and impact packs, OpenGameArt's CC0 recordings, RandomMind's music; sources in docs/ses-lisanslari.md) played through
// the Web Audio API, with the sounds made on the spot (a few oscillators and a burst of filtered noise) as the fallback for any sound without a
// recording (arrows, the win and lose jingles) or whose file did not load. Ogg Vorbis where the browser plays it, MP3 otherwise (Safari).
// Music and effects have their own volumes. The player's choice (on/off, volumes) is kept in localStorage; reading or writing it may fail
// (private windows, blocked storage) and then the defaults simply apply.

export type SoundName =
  | 'click' | 'sword' | 'arrow' | 'death' | 'castleHit' | 'castleFall'
  | 'warning' | 'scoutBack' | 'envoy' | 'battleStart' | 'win' | 'lose'
  | 'shield' | 'uiConfirm' | 'uiError' | 'uiOpen' | 'uiClose'
  | 'catapult' | 'stone' | 'upgrade' | 'march' | 'gallop' | 'arrowHit';

interface Prefs { muted: boolean; volume: number; music: number; /** over both (1 = as set) */ master?: number }

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
interface Bank { files: string[]; gain: number; layers?: boolean; /** how often each file is picked (default: all alike) */ weights?: number[] }
const SAMPLES: Partial<Record<SoundName, Bank>> = {
  click: { files: ['ui-click-1', 'ui-click-2', 'ui-click-3'], gain: 0.7 },
  uiConfirm: { files: ['ui-confirm'], gain: 0.7 },
  uiError: { files: ['ui-error'], gain: 0.6 },
  uiOpen: { files: ['ui-open'], gain: 0.5 },
  uiClose: { files: ['ui-close'], gain: 0.5 },
  // Two slices to one clash: a third of the blows clash, the rest slice (clashes ring: they must not pile up).
  sword: { files: ['sword-clash-1', 'sword-slice-1', 'sword-slice-2'], gain: 0.8, weights: [1, 1, 1] },
  // An archer's shot: the string's release and the arrow in flight (a real longbow and recurve, CC0). The arrow sticking in is a dull thud.
  arrow: { files: ['bow-shot'], gain: 0.85 },
  arrowHit: { files: ['arrow-hit'], gain: 0.7 },
  catapult: { files: ['catapult-launch'], gain: 0.9 },
  stone: { files: ['stone-1', 'stone-2', 'stone-3'], gain: 0.9 },
  upgrade: { files: ['upgrade'], gain: 0.8 },
  march: { files: ['march-1', 'march-2', 'march-3'], gain: 0.5 },
  shield: { files: ['shield-1', 'shield-2'], gain: 0.8 },
  death: { files: ['death-1', 'death-2'], gain: 0.7 },
  castleHit: { files: ['gate-1', 'gate-2', 'gate-3'], gain: 1 }, // (castleHit-1/2 were low bells: not used)
  castleFall: { files: ['castle-collapse'], gain: 1 },
  win: { files: ['victory'], gain: 0.8 },
  battleStart: { files: ['battleStart'], gain: 0.9 },
  warning: { files: ['warning'], gain: 0.9 },
  // An envoy's arrival: two wooden knocks (cut from the gate recordings; the Kenney bell it had before rang too much).
  envoy: { files: ['envoy'], gain: 0.9 },
  // A scout back home: a single wooden knock.
  scoutBack: { files: ['knock'], gain: 0.9 },
};
/** At most this many sounds at once; a crowded battle plays the first few and drops the rest. */
const MAX_VOICES = 10;
/** Looping recordings (not sounds that are played once): the camp fire. */
const AMBIENT_FILES = ['campfire-loop', 'horse-gallop-loop'];
/** The looping ambient sounds: which recording, and how loud at full (the loudness asked for is multiplied by it). */
const AMBIENTS = { fire: { file: 'campfire-loop', gain: 0.8 }, gallop: { file: 'horse-gallop-loop', gain: 0.6 } } as const;
export type AmbientName = keyof typeof AMBIENTS;
/** The same sound is not played again within this many ms (hundreds of hits in a big battle would be a roar of clicks). */
const MIN_GAP_MS: Record<SoundName, number> = {
  click: 25, sword: 70, arrow: 110, death: 120, castleHit: 300, castleFall: 1500,
  warning: 2500, scoutBack: 800, envoy: 1500, battleStart: 2000, win: 3000, lose: 3000,
  shield: 90, uiConfirm: 80, uiError: 150, uiOpen: 60, uiClose: 60,
  catapult: 400, stone: 250, upgrade: 300, march: 450, gallop: 2400, arrowHit: 70,
};
/** At most this many of one sound at the same time: a hundred archers are one full volley, not a hundred bow strings. */
const MAX_SAME: Partial<Record<SoundName, number>> = { arrow: 3, arrowHit: 3, sword: 4, shield: 3, death: 3 };

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
      master: typeof p.master === 'number' && p.master >= 0 && p.master <= 1 ? p.master : 1,
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

  /** The host site (CrazyGames) asked for silence: it wins over the player's own setting and is not remembered. */
  private siteMuted = false;
  private get silent(): boolean { return this.prefs.muted || this.siteMuted; }
  setSiteMuted(on: boolean): void { this.siteMuted = on; this.applyLevel(); }

  get muted(): boolean { return this.prefs.muted; }
  get volume(): number { return this.prefs.volume; }
  get musicVolume(): number { return this.prefs.music; }
  /** The level over both the effects and the music (1 = as they are set). */
  get masterVolume(): number { return this.prefs.master ?? 1; }
  setMasterVolume(master: number): void {
    this.prefs = { ...this.prefs, master: Math.min(1, Math.max(0, master)) };
    savePrefs(this.prefs);
    this.applyLevel();
  }
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
    const names = [...new Set([...Object.values(SAMPLES).flatMap((b) => b?.files ?? []), ...AMBIENT_FILES])];
    await Promise.all(names.map(async (name) => {
      try {
        const res = await fetch(asset(`/audio/sfx/${name}.${EXT}`));
        if (!res.ok) return;
        this.buffers.set(name, await ctx.decodeAudioData(await res.arrayBuffer()));
      } catch { /* this one stays made-up */ }
    }));
  }

  /** Plays a recording from the bank; false if none of its files is loaded. */
  private sample(ctx: AudioContext, bank: Bank, v: number, out: { seconds: number }): boolean {
    const have = bank.files.filter((f) => this.buffers.has(f));
    if (have.length === 0) return false;
    const files = bank.layers ? have : [this.pick(bank, have)];
    files.forEach((file, i) => {
      const buf = this.buffers.get(file)!;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = 0.9 + Math.random() * 0.2; // a little pitch variation, so the same recording never sounds the same twice
      const amp = ctx.createGain();
      amp.gain.value = bank.gain * v * (0.88 + Math.random() * 0.24);
      src.connect(amp).connect(this.master!);
      const delay = i * 0.14;
      src.start(ctx.currentTime + delay);
      out.seconds = Math.max(out.seconds, delay + buf.duration / src.playbackRate.value);
    });
    return true;
  }

  /** One of the loaded files, by the bank's weights (all alike without). */
  private pick(bank: Bank, have: string[]): string {
    const w = have.map((f) => bank.weights?.[bank.files.indexOf(f)] ?? 1);
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < have.length; i++) { r -= w[i]; if (r <= 0) return have[i]; }
    return have[have.length - 1];
  }

  /** <paramref name="loudness"/> 0–1: how loud this one is (e.g. far from the camera = quieter). */
  private readonly same = new Map<SoundName, number>();

  play(name: SoundName, loudness = 1): void {
    if (this.silent || this.prefs.volume <= 0 || loudness <= 0.02) return;
    const now = performance.now();
    if (now - (this.lastAt.get(name) ?? -1e9) < MIN_GAP_MS[name]) return;
    if (this.voices >= MAX_VOICES) return;
    const cap = MAX_SAME[name];
    if (cap !== undefined && (this.same.get(name) ?? 0) >= cap) return;
    const ctx = this.context();
    if (!ctx || ctx.state !== 'running') { if (ctx?.state === 'suspended') void ctx.resume().catch(() => {}); return; }
    this.lastAt.set(name, now);
    try {
      const seconds = this.make(name, ctx, Math.min(1, loudness));
      if (name === 'castleFall' || name === 'win' || name === 'lose') this.duckMusic(name === 'castleFall' ? 1.6 : 2.4);
      this.voices++;
      this.same.set(name, (this.same.get(name) ?? 0) + 1);
      window.setTimeout(() => { this.voices = Math.max(0, this.voices - 1); this.same.set(name, Math.max(0, (this.same.get(name) ?? 1) - 1)); }, seconds * 1000 + 60);
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
      case 'arrowHit':
        this.noise_(ctx, 0.05, 'lowpass', 900, 300, 0.2 * v);
        return 0.06;
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
      case 'envoy': // fallback if the bell did not load: two low bell-like strokes
        this.tone(ctx, 392, 392, 0.7, 'sine', 0.3 * v);
        this.tone(ctx, 588, 588, 0.9, 'sine', 0.2 * v, 0.02);
        return 0.9;
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
      case 'catapult':
        this.noise_(ctx, 0.3, 'bandpass', 400, 1400, 0.35 * v, 1);
        return 0.3;
      case 'stone':
        this.tone(ctx, 140, 50, 0.3, 'sine', 0.4 * v);
        this.noise_(ctx, 0.25, 'lowpass', 900, 200, 0.3 * v);
        return 0.3;
      case 'upgrade':
        this.tone(ctx, 600, 520, 0.08, 'square', 0.12 * v);
        return 0.1;
      case 'march':
        this.noise_(ctx, 0.08, 'lowpass', 600, 250, 0.16 * v);
        return 0.1;
      case 'gallop':
        this.noise_(ctx, 0.07, 'lowpass', 500, 200, 0.14 * v);
        return 0.2;
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

  /** The music steps back for a moment (a castle falls, the match ends) and comes up again. */
  private duckMusic(seconds: number): void {
    const ctx = this.ctx, bus = this.musicBus;
    if (!ctx || !bus || this.silent) return;
    const full = this.prefs.music * MUSIC_SCALE, t = ctx.currentTime;
    bus.gain.cancelScheduledValues(t);
    bus.gain.setValueAtTime(bus.gain.value, t);
    bus.gain.linearRampToValueAtTime(full * 0.3, t + 0.15);
    bus.gain.linearRampToValueAtTime(full, t + seconds);
  }

  private readonly ambient = new Map<AmbientName, { src: AudioBufferSourceNode; gain: GainNode }>();
  /** A looping ambient sound (the camp fire, a cavalry column) as loud as the camera is close to it (0 = none): the loop starts when first wanted and fades with distance. */
  setAmbient(name: AmbientName, level: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const want = this.silent || this.prefs.volume <= 0 ? 0 : Math.max(0, Math.min(1, level));
    let loop = this.ambient.get(name);
    if (!loop) {
      const buf = this.buffers.get(AMBIENTS[name].file);
      if (!buf || want < 0.02) return;
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain).connect(this.master!);
      src.start();
      loop = { src, gain };
      this.ambient.set(name, loop);
    }
    loop.gain.gain.setTargetAtTime(want * AMBIENTS[name].gain, ctx.currentTime, 0.3);
  }

  /** The crackle of the camp fire. */
  setFire(level: number): void { this.setAmbient('fire', level); }

  private applyLevel(): void {
    const all = this.prefs.master ?? 1;
    if (this.master) this.master.gain.value = this.silent ? 0 : this.prefs.volume * all * MASTER_SCALE;
    if (this.musicBus) this.musicBus.gain.value = this.silent ? 0 : this.prefs.music * all * MUSIC_SCALE;
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

export type Track = 'lobby' | 'prep' | 'war' | 'start';
/** The files (a new name when a recording is replaced: a browser keeps the old file under the old name; the preparation loop was `prep.mp3` first). */
const MUSIC_FILE: Record<Track, string> = { lobby: 'lobby', prep: 'prep-bg', war: 'war-epic', start: 'start' }; // (war-epic: Pixabay, Kulakovka; looped seamlessly at the file level, see docs/ses-lisanslari.md)
const FADE = 2.5; // seconds of crossfade between the tracks
const WAR_FADE = 3.5; // the preparation music gives way to the war music more slowly

/**
 * The music, as a flow: the menu/lobby loop (`lobby`) in the menus, the lobby and after a match; when the clouds part on a match the opening piece (`start`)
 * plays ONCE and the preparation loop (`prep`) comes in softly under its end; the war loop (`war`) takes over when the war begins; at the end of a match
 * the music steps back for the victory/defeat sound and the menu loop returns after it. A change fades one out as the other comes in. Nothing plays
 * before the first click (the browser would refuse); the track asked for by then starts at that click.
 *
 * `base` is the track that SHOULD be playing; `blocked` is true while the opening piece is pending or playing (then `scene()` only changes `base`, and
 * the piece hands over to it). `target` is what is being played now.
 */
class Music {
  private base: Track = 'lobby';
  private blocked = false;
  private target: Track | null = null;
  private current: { track: Track; gain: GainNode; src: AudioBufferSourceNode } | null = null;
  private readonly buffers = new Map<Track, AudioBuffer>();
  private readonly loading = new Set<Track>();
  private fade = FADE;
  private timer = 0;
  private quietTimer = 0;

  /** Which track should be playing now (not `start`: use `intro`). */
  scene(track: Exclude<Track, 'start'>): void {
    window.clearTimeout(this.quietTimer);
    this.base = track;
    if (this.blocked) return;
    this.go(track, track === 'war' ? WAR_FADE : FADE); // (a slower crossfade from the preparation music into the war)
  }

  /** The clouds have parted on a match: the opening piece plays once (whatever plays fades out under it), then `after` comes in softly. */
  intro(after: Exclude<Track, 'start'> = 'prep'): void {
    window.clearTimeout(this.quietTimer);
    this.base = after;
    this.blocked = true;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.endIntro(), 4000); // if the piece cannot start (not loaded, no sound yet), the music is not held up for good
    this.go('start', 1.2);
  }

  /** The match is over: the music fades out for the victory/defeat sound, and `track` returns `afterSeconds` later. */
  hushThen(track: Exclude<Track, 'start'>, afterSeconds: number): void {
    window.clearTimeout(this.timer);
    window.clearTimeout(this.quietTimer);
    this.blocked = false;
    this.base = track;
    this.target = null;
    const ctx = sfx.audioContext, old = this.current;
    if (ctx && old) {
      const t = ctx.currentTime;
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setValueAtTime(old.gain.gain.value, t);
      old.gain.gain.linearRampToValueAtTime(0, t + 1.2);
      old.src.stop(t + 1.3);
      this.current = null;
    }
    this.quietTimer = window.setTimeout(() => this.scene(this.base as Exclude<Track, 'start'>), afterSeconds * 1000);
  }

  private endIntro(): void {
    window.clearTimeout(this.timer);
    this.blocked = false;
    this.go(this.base, 3);
  }

  private go(track: Track, fade: number): void {
    this.target = track;
    this.fade = fade;
    sfx.whenUnlocked(() => this.apply());
  }

  private apply(): void {
    const ctx = sfx.audioContext, bus = sfx.musicBus, want = this.target;
    if (!ctx || !bus || !want || ctx.state !== 'running' || this.current?.track === want) return;
    const buffer = this.buffers.get(want);
    if (!buffer) { void this.fetch(want); return; }
    const t = ctx.currentTime;
    const old = this.current;
    if (old) {
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setValueAtTime(old.gain.gain.value, t);
      old.gain.gain.linearRampToValueAtTime(0, t + this.fade);
      old.src.stop(t + this.fade + 0.1);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = want !== 'start'; // the opening piece plays once
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + this.fade);
    src.connect(gain).connect(bus);
    src.start(t);
    this.current = { track: want, gain, src };
    // the war music is fetched while the preparation plays, so it is there the moment the war begins
    if ((want === 'prep' || want === 'start') && !this.buffers.has('war')) void this.fetch('war');
    if (want === 'start') {
      // the next track comes in softly while the piece is dying away
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.endIntro(), Math.max(0, buffer.duration - 2.5) * 1000);
    }
  }

  private async fetch(track: Track, tries = 0): Promise<void> {
    const ctx = sfx.audioContext;
    if (!ctx || this.loading.has(track)) return;
    this.loading.add(track);
    try {
      // ogg where the browser plays it (smaller and gapless for the loops), mp3 otherwise
      const res = await fetch(asset(`/audio/music/${MUSIC_FILE[track]}.${EXT}`));
      if (!res.ok) throw new Error(String(res.status));
      this.buffers.set(track, await ctx.decodeAudioData(await res.arrayBuffer()));
      this.loading.delete(track);
      this.apply(); // (only if it is still the one wanted: apply reads the target)
    } catch {
      this.loading.delete(track);
      if (tries < 2) window.setTimeout(() => void this.fetch(track, tries + 1), 1500); // a flaky connection: try again
    }
  }
}

export const music = new Music();
