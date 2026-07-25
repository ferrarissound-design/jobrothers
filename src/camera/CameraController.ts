import * as THREE from "three";
import { GameConfig } from "../config/gameConfig";
import { clamp, damp, dampAngle } from "../utils/math";
import type { Stage } from "../stage/Stage";

export interface CameraFrameContext {
  /** Horizontal distance to the closest other fighter (used to pull back when things get crowded). */
  nearestFighterDist: number;
  /** True if the target is close to the stage boundary (helps the player see the fall). */
  nearEdge: boolean;
  /** When true, camera yaw auto-follows behind facing instead of being mouse-driven (mobile). */
  autoOrbit: boolean;
}

/**
 * Third-person follow camera. Orbits around the target with mouse look on
 * desktop (auto-orbiting behind the fighter on mobile), softly pulls back in
 * crowded fights or near the stage edge, and raycasts against the stage so
 * it never clips through scenery. Movement is always damped to avoid motion
 * sickness; a short hit-stop + small shake punctuates landed hits.
 */
export class CameraController {
  camera: THREE.PerspectiveCamera;
  yaw = 0;
  pitch = 0.32;

  private shakeAmount = 0;
  private hitStopTimer = 0;
  private raycaster = new THREE.Raycaster();
  private currentDistance = GameConfig.camera.distance;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(GameConfig.camera.fov, aspect, 0.1, 500);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  handleLook(dx: number, dy: number): void {
    const sens = 0.0026;
    this.yaw -= dx * sens;
    this.pitch = clamp(this.pitch - dy * sens, -0.5, 0.95);
  }

  reset(facingAngle: number): void {
    this.yaw = facingAngle;
    this.pitch = 0.32;
  }

  triggerShake(amount: number): void {
    this.shakeAmount = Math.min(1, Math.max(this.shakeAmount, amount));
  }

  triggerHitStop(duration: number): void {
    this.hitStopTimer = Math.max(this.hitStopTimer, duration);
  }

  get isFrozen(): boolean {
    return this.hitStopTimer > 0;
  }

  /** Ticks the hit-stop timer down; call once per fixed step regardless of whether gameplay is frozen. */
  tickHitStop(dt: number): void {
    if (this.hitStopTimer > 0) this.hitStopTimer = Math.max(0, this.hitStopTimer - dt);
  }

  update(dt: number, targetPos: THREE.Vector3, targetFacing: number, ctx: CameraFrameContext, stage: Stage): void {
    const cfg = GameConfig.camera;

    if (ctx.autoOrbit) {
      this.yaw = dampAngle(this.yaw, targetFacing, 4, dt);
      this.pitch = damp(this.pitch, 0.34, 4, dt);
    }

    let desiredDistance = cfg.distance;
    if (ctx.nearEdge) desiredDistance += 1.6;
    if (ctx.nearestFighterDist < 3.5) desiredDistance += (3.5 - ctx.nearestFighterDist) * 0.5;
    desiredDistance = clamp(desiredDistance, cfg.minDistance, cfg.distance + 4);

    const focus = targetPos.clone();
    focus.y += cfg.lookHeight;

    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch)
    );

    const behindDir = dir.clone().negate();
    this.raycaster.set(focus, behindDir);
    this.raycaster.far = desiredDistance;
    const hits = stage.collidableMeshes.length ? this.raycaster.intersectObjects(stage.collidableMeshes, false) : [];
    if (hits.length > 0 && hits[0].distance < desiredDistance) {
      desiredDistance = Math.max(cfg.minDistance, hits[0].distance - 0.35);
    }

    this.currentDistance = damp(this.currentDistance, desiredDistance, 10, dt);

    const camPos = focus.clone().addScaledVector(dir, -this.currentDistance);
    camPos.y = Math.max(camPos.y, targetPos.y + 0.5);

    this.camera.position.x = damp(this.camera.position.x, camPos.x, cfg.followLambda, dt);
    this.camera.position.y = damp(this.camera.position.y, camPos.y, cfg.followLambda, dt);
    this.camera.position.z = damp(this.camera.position.z, camPos.z, cfg.followLambda, dt);

    if (this.shakeAmount > 0.001) {
      const s = this.shakeAmount * 0.12;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.shakeAmount *= Math.exp(-cfg.shakeDecay * dt);
      if (this.shakeAmount < 0.008) this.shakeAmount = 0;
    }

    this.camera.lookAt(focus);
  }
}
