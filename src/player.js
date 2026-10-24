import * as THREE from 'three';
import { WEAPONS } from './weapons.js';

const UP = new THREE.Vector3(0, 1, 0);
const STEP = 0.58;

export class Player {
  constructor(camera, arena, audio, weapons) {
    this.camera = camera;
    this.arena = arena;
    this.audio = audio;
    this.weapons = weapons;
    this.pos = new THREE.Vector3(0, 0, 28);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.eyeHeight = 1.68;
    this.crouch = 0;
    this.radius = 0.38;
    this.health = 100;
    this.armor = 50;
    this.maxHealth = 100;
    this.maxArmor = 100;
    this.alive = true;
    this.grounded = false;
    this.frags = 0;
    this.deaths = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.damageDealt = 0;
    this.damageTaken = 0;
    this.weaponAmmo = WEAPONS.map(w => w.ammo);
    this.weaponReserve = WEAPONS.map(w => w.reserve);
    this.currentWeapon = 0;
    this.fireCooldown = 0;
    this.invuln = 0;
    this.respawnTimer = 0;
    this.lastDamage = 0;
    this.lastAttacker = null;
    this.bobTime = 0;
    this.bobAmount = 0;
    this.shake = 0;
    this.shakeTime = 0;
    this.landKick = 0;
    this.jumpBuffer = 0;
    this.lastGroundHeight = 0;
    this.stepTimer = 0;
    this.airTime = 0;
    this.spawnPoint = new THREE.Vector3(0, 0, 28);
    this.deathPos = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
  }

  reset(spawn = null, full = true) {
    const p = spawn || this.arena.spawnPoints[0];
    this.pos.copy(p);
    this.pos.y = this.arena.floorHeightAt(this.pos.x, this.pos.z, 0) || 0;
    this.vel.set(0, 0, 0);
    this.yaw = Math.atan2(-(0 - p.x), -(0 - p.z));
    this.pitch = 0;
    this.alive = true;
    this.invuln = 1.4;
    this.respawnTimer = 0;
    this.crouch = 0;
    this.shake = 0;
    this.landKick = 0;
    this.fireCooldown = 0;
    this.currentWeapon = 0;
    this.weapons.equip(0, true);
    if (full) {
      this.health = 100;
      this.armor = 50;
      this.weaponAmmo = WEAPONS.map(w => w.ammo);
      this.weaponReserve = WEAPONS.map(w => w.reserve);
    }
    this.syncCamera(0);
  }

  addLook(dx, dy, sensitivity = 0.0022, zoomFactor = 1) {
    this.yaw -= dx * sensitivity * zoomFactor;
    this.pitch -= dy * sensitivity * zoomFactor;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.48, 1.48);
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
  }

  addShake(amount) {
    this.shake = Math.min(0.42, this.shake + amount);
    this.shakeTime = 0.24;
  }

  update(dt, time, input) {
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    if (!this.alive) {
      this.respawnTimer -= dt;
      this.weapons.root.visible = false;
      return;
    }
    this.weapons.root.visible = true;

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3();
    if (input.forward) wish.add(forward);
    if (input.back) wish.sub(forward);
    if (input.right) wish.add(right);
    if (input.left) wish.sub(right);
    if (wish.lengthSq() > 0) wish.normalize();

    const crouching = input.crouch;
    this.crouch += ((crouching ? 1 : 0) - this.crouch) * Math.min(1, dt * 12);
    const speed = crouching ? 5.1 : 9.3;

    const accel = this.grounded ? 62 : 13;
    const friction = this.grounded ? 8.6 : 0.45;
    const targetVelX = wish.x * speed;
    const targetVelZ = wish.z * speed;

    if (wish.lengthSq() > 0) {
      this.vel.x += (targetVelX - this.vel.x) * Math.min(1, accel * dt / Math.max(2, speed));
      this.vel.z += (targetVelZ - this.vel.z) * Math.min(1, accel * dt / Math.max(2, speed));
    } else if (this.grounded) {
      const f = Math.max(0, 1 - friction * dt);
      this.vel.x *= f;
      this.vel.z *= f;
    }

    if (Math.abs(this.vel.x) < 0.015) this.vel.x = 0;
    if (Math.abs(this.vel.z) < 0.015) this.vel.z = 0;

    if (input.jump) this.jumpBuffer = 0.13;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    if (this.jumpBuffer > 0 && this.grounded) {
      this.vel.y = 7.9;
      this.grounded = false;
      this.jumpBuffer = 0;
      this.audio.playJump();
    }

    const pad = this.arena.jumpPadAt(this.pos.x, this.pos.z);
    if (pad && this.pos.y < 0.45) {
      const dx = -this.pos.x;
      const dz = -this.pos.z;
      const l = Math.hypot(dx, dz) || 1;
      this.vel.y = 14.2;
      this.vel.x = dx / l * 6.8;
      this.vel.z = dz / l * 6.8;
      this.grounded = false;
      this.addShake(0.15);
      this.audio.playJump();
      this.audio.tone({ freq: 120, end: 600, type: 'sawtooth', dur: 0.5, gain: 0.16, filter: { freq: 2400, end: 500 } });
    }

    const wasGrounded = this.grounded;
    this.vel.y -= 23.5 * dt;
    if (this.vel.y < -35) this.vel.y = -35;

    const prevFeet = this.pos.y;
    const feet = this.pos.y;
    const nx = this.pos.x + this.vel.x * dt;
    if (!this.arena.collisionBlocked(nx, this.pos.z, feet, this.radius)) {
      this.pos.x = nx;
    } else {
      this.vel.x *= -0.05;
    }
    const nz = this.pos.z + this.vel.z * dt;
    if (!this.arena.collisionBlocked(this.pos.x, nz, feet, this.radius)) {
      this.pos.z = nz;
    } else {
      this.vel.z *= -0.05;
    }

    const support = this.arena.floorHeightAt(this.pos.x, this.pos.z, Math.max(feet, prevFeet), STEP);
    const newY = this.pos.y + this.vel.y * dt;
    if (newY <= support + 0.001 && this.vel.y <= 0) {
      if (!wasGrounded && this.vel.y < -8) {
        this.audio.playLand();
        this.landKick = Math.min(0.12, -this.vel.y * 0.0045);
      }
      this.pos.y = support;
      this.vel.y = 0;
      this.grounded = true;
      this.airTime = 0;
    } else {
      this.pos.y = newY;
      this.grounded = false;
      this.airTime += dt;
    }

    if (this.grounded) {
      const ground = this.arena.floorHeightAt(this.pos.x, this.pos.z, this.pos.y + STEP, STEP);
      if (Math.abs(ground - this.pos.y) < STEP && ground >= this.pos.y - 0.65) {
        this.pos.y = ground;
      }
    }

    if (this.grounded && Math.hypot(this.vel.x, this.vel.z) > 0.4) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.audio.playFootstep();
        this.stepTimer = 0.36;
      }
    }

    const hspeed = Math.hypot(this.vel.x, this.vel.z);
    const targetBob = this.grounded ? Math.min(1, hspeed / 7.5) : 0;
    this.bobAmount += (targetBob - this.bobAmount) * Math.min(1, dt * 7);
    this.bobTime += dt * (7.2 + hspeed * 0.55);
    this.landKick = Math.max(0, this.landKick - dt * 0.65);
    this.shake = Math.max(0, this.shake - dt * 1.9);

    this.syncCamera(dt, hspeed);
    this.weapons.update(dt, time, hspeed, this.grounded, this.lastLookX || 0, this.lastLookY || 0, input.zoom, this.vel);
    this.lastLookX = 0;
    this.lastLookY = 0;
  }

  syncCamera(dt, hspeed = 0) {
    const bobY = Math.sin(this.bobTime * 2) * 0.028 * this.bobAmount;
    const bobX = Math.cos(this.bobTime) * 0.022 * this.bobAmount;
    const roll = Math.sin(this.bobTime) * 0.0045 * this.bobAmount - (this.vel.x * Math.cos(this.yaw) - this.vel.z * Math.sin(this.yaw)) * 0.0007;
    const shake = this.shake;
    const shakeX = (Math.random() - 0.5) * shake;
    const shakeY = (Math.random() - 0.5) * shake;
    const crouchOffset = this.crouch * 0.38;
    this.camera.position.set(this.pos.x + bobX + shakeX, this.pos.y + this.eyeHeight - crouchOffset + bobY - this.landKick + shakeY, this.pos.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch + shakeY * 0.5, this.yaw + shakeX * 0.5, roll + shakeX * 0.1);
  }

  getWeapon() {
    return WEAPONS[this.currentWeapon];
  }

  getAmmo() {
    return this.weaponAmmo[this.currentWeapon];
  }

  switchWeapon(index) {
    if (index < 0 || index >= WEAPONS.length) return false;
    if (this.currentWeapon === index) return false;
    this.currentWeapon = index;
    this.weapons.equip(index);
    this.fireCooldown = Math.max(this.fireCooldown, 0.12);
    this.audio.playUi();
    return true;
  }

  addAmmo(index, amount) {
    const def = WEAPONS[index];
    if (!Number.isFinite(def.ammo)) return true;
    const before = this.weaponAmmo[index];
    this.weaponAmmo[index] = Math.min(def.reserve * 2, this.weaponAmmo[index] + amount);
    return this.weaponAmmo[index] !== before;
  }

  canFire() {
    if (!this.alive || this.fireCooldown > 0) return false;
    return this.getAmmo() > 0;
  }

  consumeShot() {
    const idx = this.currentWeapon;
    this.fireCooldown = this.getWeapon().fireRate;
    if (Number.isFinite(this.weaponAmmo[idx])) {
      this.weaponAmmo[idx] = Math.max(0, this.weaponAmmo[idx] - 1);
    }
    this.shotsFired++;
    this.weapons.fire(this.getWeapon().kick * 0.7);
  }

  applyDamage(amount, attacker = null) {
    if (!this.alive || this.invuln > 0) return { died: false, absorbed: 0 };
    let remaining = amount;
    let absorbed = 0;
    if (this.armor > 0) {
      absorbed = Math.min(this.armor, remaining * 0.66);
      this.armor = Math.max(0, this.armor - absorbed);
      remaining -= absorbed;
    }
    this.health = Math.max(0, this.health - remaining);
    this.damageTaken += amount;
    this.lastDamage = performance.now();
    this.lastAttacker = attacker;
    this.audio.playDamage();
    this.addShake(Math.min(0.3, amount * 0.008));
    if (this.health <= 0) {
      this.die(attacker);
      return { died: true, absorbed };
    }
    return { died: false, absorbed };
  }

  heal(amount) {
    const before = this.health;
    this.health = Math.min(this.maxHealth, this.health + amount);
    return this.health !== before;
  }

  addArmor(amount) {
    const before = this.armor;
    this.armor = Math.min(this.maxArmor, this.armor + amount);
    return this.armor !== before;
  }

  die(attacker) {
    this.alive = false;
    this.deaths++;
    this.health = 0;
    this.deathPos.copy(this.pos);
    this.respawnTimer = 3.2;
    this.vel.set(0, 0, 0);
    this.weapons.root.visible = false;
  }

  respawn() {
    const spawn = this.arena.findSpawn(10, this.pos);
    this.reset(spawn, false);
    this.health = 100;
    this.armor = 50;
    this.alive = true;
    this.weaponAmmo = WEAPONS.map((w, i) => Number.isFinite(w.ammo) ? Math.max(w.ammo, this.weaponAmmo[i]) : Infinity);
    this.weaponReserve = WEAPONS.map((w, i) => Number.isFinite(w.reserve) ? Math.max(w.reserve, this.weaponReserve[i]) : Infinity);
  }

  getAccuracy() {
    if (!this.shotsFired) return 0;
    return Math.round(this.shotsHit / this.shotsFired * 100);
  }

  eyePosition(target = new THREE.Vector3()) {
    return target.set(this.pos.x, this.pos.y + this.eyeHeight - this.crouch * 0.38, this.pos.z);
  }

  aimDirection(target = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return target.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp).normalize();
  }
}
