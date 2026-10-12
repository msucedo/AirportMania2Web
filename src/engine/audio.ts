import type { Resources } from '../data/resources';

const EFFECTS_LEVEL = 0.8;
const MUSIC_LEVEL = 0.45;

/**
 * Sound effects and music by resource id, on the Web Audio API.
 * Browsers only start audio after a user gesture, so everything is created lazily by `unlock()`.
 */
export class AudioPlayer {
  private context: AudioContext | null = null;
  private effects: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private music: AudioBufferSourceNode[] = [];
  /** Bumped whenever the music changes, so a slow load cannot start a stale track. */
  private musicToken = 0;
  private pendingMusic: (() => void) | null = null;
  muted = false;
  private volumes = { sound: 1, music: 1 };

  constructor(private readonly resources: Resources) {}

  get unlocked(): boolean {
    return this.context !== null;
  }

  /** Call from a pointer or key handler. Safe to call repeatedly. */
  unlock(): void {
    if (this.context) {
      void this.context.resume();
      return;
    }
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    this.context = new Context();
    this.effects = this.context.createGain();
    this.effects.gain.value = EFFECTS_LEVEL * this.volumes.sound;
    this.effects.connect(this.context.destination);
    this.musicGain = this.context.createGain();
    this.musicGain.gain.value = MUSIC_LEVEL * this.volumes.music;
    this.musicGain.connect(this.context.destination);
    this.pendingMusic?.();
    this.pendingMusic = null;
  }

  /** Player volumes from 0 to 1, on top of the mix levels. */
  setVolumes(sound: number, music: number): void {
    this.volumes = { sound, music };
    if (this.effects) this.effects.gain.value = EFFECTS_LEVEL * sound;
    if (this.musicGain) this.musicGain.gain.value = MUSIC_LEVEL * music;
  }

  /** Decodes samples ahead of time so the first play is not late. */
  preload(ids: Iterable<string>): void {
    if (!this.context) return;
    for (const id of ids) void this.buffer(id);
  }

  /** `pan` puts the sound between the speakers, −1 left to 1 right. */
  play(id: string, options: { pitch?: number; volume?: number; pan?: number } = {}): void {
    const { context, effects } = this;
    if (!context || !effects || this.muted) return;
    void this.buffer(id).then((buffer) => {
      if (!buffer) return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = options.pitch ?? 1;
      if (options.pan !== undefined) {
        const panner = context.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, options.pan));
        const gain = context.createGain();
        gain.gain.value = options.volume ?? 1;
        source.connect(panner).connect(gain).connect(effects);
      } else if (options.volume === undefined) {
        source.connect(effects);
      } else {
        const gain = context.createGain();
        gain.gain.value = options.volume;
        source.connect(gain).connect(effects);
      }
      source.start();
    });
  }

  /**
   * Starts a sound that repeats until stopped, such as an engine. The handle moves it between
   * the speakers (-1 left to 1 right) and stops it, fading over `fade` seconds. With `repeat` off
   * it plays once but can still be stopped. Returns null when sound is off.
   */
  loop(id: string, volume = 1, repeat = true, rise = 0): { pan(value: number): void; level(value: number): void; stop(fade?: number): void } | null {
    const { context, effects } = this;
    if (!context || !effects || this.muted) return null;
    const gain = context.createGain();
    // With `rise` it comes up to its volume over that many seconds.
    gain.gain.value = rise > 0 ? 0 : volume;
    if (rise > 0) gain.gain.linearRampToValueAtTime(volume, context.currentTime + rise);
    const panner = context.createStereoPanner();
    panner.connect(gain).connect(effects);
    let source: AudioBufferSourceNode | null = null;
    let stopped = false;
    void this.buffer(id).then((buffer) => {
      if (!buffer || stopped) return;
      source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = repeat;
      source.connect(panner);
      source.start();
    });
    return {
      pan: (value) => {
        panner.pan.value = Math.max(-1, Math.min(1, value));
      },
      level: (value) => {
        gain.gain.value = Math.max(0, value);
      },
      stop: (fade = 0) => {
        if (stopped) return;
        stopped = true;
        gain.gain.linearRampToValueAtTime(0, context.currentTime + fade);
        try {
          source?.stop(context.currentTime + fade);
        } catch {
          // Never started.
        }
      },
    };
  }

  /**
   * Plays `first` once and then `then` over and over, until stopped, fading over `fade` seconds
   * (the engine's sound channel given two sounds, 0x8c2cc). Returns null when sound is off.
   */
  sequence(first: string, then: string): { stop(fade?: number): void } | null {
    const { context, effects } = this;
    if (!context || !effects || this.muted) return null;
    const gain = context.createGain();
    gain.connect(effects);
    const sources: AudioBufferSourceNode[] = [];
    let stopped = false;
    void Promise.all([this.buffer(first), this.buffer(then)]).then(([start, loop]) => {
      if (stopped) return;
      const at = context.currentTime;
      const play = (buffer: AudioBuffer | null, when: number, repeat: boolean): void => {
        if (!buffer) return;
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = repeat;
        source.connect(gain);
        source.start(when);
        sources.push(source);
      };
      play(start, at, false);
      play(loop, at + (start?.duration ?? 0), true);
    });
    return {
      stop: (fade = 0) => {
        if (stopped) return;
        stopped = true;
        gain.gain.linearRampToValueAtTime(0, context.currentTime + fade);
        for (const source of sources) {
          try {
            source.stop(context.currentTime + fade);
          } catch {
            // Never started.
          }
        }
      },
    };
  }

  /** Plays `intro` once (if given and different from the loop) and then loops `loop`. */
  playMusic(loop: string, intro?: string): void {
    const start = (): void => {
      const { context, musicGain } = this;
      if (!context || !musicGain || this.muted) return;
      const token = ++this.musicToken;
      this.stopSources();
      const introId = intro && intro !== loop && this.sameFile(intro, loop) === false ? intro : undefined;
      void Promise.all([introId ? this.buffer(introId) : null, this.buffer(loop)]).then(([introBuffer, loopBuffer]) => {
        if (token !== this.musicToken || !loopBuffer) return;
        let at = context.currentTime + 0.05;
        if (introBuffer) {
          const first = context.createBufferSource();
          first.buffer = introBuffer;
          first.connect(musicGain);
          first.start(at);
          at += introBuffer.duration;
          this.music.push(first);
        }
        const looped = context.createBufferSource();
        looped.buffer = loopBuffer;
        looped.loop = true;
        looped.connect(musicGain);
        looped.start(at);
        this.music.push(looped);
      });
    };
    if (this.context) start();
    else this.pendingMusic = start;
  }

  stopMusic(): void {
    this.musicToken++;
    this.pendingMusic = null;
    this.stopSources();
  }

  private stopSources(): void {
    for (const source of this.music) {
      try {
        source.stop();
      } catch {
        // Already stopped or never started.
      }
    }
    this.music = [];
  }

  private sameFile(a: string, b: string): boolean {
    return this.resources.hasSample(a) && this.resources.hasSample(b) && this.resources.sample(a).file === this.resources.sample(b).file;
  }

  private buffer(id: string): Promise<AudioBuffer | null> {
    let pending = this.buffers.get(id);
    if (!pending) {
      pending = this.load(id);
      this.buffers.set(id, pending);
    }
    return pending;
  }

  private async load(id: string): Promise<AudioBuffer | null> {
    const context = this.context;
    if (!context || !this.resources.hasSample(id)) return null;
    try {
      const response = await fetch(this.resources.url(this.resources.sample(id).file));
      if (!response.ok) return null;
      return await context.decodeAudioData(await response.arrayBuffer());
    } catch (error) {
      // Some browsers cannot decode Ogg Vorbis; the game stays playable without that sample.
      console.warn(`Could not load sample ${id}`, error);
      return null;
    }
  }
}
