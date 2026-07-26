import type { QualityLevel, AIDifficulty } from "../config/gameConfig";
import { GameConfig } from "../config/gameConfig";

export interface FighterUIState {
  instanceId: string;
  name: string;
  isPlayer: boolean;
  damagePercent: number;
  stocks: number;
  guardDurability: number;
  alive: boolean;
}

export interface HUDState {
  fighters: FighterUIState[];
  matchTime: number;
  specialCooldownFrac: number; // 0 = ready, 1 = just used
  specialReady: boolean;
}

export interface UIManagerOptions {
  isMobile: boolean;
  initialQuality: QualityLevel;
  initialVolume: number;
  initialMusicVolume: number;
  initialDifficulty: AIDifficulty;
  onPauseToggle: (paused: boolean) => void;
  onRestart: () => void;
  onQualityChange: (q: QualityLevel) => void;
  onVolumeChange: (v: number) => void;
  onMusicVolumeChange: (v: number) => void;
  onDifficultyChange: (d: AIDifficulty) => void;
}

interface PanelRefs {
  el: HTMLElement;
  dmg: HTMLElement;
  stocksWrap: HTMLElement;
  guardFill: HTMLElement;
}

/** Builds and updates all DOM-based HUD elements: fighter panels, timer, special cooldown, pause/result overlays and the debug readout. */
export class UIManager {
  private root: HTMLElement;
  private panels = new Map<string, PanelRefs>();
  private timerEl!: HTMLElement;
  private specialIconEl!: HTMLElement;
  private specialOverlayEl!: HTMLElement;
  private resultEl!: HTMLElement;
  private resultTitleEl!: HTMLElement;
  private pauseOverlayEl!: HTMLElement;
  private debugEl!: HTMLElement;
  private opts: UIManagerOptions;
  private paused = false;

  constructor(root: HTMLElement, opts: UIManagerOptions) {
    this.root = root;
    this.opts = opts;
    this.build();
  }

  private build(): void {
    const hud = document.createElement("div");
    hud.className = "jb-hud" + (this.opts.isMobile ? " jb-hud-mobile" : "");
    this.root.appendChild(hud);

    // top bar
    const topbar = document.createElement("div");
    topbar.className = "jb-topbar";
    this.timerEl = document.createElement("div");
    this.timerEl.className = "jb-timer";
    this.timerEl.textContent = "3:00";
    const pauseBtn = document.createElement("div");
    pauseBtn.className = "jb-pause-btn";
    pauseBtn.textContent = "II 一時停止";
    pauseBtn.addEventListener("click", () => this.togglePause());
    topbar.append(this.timerEl, pauseBtn);
    hud.appendChild(topbar);

    // controls hint
    const hint = document.createElement("div");
    hint.className = "jb-controls-hint";
    hint.textContent = this.opts.isMobile
      ? "左:移動スティック / 右:攻撃・強攻撃・必殺技・ジャンプ・ガード・回避"
      : "WASD:移動 / マウス:視点 / 左クリック:通常攻撃 / 右クリック:強攻撃 / E:必殺技 / Q:ガード / Shift:ダッシュ / Ctrl,C:回避 / Space:ジャンプ / R:カメラリセット / Esc:ポーズ";
    hud.appendChild(hint);

    // fighter panels
    const panelsWrap = document.createElement("div");
    panelsWrap.className = "jb-panels";
    hud.appendChild(panelsWrap);
    this.panelsWrap = panelsWrap;

    // special cooldown wheel
    const specialWrap = document.createElement("div");
    specialWrap.className = "jb-special-wrap";
    this.specialIconEl = document.createElement("div");
    this.specialIconEl.className = "jb-special-icon";
    this.specialIconEl.textContent = "必殺";
    this.specialOverlayEl = document.createElement("div");
    this.specialOverlayEl.className = "jb-cd-overlay";
    this.specialIconEl.appendChild(this.specialOverlayEl);
    specialWrap.appendChild(this.specialIconEl);
    hud.appendChild(specialWrap);

    // debug overlay
    this.debugEl = document.createElement("div");
    this.debugEl.className = "jb-debug";
    hud.appendChild(this.debugEl);

    // result screen
    this.resultEl = document.createElement("div");
    this.resultEl.className = "jb-result";
    this.resultTitleEl = document.createElement("div");
    this.resultTitleEl.className = "jb-result-title";
    const restartBtn = document.createElement("button");
    restartBtn.className = "jb-result-btn";
    restartBtn.textContent = "もう一度戦う";
    restartBtn.addEventListener("click", () => this.opts.onRestart());
    this.resultEl.append(this.resultTitleEl, restartBtn);
    hud.appendChild(this.resultEl);

    // pause overlay
    this.buildPauseOverlay(hud);
  }

  private panelsWrap!: HTMLElement;

  private buildPauseOverlay(hud: HTMLElement): void {
    const overlay = document.createElement("div");
    overlay.className = "jb-pause-overlay";
    this.pauseOverlayEl = overlay;

    const title = document.createElement("h2");
    title.textContent = "ポーズ";
    overlay.appendChild(title);

    const qualityRow = document.createElement("div");
    qualityRow.className = "jb-pause-row";
    const qualityLabel = document.createElement("span");
    qualityLabel.textContent = "画質:";
    const qualitySelect = document.createElement("select");
    for (const level of ["low", "medium", "high"] as QualityLevel[]) {
      const opt = document.createElement("option");
      opt.value = level;
      opt.textContent = level === "low" ? "低" : level === "medium" ? "中" : "高";
      if (level === this.opts.initialQuality) opt.selected = true;
      qualitySelect.appendChild(opt);
    }
    qualitySelect.addEventListener("change", () => this.opts.onQualityChange(qualitySelect.value as QualityLevel));
    qualityRow.append(qualityLabel, qualitySelect);
    overlay.appendChild(qualityRow);

    const diffRow = document.createElement("div");
    diffRow.className = "jb-pause-row";
    const diffLabel = document.createElement("span");
    diffLabel.textContent = "CPU難易度:";
    const diffSelect = document.createElement("select");
    for (const d of ["easy", "normal", "hard"] as AIDifficulty[]) {
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = d === "easy" ? "Easy" : d === "normal" ? "Normal" : "Hard";
      if (d === this.opts.initialDifficulty) opt.selected = true;
      diffSelect.appendChild(opt);
    }
    diffSelect.addEventListener("change", () => this.opts.onDifficultyChange(diffSelect.value as AIDifficulty));
    diffRow.append(diffLabel, diffSelect);
    overlay.appendChild(diffRow);

    const volRow = document.createElement("div");
    volRow.className = "jb-pause-row";
    const volLabel = document.createElement("span");
    volLabel.textContent = "効果音量:";
    const volInput = document.createElement("input");
    volInput.type = "range";
    volInput.min = "0";
    volInput.max = "1";
    volInput.step = "0.05";
    volInput.value = String(this.opts.initialVolume);
    volInput.addEventListener("input", () => this.opts.onVolumeChange(parseFloat(volInput.value)));
    volRow.append(volLabel, volInput);
    overlay.appendChild(volRow);

    const musicVolRow = document.createElement("div");
    musicVolRow.className = "jb-pause-row";
    const musicVolLabel = document.createElement("span");
    musicVolLabel.textContent = "BGM音量:";
    const musicVolInput = document.createElement("input");
    musicVolInput.type = "range";
    musicVolInput.min = "0";
    musicVolInput.max = "1";
    musicVolInput.step = "0.05";
    musicVolInput.value = String(this.opts.initialMusicVolume);
    musicVolInput.addEventListener("input", () => this.opts.onMusicVolumeChange(parseFloat(musicVolInput.value)));
    musicVolRow.append(musicVolLabel, musicVolInput);
    overlay.appendChild(musicVolRow);

    const btnRow = document.createElement("div");
    btnRow.className = "jb-pause-row";
    const resumeBtn = document.createElement("button");
    resumeBtn.textContent = "再開";
    resumeBtn.addEventListener("click", () => this.togglePause());
    const restartBtn = document.createElement("button");
    restartBtn.textContent = "最初から";
    restartBtn.addEventListener("click", () => this.opts.onRestart());
    btnRow.append(resumeBtn, restartBtn);
    overlay.appendChild(btnRow);

    hud.appendChild(overlay);
  }

  togglePause(): void {
    this.paused = !this.paused;
    this.pauseOverlayEl.classList.toggle("jb-show", this.paused);
    this.opts.onPauseToggle(this.paused);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.pauseOverlayEl.classList.toggle("jb-show", this.paused);
  }

  isPaused(): boolean {
    return this.paused;
  }

  private ensurePanel(f: FighterUIState): PanelRefs {
    let p = this.panels.get(f.instanceId);
    if (p) return p;

    const el = document.createElement("div");
    el.className = "jb-panel" + (f.isPlayer ? " jb-player" : "");
    const name = document.createElement("div");
    name.className = "jb-name";
    name.textContent = f.name + (f.isPlayer ? " (YOU)" : "");
    const dmg = document.createElement("div");
    dmg.className = "jb-dmg";
    const stocksWrap = document.createElement("div");
    stocksWrap.className = "jb-stocks";
    const guardbar = document.createElement("div");
    guardbar.className = "jb-guardbar";
    const guardFill = document.createElement("div");
    guardFill.className = "jb-guardbar-fill";
    guardbar.appendChild(guardFill);

    el.append(name, dmg, stocksWrap, guardbar);
    this.panelsWrap.appendChild(el);

    p = { el, dmg, stocksWrap, guardFill };
    this.panels.set(f.instanceId, p);
    return p;
  }

  update(state: HUDState): void {
    for (const f of state.fighters) {
      const p = this.ensurePanel(f);
      const dmgRounded = Math.round(f.damagePercent);
      p.dmg.textContent = `${dmgRounded}%`;
      p.dmg.classList.toggle("jb-danger", dmgRounded >= 100);
      p.el.classList.toggle("jb-danger-stock", f.stocks === 1 && f.alive);
      p.el.style.opacity = f.alive ? "1" : "0.35";

      const dots = f.stocks;
      if (p.stocksWrap.childElementCount !== dots) {
        p.stocksWrap.innerHTML = "";
        for (let i = 0; i < dots; i++) {
          const dot = document.createElement("div");
          dot.className = "jb-stock-dot";
          p.stocksWrap.appendChild(dot);
        }
      }

      const guardPct = Math.max(0, Math.min(100, f.guardDurability));
      p.guardFill.style.width = `${guardPct}%`;
    }

    const remaining = Math.max(0, GameConfig.matchTimeLimit - state.matchTime);
    const mm = Math.floor(remaining / 60);
    const ss = Math.floor(remaining % 60);
    this.timerEl.textContent = `${mm}:${ss.toString().padStart(2, "0")}`;

    this.specialOverlayEl.style.transform = `scaleY(${state.specialCooldownFrac})`;
    this.specialIconEl.style.filter = state.specialReady ? "none" : "grayscale(0.6)";
  }

  showResult(win: boolean): void {
    this.resultEl.classList.add("jb-show");
    this.resultTitleEl.textContent = win ? "YOU WIN" : "YOU LOSE";
    this.resultTitleEl.classList.toggle("jb-lose", !win);
  }

  hideResult(): void {
    this.resultEl.classList.remove("jb-show");
  }

  resetPanels(): void {
    this.panels.forEach((p) => p.el.remove());
    this.panels.clear();
  }

  setDebugVisible(visible: boolean): void {
    this.debugEl.classList.toggle("jb-show", visible);
  }

  setDebugText(text: string): void {
    this.debugEl.textContent = text;
  }
}
