import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeGlowTexture } from './textures.js';

export const WEAPONS = [
  {
    id: 'pulse', slot: '01', name: 'PULSE RIFLE', cls: 'ASSAULT ENERGY',
    ammo: Infinity, reserve: Infinity, fireRate: 0.095, damage: 10, spread: 0.011,
    pellets: 1, range: 100, zoom: 0.74, kick: 0.55, color: 0x62eaff, sound: 'pulse', projectile: false,
  },
  {
    id: 'scatter', slot: '02', name: 'SCATTERGUN', cls: 'CLOSE QUARTERS',
    ammo: 24, reserve: 24, fireRate: 0.62, damage: 13, spread: 0.082,
    pellets: 8, range: 34, zoom: 0.9, kick: 1.55, color: 0xffa347, sound: 'scatter', projectile: false,
  },
  {
    id: 'rocket', slot: '03', name: 'ROCKET LAUNCHER', cls: 'HEAVY ORDNANCE',
    ammo: 12, reserve: 12, fireRate: 0.74, damage: 76, spread: 0.006,
    pellets: 1, range: 180, zoom: 0.86, kick: 2.0, color: 0xff6a2a, sound: 'rocket', projectile: true,
  },
  {
    id: 'rail', slot: '04', name: 'RAILGUN', cls: 'PRECISION ENERGY',
    ammo: 6, reserve: 6, fireRate: 1.05, damage: 120, spread: 0.0002,
    pellets: 1, range: 200, zoom: 0.48, kick: 1.7, color: 0x9cffff, sound: 'rail', projectile: false,
  },
];

function std(color, metalness, roughness, emissive = 0x000000, emissiveIntensity = 0) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness, emissive, emissiveIntensity });
}

function box(w, h, d, mat) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}

function cyl(rt, rb, h, mat, seg = 16) {
  return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
}

function add(parent, mesh, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  return mesh;
}

export class WeaponSystem {
  constructor(camera) {
    this.camera = camera;
    this.root = new THREE.Group();
    this.root.name = 'WeaponViewmodel';
    this.camera.add(this.root);
    this.glow = makeGlowTexture();
    this.materials = {
      dark: std(0x17171b, 0.92, 0.32),
      mid: std(0x3b3b42, 0.86, 0.38),
      light: std(0x77767b, 0.9, 0.28),
      bronze: std(0x9b6c3d, 0.96, 0.3),
      grip: std(0x151316, 0.5, 0.75),
      cyan: std(0x0e3238, 0.65, 0.25, 0x34e9f0, 3.1),
      orange: std(0x391708, 0.55, 0.3, 0xff5a1c, 2.7),
      red: std(0x2e0808, 0.5, 0.3, 0xff2418, 2.7),
      white: std(0xcdd7d8, 0.85, 0.18, 0xd8ffff, 0.8),
    };
    this.models = {};
    this.muzzles = {};
    this.flashSprites = {};
    this.lights = {};
    this.current = null;
    this.currentIndex = 0;
    this.flashTime = 0;
    this.kickValue = 0;
    this.switchTime = 0;
    this.zoom = 0;
    this.baseScale = 0.66;
    this.build();
    this.equip(0, true);
  }

  build() {
    this.models.pulse = this.buildPulse();
    this.models.scatter = this.buildScatter();
    this.models.rocket = this.buildRocket();
    this.models.rail = this.buildRail();
    for (const group of Object.values(this.models)) mergeByMaterial(group);
    for (const [key, group] of Object.entries(this.models)) {
      group.visible = false;
      group.traverse(o => {
        if (o.isMesh) {
          o.castShadow = false;
          o.receiveShadow = false;
          o.frustumCulled = false;
        }
      });
      this.root.add(group);
      const muzzle = new THREE.Object3D();
      muzzle.position.copy(this.muzzleLocals[key]);
      group.add(muzzle);
      this.muzzles[key] = muzzle;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glow,
        color: new THREE.Color(WEAPONS.find(w => w.id === key).color),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
      }));
      sprite.scale.set(0.65, 0.65, 1);
      muzzle.add(sprite);
      this.flashSprites[key] = sprite;
      const light = new THREE.PointLight(WEAPONS.find(w => w.id === key).color, 0, 3.5, 2);
      muzzle.add(light);
      this.lights[key] = light;
    }
  }

  get muzzleLocals() {
    return {
      pulse: new THREE.Vector3(0.0, 0.015, -0.85),
      scatter: new THREE.Vector3(0.0, 0.02, -0.76),
      rocket: new THREE.Vector3(0.0, 0.045, -0.72),
      rail: new THREE.Vector3(0.0, 0.04, -0.95),
    };
  }

  buildPulse() {
    const g = new THREE.Group();
    const { dark, mid, light, cyan, bronze, grip } = this.materials;
    add(g, box(0.17, 0.14, 0.5, mid), 0, 0, -0.05);
    add(g, box(0.11, 0.055, 0.42, dark), 0, 0.095, -0.06);
    add(g, box(0.2, 0.035, 0.33, dark), 0, 0.135, -0.02);
    add(g, box(0.055, 0.055, 0.46, light), 0.108, 0.005, -0.1);
    add(g, box(0.055, 0.055, 0.46, light), -0.108, 0.005, -0.1);
    add(g, box(0.19, 0.03, 0.1, cyan), 0, 0.112, -0.17);
    add(g, box(0.19, 0.025, 0.05, cyan), 0, 0.112, 0.06);
    add(g, box(0.12, 0.03, 0.3, bronze), 0, -0.09, -0.02);
    const barrel = cyl(0.035, 0.043, 0.56, light, 12);
    add(g, barrel, 0, 0.03, -0.53, Math.PI / 2);
    add(g, cyl(0.06, 0.06, 0.12, dark, 14), 0, 0.03, -0.69, Math.PI / 2);
    add(g, cyl(0.052, 0.052, 0.04, cyan, 14), 0, 0.03, -0.76, Math.PI / 2);
    for (let i = 0; i < 3; i++) {
      add(g, new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.013, 6, 16), cyan), 0, 0.03, -0.31 - i * 0.11, Math.PI / 2);
    }
    add(g, box(0.08, 0.16, 0.1, grip), 0, -0.14, 0.12, -0.18);
    add(g, box(0.1, 0.03, 0.2, grip), 0, -0.11, -0.08);
    add(g, box(0.1, 0.24, 0.16, dark), 0, -0.2, 0.02, -0.07);
    add(g, box(0.105, 0.03, 0.17, cyan), 0, -0.31, 0.015);
    add(g, box(0.07, 0.13, 0.17, dark), 0, 0.15, 0.1);
    const sight = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 18), bronze);
    add(g, sight, 0, 0.215, -0.03, 0, 0, 0);
    add(g, box(0.016, 0.055, 0.016, cyan), 0, 0.215, -0.03);
    add(g, box(0.16, 0.02, 0.03, bronze), 0, -0.04, 0.18);
    return g;
  }

  buildScatter() {
    const g = new THREE.Group();
    const { dark, mid, light, bronze, orange, grip } = this.materials;
    add(g, box(0.24, 0.17, 0.38, mid), 0, 0, -0.08);
    add(g, box(0.26, 0.045, 0.32, dark), 0, 0.105, -0.09);
    add(g, box(0.08, 0.06, 0.55, light), -0.052, 0.025, -0.52);
    add(g, box(0.08, 0.06, 0.55, light), 0.052, 0.025, -0.52);
    add(g, cyl(0.056, 0.065, 0.14, dark, 12), -0.052, 0.025, -0.76, Math.PI / 2);
    add(g, cyl(0.056, 0.065, 0.14, dark, 12), 0.052, 0.025, -0.76, Math.PI / 2);
    add(g, box(0.11, 0.085, 0.42, dark), 0, -0.064, -0.43);
    for (let i = 0; i < 3; i++) add(g, box(0.12, 0.01, 0.02, bronze), 0, -0.112, -0.3 - i * 0.1);
    add(g, box(0.2, 0.035, 0.22, bronze), 0, 0.108, 0.05);
    add(g, box(0.09, 0.2, 0.13, grip), 0, -0.18, 0.08, -0.22);
    add(g, box(0.1, 0.22, 0.14, dark), 0, -0.19, -0.17, 0.13);
    add(g, box(0.24, 0.09, 0.2, mid), 0, -0.03, 0.19);
    for (let i = 0; i < 4; i++) {
      const shell = cyl(0.02, 0.02, 0.08, orange, 8);
      add(g, shell, 0.14, -0.02 + i * 0.035, 0.02, 0, 0, Math.PI / 2);
    }
    add(g, box(0.022, 0.04, 0.022, orange), 0.052, 0.152, -0.6);
    add(g, box(0.022, 0.04, 0.022, orange), -0.052, 0.152, -0.6);
    add(g, box(0.04, 0.08, 0.12, dark), 0, 0.155, 0.08);
    return g;
  }

  buildRocket() {
    const g = new THREE.Group();
    const { dark, mid, light, bronze, red, orange, grip, cyan } = this.materials;
    const tube = cyl(0.105, 0.105, 0.74, mid, 18);
    add(g, tube, 0, 0.015, -0.2, Math.PI / 2);
    add(g, cyl(0.128, 0.128, 0.1, dark, 18), 0, 0.015, -0.56, Math.PI / 2);
    add(g, cyl(0.128, 0.128, 0.1, dark, 18), 0, 0.015, 0.16, Math.PI / 2);
    add(g, cyl(0.065, 0.105, 0.26, dark, 18), 0, 0.015, 0.31, Math.PI / 2);
    add(g, new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.018, 8, 24), red), 0, 0.015, -0.61, 0, 0, 0);
    add(g, new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.014, 8, 24), orange), 0, 0.015, 0.2, 0, 0, 0);
    add(g, box(0.16, 0.055, 0.34, dark), 0, 0.12, -0.06);
    add(g, box(0.06, 0.06, 0.25, cyan), 0, 0.16, -0.1);
    add(g, box(0.021, 0.1, 0.06, light), 0.12, 0.0, -0.12, 0, 0, 0.35);
    add(g, box(0.021, 0.1, 0.06, light), -0.12, 0.0, -0.12, 0, 0, -0.35);
    add(g, box(0.055, 0.055, 0.28, bronze), 0.12, -0.02, 0.06);
    add(g, box(0.055, 0.055, 0.28, bronze), -0.12, -0.02, 0.06);
    add(g, box(0.12, 0.18, 0.12, grip), 0, -0.2, 0.0, -0.17);
    add(g, box(0.08, 0.3, 0.15, dark), 0, -0.2, -0.17, 0.1);
    add(g, box(0.2, 0.07, 0.22, bronze), 0, -0.06, -0.31);
    add(g, box(0.1, 0.09, 0.16, red), 0.16, 0.05, -0.02);
    add(g, box(0.1, 0.09, 0.16, red), -0.16, 0.05, -0.02);
    add(g, box(0.13, 0.03, 0.09, orange), 0, 0.2, 0.02);
    const screen = box(0.15, 0.11, 0.025, cyan);
    add(g, screen, 0.13, 0.1, -0.22, 0, -0.3, 0);
    return g;
  }

  buildRail() {
    const g = new THREE.Group();
    const { dark, mid, light, bronze, cyan, white, grip } = this.materials;
    add(g, box(0.09, 0.13, 0.72, mid), 0, 0, -0.16);
    add(g, box(0.06, 0.05, 1.36, light), -0.045, 0.025, -0.43);
    add(g, box(0.06, 0.05, 1.36, light), 0.045, 0.025, -0.43);
    add(g, box(0.2, 0.035, 0.96, dark), 0, 0.09, -0.37);
    add(g, box(0.21, 0.035, 0.4, dark), 0, -0.02, -0.27);
    for (let i = 0; i < 5; i++) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.022, 6, 24), cyan);
      add(g, coil, 0, 0.025, -0.15 - i * 0.22, Math.PI / 2);
    }
    add(g, cyl(0.04, 0.04, 0.5, white, 12), 0, 0.025, -0.73, Math.PI / 2);
    add(g, box(0.17, 0.05, 0.3, bronze), 0, -0.07, -0.04);
    add(g, box(0.11, 0.2, 0.13, grip), 0, -0.19, 0.04, -0.18);
    add(g, box(0.12, 0.27, 0.16, dark), 0, -0.2, -0.22, 0.12);
    add(g, box(0.1, 0.14, 0.24, mid), 0, -0.02, 0.27);
    add(g, box(0.11, 0.03, 0.2, cyan), 0, 0.0, 0.3);
    add(g, box(0.14, 0.14, 0.2, dark), 0, 0.18, 0.0);
    const scope = cyl(0.055, 0.055, 0.3, dark, 14);
    add(g, scope, 0, 0.24, -0.16, Math.PI / 2);
    add(g, cyl(0.042, 0.042, 0.02, cyan, 14), 0, 0.24, -0.315, Math.PI / 2);
    add(g, cyl(0.052, 0.052, 0.02, dark, 14), 0, 0.24, -0.335, Math.PI / 2);
    const brace = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 6, 20, Math.PI), bronze);
    add(g, brace, 0, 0.12, -0.06, 0, 0, 0);
    add(g, box(0.02, 0.09, 0.02, white), 0.111, 0.02, -0.83, 0, 0, 0.1);
    add(g, box(0.02, 0.09, 0.02, white), -0.111, 0.02, -0.83, 0, 0, -0.1);
    return g;
  }

  equip(index, immediate = false) {
    index = ((index % WEAPONS.length) + WEAPONS.length) % WEAPONS.length;
    if (this.currentIndex === index && !immediate) return false;
    this.currentIndex = index;
    const id = WEAPONS[index].id;
    if (this.current) this.current.visible = false;
    this.current = this.models[id];
    this.current.visible = true;
    this.switchTime = immediate ? 0 : 0.32;
    if (immediate) {
      const z = -0.66;
      const halfWidth = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) * 0.5) * Math.abs(z) * (this.camera.aspect || 1);
      this.root.position.set(Math.min(halfWidth * 0.44, 0.34), -0.265, z);
      this.root.scale.setScalar(this.baseScale);
    } else {
      this.root.position.y = -0.55;
    }
    return id;
  }

  fire(kick = 1) {
    this.kickValue = Math.min(3.2, this.kickValue + kick);
    this.flashTime = 0.075;
    const id = WEAPONS[this.currentIndex].id;
    const sprite = this.flashSprites[id];
    sprite.material.opacity = 1;
    sprite.scale.setScalar(0.5 + Math.random() * 0.55);
    sprite.material.rotation = Math.random() * Math.PI * 2;
    this.lights[id].intensity = 6;
    this.lights[id].distance = 4;
  }

  muzzleWorldPosition(target = new THREE.Vector3()) {
    const id = WEAPONS[this.currentIndex].id;
    return this.muzzles[id].getWorldPosition(target);
  }

  update(dt, time, moveSpeed, grounded, lookX, lookY, zoomHeld, playerVel) {
    if (!this.current) return;
    this.flashTime = Math.max(0, this.flashTime - dt);
    this.kickValue = Math.max(0, this.kickValue - dt * 6.6);
    this.switchTime = Math.max(0, this.switchTime - dt);
    this.zoom += ((zoomHeld ? 1 : 0) - this.zoom) * Math.min(1, dt * 10);

    const id = WEAPONS[this.currentIndex].id;
    const sprite = this.flashSprites[id];
    sprite.material.opacity = this.flashTime > 0 ? 0.95 : 0;
    this.lights[id].intensity = this.flashTime > 0 ? 6 : 0;

    const moveFactor = Math.min(1, Math.hypot(playerVel.x, playerVel.z) / 7);
    const bobX = Math.sin(time * 11.2) * 0.012 * moveFactor * (grounded ? 1 : 0.25);
    const bobY = Math.abs(Math.cos(time * 11.2)) * 0.014 * moveFactor * (grounded ? 1 : 0.25);
    const breathe = Math.sin(time * 1.9) * 0.004;
    const swayX = THREE.MathUtils.clamp(-lookX * 0.00055, -0.035, 0.035);
    const swayY = THREE.MathUtils.clamp(lookY * 0.00055, -0.03, 0.03);

    const targetZ = -0.66 + this.kickValue * 0.034;
    const halfWidth = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) * 0.5) * Math.abs(targetZ) * (this.camera.aspect || 1);
    const restX = Math.min(halfWidth * 0.44, 0.34);
    const targetX = restX * (1 - this.zoom * 0.85) + bobX + swayX;
    const targetY = -0.265 + bobY + breathe + swayY - this.switchTime * 0.55;
    const lerp = 1 - Math.pow(0.001, dt);
    this.root.position.x += (targetX - this.root.position.x) * lerp;
    this.root.position.y += (targetY - this.root.position.y) * lerp;
    this.root.position.z += (targetZ - this.root.position.z) * lerp;

    const targetRX = this.kickValue * 0.055 + swayY * 0.5 + this.switchTime * 1.6;
    const targetRY = swayX * 1.2;
    const targetRZ = bobX * 0.8 + this.switchTime * 0.3;
    this.root.rotation.x += (targetRX - this.root.rotation.x) * lerp;
    this.root.rotation.y += (targetRY - this.root.rotation.y) * lerp;
    this.root.rotation.z += (targetRZ - this.root.rotation.z) * lerp;
    this.root.scale.setScalar(this.baseScale * (1 - this.zoom * 0.035));
  }

  getModel() {
    return this.current;
  }
}

function mergeByMaterial(group) {
  group.updateMatrixWorld(true);
  const buckets = new Map();
  for (const child of [...group.children]) {
    if (!child.isMesh || Array.isArray(child.material)) continue;
    child.updateMatrix();
    const geo = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
    geo.applyMatrix4(child.matrix);
    let bucket = buckets.get(child.material);
    if (!bucket) {
      bucket = { material: child.material, geos: [], meshes: [] };
      buckets.set(child.material, bucket);
    }
    bucket.geos.push(geo);
    bucket.meshes.push(child);
  }
  for (const bucket of buckets.values()) {
    if (bucket.geos.length < 2) {
      for (const geo of bucket.geos) geo.dispose();
      continue;
    }
    const geometry = mergeGeometries(bucket.geos, false);
    for (const geo of bucket.geos) geo.dispose();
    if (!geometry) continue;
    group.add(new THREE.Mesh(geometry, bucket.material));
    for (const mesh of bucket.meshes) mesh.parent?.remove(mesh);
  }
}
