import * as THREE from "three";
import { createCharacterMesh } from "../characters/characterMeshFactory";
import type { CharacterDef } from "../characters/characterData";
import { toonMaterial } from "./celShading";
import { disposeObject3D } from "../utils/dispose";

/**
 * The turntable behind the character select screen: its own scene, camera and
 * lighting, drawn with the game's renderer while no match is running.
 *
 * It is deliberately separate from the match scene rather than a corner of it.
 * The fighters in a match are lit for an outdoor arena and framed by the chase
 * camera; a portrait needs its own key light and a camera that can be pushed
 * off-center so the model sits in whatever part of the screen the select panel
 * is not covering.
 */
export class CharacterPreview {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  private turntable = new THREE.Group();
  private podium = new THREE.Group();

  private model?: THREE.Object3D;
  private modelHeight = 1.75;
  private aspect = 1;
  /** Where the model should sit on screen, in NDC (-1..1); set by setViewport. */
  private screenX = 0;
  private screenY = 0;
  private distanceScale = 1;
  private time = 0;

  constructor() {
    this.scene.background = new THREE.Color(0x111629);
    this.scene.fog = new THREE.Fog(0x111629, 9, 22);
    this.scene.add(this.turntable);
    this.buildLighting();
    this.buildPodium();
  }

  private buildLighting(): void {
    // Three-point setup: a warm key from the front-left carries the cel bands, a
    // cool rim from behind separates the silhouette from the dark backdrop, and
    // a low ambient keeps the shadow side readable instead of crushed.
    this.scene.add(new THREE.HemisphereLight(0x9fd0ff, 0x1a1f33, 1.1));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.35));

    const key = new THREE.DirectionalLight(0xfff0d5, 2.8);
    key.position.set(3, 5, 6);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x7fd4ff, 1.8);
    rim.position.set(-4, 3, -5);
    this.scene.add(rim);
  }

  /** Podium sized for a 1.75 m fighter; setCharacter rescales it to whoever is standing on it. */
  private buildPodium(): void {
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 1.15, 0.12, 40),
      toonMaterial("matte", { color: 0x2a3150 })
    );
    disc.position.y = -0.06;
    this.podium.add(disc);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.07, 0.03, 8, 48),
      toonMaterial("hard", { color: 0x4fd1ff, emissive: 0x1b6b8c })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.02;
    this.podium.add(ring);
    this.turntable.add(this.podium);
  }

  /** Swaps in a new fighter model, disposing the previous one. */
  setCharacter(def: CharacterDef): void {
    if (this.model) {
      disposeObject3D(this.model);
      this.model = undefined;
    }
    const parts = createCharacterMesh(def);
    this.model = parts.root;
    this.modelHeight = def.stats.height;
    this.podium.scale.setScalar(def.stats.height / 1.75);
    this.turntable.add(this.model);
    this.turntable.rotation.y = 0;
    this.time = 0;
    this.updateCamera();
  }

  /**
   * @param width  canvas width in CSS pixels
   * @param height canvas height in CSS pixels
   *
   * Places the model in whichever half the select panel leaves free: beside it
   * when the panel is docked to the left edge, above it when it is docked to
   * the bottom. The trigger has to match the CSS media query that moves the
   * panel, or the portrait ends up underneath it.
   */
  setViewport(width: number, height: number): void {
    this.aspect = width / Math.max(1, height);
    const panelAtBottom = this.aspect < 1.05 || width <= 720;
    this.screenX = panelAtBottom ? 0 : 0.5;
    this.screenY = panelAtBottom ? 0.66 : 0.05;
    // The strip above a bottom-docked panel is much shorter than a half-width
    // column, so the camera backs off to fit the fighter into it.
    this.distanceScale = panelAtBottom ? 1.75 : 1;
    this.updateCamera();
  }

  private updateCamera(): void {
    const h = this.modelHeight;
    const dist = h * 3.1 * this.distanceScale;
    const targetY = h * 0.55;

    // Shifting the camera (and its look-at point) sideways slides the model the
    // opposite way across the frame without skewing the projection, which is
    // what an off-center lens shift would do.
    const halfH = Math.tan((this.camera.fov * Math.PI) / 360) * dist;
    const halfW = halfH * this.aspect;
    const offX = -this.screenX * halfW;
    const offY = -this.screenY * halfH;

    this.camera.aspect = this.aspect;
    this.camera.position.set(offX, targetY + offY + h * 0.12, dist);
    this.camera.lookAt(offX, targetY + offY, 0);
    this.camera.updateProjectionMatrix();
  }

  /** Slow turntable spin plus a breathing bob, so the portrait never sits dead still. */
  update(dt: number): void {
    this.time += dt;
    this.turntable.rotation.y += dt * 0.55;
    if (this.model) {
      this.model.position.y = Math.sin(this.time * 1.8) * this.modelHeight * 0.012;
    }
  }

  render(renderer: THREE.WebGLRenderer): void {
    renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    if (this.model) {
      disposeObject3D(this.model);
      this.model = undefined;
    }
    // Copied first: disposeObject3D detaches each child, which would otherwise
    // shuffle the live array out from under the iteration.
    [...this.turntable.children].forEach((child) => disposeObject3D(child));
  }
}
