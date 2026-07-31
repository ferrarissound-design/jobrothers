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
import { CharacterSelect } from "./ui/CharacterSelect";
import { StageSelect } from "./ui/StageSelect";
import { CharacterPreview } from "./render/CharacterPreview";
import { StagePreview } from "./render/StagePreview";
import { STAGES, DEFAULT_STAGE_ID, type StageDef, type StageId } from "./stage/stageData";
import { Character } from "./characters/Character";
import { CharacterController, type CharacterIntent } from "./characters/CharacterController";
import { CPUController } from "./ai/CPUController";
import { CHARACTERS, CHARACTER_ORDER, type CharacterId } from "./characters/characterData";
import { CHARACTER_ATTACKS } from "./characters/attacks";
import { ItemManager } from "./items/ItemManager";
import { disposeObject3D } from "./utils/dispose";
import {
  GameConfig,
  QUALITY_PRESETS,
  STORAGE_KEYS,
  type QualityLevel,
  type AIDifficulty,
  type ItemFrequency,
} from "./config/gameConfig";
import { CHARACTER_PERSONALITY } from "./ai/AIState";
import { horizontalDistance } from "./combat/Hitbox";
import { clamp, dampAngle } from "./utils/math";
import { readSetting, writeSetting } from "./utils/storage";

type MatchPhase = "select" | "playing" | "paused" | "result";

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
  private items: ItemManager;
  private stage: Stage;
  private cameraController: CameraController;
  private ui: UIManager;
  private select: CharacterSelect;
  private stageSelect: StageSelect;
  private preview?: CharacterPreview;
  private stagePreview?: StagePreview;
  private mobileControls?: MobileControls;
  private isMobile: boolean;
  private hemiLight!: THREE.HemisphereLight;
  private fillLight!: THREE.AmbientLight;
  private rimLight!: THREE.DirectionalLight;
  private sunLight!: THREE.DirectionalLight;

  private fighters: FighterEntry[] = [];
  private player: Character;
  private controller: CharacterController;
  private playerCharacterId: CharacterId;
  private stageId: StageId;

  /** Which screen of the select flow is showing. */
  private selectStep: "character" | "stage" = "character";
  /** Which button opened the flow, which is what "back" means on the stage screen. */
  private selectEntry: "character" | "stage" = "character";
  /** Whether the flow can be backed out of at all — false at boot. */
  private selectCancellable = false;
  /** Fighter picked on the first screen, applied once the stage is confirmed. */
  private pendingCharacterId: CharacterId;

  private quality: QualityLevel;
  private difficulty: AIDifficulty;
  private itemFrequency: ItemFrequency;
  private phase: MatchPhase = "playing";
  /** Phase to restore when the character select screen is backed out of. */
  private phaseBeforeSelect: MatchPhase = "playing";
  private lastResultWin = false;
  private matchTime = 0;
  private debugEnabled = false;
  private lastFrameTime = performance.now();
  private fpsAccum = 0;
  private fpsFrames = 0;
  private fpsDisplay = 0;

  constructor(private canvas: HTMLCanvasElement, private uiRoot: HTMLElement) {
    Game.syncViewportSize();
    this.isMobile = isMobileDevice();
    this.quality =
      (readSetting(STORAGE_KEYS.quality) as QualityLevel | null) ??
      (this.isMobile ? "medium" : "high");
    this.difficulty = (readSetting(STORAGE_KEYS.difficulty) as AIDifficulty | null) ?? "normal";
    const storedCharacter = readSetting(STORAGE_KEYS.character) as CharacterId | null;
    this.playerCharacterId =
      storedCharacter && storedCharacter in CHARACTERS ? storedCharacter : CHARACTER_ORDER[0];
    this.pendingCharacterId = this.playerCharacterId;
    const storedStage = readSetting(STORAGE_KEYS.stage) as StageId | null;
    this.stageId = storedStage && storedStage in STAGES ? storedStage : DEFAULT_STAGE_ID;
    this.itemFrequency = (readSetting(STORAGE_KEYS.items) as ItemFrequency | null) ?? "normal";

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.isMobile, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.input = new InputManager(canvas);
    this.effects = new EffectManager(this.scene, QUALITY_PRESETS[this.quality]);
    this.cameraController = new CameraController(window.innerWidth / window.innerHeight);

    this.combat = new CombatSystem(this.scene, this.effects, this.audio, {
      onHitStop: (d) => this.cameraController.triggerHitStop(d),
      onCameraShake: (a) => this.cameraController.triggerShake(a),
    });

    this.stage = new Stage(
      this.scene,
      this.effects,
      QUALITY_PRESETS[this.quality],
      (pos) => this.explodeAt(pos),
      STAGES[this.stageId]
    );

    this.setupLighting();
    this.applyStageLighting(this.stage.def);
    this.applyRendererQuality();
    this.audio.preloadMusic(`${import.meta.env.BASE_URL}bgm/crown_of_the_fallen_king.mp3`);

    this.items = new ItemManager(
      this.scene,
      this.stage,
      this.effects,
      this.audio,
      this.combat,
      this.itemFrequency
    );

    this.controller = new CharacterController(
      this.stage,
      this.combat,
      this.effects,
      this.audio,
      this.items
    );

    this.player = this.spawnFighters();

    this.ui = new UIManager(uiRoot, {
      isMobile: this.isMobile,
      initialQuality: this.quality,
      initialVolume: this.audio.getVolume(),
      initialMusicVolume: this.audio.getMusicVolume(),
      initialDifficulty: this.difficulty,
      initialItemFrequency: this.itemFrequency,
      onPauseToggle: (paused) => this.setPaused(paused),
      onRestart: () => this.restart(),
      onQualityChange: (q) => this.setQuality(q),
      onVolumeChange: (v) => this.audio.setVolume(v),
      onMusicVolumeChange: (v) => this.audio.setMusicVolume(v),
      onDifficultyChange: (d) => this.setDifficulty(d),
      onItemFrequencyChange: (f) => this.setItemFrequency(f),
      onCharacterSelect: () => this.openCharacterSelect(true),
      onStageSelect: () => this.openStageSelect(true),
    });

    this.select = new CharacterSelect(uiRoot, {
      onHighlight: (id) => this.preview?.setCharacter(CHARACTERS[id]),
      onConfirm: (id) => this.confirmCharacter(id),
      onCancel: () => this.closeSelect(),
    });

    this.stageSelect = new StageSelect(uiRoot, {
      onHighlight: (id) => this.stagePreview?.setStage(STAGES[id]),
      onConfirm: (id) => this.confirmStage(id),
      onCancel: () => this.cancelStageSelect(),
    });

    if (this.isMobile) {
      this.mobileControls = new MobileControls(uiRoot, this.input);
      this.mobileControls.activate();
    }

    window.addEventListener("resize", () => this.onResize());
    // iPadOS/iOS Safari resize the visual viewport (toolbar show/hide, split
    // view) without always firing "resize" on window; this keeps the
    // --app-vw/--app-vh custom properties (and the mobile control layout
    // anchored to them) from drifting away from the true visible area.
    window.visualViewport?.addEventListener("resize", () => this.onResize());
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

    // The roster screen owns the very first frame: a fighter is already spawned
    // (so every subsystem has a valid player), but nothing simulates until the
    // player has locked a choice in. Last, because it needs the loop to exist.
    this.openCharacterSelect(false);
  }

  start(): void {
    this.loop.start();
  }

  /**
   * Creates the four lights the arena is lit by, but not their colours: those
   * belong to the stage, which can change mid-session, and are applied by
   * `applyStageLighting`.
   */
  private setupLighting(): void {
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
    this.fillLight = new THREE.AmbientLight(0xffffff, 0.25);
    this.rimLight = new THREE.DirectionalLight(0xffffff, 1);
    this.sunLight = new THREE.DirectionalLight(0xffffff, 3);
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.left = -30;
    this.sunLight.shadow.camera.right = 30;
    this.sunLight.shadow.camera.top = 30;
    this.sunLight.shadow.camera.bottom = -30;
    this.sunLight.shadow.camera.far = 80;
    this.sunLight.shadow.bias = -0.0025;
    this.scene.add(this.hemiLight, this.fillLight, this.rimLight, this.sunLight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  }

  /**
   * Repaints the scene in one stage's light — sky, sun, rim and exposure.
   *
   * Cel shading only bands where *direct* light dominates: ambient fill lands
   * outside the toon ramp, so too much of it flattens the fighters back into
   * untinted silhouettes. Every stage therefore keeps its sky wash low and lets
   * the sun carry the exposure, with a back light for the rim animation always
   * draws — what changes between stages is the colour and the sun's angle.
   */
  private applyStageLighting(def: StageDef): void {
    const l = def.lighting;
    this.hemiLight.color.setHex(l.hemiSky);
    this.hemiLight.groundColor.setHex(l.hemiGround);
    this.hemiLight.intensity = l.hemiIntensity;
    this.fillLight.intensity = l.ambientIntensity;
    this.rimLight.color.setHex(l.rimColor);
    this.rimLight.intensity = l.rimIntensity;
    this.rimLight.position.set(...l.rimPosition);
    this.sunLight.color.setHex(l.sunColor);
    this.sunLight.intensity = l.sunIntensity;
    this.sunLight.position.set(...l.sunPosition);
    this.scene.background = new THREE.Color(l.sky);
    this.renderer.toneMappingExposure = l.exposure;
    this.applyFog();
  }

  /** Fog colour comes from the stage, its far plane from the quality preset. */
  private applyFog(): void {
    const l = this.stage.def.lighting;
    this.scene.fog = new THREE.Fog(l.sky, l.fogNear, QUALITY_PRESETS[this.quality].drawDistance);
  }

  /** Damage from a drum detonating on the stage, applied to everyone nearby. */
  private explodeAt(position: THREE.Vector3): void {
    this.combat.applyExplosionDamage(
      position,
      3.2,
      15,
      12,
      this.fighters.map((f) => f.character)
    );
  }

  /**
   * Builds the match roster around the player's pick: whoever they did not
   * choose fills the CPU slots, so the arena always holds one of each fighter.
   */
  private spawnFighters(): Character {
    const spawnPoints = this.stage.spawnPoints;
    const playerDef = CHARACTERS[this.playerCharacterId];
    const player = new Character({ instanceId: "player", displayName: playerDef.name, isPlayer: true }, playerDef, spawnPoints[0]);
    this.scene.add(player.group);
    this.fighters.push({ character: player });

    const cpuIds = CHARACTER_ORDER.filter((id) => id !== this.playerCharacterId).slice(
      0,
      GameConfig.cpuCount
    );

    cpuIds.forEach((id, i) => {
      const def = CHARACTERS[id];
      const c = new Character(
        { instanceId: `cpu${i + 1}`, displayName: def.name, isPlayer: false },
        def,
        spawnPoints[(i + 1) % spawnPoints.length]
      );
      this.scene.add(c.group);
      const cpu = new CPUController(CHARACTER_PERSONALITY[id], this.difficulty);
      this.fighters.push({ character: c, cpu });
    });

    return player;
  }

  // --- select flow --------------------------------------------------------

  /**
   * Freezes the match (if any) and starts the two-step setup flow: fighter,
   * then stage, then a fresh match. This is the "set up a new match" entry
   * point — `openStageSelect` is the shortcut for changing only where it is
   * fought, leaving the roster alone.
   *
   * @param cancellable false at boot, where there is no match to return to.
   */
  private openCharacterSelect(cancellable: boolean): void {
    if (this.phase === "select") return;
    this.enterSelectPhase();
    this.selectEntry = "character";
    this.selectCancellable = cancellable;
    this.showCharacterStep(cancellable);
  }

  /** Jumps straight to the stage screen, keeping the current roster. */
  private openStageSelect(cancellable: boolean): void {
    if (this.phase === "select") return;
    this.enterSelectPhase();
    this.selectEntry = "stage";
    this.selectCancellable = cancellable;
    this.showStageStep(cancellable);
  }

  /** Shared setup for both entry points: stop the match and clear the HUD away. */
  private enterSelectPhase(): void {
    this.phaseBeforeSelect = this.phase;
    this.phase = "select";
    this.pendingCharacterId = this.playerCharacterId;

    this.ui.setPaused(false);
    this.ui.hideResult();
    this.ui.setHudVisible(false);
    this.mobileControls?.setEnabled(false);
    this.mobileControls?.setVisible(false);
    this.audio.setMusicDucked(true);
    this.loop.setTimeScale(1);
  }

  /**
   * The 3D half of each screen is built on entry and disposed on leaving rather
   * than kept alive for the session: each holds a scene of its own, and a spare
   * character model or arena diorama is exactly the kind of memory a phone does
   * not have going spare mid-match.
   */
  private showCharacterStep(cancellable: boolean): void {
    this.selectStep = "character";
    this.stageSelect.close();
    this.disposePreviews();
    this.preview = new CharacterPreview();
    this.preview.setViewport(window.innerWidth, window.innerHeight);
    this.preview.setCharacter(CHARACTERS[this.pendingCharacterId]);
    this.select.open(this.pendingCharacterId, cancellable);
  }

  private showStageStep(cancellable: boolean): void {
    this.selectStep = "stage";
    this.select.close();
    this.disposePreviews();
    this.stagePreview = new StagePreview();
    this.stagePreview.setViewport(window.innerWidth, window.innerHeight);
    this.stagePreview.setStage(STAGES[this.stageId]);
    this.stageSelect.open(this.stageId, cancellable);
  }

  private disposePreviews(): void {
    this.preview?.dispose();
    this.preview = undefined;
    this.stagePreview?.dispose();
    this.stagePreview = undefined;
  }

  /** Fighter chosen: hold on to it and move on to the stage screen. */
  private confirmCharacter(id: CharacterId): void {
    this.pendingCharacterId = id;
    // Always cancellable from here: "back" returns to the fighter cards, which
    // is the step the player just came from.
    this.showStageStep(true);
  }

  /** "Back" on the stage screen: to the fighter cards, or out of the flow entirely. */
  private cancelStageSelect(): void {
    if (this.selectEntry === "character") this.showCharacterStep(this.selectCancellable);
    else this.closeSelect();
  }

  /** Backs out of the flow, restoring whatever overlay was up before it. */
  private closeSelect(): void {
    this.teardownSelect();
    this.phase = this.phaseBeforeSelect;
    if (this.phase === "result") {
      this.ui.showResult(this.lastResultWin);
      this.audio.setMusicDucked(true);
    } else if (this.phase === "paused") {
      this.ui.setPaused(true);
      this.audio.setMusicDucked(true);
    } else {
      this.audio.setMusicDucked(false);
      this.mobileControls?.setEnabled(true);
    }
  }

  private teardownSelect(): void {
    this.select.close();
    this.stageSelect.close();
    this.disposePreviews();
    this.ui.setHudVisible(true);
    this.mobileControls?.setVisible(true);
    // Menu navigation runs on the same keys as combat; without this the Space
    // that confirmed the choice would also jump on the first frame of the match.
    this.input.clearTransient();
  }

  /** Locks in the stage (and whatever fighter was picked on the way here) and starts a fresh match. */
  private confirmStage(id: StageId): void {
    const characterChanged = this.pendingCharacterId !== this.playerCharacterId;
    this.playerCharacterId = this.pendingCharacterId;
    writeSetting(STORAGE_KEYS.character, this.playerCharacterId);

    this.teardownSelect();
    this.applyStage(id);
    if (characterChanged) this.rebuildRoster();

    // restart() puts the phase back to "playing" and clears the previous match.
    this.restart();
    this.cameraController.reset(this.player.facingAngle);
  }

  /**
   * Swaps the arena out. A stage owns its own meshes and breakable props, so
   * the old one is disposed outright and a new one built in its place, then
   * everything holding a reference to it is repointed. Loose items and mines go
   * first: they are positioned against a floor that is about to stop existing.
   */
  private applyStage(id: StageId): void {
    if (id === this.stageId) return;
    this.stageId = id;
    writeSetting(STORAGE_KEYS.stage, id);

    this.items.reset(this.fighters.map((f) => f.character));
    this.combat.dispose();
    this.stage.dispose();

    this.stage = new Stage(
      this.scene,
      this.effects,
      QUALITY_PRESETS[this.quality],
      (pos) => this.explodeAt(pos),
      STAGES[id]
    );
    this.items.setStage(this.stage);
    this.controller.setStage(this.stage);
    this.applyStageLighting(this.stage.def);
  }

  /** Replaces every fighter (and its mesh) so the new pick takes the player slot. */
  private rebuildRoster(): void {
    // Held item meshes hang off the fighters' hands, so they have to be
    // released before the models they are parented to are disposed.
    this.items.reset(this.fighters.map((f) => f.character));
    for (const f of this.fighters) {
      disposeObject3D(f.character.group);
    }
    this.fighters = [];
    // Panels are keyed by instance id and label themselves once, so the stale
    // ones would keep the previous roster's names.
    this.ui.resetPanels();
    this.player = this.spawnFighters();
  }

  // --- fixed-step simulation -------------------------------------------

  private fixedUpdate(dt: number): void {
    this.cameraController.tickHitStop(dt);
    if (this.phase !== "playing" || this.cameraController.isFrozen) return;

    this.matchTime += dt;

    const playerIntent = this.buildPlayerIntent();
    this.controller.update(this.player, playerIntent, dt);

    const allChars = this.fighters.map((f) => f.character);
    const itemTargets = this.items.itemTargets();
    for (const f of this.fighters) {
      if (!f.cpu) continue;
      const others = allChars.filter((c) => c !== f.character);
      const intent = f.cpu.update(dt, f.character, others, this.stage, itemTargets);
      this.controller.update(f.character, intent, dt);
    }

    this.combat.update(dt, allChars, this.stage.destructibles);
    this.items.update(dt, allChars, this.stage.destructibles);
    this.stage.removeDestroyed();

    this.resolvePlatformCollisions();
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

  /**
   * Platforms only affect standing height (see Stage.getGroundHeightAt), so without this a
   * character below the top surface can walk straight through the solid side of a platform box.
   * Pushes them back out along whichever edge is closest instead.
   */
  private resolvePlatformCollisions(): void {
    for (const f of this.fighters) {
      const c = f.character;
      if (!c.alive) continue;
      for (const p of this.stage.platforms) {
        if (c.position.y >= p.topY - 0.4) continue;
        if (
          c.position.x + c.radius <= p.minX ||
          c.position.x - c.radius >= p.maxX ||
          c.position.z + c.radius <= p.minZ ||
          c.position.z - c.radius >= p.maxZ
        ) {
          continue;
        }

        const pushLeft = c.position.x + c.radius - p.minX;
        const pushRight = p.maxX - (c.position.x - c.radius);
        const pushNeg = c.position.z + c.radius - p.minZ;
        const pushPos = p.maxZ - (c.position.z - c.radius);
        const minPush = Math.min(pushLeft, pushRight, pushNeg, pushPos);

        if (minPush === pushLeft) c.position.x = p.minX - c.radius;
        else if (minPush === pushRight) c.position.x = p.maxX + c.radius;
        else if (minPush === pushNeg) c.position.z = p.minZ - c.radius;
        else c.position.z = p.maxZ + c.radius;
      }
    }
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
        // Whatever they were carrying goes down with them, so a stock loss
        // always hands the item advantage back to the rest of the field.
        this.items.releaseHeldItem(c);
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
    this.lastResultWin = playerWon;
    this.mobileControls?.setEnabled(false);
    this.audio.setMusicDucked(true);
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

    if (this.phase === "select") {
      // The select screens replace the arena entirely: the match scene is not
      // drawn at all, so whichever preview is up keeps a full frame budget.
      this.input.endFrame();
      const preview = this.selectStep === "stage" ? this.stagePreview : this.preview;
      preview?.update(realDt);
      preview?.render(this.renderer);
      return;
    }

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
    const held = this.player.heldItem;

    this.ui.update({
      fighters,
      matchTime: this.matchTime,
      specialCooldownFrac: specialMax > 0 ? clamp(specialCd / specialMax, 0, 1) : 0,
      specialReady: specialCd <= 0,
      heldItem: held
        ? {
            name: held.def.name,
            hint: held.def.hint,
            color: held.def.color,
            usesLeft: held.usesLeft,
            timeFrac: held.def.holdTime > 0 ? clamp(held.timeLeft / held.def.holdTime, 0, 1) : 1,
          }
        : null,
      starTimeLeft: this.player.starTimer,
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
      `items: ${this.items.activeCount}  projectiles: ${this.items.projectileCount}  freq:${this.itemFrequency}`,
      // Item positions, so a pickup that never gets collected can be traced to
      // where it actually landed rather than where it looks like it landed.
      `itemPos: ${this.items
        .itemTargets()
        .map((t) => `(${t.position.x.toFixed(1)},${t.position.y.toFixed(1)},${t.position.z.toFixed(1)})`)
        .join(" ") || "-"}`,
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
    this.audio.setMusicDucked(this.phase !== "playing");
  }

  private setQuality(q: QualityLevel): void {
    this.quality = q;
    writeSetting(STORAGE_KEYS.quality, q);
    this.effects.setQuality(QUALITY_PRESETS[q]);
    this.applyRendererQuality();
  }

  private setItemFrequency(f: ItemFrequency): void {
    this.itemFrequency = f;
    writeSetting(STORAGE_KEYS.items, f);
    this.items.setFrequency(f);
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
    this.applyFog();
    this.cameraController.camera.far = q.drawDistance + 30;
    this.cameraController.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight, true);
  }

  private restart(): void {
    this.matchTime = 0;
    this.phase = "playing";
    this.mobileControls?.setEnabled(true);
    this.audio.setMusicDucked(false);
    this.ui.hideResult();
    this.ui.setPaused(false);
    this.loop.setTimeScale(1);
    this.combat.dispose();
    this.items.reset(this.fighters.map((f) => f.character));
    this.stage.resetDestructibles();

    const spawnPoints = this.stage.spawnPoints;
    this.fighters.forEach((f, i) => {
      const c = f.character;
      c.resetForNewMatch(spawnPoints[i % spawnPoints.length]);
      f.cpu?.reset();
    });
  }

  private onResize(): void {
    Game.syncViewportSize();
    this.cameraController.setAspect(window.innerWidth / window.innerHeight);
    this.renderer.setSize(window.innerWidth, window.innerHeight, true);
    this.preview?.setViewport(window.innerWidth, window.innerHeight);
    this.stagePreview?.setViewport(window.innerWidth, window.innerHeight);
  }

  /**
   * Mirrors the true visible viewport into --app-vw/--app-vh custom
   * properties. CSS `100vw`/`100vh` on iPadOS/iOS Safari are defined against
   * the largest possible viewport (toolbars retracted), not the currently
   * visible one, so a #app sized with plain vw/vh units can end up taller
   * and wider than what's on screen — pushing bottom/right-anchored UI
   * (the mobile control buttons) past the visible edge. window.innerWidth/
   * innerHeight — the same values the renderer is sized to — always match
   * what's actually visible, so anchoring #app to those keeps the DOM
   * overlay and the canvas in sync.
   */
  private static syncViewportSize(): void {
    const root = document.documentElement.style;
    root.setProperty("--app-vw", `${window.innerWidth}px`);
    root.setProperty("--app-vh", `${window.innerHeight}px`);
  }
}
