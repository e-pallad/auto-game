import { type DailyInfo, dailyInfo } from '../core/daily.ts';
import type { Difficulty, Puzzle } from '../core/generator.ts';
import type { Dir } from '../core/rules.ts';
import { Session } from '../core/session.ts';
import { shareText } from '../core/share.ts';
import { Audio } from './audio.ts';
import { type GenResult, GeneratorClient } from './generator-client.ts';
import { Renderer } from './render.ts';
import { type SaveData, computeStats, load, save } from './storage.ts';

type Mode = { kind: 'daily'; info: DailyInfo } | { kind: 'practice'; difficulty: Difficulty; seed: string };

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
};

const KEY_DIRS: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  W: 'up',
  S: 'down',
  A: 'left',
  D: 'right',
};

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 8);
}

export class App {
  private data: SaveData = load();
  private audio = new Audio();
  private renderer: Renderer;
  private session: Session | null = null;
  private puzzle: Puzzle | null = null;
  private mode: Mode | null = null;
  private outcomeTimer = 0;
  private toastTimer = 0;
  private lastLoad: Omit<GenResult, 'puzzle'> | null = null;
  private loading = false;
  /** Incremented on every load request; responses for an older token are ignored. */
  private loadToken = 0;
  private loadingTimer = 0;
  private readonly gen = new GeneratorClient(!new URLSearchParams(location.search).has('noworker'));
  private readonly params = new URLSearchParams(location.search);
  private readonly debug = this.params.has('debug');

  constructor() {
    this.renderer = new Renderer($<HTMLCanvasElement>('board'));
    this.applySettings();
    this.bind();
    this.showTitle();
    const seed = this.params.get('seed');
    if (seed) {
      const d = this.params.get('d');
      const difficulty: Difficulty = d === 'easy' || d === 'hard' ? d : 'medium';
      void this.start({ kind: 'practice', difficulty, seed });
    }
    if (!this.data.settings.seenHowTo && !seed) this.showHowTo();
    // Use one clock (performance.now) for input and drawing: rAF timestamps can lag behind it.
    const loop = () => {
      this.renderer.draw(performance.now());
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    if (this.debug) this.exposeDebug();
  }

  private today(): DailyInfo {
    const override = this.debug ? this.params.get('date') : null;
    if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) {
      const [y, m, d] = override.split('-').map(Number) as [number, number, number];
      return dailyInfo(new Date(y, m - 1, d));
    }
    return dailyInfo(new Date());
  }

  // ---------- screens ----------

  private show(id: string | null): void {
    for (const s of ['screen-title', 'screen-howto', 'screen-result']) $(s).classList.toggle('hidden', s !== id);
    const playing = id === null || id === 'screen-result';
    $('hud').classList.toggle('hidden', !playing || !this.session);
    $('controls').classList.toggle('hidden', !playing || !this.session);
    if (id) {
      // Focus the first visible primary button (some result buttons are hidden per outcome).
      const buttons = [...$(id).querySelectorAll<HTMLButtonElement>('button')].filter((b) => !b.classList.contains('hidden'));
      (buttons.find((b) => b.classList.contains('primary')) ?? buttons[0])?.focus();
    }
  }

  private showTitle(): void {
    window.clearTimeout(this.outcomeTimer);
    this.cancelLoad();
    this.session = null;
    const info = this.today();
    const done = this.data.daily[info.dateKey];
    $('btn-daily').textContent = done ? `Replay today's #${info.number}` : `Play today's puzzle #${info.number}`;
    $('daily-note').textContent = done
      ? `Done today in ${done.moves} moves (par ${done.par}). New puzzle at midnight, local time.`
      : 'One new board a day, the same for everyone.';
    const st = computeStats(this.data.daily, info.number);
    $('stats').innerHTML =
      `<div><b>${st.played}</b><span>played</span></div>` +
      `<div><b>${st.atPar}</b><span>at par</span></div>` +
      `<div><b>${st.streak}</b><span>streak</span></div>` +
      `<div><b>${st.bestStreak}</b><span>best</span></div>`;
    this.show('screen-title');
  }

  private showHowTo(): void {
    this.show('screen-howto');
  }

  private closeHowTo(): void {
    this.data.settings.seenHowTo = true;
    save(this.data);
    this.show(this.session ? null : 'screen-title');
  }

  // ---------- game flow ----------

  private setLoading(on: boolean): void {
    this.loading = on;
    window.clearTimeout(this.loadingTimer);
    $('stage').setAttribute('aria-busy', String(on));
    // Only show the indicator if loading is noticeable, to avoid a flash on fast devices.
    if (on) this.loadingTimer = window.setTimeout(() => $('loading').classList.remove('hidden'), 150);
    else $('loading').classList.add('hidden');
  }

  private cancelLoad(): void {
    this.loadToken++;
    if (this.loading) this.setLoading(false);
  }

  async start(mode: Mode): Promise<void> {
    window.clearTimeout(this.outcomeTimer);
    const token = ++this.loadToken;
    this.setLoading(true);
    const res =
      mode.kind === 'daily'
        ? await this.gen.request(mode.info.seed, 'medium')
        : await this.gen.request(mode.seed, mode.difficulty);
    if (token !== this.loadToken) return; // superseded by a newer request or by returning to the menu
    this.setLoading(false);
    const { puzzle, ...timing } = res;
    this.lastLoad = timing;
    this.mode = mode;
    this.puzzle = puzzle;
    this.session = new Session(puzzle.level, puzzle.par);
    $('hud-mode').textContent =
      mode.kind === 'daily'
        ? `Daily #${mode.info.number}`
        : `Practice · ${mode.difficulty[0]!.toUpperCase()}${mode.difficulty.slice(1)} · ${mode.seed}`;
    this.show(null);
    this.renderer.setLevel(puzzle.level, this.session.state);
    this.updateHud();
    if (mode.kind === 'daily' && this.data.daily[mode.info.dateKey]) this.toast('Replay: your first result is kept.');
    $('board').focus();
  }

  private input(dir: Dir): void {
    this.audio.unlock();
    if (this.loading) return;
    const s = this.session;
    if (!s || !$('screen-title').classList.contains('hidden') || !$('screen-howto').classList.contains('hidden')) return;
    if (!$('screen-result').classList.contains('hidden')) return;
    const from = s.state.pos;
    const r = s.tryMove(dir);
    const now = performance.now();
    if (!r) {
      if (s.status === 'playing') {
        this.audio.play('bump');
        this.renderer.bump(dir, now);
      }
      return;
    }
    const dur = this.renderer.animateMove(from, r.path, r.state, r.melted, r.collected, now);
    this.audio.play('slide');
    if (r.melted !== null) this.audio.play('melt');
    if (r.collected.length) window.setTimeout(() => this.audio.play('ember'), dur * 0.6);
    window.setTimeout(() => this.audio.play('stop'), dur);
    this.updateHud();
    const status = s.status;
    if (status !== 'playing') {
      window.clearTimeout(this.outcomeTimer);
      this.outcomeTimer = window.setTimeout(() => this.outcome(), dur + 150);
    }
  }

  private undo(): void {
    if (!this.session || this.loading) return;
    window.clearTimeout(this.outcomeTimer);
    if (this.session.undo()) {
      this.audio.play('undo');
      this.renderer.setState(this.session.state);
      this.updateHud();
      this.show(null);
    }
  }

  private restart(): void {
    if (!this.session || this.loading) return;
    window.clearTimeout(this.outcomeTimer);
    this.session.restart();
    this.audio.play('undo');
    this.renderer.setState(this.session.state);
    this.updateHud();
    this.show(null);
  }

  private outcome(): void {
    const s = this.session;
    const mode = this.mode;
    if (!s || !mode) return;
    const won = s.status === 'won';
    $('result-h').textContent = won ? (s.moves <= s.par ? 'Ashore at par! ⭐' : 'Ashore!') : 'Stranded';
    $('btn-share').classList.toggle('hidden', !won || mode.kind !== 'daily');
    $('result-share').classList.toggle('hidden', !won || mode.kind !== 'daily');
    $('btn-again').textContent = won ? 'Play again' : '⟲ Restart';
    $('btn-undo-result').classList.toggle('hidden', won);
    $('btn-next').classList.toggle('hidden', mode.kind !== 'practice');
    if (won) {
      this.audio.play('win');
      let body = `You reached the dock in ${s.moves} moves. Par is ${s.par}.`;
      if (mode.kind === 'daily') {
        const first = !this.data.daily[mode.info.dateKey];
        if (first) {
          this.data.daily[mode.info.dateKey] = {
            number: mode.info.number,
            moves: s.moves,
            par: s.par,
            undos: s.undos,
            restarts: s.restarts,
          };
          save(this.data);
        }
        const rec = this.data.daily[mode.info.dateKey]!;
        const st = computeStats(this.data.daily, mode.info.number);
        body += first ? ` Streak: ${st.streak} day${st.streak === 1 ? '' : 's'}.` : ` (Saved result: ${rec.moves} moves.)`;
        $('result-share').textContent = shareText(rec);
      } else {
        this.data.practiceWins++;
        save(this.data);
      }
      $('result-body').textContent = body;
    } else {
      this.audio.play('stranded');
      $('result-body').textContent =
        'No floe left to slide to. Every stop melts behind you, so plan where you will land. Undo a move or restart.';
    }
    this.show('screen-result');
  }

  private async share(): Promise<void> {
    const text = $('result-share').textContent ?? '';
    try {
      await navigator.clipboard.writeText(text);
      this.toast('Result copied to clipboard');
    } catch {
      const range = document.createRange();
      range.selectNodeContents($('result-share'));
      const sel = getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      this.toast('Select and copy the text above');
    }
  }

  private updateHud(): void {
    const s = this.session;
    if (!s) return;
    $('hud-moves').textContent = String(s.moves);
    $('hud-par').textContent = String(s.par);
    $('hud-embers').textContent = `${s.embersCollected}/${s.embersTotal}`;
    $<HTMLButtonElement>('btn-undo').disabled = s.moves === 0;
  }

  private toast(msg: string): void {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.remove('show'), 2200);
  }

  // ---------- settings ----------

  private applySettings(): void {
    const st = this.data.settings;
    this.audio.enabled = st.sound;
    this.renderer.opts = { hints: st.hints, reducedMotion: st.reducedMotion };
    $<HTMLInputElement>('opt-sound').checked = st.sound;
    $<HTMLInputElement>('opt-hints').checked = st.hints;
    $<HTMLInputElement>('opt-motion').checked = st.reducedMotion;
    $('btn-sound').textContent = st.sound ? '🔊' : '🔇';
    $('btn-sound').setAttribute('aria-pressed', String(st.sound));
    document.documentElement.classList.toggle('reduced-motion', st.reducedMotion);
  }

  private setSetting(key: 'sound' | 'hints' | 'reducedMotion', value: boolean): void {
    this.data.settings[key] = value;
    save(this.data);
    this.applySettings();
  }

  // ---------- input binding ----------

  private bind(): void {
    $('btn-daily').addEventListener('click', () => {
      this.audio.unlock();
      void this.start({ kind: 'daily', info: this.today() });
    });
    document.querySelectorAll<HTMLButtonElement>('[data-practice]').forEach((b) =>
      b.addEventListener('click', () => {
        this.audio.unlock();
        void this.start({ kind: 'practice', difficulty: b.dataset.practice as Difficulty, seed: randomSeed() });
      }),
    );
    $('btn-howto').addEventListener('click', () => this.showHowTo());
    $('btn-howto-close').addEventListener('click', () => this.closeHowTo());
    $('btn-menu').addEventListener('click', () => this.showTitle());
    $('btn-result-menu').addEventListener('click', () => this.showTitle());
    $('btn-undo').addEventListener('click', () => this.undo());
    $('btn-undo-result').addEventListener('click', () => this.undo());
    $('btn-restart').addEventListener('click', () => this.restart());
    $('btn-again').addEventListener('click', () => this.restart());
    $('btn-next').addEventListener('click', () => {
      if (this.mode?.kind === 'practice') void this.start({ kind: 'practice', difficulty: this.mode.difficulty, seed: randomSeed() });
    });
    $('btn-share').addEventListener('click', () => void this.share());
    $('btn-sound').addEventListener('click', () => {
      this.audio.unlock();
      this.setSetting('sound', !this.data.settings.sound);
    });
    $<HTMLInputElement>('opt-sound').addEventListener('change', (e) => this.setSetting('sound', (e.target as HTMLInputElement).checked));
    $<HTMLInputElement>('opt-hints').addEventListener('change', (e) => this.setSetting('hints', (e.target as HTMLInputElement).checked));
    $<HTMLInputElement>('opt-motion').addEventListener('change', (e) =>
      this.setSetting('reducedMotion', (e.target as HTMLInputElement).checked),
    );
    document.querySelectorAll<HTMLButtonElement>('[data-dir]').forEach((b) =>
      b.addEventListener('click', () => this.input(b.dataset.dir as Dir)),
    );

    window.addEventListener('keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const dir = KEY_DIRS[e.key];
      const inGame = this.session && $('screen-title').classList.contains('hidden') && $('screen-howto').classList.contains('hidden');
      if (dir && inGame) {
        e.preventDefault();
        this.input(dir);
      } else if ((e.key === 'z' || e.key === 'Z' || e.key === 'Backspace' || e.key === 'u') && inGame) {
        e.preventDefault();
        this.undo();
      } else if ((e.key === 'r' || e.key === 'R') && inGame) {
        e.preventDefault();
        this.restart();
      } else if (e.key === 'm' || e.key === 'M') {
        this.audio.unlock();
        this.setSetting('sound', !this.data.settings.sound);
      } else if (e.key === 'Escape') {
        if (!$('screen-howto').classList.contains('hidden')) this.closeHowTo();
        else if (this.session) this.showTitle();
      }
    });

    const canvas = $<HTMLCanvasElement>('board');
    canvas.tabIndex = 0;
    let down: { x: number; y: number } | null = null;
    canvas.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!down) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      down = null;
      let dir: Dir | null;
      if (Math.hypot(dx, dy) > 24) dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      else {
        const r = canvas.getBoundingClientRect();
        dir = this.renderer.dirToward(e.clientX - r.left, e.clientY - r.top);
      }
      if (dir) this.input(dir);
    });
    window.addEventListener('resize', () => this.renderer.resize());
  }

  private exposeDebug(): void {
    (window as unknown as { __floeline: unknown }).__floeline = {
      solution: () => this.puzzle?.solution ?? [],
      par: () => this.puzzle?.par,
      status: () => this.session?.status ?? null,
      moves: () => this.session?.moves ?? null,
      pos: () => this.session?.state.pos ?? null,
      genMs: () => this.lastLoad?.genMs ?? null,
      lastLoad: () => this.lastLoad,
      usingWorker: () => this.gen.usingWorker,
      ready: () => !this.loading && this.session !== null,
      startPractice: (seed: string, difficulty: Difficulty) => this.start({ kind: 'practice', difficulty, seed }),
      frameStats: () => this.renderer.frameStats(),
      resetFrameStats: () => {
        this.renderer.frameTimes = [];
      },
    };
  }
}
