import { readSetting, writeSetting } from "../utils/storage";

export type SfxName =
  | "lightAttack"
  | "heavyAttack"
  | "hit"
  | "guard"
  | "electric"
  | "explosion"
  | "jump"
  | "fall"
  | "win"
  | "lose";

/**
 * Looping match BGM, streamed from `public/audio` — Vite copies that verbatim
 * rather than bundling it, which is what a 3.7 MB track wants. `BASE_URL` keeps
 * the path resolvable under the GitHub Pages sub-path as well as at the root.
 */
const MUSIC_URL = `${import.meta.env.BASE_URL}audio/crown_of_the_fallen_king.mp3`;

/** BGM sits under the SFX so hits and specials still cut through it. */
const MUSIC_LEVEL = 0.4;

/**
 * Every sound effect is generated procedurally via the Web Audio API
 * (oscillators + noise buffers) — no sample assets. The only external audio is
 * the BGM track, streamed through the same master gain so one volume slider
 * governs everything.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private volume = 0.6;
  private noiseBuffer: AudioBuffer | null = null;
  private musicGain: GainNode | null = null;
  private music: HTMLAudioElement | null = null;

  constructor() {
    const stored = readSetting("joebra_volume");
    if (stored !== null) this.volume = parseFloat(stored);
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new Ctx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = MUSIC_LEVEL;
      this.musicGain.connect(this.masterGain);
      this.noiseBuffer = this.createNoiseBuffer(this.ctx);
    }
    return this.ctx;
  }

  /** Must be called from a user gesture to satisfy browser autoplay policies. */
  resume(): void {
    const ctx = this.ensureContext();
    if (ctx.state === "suspended") ctx.resume();
    this.startMusic();
  }

  /**
   * Starts the looping BGM, once. Called from `resume` rather than at
   * construction because browsers refuse to start audio before a gesture.
   *
   * A missing or unplayable track is not fatal: the match is perfectly
   * playable with SFX alone, so failures are logged and swallowed.
   */
  private startMusic(): void {
    if (this.music) return;
    const ctx = this.ensureContext();
    const el = new Audio(MUSIC_URL);
    el.loop = true;
    el.preload = "auto";
    el.addEventListener("error", () => console.warn(`BGM unavailable: ${MUSIC_URL}`));
    this.music = el;
    ctx.createMediaElementSource(el).connect(this.musicGain!);
    el.play().catch((err) => console.warn("BGM could not start:", err));
  }

  /** Silences the BGM while the match is paused, leaving SFX (menu blips) audible. */
  setMusicPaused(paused: boolean): void {
    if (!this.music) return;
    if (paused) this.music.pause();
    else this.music.play().catch((err) => console.warn("BGM could not resume:", err));
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.masterGain) this.masterGain.gain.value = this.volume;
    writeSetting("joebra_volume", String(this.volume));
  }

  getVolume(): number {
    return this.volume;
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const len = ctx.sampleRate * 0.5;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  play(name: SfxName): void {
    if (!this.ctx) return; // audio not yet unlocked by a user gesture
    const ctx = this.ctx;
    const now = ctx.currentTime;
    switch (name) {
      case "lightAttack":
        this.tone(now, 340, 180, "square", 0.12, 0.06);
        break;
      case "heavyAttack":
        this.tone(now, 140, 90, "sawtooth", 0.22, 0.16);
        break;
      case "hit":
        this.noiseHit(now, 0.12, 1800);
        this.tone(now, 220, 90, "square", 0.15, 0.08);
        break;
      case "guard":
        this.tone(now, 620, 620, "square", 0.08, 0.05);
        break;
      case "electric":
        this.crackle(now);
        break;
      case "explosion":
        this.noiseHit(now, 0.5, 500, 0.4);
        this.tone(now, 80, 40, "sawtooth", 0.4, 0.3);
        break;
      case "jump":
        this.tone(now, 300, 520, "sine", 0.14, 0.08);
        break;
      case "fall":
        this.tone(now, 420, 90, "sine", 0.3, 0.15);
        break;
      case "win":
        this.melody(now, [523, 659, 784, 1047]);
        break;
      case "lose":
        this.melody(now, [392, 349, 293, 220]);
        break;
    }
  }

  private tone(
    start: number,
    freqFrom: number,
    freqTo: number,
    type: OscillatorType,
    duration: number,
    gainAmount: number
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqFrom, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), start + duration);
    gain.gain.setValueAtTime(gainAmount, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  private noiseHit(start: number, duration: number, filterFreq: number, amount = 0.3): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(amount, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain!);
    src.start(start);
    src.stop(start + duration + 0.02);
  }

  private crackle(start: number): void {
    const ctx = this.ctx!;
    for (let i = 0; i < 6; i++) {
      const t = start + i * 0.035;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = 900 + Math.random() * 1400;
      gain.gain.setValueAtTime(0.09, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(t);
      osc.stop(t + 0.04);
    }
  }

  private melody(start: number, notes: number[]): void {
    notes.forEach((freq, i) => {
      const t = start + i * 0.16;
      this.tone(t, freq, freq, "triangle", 0.22, 0.14);
    });
  }
}
