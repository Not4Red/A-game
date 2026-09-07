/**
 * DODGE EVERYTHING - Arcade Survival Game
 * Mobile-First 2D Canvas Engine
 */

(function () {
  'use strict';

  // --- AUDIO SYNTHESIZER (Web Audio API) ---
  class SoundManager {
    constructor() {
      this.ctx = null;
      this.enabled = true;
      try {
        const saved = localStorage.getItem('dodge_sound_enabled');
        if (saved !== null) {
          this.enabled = saved === 'true';
        }
      } catch (e) {
        this.enabled = true;
      }
    }

    init() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    }

    playThrust(intensity = 0.5) {
      if (!this.enabled || !this.ctx) return;
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(45 + intensity * 25, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.12);
      } catch (e) {}
    }

    playExplosion() {
      if (!this.enabled || !this.ctx) return;
      try {
        const t = this.ctx.currentTime;
        // White noise for rumble
        const bufferSize = this.ctx.sampleRate * 0.45;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(600, t);
        filter.frequency.exponentialRampToValueAtTime(80, t + 0.45);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.4, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.45);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start(t);

        // Low frequency sub-thump
        const sub = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        sub.type = 'triangle';
        sub.frequency.setValueAtTime(120, t);
        sub.frequency.exponentialRampToValueAtTime(30, t + 0.35);
        subGain.gain.setValueAtTime(0.5, t);
        subGain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);
        sub.connect(subGain);
        subGain.connect(this.ctx.destination);
        sub.start(t);
        sub.stop(t + 0.35);
      } catch (e) {}
    }

    playClick() {
      if (!this.enabled || !this.ctx) return;
      try {
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, t);
        osc.frequency.exponentialRampToValueAtTime(300, t + 0.05);
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.05);
      } catch (e) {}
    }

    playNewBest() {
      if (!this.enabled || !this.ctx) return;
      try {
        const t = this.ctx.currentTime;
        const notes = [440, 554, 659, 880];
        notes.forEach((freq, idx) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, t + idx * 0.08);
          gain.gain.setValueAtTime(0.15, t + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.08 + 0.2);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t + idx * 0.08);
          osc.stop(t + idx * 0.08 + 0.2);
        });
      } catch (e) {}
    }
  }

  // --- GAME CONFIGURATION & STATE ---
  const STATES = {
    MENU: 'MENU',
    PLAYING: 'PLAYING',
    SETTINGS: 'SETTINGS',
    GAME_OVER: 'GAME_OVER'
  };

  const sound = new SoundManager();

  let gameState = STATES.MENU;
  let canvas = null;
  let ctx = null;
  let dpr = 1;

  // Settings
  let sensitivity = 60; // 10 to 100
  try {
    const savedSens = localStorage.getItem('dodge_sensitivity');
    if (savedSens !== null) {
      const parsed = parseInt(savedSens, 10);
      if (!isNaN(parsed) && parsed >= 10 && parsed <= 100) {
        sensitivity = parsed;
      }
    }
  } catch (e) {
    sensitivity = 60;
  }

  // Best score
  let bestScore = 0;
  try {
    const savedBest = localStorage.getItem('dodge_best_score');
    if (savedBest !== null) {
      bestScore = parseInt(savedBest, 10) || 0;
    }
  } catch (e) {
    bestScore = 0;
  }

  // Gameplay variables
  let score = 0;
  let survivalTime = 0; // in seconds
  let dodgedAsteroids = 0;
  let isNewBest = false;

  // Spawn timers
  let lastSpawnTime = 0;
  let spawnInterval = 1.1; // seconds between asteroid spawns

  // Screen shake
  let screenShakeMagnitude = 0;
  let screenShakeTimer = 0;

  // Animation time
  let lastFrameTime = performance.now();
  let globalTime = 0;

  // Player Spaceship
  const player = {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    width: 40,
    height: 54,
    tilt: 0,
    enginePulse: 0,
    active: true
  };

  // Asteroids and Particles arrays
  let asteroids = [];
  let particles = [];
  let stars = [];

  // DOM Elements
  const dom = {
    hud: document.getElementById('hud'),
    hudScore: document.getElementById('hud-score'),
    hudTime: document.getElementById('hud-time'),
    hudBest: document.getElementById('hud-best'),
    menuScreen: document.getElementById('menu-screen'),
    menuBestScore: document.getElementById('menu-best-score'),
    settingsScreen: document.getElementById('settings-screen'),
    gameOverScreen: document.getElementById('game-over-screen'),
    finalScore: document.getElementById('final-score'),
    finalBestScore: document.getElementById('final-best-score'),
    finalTime: document.getElementById('final-time'),
    finalDodged: document.getElementById('final-dodged'),
    newBestBanner: document.getElementById('new-best-banner'),
    sensitivitySlider: document.getElementById('sensitivity-slider'),
    sensitivityValue: document.getElementById('sensitivity-value'),
    toggleSound: document.getElementById('toggle-sound'),
    btnPlay: document.getElementById('btn-play'),
    btnSettings: document.getElementById('btn-settings'),
    btnSettingsBack: document.getElementById('btn-settings-back'),
    btnResetSensitivity: document.getElementById('btn-reset-sensitivity'),
    btnPlayAgain: document.getElementById('btn-play-again'),
    btnGameOverMenu: document.getElementById('btn-game-over-menu')
  };

  // --- STARFIELD INITIALIZATION ---
  function initStars() {
    stars = [];
    const count = Math.floor((window.innerWidth * window.innerHeight) / 3800);
    const starCount = Math.max(70, Math.min(count, 180));
    for (let i = 0; i < starCount; i++) {
      stars.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        size: Math.random() * 2.2 + 0.6,
        speed: Math.random() * 45 + 15,
        baseAlpha: Math.random() * 0.6 + 0.2,
        twinkleSpeed: Math.random() * 3 + 1,
        color: Math.random() > 0.85 ? '#00f0ff' : (Math.random() > 0.7 ? '#ffd166' : '#ffffff')
      });
    }
  }

  // --- RESIZE CANVAS ---
  function resizeCanvas() {
    dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.resetTransform();
    ctx.scale(dpr, dpr);

    // Keep player in bounds on resize
    if (player.x === 0 && player.y === 0) {
      player.x = w / 2;
      player.y = h * 0.78;
      player.targetX = player.x;
      player.targetY = player.y;
    } else {
      player.x = Math.max(player.width / 2, Math.min(w - player.width / 2, player.x));
      player.y = Math.max(player.height / 2, Math.min(h - player.height / 2, player.y));
      player.targetX = Math.max(player.width / 2, Math.min(w - player.width / 2, player.targetX));
      player.targetY = Math.max(player.height / 2, Math.min(h - player.height / 2, player.targetY));
    }
  }

  // --- PROCEDURAL ASTEROID GENERATOR ---
  function createAsteroid() {
    const w = window.innerWidth;
    // Vary size between 34 and 78 px
    const baseRadius = 18 + Math.random() * 22;
    const width = baseRadius * 2;
    const height = baseRadius * 2;

    // Generate irregular polygon vertices for authentic space rock look
    const numVertices = 10 + Math.floor(Math.random() * 5);
    const vertices = [];
    for (let i = 0; i < numVertices; i++) {
      const angle = (i / numVertices) * Math.PI * 2;
      // Irregularity between 0.72 and 1.15 of base radius
      const r = baseRadius * (0.75 + Math.random() * 0.35);
      vertices.push({
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
        r: r
      });
    }

    // Procedural craters
    const craters = [];
    const craterCount = 2 + Math.floor(Math.random() * 3);
    for (let c = 0; c < craterCount; c++) {
      const crDist = Math.random() * (baseRadius * 0.55);
      const crAngle = Math.random() * Math.PI * 2;
      craters.push({
        x: Math.cos(crAngle) * crDist,
        y: Math.sin(crAngle) * crDist,
        radius: 3 + Math.random() * (baseRadius * 0.25)
      });
    }

    // Color palette: varied metallic slate & space asteroid shades
    const palettes = [
      { base: '#4b5563', highlight: '#9ca3af', shadow: '#1f2937', rim: '#374151' },
      { base: '#5c5248', highlight: '#a89f91', shadow: '#2c251f', rim: '#423930' },
      { base: '#3b4252', highlight: '#8892b0', shadow: '#1a1f2c', rim: '#2e3440' },
      { base: '#4338ca', highlight: '#818cf8', shadow: '#1e1b4b', rim: '#312e81' } // rare crystalline asteroid
    ];
    const palette = palettes[Math.floor(Math.random() * palettes.length)];

    // Speed scales with survival time (strictly positive downward velocity)
    const baseSpeed = 190 + Math.random() * 85;
    const speedMultiplier = 1 + Math.min(survivalTime * 0.018, 1.8);
    const finalSpeed = baseSpeed * speedMultiplier;

    // Horizontal spawn clamped so asteroid fully starts within visible width
    const spawnPadding = baseRadius + 10;
    const x = spawnPadding + Math.random() * (w - spawnPadding * 2);

    // CRITICAL: Asteroids ONLY spawn ABOVE the top edge (negative Y)
    const y = -height - 15;

    // Slight natural drift angle (strictly moving downward)
    const driftSpeed = (Math.random() - 0.5) * (finalSpeed * 0.12);

    return {
      x: x,
      y: y,
      width: width,
      height: height,
      radius: baseRadius,
      // Inner collision radius tightly matching visible rock body
      collisionRadius: baseRadius * 0.82,
      speed: finalSpeed,
      vx: driftSpeed,
      vy: finalSpeed, // STRICTLY POSITIVE (moving DOWN)
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 1.8,
      vertices: vertices,
      craters: craters,
      palette: palette,
      active: true
    };
  }

  // --- PARTICLES (Thruster & Explosions) ---
  function spawnExplosion(x, y) {
    // Large blast particles
    const count = 48;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 260;
      const size = 3 + Math.random() * 6;
      const life = 0.5 + Math.random() * 0.55;
      const colors = ['#ffffff', '#00f0ff', '#ff7700', '#ff3366', '#ffd166'];
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: size,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        life: life,
        maxLife: life,
        isRing: false
      });
    }

    // Shockwave expansion ring
    particles.push({
      x: x,
      y: y,
      vx: 0,
      vy: 0,
      size: 4,
      targetSize: 85,
      color: '#00f0ff',
      alpha: 1,
      life: 0.4,
      maxLife: 0.4,
      isRing: true
    });
  }

  function spawnThrusterParticles(x, y) {
    if (particles.length > 120) return; // Keep lightweight for 60 FPS
    for (let i = 0; i < 2; i++) {
      const spread = (Math.random() - 0.5) * 12;
      particles.push({
        x: x + spread,
        y: y + 24,
        vx: (Math.random() - 0.5) * 20,
        vy: 70 + Math.random() * 90, // moves downward behind ship
        size: 2 + Math.random() * 3,
        color: Math.random() > 0.4 ? '#00f0ff' : '#ffaa00',
        alpha: 0.9,
        life: 0.2 + Math.random() * 0.15,
        maxLife: 0.35,
        isRing: false
      });
    }
  }

  // --- COLLISION DETECTION (CRITICAL REQUIREMENT) ---
  /**
   * Only check active asteroids that have entered the screen.
   * Compares the spaceship's tight visible body boxes against the asteroid's rock body.
   * Guaranteed ZERO false collisions for nearby objects.
   */
  function checkCollision(ship, asteroid) {
    // Only check active asteroids that are partially or fully visible
    if (!asteroid.active) return false;
    if (asteroid.y + asteroid.height / 2 < 0) return false; // Above screen, cannot hit yet

    // Fast broadphase distance check
    const dx = asteroid.x - ship.x;
    const dy = asteroid.y - ship.y;
    const maxDistance = asteroid.radius + Math.max(ship.width, ship.height);
    if (Math.abs(dx) > maxDistance || Math.abs(dy) > maxDistance) {
      return false;
    }

    const aRad = asteroid.collisionRadius;

    // Spaceship tight body box 1: Central Fuselage & Cockpit (narrower & taller)
    // Fuselage bounds relative to ship.x, ship.y:
    // x: [-11, +11] (width 22), y: [-24, +18] (height 42)
    const hullBox = {
      left: ship.x - 11,
      right: ship.x + 11,
      top: ship.y - 24,
      bottom: ship.y + 18
    };

    // Spaceship tight body box 2: Lower Delta Wings (wider, lower)
    // Wings bounds relative to ship.x, ship.y:
    // x: [-18, +18] (width 36), y: [+4, +22] (height 18)
    const wingsBox = {
      left: ship.x - 18,
      right: ship.x + 18,
      top: ship.y + 4,
      bottom: ship.y + 22
    };

    // Helper: Circle vs AABB collision
    function circleIntersectsAABB(cx, cy, r, box) {
      const closestX = Math.max(box.left, Math.min(cx, box.right));
      const closestY = Math.max(box.top, Math.min(cy, box.bottom));
      const distX = cx - closestX;
      const distY = cy - closestY;
      return (distX * distX + distY * distY) < (r * r);
    }

    // Check collision against either visible spaceship component
    if (circleIntersectsAABB(asteroid.x, asteroid.y, aRad, hullBox)) {
      return true;
    }
    if (circleIntersectsAABB(asteroid.x, asteroid.y, aRad, wingsBox)) {
      return true;
    }

    return false;
  }

  // --- TOUCH & POINTER INPUT HANDLING ---
  /**
   * The entire gameplay screen is the controller!
   * Touching anywhere smoothly steers the spaceship.
   */
  function handlePointerInput(clientX, clientY) {
    if (gameState !== STATES.PLAYING) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Set target coordinate with border clamping
    player.targetX = Math.max(player.width / 2, Math.min(w - player.width / 2, clientX));
    player.targetY = Math.max(player.height / 2, Math.min(h - player.height / 2, clientY));
  }

  function setupInputListeners() {
    let isMouseDown = false;

    // Touch events (passive: false to enable preventDefault and stop scrolling)
    window.addEventListener('touchstart', (e) => {
      sound.init();
      if (gameState === STATES.PLAYING && e.touches.length > 0) {
        e.preventDefault();
        const t = e.touches[0];
        handlePointerInput(t.clientX, t.clientY);
      }
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (gameState === STATES.PLAYING && e.touches.length > 0) {
        e.preventDefault();
        const t = e.touches[0];
        handlePointerInput(t.clientX, t.clientY);
      }
    }, { passive: false });

    window.addEventListener('touchend', (e) => {
      if (gameState === STATES.PLAYING) {
        e.preventDefault();
      }
    }, { passive: false });

    // Desktop mouse events
    window.addEventListener('mousedown', (e) => {
      sound.init();
      isMouseDown = true;
      if (gameState === STATES.PLAYING) {
        handlePointerInput(e.clientX, e.clientY);
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (gameState === STATES.PLAYING && isMouseDown) {
        handlePointerInput(e.clientX, e.clientY);
      }
    });

    window.addEventListener('mouseup', () => {
      isMouseDown = false;
    });

    // Window resize
    window.addEventListener('resize', () => {
      resizeCanvas();
      initStars();
    });

    // Orientation change
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        resizeCanvas();
        initStars();
      }, 100);
    });
  }

  // --- UI SCREENS & NAVIGATION ---
  function switchState(newState) {
    gameState = newState;

    // Reset screen overlays
    dom.menuScreen.classList.remove('active');
    dom.settingsScreen.classList.remove('active');
    dom.gameOverScreen.classList.remove('active');
    dom.hud.classList.add('hud-hidden');

    if (newState === STATES.MENU) {
      dom.menuScreen.classList.add('active');
      dom.menuBestScore.textContent = bestScore.toLocaleString();
    } else if (newState === STATES.SETTINGS) {
      dom.settingsScreen.classList.add('active');
      dom.sensitivitySlider.value = sensitivity;
      dom.sensitivityValue.textContent = sensitivity + '%';
      dom.toggleSound.checked = sound.enabled;
    } else if (newState === STATES.PLAYING) {
      dom.hud.classList.remove('hud-hidden');
      updateHUD();
    } else if (newState === STATES.GAME_OVER) {
      dom.gameOverScreen.classList.add('active');
      dom.finalScore.textContent = score.toLocaleString();
      dom.finalBestScore.textContent = bestScore.toLocaleString();
      dom.finalTime.textContent = Math.floor(survivalTime) + 's';
      dom.finalDodged.textContent = dodgedAsteroids.toLocaleString();
      if (isNewBest) {
        dom.newBestBanner.classList.remove('hidden');
      } else {
        dom.newBestBanner.classList.add('hidden');
      }
    }
  }

  function startNewGame() {
    sound.init();
    // Reset player position to bottom-center of screen
    const w = window.innerWidth;
    const h = window.innerHeight;
    player.x = w / 2;
    player.y = h * 0.78;
    player.targetX = player.x;
    player.targetY = player.y;
    player.tilt = 0;
    player.active = true;

    // Reset gameplay stats
    score = 0;
    survivalTime = 0;
    dodgedAsteroids = 0;
    isNewBest = false;
    lastSpawnTime = 0;
    spawnInterval = 1.1;

    // Clear old asteroids and particles
    asteroids = [];
    particles = [];
    screenShakeMagnitude = 0;
    screenShakeTimer = 0;

    switchState(STATES.PLAYING);
  }

  function triggerGameOver() {
    sound.playExplosion();
    // Stop gameplay and score immediately
    player.active = false;

    // Trigger visual explosion and screen shake
    spawnExplosion(player.x, player.y);
    screenShakeMagnitude = 16;
    screenShakeTimer = 0.35; // 350ms screen shake

    // Check & save High Score immediately
    if (score > bestScore) {
      bestScore = score;
      isNewBest = true;
      try {
        localStorage.setItem('dodge_best_score', bestScore.toString());
      } catch (e) {}
      sound.playNewBest();
    } else {
      isNewBest = false;
    }

    // Delay slight moment before showing Game Over menu to admire explosion
    setTimeout(() => {
      switchState(STATES.GAME_OVER);
    }, 450);
  }

  function updateHUD() {
    dom.hudScore.textContent = score.toLocaleString();
    const mins = Math.floor(survivalTime / 60);
    const secs = Math.floor(survivalTime % 60);
    dom.hudTime.textContent = (mins < 10 ? '0' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs;
    dom.hudBest.textContent = Math.max(score, bestScore).toLocaleString();
  }

  // --- BUTTON ACTIONS ---
  function setupButtons() {
    dom.btnPlay.addEventListener('click', () => {
      sound.playClick();
      startNewGame();
    });

    dom.btnSettings.addEventListener('click', () => {
      sound.playClick();
      switchState(STATES.SETTINGS);
    });

    dom.btnSettingsBack.addEventListener('click', () => {
      sound.playClick();
      switchState(STATES.MENU);
    });

    dom.btnResetSensitivity.addEventListener('click', () => {
      sound.playClick();
      sensitivity = 60;
      dom.sensitivitySlider.value = 60;
      dom.sensitivityValue.textContent = '60%';
      try {
        localStorage.setItem('dodge_sensitivity', '60');
      } catch (e) {}
    });

    dom.sensitivitySlider.addEventListener('input', (e) => {
      sensitivity = parseInt(e.target.value, 10);
      dom.sensitivityValue.textContent = sensitivity + '%';
      try {
        localStorage.setItem('dodge_sensitivity', sensitivity.toString());
      } catch (e) {}
    });

    dom.toggleSound.addEventListener('change', (e) => {
      sound.enabled = e.target.checked;
      try {
        localStorage.setItem('dodge_sound_enabled', sound.enabled.toString());
      } catch (e) {}
      if (sound.enabled) {
        sound.init();
        sound.playClick();
      }
    });

    dom.btnPlayAgain.addEventListener('click', () => {
      sound.playClick();
      startNewGame();
    });

    dom.btnGameOverMenu.addEventListener('click', () => {
      sound.playClick();
      switchState(STATES.MENU);
    });
  }

  // --- UPDATE LOOP ---
  function update(dt) {
    globalTime += dt;

    // Background stars update (always moves gently)
    const starSpeedMult = gameState === STATES.PLAYING ? 1.0 : 0.4;
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      s.y += s.speed * starSpeedMult * dt;
      if (s.y > window.innerHeight) {
        s.y = -5;
        s.x = Math.random() * window.innerWidth;
      }
    }

    // Screen shake decay
    if (screenShakeTimer > 0) {
      screenShakeTimer -= dt;
      if (screenShakeTimer <= 0) {
        screenShakeMagnitude = 0;
      }
    }

    // Only update gameplay entities while PLAYING
    if (gameState !== STATES.PLAYING) return;

    // Survival time and scoring
    survivalTime += dt;
    // Score increases continuously while playing + asteroid dodge bonuses
    score = Math.floor(survivalTime * 10) + (dodgedAsteroids * 15);
    updateHUD();

    // Responsive Player Movement with Smooth Interpolation
    // Map sensitivity (10 to 100) to frame-rate independent lerp rate:
    // 10% sensitivity -> smooth glide (rate ~ 4.0)
    // 60% sensitivity -> responsive and smooth (rate ~ 14.0)
    // 100% sensitivity -> snappy instant tracking (rate ~ 32.0)
    const minLerp = 4.0;
    const maxLerp = 32.0;
    const lerpRate = minLerp + ((sensitivity - 10) / 90) * (maxLerp - minLerp);
    const lerpFactor = 1 - Math.exp(-lerpRate * dt);

    const prevX = player.x;
    player.x += (player.targetX - player.x) * lerpFactor;
    player.y += (player.targetY - player.y) * lerpFactor;

    // Clamping: Spaceship NEVER leaves visible screen
    const w = window.innerWidth;
    const h = window.innerHeight;
    player.x = Math.max(player.width / 2, Math.min(w - player.width / 2, player.x));
    player.y = Math.max(player.height / 2, Math.min(h - player.height / 2, player.y));

    // Dynamic bank tilt based on horizontal velocity
    const horizontalVelocity = (player.x - prevX) / dt;
    const targetTilt = Math.max(-0.45, Math.min(0.45, horizontalVelocity * 0.0012));
    player.tilt += (targetTilt - player.tilt) * (1 - Math.exp(-12 * dt));

    // Engine thruster pulse and particles
    player.enginePulse = Math.sin(globalTime * 20) * 0.2 + 0.8;
    spawnThrusterParticles(player.x, player.y);

    // Asteroid Spawning Logic
    // Gradually decrease spawn interval as survival time increases (from 1.1s down to ~0.36s)
    spawnInterval = Math.max(0.36, 1.1 - survivalTime * 0.012);
    if (globalTime - lastSpawnTime >= spawnInterval) {
      lastSpawnTime = globalTime;
      asteroids.push(createAsteroid());
    }

    // Update Asteroids
    for (let i = asteroids.length - 1; i >= 0; i--) {
      const ast = asteroids[i];
      if (!ast.active) continue;

      // STRICTLY MOVE DOWNWARD (vy is positive)
      ast.y += ast.vy * dt;
      ast.x += ast.vx * dt;
      ast.rotation += ast.rotationSpeed * dt;

      // Keep asteroid slightly inside left/right walls if drifting
      if (ast.x < ast.radius) {
        ast.x = ast.radius;
        ast.vx = Math.abs(ast.vx);
      } else if (ast.x > w - ast.radius) {
        ast.x = w - ast.radius;
        ast.vx = -Math.abs(ast.vx);
      }

      // Check Real Collision with Player Spaceship
      if (player.active && checkCollision(player, ast)) {
        triggerGameOver();
        return; // Stop update loop immediately
      }

      // Remove asteroids ONLY after they completely leave the bottom edge
      if (ast.y > h + ast.height + 25) {
        ast.active = false;
        asteroids.splice(i, 1);
        dodgedAsteroids++;
      }
    }

    // Update Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      p.alpha = Math.max(0, p.life / p.maxLife);
      if (p.isRing) {
        p.size += (p.targetSize - p.size) * (1 - Math.exp(-8 * dt));
      }
      if (p.life <= 0) {
        particles.splice(i, 1);
      }
    }
  }

  // --- RENDER FUNCTIONS ---
  function drawStars() {
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const twinkle = Math.sin(globalTime * s.twinkleSpeed + s.x) * 0.3 + 0.7;
      ctx.fillStyle = s.color;
      ctx.globalAlpha = Math.max(0.1, Math.min(1, s.baseAlpha * twinkle));
      ctx.fillRect(s.x, s.y, s.size, s.size);
    }
    ctx.globalAlpha = 1.0;
  }

  function drawNebulaGlow() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Ambient cosmic glow matching Immersive UI radial gradient
    const grad = ctx.createRadialGradient(w * 0.5, h * 0.5, 20, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
    grad.addColorStop(0, 'rgba(12, 18, 43, 0.95)');
    grad.addColorStop(0.55, 'rgba(8, 16, 40, 0.45)');
    grad.addColorStop(1, 'rgba(2, 4, 16, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  function drawSpaceship(x, y, tilt) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);

    // Engine Thruster Flame
    const flameHeight = 18 + player.enginePulse * 14;
    const flameGrad = ctx.createLinearGradient(0, 18, 0, 18 + flameHeight);
    flameGrad.addColorStop(0, '#ffffff');
    flameGrad.addColorStop(0.2, '#00f0ff');
    flameGrad.addColorStop(0.65, '#ff7700');
    flameGrad.addColorStop(1, 'rgba(255, 119, 0, 0)');

    ctx.fillStyle = flameGrad;
    ctx.beginPath();
    ctx.moveTo(-7, 18);
    ctx.quadraticCurveTo(0, 18 + flameHeight * 1.2, 0, 18 + flameHeight);
    ctx.quadraticCurveTo(0, 18 + flameHeight * 1.2, 7, 18);
    ctx.closePath();
    ctx.fill();

    // Dual Thruster Nozzles
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-9, 15, 6, 4);
    ctx.fillRect(3, 15, 6, 4);

    // Outer Wings / Swept-back Stabilizers
    ctx.fillStyle = '#0a3a60';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(-20, 16);
    ctx.lineTo(-14, 20);
    ctx.lineTo(0, 14);
    ctx.lineTo(14, 20);
    ctx.lineTo(20, 16);
    ctx.closePath();
    ctx.fill();

    // Wingtip Neon Energy Blades
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(-20, 16);
    ctx.lineTo(-15, 4);
    ctx.moveTo(20, 16);
    ctx.lineTo(15, 4);
    ctx.stroke();
    ctx.shadowBlur = 0; // Reset shadow

    // Central Fuselage Hull
    const hullGrad = ctx.createLinearGradient(0, -26, 0, 16);
    hullGrad.addColorStop(0, '#00f0ff'); // nose glow
    hullGrad.addColorStop(0.25, '#1e3a5f');
    hullGrad.addColorStop(0.85, '#0d1d33');
    hullGrad.addColorStop(1, '#061021');

    ctx.fillStyle = hullGrad;
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -26); // Pointed nose tip
    ctx.lineTo(9, -8);
    ctx.lineTo(11, 15);
    ctx.lineTo(-11, 15);
    ctx.lineTo(-9, -8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cockpit Glass Canopy
    const cockpitGrad = ctx.createLinearGradient(0, -16, 0, -2);
    cockpitGrad.addColorStop(0, '#e0f2fe');
    cockpitGrad.addColorStop(0.5, '#00f0ff');
    cockpitGrad.addColorStop(1, '#0369a1');

    ctx.fillStyle = cockpitGrad;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.ellipse(0, -9, 4.5, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Cockpit Specular Highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.beginPath();
    ctx.ellipse(-1.2, -11, 1.5, 4, -0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawAsteroid(ast) {
    ctx.save();
    ctx.translate(ast.x, ast.y);
    ctx.rotate(ast.rotation);

    const rad = ast.radius;
    const pal = ast.palette;

    // Asteroid Body Shadow / Base Gradient
    const rockGrad = ctx.createRadialGradient(
      -rad * 0.35, -rad * 0.35, rad * 0.1,
      0, 0, rad * 1.15
    );
    rockGrad.addColorStop(0, pal.highlight);
    rockGrad.addColorStop(0.45, pal.base);
    rockGrad.addColorStop(0.9, pal.shadow);
    rockGrad.addColorStop(1, '#0b0f19');

    // Draw irregular procedural rocky perimeter
    ctx.beginPath();
    const verts = ast.vertices;
    ctx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) {
      ctx.lineTo(verts[i].x, verts[i].y);
    }
    ctx.closePath();

    ctx.fillStyle = rockGrad;
    ctx.fill();

    // Crisp rocky rim outline with subtle rim lighting
    ctx.strokeStyle = pal.rim;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Draw rock facets / surface fissures
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < verts.length; i += 2) {
      const v1 = verts[i];
      const v2 = verts[(i + 3) % verts.length];
      ctx.moveTo(v1.x * 0.6, v1.y * 0.6);
      ctx.lineTo(v2.x * 0.5, v2.y * 0.5);
    }
    ctx.stroke();

    // Draw Craters with depth shading
    for (let c = 0; c < ast.craters.length; c++) {
      const cr = ast.craters[c];
      // Dark inner hollow
      ctx.fillStyle = pal.shadow;
      ctx.beginPath();
      ctx.arc(cr.x, cr.y, cr.radius, 0, Math.PI * 2);
      ctx.fill();

      // Lit crescent rim
      ctx.strokeStyle = pal.highlight;
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.arc(cr.x, cr.y, cr.radius, Math.PI * 0.8, Math.PI * 1.8);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawParticles() {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      ctx.save();
      ctx.globalAlpha = p.alpha;

      if (p.isRing) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // --- MAIN RENDER LOOP ---
  function render() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    ctx.save();

    // Apply Screen Shake if active
    if (screenShakeMagnitude > 0) {
      const shakeX = (Math.random() - 0.5) * screenShakeMagnitude;
      const shakeY = (Math.random() - 0.5) * screenShakeMagnitude;
      ctx.translate(shakeX, shakeY);
    }

    // Clear Screen with deep cosmic void background (Immersive UI)
    ctx.fillStyle = '#020410';
    ctx.fillRect(0, 0, w, h);

    // Draw Ambient Starfield and Cosmic Glow
    drawNebulaGlow();
    drawStars();

    // Draw Asteroids (strictly descending)
    for (let i = 0; i < asteroids.length; i++) {
      drawAsteroid(asteroids[i]);
    }

    // Draw Particles
    drawParticles();

    // Draw Player Spaceship (if active or on menu)
    if (player.active) {
      drawSpaceship(player.x, player.y, player.tilt);
    }

    ctx.restore();
  }

  // --- ENGINE LOOP ---
  function gameLoop(timestamp) {
    const dt = Math.min((timestamp - lastFrameTime) / 1000, 0.1); // Clamp large delta to 100ms
    lastFrameTime = timestamp;

    update(dt);
    render();

    requestAnimationFrame(gameLoop);
  }

  // --- INITIALIZATION ---
  function init() {
    canvas = document.getElementById('game-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d', { alpha: false });

    resizeCanvas();
    initStars();
    setupInputListeners();
    setupButtons();
    switchState(STATES.MENU);

    lastFrameTime = performance.now();
    requestAnimationFrame(gameLoop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
