import { KeyBindings } from "../config/controls";

export type ActionName =
  | "jump"
  | "lightAttack"
  | "heavyAttack"
  | "special"
  | "dodge"
  | "cameraReset"
  | "pause"
  | "debugToggle";

/**
 * Unifies keyboard/mouse (PC) and virtual joystick/buttons (mobile) into one
 * intent state that CharacterController and Game read from every frame.
 * MobileControls writes into this same instance so downstream code never
 * needs to know which input source is active.
 */
export class InputManager {
  moveX = 0; // -1 (left) .. 1 (right), local to camera
  moveY = 0; // -1 (back) .. 1 (forward)
  lookDX = 0; // accumulated mouse look delta this frame
  lookDY = 0;
  guardHeld = false;
  dashHeld = false;
  jumpHeld = false;

  private justPressed = new Set<ActionName>();
  private canvas: HTMLElement;
  private pointerLocked = false;
  private keysDown = new Set<string>();

  constructor(canvas: HTMLElement) {
    this.canvas = canvas;
    this.bindKeyboard();
    this.bindMouse();
  }

  private bindKeyboard(): void {
    window.addEventListener("keydown", (e) => {
      if (this.keysDown.has(e.code)) return; // ignore OS auto-repeat
      this.keysDown.add(e.code);
      this.handleDown(e.code);
      if (
        [
          KeyBindings.moveForward,
          KeyBindings.moveBackward,
          KeyBindings.moveLeft,
          KeyBindings.moveRight,
          KeyBindings.jump,
          "F3",
        ].includes(e.code)
      ) {
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => {
      this.keysDown.delete(e.code);
      this.updateMoveAxesFromKeys();
      if (e.code === KeyBindings.jump) this.jumpHeld = false;
      if (e.code === KeyBindings.guard) this.guardHeld = false;
      if (e.code === KeyBindings.dash || e.code === KeyBindings.dashAlt) this.dashHeld = false;
    });
  }

  private handleDown(code: string): void {
    this.updateMoveAxesFromKeys();
    if (code === KeyBindings.jump) {
      this.jumpHeld = true;
      this.justPressed.add("jump");
    }
    if (code === KeyBindings.guard) this.guardHeld = true;
    if (code === KeyBindings.dash || code === KeyBindings.dashAlt) this.dashHeld = true;
    if (code === KeyBindings.special) this.justPressed.add("special");
    if (code === KeyBindings.dodgeA || code === KeyBindings.dodgeB) this.justPressed.add("dodge");
    if (code === KeyBindings.cameraReset) this.justPressed.add("cameraReset");
    if (code === KeyBindings.pause) this.justPressed.add("pause");
    if (code === KeyBindings.debugToggle) this.justPressed.add("debugToggle");
  }

  private updateMoveAxesFromKeys(): void {
    let x = 0;
    let y = 0;
    if (this.keysDown.has(KeyBindings.moveRight)) x += 1;
    if (this.keysDown.has(KeyBindings.moveLeft)) x -= 1;
    if (this.keysDown.has(KeyBindings.moveForward)) y += 1;
    if (this.keysDown.has(KeyBindings.moveBackward)) y -= 1;
    this.moveX = x;
    this.moveY = y;
  }

  private bindMouse(): void {
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0) this.justPressed.add("lightAttack");
      if (e.button === 2) this.justPressed.add("heavyAttack");
      if (!this.pointerLocked && e.button === 0) {
        this.canvas.requestPointerLock?.();
      }
    });
    document.addEventListener("pointerlockchange", () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
    });
    document.addEventListener("mousemove", (e) => {
      if (this.pointerLocked) {
        this.lookDX += e.movementX || 0;
        this.lookDY += e.movementY || 0;
      }
    });
  }

  /** Called by MobileControls / touch UI. */
  setMoveAxis(x: number, y: number): void {
    this.moveX = x;
    this.moveY = y;
  }

  /** Called by MobileControls' look-drag zone; mirrors the pointer-locked mousemove path. */
  addLookDelta(dx: number, dy: number): void {
    this.lookDX += dx;
    this.lookDY += dy;
  }

  pressAction(action: ActionName): void {
    this.justPressed.add(action);
    if (action === "jump") this.jumpHeld = true;
  }

  releaseAction(action: ActionName): void {
    if (action === "jump") this.jumpHeld = false;
  }

  setGuardHeld(v: boolean): void {
    this.guardHeld = v;
  }

  setDashHeld(v: boolean): void {
    this.dashHeld = v;
  }

  consumeJustPressed(action: ActionName): boolean {
    if (this.justPressed.has(action)) {
      this.justPressed.delete(action);
      return true;
    }
    return false;
  }

  /** Call once per frame after all systems have read input, to clear per-frame deltas. */
  endFrame(): void {
    this.lookDX = 0;
    this.lookDY = 0;
  }

  get isPointerLocked(): boolean {
    return this.pointerLocked;
  }
}
