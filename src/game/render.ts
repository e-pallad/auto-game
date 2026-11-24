import { DIRS, type Dir, type GameState, type Level, isMelted, isWon, move } from '../core/rules.ts';

/** Palette: dusk on a frozen lake. Ember/dock/player use distinct shapes as well as colours. */
const C = {
  waterA: '#0b1530',
  waterB: '#15305a',
  ripple: 'rgba(150, 200, 255, 0.18)',
  ice: '#cdeef8',
  iceEdge: '#8fc9df',
  iceShine: 'rgba(255,255,255,0.65)',
  crack: '#3d7ea0',
  rock: '#4a5470',
  rockDark: '#2d3550',
  rockLight: '#6b7694',
  dock: '#a8743f',
  dockDark: '#6e4824',
  ember: '#ffb347',
  emberCore: '#fff1c9',
  player: '#fdf6e8',
  playerOutline: '#1d2440',
  lantern: '#ffcf6b',
  hint: 'rgba(255, 207, 107, 0.85)',
};

interface Anim {
  from: number;
  path: number[];
  start: number;
  duration: number;
}
interface Fx {
  cell: number;
  kind: 'melt' | 'ember' | 'bump';
  start: number;
  duration: number;
  dir?: Dir;
}

export interface RenderOptions {
  hints: boolean;
  reducedMotion: boolean;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private level: Level | null = null;
  private state: GameState | null = null;
  private anim: Anim | null = null;
  private fx: Fx[] = [];
  private cell = 40;
  private ox = 0;
  private oy = 0;
  private dpr = 1;
  opts: RenderOptions = { hints: true, reducedMotion: false };
  /** Frame-time samples (ms) for benchmarking via the debug hook. */
  frameTimes: number[] = [];

  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
  }

  setLevel(level: Level, state: GameState): void {
    this.level = level;
    this.state = state;
    this.anim = null;
    this.fx = [];
    this.resize();
  }

  /** Snap to state with no animation (undo/restart). */
  setState(state: GameState): void {
    this.state = state;
    this.anim = null;
  }

  /** Animate a slide from `from` along `path`, then show `state`. */
  animateMove(from: number, path: number[], state: GameState, melted: number | null, collected: number[], now: number): number {
    this.state = state;
    if (this.opts.reducedMotion) {
      this.anim = null;
      return 0;
    }
    const duration = 60 + path.length * 55;
    this.anim = { from, path, start: now, duration };
    for (const c of collected) {
      const idx = path.indexOf(c);
      this.fx.push({ cell: c, kind: 'ember', start: now + ((idx + 1) / path.length) * duration, duration: 450 });
    }
    if (melted !== null) this.fx.push({ cell: melted, kind: 'melt', start: now, duration: 600 });
    return duration;
  }

  bump(dir: Dir, now: number): void {
    if (!this.state || this.opts.reducedMotion) return;
    this.fx.push({ cell: this.state.pos, kind: 'bump', start: now, duration: 160, dir });
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
    if (!this.level) return;
    const w = rect.width;
    const h = rect.height;
    this.cell = Math.floor(Math.min((w - 16) / this.level.w, (h - 16) / this.level.h));
    this.ox = Math.floor((w - this.cell * this.level.w) / 2);
    this.oy = Math.floor((h - this.cell * this.level.h) / 2);
  }

  /** Board cell under a CSS-pixel point relative to the canvas, or the direction from the player. */
  dirToward(px: number, py: number): Dir | null {
    if (!this.level || !this.state) return null;
    const { x, y } = this.center(this.state.pos);
    const dx = px - x;
    const dy = py - y;
    if (Math.abs(dx) < this.cell * 0.4 && Math.abs(dy) < this.cell * 0.4) return null;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  }

  private center(cell: number): { x: number; y: number } {
    const w = this.level!.w;
    return { x: this.ox + (cell % w) * this.cell + this.cell / 2, y: this.oy + Math.floor(cell / w) * this.cell + this.cell / 2 };
  }

  isAnimating(now: number): boolean {
    return (this.anim !== null && now < this.anim.start + this.anim.duration) || this.fx.some((f) => now < f.start + f.duration);
  }

  draw(now: number): void {
    const t0 = performance.now();
    const ctx = this.ctx;
    const rect = { w: this.canvas.width / this.dpr, h: this.canvas.height / this.dpr };
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, rect.h);
    g.addColorStop(0, C.waterA);
    g.addColorStop(1, C.waterB);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, rect.w, rect.h);
    if (!this.level || !this.state) return;
    const L = this.level;
    const S = this.state;
    const cs = this.cell;

    // Water ripples
    if (!this.opts.reducedMotion) {
      ctx.strokeStyle = C.ripple;
      ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        const y = ((now / 60 + i * (rect.h / 6)) % (rect.h + 20)) - 10;
        ctx.beginPath();
        for (let x = 0; x <= rect.w; x += 12) ctx.lineTo(x, y + Math.sin(x / 30 + now / 900 + i) * 3);
        ctx.stroke();
      }
    }

    // Melt effects that are still in progress should keep drawing the floe shrinking.
    const melting = new Map<number, number>();
    for (const f of this.fx) if (f.kind === 'melt' && now < f.start + f.duration) melting.set(f.cell, Math.max(0, (now - f.start) / f.duration));

    for (let i = 0; i < L.tiles.length; i++) {
      const x = this.ox + (i % L.w) * cs;
      const y = this.oy + Math.floor(i / L.w) * cs;
      const t = L.tiles[i];
      const melted = isMelted(S, i);
      if (t === 'rock') this.drawRock(x, y, cs);
      else if (t === 'dock') this.drawDock(x, y, cs);
      else if (t === 'ice' && !melted) this.drawIce(x, y, cs, 1);
      else if (t === 'ice' && melted && melting.has(i)) this.drawIce(x, y, cs, 1 - melting.get(i)!);
      else if (melted) this.drawMeltRing(x, y, cs, now);
    }

    // Embers still on the board
    L.embers.forEach((cell, i) => {
      if ((S.embersLeft >>> i) & 1) {
        const { x, y } = this.center(cell);
        this.drawEmber(x, y, cs, now);
      }
    });

    // Player position (animated)
    let p = this.center(S.pos);
    let animating = false;
    if (this.anim) {
      const k = Math.max(0, Math.min(1, (now - this.anim.start) / this.anim.duration));
      if (k < 1) {
        animating = true;
        const pts = [this.anim.from, ...this.anim.path].map((c) => this.center(c));
        const e = 1 - (1 - k) * (1 - k); // ease-out
        const f = e * (pts.length - 1);
        const a = pts[Math.floor(f)]!;
        const b = pts[Math.min(pts.length - 1, Math.floor(f) + 1)]!;
        const fr = f - Math.floor(f);
        p = { x: a.x + (b.x - a.x) * fr, y: a.y + (b.y - a.y) * fr };
        // Embers collected by this slide stay visible until the player reaches them.
        for (const fx of this.fx) {
          if (fx.kind === 'ember' && now < fx.start) {
            const ec = this.center(fx.cell);
            this.drawEmber(ec.x, ec.y, cs, now);
          }
        }
      } else this.anim = null;
    }

    // Current floe is cracked (it will melt when you leave), unless it's the dock.
    if (!animating && L.tiles[S.pos] !== 'dock') {
      const x = this.ox + (S.pos % L.w) * cs;
      const y = this.oy + Math.floor(S.pos / L.w) * cs;
      this.drawCracks(x, y, cs);
    }

    // Landing hints
    if (this.opts.hints && !animating && !isWon(L, S)) {
      for (const d of DIRS) {
        const r = move(L, S, d);
        if (!r) continue;
        const c = this.center(r.state.pos);
        ctx.strokeStyle = C.hint;
        ctx.lineWidth = Math.max(1.5, cs * 0.05);
        ctx.setLineDash([cs * 0.08, cs * 0.08]);
        ctx.beginPath();
        ctx.arc(c.x, c.y, cs * 0.18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Bump nudge
    for (const f of this.fx) {
      if (f.kind === 'bump' && now >= f.start && now < f.start + f.duration && f.dir) {
        const k = Math.sin(((now - f.start) / f.duration) * Math.PI) * cs * 0.12;
        const [dx, dy] = f.dir === 'left' ? [-1, 0] : f.dir === 'right' ? [1, 0] : f.dir === 'up' ? [0, -1] : [0, 1];
        p = { x: p.x + dx * k, y: p.y + dy * k };
      }
    }
    this.drawPlayer(p.x, p.y, cs, now);

    // Ember pickup sparkles
    for (const f of this.fx) {
      if (f.kind !== 'ember' || now < f.start || now > f.start + f.duration) continue;
      const k = (now - f.start) / f.duration;
      const { x, y } = this.center(f.cell);
      ctx.strokeStyle = `rgba(255, 207, 107, ${1 - k})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, cs * (0.2 + k * 0.5), 0, Math.PI * 2);
      ctx.stroke();
    }
    this.fx = this.fx.filter((f) => now < f.start + f.duration);

    const dt = performance.now() - t0;
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 600) this.frameTimes.shift();
  }

  private rr(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  private drawIce(x: number, y: number, cs: number, scale: number): void {
    const ctx = this.ctx;
    const pad = cs * 0.04 + (1 - scale) * cs * 0.4;
    const s = cs - pad * 2;
    if (s <= 0) return;
    ctx.globalAlpha = Math.max(0, Math.min(1, scale * 1.2));
    this.rr(x + pad, y + pad, s, s, cs * 0.14);
    ctx.fillStyle = C.ice;
    ctx.fill();
    ctx.strokeStyle = C.iceEdge;
    ctx.lineWidth = Math.max(1, cs * 0.04);
    ctx.stroke();
    ctx.strokeStyle = C.iceShine;
    ctx.lineWidth = Math.max(1, cs * 0.05);
    ctx.beginPath();
    ctx.moveTo(x + pad + s * 0.18, y + pad + s * 0.3);
    ctx.lineTo(x + pad + s * 0.3, y + pad + s * 0.18);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawCracks(x: number, y: number, cs: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = C.crack;
    ctx.lineWidth = Math.max(1, cs * 0.035);
    const cx = x + cs / 2;
    const cy = y + cs / 2;
    const arms: [number, number][] = [
      [-0.38, -0.3],
      [0.36, -0.36],
      [0.4, 0.28],
      [-0.3, 0.4],
      [0.05, 0.42],
    ];
    ctx.beginPath();
    for (const [ax, ay] of arms) {
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + ax * cs * 0.5, cy + ay * cs * 0.5 + cs * 0.04);
      ctx.lineTo(cx + ax * cs * 0.9, cy + ay * cs * 0.9);
    }
    ctx.stroke();
  }

  private drawMeltRing(x: number, y: number, cs: number, now: number): void {
    const ctx = this.ctx;
    const k = this.opts.reducedMotion ? 0.5 : (Math.sin(now / 500 + x + y) + 1) / 2;
    ctx.strokeStyle = `rgba(160, 210, 255, ${0.25 + k * 0.2})`;
    ctx.lineWidth = Math.max(1, cs * 0.04);
    ctx.setLineDash([cs * 0.1, cs * 0.07]);
    this.rr(x + cs * 0.12, y + cs * 0.12, cs * 0.76, cs * 0.76, cs * 0.2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawRock(x: number, y: number, cs: number): void {
    const ctx = this.ctx;
    const p = cs * 0.08;
    ctx.fillStyle = C.rockDark;
    ctx.beginPath();
    ctx.moveTo(x + p, y + cs - p);
    ctx.lineTo(x + cs * 0.2, y + cs * 0.3);
    ctx.lineTo(x + cs * 0.5, y + p);
    ctx.lineTo(x + cs * 0.82, y + cs * 0.28);
    ctx.lineTo(x + cs - p, y + cs - p);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.rock;
    ctx.beginPath();
    ctx.moveTo(x + cs * 0.22, y + cs * 0.34);
    ctx.lineTo(x + cs * 0.5, y + p * 1.6);
    ctx.lineTo(x + cs * 0.56, y + cs - p);
    ctx.lineTo(x + p * 1.5, y + cs - p);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.rockLight;
    ctx.fillRect(x + cs * 0.42, y + cs * 0.22, cs * 0.08, cs * 0.08);
  }

  private drawDock(x: number, y: number, cs: number): void {
    const ctx = this.ctx;
    const p = cs * 0.06;
    ctx.fillStyle = C.dockDark;
    this.rr(x + p, y + p, cs - 2 * p, cs - 2 * p, cs * 0.08);
    ctx.fill();
    ctx.fillStyle = C.dock;
    for (let i = 0; i < 3; i++) {
      const py = y + p * 1.6 + i * ((cs - p * 3.2) / 3);
      this.rr(x + p * 1.6, py, cs - p * 3.2, (cs - p * 3.2) / 3 - 2, 2);
      ctx.fill();
    }
    // Lantern post (flag shape) to distinguish the dock without relying on colour
    ctx.fillStyle = C.playerOutline;
    ctx.fillRect(x + cs * 0.74, y + cs * 0.14, cs * 0.06, cs * 0.5);
    ctx.fillStyle = C.lantern;
    ctx.beginPath();
    ctx.moveTo(x + cs * 0.8, y + cs * 0.14);
    ctx.lineTo(x + cs * 0.94, y + cs * 0.22);
    ctx.lineTo(x + cs * 0.8, y + cs * 0.3);
    ctx.fill();
  }

  private drawEmber(x: number, y: number, cs: number, now: number): void {
    const ctx = this.ctx;
    const pulse = this.opts.reducedMotion ? 1 : 1 + Math.sin(now / 250) * 0.08;
    const r = cs * 0.2 * pulse;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
    glow.addColorStop(0, 'rgba(255, 179, 71, 0.55)');
    glow.addColorStop(1, 'rgba(255, 179, 71, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
    ctx.fillStyle = C.ember;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.75, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r * 0.75, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.emberCore;
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.45);
    ctx.lineTo(x + r * 0.3, y);
    ctx.lineTo(x, y + r * 0.45);
    ctx.lineTo(x - r * 0.3, y);
    ctx.fill();
  }

  private drawPlayer(x: number, y: number, cs: number, now: number): void {
    const ctx = this.ctx;
    const r = cs * 0.26;
    const flicker = this.opts.reducedMotion ? 1 : 1 + Math.sin(now / 90) * 0.05;
    const glow = ctx.createRadialGradient(x + r * 0.7, y, 0, x + r * 0.7, y, cs * 0.7 * flicker);
    glow.addColorStop(0, 'rgba(255, 207, 107, 0.35)');
    glow.addColorStop(1, 'rgba(255, 207, 107, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - cs, y - cs, cs * 2, cs * 2);
    // body (hooded figure from above)
    ctx.fillStyle = C.player;
    ctx.strokeStyle = C.playerOutline;
    ctx.lineWidth = Math.max(1.5, cs * 0.05);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // scarf
    ctx.fillStyle = '#d9534f';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.55, Math.PI * 0.15, Math.PI * 0.85);
    ctx.lineTo(x, y);
    ctx.fill();
    // lantern
    ctx.fillStyle = C.lantern;
    ctx.strokeStyle = C.playerOutline;
    ctx.lineWidth = Math.max(1, cs * 0.03);
    this.rr(x + r * 0.75, y - r * 0.25, r * 0.5, r * 0.6, 2);
    ctx.fill();
    ctx.stroke();
  }

  /** Average and p95 of recent frame draw costs (CPU time inside draw()). */
  frameStats(): { avg: number; p95: number; n: number } {
    const s = [...this.frameTimes].sort((a, b) => a - b);
    if (s.length === 0) return { avg: 0, p95: 0, n: 0 };
    return { avg: s.reduce((a, b) => a + b, 0) / s.length, p95: s[Math.floor(s.length * 0.95)]!, n: s.length };
  }
}
