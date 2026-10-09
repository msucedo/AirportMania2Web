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

  play(id: string, options: { pitch?: number; volume?: number } = {}): void {
    const { context, effects } = this;
    if (!context || !effects || this.muted) return;
    void this.buffer(id).then((buffer) => {
      if (!buffer) return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = options.pitch ?? 1;
      if (options.volume === undefined) {
        source.connect(effects);
      } else {
        const gain = context.createGain();
        gain.gain.value = options.volume;
        source.connect(gain).connect(effects);
      }
      source.start();
    });
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
