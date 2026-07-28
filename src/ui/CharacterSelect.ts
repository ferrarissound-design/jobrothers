import {
  CHARACTERS,
  CHARACTER_ORDER,
  type CharacterDef,
  type CharacterId,
  type CharacterStats,
} from "../characters/characterData";
import { CHARACTER_ATTACKS } from "../characters/attacks";

export interface CharacterSelectOptions {
  /** Fires whenever the cursor lands on a different fighter (drives the 3D preview). */
  onHighlight: (id: CharacterId) => void;
  /** Fires when the player locks their choice in; the caller starts the match. */
  onConfirm: (id: CharacterId) => void;
  /** Fires when the player backs out; only reachable when `open` was told the screen is cancellable. */
  onCancel: () => void;
}

interface StatBar {
  label: string;
  /** Pulls the comparable number out of a fighter's stat block. */
  read: (stats: CharacterStats) => number;
}

const STAT_BARS: StatBar[] = [
  { label: "スピード", read: (s) => s.moveSpeed },
  { label: "パワー", read: (s) => s.attackPower },
  { label: "ふっとばし", read: (s) => s.knockbackPower },
  { label: "ジャンプ", read: (s) => s.jumpPower },
  { label: "防御", read: (s) => s.defense },
  { label: "重さ", read: (s) => s.weight },
  { label: "必殺技", read: (s) => s.specialPower },
];

/**
 * Normalises a stat against the rest of the roster so the bars compare
 * fighters to each other rather than to an absolute scale — the numbers
 * themselves (6.2 m/s, 1.12x defense) mean nothing to a player, but "fastest
 * on the roster" does. The floor keeps the weakest entry visible as a stub
 * instead of an empty row.
 */
function normalizedStat(bar: StatBar, def: CharacterDef): number {
  let min = Infinity;
  let max = -Infinity;
  for (const id of CHARACTER_ORDER) {
    const v = bar.read(CHARACTERS[id].stats);
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  const span = max - min;
  const t = span > 0 ? (bar.read(def.stats) - min) / span : 0.5;
  return 0.18 + t * 0.82;
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

/**
 * Full-screen roster screen shown before the first match and reachable again
 * from the pause and result overlays.
 *
 * It only owns the DOM half of the screen: the rotating 3D portrait beside it
 * belongs to CharacterPreview, which is why every cursor move reports out
 * through `onHighlight` instead of drawing anything itself. The panel is docked
 * to one edge (left in landscape, bottom in portrait) so the other half of the
 * screen stays clear for that portrait.
 */
export class CharacterSelect {
  private el: HTMLElement;
  private cards = new Map<CharacterId, HTMLElement>();
  private detailName!: HTMLElement;
  private detailTitle!: HTMLElement;
  private detailDesc!: HTMLElement;
  private detailSpecial!: HTMLElement;
  private statFills = new Map<string, HTMLElement>();
  private cancelBtn!: HTMLButtonElement;

  private opts: CharacterSelectOptions;
  private selected: CharacterId = CHARACTER_ORDER[0];
  private open_ = false;
  private cancellable = false;

  constructor(root: HTMLElement, opts: CharacterSelectOptions) {
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
    title.textContent = "ファイター選択";
    const subtitle = document.createElement("div");
    subtitle.className = "jb-cs-subtitle";
    subtitle.textContent = "選ばなかった3人がCPUとして参戦します";
    panel.append(title, subtitle);

    const grid = document.createElement("div");
    grid.className = "jb-cs-grid";
    panel.appendChild(grid);

    for (const id of CHARACTER_ORDER) {
      const def = CHARACTERS[id];
      const card = document.createElement("button");
      card.className = "jb-cs-card";
      card.type = "button";
      card.style.setProperty("--jb-cs-primary", hex(def.palette.primary));
      card.style.setProperty("--jb-cs-accent", hex(def.palette.accent));

      const chip = document.createElement("div");
      chip.className = "jb-cs-chip";
      chip.style.background = `linear-gradient(150deg, ${hex(def.palette.primary)}, ${hex(
        def.palette.secondary
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
        // First tap highlights, a tap on the already-selected card commits — the
        // same double-tap-to-confirm pattern the pad buttons use, so touch
        // players never need to reach for the confirm button.
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

    this.detailSpecial = document.createElement("div");
    this.detailSpecial.className = "jb-cs-special";
    detail.appendChild(this.detailSpecial);
    panel.appendChild(detail);

    const actions = document.createElement("div");
    actions.className = "jb-cs-actions";
    const confirmBtn = document.createElement("button");
    confirmBtn.className = "jb-cs-confirm";
    confirmBtn.type = "button";
    confirmBtn.textContent = "このファイターで戦う";
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
   * @param current      fighter the cursor starts on
   * @param cancellable  false at boot, when there is no match to go back to
   */
  open(current: CharacterId, cancellable: boolean): void {
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

  get selectedId(): CharacterId {
    return this.selected;
  }

  private highlight(id: CharacterId): void {
    this.selected = id;
    const def = CHARACTERS[id];

    this.cards.forEach((card, cardId) => card.classList.toggle("jb-selected", cardId === id));

    this.detailName.textContent = def.name;
    this.detailTitle.textContent = def.title;
    this.detailDesc.textContent = def.description;
    this.detailSpecial.textContent = `必殺技: ${def.specialName}（クールダウン ${CHARACTER_ATTACKS[
      id
    ].special.cooldown.toFixed(0)}秒）`;

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
    if (!this.open_) return;
    const idx = CHARACTER_ORDER.indexOf(this.selected);
    switch (e.code) {
      case "ArrowLeft":
      case "KeyA":
      case "ArrowUp":
      case "KeyW":
        this.highlight(CHARACTER_ORDER[(idx - 1 + CHARACTER_ORDER.length) % CHARACTER_ORDER.length]);
        break;
      case "ArrowRight":
      case "KeyD":
      case "ArrowDown":
      case "KeyS":
        this.highlight(CHARACTER_ORDER[(idx + 1) % CHARACTER_ORDER.length]);
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
