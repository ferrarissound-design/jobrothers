export type AerialAttackChoice = "light" | "heavy" | null;

export interface AerialAttackContext {
  selfY: number;
  targetY: number;
  horizontalDistance: number;
  lightRange: number;
  heavyRange: number;
  lightReady: boolean;
  heavyReady: boolean;
  /** 0..1 random roll supplied by the caller so the decision stays unit-testable. */
  roll: number;
  /** Chance to prefer the slower spike when its positional window is valid. */
  spikeChance: number;
}

/**
 * Chooses an aerial attack from geometry rather than treating air combat like
 * the ground game. A spike is only attempted when the opponent is at or below
 * the CPU and close enough horizontally; otherwise a fast air-light is the
 * safer interception tool.
 */
export function chooseAerialAttack(ctx: AerialAttackContext): AerialAttackChoice {
  const verticalDelta = ctx.targetY - ctx.selfY;
  const spikeWindow =
    verticalDelta <= 0.65 &&
    verticalDelta >= -4.0 &&
    ctx.horizontalDistance <= ctx.heavyRange * 1.15;

  if (ctx.heavyReady && spikeWindow && ctx.roll < ctx.spikeChance) {
    return "heavy";
  }

  const lightWindow =
    Math.abs(verticalDelta) <= 2.4 &&
    ctx.horizontalDistance <= ctx.lightRange * 1.2;
  if (ctx.lightReady && lightWindow) return "light";

  return null;
}
