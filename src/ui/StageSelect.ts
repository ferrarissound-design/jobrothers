import { STAGES, STAGE_ORDER, type StageDef, type StageId } from "../stage/stageData";

export interface StageSelectOptions {
  /** Fires whenever the cursor lands on a different stage (drives the 3D diorama). */
  onHighlight: (id: StageId) => void;
  /** Fires when the player locks their choice in; the caller starts the match. */
  onConfirm: (id: StageId) => void;
  /** Fires when the player backs out; only reachable when `open` was told the screen is cancellable. */
  onCancel: () => void;
}

interface StatBar {
  label: string;
  read: (def: StageDef) => number;
}

const STAT_BARS: StatBar[] = [
  { label: "広さ", read: (s) => s.arenaRadius },
  { label: "足場の数", read: (s) => s.platforms.length },
  { label: "こわせる数", read: (s) => s.destructibles.length },
];

/**
 * Same normalisation the fighter stat bars use: a stage's numbers are only
 * meaningful next to the other stages', so the bars compare the roster to
 * itself rather than to an absolute scale, with a floor that keeps the
 * smallest entry visible as a stub instead of an empty row.
 */
function normalizedStat(bar: StatBar, def: StageDef): number {
  let min = Infinity;
  let max = -Infinity;
  for (const id of STAGE_ORDER) {
    const v = bar.read(STAGES[id]);
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  const span = max - min;
  const t = span > 0 ? (bar.read(def) - min) / span : 0.5;
  return 0.18 + t * 0.82;
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

/**
 * Full-screen stage picker, shown after the fighter is chosen and reachable
 * again from the pause and result overlays.
 *
 * It deliberately borrows the fighter screen's markup and CSS classes rather
 * than introducing a second look: the two screens sit back to back in the same
 * flow, and a player who has just learned where the cards, the stat bars and
 * the confirm button live should find them in the same places. As with that
 * screen, the 3D half of the display belongs to someone else — StagePreview —
 * which is why every cursor move reports out through `onHighlight`.
 */
export class StageSelect {
  private el: HTMLElement;
  private cards = new Map<StageId, HTMLElement>();
  private detailName!: HTMLElement;
  private detailTitle!: HTMLElement;
  private detailDesc!: HTMLElement;
  private traitList!: HTMLElement;
  private statFills = new Map<string, HTMLElement>();
  private cancelBtn!: HTMLButtonElement;

  private opts: StageSelectOptions;
  private selected: StageId = STAGE_ORDER[0];
  private open_ = false;
  private cancellable = false;

  constructor(root: HTMLElement, opts: StageSelectOptions) {
    this.opts = opts;
    this.el = document.createElement("div");
    this.el.className = "jb-select";
    root.appendChild(this.el);
    this.build();
    window.addEventListener("keydown", (e) => this.onKeyDown(e));
  }

  private build(): void {
    const panel = document.createElement("div");
    panel.className = "jb-cs-panel";
    this.el.appendChild(panel);

    const title = document.createElement("div");
    title.className = "jb-cs-title";
    title.textContent = "ステージ選択";
    const subtitle = document.createElement("div");
    subtitle.className = "jb-cs-subtitle";
    subtitle.textContent = "決定すると新しいステージで試合が始まります";
    panel.append(title, subtitle);

    const grid = document.createElement("div");
    grid.className = "jb-cs-grid";
    panel.appendChild(grid);

    for (const id of STAGE_ORDER) {
      const def = STAGES[id];
      const card = document.createElement("button");
      card.className = "jb-cs-card";
      card.type = "button";
      card.style.setProperty("--jb-cs-primary", hex(def.palette.primary));
      card.style.setProperty("--jb-cs-accent", hex(def.palette.accent));

      const chip = document.createElement("div");
      chip.className = "jb-cs-chip";
      chip.style.background = `linear-gradient(150deg, ${hex(def.lighting.sky)}, ${hex(
        def.palette.primary
      )})`;
      chip.textContent = def.name.charAt(0);

      const text = document.createElement("div");
      text.className = "jb-cs-card-text";
      const name = document.createElement("div");
      name.className = "jb-cs-card-name";
      name.textContent = def.name;
      const role = document.createElement("div");
      role.className = "jb-cs-card-title";
      role.textContent = def.title;
      text.append(name, role);

      card.append(chip, text);
      card.addEventListener("click", () => {
        // Same double-tap-to-confirm as the fighter cards: the first tap moves
        // the cursor, a tap on the already-selected card commits.
        if (this.selected === id) this.confirm();
        else this.highlight(id);
      });
      grid.appendChild(card);
      this.cards.set(id, card);
    }

    const detail = document.createElement("div");
    detail.className = "jb-cs-detail";
    this.detailName = document.createElement("div");
    this.detailName.className = "jb-cs-detail-name";
    this.detailTitle = document.createElement("div");
    this.detailTitle.className = "jb-cs-detail-title";
    this.detailDesc = document.createElement("div");
    this.detailDesc.className = "jb-cs-detail-desc";
    detail.append(this.detailName, this.detailTitle, this.detailDesc);

    const stats = document.createElement("div");
    stats.className = "jb-cs-stats";
    for (const bar of STAT_BARS) {
      const row = document.createElement("div");
      row.className = "jb-cs-stat";
      const label = document.createElement("span");
      label.className = "jb-cs-stat-label";
      label.textContent = bar.label;
      const track = document.createElement("div");
      track.className = "jb-cs-stat-track";
      const fill = document.createElement("div");
      fill.className = "jb-cs-stat-fill";
      track.appendChild(fill);
      row.append(label, track);
      stats.appendChild(row);
      this.statFills.set(bar.label, fill);
    }
    detail.appendChild(stats);

    this.traitList = document.createElement("ul");
    this.traitList.className = "jb-cs-traits";
    detail.appendChild(this.traitList);
    panel.appendChild(detail);

    const actions = document.createElement("div");
    actions.className = "jb-cs-actions";
    const confirmBtn = document.createElement("button");
    confirmBtn.className = "jb-cs-confirm";
    confirmBtn.type = "button";
    confirmBtn.textContent = "このステージで戦う";
    confirmBtn.addEventListener("click", () => this.confirm());
    this.cancelBtn = document.createElement("button");
    this.cancelBtn.className = "jb-cs-cancel";
    this.cancelBtn.type = "button";
    this.cancelBtn.textContent = "もどる";
    this.cancelBtn.addEventListener("click", () => this.cancel());
    actions.append(confirmBtn, this.cancelBtn);
    panel.appendChild(actions);

    const hint = document.createElement("div");
    hint.className = "jb-cs-hint";
    hint.textContent = "←→ / AD で選択  ·  Enter で決定  ·  カードをタップでも選択できます";
    panel.appendChild(hint);
  }

  /**
   * @param current      stage the cursor starts on
   * @param cancellable  false only when there is nothing to go back to
   */
  open(current: StageId, cancellable: boolean): void {
    this.cancellable = cancellable;
    this.cancelBtn.style.display = cancellable ? "" : "none";
    this.open_ = true;
    this.el.classList.add("jb-show");
    this.highlight(current);
  }

  close(): void {
    this.open_ = false;
    this.el.classList.remove("jb-show");
  }

  get isOpen(): boolean {
    return this.open_;
  }

  get selectedId(): StageId {
    return this.selected;
  }

  private highlight(id: StageId): void {
    this.selected = id;
    const def = STAGES[id];

    this.cards.forEach((card, cardId) => card.classList.toggle("jb-selected", cardId === id));

    this.detailName.textContent = def.name;
    this.detailTitle.textContent = def.title;
    this.detailDesc.textContent = def.description;

    this.traitList.innerHTML = "";
    for (const trait of def.traits) {
      const li = document.createElement("li");
      li.textContent = trait;
      this.traitList.appendChild(li);
    }

    for (const bar of STAT_BARS) {
      const fill = this.statFills.get(bar.label);
      if (!fill) continue;
      fill.style.width = `${(normalizedStat(bar, def) * 100).toFixed(0)}%`;
      fill.style.background = hex(def.palette.primary);
    }

    this.opts.onHighlight(id);
  }

  private confirm(): void {
    if (!this.open_) return;
    this.opts.onConfirm(this.selected);
  }

  private cancel(): void {
    if (!this.open_ || !this.cancellable) return;
    this.opts.onCancel();
  }

  private onKeyDown(e: KeyboardEvent): void {
    // Both select screens listen on `window`, and confirming on the fighter
    // screen opens this one from inside that very event's handler — so without
    // this the same Enter would sail through and confirm the stage too. Every
    // key either screen acts on is marked handled, which makes defaultPrevented
    // the reliable "somebody already used this" flag.
    if (!this.open_ || e.defaultPrevented) return;
    const idx = STAGE_ORDER.indexOf(this.selected);
    switch (e.code) {
      case "ArrowLeft":
      case "KeyA":
      case "ArrowUp":
      case "KeyW":
        this.highlight(STAGE_ORDER[(idx - 1 + STAGE_ORDER.length) % STAGE_ORDER.length]);
        break;
      case "ArrowRight":
      case "KeyD":
      case "ArrowDown":
      case "KeyS":
        this.highlight(STAGE_ORDER[(idx + 1) % STAGE_ORDER.length]);
        break;
      case "Enter":
      case "Space":
        this.confirm();
        break;
      case "Escape":
        this.cancel();
        break;
      default:
        return;
    }
    e.preventDefault();
  }
}
