import * as THREE from "three";
import { clamp } from "../utils/math";

/** Local-space forward is +Z for all character models (see characterMeshFactory). */
export function forwardFromYaw(yaw: number): THREE.Vector3 {
  return new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
}

/** Tests whether `targetPos` lies within a frontal cone from `originPos` facing `yaw`. */
export function isInFrontCone(
  originPos: THREE.Vector3,
  yaw: number,
  targetPos: THREE.Vector3,
  range: number,
  halfAngle: number,
  originRadius = 0,
  targetRadius = 0
): boolean {
  const toTarget = new THREE.Vector3().subVectors(targetPos, originPos);
  toTarget.y = 0;
  const dist = toTarget.length();
  if (dist > range + originRadius + targetRadius) return false;
  if (dist < 0.001) return true;
  toTarget.normalize();
  const facingDir = forwardFromYaw(yaw);
  const dot = clamp(facingDir.dot(toTarget), -1, 1);
  const angle = Math.acos(dot);
  return angle <= halfAngle;
}

/** Height window a hit is allowed to land in, measured from the attacker's feet. */
export interface VerticalBand {
  min: number;
  max: number;
}

/**
 * Tests the height difference between attacker and target.
 *
 * Every cone test is purely horizontal — `isInFrontCone` flattens Y away — which
 * is what lets the ground game read as a 2D fighter inside a 3D arena. A spike
 * needs the opposite: it only means anything if it can be aimed at someone
 * *below* you. Attacks without a band keep the flattened behavior.
 */
export function isInVerticalBand(originY: number, targetY: number, band?: VerticalBand): boolean {
  if (!band) return true;
  const dy = targetY - originY;
  return dy >= band.min && dy <= band.max;
}

export function horizontalDistance(a: THREE.Vector3, b: THREE.Vector3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}
