import * as THREE from "three";
import { inkMesh, toonMaterial } from "./celShading";
import { disposeObject3D } from "../utils/dispose";
import type { StageDef } from "../stage/stageData";

/** Marker colours for the breakable props, matching the real ones in the arena. */
const PROP_COLORS: Record<string, number> = {
  crate: 0xa5723a,
  drum: 0xd6432c,
  wall: 0x8b8f94,
  sign: 0xffcc33,
  vending: 0x2f7dbf,
};

const PREVIEW_INK = 0.05;

/**
 * The rotating diorama behind the stage select screen: its own scene and
 * camera, drawn with the game's renderer while no match is running — the same
 * arrangement CharacterPreview uses for the fighter portrait.
 *
 * It is a *simplified* model of the arena, not the arena itself. It reads the
 * same `StageDef` the real stage is built from, so a new stage gets a preview
 * for free, but it skips the breakable props' real meshes, the procedural floor
 * texture and every system behind them: a select screen should not be paying
 * for particle pools and hit-reactive materials just to show a shape.
 */
export class StagePreview {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.5, 400);
  private turntable = new THREE.Group();
  private lights: THREE.Light[] = [];

  private diorama?: THREE.Group;
  private arenaRadius = 26;
  private aspect = 1;
  /** Where the diorama should sit on screen, in NDC (-1..1); set by setViewport. */
  private screenX = 0;
  private screenY = 0;

  constructor() {
    this.scene.add(this.turntable);
  }

  /** Rebuilds the diorama (and the lighting mood) for a stage. */
  setStage(def: StageDef): void {
    if (this.diorama) {
      disposeObject3D(this.diorama);
      this.diorama = undefined;
    }
    this.arenaRadius = def.arenaRadius;
    this.applyLighting(def);

    const g = new THREE.Group();
    this.buildGround(g, def);
    this.buildPlatforms(g, def);
    this.buildProps(g, def);
    this.buildDressing(g, def);
    this.diorama = g;
    this.turntable.add(g);
    this.turntable.rotation.y = 0.6;
    this.updateCamera();
  }

  /**
   * Lights the diorama with the stage's own values, so the card the player is
   * looking at already shows them the time of day they are choosing. Intensities
   * are pulled down from the in-match ones: a model seen whole from outside
   * takes far more of the key light than a fighter standing under it does.
   */
  private applyLighting(def: StageDef): void {
    for (const light of this.lights) this.scene.remove(light);
    this.lights = [];

    const l = def.lighting;
    this.scene.background = new THREE.Color(l.sky);
    // Range is filled in by updateCamera: how far back the camera has to sit to
    // frame the arena depends on the viewport, so a fixed range would either
    // fog the whole diorama away or never touch it.
    this.scene.fog = new THREE.Fog(l.sky, 1, 2);

    const hemi = new THREE.HemisphereLight(l.hemiSky, l.hemiGround, l.hemiIntensity);
    const ambient = new THREE.AmbientLight(0xffffff, l.ambientIntensity + 0.25);
    const sun = new THREE.DirectionalLight(l.sunColor, l.sunIntensity * 0.55);
    sun.position.set(...l.sunPosition);
    const rim = new THREE.DirectionalLight(l.rimColor, l.rimIntensity);
    rim.position.set(...l.rimPosition);

    this.lights = [hemi, ambient, sun, rim];
    for (const light of this.lights) this.scene.add(light);
  }

  private buildGround(parent: THREE.Group, def: StageDef): void {
    const r = def.arenaRadius;
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, 1.2, 44),
      toonMaterial("matte", { color: new THREE.Color(def.ground.base) })
    );
    disc.position.y = -0.6;
    parent.add(inkMesh(disc, PREVIEW_INK));

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r * 0.55, r * 0.58, 48),
      new THREE.MeshBasicMaterial({ color: def.ground.ringColor, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    parent.add(ring);

    if (def.ground.rimColor !== undefined) {
      const trim = new THREE.Mesh(
        new THREE.RingGeometry(r - 0.8, r, 56),
        new THREE.MeshBasicMaterial({ color: def.ground.rimColor, side: THREE.DoubleSide })
      );
      trim.rotation.x = -Math.PI / 2;
      trim.position.y = 0.02;
      parent.add(trim);
    }
  }

  private buildPlatforms(parent: THREE.Group, def: StageDef): void {
    for (const p of def.platforms) {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(p.w, p.topY, p.d),
        toonMaterial("matte", { color: p.color })
      );
      box.position.set(p.x, p.topY / 2, p.z);
      parent.add(inkMesh(box, PREVIEW_INK));
    }
  }

  /** Breakable props stand in as plain blocks — enough to read where the clutter is. */
  private buildProps(parent: THREE.Group, def: StageDef): void {
    for (const d of def.destructibles) {
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 1, 0.9),
        toonMaterial("matte", { color: PROP_COLORS[d.type] ?? 0xaaaaaa })
      );
      block.position.set(d.x, 0.5, d.z);
      parent.add(inkMesh(block, PREVIEW_INK * 0.6));
    }
  }

  /** A silhouette of whatever surrounds the arena, so the two stages read apart at a glance. */
  private buildDressing(parent: THREE.Group, def: StageDef): void {
    const r = def.arenaRadius;
    if (def.dressing === "skyline") {
      // In the match these towers are sunk far below the roof and only their
      // tops clear it. A diorama seen from above would show the rest of them
      // hanging in the void, so the preview keeps just the part that reads as
      // a skyline: shorter towers, pulled in close, standing around the arena.
      for (let i = 0; i < 9; i++) {
        const angle = (i / 9) * Math.PI * 2 + 0.3;
        const dist = r + 4.5 + (i % 3) * 2.5;
        const height = 5 + ((i * 7) % 5) * 2.2;
        const width = 3 + ((i * 3) % 3);
        const tower = new THREE.Mesh(
          new THREE.BoxGeometry(width, height, width),
          toonMaterial("matte", { color: 0x39304f })
        );
        tower.position.set(Math.cos(angle) * dist, height / 2 - 2.5, Math.sin(angle) * dist);
        parent.add(inkMesh(tower, PREVIEW_INK));
      }
      return;
    }

    const containerColors = [0xc0392b, 0x2471a3, 0x27ae60, 0xd68910];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const dist = r + 4 + (i % 2) * 2;
      const container = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 2.2, 5.5),
        toonMaterial("matte", { color: containerColors[i % containerColors.length] })
      );
      container.position.set(Math.cos(angle) * dist, 1.1, Math.sin(angle) * dist);
      container.rotation.y = angle;
      parent.add(inkMesh(container, PREVIEW_INK));
    }
  }

  /**
   * @param width  canvas width in CSS pixels
   * @param height canvas height in CSS pixels
   *
   * Mirrors CharacterPreview: the select panel docks to the left edge in
   * landscape and to the bottom in portrait, and the diorama takes whichever
   * half is left over. The breakpoint has to match the CSS that moves the
   * panel, or the model ends up underneath it.
   */
  setViewport(width: number, height: number): void {
    this.aspect = width / Math.max(1, height);
    const panelAtBottom = this.aspect < 1.05 || width <= 720;
    this.screenX = panelAtBottom ? 0 : 0.48;
    this.screenY = panelAtBottom ? 0.6 : 0.06;
    this.updateCamera();
  }

  /**
   * Frames the arena from a raised three-quarter view, then slides the whole
   * shot to clear the select panel.
   *
   * The distance is solved for rather than tuned: the panel eats one half of
   * the frame, and how much of the other half is left over depends on both the
   * aspect ratio and which edge the panel is docked to — a hand-picked distance
   * that fits on a desktop crops the arena off the side of a phone. The slide
   * itself moves the camera and its look-at point together along the camera's
   * own right/up axes, which shifts the subject across the frame without the
   * skew an off-centre lens would add.
   */
  private updateCamera(): void {
    const tan = Math.tan((this.camera.fov * Math.PI) / 360);
    // The arena plus a margin for the scenery ringing it.
    const framed = this.arenaRadius * 1.6;
    const usableX = Math.max(0.25, 1 - Math.abs(this.screenX));
    const usableY = Math.max(0.25, 1 - Math.abs(this.screenY));
    // Seen from above at 30°, a flat disc covers half the frame vertically that
    // it does horizontally; the allowance left over holds whatever stands on it.
    const dist = Math.max(framed / (tan * this.aspect * usableX), (framed * 0.75) / (tan * usableY));

    // A 30° elevation, held constant as the distance changes.
    const eye = new THREE.Vector3(0, dist * 0.5, dist * 0.866);
    const target = new THREE.Vector3(0, 0, 0);

    this.camera.aspect = this.aspect;
    this.camera.position.copy(eye);
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld();

    const halfH = tan * dist;
    const halfW = halfH * this.aspect;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    const offset = right.multiplyScalar(-this.screenX * halfW).addScaledVector(up, -this.screenY * halfH);

    this.camera.position.copy(eye).add(offset);
    this.camera.lookAt(target.clone().add(offset));
    this.camera.far = dist * 3;
    this.camera.updateProjectionMatrix();

    // Just enough haze on the far scenery to give the diorama some depth.
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near = dist * 0.95;
      this.scene.fog.far = dist * 2.1;
    }
  }

  /** Slow orbit, so the arena's height differences read from more than one angle. */
  update(dt: number): void {
    this.turntable.rotation.y += dt * 0.22;
  }

  render(renderer: THREE.WebGLRenderer): void {
    renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    if (this.diorama) {
      disposeObject3D(this.diorama);
      this.diorama = undefined;
    }
    for (const light of this.lights) this.scene.remove(light);
    this.lights = [];
  }
}
