import * as Phaser from "phaser";
import {
  frameIndex, IDLE_SEQUENCE, WALK_SEQUENCE, sanitizeLook,
  type AnimState, type Direction, type Look,
} from "../catalog";
import { animFrame, ensureLayerTexture, hatTransform, MELEE_FACING, resolveKey, sheetFor, type Layer } from "../art/layers";
import { firearmArt } from "../art/firearmArt";
import { firearmPose } from "@/lib/game/play-rules";

const PARTS = ["body", "head", "hat"] as const;
type Part = (typeof PARTS)[number];
const SWING_MS = 240;

/**
 * Modular character: independent sprite layers composited in order BODY -> HEAD -> HAT,
 * plus a MELEE layer shown while swinging. Layers share one frame grid, so any part can be
 * swapped (or animated, e.g. GIF uploads) without touching the others.
 */
export class CharacterSprite extends Phaser.GameObjects.Container {
  private parts: Record<Part, Phaser.GameObjects.Sprite>;
  private melee: Phaser.GameObjects.Sprite;
  private firearm: Phaser.GameObjects.Image;
  private gunId = "";
  private shotAt = -1e9;
  private reloadUntil = 0;
  private keys: Record<Layer, string> = { body: "", head: "", hat: "", melee: "" };
  private shadow: Phaser.GameObjects.Ellipse;
  private label: Phaser.GameObjects.Text;
  private hpBar: Phaser.GameObjects.Graphics;
  private hp = 1; private maxHp = 1; private protectedUntil = 0;
  dir: Direction = "down";
  anim: AnimState = "idle";
  private t = 0;
  private clock = 0;
  private swingAt = -1e9;
  look: Look;
  private title: Phaser.GameObjects.Text | undefined;
  /** Admin effects: size, flying height, see-through. */
  fx = { scale: 1, lift: 0, alpha: 1 };

  constructor(scene: Phaser.Scene, x: number, y: number, look: Look, name: string, isLocal = false) {
    super(scene, x, y);
    this.look = sanitizeLook(look);
    this.shadow = scene.add.ellipse(0, -1, 10, 4, 0x000000, 0.28);
    const mk = () => scene.add.sprite(0, 0, "__DEFAULT").setOrigin(0.5, 1);
    this.parts = { body: mk(), head: mk(), hat: mk() };
    this.melee = scene.add.sprite(0, 0, "__DEFAULT").setVisible(false);
    this.firearm = scene.add.image(9, -9, "__DEFAULT").setVisible(false);
    this.label = scene.add
      .text(0, 1, name, {
        fontFamily: '"VT323", monospace',
        fontSize: "10px",
        color: isLocal ? "#ffe58a" : "#ffffff",
        stroke: "#1b1424",
        strokeThickness: 2,
      })
      .setOrigin(0.5, 0)
      .setResolution(4);
    this.hpBar = scene.add.graphics();
    this.add([this.shadow, this.parts.body, this.parts.head, this.parts.hat, this.melee, this.firearm, this.label, this.hpBar]);
    scene.add.existing(this as unknown as Phaser.GameObjects.GameObject);
    this.setLook(look);
  }

  setLook(look: Look) {
    this.look = sanitizeLook(look);
    for (const layer of [...PARTS, "melee"] as const) this.bind(layer);
    this.applyFrame();
  }

  setFirearm(id: string) {
    if (id === this.gunId) return;
    this.gunId = id;
    this.firearm.setVisible(false);
    void firearmArt(id).then((canvas) => {
      if (!canvas || !this.scene || this.gunId !== id) return;
      const key = `firearm:${id}`;
      if (!this.scene.textures.exists(key)) this.scene.textures.addCanvas(key, canvas);
      this.firearm.setTexture(key).setVisible(true);
    });
  }

  shoot() {
    this.shotAt = this.clock;
    const vector = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[this.dir];
    const pose = firearmPose(this.dir, this.clock, false, -1e9);
    const startX = this.x + (pose.x + vector.x * 12) * this.scaleX, startY = this.y + (pose.y + vector.y * 12) * this.scaleY;
    const bullet = this.scene.add.rectangle(startX, startY, 3, 3, 0xffe58a).setDepth(200000);
    this.scene.tweens.add({ targets: bullet, x: startX + vector.x * 240, y: startY + vector.y * 240, duration: 360, onComplete: () => bullet.destroy() });
    const flash = this.scene.add.circle(startX, startY, 4, 0xffe58a).setDepth(200000);
    this.scene.time.delayedCall(70, () => flash.destroy());
    const casing = this.scene.add.rectangle(this.x + pose.x, this.y + pose.y, 2, 1, 0xe5bd67).setDepth(this.depth + 1);
    this.scene.tweens.add({ targets: casing, x: casing.x + 8, y: casing.y + 6, angle: 180, alpha: 0, duration: 320, onComplete: () => casing.destroy() });
  }

  reload() { this.reloadUntil = this.clock + 1200; }

  /** Point a layer at its texture; custom uploads load in the background, then rebind. */
  private bind(layer: Layer) {
    const id = this.look[`${layer}_id`];
    const key = resolveKey(layer, id, () => {
      if (this.scene && this.look[`${layer}_id`] === id) { this.bind(layer); this.applyFrame(); }
    });
    const ok = ensureLayerTexture(this.scene, key);
    this.keys[layer] = ok ? key : "";
    const sheet = sheetFor(key);
    if (layer === "melee") {
      if (ok) this.melee.setTexture(key, 0).setScale(18 / (sheet?.fw ?? 18));
      return;
    }
    const s = this.parts[layer];
    if (ok) s.setTexture(key, 0);
    s.setY(sheet?.oy ?? 0).setVisible(ok && !(layer === "hat" && id === "hat_none"));
  }

  setLabel(name: string) { this.label.setText(name); this.placeTitle(); }
  /** Custom admin title shown right next to the name. */
  setTitle(text: string | null, color = "#ff6ad5") {
    if (!text) { this.title?.destroy(); this.title = undefined; return; }
    if (!this.title) {
      this.title = this.scene.add.text(0, 0, "", { fontFamily: '"VT323", monospace', fontSize: "10px", stroke: "#1b1424", strokeThickness: 2 })
        .setOrigin(0, 0).setResolution(this.label.style.resolution || 4);
      this.add(this.title);
    }
    this.title.setText(text).setColor(color);
    this.placeTitle();
  }
  private placeTitle() {
    if (!this.title) return;
    const w = this.label.width;
    this.label.setX(-(this.title.width + 2) / 2);
    this.title.setPosition(this.label.x + w / 2 + 2, this.label.y);
  }
  private bubble: Phaser.GameObjects.Text | undefined;
  private bubbleTimer: Phaser.Time.TimerEvent | undefined;
  /** Chat bubble above the head for a few seconds. */
  say(text: string) {
    this.bubble?.destroy(); this.bubbleTimer?.remove();
    const msg = text.length > 60 ? text.slice(0, 57) + "…" : text;
    this.bubble = this.scene.add.text(0, -27, msg, { fontFamily: '"VT323", monospace', fontSize: "10px", color: "#1b1424",
      backgroundColor: "#fff8e8", padding: { x: 3, y: 1 }, wordWrap: { width: 90 }, align: "center" })
      .setOrigin(0.5, 1).setResolution(this.label.style.resolution || 4);
    this.add(this.bubble);
    this.bubbleTimer = this.scene.time.delayedCall(5000, () => { this.bubble?.destroy(); this.bubble = undefined; });
  }
  setFx(scale: number, lift: number, alpha: number) { this.fx = { scale, lift, alpha }; this.setScale(scale); }
  setLabelColor(color: string) { this.label.setColor(color); }

  /** Small health bar above the head; hidden while at full health. */
  setHp(hp: number, max: number) {
    this.hp = Math.max(0, hp); this.maxHp = Math.max(1, max);
    this.hpBar.clear();
    if (this.hp >= this.maxHp) return;
    const w = 14, k = this.hp / this.maxHp;
    this.hpBar.fillStyle(0x1b1424, 1).fillRect(-w / 2 - 1, -24, w + 2, 3);
    this.hpBar.fillStyle(k > 0.5 ? 0x6ee06e : k > 0.25 ? 0xf0c040 : 0xf05050, 1).fillRect(-w / 2, -23, Math.max(1, Math.round(w * k)), 1);
  }
  setProtected(untilMs: number) { this.protectedUntil = untilMs; }

  /** Lunge + melee sweep (or a slash arc when fighting bare-handed) in the facing direction. */
  swing() {
    const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[this.dir];
    this.swingAt = this.clock;
    if (!this.keys.melee) {
      const g = this.scene.add.graphics().setDepth(this.depth + 1);
      g.lineStyle(2, 0xfff2c0, 0.9);
      const cx = this.x + v[0]! * 10, cy = this.y - 9 + v[1]! * 10;
      const base = Math.atan2(v[1]!, v[0]!);
      g.beginPath(); g.arc(cx, cy, 7, base - 1, base + 1); g.strokePath();
      this.scene.tweens.add({ targets: g, alpha: 0, duration: 160, onComplete: () => g.destroy() });
    }
    for (const s of Object.values(this.parts)) {
      this.scene.tweens.add({ targets: s, x: v[0]! * 2, y: s.y + v[1]! * 2, duration: 60, yoyo: true });
    }
    this.applyFrame();
  }

  flashHit() {
    const all = Object.values(this.parts);
    for (const s of all) s.setTintFill(0xffffff);
    this.scene.time.delayedCall(90, () => { for (const s of all) s.clearTint(); });
  }
  setLabelResolution(r: number) { this.label.setResolution(r); this.title?.setResolution(r); this.bubble?.setResolution(r); }

  setPose(dir: Direction, anim: AnimState) {
    if (anim !== this.anim) this.t = 0;
    this.dir = dir;
    this.anim = anim;
  }

  tick(deltaMs: number) {
    this.t += deltaMs;
    this.clock += deltaMs;
    this.applyFrame();
    this.setDepth(10 + this.y + (this.fx.lift ? 400 : 0));
    if (this.fx.lift) { this.y -= this.fx.lift; this.shadow.setY(-1 + this.fx.lift / this.fx.scale).setScale(0.7); }
    else this.shadow.setY(-1).setScale(1);
    const prot = this.protectedUntil > Date.now();
    this.setAlpha((prot ? (Math.floor(this.t / 120) % 2 ? 0.45 : 0.9) : 1) * this.fx.alpha);
  }

  private applyFrame() {
    const col = this.anim === "walk"
      ? WALK_SEQUENCE[Math.floor(this.t / 130) % WALK_SEQUENCE.length] ?? 0
      : IDLE_SEQUENCE[Math.floor(this.t / 650) % IDLE_SEQUENCE.length] ?? 0;
    const f = frameIndex(this.dir, col);
    const pose = firearmPose(this.dir, this.clock, this.anim === "walk", this.shotAt, this.reloadUntil);
    this.firearm.setAngle(pose.angle).setPosition(pose.x, pose.y);
    this.moveTo(this.firearm, this.dir === "up" ? 1 : 5);
    for (const layer of PARTS) {
      const key = this.keys[layer];
      if (key) this.parts[layer].setFrame(animFrame(sheetFor(key), this.clock) * 16 + f);
    }
    const fit = hatTransform(sheetFor(this.keys.head), sheetFor(this.keys.hat), this.look.hat_id, f, this.clock);
    this.parts.hat.setScale(fit.scale).setPosition(fit.x, fit.y);
    const since = this.clock - this.swingAt;
    const key = this.keys.melee;
    if (!key || since > SWING_MS) { this.melee.setVisible(false); return; }
    const step = Math.min(2, Math.floor(since / (SWING_MS / 3))) - 1;
    const orient = (MELEE_FACING[this.dir] + step + 8) % 8;
    const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[this.dir];
    this.melee.setVisible(true).setFrame(animFrame(sheetFor(key), this.clock) * 8 + orient)
      .setPosition(v[0]! * 9, -9 + v[1]! * 8).setDepth(0);
    // Behind the body when swinging upward so the character covers it.
    this.moveTo(this.melee, this.dir === "up" ? 1 : 4);
  }
}
