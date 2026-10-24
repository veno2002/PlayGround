import * as THREE from 'three';

const TAU = Math.PI * 2;

function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(size, height = size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = height;
  return c;
}

function toTexture(c, { srgb = true, repeat = null, aniso = 8 } = {}) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = Math.min(aniso, 8);
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  tex.needsUpdate = true;
  return tex;
}

function grime(ctx, w, h, rand, count, alpha = 0.16) {
  for (let i = 0; i < count; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = (0.5 + rand() * 4) * (w / 512);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(12,10,8,${alpha * rand()})`);
    g.addColorStop(1, 'rgba(12,10,8,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function scratches(ctx, w, h, rand, count) {
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const len = 4 + rand() * 46;
    const a = rand() * TAU;
    ctx.strokeStyle = `rgba(${190 + rand() * 50 | 0},${175 + rand() * 50 | 0},${150 + rand() * 40 | 0},${0.025 + rand() * 0.09})`;
    ctx.lineWidth = 0.4 + rand() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
}

export function makeFloorTextures() {
  const S = 1024;
  const rand = rng(99);
  const c = canvas(S);
  const ctx = c.getContext('2d');
  const rough = canvas(512);
  const rctx = rough.getContext('2d');
  const emissive = canvas(512);
  const ectx = emissive.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, S, S);
  bg.addColorStop(0, '#252227');
  bg.addColorStop(0.45, '#161418');
  bg.addColorStop(1, '#211c1b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, S, S);
  rctx.fillStyle = '#a8a8a8';
  rctx.fillRect(0, 0, 512, 512);
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, 512, 512);

  const cols = 4;
  const rows = 4;
  const cell = S / cols;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const pad = 3;
      const tone = 31 + Math.floor(rand() * 14);
      ctx.fillStyle = `rgb(${tone + 5},${tone},${tone - 3})`;
      ctx.fillRect(x * cell + pad, y * cell + pad, cell - pad * 2, cell - pad * 2);
      const grad = ctx.createLinearGradient(x * cell, y * cell, (x + 1) * cell, (y + 1) * cell);
      grad.addColorStop(0, `rgba(255,225,190,${0.03 + rand() * 0.04})`);
      grad.addColorStop(0.5, 'rgba(255,255,255,0)');
      grad.addColorStop(1, `rgba(0,0,0,${0.09 + rand() * 0.07})`);
      ctx.fillStyle = grad;
      ctx.fillRect(x * cell + pad, y * cell + pad, cell - pad * 2, cell - pad * 2);

      ctx.strokeStyle = 'rgba(4,4,6,.84)';
      ctx.lineWidth = 5;
      ctx.strokeRect(x * cell + pad, y * cell + pad, cell - pad * 2, cell - pad * 2);
      ctx.strokeStyle = 'rgba(255,208,156,.055)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x * cell + pad + 4, y * cell + pad + 4, cell - pad * 2 - 8, cell - pad * 2 - 8);

      rctx.fillStyle = `rgb(${130 + rand() * 35 | 0},${130 + rand() * 35 | 0},${130 + rand() * 35 | 0})`;
      rctx.fillRect(x * cell / 2, y * cell / 2, cell / 2, cell / 2);

      if ((x + y) % 3 === 0) {
        ectx.strokeStyle = 'rgba(166,77,25,.7)';
        ectx.lineWidth = 3;
        ectx.strokeRect(x * cell / 2 + 6, y * cell / 2 + 6, cell / 2 - 12, cell / 2 - 12);
      }

      for (let i = 0; i < 4; i++) {
        const rx = x * cell + pad + 10 + rand() * (cell - pad * 2 - 20);
        const ry = y * cell + pad + 10 + rand() * (cell - pad * 2 - 20);
        ctx.fillStyle = 'rgba(120,105,88,.32)';
        ctx.beginPath();
        ctx.arc(rx, ry, 2.1, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.55)';
        ctx.beginPath();
        ctx.arc(rx + 1, ry + 1, 1.4, 0, TAU);
        ctx.fill();
      }
    }
  }

  grime(ctx, S, S, rand, 220, 0.28);
  scratches(ctx, S, S, rand, 380);

  for (let i = 0; i < 9; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 35 + rand() * 130;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${70 + rand() * 35 | 0},37,16,${0.1 + rand() * 0.12})`);
    g.addColorStop(1, 'rgba(40,20,8,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  ctx.save();
  ctx.translate(S * 0.5, S * 0.5);
  ctx.rotate(Math.PI / 4);
  ctx.strokeStyle = 'rgba(255,127,40,.11)';
  ctx.lineWidth = 7;
  ctx.strokeRect(-330, -330, 660, 660);
  ctx.strokeStyle = 'rgba(255,190,90,.06)';
  ctx.lineWidth = 2;
  ctx.strokeRect(-304, -304, 608, 608);
  ctx.restore();

  const map = toTexture(c, { repeat: [5, 5] });
  const roughnessMap = toTexture(rough, { srgb: false, repeat: [5, 5] });
  const emissiveMap = toTexture(emissive, { repeat: [5, 5] });

  return { map, roughnessMap, emissiveMap };
}

export function makeMetalTexture(seed = 4, base = [58, 52, 50]) {
  const S = 512;
  const rand = rng(seed);
  const c = canvas(S);
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, S, S);
  grad.addColorStop(0, `rgb(${base[0] + 12},${base[1] + 10},${base[2] + 8})`);
  grad.addColorStop(0.5, `rgb(${base[0]},${base[1]},${base[2]})`);
  grad.addColorStop(1, `rgb(${base[0] - 8},${base[1] - 9},${base[2] - 7})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);

  for (let i = 0; i < 45; i++) {
    const y = rand() * S;
    ctx.strokeStyle = `rgba(${rand() > .5 ? 255 : 0},${rand() > .5 ? 230 : 0},${rand() > .5 ? 200 : 0},${rand() * .035})`;
    ctx.lineWidth = 0.5 + rand() * 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(S, y + (rand() - .5) * 14);
    ctx.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const x = (i + 0.5) * S / 6;
    ctx.strokeStyle = 'rgba(0,0,0,.34)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, S);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,225,180,.045)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 4, 0);
    ctx.lineTo(x + 4, S);
    ctx.stroke();
  }
  grime(ctx, S, S, rand, 110, 0.32);
  scratches(ctx, S, S, rand, 160);

  return toTexture(c, { repeat: [2, 2] });
}

export function makeStoneTexture(seed = 7) {
  const S = 512;
  const rand = rng(seed);
  const c = canvas(S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2a292b';
  ctx.fillRect(0, 0, S, S);
  const rows = 8;
  for (let y = 0; y < rows; y++) {
    const h = S / rows;
    const offset = (y % 2) * 0.5;
    for (let x = -1; x < 5; x++) {
      const w = S / 4;
      const bx = (x + offset) * w + 2;
      const by = y * h + 2;
      const t = 39 + rand() * 18;
      ctx.fillStyle = `rgb(${t + 4},${t + 1},${t - 2})`;
      ctx.fillRect(bx, by, w - 4, h - 4);
      ctx.strokeStyle = 'rgba(0,0,0,.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, w - 4, h - 4);
      ctx.fillStyle = 'rgba(255,230,200,.035)';
      ctx.fillRect(bx + 3, by + 3, w - 10, 2);
    }
  }
  grime(ctx, S, S, rand, 180, 0.4);
  scratches(ctx, S, S, rand, 100);
  return toTexture(c, { repeat: [2, 2] });
}

export function makeHazardTexture() {
  const S = 256;
  const c = canvas(S, S / 4);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, S, S / 4);
  ctx.fillStyle = '#d88b1e';
  for (let x = -S; x < S * 2; x += 44) {
    ctx.save();
    ctx.translate(x, 0);
    ctx.rotate(-0.4);
    ctx.fillRect(0, -30, 22, S);
    ctx.restore();
  }
  return toTexture(c, { repeat: [3, 1] });
}

export function makeGlowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,120,20,0)') {
  const S = 256;
  const c = canvas(S);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.18, 'rgba(255,240,200,.7)');
  g.addColorStop(0.45, 'rgba(255,150,50,.22)');
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return toTexture(c);
}

export function makeSparkTexture() {
  const S = 128;
  const c = canvas(S);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(.16, 'rgba(255,240,190,.95)');
  g.addColorStop(.4, 'rgba(255,140,45,.3)');
  g.addColorStop(1, 'rgba(255,90,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(255,255,255,.75)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(S / 2, 8); ctx.lineTo(S / 2, S - 8);
  ctx.moveTo(8, S / 2); ctx.lineTo(S - 8, S / 2);
  ctx.stroke();
  return toTexture(c);
}

export function makeSmokeTexture() {
  const S = 256;
  const c = canvas(S);
  const ctx = c.getContext('2d');
  const rand = rng(33);
  for (let i = 0; i < 16; i++) {
    const x = S / 2 + (rand() - .5) * 65;
    const y = S / 2 + (rand() - .5) * 65;
    const r = 25 + rand() * 70;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(60,53,48,${.07 + rand() * .13})`);
    g.addColorStop(1, 'rgba(22,19,18,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }
  return toTexture(c);
}

export function makeStarTexture() {
  const S = 64;
  const c = canvas(S);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(.2, 'rgba(210,225,255,.8)');
  g.addColorStop(.55, 'rgba(130,150,255,.15)');
  g.addColorStop(1, 'rgba(80,100,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return toTexture(c);
}

export function makeNebulaTexture(seed = 12) {
  const S = 512;
  const rand = rng(seed);
  const c = canvas(S);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'lighter';
  const palette = seed % 2 ? ['80,60,180', '160,60,110', '50,120,160'] : ['50,80,170', '130,60,160', '160,90,70'];
  for (let i = 0; i < 38; i++) {
    const x = S / 2 + (rand() - .5) * S * .74;
    const y = S / 2 + (rand() - .5) * S * .65;
    const r = 25 + rand() * 150;
    const col = palette[Math.floor(rand() * palette.length)];
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${col},${.018 + rand() * .05})`);
    g.addColorStop(.45, `rgba(${col},${.008 + rand() * .022})`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return toTexture(c);
}

export function makePlanetTexture() {
  const W = 1024;
  const H = 512;
  const rand = rng(41);
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const bands = ['#1d2439', '#2f405f', '#3b3a57', '#5b4a5d', '#6b5347', '#353c54', '#20293e', '#4a3c47'];
  let y = 0;
  while (y < H) {
    const h = 14 + rand() * 46;
    ctx.fillStyle = bands[Math.floor(rand() * bands.length)];
    ctx.fillRect(0, y, W, h + 2);
    y += h;
  }
  for (let i = 0; i < 140; i++) {
    const x = rand() * W;
    const yy = rand() * H;
    const w = 40 + rand() * 260;
    const h = 3 + rand() * 17;
    const g = ctx.createLinearGradient(x, yy, x + w, yy);
    g.addColorStop(0, 'rgba(255,230,200,0)');
    g.addColorStop(.5, `rgba(${200 + rand() * 55 | 0},${175 + rand() * 50 | 0},${160 + rand() * 50 | 0},${.03 + rand() * .1})`);
    g.addColorStop(1, 'rgba(255,230,200,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, yy, w / 2, h / 2, 0, 0, TAU);
    ctx.fill();
  }
  for (let i = 0; i < 8; i++) {
    const x = rand() * W;
    const yy = rand() * H;
    const r = 20 + rand() * 70;
    const g = ctx.createRadialGradient(x, yy, 0, x, yy, r);
    g.addColorStop(0, `rgba(190,130,95,${.18 + rand() * .23})`);
    g.addColorStop(.5, `rgba(120,70,60,${.1 + rand() * .12})`);
    g.addColorStop(1, 'rgba(90,50,50,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, yy, r * 1.5, r * .7, (rand() - .5) * .3, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(5,8,18,.26)';
  ctx.fillRect(0, 0, W, 34);
  ctx.fillRect(0, H - 30, W, 30);
  return toTexture(c);
}

export function makeRingTexture() {
  const W = 1024;
  const H = 64;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const rand = rng(18);
  for (let x = 0; x < W; x++) {
    const center = Math.abs((x / W) - .5) * 2;
    const a = Math.max(0, 1 - center * 1.12);
    const bands = .45 + .55 * Math.sin(x * .15) * Math.sin(x * .037 + 2);
    const alpha = a * (0.2 + bands * .34 + rand() * .08);
    const shade = 110 + rand() * 100;
    ctx.fillStyle = `rgba(${shade + 30},${shade + 12},${shade - 10},${alpha})`;
    ctx.fillRect(x, 0, 1, H);
  }
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,.85)');
  g.addColorStop(.5, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,.85)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  return toTexture(c);
}

export function makeBannerTexture(seed = 3) {
  const W = 384;
  const H = 768;
  const rand = rng(seed);
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  ctx.beginPath();
  ctx.moveTo(24, 0);
  ctx.lineTo(W - 24, 0);
  ctx.lineTo(W - 40, H - 80);
  ctx.lineTo(W / 2 + 44, H - 14);
  ctx.lineTo(W / 2, H - 4);
  ctx.lineTo(W / 2 - 44, H - 14);
  ctx.lineTo(40, H - 80);
  ctx.closePath();
  const cloth = ctx.createLinearGradient(0, 0, W, 0);
  cloth.addColorStop(0, '#251113');
  cloth.addColorStop(.25, '#5a1c1c');
  cloth.addColorStop(.5, '#7b2a22');
  cloth.addColorStop(.75, '#431619');
  cloth.addColorStop(1, '#1d0d10');
  ctx.fillStyle = cloth;
  ctx.fill();
  ctx.clip();

  for (let i = 0; i < 35; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const r = 15 + rand() * 80;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(20,8,8,${rand() * .12})`);
    g.addColorStop(1, 'rgba(20,8,8,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  ctx.strokeStyle = 'rgba(230,184,116,.58)';
  ctx.lineWidth = 5;
  ctx.strokeRect(20, 22, W - 40, H - 130);
  ctx.lineWidth = 1;
  ctx.strokeRect(31, 34, W - 62, H - 154);
  ctx.strokeStyle = 'rgba(230,184,116,.22)';
  for (let y = 55; y < H - 120; y += 18) {
    ctx.beginPath(); ctx.moveTo(34, y); ctx.lineTo(54, y + 9); ctx.lineTo(34, y + 18); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W - 34, y); ctx.lineTo(W - 54, y + 9); ctx.lineTo(W - 34, y + 18); ctx.stroke();
  }

  ctx.save();
  ctx.translate(W / 2, H * .42);
  ctx.fillStyle = 'rgba(236,195,130,.85)';
  ctx.strokeStyle = 'rgba(40,12,10,.8)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU - Math.PI / 2;
    const r = i % 2 ? 75 : 90;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(74,20,16,.95)';
  ctx.beginPath();
  ctx.arc(0, 0, 55, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(236,195,130,.6)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = 'rgba(236,195,130,.86)';
  ctx.beginPath();
  ctx.moveTo(0, -34);
  ctx.lineTo(22, -5);
  ctx.lineTo(9, -5);
  ctx.lineTo(9, 29);
  ctx.lineTo(-9, 29);
  ctx.lineTo(-9, -5);
  ctx.lineTo(-22, -5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = 'rgba(233,194,132,.78)';
  ctx.font = '700 34px Orbitron, sans-serif';
  ctx.textAlign = 'center';
  ctx.letterSpacing = '8px';
  ctx.fillText('REL I QUARY', W / 2, H - 185);
  ctx.font = '700 16px Orbitron, sans-serif';
  ctx.fillStyle = 'rgba(233,194,132,.42)';
  ctx.letterSpacing = '4px';
  ctx.fillText('SECTOR 09', W / 2, H - 155);
  ctx.letterSpacing = '0px';

  return toTexture(c, { aniso: 4 });
}

export function makeDecalTexture(text, { color = '#e9c48b', sub = '', size = 280 } = {}) {
  const W = 512;
  const H = 256;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.font = `900 ${size}px Orbitron, sans-serif`;
  ctx.letterSpacing = '4px';
  ctx.fillText(text, W / 2, H / 2 + size * .28);
  if (sub) {
    ctx.font = '700 28px Orbitron, sans-serif';
    ctx.fillStyle = 'rgba(233,196,139,.55)';
    ctx.fillText(sub, W / 2, H / 2 + size * .5);
  }
  return toTexture(c);
}

export function makeWarningDecal() {
  const S = 512;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  ctx.translate(S / 2, S / 2);
  ctx.strokeStyle = 'rgba(221,102,33,.65)';
  ctx.fillStyle = 'rgba(221,102,33,.08)';
  ctx.lineWidth = 9;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * TAU - Math.PI / 2;
    const b = (i + 1) / 3 * TAU - Math.PI / 2;
    const c2 = (i + 1.5) / 3 * TAU - Math.PI / 2;
    ctx.moveTo(Math.cos(a) * 180, Math.sin(a) * 180);
    ctx.lineTo(Math.cos(b) * 180, Math.sin(b) * 180);
    ctx.lineTo(Math.cos(c2) * 70, Math.sin(c2) * 70);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(221,102,33,.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 218, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 236, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = 'rgba(233,196,139,.55)';
  ctx.font = '700 34px Orbitron, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('LETHAL', 0, 34);
  return toTexture(c);
}

export function makeRocketTrailTexture() {
  const S = 128;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(.2, 'rgba(255,210,120,.9)');
  g.addColorStop(.5, 'rgba(255,110,30,.35)');
  g.addColorStop(1, 'rgba(120,30,10,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return toTexture(c);
}
