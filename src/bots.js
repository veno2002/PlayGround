import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeGlowTexture } from './textures.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _rayVec = new THREE.Vector3();

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

export class BotManager {
  constructor(scene, arena, effects, audio, callbacks = {}) {
    this.scene = scene;
    this.arena = arena;
    this.effects = effects;
    this.audio = audio;
    this.callbacks = callbacks;
    this.bots = [];
    this.glowTex = makeGlowTexture();
    this.createBots();
  }

  createBots() {
    const defs = [
      { name: 'VEX', color: 0xff3b2a, accent: 0xff7d5e, spawn: 1, aggression: 0.9 },
      { name: 'KHARN', color: 0xffa23a, accent: 0xffd07d, spawn: 2, aggression: 1.0 },
      { name: 'NOVA', color: 0x39c9ff, accent: 0x9be9ff, spawn: 3, aggression: 0.82 },
    ];
    defs.forEach((def, i) => {
      const bot = new Bot(def, i, this);
      this.bots.push(bot);
    });
  }

  reset() {
    this.bots.forEach((bot, i) => {
      bot.spawnIndex = [1, 2, 3][i];
      bot.reset();
    });
  }

  update(dt, time, player, active) {
    for (const bot of this.bots) {
      bot.update(dt, time, player, active);
    }
  }

  get alive() {
    return this.bots.filter(b => b.alive);
  }

  findRayHit(origin, dir, maxDistance = 150) {
    let best = null;
    for (const bot of this.bots) {
      if (!bot.alive) continue;
      const body = bot.hitTest(origin, dir, maxDistance);
      if (body && (!best || body.distance < best.distance)) {
        best = { bot, distance: body.distance, headshot: body.headshot, point: body.point };
      }
    }
    return best;
  }

  splashDamage(center, radius, damage, source = null) {
    for (const bot of this.bots) {
      if (!bot.alive) continue;
      const d = center.distanceTo(bot.center(_v));
      if (d < radius) {
        const falloff = 1 - d / radius;
        bot.takeDamage(damage * falloff * falloff, source, center.clone(), false, true);
      }
    }
  }

  addBotKill(bot) {
    bot.frags = (bot.frags || 0) + 1;
  }
}

class Bot {
  constructor(def, index, manager) {
    this.def = def;
    this.name = def.name;
    this.color = def.color;
    this.accent = def.accent;
    this.index = index;
    this.manager = manager;
    this.arena = manager.arena;
    this.effects = manager.effects;
    this.audio = manager.audio;
    this.spawnIndex = def.spawn;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.health = 100;
    this.alive = true;
    this.frags = 0;
    this.deaths = 0;
    this.respawnTimer = 0;
    this.shootTimer = 1.2 + Math.random() * 1.8;
    this.strafeTimer = 0;
    this.strafeDir = 1;
    this.moveTarget = new THREE.Vector3();
    this.wanderTimer = 0;
    this.walkPhase = Math.random() * 10;
    this.muzzleTimer = 0;
    this.hitFlash = 0;
    this.recoil = 0;
    this.deathTimer = 0;
    this.lastPlayerPos = new THREE.Vector3();
    this.aimTime = 0;
    this.model = this.buildModel();
    this.manager.scene.add(this.model.group);
    this.reset();
  }

  buildModel() {
    const group = new THREE.Group();
    const root = new THREE.Group();
    group.add(root);
    const dark = new THREE.MeshStandardMaterial({ color: 0x24232a, metalness: 0.82, roughness: 0.38, envMapIntensity: 0.9 });
    const graphite = new THREE.MeshStandardMaterial({ color: 0x3b3941, metalness: 0.78, roughness: 0.4, envMapIntensity: 0.8 });
    const armor = new THREE.MeshStandardMaterial({ color: 0x17171c, metalness: 0.9, roughness: 0.3, envMapIntensity: 1 });
    const accent = new THREE.MeshStandardMaterial({ color: this.color, emissive: this.color, emissiveIntensity: 2.5, metalness: 0.5, roughness: 0.25, toneMapped: false });
    const visor = new THREE.MeshStandardMaterial({ color: this.accent, emissive: this.color, emissiveIntensity: 8, metalness: 0.4, roughness: 0.1, toneMapped: false });
    const weaponMat = new THREE.MeshStandardMaterial({ color: 0x242329, metalness: 0.9, roughness: 0.32 });

    const hips = new THREE.Group();
    hips.position.y = 0.96;
    root.add(hips);

    const pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.16, 4, 8), armor);
    pelvis.rotation.z = Math.PI / 2;
    pelvis.position.y = 0.0;
    hips.add(pelvis);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.13, 0.32), graphite);
    belt.position.y = 0.1;
    hips.add(belt);
    const beltGlow = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.03), accent);
    beltGlow.position.set(0, 0.1, -0.18);
    hips.add(beltGlow);

    const torso = new THREE.Group();
    torso.position.y = 0.17;
    hips.add(torso);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.56, 0.32), dark);
    chest.position.y = 0.28;
    torso.add(chest);
    const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.1), graphite);
    chestPlate.position.set(0, 0.31, -0.19);
    torso.add(chestPlate);
    const chestGlow = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.02), accent);
    chestGlow.position.set(0, 0.1, -0.185);
    torso.add(chestGlow);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.13, 8), armor);
    collar.position.y = 0.59;
    torso.add(collar);

    const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.34, 0.18), graphite);
    backpack.position.set(0, 0.31, 0.24);
    torso.add(backpack);
    for (const sx of [-0.11, 0.11]) {
      const canister = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.28, 8), dark);
      canister.position.set(sx, 0.31, 0.37);
      torso.add(canister);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 8), accent);
      cap.position.set(sx, 0.47, 0.37);
      torso.add(cap);
    }

    const headGroup = new THREE.Group();
    headGroup.position.y = 0.74;
    torso.add(headGroup);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.12, 8), armor);
    neck.position.y = -0.07;
    headGroup.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 16, 12), armor);
    head.scale.set(0.9, 1.04, 0.94);
    head.position.y = 0.1;
    headGroup.add(head);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.245, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.56), graphite);
    helmet.position.y = 0.14;
    headGroup.add(helmet);
    const visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.075, 0.04), visor);
    visorMesh.position.set(0, 0.1, -0.2);
    headGroup.add(visorMesh);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.34, 4), graphite);
    antenna.position.set(0.16, 0.33, 0.05);
    antenna.rotation.z = -0.28;
    headGroup.add(antenna);
    const antennaTip = new THREE.Mesh(new THREE.OctahedronGeometry(0.035, 0), accent);
    antennaTip.position.set(0.205, 0.49, 0.05);
    headGroup.add(antennaTip);

    const shoulderL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.19, 0.28), armor);
    shoulderL.position.set(-0.34, 0.48, 0);
    shoulderL.rotation.z = -0.12;
    torso.add(shoulderL);
    const shoulderR = shoulderL.clone();
    shoulderR.position.x = 0.34;
    shoulderR.rotation.z = 0.12;
    torso.add(shoulderR);
    const shoulderGlowL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.11, 0.16), accent);
    shoulderGlowL.position.set(-0.44, 0.48, 0);
    torso.add(shoulderGlowL);
    const shoulderGlowR = shoulderGlowL.clone();
    shoulderGlowR.position.x = 0.44;
    torso.add(shoulderGlowR);

    const armL = this.buildArm(armor, graphite, accent, -1);
    const armR = this.buildArm(armor, graphite, accent, 1);
    armL.position.set(-0.33, 0.44, 0);
    armR.position.set(0.33, 0.44, 0);
    torso.add(armL, armR);

    const legL = this.buildLeg(armor, graphite, accent, -1);
    const legR = this.buildLeg(armor, graphite, accent, 1);
    legL.position.set(-0.15, -0.02, 0);
    legR.position.set(0.15, -0.02, 0);
    hips.add(legL, legR);

    const weapon = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.15, 0.48), weaponMat);
    body.position.y = 0.02;
    weapon.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.62, 8), graphite);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.035, -0.47);
    weapon.add(barrel);
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.012, 6, 12), accent);
    coil.rotation.x = Math.PI / 2;
    coil.position.set(0, 0.035, -0.62);
    weapon.add(coil);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.15, 0.09), weaponMat);
    grip.position.set(0, -0.1, 0.03);
    grip.rotation.x = -0.18;
    weapon.add(grip);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.07, 0.12), accent);
    sight.position.set(0, 0.14, -0.08);
    weapon.add(sight);
    weapon.position.set(0.34, -0.35, -0.29);
    weapon.rotation.set(0, 0, 0.06);
    torso.add(weapon);

    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.035, -0.8);
    weapon.add(muzzle);
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.manager.glowTex,
      color: this.accent,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }));
    flash.scale.set(0.85, 0.85, 1);
    muzzle.add(flash);

    group.scale.setScalar(1.08);
    const bodyMat = makeBotMaterial();
    for (const piece of [hips, torso, headGroup, armL, armR, legL, legR, weapon]) {
      piece.userData.accent = accent;
      piece.userData.visor = visor;
      mergeDirectMeshes(piece, bodyMat);
    }
    this.materials = { body: bodyMat, dark, graphite, armor, accent, visor };
    this.parts = { root, hips, torso, headGroup, armL, armR, legL, legR, weapon, muzzle, flash, chestGlow, beltGlow };
    return { group, flash, muzzle, torso, headGroup, hips, armL, armR, legL, legR, weapon };
  }

  buildArm(armor, graphite, accent, side) {
    const arm = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.26, 4, 8), armor);
    upper.position.y = -0.15;
    arm.add(upper);
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 8), graphite);
    elbow.position.y = -0.3;
    arm.add(elbow);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.22, 4, 8), graphite);
    fore.position.y = -0.44;
    arm.add(fore);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.04, 0.15), accent);
    band.position.y = -0.35;
    arm.add(band);
    arm.rotation.z = side * 0.16;
    return arm;
  }

  buildLeg(armor, graphite, accent, side) {
    const leg = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.3, 4, 8), graphite);
    upper.position.y = -0.2;
    leg.add(upper);
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.105, 8, 8), armor);
    knee.position.y = -0.38;
    leg.add(knee);
    const kneeGlow = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.12), accent);
    kneeGlow.position.set(0, -0.38, -0.08);
    leg.add(kneeGlow);
    const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.32, 4, 8), armor);
    lower.position.y = -0.58;
    leg.add(lower);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.09, 0.3), graphite);
    foot.position.set(0, -0.81, -0.05);
    leg.add(foot);
    leg.rotation.z = side * 0.025;
    return leg;
  }

  reset() {
    const spawn = this.arena.spawnPoints[this.spawnIndex % this.arena.spawnPoints.length];
    this.pos.copy(spawn);
    this.pos.y = this.arena.floorHeightAt(this.pos.x, this.pos.z, 0.4) || 0;
    this.vel.set(0, 0, 0);
    this.health = 100;
    this.alive = true;
    this.respawnTimer = 0;
    this.shootTimer = 1.1 + Math.random() * 1.2;
    this.strafeTimer = Math.random() * 2;
    this.wanderTimer = 0;
    this.model.group.visible = true;
    this.model.group.position.copy(this.pos);
    this.yaw = Math.atan2(-(0 - this.pos.x), -(0 - this.pos.z));
    this.model.group.rotation.y = this.yaw;
    this.model.flash.material.opacity = 0;
    this.model.flash.visible = false;
  }

  center(target = _v) {
    return target.set(this.pos.x, this.pos.y + 1.18, this.pos.z);
  }

  headCenter(target = _v) {
    return target.set(this.pos.x, this.pos.y + 2.0, this.pos.z);
  }

  hitTest(origin, dir, maxDistance) {
    const bodyCenter = this.center(_v2);
    const headCenter = this.headCenter(_v3);
    const bodyR = 0.5;
    const headR = 0.26;
    const hitBody = raySphere(origin, dir, bodyCenter, bodyR);
    const hitHead = raySphere(origin, dir, headCenter, headR);
    let best = null;
    if (hitHead && hitHead <= maxDistance) best = { distance: hitHead, headshot: true, point: origin.clone().addScaledVector(dir, hitHead) };
    if (hitBody && hitBody <= maxDistance && (!best || hitBody < best.distance)) best = { distance: hitBody, headshot: false, point: origin.clone().addScaledVector(dir, hitBody) };
    return best;
  }

  takeDamage(amount, source, point = null, headshot = false, splash = false) {
    if (!this.alive) return false;
    this.health -= amount;
    this.hitFlash = 1;
    this.audio.playHit(headshot);
    if (point) this.effects.burst(point, { color: headshot ? 0xffd27a : this.accent, count: headshot ? 12 : 6, speed: 3.5, size: 0.1, life: 0.35, gravity: 6 });
    if (this.health <= 0) {
      this.die(source, headshot);
      return true;
    }
    this.manager.callbacks.onBotDamaged?.(this, amount, source, headshot);
    return false;
  }

  die(source, headshot = false) {
    this.alive = false;
    this.health = 0;
    this.deaths++;
    this.respawnTimer = 3.8;
    this.model.group.visible = false;
    const pos = this.center(new THREE.Vector3());
    this.effects.explosion(pos, { color: this.color, scale: 0.7 });
    this.effects.burst(pos, { color: this.accent, count: 22, speed: 9, size: 0.14, life: 0.8, gravity: 12 });
    this.audio.playExplosion(this.panToPlayer(), false);
    this.manager.callbacks.onBotKilled?.(this, source, headshot);
  }

  panToPlayer() {
    const player = this.manager.callbacks.getPlayer?.();
    if (!player) return 0;
    const dx = this.pos.x - player.pos.x;
    const dz = this.pos.z - player.pos.z;
    const localRight = dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw);
    return clamp(localRight / 24, -1, 1);
  }

  respawn() {
    const spawn = this.arena.findSpawn(14, this.manager.callbacks.getPlayer?.()?.pos);
    this.pos.copy(spawn);
    this.pos.y = this.arena.floorHeightAt(this.pos.x, this.pos.z, 0.4) || 0;
    this.health = 100;
    this.alive = true;
    this.hitFlash = 0;
    this.model.group.visible = true;
    this.model.group.position.copy(this.pos);
    this.effects.burst(this.center(new THREE.Vector3()), { color: this.color, count: 20, speed: 5, size: 0.16, life: 0.6, gravity: -1.5 });
    this.audio.playBotSpawn(this.panToPlayer());
    this.manager.callbacks.onBotRespawn?.(this);
  }

  update(dt, time, player, active) {
    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - dt * 5);
      if (this.materials.body.userData.shader) {
        this.materials.body.userData.shader.uniforms.uGlowBoost.value = this.hitFlash * 2.5;
      }
    }
    this.muzzleTimer = Math.max(0, this.muzzleTimer - dt);
    this.model.flash.material.opacity = this.muzzleTimer > 0 ? 0.95 : 0;
    this.model.flash.visible = this.muzzleTimer > 0;
    if (!this.alive) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0 && active) this.respawn();
      return;
    }

    if (!active) {
      this.model.group.position.copy(this.pos);
      this.model.group.rotation.y = this.yaw;
      this.animate(dt, 0);
      this.parts.root.position.y = Math.sin(time * 1.5 + this.index) * 0.01;
      return;
    }

    const toPlayer = _v.set(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z);
    const dist = toPlayer.length();
    const playerAlive = player.alive;
    const canSee = playerAlive && dist < 42;
    let move = new THREE.Vector3();
    let targetYaw = this.yaw;

    this.strafeTimer -= dt;
    this.wanderTimer -= dt;
    if (canSee) {
      targetYaw = Math.atan2(-toPlayer.x, -toPlayer.z);
      if (this.strafeTimer <= 0) {
        this.strafeTimer = 0.9 + Math.random() * 1.7;
        this.strafeDir = Math.random() < 0.5 ? -1 : 1;
      }
      const right = _v2.set(-toPlayer.z, 0, toPlayer.x).normalize();
      if (dist > 17) {
        move.copy(toPlayer).normalize().multiplyScalar(1);
      } else if (dist < 8.5) {
        move.copy(toPlayer).normalize().multiplyScalar(-1);
      }
      move.addScaledVector(right, this.strafeDir * 0.82).normalize();
      if (dist < 6) move.multiplyScalar(0.4);
    } else {
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 3 + Math.random() * 4;
        const a = Math.random() * Math.PI * 2;
        const r = 11 + Math.random() * 16;
        this.moveTarget.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      }
      move.set(this.moveTarget.x - this.pos.x, 0, this.moveTarget.z - this.pos.z);
      if (move.lengthSq() < 2) move.set(0, 0, 0);
      else {
        move.normalize();
        targetYaw = Math.atan2(-move.x, -move.z);
      }
    }

    const targetSpeed = canSee ? (dist < 8 ? 3.8 : 5.2) : 3.4;
    const accel = 12;
    this.vel.x += (move.x * targetSpeed - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (move.z * targetSpeed - this.vel.z) * Math.min(1, accel * dt);
    if (move.lengthSq() === 0) {
      this.vel.x *= Math.max(0, 1 - 7 * dt);
      this.vel.z *= Math.max(0, 1 - 7 * dt);
    }

    const nx = this.pos.x + this.vel.x * dt;
    if (!this.arena.collisionBlocked(nx, this.pos.z, this.pos.y, 0.34)) this.pos.x = nx;
    else { this.vel.x *= -0.2; this.strafeTimer = 0; this.strafeDir *= -1; }
    const nz = this.pos.z + this.vel.z * dt;
    if (!this.arena.collisionBlocked(this.pos.x, nz, this.pos.y, 0.34)) this.pos.z = nz;
    else { this.vel.z *= -0.2; this.strafeTimer = 0; this.strafeDir *= -1; }

    const ground = this.arena.floorHeightAt(this.pos.x, this.pos.z, this.pos.y + 0.5);
    if (ground > -50 && Math.abs(ground - this.pos.y) < 0.65) this.pos.y += (ground - this.pos.y) * Math.min(1, dt * 14);

    let diff = targetYaw - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.yaw += diff * Math.min(1, dt * 7.5);

    this.model.group.position.copy(this.pos);
    this.model.group.rotation.y = this.yaw;
    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.animate(dt, speed);
    this.parts.root.position.y = Math.sin(time * 1.6 + this.index) * 0.007;

    this.model.headGroup.rotation.x = canSee ? clamp(-0.1 + (player.pos.y - this.pos.y) * 0.015, -0.28, 0.22) : 0;

    this.shootTimer -= dt;
    if (canSee && this.shootTimer <= 0) {
      this.shoot(player, dist);
      this.shootTimer = (0.72 + Math.random() * 0.85) / this.def.aggression;
    }
  }

  animate(dt, speed) {
    const p = this.parts;
    const moving = speed > 0.25;
    if (moving) this.walkPhase += dt * (5.6 + speed * 0.7);
    const swing = moving ? Math.sin(this.walkPhase) * Math.min(0.62, speed * 0.11) : 0;
    p.legL.rotation.x = swing;
    p.legR.rotation.x = -swing;
    p.armL.rotation.x = -swing * 0.65;
    p.armR.rotation.x = -0.84 + swing * 0.22;
    p.armR.rotation.z = 0.12;
    p.armL.rotation.z = -0.16;
    p.torso.position.y = 0.17 + Math.abs(Math.sin(this.walkPhase * 2)) * (moving ? 0.028 : 0);
    p.hips.rotation.z = moving ? Math.sin(this.walkPhase) * 0.035 : 0;
    p.hips.position.y = 0.96 + (moving ? Math.abs(Math.cos(this.walkPhase)) * 0.025 : 0);
    p.headGroup.rotation.z = Math.sin(this.walkPhase * 0.5 + this.index) * 0.02;
    p.weapon.rotation.x = this.recoil * 0.14;
    this.recoil = Math.max(0, this.recoil - dt * 5);
  }

  shoot(player, dist) {
    this.recoil = 1.6;
    this.muzzleTimer = 0.065;
    this.aimTime = 0;
    const muzzle = this.model.muzzle.getWorldPosition(new THREE.Vector3());
    const eye = player.eyePosition(new THREE.Vector3());
    const speed = Math.hypot(player.vel.x, player.vel.z);
    let chance = clamp(0.63 - dist * 0.009 - speed * 0.018, 0.18, 0.62);
    if (player.crouch > 0.4) chance += 0.05;
    if (player.invuln > 0) chance = 0;
    const hit = Math.random() < chance;
    let end = eye.clone();
    if (!hit) {
      end.add(new THREE.Vector3((Math.random() - 0.5) * 5.5, (Math.random() - 0.5) * 3.4, (Math.random() - 0.5) * 5.5));
    }
    this.effects.tracer(muzzle, end, this.color, 0.075, 1.1);
    this.audio.playWeapon(this.index === 2 ? 'pulse' : 'scatter', this.panToPlayer());
    if (hit && player.alive) {
      const damage = 8 + Math.random() * 7;
      const result = player.applyDamage(damage, this);
      this.manager.callbacks.onPlayerHit?.(this, damage, result);
      this.effects.impact(eye, player.aimDirection(_v).multiplyScalar(-1), this.color);
    } else if (!hit) {
      this.effects.impact(end, null, this.color);
    }
  }
}

function raySphere(origin, dir, center, radius) {
  const oc = _rayVec.copy(origin).sub(center);
  const b = oc.dot(dir);
  const c = oc.lengthSq() - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : null;
}


function makeBotMaterial() {
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    metalness: 0.74,
    roughness: 0.37,
    envMapIntensity: 0.9,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.uGlowBoost = { value: 0 };
    shader.vertexShader = `attribute float glow;
varying float vGlow;
${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvGlow = glow;'
    );
    shader.fragmentShader = `varying float vGlow;
uniform float uGlowBoost;
${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor * vGlow * (1.0 + uGlowBoost);'
    );
    material.userData.shader = shader;
  };
  return material;
}

function mergeDirectMeshes(group, material) {
  const parts = [];
  for (const child of [...group.children]) {
    if (!child.isMesh || Array.isArray(child.material)) continue;
    child.updateMatrix();
    const geo = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
    geo.applyMatrix4(child.matrix);
    const n = geo.attributes.position.count;
    const colors = new Float32Array(n * 3);
    const glows = new Float32Array(n);
    const color = child.material.color || new THREE.Color(0xffffff);
    const glow = child.material === group.userData.accent ? 2.1 : child.material === group.userData.visor ? 5.5 : 0;
    for (let i = 0; i < n; i++) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
      glows[i] = glow;
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute('glow', new THREE.Float32BufferAttribute(glows, 1));
    parts.push({ geo, child });
  }
  if (!parts.length) return;
  const geometry = mergeGeometries(parts.map(part => part.geo), false);
  for (const part of parts) part.geo.dispose();
  if (!geometry) return;
  const mesh = new THREE.Mesh(geometry, material);
  group.add(mesh);
  for (const part of parts) part.child.parent?.remove(part.child);
}
