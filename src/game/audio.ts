/** Tiny synthesized sound effects (WebAudio). No audio files, nothing to license. */
export type Sfx = 'slide' | 'stop' | 'melt' | 'ember' | 'win' | 'stranded' | 'undo' | 'bump';

export class Audio {
  private ctx: AudioContext | null = null;
  enabled = true;

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock(): void {
    if (this.ctx || typeof AudioContext === 'undefined') return;
    try {
      this.ctx = new AudioContext();
    } catch {
      this.ctx = null;
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, when = 0, slideTo?: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain: number, freq: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(ctx.destination);
    src.start();
  }

  play(s: Sfx): void {
    if (!this.enabled || !this.ctx) return;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    switch (s) {
      case 'slide':
        this.noise(0.22, 0.25, 3200);
        break;
      case 'stop':
        this.tone(140, 0.12, 'triangle', 0.25);
        break;
      case 'melt':
        this.tone(520, 0.35, 'sine', 0.12, 0.05, 180);
        break;
      case 'ember':
        this.tone(880, 0.18, 'sine', 0.16);
        this.tone(1320, 0.22, 'sine', 0.1, 0.06);
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.18, i * 0.11));
        break;
      case 'stranded':
        this.tone(220, 0.5, 'sawtooth', 0.08, 0, 110);
        break;
      case 'undo':
        this.tone(660, 0.1, 'square', 0.05, 0, 440);
        break;
      case 'bump':
        this.tone(90, 0.08, 'sine', 0.2);
        break;
    }
  }
}
