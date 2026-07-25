export type UpdateFn = (dt: number) => void;
export type RenderFn = (alpha: number) => void;

/**
 * requestAnimationFrame driven loop with a fixed timestep accumulator for
 * stable physics/combat, and a render callback for interpolated drawing.
 * Automatically stops ticking (but keeps listening) while the tab is hidden.
 */
export class GameLoop {
  private fixedStep: number;
  private maxSubSteps: number;
  private accumulator = 0;
  private lastTime = 0;
  private rafId = 0;
  private running = false;
  private hidden = false;

  private updateFn: UpdateFn;
  private renderFn: RenderFn;
  private timeScale = 1;

  constructor(fixedStep: number, maxSubSteps: number, updateFn: UpdateFn, renderFn: RenderFn) {
    this.fixedStep = fixedStep;
    this.maxSubSteps = maxSubSteps;
    this.updateFn = updateFn;
    this.renderFn = renderFn;

    document.addEventListener("visibilitychange", () => {
      this.hidden = document.hidden;
      if (!this.hidden) this.lastTime = performance.now();
    });
  }

  setTimeScale(scale: number): void {
    this.timeScale = scale;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    if (this.hidden) {
      this.lastTime = now;
      return;
    }

    let frameTime = (now - this.lastTime) / 1000;
    this.lastTime = now;
    frameTime = Math.min(frameTime, 0.25); // avoid spiral of death on tab-back
    this.accumulator += frameTime * this.timeScale;

    let steps = 0;
    while (this.accumulator >= this.fixedStep && steps < this.maxSubSteps) {
      this.updateFn(this.fixedStep);
      this.accumulator -= this.fixedStep;
      steps++;
    }
    if (steps >= this.maxSubSteps) this.accumulator = 0;

    const alpha = this.accumulator / this.fixedStep;
    this.renderFn(alpha);
  };
}
