import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  makeFloorTextures,
  makeMetalTexture,
  makeStoneTexture,
  makeHazardTexture,
  makeGlowTexture,
  makeSmokeTexture,
  makeStarTexture,
  makeNebulaTexture,
  makePlanetTexture,
  makeRingTexture,
  makeBannerTexture,
  makeDecalTexture,
  makeWarningDecal,
  makeSparkTexture,
} from './textures.js';

const TAU = Math.PI * 2;
const ARENA_HALF = 40;

function meshBox(w, h, d, material) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
}

function addShadow(mesh, cast = true, receive = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

function makeRampGeometry(width, run, rise) {
  const length = Math.hypot(run, rise);
  const geo = new THREE.BoxGeometry(width, 0.38, length, 1, 1, 4);
  return geo;
}

export class Arena {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.group = new THREE.Group();
    this.group.name = 'Arena';
    this.scene.add(this.group);
    this.platforms = [];
    this.ramps = [];
    this.walls = [];
    this.circleColliders = [];
    this.spawnPoints = [
      new THREE.Vector3(0, 0, 28),
      new THREE.Vector3(-16, 0, 5),
      new THREE.Vector3(17, 0, 0),
      new THREE.Vector3(0, 0, -15),
      new THREE.Vector3(-27, 0, 17),
      new THREE.Vector3(26, 0, 18),
    ];
    this.pickups = [];
    this.animated = [];
    this.pulseTargets = [];
    this.portal = null;
    this.time = 0;
    this.materials = {};
    this.textures = {};
    this.buildEnvironment();
    this.buildMaterials();
    this.buildSky();
    this.buildArenaFloor();
    this.buildWalls();
    this.buildCentralDais();
    this.buildPillars();
    this.buildProps();
    this.buildPickups();
    this.buildAtmosphere();
    this.mergeStaticGeometry();
  }

  markDynamic(root) {
    root.traverse(child => { child.userData.noMerge = true; });
  }

  mergeStaticGeometry() {
    this.group.updateMatrixWorld(true);
    if (this.core) this.markDynamic(this.core);
    if (this.portalBeam) this.markDynamic(this.portalBeam);
    for (const p of this.pickups) this.markDynamic(p.mesh);
    for (const a of this.animated) this.markDynamic(a.mesh);

    const buckets = new Map();
    this.group.traverse(mesh => {
      if (!mesh.isMesh || mesh.isInstancedMesh || !mesh.geometry?.attributes?.position) return;
      if (Array.isArray(mesh.material) || mesh.material?.isShaderMaterial || mesh.material?.transparent) return;
      for (let node = mesh; node && node !== this.group; node = node.parent) {
        if (node.userData.noMerge) return;
      }
      const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      if (!geo.attributes.normal || !geo.attributes.uv) return;
      geo.applyMatrix4(mesh.matrixWorld);
      let bucket = buckets.get(mesh.material);
      if (!bucket) {
        bucket = { material: mesh.material, geos: [], castShadow: false, receiveShadow: false };
        buckets.set(mesh.material, bucket);
      }
      bucket.geos.push(geo);
      bucket.castShadow ||= mesh.castShadow;
      bucket.receiveShadow ||= mesh.receiveShadow;
      mesh.userData.mergedAway = true;
    });

    for (const bucket of buckets.values()) {
      if (bucket.geos.length < 2) continue;
      const geometry = mergeGeometries(bucket.geos, false);
      for (const geo of bucket.geos) geo.dispose();
      if (!geometry) continue;
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, bucket.material);
      mesh.castShadow = bucket.castShadow;
      mesh.receiveShadow = bucket.receiveShadow;
      mesh.name = `Merged_${bucket.material.name || bucket.material.uuid.slice(0, 6)}`;
      this.group.add(mesh);
    }

    const remove = [];
    this.group.traverse(mesh => { if (mesh.userData.mergedAway) remove.push(mesh); });
    for (const mesh of remove) mesh.parent?.remove(mesh);
  }

  buildEnvironment() {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 512;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, '#090b1d');
    g.addColorStop(0.38, '#17152b');
    g.addColorStop(0.62, '#241621');
    g.addColorStop(1, '#07060b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);
    const glows = [
      [740, 160, 170, 'rgba(255,150,70,.48)'],
      [330, 260, 220, 'rgba(80,110,220,.2)'],
      [880, 350, 180, 'rgba(160,70,150,.16)'],
    ];
    for (const [x, y, r, color] of glows) {
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, color);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, c.width, c.height);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromEquirectangular(tex).texture;
    this.scene.environmentIntensity = 0.6;
    pmrem.dispose();
    tex.dispose();
  }

  buildMaterials() {
    const floorTex = makeFloorTextures();
    this.textures.hazard = makeHazardTexture();
    this.textures.stone = makeStoneTexture();
    this.textures.metal = makeMetalTexture(4);
    this.textures.metalDark = makeMetalTexture(7, [35, 31, 31]);
    this.textures.metalWarm = makeMetalTexture(11, [72, 50, 35]);
    this.textures.glow = makeGlowTexture();
    this.textures.spark = makeSparkTexture();
    this.textures.smoke = makeSmokeTexture();
    this.textures.warning = makeWarningDecal();

    this.materials.floor = new THREE.MeshStandardMaterial({
      map: floorTex.map,
      roughnessMap: floorTex.roughnessMap,
      emissiveMap: floorTex.emissiveMap,
      emissive: new THREE.Color(0xff6b1f),
      emissiveIntensity: 0.44,
      color: 0xb8b2a9,
      metalness: 0.44,
      roughness: 0.63,
      envMapIntensity: 0.9,
    });
    this.materials.floorSide = new THREE.MeshStandardMaterial({
      map: this.textures.metalDark,
      color: 0x4f4540,
      metalness: 0.8,
      roughness: 0.48,
      envMapIntensity: 0.8,
    });
    this.materials.stone = new THREE.MeshStandardMaterial({
      map: this.textures.stone,
      color: 0xaca29b,
      metalness: 0.12,
      roughness: 0.9,
    });
    this.materials.stoneDark = new THREE.MeshStandardMaterial({
      map: this.textures.stone,
      color: 0x5d5654,
      metalness: 0.18,
      roughness: 0.95,
    });
    this.materials.metal = new THREE.MeshStandardMaterial({
      map: this.textures.metal,
      color: 0x837a72,
      metalness: 0.78,
      roughness: 0.44,
      envMapIntensity: 1,
    });
    this.materials.metalDark = new THREE.MeshStandardMaterial({
      map: this.textures.metalDark,
      color: 0x58504b,
      metalness: 0.86,
      roughness: 0.39,
      envMapIntensity: 0.9,
    });
    this.materials.metalWarm = new THREE.MeshStandardMaterial({
      map: this.textures.metalWarm,
      color: 0x8b6242,
      metalness: 0.8,
      roughness: 0.42,
      envMapIntensity: 1,
    });
    this.materials.bronze = new THREE.MeshStandardMaterial({
      color: 0x9d6a3b,
      metalness: 0.96,
      roughness: 0.3,
      envMapIntensity: 1.3,
    });
    this.materials.gold = new THREE.MeshStandardMaterial({
      color: 0xdba95f,
      metalness: 1,
      roughness: 0.24,
      envMapIntensity: 1.5,
    });
    this.materials.hazard = new THREE.MeshStandardMaterial({
      map: this.textures.hazard,
      color: 0xb17a3c,
      roughness: 0.6,
      metalness: 0.4,
    });
    this.materials.emissiveAmber = new THREE.MeshBasicMaterial({ color: 0xff8a2b, toneMapped: false });
    this.materials.emissiveCyan = new THREE.MeshBasicMaterial({ color: 0x42e8e4, toneMapped: false });
    this.materials.emissiveRed = new THREE.MeshBasicMaterial({ color: 0xff3b2a, toneMapped: false });
    this.materials.emissivePale = new THREE.MeshBasicMaterial({ color: 0xffd39b, toneMapped: false });
  }

  buildSky() {
    const sky = new THREE.Group();
    this.group.add(sky);

    const starTex = makeStarTexture();
    const starGeo = new THREE.BufferGeometry();
    const count = 4200;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const r = 520 + Math.random() * 320;
      const theta = Math.random() * TAU;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
      positions[i * 3 + 1] = Math.cos(phi) * r;
      positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
      const hue = 0.55 + Math.random() * 0.13;
      color.setHSL(hue, Math.random() * 0.45, 0.62 + Math.random() * 0.35);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
      sizes[i] = 0.6 + Math.random() * 2.2;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    starGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    const starMat = new THREE.PointsMaterial({
      map: starTex,
      size: 2.4,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      fog: false,
      toneMapped: false,
    });
    const stars = new THREE.Points(starGeo, starMat);
    stars.frustumCulled = false;
    sky.add(stars);
    this.starField = stars;

    const planetTex = makePlanetTexture();
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(92, 64, 64),
      new THREE.MeshStandardMaterial({
        map: planetTex,
        emissive: new THREE.Color(0x2a1c22),
        emissiveIntensity: 0.45,
        roughness: 0.92,
        metalness: 0.02,
        fog: false,
      })
    );
    planet.position.set(235, 136, -380);
    planet.rotation.z = -0.4;
    sky.add(planet);

    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(255,210,150,.25)', 'rgba(120,90,255,0)'),
      color: 0x8f9cff,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }));
    halo.position.copy(planet.position);
    halo.scale.set(440, 440, 1);
    sky.add(halo);

    const ringTex = makeRingTexture();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(118, 228, 128, 1),
      new THREE.MeshBasicMaterial({
        map: ringTex,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        toneMapped: false,
      })
    );
    ring.position.copy(planet.position);
    ring.rotation.x = -1.14;
    ring.rotation.y = 0.09;
    ring.rotation.z = 0.18;
    sky.add(ring);

    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(15, 32, 32),
      new THREE.MeshStandardMaterial({ color: 0x8a8f9e, roughness: 1, metalness: 0, fog: false })
    );
    moon.position.set(-260, 170, -340);
    sky.add(moon);

    const nebulaTex = makeNebulaTexture(12);
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: nebulaTex,
        color: i % 2 ? 0x7c5cff : 0x2f9fd0,
        transparent: true,
        opacity: 0.24,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      }));
      const a = i / 5 * TAU + 0.7;
      sp.position.set(Math.cos(a) * 430, 90 + Math.sin(a * 2) * 90, Math.sin(a) * 430);
      sp.scale.set(280 + i * 36, 190 + i * 20, 1);
      sky.add(sp);
    }

    const rockMat = new THREE.MeshStandardMaterial({ color: 0x3b3334, roughness: 1, metalness: 0.05, flatShading: true });
    for (let i = 0; i < 9; i++) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(2 + Math.random() * 7, 0), rockMat);
      const a = Math.random() * TAU;
      const r = 55 + Math.random() * 100;
      rock.position.set(Math.cos(a) * r, -10 + Math.random() * 30, Math.sin(a) * r);
      rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      rock.userData.spin = new THREE.Vector3(Math.random() * 0.05, Math.random() * 0.06, Math.random() * 0.04);
      sky.add(rock);
      this.animated.push({ mesh: rock, type: 'rock' });
    }
    this.sky = sky;
  }

  buildArenaFloor() {
    const floor = meshBox(ARENA_HALF * 2, 1.8, ARENA_HALF * 2, this.materials.floor);
    floor.position.y = -0.9;
    floor.receiveShadow = true;
    this.group.add(floor);

    const trimMat = this.materials.metalDark;
    for (const side of [-1, 1]) {
      const xTrim = meshBox(0.55, 2.2, ARENA_HALF * 2 + 1, this.materials.metalWarm);
      xTrim.position.set(side * (ARENA_HALF + 0.2), -0.4, 0);
      this.group.add(xTrim);
      const zTrim = meshBox(ARENA_HALF * 2 + 1, 2.2, 0.55, this.materials.metalWarm);
      zTrim.position.set(0, -0.4, side * (ARENA_HALF + 0.2));
      this.group.add(zTrim);
    }

    const under = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const beam = meshBox(1.1, 1.1, 60, trimMat);
      beam.position.set(-28 + i * 7, -2.4, 0);
      beam.rotation.y = Math.PI / 2;
      under.add(beam);
    }
    for (let i = 0; i < 7; i++) {
      const beam = meshBox(0.75, 0.75, 70, trimMat);
      beam.position.set(0, -3.6 - (i % 2) * 0.7, -30 + i * 10);
      under.add(beam);
    }
    this.group.add(under);

    const glowRing = new THREE.Mesh(new THREE.RingGeometry(17.2, 17.6, 128), new THREE.MeshBasicMaterial({
      color: 0xd87322,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }));
    glowRing.rotation.x = -Math.PI / 2;
    glowRing.position.y = 0.016;
    this.group.add(glowRing);

    for (let i = 0; i < 4; i++) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 20), new THREE.MeshBasicMaterial({
        color: 0xc86c28,
        transparent: true,
        opacity: 0.24,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }));
      line.rotation.x = -Math.PI / 2;
      line.rotation.z = i * Math.PI / 2;
      line.position.set(Math.sin(i * Math.PI / 2) * 8.28, 0.018, Math.cos(i * Math.PI / 2) * 8.28);
      this.group.add(line);
    }

    const warning = new THREE.Mesh(
      new THREE.PlaneGeometry(6.2, 6.2),
      new THREE.MeshBasicMaterial({ map: this.textures.warning, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    );
    warning.rotation.x = -Math.PI / 2;
    warning.position.set(0, 0.022, 29);
    this.group.add(warning);

    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(11, 5.5),
      new THREE.MeshBasicMaterial({ map: makeDecalTexture('ARENA 09', { sub: 'NO GODS. NO HEROES.', size: 122 }), transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    );
    decal.rotation.x = -Math.PI / 2;
    decal.rotation.z = Math.PI;
    decal.position.set(0, 0.024, -27.5);
    this.group.add(decal);

    const pitDecal = new THREE.Mesh(
      new THREE.PlaneGeometry(5.8, 5.8),
      new THREE.MeshBasicMaterial({ map: this.textures.warning, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    );
    pitDecal.rotation.x = -Math.PI / 2;
    pitDecal.position.set(-23.5, 0.022, 15.5);
    this.group.add(pitDecal);

    for (const [x, z, r] of [[-18, -16, 3.5], [20, 9, 4.4], [10, -28, 3], [-28, -8, 2.6]]) {
      const scorch = new THREE.Mesh(
        new THREE.CircleGeometry(r, 32),
        new THREE.MeshBasicMaterial({ map: this.textures.smoke, transparent: true, opacity: 0.7, depthWrite: false, color: 0x080608, blending: THREE.NormalBlending })
      );
      scorch.rotation.x = -Math.PI / 2;
      scorch.position.set(x, 0.021, z);
      this.group.add(scorch);
    }
  }

  buildWalls() {
    const wallMat = this.materials.metalDark;
    const trim = this.materials.bronze;
    const positions = [
      [0, -ARENA_HALF - 0.8, ARENA_HALF * 2 + 2.2, 0],
      [0, ARENA_HALF + 0.8, ARENA_HALF * 2 + 2.2, 0],
      [-ARENA_HALF - 0.8, 0, ARENA_HALF * 2 + 2.2, Math.PI / 2],
      [ARENA_HALF + 0.8, 0, ARENA_HALF * 2 + 2.2, Math.PI / 2],
    ];
    for (const [x, z, length, rot] of positions) {
      const wall = meshBox(length, 2.15, 1.45, wallMat);
      wall.position.set(x, 1.08, z);
      wall.rotation.y = rot;
      addShadow(wall, true, true);
      this.group.add(wall);

      const cap = meshBox(length, 0.2, 1.85, trim);
      cap.position.set(x, 2.22, z);
      cap.rotation.y = rot;
      this.group.add(cap);

      const inner = meshBox(length, 0.08, 0.08, this.materials.emissiveAmber);
      inner.position.set(x + (rot ? (x > 0 ? -0.76 : 0.76) : 0), 1.55, z + (rot ? 0 : (z > 0 ? -0.76 : 0.76)));
      inner.rotation.y = rot;
      this.group.add(inner);

      const side = rot === 0 ? [1, 0] : [0, 1];
      for (let i = -4; i <= 4; i++) {
        const merlon = meshBox(1.2, 0.7, 1.65, wallMat);
        merlon.position.set(x + side[0] * i * 8.3, 2.56, z + side[1] * i * 8.3);
        merlon.rotation.y = rot;
        addShadow(merlon, true, true);
        this.group.add(merlon);
        const capm = meshBox(1.25, 0.1, 1.7, trim);
        capm.position.copy(merlon.position);
        capm.position.y += 0.36;
        capm.rotation.y = rot;
        this.group.add(capm);
      }
    }

    this.walls.push(
      { minX: -ARENA_HALF - 2, maxX: ARENA_HALF + 2, minZ: -ARENA_HALF - 2, maxZ: -ARENA_HALF + 0.2 },
      { minX: -ARENA_HALF - 2, maxX: ARENA_HALF + 2, minZ: ARENA_HALF - 0.2, maxZ: ARENA_HALF + 2 },
      { minX: -ARENA_HALF - 2, maxX: -ARENA_HALF + 0.2, minZ: -ARENA_HALF - 2, maxZ: ARENA_HALF + 2 },
      { minX: ARENA_HALF - 0.2, maxX: ARENA_HALF + 2, minZ: -ARENA_HALF - 2, maxZ: ARENA_HALF + 2 }
    );

    const towerMat = this.materials.stoneDark;
    const cornerPositions = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    cornerPositions.forEach(([sx, sz], idx) => {
      const tower = new THREE.Group();
      const base = meshBox(8, 2.4, 8, this.materials.stone);
      base.position.y = 1.2;
      addShadow(base, true, true);
      tower.add(base);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 3.5, 18, 8), towerMat);
      shaft.position.y = 11.4;
      addShadow(shaft, true, true);
      tower.add(shaft);
      for (let i = 0; i < 3; i++) {
        const band = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.55, 0.34, 8), this.materials.bronze);
        band.position.y = 5.6 + i * 5;
        tower.add(band);
      }
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 2.9, 2.1, 8), this.materials.bronze);
      crown.position.y = 21.2;
      tower.add(crown);
      const brazier = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 0.6, 1, 12), this.materials.emissiveAmber);
      brazier.position.y = 22.6;
      tower.add(brazier);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.textures.glow,
        color: 0xff7b28,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }));
      glow.position.y = 23;
      glow.scale.set(9, 9, 1);
      tower.add(glow);
      const light = new THREE.PointLight(0xff6f24, 18, 34, 2);
      light.position.y = 22;
      tower.add(light);
      tower.position.set(sx * (ARENA_HALF + 3.4), 0, sz * (ARENA_HALF + 3.4));
      this.group.add(tower);
      this.pulseTargets.push({ light, base: 16, phase: idx * 1.7 });
    });

    const bannerTex = makeBannerTexture(3);
    for (const [x, z, ry] of [[-16, -ARENA_HALF + 0.15, 0], [16, -ARENA_HALF + 0.15, 0], [-ARENA_HALF + 0.15, -13, Math.PI / 2], [ARENA_HALF - 0.15, 13, -Math.PI / 2]]) {
      const banner = new THREE.Mesh(
        new THREE.PlaneGeometry(3.5, 7),
        new THREE.MeshStandardMaterial({ map: bannerTex, transparent: true, alphaTest: 0.12, side: THREE.DoubleSide, roughness: 0.94, metalness: 0, color: 0x9c7368 })
      );
      banner.position.set(x, 6.4, z);
      banner.rotation.y = ry;
      this.group.add(banner);
      const rod = meshBox(4.1, 0.11, 0.11, this.materials.bronze);
      rod.position.set(x, 9.92, z);
      rod.rotation.y = ry + Math.PI / 2;
      this.group.add(rod);
    }

    const gate = new THREE.Group();
    const archGeo = new THREE.TorusGeometry(7.1, 0.38, 8, 30, Math.PI);
    const arch = new THREE.Mesh(archGeo, this.materials.bronze);
    arch.position.set(0, 8.6, -ARENA_HALF + 0.5);
    gate.add(arch);
    const arch2 = new THREE.Mesh(new THREE.TorusGeometry(6.4, 0.12, 6, 30, Math.PI), this.materials.emissiveAmber);
    arch2.position.set(0, 8.6, -ARENA_HALF + 0.43);
    gate.add(arch2);
    for (let i = 0; i < 5; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.3, 5), this.materials.bronze);
      spike.position.set(-5.6 + i * 2.8, 12.9 + Math.sin(i * Math.PI / 4) * 1.1, -ARENA_HALF + 0.45);
      spike.rotation.z = (i - 2) * 0.08;
      gate.add(spike);
    }
    this.group.add(gate);

    const sidePlatforms = [
      { x: -30, z: -25, w: 10, d: 8, h: 3.2 },
      { x: 31, z: 24, w: 8, d: 10, h: 2.7 },
    ];
    for (const p of sidePlatforms) {
      const slab = meshBox(p.w, 0.65, p.d, this.materials.metalDark);
      slab.position.set(p.x, p.h, p.z);
      addShadow(slab, true, true);
      this.group.add(slab);
      const top = meshBox(p.w - 0.3, 0.08, p.d - 0.3, this.materials.metal);
      top.position.set(p.x, p.h + 0.36, p.z);
      this.group.add(top);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const leg = meshBox(0.4, p.h, 0.4, this.materials.metalDark);
          leg.position.set(p.x + sx * (p.w / 2 - 0.5), p.h / 2, p.z + sz * (p.d / 2 - 0.5));
          this.group.add(leg);
        }
      }
      const rail = meshBox(p.w, 0.1, 0.1, this.materials.bronze);
      rail.position.set(p.x, p.h + 1.6, p.z - p.d / 2 + 0.1);
      this.group.add(rail);
      this.platforms.push({ kind: 'box', minX: p.x - p.w / 2, maxX: p.x + p.w / 2, minZ: p.z - p.d / 2, maxZ: p.z + p.d / 2, top: p.h + 0.4 });
    }
  }

  buildCentralDais() {
    const dais = new THREE.Group();
    this.group.add(dais);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(9.7, 10.6, 2, 64), this.materials.metalDark);
    base.position.y = 0.8;
    base.receiveShadow = true;
    base.castShadow = true;
    dais.add(base);

    const sideBand = new THREE.Mesh(new THREE.CylinderGeometry(9.75, 9.75, 0.35, 64, 1, true), this.materials.bronze);
    sideBand.position.y = 1.72;
    dais.add(sideBand);

    const top = new THREE.Mesh(new THREE.CylinderGeometry(9.45, 9.45, 0.2, 64), this.materials.floor);
    top.position.y = 1.92;
    top.receiveShadow = true;
    dais.add(top);

    const trim = new THREE.Mesh(new THREE.RingGeometry(8.85, 9.3, 64), this.materials.gold);
    trim.rotation.x = -Math.PI / 2;
    trim.position.y = 2.04;
    dais.add(trim);

    const outerTrim = new THREE.Mesh(new THREE.TorusGeometry(9.9, 0.14, 8, 64), this.materials.emissiveAmber);
    outerTrim.rotation.x = Math.PI / 2;
    outerTrim.position.y = 1.55;
    dais.add(outerTrim);

    const pit = new THREE.Mesh(new THREE.CircleGeometry(2.9, 64), new THREE.MeshBasicMaterial({ color: 0x150706 }));
    pit.rotation.x = -Math.PI / 2;
    pit.position.y = 2.035;
    dais.add(pit);
    const pitRing = new THREE.Mesh(new THREE.TorusGeometry(3.0, 0.13, 8, 64), this.materials.emissiveRed);
    pitRing.rotation.x = Math.PI / 2;
    pitRing.position.y = 2.04;
    dais.add(pitRing);
    const innerRing = new THREE.Mesh(new THREE.RingGeometry(3.3, 3.55, 64), new THREE.MeshBasicMaterial({ color: 0x7a2215, transparent: true, opacity: 0.65, side: THREE.DoubleSide, toneMapped: false }));
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 2.036;
    dais.add(innerRing);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.35, 2.5, 22, 24, 1, true),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xff5a22) } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: 'uniform float uTime; uniform vec3 uColor; varying vec2 vUv; void main(){ float a=sin(vUv.y*14.0-uTime*2.8)*0.5+0.5; float b=sin(vUv.x*31.0+uTime*1.7)*0.5+0.5; float fade=pow(1.0-vUv.y,1.6); gl_FragColor=vec4(uColor,(0.06+a*0.08+b*0.025)*fade); }',
      })
    );
    beam.position.y = 13.1;
    dais.add(beam);
    this.portalBeam = beam;

    const core = new THREE.Group();
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 1), new THREE.MeshStandardMaterial({ color: 0xff9d40, emissive: 0xff4a12, emissiveIntensity: 7, roughness: 0.2, metalness: 0.4 }));
    core.add(orb);
    const ringA = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.055, 8, 64), this.materials.emissiveAmber);
    ringA.rotation.x = Math.PI / 2;
    core.add(ringA);
    const ringB = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.035, 8, 48), this.materials.emissivePale);
    ringB.rotation.y = Math.PI / 2;
    core.add(ringB);
    core.position.y = 5.4;
    dais.add(core);
    this.core = core;
    this.portal = core;
    const light = new THREE.PointLight(0xff6d24, 95, 38, 2);
    light.position.y = 5.2;
    dais.add(light);
    this.portalLight = light;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.textures.glow,
      color: 0xff7a32,
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }));
    sprite.position.y = 5.4;
    sprite.scale.set(6, 6, 1);
    dais.add(sprite);
    this.centralGlow = sprite;

    const ramps = [
      { dir: 'north', x: 0, z: 12.0, width: 4.8, run: 8, rise: 1.8 },
      { dir: 'south', x: 0, z: -12.0, width: 4.8, run: 8, rise: 1.8 },
      { dir: 'east', x: 12.0, z: 0, width: 4.8, run: 8, rise: 1.8 },
      { dir: 'west', x: -12.0, z: 0, width: 4.8, run: 8, rise: 1.8 },
    ];
    for (const r of ramps) {
      const angle = Math.atan2(r.rise, r.run);
      const length = Math.hypot(r.rise, r.run);
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(r.width, 0.42, length + 0.2), this.materials.metal);
      ramp.position.set(r.x, r.rise / 2 + 0.02, r.z);
      if (r.dir === 'north') ramp.rotation.x = -angle;
      if (r.dir === 'south') ramp.rotation.x = angle;
      if (r.dir === 'east') { ramp.rotation.x = 0; ramp.rotation.z = angle; ramp.rotation.y = Math.PI / 2; }
      if (r.dir === 'west') { ramp.rotation.x = 0; ramp.rotation.z = -angle; ramp.rotation.y = Math.PI / 2; }
      addShadow(ramp, true, true);
      this.group.add(ramp);

      const stepEdge = meshBox(r.width, 0.1, 0.24, this.materials.emissiveAmber);
      if (r.dir === 'north') stepEdge.position.set(r.x, 0.06, r.z + r.run / 2);
      if (r.dir === 'south') stepEdge.position.set(r.x, 0.06, r.z - r.run / 2);
      if (r.dir === 'east') { stepEdge.position.set(r.x + r.run / 2, 0.06, r.z); stepEdge.rotation.y = Math.PI / 2; }
      if (r.dir === 'west') { stepEdge.position.set(r.x - r.run / 2, 0.06, r.z); stepEdge.rotation.y = Math.PI / 2; }
      this.group.add(stepEdge);

      const footprint = r.dir === 'north' || r.dir === 'south'
        ? { minX: r.x - r.width / 2, maxX: r.x + r.width / 2, minZ: r.z - r.run / 2, maxZ: r.z + r.run / 2 }
        : { minX: r.x - r.run / 2, maxX: r.x + r.run / 2, minZ: r.z - r.width / 2, maxZ: r.z + r.width / 2 };
      this.ramps.push({ ...footprint, dir: r.dir, rise: r.rise, run: r.run });
    }
    this.dais = { radius: 9.55, top: 1.96 };
  }

  buildPillars() {
    const angles = [0.52, 2.1, 3.67, 5.24];
    angles.forEach((a, idx) => {
      const x = Math.cos(a) * 25.5;
      const z = Math.sin(a) * 25.5;
      const g = new THREE.Group();
      const base = meshBox(3.4, 1.0, 3.4, this.materials.stone);
      base.position.y = 0.5;
      addShadow(base, true, true);
      g.add(base);
      const plinth = meshBox(2.65, 0.5, 2.65, this.materials.bronze);
      plinth.position.y = 1.22;
      g.add(plinth);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.35, 10.3, 8), this.materials.stone);
      shaft.position.y = 6.5;
      addShadow(shaft, true, true);
      g.add(shaft);
      for (let i = 0; i < 4; i++) {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.41, 1.44, 0.25, 8), i === 2 ? this.materials.emissiveAmber : this.materials.bronze);
        ring.position.y = 3 + i * 2.6;
        g.add(ring);
      }
      const capital = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 1.25, 1.4, 8), this.materials.bronze);
      capital.position.y = 12.3;
      g.add(capital);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(1.8, 2.1, 4), this.materials.stoneDark);
      crown.position.y = 14.0;
      crown.rotation.y = Math.PI / 4;
      g.add(crown);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.6, 2.4, 8), this.materials.emissiveAmber);
      flame.position.y = 15.7;
      g.add(flame);
      const alph = 0.35 + idx * 0.4;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.textures.glow,
        color: 0xff8c32,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }));
      sp.position.y = 15.7;
      sp.scale.set(5, 55, 1);
      sp.material.rotation = alph;
      g.add(sp);
      g.position.set(x, 0, z);
      g.rotation.y = -a;
      this.group.add(g);
      this.circleColliders.push({ x, z, r: 1.6 });
    });

    for (const [x, z, angle] of [[-23.5, -6, 0.28], [23.5, 6, 0.28], [-6, 23.5, -1.2], [6, -23.5, 1.2]]) {
      const relic = new THREE.Group();
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.45, 2.3, 5), this.materials.bronze);
      spike.position.y = 1.15;
      relic.add(spike);
      const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), this.materials.emissiveCyan);
      orb.position.y = 2.7;
      relic.add(orb);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.035, 6, 36), this.materials.emissiveCyan);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 2.7;
      relic.add(ring);
      relic.position.set(x, 0, z);
      relic.rotation.y = angle;
      this.group.add(relic);
      this.circleColliders.push({ x, z, r: 0.85 });
      this.animated.push({ mesh: relic, type: 'relic', ring, orb, phase: Math.random() * 10 });
    }
  }

  buildProps() {
    const crates = [
      { x: 16.8, z: 7.2, w: 3.4, h: 1.55, d: 3.1, ry: 0.28 },
      { x: -14.2, z: 18.7, w: 4.2, h: 1.9, d: 2.8, ry: -0.15 },
      { x: 20.4, z: -13.3, w: 3.1, h: 1.4, d: 4.1, ry: 0.11 },
      { x: -22.2, z: -9.1, w: 4.3, h: 1.25, d: 2.6, ry: -0.3 },
      { x: 5.4, z: -22.8, w: 2.8, h: 1.75, d: 3.2, ry: 0.2 },
      { x: -6.3, z: 24.4, w: 3.2, h: 1.3, d: 2.9, ry: -0.08 },
    ];
    for (const c of crates) {
      const group = new THREE.Group();
      const box = meshBox(c.w, c.h, c.d, this.materials.metalDark);
      box.position.y = c.h / 2;
      addShadow(box, true, true);
      group.add(box);
      const lid = meshBox(c.w + 0.06, 0.12, c.d + 0.06, this.materials.metalWarm);
      lid.position.y = c.h;
      group.add(lid);
      const band = meshBox(c.w + 0.03, 0.26, c.d + 0.03, this.materials.hazard);
      band.position.y = 0.22;
      group.add(band);
      const strip = meshBox(0.08, c.h * 0.55, 0.05, this.materials.emissiveAmber);
      strip.position.set(c.w / 2 - 0.1, c.h * 0.45, c.d / 2 + 0.02);
      group.add(strip);
      group.position.set(c.x, 0, c.z);
      group.rotation.y = c.ry;
      this.group.add(group);
      const wx = Math.abs(Math.cos(c.ry)) * c.w / 2 + Math.abs(Math.sin(c.ry)) * c.d / 2;
      const wz = Math.abs(Math.sin(c.ry)) * c.w / 2 + Math.abs(Math.cos(c.ry)) * c.d / 2;
      this.platforms.push({ kind: 'box', minX: c.x - wx, maxX: c.x + wx, minZ: c.z - wz, maxZ: c.z + wz, top: c.h });
    }

    const pillarCover = [
      { x: 0, z: 12.5, w: 2.6, d: 2.6, h: 6.4, ry: 0 },
      { x: 0, z: -12.5, w: 2.6, d: 2.6, h: 6.4, ry: 0 },
      { x: 12.5, z: 0, w: 2.6, d: 2.6, h: 6.4, ry: 0 },
      { x: -12.5, z: 0, w: 2.6, d: 2.6, h: 6.4, ry: 0 },
    ];
    for (const p of pillarCover) {
      const shaft = meshBox(p.w, p.h, p.d, this.materials.stoneDark);
      shaft.position.set(p.x, p.h / 2, p.z);
      addShadow(shaft, true, true);
      this.group.add(shaft);
      const cap = meshBox(p.w + 0.4, 0.3, p.d + 0.4, this.materials.bronze);
      cap.position.set(p.x, p.h - 0.15, p.z);
      this.group.add(cap);
      const glow = meshBox(p.w * 0.6, 0.08, 0.08, this.materials.emissiveAmber);
      glow.position.set(p.x, p.h * 0.55, p.z + p.d / 2 + 0.02);
      this.group.add(glow);
      this.circleColliders.push({ x: p.x, z: p.z, r: 1.55 });
    }

    for (const [x, z] of [[0, 23.5], [23.5, 0], [0, -23.5], [-23.5, 0]]) {
      const pad = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.2, 0.25, 32), this.materials.metalDark);
      base.position.y = 0.13;
      pad.add(base);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.65, 0.1, 8, 32), this.materials.emissiveAmber);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.28;
      pad.add(ring);
      const core = new THREE.Mesh(new THREE.CircleGeometry(1.35, 32), new THREE.MeshBasicMaterial({ color: 0xff7728, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      core.rotation.x = -Math.PI / 2;
      core.position.y = 0.265;
      pad.add(core);
      for (let i = 0; i < 4; i++) {
        const fin = meshBox(0.18, 0.7, 0.65, this.materials.bronze);
        fin.position.set(Math.cos(i * Math.PI / 2 + 0.78) * 1.75, 0.42, Math.sin(i * Math.PI / 2 + 0.78) * 1.75);
        fin.rotation.y = -i * Math.PI / 2 - 0.78;
        pad.add(fin);
      }
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.textures.glow, color: 0xff6e20, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      glow.position.y = 0.55;
      glow.scale.set(5, 5, 1);
      pad.add(glow);
      pad.position.set(x, 0, z);
      this.group.add(pad);
      this.jumpPads = this.jumpPads || [];
      this.jumpPads.push({ mesh: pad, x, z, radius: 2.0, cooldown: 0 });
    }

    const chainMat = this.materials.metalDark;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 7; i++) {
        const link = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.09, 5, 10), chainMat);
        link.position.set(side * 18 + Math.sin(i * 1.9) * 0.2, 17.5 - i * 0.82, -30 + (i % 2) * 0.18);
        link.rotation.y = i % 2 ? Math.PI / 2 : 0;
        this.group.add(link);
      }
    }

    const spikes = [[-33, -33], [33, -33], [-33, 33], [33, 33]];
    for (const [x, z] of spikes) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.2, 4), this.materials.stoneDark);
      spike.position.set(x, 2.1, z);
      spike.rotation.y = Math.PI / 4;
      this.group.add(spike);
    }
  }

  buildPickups() {
    this.addPickup('health', 25, 24, 0, 25);
    this.addPickup('health', -25, -24, 0, 25);
    this.addPickup('armor', 26, -7, 0, 30);
    this.addPickup('armor', -26, 7, 0, 30);
    this.addPickup('ammo', 13.8, 10.4, 1.7, 40);
    this.addPickup('ammo', -12.1, -20.5, 1.4, 40);
    this.addPickup('ammo', 22.8, 14.2, 0, 40);
    this.addPickup('mega', 0, 0, 2.1, 60);
  }

  addPickup(type, x, y, z, respawn) {
    const group = new THREE.Group();
    const isMega = type === 'mega';
    const color = type === 'health' ? 0xff5f45 : type === 'armor' ? 0x5cd8ff : type === 'mega' ? 0xffc15c : 0xffa42e;
    const glowMat = new THREE.SpriteMaterial({ map: this.textures.glow, color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 3.2, metalness: 0.3, roughness: 0.2, toneMapped: false });

    let symbol;
    if (type === 'health' || type === 'mega') {
      const box1 = meshBox(Boolean(isMega) ? 0.34 : 0.28, isMega ? 1.1 : 0.82, 0.18, mat);
      const box2 = meshBox(isMega ? 1.1 : 0.82, isMega ? 0.34 : 0.28, 0.18, mat);
      symbol = new THREE.Group();
      symbol.add(box1, box2);
    } else if (type === 'armor') {
      symbol = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), mat);
      symbol.scale.set(0.85, 1.2, 0.4);
    } else {
      symbol = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.55, 0.55), mat);
      const stripe = meshBox(0.9, 0.1, 0.58, this.materials.emissivePale);
      symbol.add(stripe);
    }
    group.add(symbol);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(isMega ? 1.3 : 0.86, 0.035, 6, 38), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    const glow = new THREE.Sprite(glowMat);
    glow.scale.set(isMega ? 4.8 : 3.2, isMega ? 4.8 : 3.2, 1);
    group.add(glow);
    group.position.set(x, y + 1.15, z);
    this.group.add(group);
    this.pickups.push({ type, mesh: group, symbol, ring, baseY: y + 1.15, x, z, respawn, active: true, timer: 0, phase: Math.random() * 10 });
  }

  buildAtmosphere() {
    const dustGeo = new THREE.BufferGeometry();
    const count = 650;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = Math.random() * 38;
      const a = Math.random() * TAU;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = Math.random() * 18;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dustMat = new THREE.PointsMaterial({
      map: this.textures.spark,
      color: 0xffb77a,
      size: 0.16,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      toneMapped: false,
    });
    this.dust = new THREE.Points(dustGeo, dustMat);
    this.dust.frustumCulled = false;
    this.group.add(this.dust);

    const mistMat = new THREE.SpriteMaterial({ map: this.textures.smoke, color: 0x612d1c, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    for (let i = 0; i < 12; i++) {
      const mist = new THREE.Sprite(mistMat.clone());
      mist.position.set((Math.random() - 0.5) * 58, 0.7 + Math.random() * 2, (Math.random() - 0.5) * 58);
      mist.scale.set(12 + Math.random() * 22, 4 + Math.random() * 6, 1);
      mist.material.rotation = Math.random() * TAU;
      this.group.add(mist);
      this.animated.push({ mesh: mist, type: 'mist', baseY: mist.position.y, phase: Math.random() * 10 });
    }

    const lightShaftMat = new THREE.MeshBasicMaterial({ color: 0x8b9fff, transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < 3; i++) {
      const shaft = new THREE.Mesh(new THREE.ConeGeometry(8 + i * 3, 28, 32, 1, true), lightShaftMat);
      shaft.position.set(-20 + i * 20, 16, -18 + i * 14);
      shaft.rotation.z = 0.14 * (i - 1);
      this.group.add(shaft);
    }
  }

  floorHeightAt(x, z, feet, step = 0.58) {
    let h = 0;
    const inside = Math.abs(x) < ARENA_HALF - 0.4 && Math.abs(z) < ARENA_HALF - 0.4;
    if (!inside) return -99;

    if (x * x + z * z < this.dais.radius * this.dais.radius && this.dais.top <= feet + step + 0.45) {
      h = Math.max(h, this.dais.top);
    }

    for (const p of this.platforms) {
      if (x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ && p.top <= feet + step) {
        h = Math.max(h, p.top);
      }
    }

    for (const r of this.ramps) {
      if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) {
        let t;
        if (r.dir === 'north') t = (r.maxZ - z) / r.run;
        else if (r.dir === 'south') t = (z - r.minZ) / r.run;
        else if (r.dir === 'east') t = (r.maxX - x) / r.run;
        else t = (x - r.minX) / r.run;
        const top = Math.max(0, Math.min(1, t)) * r.rise;
        if (top <= feet + step) h = Math.max(h, top);
      }
    }
    return h;
  }

  collisionBlocked(x, z, feet, radius = 0.38) {
    if (Math.abs(x) > ARENA_HALF - radius - 0.1 || Math.abs(z) > ARENA_HALF - radius - 0.1) return true;
    for (const c of this.circleColliders) {
      const dx = x - c.x;
      const dz = z - c.z;
      if (dx * dx + dz * dz < (c.r + radius) * (c.r + radius)) return true;
    }
    for (const p of this.platforms) {
      if (x > p.minX - radius && x < p.maxX + radius && z > p.minZ - radius && z < p.maxZ + radius) {
        if (p.top > feet + 0.58 && p.top < feet + 1.72) return true;
      }
    }
    const daisTop = this.dais.top;
    if (x * x + z * z < this.dais.radius * this.dais.radius && daisTop > feet + 0.58) {
      const nearRamp = this.ramps.some(r => x > r.minX - 0.6 && x < r.maxX + 0.6 && z > r.minZ - 0.6 && z < r.maxZ + 0.6);
      if (!nearRamp) return true;
    }
    return false;
  }

  jumpPadAt(x, z) {
    for (const p of this.jumpPads || []) {
      const dx = x - p.x;
      const dz = z - p.z;
      if (dx * dx + dz * dz < p.radius * p.radius) return p;
    }
    return null;
  }

  update(dt, time) {
    this.time = time;
    if (this.portalBeam) this.portalBeam.material.uniforms.uTime.value = time;
    if (this.core) {
      this.core.rotation.y = time * 0.5;
      this.core.rotation.x = Math.sin(time * 0.4) * 0.15;
      this.core.position.y = 5.4 + Math.sin(time * 1.1) * 0.22;
    }
    if (this.portalLight) this.portalLight.intensity = 86 + Math.sin(time * 2.3) * 16 + Math.sin(time * 7.1) * 5;
    if (this.centralGlow) {
      const s = 6 + Math.sin(time * 1.7) * 0.55;
      this.centralGlow.scale.set(s, s, 1);
    }
    if (this.starField) this.starField.rotation.y = time * 0.002;
    for (const p of this.pulseTargets) {
      p.light.intensity = p.base + Math.sin(time * 2 + p.phase) * p.base * 0.25;
    }
    if (this.dust) {
      const pos = this.dust.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) + dt * (0.12 + (i % 7) * 0.025);
        if (y > 19) y = 0.2;
        pos.setY(i, y);
        pos.setX(i, pos.getX(i) + Math.sin(time * 0.2 + i) * dt * 0.06);
      }
      pos.needsUpdate = true;
    }
    for (const a of this.animated) {
      if (a.type === 'rock') {
        a.mesh.rotation.x += a.mesh.userData.spin.x * dt;
        a.mesh.rotation.y += a.mesh.userData.spin.y * dt;
        a.mesh.rotation.z += a.mesh.userData.spin.z * dt;
      } else if (a.type === 'mist') {
        a.mesh.position.y = a.baseY + Math.sin(time * 0.3 + a.phase) * 0.5;
        a.mesh.material.opacity = 0.16 + Math.sin(time * 0.22 + a.phase) * 0.08;
      } else if (a.type === 'relic') {
        a.mesh.rotation.y += dt * 0.35;
        a.ring.rotation.z += dt * 0.9;
        a.orb.position.y = 2.7 + Math.sin(time * 1.4 + a.phase) * 0.18;
      }
    }
    for (const p of this.pickups) {
      if (!p.active) {
        p.timer -= dt;
        if (p.timer <= 0) {
          p.active = true;
          p.mesh.visible = true;
        }
        continue;
      }
      p.symbol.rotation.y = time * 1.2;
      p.symbol.position.y = Math.sin(time * 2 + p.phase) * 0.16;
      p.ring.rotation.z = time * 0.7 + p.phase;
    }
  }

  takePickup(pickup) {
    pickup.active = false;
    pickup.mesh.visible = false;
    pickup.timer = pickup.respawn;
  }

  findSpawn(minDistanceFrom, playerPos) {
    const options = this.spawnPoints.filter(p => !playerPos || p.distanceTo(playerPos) > (minDistanceFrom || 0));
    const list = options.length ? options : this.spawnPoints;
    return list[Math.floor(Math.random() * list.length)].clone();
  }
}
