import * as THREE from 'three';
import { makeSparkTexture, makeGlowTexture, makeSmokeTexture } from './textures.js';

const Y_AXIS = new THREE.Vector3(0, 1, 0);

function randomUnit(out) {
  const u = Math.random() * 2 - 1;
  const a = Math.random() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return out.set(Math.cos(a) * s, u, Math.sin(a) * s);
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'Effects';
    this.scene.add(this.group);
    this.bursts = [];
    this.lines = [];
    this.rings = [];
    this.lights = [];
    this.sparkTex = makeSparkTexture();
    this.glowTex = makeGlowTexture();
    this.smokeTex = makeSmokeTexture();
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
  }

  burst(position, { color = 0xffa14a, count = 18, speed = 7, size = 0.16, life = 0.55, gravity = 12, spread = 1, drag = 0.93 } = {}) {
    count = Math.max(1, Math.floor(count));
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const velocities = [];
    const c = new THREE.Color(color);
    const vary = new THREE.Color();
    for (let i = 0; i < count; i++) {
      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y;
      positions[i * 3 + 2] = position.z;
      const dir = randomUnit(new THREE.Vector3());
      dir.y = Math.abs(dir.y) * spread + (1 - spread) * 0.2;
      const v = dir.multiplyScalar(speed * (0.25 + Math.random() * 0.9));
      velocities.push(v);
      vary.copy(c).lerp(new THREE.Color(0xffffff), Math.random() * 0.35);
      colors[i * 3] = vary.r;
      colors[i * 3 + 1] = vary.g;
      colors[i * 3 + 2] = vary.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      map: this.sparkTex,
      size,
      transparent: true,
      opacity: 1,
      vertexColors: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      toneMapped: false,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.group.add(points);
    this.bursts.push({ points, geo, mat, velocities, life, maxLife: life, gravity, drag });
  }

  tracer(start, end, color = 0xffd8a1, life = 0.075, width = 1) {
    const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      linewidth: width,
      toneMapped: false,
    });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    this.group.add(line);
    this.lines.push({ line, mat, life, maxLife: life, fade: 1 });
    return line;
  }

  beam(start, end, color = 0x58eaff, radius = 0.05, life = 0.18) {
    const dir = new THREE.Vector3().subVectors(end, start);
    const len = dir.length();
    if (len < 0.01) return null;
    const geo = new THREE.CylinderGeometry(radius, radius, len, 8, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(start).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(Y_AXIS, dir.clone().normalize());
    this.group.add(mesh);
    this.lines.push({ line: mesh, mat, life, maxLife: life, fade: 0.95, geo });
    return mesh;
  }

  impact(position, normal = null, color = 0xffa14a) {
    this.burst(position, { color, count: 9, speed: 4.2, size: 0.1, life: 0.35, gravity: 8, spread: 0.6 });
    if (normal) {
      const p = position.clone().addScaledVector(normal, 0.04);
      const p2 = p.clone().addScaledVector(normal, 1.6);
      const line = this.tracer(p, p2, 0xffd9a5, 0.08);
      line.material.opacity = 0.2;
    }
  }

  explosion(position, { color = 0xff7a2a, scale = 1 } = {}) {
    this.burst(position, { color, count: 34 * scale, speed: 12 * scale, size: 0.26, life: 0.8, gravity: 9, spread: 1, drag: 0.94 });
    this.burst(position, { color: 0xffe6b5, count: 14, speed: 8 * scale, size: 0.16, life: 0.38, gravity: 4 });
    this.burst(position, { color: 0x2d221c, count: 14, speed: 4 * scale, size: 0.6, life: 1.1, gravity: -1.2, drag: 0.9 });

    const ringGeo = new THREE.RingGeometry(0.4, 0.75, 40);
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(position);
    ring.rotation.x = -Math.PI / 2;
    this.group.add(ring);
    this.rings.push({ mesh: ring, mat: ringMat, life: 0.5, maxLife: 0.5, scale: 5 * scale });

    const flash = new THREE.PointLight(color, 55 * scale, 15 * scale, 2);
    flash.position.copy(position);
    this.group.add(flash);
    this.lights.push({ light: flash, life: 0.3, maxLife: 0.3, base: 55 * scale });
  }

  smoke(position, count = 5, scale = 1) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({ map: this.smokeTex, color: 0x3b2e28, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.NormalBlending });
      const sp = new THREE.Sprite(mat);
      sp.position.copy(position).add(new THREE.Vector3((Math.random() - .5) * 0.8, Math.random() * 0.7, (Math.random() - .5) * 0.8));
      sp.scale.set(1.5 * scale, 1.5 * scale, 1);
      this.group.add(sp);
      this.lines.push({ line: sp, mat, life: 1.2, maxLife: 1.2, fade: 0.28, growth: 4 * scale, rise: 1.6 });
    }
  }

  railBeam(start, end) {
    this.beam(start, end, 0x62eaff, 0.14, 0.34);
    this.beam(start, end, 0xd8ffff, 0.04, 0.28);
    const dir = new THREE.Vector3().subVectors(end, start);
    for (let i = 0; i < 8; i++) {
      const p = start.clone().addScaledVector(dir, Math.random());
      this.burst(p, { color: 0x87f3ff, count: 2, speed: 1.5, size: 0.08, life: 0.4, gravity: 0 });
    }
  }

  update(dt) {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.life -= dt;
      b.mat.opacity = Math.max(0, b.life / b.maxLife);
      const pos = b.geo.attributes.position;
      for (let j = 0; j < pos.count; j++) {
        const v = b.velocities[j];
        v.y -= b.gravity * dt;
        v.multiplyScalar(Math.pow(b.drag, dt * 60));
        pos.setXYZ(j,
          pos.getX(j) + v.x * dt,
          pos.getY(j) + v.y * dt,
          pos.getZ(j) + v.z * dt
        );
      }
      pos.needsUpdate = true;
      if (b.life <= 0) {
        this.group.remove(b.points);
        b.geo.dispose();
        b.mat.dispose();
        this.bursts.splice(i, 1);
      }
    }

    for (let i = this.lines.length - 1; i >= 0; i--) {
      const l = this.lines[i];
      l.life -= dt;
      const t = Math.max(0, l.life / l.maxLife);
      l.mat.opacity = Math.max(0, l.fade * t);
      if (l.growth) {
        const s = l.line.scale.x + l.growth * dt;
        l.line.scale.set(s, s, 1);
      }
      if (l.rise) l.line.position.y += l.rise * dt;
      if (l.life <= 0) {
        this.group.remove(l.line);
        if (l.geo) l.geo.dispose();
        l.mat.dispose();
        this.lines.splice(i, 1);
      }
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      const t = 1 - r.life / r.maxLife;
      const s = 1 + t * r.scale;
      r.mesh.scale.set(s, s, s);
      r.mat.opacity = Math.max(0, 0.8 * (1 - t));
      if (r.life <= 0) {
        this.group.remove(r.mesh);
        r.mesh.geometry.dispose();
        r.mat.dispose();
        this.rings.splice(i, 1);
      }
    }

    for (let i = this.lights.length - 1; i >= 0; i--) {
      const l = this.lights[i];
      l.life -= dt;
      l.light.intensity = Math.max(0, l.base * (l.life / l.maxLife));
      if (l.life <= 0) {
        this.group.remove(l.light);
        this.lights.splice(i, 1);
      }
    }
  }
}
