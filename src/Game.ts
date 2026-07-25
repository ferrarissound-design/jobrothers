import * as THREE from "three";
import { GameLoop } from "./core/GameLoop";
import { InputManager } from "./core/InputManager";
import { AudioManager } from "./core/AudioManager";
import { EffectManager } from "./core/EffectManager";
import { CombatSystem } from "./combat/CombatSystem";
import { Stage } from "./stage/Stage";
import { CameraController } from "./camera/CameraController";
import { UIManager, type FighterUIState } from "./ui/UIManager";
import { MobileControls, isMobileDevice } from "./ui/MobileControls";
import { Character } from "./characters/Character";
import { CharacterController, type CharacterIntent } from "./characters/CharacterController";
import { CPUController } from "./ai/CPUController";
import { CHARACTERS, type CharacterId } from "./characters/characterData";
import { CHARACTER_ATTACKS } from "./characters/attacks";
import {
  GameConfig,
  QUALITY_PRESETS,
  STORAGE_KEYS,
  type QualityLevel,
  type AIDifficulty,
} from "./config/gameConfig";
import type { AIPersonality } from "./ai/AIState";
import { horizontalDistance } from "./combat/Hitbox";
import { clamp, dampAngle } from "./utils/math";
import { readSetting, writeSetting } from "./utils/storage";

type MatchPhase = "playing" | "paused" | "result";

interface FighterEntry {
  character: Character;
  cpu?: CPUController;
}

/**
 * Top-level orchestrator: owns the Three.js scene/renderer, all subsystems,
 * every fighter, and the fixed-timestep game loop. This is intentionally the
 * only place that wires subsystems together — each subsystem stays unaware
 * of the others.
 */
export class Game {
  private scene = new THREE.Scene();
  private renderer: THREE.WebGLRenderer;
  private loop: GameLoop;
  private input: InputManager;
  private audio = new AudioManager();
  private effects: EffectManager;
  private combat: CombatSystem;
  private stage: Stage;
  private cameraController: CameraController;
  private ui: UIManager;
  private mobileControls?: MobileControls;
  private isMobile: boolean;
  private sunLight: THREE.DirectionalLight;

  private fighters: FighterEntry[] = [];
  private player: Character;
  private controller: CharacterController;

  private quality: QualityLevel;
  private difficulty: AIDifficulty;
  private phase: MatchPhase = "playing";
  private matchTime = 0;
  private debugEnabled = false;
  private lastFrameTime = performance.now();
  private fpsAccum = 0;
  private fpsFrames = 0;
  private fpsDisplay = 0;

  constructor(private canvas: HTMLCanvasElement, private uiRoot: HTMLElement) {
    this.isMobile = isMobileDevice();
    this.quality =
      (readSetting(STORAGE_KEYS.quality) as QualityLevel | null) ??
      (this.isMobile ? "medium" : "high");
    this.difficulty = (readSetting(STORAGE_KEYS.difficulty) as AIDifficulty | null) ?? "normal";

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.isMobile, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.input = new InputManager(canvas);
    this.effects = new EffectManager(this.scene, QUALITY_PRESETS[this.quality]);
    this.cameraController = new CameraController(window.innerWidth / window.innerHeight);

    this.combat = new CombatSystem(this.scene, this.effects, this.audio, {
      onHitStop: (d) => this.cameraController.triggerHitStop(d),
      onCameraShake: (a) => this.cameraController.triggerShake(a),
    });

    this.stage = new Stage(this.scene, this.effects, QUALITY_PRESETS[this.quality], (pos) => {
      this.combat.applyExplosionDamage(
        pos,
        3.2,
        15,
        12,
        this.fighters.map((f) => f.character)
      );
    });

    this.sunLight = this.setupLighting();
    this.applyRendererQuality();

    this.controller = new CharacterController(this.stage, this.combat, this.effects, this.audio);

    this.player = this.spawnFighters();

    this.ui = new UIManager(uiRoot, {
      isMobile: this.isMobile,
      initialQuality: this.quality,
      initialVolume: this.audio.getVolume(),
      initialDifficulty: this.difficulty,
      onPauseToggle: (paused) => this.setPaused(paused),
      onRestart: () => this.restart(),
      onQualityChange: (q) => this.setQuality(q),
      onVolumeChange: (v) => this.audio.setVolume(v),
      onDifficultyChange: (d) => this.setDifficulty(d),
    });

    if (this.isMobile) {
      this.mobileControls = new MobileControls(uiRoot, this.input);
      this.mobileControls.activate();
    }

    window.addEventListener("resize", () => this.onResize());
    const unlock = () => {
      this.audio.resume();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("touchstart", unlock);
    window.addEventListener("keydown", unlock);

    this.loop = new GameLoop(
      GameConfig.fixedTimeStep,
      GameConfig.maxSubSteps,
      (dt) => this.fixedUpdate(dt),
      (alpha) => this.render(alpha)
    );
  }

  start(): void {
    this.loop.start();
  }

  private setupLighting(): THREE.DirectionalLight {
    const ambient = new THREE.HemisphereLight(0xcfe0ff, 0x4a4632, 2.4);
    this.scene.add(ambient);
    const fill = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(fill);
    const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
    sun.position.set(15, 24, 10);
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -30;
    sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    sun.shadow.camera.far = 80;
    sun.shadow.bias = -0.0025;
    this.scene.add(sun);
    this.scene.background = new THREE.Color(0x6f88ad);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    return sun;
  }

  private spawnFighters(): Character {
    const spawnPoints = this.stage.spawnPoints;
    const playerDef = CHARACTERS.jorio;
    const player = new Character({ instanceId: "player", displayName: playerDef.name, isPlayer: true }, playerDef, spawnPoints[0]);
    this.scene.add(player.group);
    this.fighters.push({ character: player });

    const cpuRoster: { id: CharacterId; personality: AIPersonality }[] = [
      { id: "birinezu", personality: "aggressive" },
      { id: "hayasugi", personality: "cautious" },
      { id: "danboru", personality: "ranged" },
    ];

    cpuRoster.forEach((entry, i) => {
      const def = CHARACTERS[entry.id];
      const c = new Character(
        { instanceId: `cpu${i + 1}`, displayName: def.name, isPlayer: false },
        def,
        spawnPoints[(i + 1) % spawnPoints.length]
      );
      this.scene.add(c.group);
      const cpu = new CPUController(entry.personality, this.difficulty);
      this.fighters.push({ character: c, cpu });
    });

    return player;
  }

  // --- fixed-step simulation -------------------------------------------

  private fixedUpdate(dt: number): void {
    this.cameraController.tickHitStop(dt);
    if (this.phase !== "playing" || this.cameraController.isFrozen) return;

    this.matchTime += dt;

    const playerIntent = this.buildPlayerIntent();
    this.controller.update(this.player, playerIntent, dt);

    const allChars = this.fighters.map((f) => f.character);
    for (const f of this.fighters) {
      if (!f.cpu) continue;
      const others = allChars.filter((c) => c !== f.character);
      const intent = f.cpu.update(dt, f.character, others, this.stage);
      this.controller.update(f.character, intent, dt);
    }

    this.combat.update(dt, allChars, this.stage.destructibles);
    this.stage.removeDestroyed();

    this.resolveObstacleCollisions();
    this.resolveCharacterCollisions();
    this.checkFalls();
    this.effects.update(dt);
    this.checkWinCondition();
  }

  private buildPlayerIntent(): CharacterIntent {
    const yaw = this.cameraController.yaw;

    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
    const moveWorld = new THREE.Vector3()
      .addScaledVector(right, this.input.moveX)
      .addScaledVector(forward, this.input.moveY);
    if (moveWorld.lengthSq() > 1) moveWorld.normalize();

    if (this.isMobile) {
      if (moveWorld.lengthSq() > 0.02) {
        const desired = Math.atan2(moveWorld.x, moveWorld.z);
        this.player.facingAngle = dampAngle(this.player.facingAngle, desired, 12, GameConfig.fixedTimeStep);
      }
    } else {
      this.player.facingAngle = yaw;
    }

    return {
      moveX: moveWorld.x,
      moveZ: moveWorld.z,
      wantJump: this.input.consumeJustPressed("jump"),
      wantLight: this.input.consumeJustPressed("lightAttack"),
      wantHeavy: this.input.consumeJustPressed("heavyAttack"),
      wantSpecial: this.input.consumeJustPressed("special"),
      wantGuard: this.input.guardHeld,
      wantDash: this.input.dashHeld,
      wantDodge: this.input.consumeJustPressed("dodge"),
    };
  }

  private resolveObstacleCollisions(): void {
    for (const f of this.fighters) {
      const c = f.character;
      if (!c.alive) continue;
      for (const obs of this.stage.destructibles) {
        if (obs.destroyed) continue;
        const dx = c.position.x - obs.position.x;
        const dz = c.position.z - obs.position.z;
        const dist = Math.hypot(dx, dz);
        const minDist = c.radius + obs.radius;
        if (dist < minDist && dist > 0.0001) {
          const speed = Math.hypot(c.velocity.x, c.velocity.z);
          if (c.state === "hitstun" && speed > 6) {
            obs.takeHit(4 + speed * 0.6, speed);
          }
          const nx = dx / dist;
          const nz = dz / dist;
          const push = minDist - dist;
          c.position.x += nx * push;
          c.position.z += nz * push;
        }
      }
    }
  }

  private resolveCharacterCollisions(): void {
    const chars = this.fighters.map((f) => f.character).filter((c) => c.alive);
    for (let i = 0; i < chars.length; i++) {
      for (let j = i + 1; j < chars.length; j++) {
        const a = chars[i];
        const b = chars[j];
        const dx = a.position.x - b.position.x;
        const dz = a.position.z - b.position.z;
        const dist = Math.hypot(dx, dz);
        const minDist = a.radius + b.radius;
        if (dist > 0.0001 && dist < minDist) {
          const nx = dx / dist;
          const nz = dz / dist;
          const push = (minDist - dist) / 2;
          a.position.x += nx * push;
          a.position.z += nz * push;
          b.position.x -= nx * push;
          b.position.z -= nz * push;
        }
      }
    }
  }

  private checkFalls(): void {
    for (const f of this.fighters) {
      const c = f.character;
      if (!c.alive) continue;
      if (c.position.y < GameConfig.fallDeathY) {
        this.audio.play("fall");
        this.effects.spawnFallLight(c.position.clone());
        const eliminated = c.loseStock();
        if (eliminated) {
          c.alive = false;
          c.group.visible = false;
        } else {
          const spawnIdx = Math.floor(Math.random() * this.stage.spawnPoints.length);
          c.resetForRespawn(this.stage.spawnPoints[spawnIdx]);
          c.group.visible = true;
        }
      }
    }
  }

  private checkWinCondition(): void {
    const aliveCount = this.fighters.filter((f) => f.character.alive).length;
    const timeUp = GameConfig.matchTimeLimit > 0 && this.matchTime >= GameConfig.matchTimeLimit;
    if (aliveCount > 1 && !timeUp) return;

    let winner = this.fighters[0].character;
    for (const f of this.fighters) {
      const c = f.character;
      if (c.stocks > winner.stocks || (c.stocks === winner.stocks && c.damagePercent < winner.damagePercent)) {
        winner = c;
      }
    }
    this.endMatch(winner.isPlayer);
  }

  private endMatch(playerWon: boolean): void {
    this.phase = "result";
    this.mobileControls?.setEnabled(false);
    this.audio.play(playerWon ? "win" : "lose");
    this.ui.showResult(playerWon);
    this.loop.setTimeScale(0.25);
    window.setTimeout(() => this.loop.setTimeScale(1), 900);
  }

  // --- per-frame presentation -------------------------------------------

  private render(_alpha: number): void {
    const now = performance.now();
    const realDt = Math.min(0.05, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    if (this.input.consumeJustPressed("cameraReset")) {
      this.cameraController.reset(this.player.facingAngle);
    }
    if (this.input.consumeJustPressed("pause") && this.phase !== "result") {
      this.ui.togglePause();
    }
    if (this.input.consumeJustPressed("debugToggle")) {
      this.debugEnabled = !this.debugEnabled;
      this.ui.setDebugVisible(this.debugEnabled);
    }

    if (this.phase === "playing" && !this.cameraController.isFrozen) {
      this.cameraController.handleLook(this.input.lookDX, this.input.lookDY);
    }
    this.input.endFrame();

    this.updateCameraFollow(realDt);
    this.updateUI();
    this.updateDebug(realDt);

    this.renderer.render(this.scene, this.cameraController.camera);
  }

  private updateCameraFollow(dt: number): void {
    let nearestDist = Infinity;
    for (const f of this.fighters) {
      if (f.character === this.player) continue;
      nearestDist = Math.min(nearestDist, horizontalDistance(this.player.position, f.character.position));
    }
    const distFromCenter = Math.hypot(this.player.position.x, this.player.position.z);
    const nearEdge = distFromCenter > this.stage.arenaRadius - 5;

    this.cameraController.update(
      dt,
      this.player.position,
      { nearestFighterDist: nearestDist, nearEdge },
      this.stage
    );
  }

  private updateUI(): void {
    const fighters: FighterUIState[] = this.fighters.map((f) => ({
      instanceId: f.character.instanceId,
      name: f.character.displayName,
      isPlayer: f.character.isPlayer,
      damagePercent: f.character.damagePercent,
      stocks: Math.max(0, f.character.stocks),
      guardDurability: f.character.guardDurability,
      alive: f.character.alive,
    }));

    const specialCd = this.player.attackCooldowns.special;
    const specialMax = CHARACTER_ATTACKS[this.player.def.id].special.cooldown;

    this.ui.update({
      fighters,
      matchTime: this.matchTime,
      specialCooldownFrac: specialMax > 0 ? clamp(specialCd / specialMax, 0, 1) : 0,
      specialReady: specialCd <= 0,
    });
  }

  private updateDebug(realDt: number): void {
    this.fpsFrames++;
    this.fpsAccum += realDt;
    if (this.fpsAccum >= 0.5) {
      this.fpsDisplay = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsFrames = 0;
      this.fpsAccum = 0;
    }
    if (!this.debugEnabled) return;

    const lines = [
      `FPS: ${this.fpsDisplay}`,
      `objects: ${this.scene.children.length}  particles: ${this.effects.activeCount}  mines: ${this.combat.mineCount}`,
      `camera yaw:${((this.cameraController.yaw * 180) / Math.PI).toFixed(1)} pitch:${(
        (this.cameraController.pitch * 180) /
        Math.PI
      ).toFixed(1)}`,
      "",
    ];
    for (const f of this.fighters) {
      const c = f.character;
      lines.push(
        `${c.instanceId.padEnd(7)} pos(${c.position.x.toFixed(1)},${c.position.y.toFixed(1)},${c.position.z.toFixed(
          1
        )}) vel(${c.velocity.x.toFixed(1)},${c.velocity.y.toFixed(1)},${c.velocity.z.toFixed(1)}) dmg:${c.damagePercent
          .toFixed(0)
          .padStart(3)}% st:${c.state}${f.cpu ? " tgt:" + (f.cpu.debugTarget ?? "-") : ""}`
      );
    }
    this.ui.setDebugText(lines.join("\n"));
  }

  // --- settings / lifecycle ----------------------------------------------

  private setPaused(paused: boolean): void {
    this.phase = this.phase === "result" ? "result" : paused ? "paused" : "playing";
    this.mobileControls?.setEnabled(this.phase === "playing");
  }

  private setQuality(q: QualityLevel): void {
    this.quality = q;
    writeSetting(STORAGE_KEYS.quality, q);
    this.effects.setQuality(QUALITY_PRESETS[q]);
    this.applyRendererQuality();
  }

  private setDifficulty(d: AIDifficulty): void {
    this.difficulty = d;
    writeSetting(STORAGE_KEYS.difficulty, d);
    for (const f of this.fighters) {
      if (f.cpu) f.cpu.difficulty = d;
    }
  }

  private applyRendererQuality(): void {
    const q = QUALITY_PRESETS[this.quality];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatioMax));
    this.renderer.shadowMap.enabled = q.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.sunLight.castShadow = q.shadows;
    this.scene.fog = new THREE.Fog(0x6f88ad, 40, q.drawDistance);
    this.cameraController.camera.far = q.drawDistance + 30;
    this.cameraController.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight, true);
  }

  private restart(): void {
    this.matchTime = 0;
    this.phase = "playing";
    this.mobileControls?.setEnabled(true);
    this.ui.hideResult();
    this.ui.setPaused(false);
    this.loop.setTimeScale(1);
    this.combat.dispose();
    this.stage.resetDestructibles();

    const spawnPoints = this.stage.spawnPoints;
    this.fighters.forEach((f, i) => {
      const c = f.character;
      c.resetForNewMatch(spawnPoints[i % spawnPoints.length]);
      f.cpu?.reset();
    });
  }

  private onResize(): void {
    this.cameraController.setAspect(window.innerWidth / window.innerHeight);
    this.renderer.setSize(window.innerWidth, window.innerHeight, true);
  }
}
