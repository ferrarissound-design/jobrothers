import type { InputManager } from "../core/InputManager";

export function isMobileDevice(): boolean {
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const touchCapable = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  return touchCapable && (coarse || window.innerWidth < 900);
}

interface ButtonSpec {
  className: string;
  label: string;
  onDown: () => void;
  onUp?: () => void;
}

const JOYSTICK_RADIUS = 52;

/**
 * Left-side virtual joystick (movement) + right-side action buttons for
 * touch devices. All controls funnel into the same InputManager the
 * keyboard/mouse path uses, and every element is tracked by its own touch
 * identifier so moving, attacking and jumping simultaneously works.
 */
export class MobileControls {
  private root: HTMLElement;
  private input: InputManager;

  private joystickZone!: HTMLElement;
  private joystickBase!: HTMLElement;
  private joystickStick!: HTMLElement;
  private joystickTouchId: number | null = null;
  private joystickOrigin = { x: 0, y: 0 };

  constructor(container: HTMLElement, input: InputManager) {
    this.input = input;
    this.root = document.createElement("div");
    this.root.className = "jb-mobile";
    container.appendChild(this.root);

    this.buildJoystick();
    this.buildButtons();
  }

  activate(): void {
    this.root.classList.add("jb-active");
  }

  private buildJoystick(): void {
    const zone = document.createElement("div");
    zone.className = "jb-joystick-zone";
    const base = document.createElement("div");
    base.className = "jb-joystick-base";
    const stick = document.createElement("div");
    stick.className = "jb-joystick-stick";
    zone.append(base, stick);
    this.root.appendChild(zone);
    this.joystickZone = zone;
    this.joystickBase = base;
    this.joystickStick = stick;

    zone.addEventListener("touchstart", (e) => this.onJoystickStart(e), { passive: false });
    zone.addEventListener("touchmove", (e) => this.onJoystickMove(e), { passive: false });
    zone.addEventListener("touchend", (e) => this.onJoystickEnd(e), { passive: false });
    zone.addEventListener("touchcancel", (e) => this.onJoystickEnd(e), { passive: false });
  }

  private onJoystickStart(e: TouchEvent): void {
    e.preventDefault();
    if (this.joystickTouchId !== null) return;
    const touch = e.changedTouches[0];
    this.joystickTouchId = touch.identifier;
    const rect = this.joystickZone.getBoundingClientRect();
    this.joystickOrigin = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    this.joystickBase.style.left = `${this.joystickOrigin.x}px`;
    this.joystickBase.style.top = `${this.joystickOrigin.y}px`;
    this.joystickStick.style.left = `${this.joystickOrigin.x}px`;
    this.joystickStick.style.top = `${this.joystickOrigin.y}px`;
    this.joystickBase.style.display = "block";
    this.joystickStick.style.display = "block";
  }

  private onJoystickMove(e: TouchEvent): void {
    e.preventDefault();
    const touch = this.findTouch(e.changedTouches, this.joystickTouchId);
    if (!touch) return;
    const rect = this.joystickZone.getBoundingClientRect();
    const dx = touch.clientX - rect.left - this.joystickOrigin.x;
    const dy = touch.clientY - rect.top - this.joystickOrigin.y;
    const dist = Math.min(JOYSTICK_RADIUS, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx);
    const sx = Math.cos(angle) * dist;
    const sy = Math.sin(angle) * dist;
    this.joystickStick.style.left = `${this.joystickOrigin.x + sx}px`;
    this.joystickStick.style.top = `${this.joystickOrigin.y + sy}px`;

    const nx = sx / JOYSTICK_RADIUS;
    const ny = sy / JOYSTICK_RADIUS;
    // screen-space: right = +x, down = +y -> forward (up on screen) should be positive moveY
    this.input.setMoveAxis(nx, -ny);
    this.input.setDashHeld(Math.hypot(nx, ny) > 0.82);
  }

  private onJoystickEnd(e: TouchEvent): void {
    e.preventDefault();
    const touch = this.findTouch(e.changedTouches, this.joystickTouchId);
    if (!touch) return;
    this.joystickTouchId = null;
    this.joystickBase.style.display = "none";
    this.joystickStick.style.display = "none";
    this.input.setMoveAxis(0, 0);
    this.input.setDashHeld(false);
  }

  private findTouch(list: TouchList, id: number | null): Touch | null {
    if (id === null) return null;
    for (let i = 0; i < list.length; i++) {
      if (list[i].identifier === id) return list[i];
    }
    return null;
  }

  private buildButtons(): void {
    const zone = document.createElement("div");
    zone.className = "jb-btn-zone";
    this.root.appendChild(zone);

    const specs: ButtonSpec[] = [
      {
        className: "jb-mbtn-attack",
        label: "攻撃",
        onDown: () => this.input.pressAction("lightAttack"),
      },
      {
        className: "jb-mbtn-strong",
        label: "強攻撃",
        onDown: () => this.input.pressAction("heavyAttack"),
      },
      {
        className: "jb-mbtn-special",
        label: "必殺技",
        onDown: () => this.input.pressAction("special"),
      },
      {
        className: "jb-mbtn-jump",
        label: "ジャンプ",
        onDown: () => this.input.pressAction("jump"),
        onUp: () => this.input.releaseAction("jump"),
      },
      {
        className: "jb-mbtn-guard",
        label: "ガード",
        onDown: () => this.input.setGuardHeld(true),
        onUp: () => this.input.setGuardHeld(false),
      },
      {
        className: "jb-mbtn-dodge",
        label: "回避",
        onDown: () => this.input.pressAction("dodge"),
      },
    ];

    for (const spec of specs) {
      const btn = document.createElement("div");
      btn.className = `jb-mbtn ${spec.className}`;
      btn.textContent = spec.label;
      btn.addEventListener(
        "touchstart",
        (e) => {
          e.preventDefault();
          btn.classList.add("jb-pressed");
          spec.onDown();
        },
        { passive: false }
      );
      const release = (e: TouchEvent) => {
        e.preventDefault();
        btn.classList.remove("jb-pressed");
        spec.onUp?.();
      };
      btn.addEventListener("touchend", release, { passive: false });
      btn.addEventListener("touchcancel", release, { passive: false });
      btn.addEventListener("contextmenu", (e) => e.preventDefault());
      zone.appendChild(btn);
    }
  }
}
