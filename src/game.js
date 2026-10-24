import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Arena } from './world.js';
import { Player } from './player.js';
import { BotManager } from './bots.js';
import { Effects } from './effects.js';
import { AudioEngine } from './audio.js';
import { WeaponSystem, WEAPONS } from './weapons.js';

const TAU = Math.PI * 2;
const MATCH_TIME = 300;
const FRAG_LIMIT = 15;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uDamage: { value: 0 },
    uAberration: { value: 0.0016 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uDamage;
    uniform float uAberration;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      float d = length(c);
      vec2 off = c * d * uAberration;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      float vig = smoothstep(0.82, 0.24, d);
      col *= mix(0.72, 1.0, vig);
      col *= vec3(1.015, 1.0, 0.985);
      float grain = hash(vUv * 900.0 + uTime * 13.0) - 0.5;
      col += grain * 0.018;
      col.r += uDamage * 0.06 * smoothstep(0.28, 0.76, d);
      col.g *= 1.0 - uDamage * 0.035 * smoothstep(0.2, 0.8, d);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.state = 'menu';
    this.time = 0;
    this.menuTime = 0;
    this.lastFrame = performance.now();
    this.timeLeft = MATCH_TIME;
    this.input = {
      forward: false, back: false, left: false, right: false,
      jump: false, crouch: false, zoom: false, fire: false,
    };
    this.touch = {
      forward: 0, strafe: 0, fire: false, lookX: 0, lookY: 0,
    };
    this.pointerLocked = false;
    this.pointerLockSupported = 'pointerLockElement' in document;
    this.mouseDown = false;
    this.zoomHeld = false;
    this.touchMode = window.matchMedia('(pointer: coarse)').matches;
    this.damagePulse = 0;
    this.scoreboardOpen = false;
    this.lastHud = {};
    this.lastRadar = 0;
    this.matchOver = false;
    this.killFeedItems = [];
    this.centerMessageTimer = 0;
    this.hitMarkerTimer = 0;
    this.hitDirectionTimer = 0;
    this.feedIndex = 0;
    this.rockets = [];
    this.burstLimiter = 0;
    this.softwareRenderer = detectSoftwareRenderer();
    document.body.classList.toggle('software-renderer', this.softwareRenderer);
    this.quality = this.softwareRenderer ? 'compatibility' : 'high';
    this.renderScale = this.softwareRenderer ? 0.62 : Math.min(window.devicePixelRatio || 1, this.touchMode ? 1.35 : 1.6);
    this.frameSamples = [];
    this.autoAdjusted = false;
    this.initRenderer();
    this.initScene();
    this.audio = new AudioEngine();
    this.weapons = new WeaponSystem(this.camera);
    this.weapons.root.visible = false;
    this.arena = new Arena(this.scene, this.renderer);
    this.effects = new Effects(this.scene);
    this.player = new Player(this.camera, this.arena, this.audio, this.weapons);
    this.bots = new BotManager(this.scene, this.arena, this.effects, this.audio, {
      getPlayer: () => this.player,
      onBotDamaged: (bot, amount, source) => this.onBotDamaged(bot, amount, source),
      onBotKilled: (bot, source, headshot) => this.onBotKilled(bot, source, headshot),
      onBotRespawn: bot => this.onBotRespawn(bot),
      onPlayerHit: (bot, amount, result) => this.onPlayerHit(bot, amount, result),
      onPlayerKilled: bot => this.onPlayerKilled(bot),
    });
    this.initLights();
    this.initComposer();
    this.cacheUI();
    this.bindUI();
    this.bindInput();
    this.resize();
    this.updateMenuCamera(0);
    this.renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
    this.loadingDone();
    this.clock = new THREE.Clock();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
    window.__Q3 = this;
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !this.softwareRenderer,
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false,
    });
    this.renderer.setPixelRatio(this.renderScale);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.shadowMap.enabled = !this.softwareRenderer;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = true;
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x06060c);
    this.scene.fog = new THREE.FogExp2(0x080812, 0.0058);
    this.camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.04, 1300);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    const fill = new THREE.AmbientLight(0x453b4b, 0.55);
    this.scene.add(fill);
    const hemi = new THREE.HemisphereLight(0x919cce, 0x25110b, 0.62);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xb8c6ff, 1.25);
    key.position.set(-38, 56, 22);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -52;
    key.shadow.camera.right = 52;
    key.shadow.camera.top = 52;
    key.shadow.camera.bottom = -52;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 130;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.035;
    this.scene.add(key);
    this.keyLight = key;

    const warm = new THREE.PointLight(0xff8a45, 90, 55, 2);
    warm.position.set(0, 7, 0);
    this.scene.add(warm);
    const cyan = new THREE.PointLight(0x3bbdff, 90, 40, 2);
    cyan.position.set(-25, 8, 17);
    this.scene.add(cyan);
    const red = new THREE.PointLight(0xff3c25, 65, 35, 2);
    red.position.set(25, 6, -16);
    this.scene.add(red);

    const viewLight = new THREE.PointLight(0xffd2a3, 0.9, 2.6, 2);
    viewLight.position.set(0.35, 0.15, -0.35);
    this.camera.add(viewLight);
    this.viewLight = viewLight;
  }

  initLights() {
    const rim = new THREE.DirectionalLight(0x598dff, 0.55);
    rim.position.set(28, 25, -34);
    this.scene.add(rim);
  }

  initComposer() {
    if (this.softwareRenderer) {
      this.composer = null;
      this.grade = { uniforms: { uTime: { value: 0 }, uDamage: { value: 0 } } };
      return;
    }
    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(this.renderScale);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.46, 0.5, 0.86);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }

  cacheUI() {
    const id = name => document.getElementById(name);
    this.ui = {
      menu: id('menu'),
      hud: id('hud'),
      health: id('health-value'),
      armor: id('armor-value'),
      ammo: id('ammo-value'),
      ammoMax: id('ammo-max'),
      ammoWrap: document.querySelector('.ammo-readout'),
      weaponName: id('weapon-name'),
      weaponClass: id('weapon-class'),
      weaponSlot: id('weapon-slot'),
      frags: id('frag-count'),
      clock: id('match-clock'),
      leaderName: id('leader-name'),
      leaderScore: id('leader-score'),
      slotEls: [...document.querySelectorAll('.weapon-slots span')],
      radar: id('radar'),
      radarCtx: id('radar').getContext('2d'),
      killfeed: id('killfeed'),
      crosshair: id('crosshair'),
      hitmarker: id('hitmarker'),
      centerMessage: id('center-message'),
      centerKicker: id('center-kicker'),
      centerText: id('center-text'),
      centerSub: id('center-sub'),
      respawn: id('respawn-timer'),
      respawnCount: id('respawn-count'),
      scoreboard: id('scoreboard'),
      scoreboardList: id('scoreboard-list'),
      pause: id('pause-menu'),
      gameover: id('gameover'),
      resultTitle: id('result-title'),
      resultKicker: id('result-kicker'),
      resultSub: id('result-sub'),
      resultFrags: id('result-frags'),
      resultDeaths: id('result-deaths'),
      resultAccuracy: id('result-accuracy'),
      resultPlace: id('result-place'),
      resultCard: document.querySelector('.result-card'),
      damageFlash: id('damage-flash'),
      pickupFlash: id('pickup-flash'),
      hitDirection: id('hit-direction'),
      lowHealth: id('low-health'),
      touchUI: id('touch-ui'),
      loading: id('loading'),
      howPanel: id('how-panel'),
      rotate: id('rotate-device'),
      scope: id('scope'),
    };
    this.radarCanvasSize = 180;
    this.ui.radar.width = 180;
    this.ui.radar.height = 180;
  }

  loadingDone() {
    requestAnimationFrame(() => {
      this.ui.loading.classList.add('done');
      document.body.classList.add('ready');
    });
  }

  bindUI() {
    const on = (id, event, fn) => document.getElementById(id)?.addEventListener(event, fn);
    on('play-button', 'click', () => this.startMatch());
    on('how-button', 'click', () => {
      this.audio.init();
      this.audio.playUi();
      this.ui.howPanel.classList.remove('is-hidden');
    });
    on('how-close', 'click', () => this.ui.howPanel.classList.add('is-hidden'));
    on('how-dismiss', 'click', () => this.ui.howPanel.classList.add('is-hidden'));
    on('resume-button', 'click', () => this.resume());
    on('restart-button', 'click', () => this.startMatch(true));
    on('quit-button', 'click', () => this.quitToMenu());
    on('again-button', 'click', () => this.startMatch(true));
    on('menu-button', 'click', () => this.quitToMenu());
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('pointerlockchange', () => this.onPointerLockChange());
    document.addEventListener('pointerlockerror', () => {
      this.pointerLocked = false;
    });
  }

  bindInput() {
    const movementKeys = {
      KeyW: 'forward', ArrowUp: 'forward',
      KeyS: 'back', ArrowDown: 'back',
      KeyA: 'left', ArrowLeft: 'left',
      KeyD: 'right', ArrowRight: 'right',
    };
    document.addEventListener('keydown', e => {
      if (e.code === 'Tab') {
        e.preventDefault();
        if (this.state === 'playing') {
          this.scoreboardOpen = true;
          this.updateScoreboard();
          this.ui.scoreboard.classList.remove('is-hidden');
        }
        return;
      }
      if (e.code === 'Escape') {
        if (this.state === 'playing') {
          e.preventDefault();
          this.pause();
        } else if (this.state === 'paused') {
          e.preventDefault();
          this.resume();
        }
        return;
      }
      if (e.code === 'Enter') {
        if (this.state === 'menu') this.startMatch();
        else if (this.state === 'gameover') this.startMatch(true);
        else if (this.state === 'paused') this.resume();
        return;
      }
      if (this.state !== 'playing') return;
      if (movementKeys[e.code]) {
        this.input[movementKeys[e.code]] = true;
        e.preventDefault();
      }
      if (e.code === 'Space') {
        this.input.jump = true;
        e.preventDefault();
      }
      if (e.code === 'ControlLeft' || e.code === 'ControlRight' || e.code === 'KeyC') {
        this.input.crouch = true;
        e.preventDefault();
      }
      if (/^Digit[1-4]$/.test(e.code)) {
        const idx = Number(e.code.slice(5)) - 1;
        if (this.player.switchWeapon(idx)) {
          this.hitMarkerTimer = 0;
          this.updateHud(true);
        }
      }
      if (e.code === 'KeyM') {
        const enabled = this.audio.toggle();
        this.flashCenter(enabled ? 'AUDIO ONLINE' : 'AUDIO MUTED', '', '');
      }
      if (e.code === 'KeyQ') {
        const next = (this.player.currentWeapon + 1) % WEAPONS.length;
        this.player.switchWeapon(next);
        this.updateHud(true);
      }
    });
    document.addEventListener('keyup', e => {
      if (movementKeys[e.code]) this.input[movementKeys[e.code]] = false;
      if (e.code === 'Space') this.input.jump = false;
      if (e.code === 'ControlLeft' || e.code === 'ControlRight' || e.code === 'KeyC') this.input.crouch = false;
      if (e.code === 'Tab') {
        this.scoreboardOpen = false;
        this.ui.scoreboard.classList.add('is-hidden');
      }
    });

    this.canvas.addEventListener('mousedown', e => {
      if (this.state !== 'playing') return;
      if (!this.pointerLocked) {
        this.requestPointerLock();
        return;
      }
      if (e.button === 0) {
        this.mouseDown = true;
        this.input.fire = true;
      }
      if (e.button === 2) {
        this.zoomHeld = true;
        this.input.zoom = true;
      }
    });
    document.addEventListener('mouseup', e => {
      if (e.button === 0) {
        this.mouseDown = false;
        this.input.fire = false;
      }
      if (e.button === 2) {
        this.zoomHeld = false;
        this.input.zoom = false;
      }
    });
    document.addEventListener('mousemove', e => {
      if (this.state !== 'playing') return;
      if (this.pointerLocked) {
        const zoomFactor = this.player.getWeapon().zoom * (1 - this.weapons.zoom) + this.weapons.zoom * 0.55;
        this.player.addLook(e.movementX, e.movementY, 0.0022, zoomFactor);
        this.player.lastLookX = e.movementX;
        this.player.lastLookY = e.movementY;
      }
    });
    this.canvas.addEventListener('wheel', e => {
      if (this.state !== 'playing') return;
      e.preventDefault();
      const dir = Math.sign(e.deltaY) || 1;
      const next = (this.player.currentWeapon + dir + WEAPONS.length) % WEAPONS.length;
      if (this.player.switchWeapon(next)) this.updateHud(true);
    }, { passive: false });

    window.addEventListener('blur', () => this.clearInput());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });

    this.bindTouch();
  }

  bindTouch() {
    if (!this.touchMode) return;
    document.body.classList.add('touch-mode');
    const stick = document.getElementById('touch-stick');
    const knob = stick.querySelector('span');
    let stickId = null;
    let startX = 0, startY = 0;
    const max = 40;
    const moveStick = (x, y) => {
      const dx = THREE.MathUtils.clamp(x - startX, -max, max);
      const dy = THREE.MathUtils.clamp(y - startY, -max, max);
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      this.touch.strafe = dx / max;
      this.touch.forward = -dy / max;
    };
    stick.addEventListener('pointerdown', e => {
      stickId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      stick.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    stick.addEventListener('pointermove', e => {
      if (e.pointerId !== stickId) return;
      moveStick(e.clientX, e.clientY);
    });
    const endStick = e => {
      if (e.pointerId !== stickId) return;
      stickId = null;
      knob.style.transform = 'translate(-50%,-50%)';
      this.touch.strafe = 0;
      this.touch.forward = 0;
    };
    stick.addEventListener('pointerup', endStick);
    stick.addEventListener('pointercancel', endStick);

    const fireBtn = document.getElementById('touch-fire');
    fireBtn.addEventListener('pointerdown', e => {
      this.audio.init();
      this.touch.fire = true;
      this.input.fire = true;
      fireBtn.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    const stopFire = e => {
      this.touch.fire = false;
      this.input.fire = false;
    };
    fireBtn.addEventListener('pointerup', stopFire);
    fireBtn.addEventListener('pointercancel', stopFire);

    document.getElementById('touch-jump').addEventListener('pointerdown', e => {
      this.input.jump = true;
      setTimeout(() => { this.input.jump = false; }, 130);
      e.preventDefault();
    });
    document.getElementById('touch-swap').addEventListener('pointerdown', e => {
      this.player.switchWeapon((this.player.currentWeapon + 1) % WEAPONS.length);
      this.updateHud(true);
      e.preventDefault();
    });

    let lookId = null;
    let lastX = 0, lastY = 0;
    this.canvas.addEventListener('pointerdown', e => {
      if (this.state !== 'playing' || e.pointerType !== 'touch') return;
      lookId = e.pointerId;
      lastX = e.clientX;
      lastY = e.clientY;
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', e => {
      if (e.pointerId !== lookId || this.state !== 'playing') return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      this.player.addLook(dx * 1.65, dy * 1.65, 0.0022, 1);
      this.player.lastLookX = dx;
      this.player.lastLookY = dy;
    });
    const endLook = e => { if (e.pointerId === lookId) lookId = null; };
    this.canvas.addEventListener('pointerup', endLook);
    this.canvas.addEventListener('pointercancel', endLook);
  }

  startMatch(restart = false) {
    if (this.state === 'playing' || (this.state === 'paused' && !restart)) return;
    this.audio.init();
    this.audio.playUi();
    this.matchOver = false;
    this.timeLeft = MATCH_TIME;
    this.killFeedItems = [];
    this.ui.killfeed.innerHTML = '';
    this.ui.scoreboard.classList.add('is-hidden');
    this.ui.gameover.classList.add('is-hidden');
    this.ui.pause.classList.add('is-hidden');
    this.ui.howPanel.classList.add('is-hidden');
    this.scoreboardOpen = false;
    this.player.reset(this.arena.spawnPoints[0], true);
    this.player.frags = 0;
    this.player.deaths = 0;
    this.player.shotsFired = 0;
    this.player.shotsHit = 0;
    this.player.damageDealt = 0;
    this.player.damageTaken = 0;
    this.bots.bots.forEach(bot => {
      bot.frags = 0;
      bot.deaths = 0;
      bot.spawnIndex = 1 + (bot.index % 3);
      bot.reset();
    });
    this.rockets.forEach(r => this.scene.remove(r.mesh));
    this.rockets = [];
    this.input.fire = false;
    this.input.zoom = false;
    this.zoomHeld = false;
    this.state = 'playing';
    this.ui.menu.classList.add('is-hidden');
    this.ui.menu.classList.remove('is-leaving');
    this.ui.hud.classList.remove('is-hidden');
    this.ui.respawn.classList.add('is-hidden');
    this.ui.lowHealth.classList.remove('on');
    this.weapons.root.visible = true;
    this.weapons.equip(0, true);
    this.player.currentWeapon = 0;
    this.player.syncCamera(0);
    this.camera.fov = 78;
    this.camera.updateProjectionMatrix();
    this.updateHud(true);
    this.updateScoreboard();
    this.flashCenter('MATCH START', 'SECTOR 09', 'FIRST TO 15 FRAGS');
    this.requestPointerLock();
    if (this.touchMode) this.ui.touchUI.classList.remove('is-hidden');
    this.ui.rotate.classList.add('is-hidden');
  }

  requestPointerLock() {
    if (this.touchMode || !this.pointerLockSupported || this.pointerLocked) return;
    try {
      const result = this.canvas.requestPointerLock();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {}
  }

  onPointerLockChange() {
    const locked = document.pointerLockElement === this.canvas;
    const was = this.pointerLocked;
    this.pointerLocked = locked;
    if (locked) {
      this.canvas.classList.add('locked');
    } else {
      this.canvas.classList.remove('locked');
      this.input.fire = false;
      this.mouseDown = false;
      this.input.zoom = false;
      this.zoomHeld = false;
      if (was && this.state === 'playing' && !this.matchOver) {
        this.pause();
      }
    }
  }

  pause() {
    if (this.state !== 'playing' || this.matchOver) return;
    this.state = 'paused';
    this.clearInput();
    this.ui.pause.classList.remove('is-hidden');
    if (document.pointerLockElement) document.exitPointerLock();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.ui.pause.classList.add('is-hidden');
    this.weapons.root.visible = true;
    this.audio.playUi();
    this.requestPointerLock();
  }

  quitToMenu() {
    this.state = 'menu';
    this.clearInput();
    this.matchOver = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.player.alive = false;
    this.ui.menu.classList.remove('is-hidden', 'is-leaving');
    this.ui.hud.classList.add('is-hidden');
    this.ui.pause.classList.add('is-hidden');
    this.ui.gameover.classList.add('is-hidden');
    this.ui.scoreboard.classList.add('is-hidden');
    this.ui.touchUI.classList.add('is-hidden');
    this.ui.respawn.classList.add('is-hidden');
    this.ui.scope.classList.add('is-hidden');
    this.weapons.root.visible = false;
    this.player.health = 100;
    this.player.armor = 50;
    this.updateMenuCamera(0);
  }

  clearInput() {
    for (const k of Object.keys(this.input)) this.input[k] = false;
    this.mouseDown = false;
    this.zoomHeld = false;
    this.touch.forward = this.touch.strafe = 0;
    this.touch.fire = false;
  }

  flashCenter(kicker, text, sub, duration = 1500) {
    this.ui.centerKicker.textContent = kicker;
    this.ui.centerText.textContent = text;
    this.ui.centerSub.textContent = sub;
    this.ui.centerMessage.classList.add('on');
    this.centerMessageTimer = duration;
  }

  addFeed(killer, victim, weapon, youKilled = false, youDied = false) {
    const row = document.createElement('div');
    row.className = 'killfeed__row';
    const kClass = youKilled ? 'kf--you' : 'kf--enemy';
    row.innerHTML = `<b class="${kClass}">${killer}</b><span class="kf--weapon">${weapon}</span><b class="${youDied ? 'kf--you' : ''}">${victim}</b>`;
    this.ui.killfeed.prepend(row);
    this.killFeedItems.push(row);
    while (this.killFeedItems.length > 5) {
      const old = this.killFeedItems.shift();
      old.remove();
    }
  }

  onBotDamaged(bot, amount, source) {
    if (source === 'player') {
      this.player.damageDealt += amount;
    }
  }

  onBotKilled(bot, source, headshot) {
    if (source !== 'player') return;
    this.player.frags++;
    this.player.damageDealt += 0;
    this.audio.playKill();
    this.addFeed('YOU', bot.name, headshot ? 'HEADSHOT' : this.player.getWeapon().name, true, false);
    this.flashCenter(headshot ? 'HEADSHOT' : 'ELIMINATED', bot.name, '+1 FRAG', 1400);
    this.updateHud(true);
    this.updateScoreboard();
    if (this.player.frags >= FRAG_LIMIT) this.endMatch(true);
  }

  onBotRespawn() {
    this.updateScoreboard();
  }

  onPlayerHit(bot, amount, result) {
    this.damagePulse = Math.min(1, this.damagePulse + 0.65);
    this.ui.damageFlash.classList.add('on');
    this.hitDirectionTimer = 0.5;
    const dx = bot.pos.x - this.player.pos.x;
    const dz = bot.pos.z - this.player.pos.z;
    const angle = Math.atan2(dx, dz) - this.player.yaw;
    this.ui.hitDirection.style.transform = `translate(-50%,-50%) rotate(${angle}rad)`;
    this.ui.hitDirection.style.opacity = '1';
    if (this.player.health <= 35) this.ui.lowHealth.classList.add('on');
    else this.ui.lowHealth.classList.remove('on');
    if (result?.died) {
      this.onPlayerKilled(bot);
    }
  }

  onPlayerKilled(bot) {
    bot.frags++;
    this.player.deaths = Math.max(this.player.deaths, this.player.deaths);
    this.audio.playExplosion(0, false);
    this.addFeed(bot.name, 'YOU', 'PULSE RIFLE', false, true);
    this.flashCenter('FRAGGED BY', bot.name, `${bot.frags} FRAGS`, 2200);
    this.ui.respawn.classList.remove('is-hidden');
    this.updateHud(true);
    this.updateScoreboard();
    if (bot.frags >= FRAG_LIMIT) this.endMatch(false);
  }

  endMatch(victory) {
    if (this.matchOver) return;
    this.matchOver = true;
    this.state = 'gameover';
    this.clearInput();
    if (document.pointerLockElement) document.exitPointerLock();
    const sorted = this.getStandings();
    const playerPlace = sorted.findIndex(s => s.you) + 1;
    this.ui.resultTitle.textContent = victory ? 'VICTORY' : 'DEFEAT';
    this.ui.resultKicker.innerHTML = victory ? '<span></span> MATCH COMPLETE' : '<span></span> FRAG LIMIT REACHED';
    this.ui.resultSub.textContent = victory ? 'The reliquary belongs to you.' : `${sorted[0].name} owns the reliquary.`;
    this.ui.resultFrags.textContent = this.player.frags;
    this.ui.resultDeaths.textContent = this.player.deaths;
    this.ui.resultAccuracy.textContent = `${this.player.getAccuracy()}%`;
    this.ui.resultPlace.textContent = ordinal(playerPlace);
    this.ui.resultCard.classList.toggle('lost', !victory);
    this.ui.gameover.classList.remove('is-hidden');
    this.ui.respawn.classList.add('is-hidden');
    this.ui.lowHealth.classList.remove('on');
    this.audio.playUi();
  }

  getStandings() {
    const entries = [
      { name: 'RANGER-01', frags: this.player.frags, deaths: this.player.deaths, you: true, color: '#ff9a2e' },
      ...this.bots.bots.map(b => ({ name: b.name, frags: b.frags, deaths: b.deaths, you: false, color: `#${b.color.toString(16).padStart(6, '0')}` })),
    ];
    return entries.sort((a, b) => b.frags - a.frags || a.deaths - b.deaths);
  }

  updateScoreboard() {
    if (!this.ui.scoreboardList) return;
    const sorted = this.getStandings();
    this.ui.scoreboardList.innerHTML = sorted.map((e, i) => {
      const acc = e.you ? this.player.getAccuracy() : Math.round(24 + (e.frags * 3.1) % 33);
      return `<li class="${e.you ? 'you' : ''}">
        <span class="rank">${String(i + 1).padStart(2, '0')}</span>
        <span class="name"><i class="swatch" style="color:${e.color}"></i>${e.name}</span>
        <span class="frags">${e.frags}</span>
        <span>${e.deaths}</span>
        <span>${acc}%</span>
      </li>`;
    }).join('');
  }

  updateMenuCamera(dt) {
    const t = this.menuTime;
    const a = 0.19 + Math.sin(t * 0.045) * 0.07;
    const radius = 33.5;
    this.camera.position.set(Math.sin(a) * radius - 3.4, 7.4 + Math.sin(t * 0.18) * 0.35, Math.cos(a) * radius);
    this.camera.lookAt(-0.5, 2.8 + Math.sin(t * 0.12) * 0.15, 0);
    this.camera.rotation.z = Math.sin(t * 0.09) * 0.004;
    const targetFov = 64;
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 3 || 1);
      this.camera.updateProjectionMatrix();
    }
  }

  toggleScoreboard(show) {
    this.scoreboardOpen = show;
    if (show) this.updateScoreboard();
    this.ui.scoreboard.classList.toggle('is-hidden', !show);
  }

  fireWeapon() {
    if (!this.player.alive || this.state !== 'playing') return;
    const def = this.player.getWeapon();
    if (!this.player.canFire()) {
      if (this.player.getAmmo() <= 0) {
        this.player.switchWeapon(0);
        this.updateHud(true);
      }
      return;
    }
    this.player.consumeShot();
    this.player.lastShotTime = this.time;
    const muzzle = this.weapons.muzzleWorldPosition(new THREE.Vector3());
    const baseDir = this.camera.getWorldDirection(new THREE.Vector3());
    _right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    _up.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    const origin = this.player.eyePosition(new THREE.Vector3());
    this.audio.playWeapon(def.sound, 0);

    if (def.projectile) {
      this.spawnRocket(muzzle, baseDir, def);
      this.player.addShake(0.16);
    } else {
      let anyHit = false;
      let hitHead = false;
      const pellets = def.id === 'scatter' ? def.pellets : 1;
      for (let p = 0; p < pellets; p++) {
        const dir = baseDir.clone();
        const spread = def.id === 'scatter' ? def.spread * (0.35 + Math.random() * 0.9) : def.spread;
        const a = Math.random() * TAU;
        const r = Math.sqrt(Math.random()) * spread;
        dir.addScaledVector(_right, Math.cos(a) * r).addScaledVector(_up, Math.sin(a) * r).normalize();
        const hit = this.bots.findRayHit(origin, dir, def.range);
        let end = origin.clone().addScaledVector(dir, def.range * 0.75);
        if (hit) {
          anyHit = true;
          hitHead = hitHead || hit.headshot;
          end = hit.point;
          const falloff = def.id === 'scatter' ? Math.max(0.35, 1 - hit.distance / 38) : 1;
          const dmg = def.damage * (hit.headshot ? 2 : 1) * falloff;
          hit.bot.takeDamage(dmg, 'player', hit.point, hit.headshot);
          this.effects.impact(hit.point, dir.clone().multiplyScalar(-1), def.color);
        }
        if (def.id === 'rail') {
          this.effects.railBeam(muzzle, end);
        } else if (p < 4) {
          this.effects.tracer(muzzle, end, def.id === 'pulse' ? 0x8ff8ff : 0xffce8a, 0.06, 1.1);
        }
      }
      if (anyHit) {
        this.player.shotsHit++;
        this.hitMarkerTimer = 0.16;
        this.ui.hitmarker.classList.add('on');
        this.ui.hitmarker.classList.toggle('head', hitHead);
        this.audio.playHit(hitHead);
      }
      if (def.id === 'rail') {
        this.effects.burst(muzzle, { color: 0x8ffaff, count: 10, speed: 3, size: 0.12, life: 0.35, gravity: 2 });
        this.player.addShake(0.24);
        this.audio.playExplosion(0, false);
      } else if (def.id === 'scatter') {
        this.player.addShake(0.12);
      } else {
        this.player.addShake(0.025);
      }
    }

    this.effects.burst(muzzle, { color: def.color, count: 4, speed: 2.6, size: 0.08, life: 0.12, gravity: 1 });
  }

  spawnRocket(origin, dir, def) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.1, 0.5, 10),
      new THREE.MeshStandardMaterial({ color: 0x38353b, metalness: 0.9, roughness: 0.28 })
    );
    body.rotation.x = Math.PI / 2;
    group.add(body);
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 0.24, 10),
      new THREE.MeshStandardMaterial({ color: 0x7c4a2b, metalness: 0.8, roughness: 0.35 })
    );
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -0.34;
    group.add(nose);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.arena.textures.glow,
      color: 0xff8c3d,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }));
    glow.position.z = 0.33;
    glow.scale.set(0.52, 0.52, 1);
    group.add(glow);
    const light = new THREE.PointLight(0xff7a2c, 12, 7, 2);
    group.add(light);
    group.position.copy(origin);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir.clone().normalize());
    this.scene.add(group);
    this.rockets.push({
      mesh: group,
      pos: origin.clone(),
      vel: dir.clone().normalize().multiplyScalar(42),
      life: 4,
      trailTimer: 0,
      light,
      damage: def.damage,
    });
  }

  updateRockets(dt) {
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.life -= dt;
      r.pos.addScaledVector(r.vel, dt);
      r.mesh.position.copy(r.pos);
      r.trailTimer -= dt;
      if (r.trailTimer <= 0) {
        r.trailTimer = 0.045;
        this.effects.burst(r.pos, { color: 0xff9c44, count: 3, speed: 2.2, size: 0.12, life: 0.34, gravity: -1.2 });
        this.effects.smoke(r.pos, 1, 0.7);
      }
      let explode = false;
      let hitBot = null;
      for (const bot of this.bots.bots) {
        if (!bot.alive) continue;
        if (r.pos.distanceTo(bot.center(_v)) < 0.95) {
          explode = true;
          hitBot = bot;
          break;
        }
      }
      if (r.pos.y < 0.18 || r.pos.y > 35 || Math.abs(r.pos.x) > 39 || Math.abs(r.pos.z) > 39) explode = true;
      if (!explode) {
        for (const p of this.arena.platforms) {
          if (r.pos.x > p.minX && r.pos.x < p.maxX && r.pos.z > p.minZ && r.pos.z < p.maxZ && r.pos.y < p.top + 0.1) {
            explode = true;
            break;
          }
        }
        if (!explode && r.pos.x * r.pos.x + r.pos.z * r.pos.z < 9.4 * 9.4 && r.pos.y < 2.1) explode = true;
      }
      if (explode || r.life <= 0) {
        this.explodeRocket(r, hitBot);
        this.scene.remove(r.mesh);
        r.mesh.traverse(o => {
          if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
          if (o.isSprite) o.material.dispose();
        });
        this.rockets.splice(i, 1);
      }
    }
  }

  explodeRocket(r, hitBot) {
    const pos = r.pos.clone();
    this.effects.explosion(pos, { color: 0xff7d2e, scale: 1.05 });
    this.effects.smoke(pos, 7, 1.3);
    this.audio.playExplosion(0, true);
    this.player.addShake(0.26);
    this.bots.splashDamage(pos, 4.6, r.damage, 'player');
    if (hitBot && hitBot.alive) hitBot.takeDamage(30, 'player', pos, false);
    const dist = this.player.pos.distanceTo(pos);
    if (dist < 4.6 && this.player.alive) {
      const selfDamage = (1 - dist / 4.6) * 48;
      this.player.applyDamage(selfDamage, null);
    }
    this.damagePulse = Math.min(1, this.damagePulse + Math.max(0, 0.5 - dist * 0.08));
  }

  updatePickups() {
    if (!this.player.alive) return;
    for (const p of this.arena.pickups) {
      if (!p.active) continue;
      const dx = this.player.pos.x - p.x;
      const dz = this.player.pos.z - p.z;
      const dy = this.player.pos.y + 0.9 - p.mesh.position.y;
      if (dx * dx + dz * dz < 2.3 && Math.abs(dy) < 2.1) {
        let message = '';
        let took = false;
        const flashPickup = () => {
          this.ui.pickupFlash.classList.add('on');
          setTimeout(() => this.ui.pickupFlash.classList.remove('on'), 110);
        };
        if (p.type === 'health') {
          if (this.player.health < this.player.maxHealth) {
            this.player.heal(25);
            this.audio.playPickup('health');
            message = '+25 HEALTH';
            took = true;
          }
        } else if (p.type === 'mega') {
          this.player.health = Math.min(150, this.player.health + 50);
          this.player.maxHealth = Math.max(this.player.maxHealth, 150);
          this.audio.playPickup('mega');
          message = '+50 MEGA HEALTH';
          took = true;
        } else if (p.type === 'armor') {
          if (this.player.armor < this.player.maxArmor) {
            this.player.addArmor(50);
            this.audio.playPickup('armor');
            message = '+50 ARMOR';
            took = true;
          }
        } else if (p.type === 'ammo') {
          const def = this.player.getWeapon();
          const idx = this.player.currentWeapon;
          if (Number.isFinite(this.player.weaponAmmo[idx])) {
            const max = def.reserve * 2;
            if (this.player.weaponAmmo[idx] < max) {
              this.player.weaponAmmo[idx] = Math.min(max, this.player.weaponAmmo[idx] + Math.ceil(def.reserve * 0.5));
              this.audio.playPickup('ammo');
              message = `+${Math.ceil(def.reserve * 0.5)} ${def.name}`;
              took = true;
            }
          }
        }
        if (took) {
          this.arena.takePickup(p);
          flashPickup();
          this.flashCenter('PICKUP', message, '', 900);
          this.updateHud(true);
        }
      }
    }
  }

  checkBotContact() {
    for (const bot of this.bots.bots) {
      if (!bot.alive || !this.player.alive) continue;
      const dx = this.player.pos.x - bot.pos.x;
      const dz = this.player.pos.z - bot.pos.z;
      const d = Math.hypot(dx, dz);
      const minDist = 1.0;
      if (d > 0.001 && d < minDist) {
        const push = (minDist - d) * 0.5;
        this.player.pos.x += dx / d * push;
        this.player.pos.z += dz / d * push;
        if (!this.arena.collisionBlocked(this.player.pos.x, this.player.pos.z, this.player.pos.y, this.player.radius)) {
          // resolved
        } else {
          this.player.pos.x -= dx / d * push;
          this.player.pos.z -= dz / d * push;
        }
      }
    }
  }

  updateHud(force = false) {
    const u = this.ui;
    const p = this.player;
    const def = p.getWeapon();
    const health = Math.max(0, Math.ceil(p.health));
    const armor = Math.max(0, Math.ceil(p.armor));
    setText(u.health, String(health));
    setText(u.armor, String(armor));
    u.health.closest('.vital')?.classList.toggle('critical', health <= 30);
    const ammo = p.getAmmo();
    setText(u.ammo, Number.isFinite(ammo) ? String(ammo) : '∞');
    setText(u.ammoMax, Number.isFinite(def.reserve) ? `/ ${def.reserve * 2}` : '/ ∞');
    u.ammoWrap.classList.toggle('low', Number.isFinite(ammo) && ammo <= 2);
    setText(u.weaponName, def.name);
    setText(u.weaponClass, def.cls);
    setText(u.weaponSlot, def.slot);
    u.slotEls.forEach((el, i) => el.classList.toggle('active', i === p.currentWeapon));
    setText(u.frags, String(p.frags));
    const standings = this.getStandings();
    const leader = standings[0];
    setText(u.leaderName, leader.you ? 'YOU' : leader.name);
    setText(u.leaderScore, String(leader.frags));
    u.clock.classList.toggle('urgent', this.timeLeft <= 30);
    if (!p.alive && p.respawnTimer > 0) {
      u.respawn.classList.remove('is-hidden');
      setText(u.respawnCount, String(Math.max(1, Math.ceil(p.respawnTimer))));
    } else if (p.alive) {
      u.respawn.classList.add('is-hidden');
    }
    const low = p.health <= 35 && p.alive;
    u.lowHealth.classList.toggle('on', low);
    if (!force) return;
  }

  updateClock() {
    const t = Math.max(0, Math.ceil(this.timeLeft));
    const mins = Math.floor(t / 60);
    const secs = t % 60;
    setText(this.ui.clock, `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
  }

  drawRadar() {
    const ctx = this.ui.radarCtx;
    const S = 180;
    const c = S / 2;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, c - 3, 0, TAU);
    ctx.clip();
    ctx.fillStyle = 'rgba(8,7,11,.55)';
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = 'rgba(255,154,46,.14)';
    ctx.lineWidth = 1;
    for (const r of [24, 47, 70]) {
      ctx.beginPath();
      ctx.arc(c, c, r, 0, TAU);
      ctx.stroke();
    }
    const sweep = this.time * 0.8;
    const grad = ctx.createConicGradient ? ctx.createConicGradient(sweep, c, c) : null;
    if (grad) {
      grad.addColorStop(0, 'rgba(255,154,46,.20)');
      grad.addColorStop(0.12, 'rgba(255,154,46,0)');
      grad.addColorStop(1, 'rgba(255,154,46,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(c, c, c, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,154,46,.25)';
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(sweep) * 10, c + Math.sin(sweep) * 10);
    ctx.lineTo(c + Math.cos(sweep) * 78, c + Math.sin(sweep) * 78);
    ctx.stroke();

    const scale = 2.25;
    const yaw = this.player.yaw;
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const toScreen = (x, z) => {
      const dx = x - this.player.pos.x;
      const dz = z - this.player.pos.z;
      const right = dx * rightX + dz * rightZ;
      const fwd = dx * forwardX + dz * forwardZ;
      return [c + right * scale, c - fwd * scale];
    };

    for (const p of this.arena.pickups) {
      if (!p.active) continue;
      const [x, y] = toScreen(p.x, p.z);
      if (Math.hypot(x - c, y - c) > 78) continue;
      ctx.fillStyle = p.type === 'health' ? 'rgba(255,95,69,.5)' : p.type === 'armor' ? 'rgba(92,216,255,.45)' : 'rgba(255,164,46,.45)';
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    for (const bot of this.bots.bots) {
      if (!bot.alive) continue;
      const [x, y] = toScreen(bot.pos.x, bot.pos.z);
      if (Math.hypot(x - c, y - c) > 78) continue;
      ctx.fillStyle = `#${bot.color.toString(16).padStart(6, '0')}`;
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(x, y, bot.frags >= 10 ? 5 : 3.4, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = '#fff3df';
    ctx.beginPath();
    ctx.moveTo(c, c - 7);
    ctx.lineTo(c + 4.5, c + 5);
    ctx.lineTo(c, c + 2.5);
    ctx.lineTo(c - 4.5, c + 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  onTick(dt) {
    this.time += dt;
    this.menuTime += dt;
    this.arena.update(dt, this.time);
    this.effects.update(dt);
    this.grade.uniforms.uTime.value = this.time;
    this.damagePulse = Math.max(0, this.damagePulse - dt * 2.2);
    this.grade.uniforms.uDamage.value = Math.min(1, this.damagePulse + (this.player.health < 30 && this.player.alive ? 0.16 : 0));
    this.ui.damageFlash.classList.toggle('on', this.damagePulse > 0.2);
    if (this.hitMarkerTimer > 0) {
      this.hitMarkerTimer -= dt;
      if (this.hitMarkerTimer <= 0) this.ui.hitmarker.classList.remove('on');
    }
    if (this.centerMessageTimer > 0) {
      this.centerMessageTimer -= dt;
      if (this.centerMessageTimer <= 0) this.ui.centerMessage.classList.remove('on');
    }
    if (this.hitDirectionTimer > 0) {
      this.hitDirectionTimer -= dt;
      if (this.hitDirectionTimer <= 0) this.ui.hitDirection.style.opacity = '0';
    }
    if (this.state === 'menu') {
      this.updateMenuCamera(dt);
      this.bots.update(dt, this.time, this.player, false);
      this.weapons.root.visible = false;
      this.render();
      return;
    }
    if (this.state === 'paused' || this.state === 'gameover') {
      this.weapons.root.visible = false;
      this.render();
      return;
    }

    this.timeLeft -= dt;
    this.updateClock();
    if (this.timeLeft <= 0 && !this.matchOver) {
      const standings = this.getStandings();
      this.endMatch(standings[0].you);
      return;
    }

    const touchForward = this.touch.forward;
    const touchStrafe = this.touch.strafe;
    const moveInput = {
      forward: this.input.forward || touchForward > 0.22,
      back: this.input.back || touchForward < -0.22,
      left: this.input.left || touchStrafe < -0.22,
      right: this.input.right || touchStrafe > 0.22,
      jump: this.input.jump,
      crouch: this.input.crouch,
      zoom: this.input.zoom,
      fire: this.input.fire,
    };
    if (this.player.alive) {
      this.player.update(dt, this.time, moveInput);
      if (moveInput.fire && this.player.canFire()) this.fireWeapon();
      this.updatePickups();
      this.checkBotContact();
      if (!this.player.alive) {
        this.ui.respawn.classList.remove('is-hidden');
        this.updateScoreboard();
      }
    } else {
      this.player.update(dt, this.time, moveInput);
      if (this.player.respawnTimer <= 0) {
        this.player.respawn();
        this.ui.respawn.classList.add('is-hidden');
        this.ui.lowHealth.classList.remove('on');
        this.audio.playBotSpawn(0);
        this.updateHud(true);
      }
    }

    this.bots.update(dt, this.time, this.player, true);
    this.updateRockets(dt);
    this.updateHud();
    if (this.time - this.lastRadar > 0.08) {
      this.lastRadar = this.time;
      this.drawRadar();
    }

    const fovTarget = 78 * (this.input.zoom ? this.player.getWeapon().zoom : 1);
    if (Math.abs(this.camera.fov - fovTarget) > 0.02) {
      this.camera.fov += (fovTarget - this.camera.fov) * Math.min(1, dt * 12);
      this.camera.updateProjectionMatrix();
    }
    this.ui.scope.classList.toggle('is-hidden', !(this.input.zoom && this.player.currentWeapon === 3));
    this.audio.setIntensity(this.player.alive ? 0.5 + Math.min(0.5, this.player.frags / 30) : 0.2);
    this.render();
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.renderScale);
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setPixelRatio(this.renderScale);
      this.composer.setSize(w, h);
    }
    this.ui.rotate.classList.add('is-hidden');
  }

  animate(now) {
    requestAnimationFrame(this.animate);
    const dt = Math.min(0.05, Math.max(0.0001, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.onTick(dt);
  }
}

function detectSoftwareRenderer() {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return false;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /llvmpipe|swiftshader|software/i.test(name);
  } catch {
    return false;
  }
}

function setText(el, value) {
  if (el && el.textContent !== value) el.textContent = value;
}

function ordinal(n) {
  const s = ['TH', 'ST', 'ND', 'RD'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
