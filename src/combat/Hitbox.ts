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

export function horizontalDistance(a: THREE.Vector3, b: THREE.Vector3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}
