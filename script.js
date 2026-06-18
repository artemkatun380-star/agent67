window.onload = function () {
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const isMobile = window.innerWidth <= 1000;
  let shakeAmount = 0;
  const SHAKE_DECAY = 0.8;
  const INITIAL_SHAKE = isMobile ? 4 : 8;

  // --- Элементы интерфейса ---
  const menuScreen = document.getElementById("menuScreen");
  const levelSelectScreen = document.getElementById("levelSelectScreen");
  const victoryScreen = document.getElementById("victoryScreen");
  const victoryImage = document.getElementById("victoryImage");
  const levelGrid = document.getElementById("levelGrid");
  const playButton = document.getElementById("playButton");
  const backButton = document.getElementById("backButton");
  const restartButton = document.getElementById("restartButton");
  const levelSelectButton = document.getElementById("levelSelectButton");

  // --- Состояние игры ---
  const TOTAL_LEVELS = 67;
  let gameState = "menu";
  let unlockedLevels = [];

  // --- Прогресс ---
  function loadProgress() {
    const saved = localStorage.getItem("agent67_progress");
    if (saved) {
      unlockedLevels = JSON.parse(saved);
    } else {
      unlockedLevels = [];
    }
  }

  function saveProgress() {
    localStorage.setItem("agent67_progress", JSON.stringify(unlockedLevels));
  }

  function isLevelUnlocked(index) {
    if (index >= levels.length) return false;
    if (index === 0) return true;
    return unlockedLevels.includes(index - 1);
  }

  // --- Управление видимостью экранов ---
  function showMenu() {
    gameState = "menu";
    menuScreen.style.display = "flex";
    levelSelectScreen.style.display = "none";
    canvas.style.display = "none";
    restartButton.style.display = "none";
    levelSelectButton.style.display = "none";
  }

  function showLevelSelect() {
    gameState = "levelSelect";
    menuScreen.style.display = "none";
    levelSelectScreen.style.display = "flex";
    canvas.style.display = "none";
    restartButton.style.display = "none";
    levelSelectButton.style.display = "none";
    generateLevelButtons();
  }

  function startLevel(levelIndex) {
    gameState = "playing";
    menuScreen.style.display = "none";
    levelSelectScreen.style.display = "none";
    canvas.style.display = "block";
    restartButton.style.display = "none";
    levelSelectButton.style.display = "none";
    currentLevel = levelIndex;
    loadLevel(currentLevel);
  }

  // --- Генерация сетки уровней ---
  function generateLevelButtons() {
    levelGrid.innerHTML = "";
    for (let i = 0; i < TOTAL_LEVELS; i++) {
      const btn = document.createElement("button");
      btn.className = "level-btn";
      btn.textContent = i + 1;
      if (i >= levels.length) {
        btn.textContent = "?";
        btn.classList.add("coming-soon");
        btn.disabled = true;
      } else if (isLevelUnlocked(i)) {
        btn.disabled = false;
        btn.addEventListener("click", () => {
          playClickSound();
          startLevel(i);
        });
      } else {
        btn.textContent = "🔒";
        btn.disabled = true;
      }
      levelGrid.appendChild(btn);
    }
  }

  // --- Игровые переменные ---
  canvas.width = 1620;
  canvas.height = 780;

  function getCanvasCoords(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  let currentLevel = 0;
  let enemies = [];
  let walls = [];
  let bulletsLeft = 0;
  let levelComplete = false;
  let gameOver = false;
  let killCount = 0;

  const agent = {
    x: canvas.width / 2,
    y: canvas.height - 40,
    height: 250,
  };

  const AGENT_ASPECT = 1024 / 1536;
  const ENEMY_ASPECT = 1023 / 1536;

  let bullets = [];
  let explosionParticles = [];
  let sparkParticles = [];
  let mouseX = agent.x;
  let mouseY = agent.y;
  let agentAngle = 0;
  let lastMuzzle = { x: agent.x, y: agent.y };

  const MAX_RICOCHETS = 5;

  // =============================================
  // ЗВУКИ (mp3)
  // =============================================
  const masterVolume = 0.3;
  const soundCache = {};

  function loadSound(name, url) {
    const audio = new Audio();
    audio.src = url;
    audio.preload = "auto";
    soundCache[name] = audio;
  }

  function playSound(name, volume = 1.0) {
    const audio = soundCache[name];
    if (!audio) return;
    const clone = audio.cloneNode();
    clone.volume = volume * masterVolume;
    clone.play().catch((e) => {});
  }

  loadSound("shot", "sounds/shot.mp3");
  loadSound("ricochet", "sounds/ricochet.mp3");
  loadSound("victory", "sounds/victory.mp3");
  for (let k = 1; k <= 5; k++) {
    loadSound("kill" + k, "sounds/kill" + k + ".mp3");
  }
  loadSound("click", "sounds/click.mp3");

  function playClickSound() {
    playSound("click", 0.7);
  }
  function playVictorySound() {
    playSound("victory", 0.6);
  }
  function fireSound() {
    playSound("shot", 0.8);
  }
  function ricochetSound() {
    playSound("ricochet", 0.5);
  }

  // =============================================
  // ЗАГРУЗКА ИЗОБРАЖЕНИЙ
  // =============================================
  const images = {
    agent: new Image(),
    enemy: new Image(),
    wall: new Image(),
    background: new Image(),
    agentBody: new Image(),
    agentArm: new Image(),
  };
  images.agentBody.src = "images/agent_body.png";
  images.agentArm.src = "images/agent_arm.png";
  images.agent.src = "images/agent.png";
  images.enemy.src = "images/enemy.png";
  images.wall.src = "images/wall.png";
  images.background.src = "images/bg.png";

  // --- Класс частицы ---
  class Particle {
    constructor(x, y, color, speed, life, size = 3) {
      this.x = x;
      this.y = y;
      const angle = Math.random() * Math.PI * 2;
      this.vx = Math.cos(angle) * speed * (0.5 + Math.random());
      this.vy = Math.sin(angle) * speed * (0.5 + Math.random());
      this.life = life;
      this.maxLife = life;
      this.color = color;
      this.size = size;
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.vx *= 0.98;
      this.vy *= 0.98;
      this.life--;
    }
    draw(ctx) {
      const alpha = this.life / this.maxLife;
      ctx.fillStyle = this.color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * alpha, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    get isDead() {
      return this.life <= 0;
    }
  }

  // --- Кэшированный паттерн для стен (оптимизация) ---
  let wallPattern = null;
  function getWallPattern() {
    if (!wallPattern && images.wall.complete) {
      const tileSize = 64;
      const tileCanvas = document.createElement("canvas");
      tileCanvas.width = tileSize;
      tileCanvas.height = tileSize;
      const tileCtx = tileCanvas.getContext("2d");
      tileCtx.drawImage(images.wall, 0, 0, tileSize, tileSize);
      wallPattern = ctx.createPattern(tileCanvas, "repeat");
    }
    return wallPattern;
  }

  // --- УРОВНИ (без изменений) ---
  const levels = [
    // Уровень 1
    {
      enemies: [
        { x: 200, y: 100, size: 120 },
        { x: canvas.width - 200, y: 100, size: 120 },
        { x: canvas.width / 2, y: 200, size: 120 },
        { x: 140, y: canvas.height - 150, size: 120 },
        { x: canvas.width - 140, y: canvas.height - 150, size: 120 },
      ],
      walls: [
        { x: canvas.width / 2 - 120, y: 140, width: 240, height: 15 },
        { x: 100, y: canvas.height / 2 - 60, width: 15, height: 120 },
        {
          x: canvas.width - 112,
          y: canvas.height / 2 - 60,
          width: 15,
          height: 120,
        },
      ],
      bullets: 5,
      agent: { x: canvas.width / 2, y: canvas.height - 40 },
    },
    // Уровень 2
    {
      enemies: [
        { x: 180, y: 90, size: 120 },
        { x: canvas.width - 180, y: 90, size: 120 },
        { x: canvas.width / 2, y: 210, size: 120 },
        { x: 160, y: canvas.height - 130, size: 120 },
        { x: canvas.width - 160, y: canvas.height - 130, size: 120 },
      ],
      walls: [
        { x: canvas.width / 2 - 100, y: 130, width: 200, height: 15 },
        { x: 110, y: canvas.height / 2 - 40, width: 15, height: 100 },
        {
          x: canvas.width - 125,
          y: canvas.height / 2 - 40,
          width: 15,
          height: 100,
        },
      ],
      bullets: 4,
      agent: { x: canvas.width / 2 - 200, y: canvas.height - 60 },
    },
    // Уровень 3
    {
      enemies: [
        { x: 120, y: 90, size: 120 },
        { x: canvas.width - 120, y: 90, size: 120 },
        { x: 200, y: 220, size: 120 },
        { x: canvas.width - 200, y: 220, size: 120 },
        { x: canvas.width / 2, y: 300, size: 120 },
      ],
      walls: [
        { x: 60, y: 140, width: 140, height: 15 },
        { x: canvas.width - 200, y: 140, width: 140, height: 15 },
        { x: canvas.width / 2 - 6, y: 100, width: 15, height: 150 },
        { x: 160, y: 250, width: 15, height: 100 },
        { x: canvas.width - 172, y: 250, width: 15, height: 100 },
      ],
      bullets: 4,
      agent: { x: canvas.width / 2, y: canvas.height - 40 },
    },
    // Уровень 4
    {
      enemies: [
        { x: 200, y: 100, size: 120 },
        { x: canvas.width - 200, y: 100, size: 120 },
        { x: canvas.width / 2, y: 260, size: 120 },
        { x: 150, y: canvas.height - 130, size: 120 },
        { x: canvas.width - 150, y: canvas.height - 130, size: 120 },
      ],
      walls: [
        { x: 100, y: canvas.height / 2 - 60, width: 15, height: 120 },
        {
          x: canvas.width - 115,
          y: canvas.height / 2 - 60,
          width: 15,
          height: 120,
        },
        { x: canvas.width / 2 - 100, y: 170, width: 200, height: 15 },
      ],
      bullets: 4,
      agent: { x: canvas.width / 2, y: canvas.height - 60 },
    },
    // Уровень 5
    {
      enemies: [
        { x: 140, y: 110, size: 120 },
        { x: canvas.width - 140, y: 110, size: 120 },
        { x: canvas.width / 2, y: 200, size: 120 },
        { x: 100, y: 320, size: 120 },
        { x: canvas.width - 100, y: 320, size: 120 },
      ],
      walls: [
        { x: canvas.width / 2 - 50, y: 140, width: 15, height: 120 },
        { x: canvas.width / 2 + 38, y: 140, width: 15, height: 120 },
        { x: canvas.width / 2 - 100, y: 280, width: 200, height: 15 },
      ],
      bullets: 4,
      agent: { x: canvas.width / 2, y: canvas.height - 40 },
    },
    // Уровень 6
    {
      enemies: [
        { x: 130, y: 80, size: 120 },
        { x: canvas.width - 130, y: 80, size: 120 },
        { x: 200, y: 220, size: 120 },
        { x: canvas.width - 200, y: 220, size: 120 },
        { x: canvas.width / 2, y: 320, size: 120 },
      ],
      walls: [
        { x: 100, y: 120, width: 80, height: 15 },
        { x: canvas.width - 180, y: 150, width: 80, height: 15 },
        { x: canvas.width / 2 - 6, y: 100, width: 15, height: 140 },
      ],
      bullets: 4,
      agent: { x: canvas.width / 2, y: canvas.height - 40 },
    },
    // Уровень 7
    {
      enemies: [
        { x: 250, y: 80, size: 120 },
        { x: canvas.width - 250, y: 80, size: 120 },
        { x: canvas.width / 2, y: 220, size: 120 },
        { x: 290, y: canvas.height - 150, size: 120 },
        { x: canvas.width - 250, y: canvas.height - 150, size: 120 },
      ],
      walls: [
        { x: 100, y: 130, width: 15, height: 100 },
        { x: canvas.width - 115, y: 130, width: 15, height: 100 },
        { x: canvas.width / 2 - 100, y: 170, width: 200, height: 15 },
      ],
      bullets: 4,
      agent: { x: 160, y: canvas.height - 60 },
    },
    // Уровень 8
    {
      enemies: [
        { x: 130, y: 90, size: 120 },
        { x: canvas.width - 130, y: 90, size: 120 },
        { x: canvas.width / 2 - 60, y: 210, size: 120 },
        { x: canvas.width / 2 + 60, y: 210, size: 120 },
        { x: canvas.width / 2, y: 350, size: 120 },
      ],
      walls: [
        { x: canvas.width / 2 - 6, y: 120, width: 15, height: 150 },
        { x: 80, y: 250, width: 120, height: 15 },
        { x: canvas.width - 200, y: 250, width: 120, height: 15 },
      ],
      bullets: 5,
      agent: { x: canvas.width / 2 - 100, y: canvas.height - 60 },
    },
    // Уровень 9
    {
      enemies: [
        { x: 220, y: 90, size: 120 },
        { x: canvas.width - 220, y: 90, size: 120 },
        { x: 220, y: canvas.height - 150, size: 120 },
        { x: canvas.width - 220, y: canvas.height - 150, size: 120 },
        { x: canvas.width / 2, y: 250, size: 120 },
      ],
      walls: [
        { x: canvas.width / 2 - 150, y: 140, width: 300, height: 15 },
        { x: canvas.width / 2 - 150, y: 300, width: 300, height: 15 },
      ],
      bullets: 4,
      agent: { x: canvas.width / 2 - 150, y: canvas.height - 60 },
    },
    // Уровень 10
    {
      enemies: [
        { x: 320, y: 90, size: 120 },
        { x: canvas.width - 320, y: 90, size: 120 },
        { x: canvas.width / 2, y: 210, size: 120 },
        { x: 320, y: canvas.height - 150, size: 120 },
        { x: canvas.width - 320, y: canvas.height - 150, size: 120 },
      ],
      walls: [
        { x: 150, y: 120, width: 15, height: 100 },
        { x: canvas.width - 165, y: 120, width: 15, height: 100 },
        { x: canvas.width / 2 - 6, y: 120, width: 15, height: 100 },
        { x: canvas.width / 2 - 120, y: 270, width: 240, height: 15 },
      ],
      bullets: 5,
      agent: { x: 180, y: canvas.height - 60 },
    },
    // Уровни 11–20
    // 11
    {
      enemies: [
        { x: 200, y: 100, size: 120 },
        { x: canvas.width - 200, y: 100, size: 120 },
        { x: canvas.width / 2, y: 200, size: 120 },
        { x: 200, y: canvas.height - 300, size: 120 },
        { x: canvas.width - 200, y: canvas.height - 300, size: 120 },
      ],
      walls: [
        { x: canvas.width / 2 - 100, y: 150, width: 200, height: 15 },
        { x: 150, y: canvas.height / 2 - 50, width: 15, height: 100 },
        {
          x: canvas.width - 165,
          y: canvas.height / 2 - 50,
          width: 15,
          height: 100,
        },
      ],
      bullets: 4,
      agent: { x: canvas.width / 2, y: canvas.height - 40 },
    },
    // 12
    {
      enemies: [
        { x: 250, y: 80, size: 120 },
        { x: canvas.width - 250, y: 80, size: 120 },
        { x: canvas.width / 2, y: 180, size: 120 },
        { x: 250, y: canvas.height - 280, size: 120 },
        { x: canvas.width - 250, y: canvas.height - 280, size: 120 },
      ],
      walls: [
        { x: 100, y: 130, width: 15, height: 80 },
        { x: canvas.width - 115, y: 130, width: 15, height: 80 },
      ],
      bullets: 4,
      agent: { x: 170, y: canvas.height - 40 },
    },
    // 13
    {
      enemies: [
        { x: 300, y: 110, size: 120 },
        { x: canvas.width - 300, y: 110, size: 120 },
        { x: canvas.width / 2, y: 220, size: 120 },
        { x: 300, y: canvas.height - 270, size: 120 },
        { x: canvas.width - 300, y: canvas.height - 270, size: 120 },
      ],
      walls: [
        { x: canvas.width / 2 - 80, y: 160, width: 160, height: 15 },
        { x: 200, y: 250, width: 15, height: 80 },
        { x: canvas.width - 215, y: 250, width: 15, height: 80 },
      ],
      bullets: 4,
      agent: { x: canvas.width / 2 - 120, y: canvas.height - 40 },
    },
    // 14
    {
      enemies: [
        { x: 220, y: 90, size: 120 },
        { x: canvas.width - 220, y: 90, size: 120 },
        { x: canvas.width / 2, y: 190, size: 120 },
        { x: 220, y: canvas.height - 290, size: 120 },
        { x: canvas.width - 220, y: canvas.height - 290, size: 120 },
      ],
      walls: [
        { x: 120, y: 140, width: 15, height: 90 },
        { x: canvas.width - 135, y: 140, width: 15, height: 90 },
        { x: canvas.width / 2 - 90, y: 230, width: 180, height: 15 },
      ],
      bullets: 4,
      agent: { x: 160, y: canvas.height - 40 },
    },
    // 15
    {
      enemies: [
        { x: 180, y: 80, size: 120 },
        { x: canvas.width - 180, y: 80, size: 120 },
        { x: canvas.width / 2, y: 200, size: 120 },
        { x: 180, y: canvas.height - 300, size: 120 },
        { x: canvas.width - 180, y: canvas.height - 300, size: 120 },
      ],
      walls: [
        { x: canvas.width / 2 - 110, y: 150, width: 220, height: 15 },
        { x: 80, y: 200, width: 15, height: 100 },
        { x: canvas.width - 95, y: 200, width: 15, height: 100 },
      ],
      bullets: 5,
      agent: { x: canvas.width / 2, y: canvas.height - 40 },
    },
    // 16
    {
      enemies: [
        { x: 280, y: 100, size: 120 },
        { x: canvas.width - 280, y: 100, size: 120 },
        { x: canvas.width / 2, y: 210, size: 120 },
        { x: 280, y: canvas.height - 280, size: 120 },
        { x: canvas.width - 280, y: canvas.height - 280, size: 120 },
      ],
      walls: [
        { x: 150, y: 150, width: 15, height: 80 },
        { x: canvas.width - 165, y: 150, width: 15, height: 80 },
      ],
      bullets: 4,
      agent: { x: 180, y: canvas.height - 40 },
    },
    // 17
    {
      enemies: [
        { x: 200, y: 120, size: 120 },
        { x: canvas.width - 200, y: 120, size: 120 },
        { x: canvas.width / 2, y: 240, size: 120 },
        { x: 200, y: canvas.height - 260, size: 120 },
        { x: canvas.width - 200, y: canvas.height - 260, size: 120 },
      ],
      walls: [
        { x: canvas.width / 2 - 130, y: 170, width: 260, height: 15 },
        { x: 100, y: 100, width: 15, height: 80 },
      ],
      bullets: 4,
      agent: { x: canvas.width / 2 - 100, y: canvas.height - 40 },
    },
    // 18
    {
      enemies: [
        { x: 320, y: 80, size: 120 },
        { x: canvas.width - 320, y: 80, size: 120 },
        { x: canvas.width / 2, y: 180, size: 120 },
        { x: 320, y: canvas.height - 290, size: 120 },
        { x: canvas.width - 320, y: canvas.height - 290, size: 120 },
      ],
      walls: [
        { x: 200, y: 130, width: 15, height: 80 },
        { x: canvas.width - 215, y: 130, width: 15, height: 80 },
      ],
      bullets: 4,
      agent: { x: 150, y: canvas.height - 40 },
    },
    // 19
    {
      enemies: [
        { x: 250, y: 100, size: 120 },
        { x: canvas.width - 250, y: 100, size: 120 },
        { x: canvas.width / 2, y: 220, size: 120 },
        { x: 250, y: canvas.height - 270, size: 120 },
        { x: canvas.width - 250, y: canvas.height - 270, size: 120 },
      ],
      walls: [{ x: canvas.width / 2 - 90, y: 160, width: 180, height: 15 }],
      bullets: 4,
      agent: { x: canvas.width / 2, y: canvas.height - 40 },
    },
    // 20
    {
      enemies: [
        { x: 180, y: 90, size: 120 },
        { x: canvas.width - 180, y: 90, size: 120 },
        { x: canvas.width / 2, y: 200, size: 120 },
        { x: 180, y: canvas.height - 310, size: 120 },
        { x: canvas.width - 180, y: canvas.height - 310, size: 120 },
      ],
      walls: [
        { x: 100, y: 140, width: 15, height: 80 },
        { x: canvas.width - 115, y: 140, width: 15, height: 80 },
        { x: canvas.width / 2 - 80, y: 240, width: 160, height: 15 },
      ],
      bullets: 5,
      agent: { x: 160, y: canvas.height - 40 },
    },
    // Уровни 21–30
    // 21
    {
      enemies: [
        { x: 220, y: 110, size: 120 },
        { x: canvas.width - 220, y: 110, size: 120 },
        { x: canvas.width / 2, y: 230, size: 120 },
        { x: 220, y: canvas.height - 280, size: 120 },
        { x: canvas.width - 220, y: canvas.height - 280, size: 120 },
      ],
      walls: [
        { x: 140, y: 160, width: 15, height: 80 },
        { x: canvas.width - 155, y: 160, width: 15, height: 80 },
      ],
      bullets: 4,
      agent: { x: canvas.width / 2 - 80, y: canvas.height - 40 },
    },
    // 22
    {
      enemies: [
        { x: 300, y: 80, size: 120 },
        { x: canvas.width - 300, y: 80, size: 120 },
        { x: canvas.width / 2, y: 190, size: 120 },
        { x: 300, y: canvas.height - 300, size: 120 },
        { x: canvas.width - 300, y: canvas.height - 300, size: 120 },
      ],
      walls: [{ x: canvas.width / 2 - 100, y: 140, width: 200, height: 15 }],
      bullets: 4,
      agent: { x: 180, y: canvas.height - 40 },
    },
    // 23
    {
      enemies: [
        { x: 200, y: 100, size: 120 },
        { x: canvas.width - 200, y: 100, size: 120 },
        { x: canvas.width / 2, y: 210, size: 120 },
        { x: 200, y: canvas.height - 290, size: 120 },
        { x: canvas.width - 200, y: canvas.height - 290, size: 120 },
      ],
      walls: [
        { x: 100, y: 150, width: 15, height: 80 },
        { x: canvas.width - 115, y: 150, width: 15, height: 80 },
        { x: canvas.width / 2 - 110, y: 250, width: 220, height: 15 },
      ],
      bullets: 4,
      agent: { x: canvas.width / 2, y: canvas.height - 40 },
    },
    // 24
    {
      enemies: [
        { x: 260, y: 90, size: 120 },
        { x: canvas.width - 260, y: 90, size: 120 },
        { x: canvas.width / 2, y: 200, size: 120 },
        { x: 260, y: canvas.height - 280, size: 120 },
        { x: canvas.width - 260, y: canvas.height - 280, size: 120 },
      ],
      walls: [{ x: 160, y: 140, width: 15, height: 80 }],
      bullets: 4,
      agent: { x: 170, y: canvas.height - 40 },
    },
    // 25
    {
      enemies: [
        { x: 180, y: 120, size: 120 },
        { x: canvas.width - 180, y: 120, size: 120 },
        { x: canvas.width / 2, y: 240, size: 120 },
        { x: 180, y: canvas.height - 270, size: 120 },
        { x: canvas.width - 180, y: canvas.height - 270, size: 120 },
      ],
      walls: [
        { x: canvas.width / 2 - 120, y: 170, width: 240, height: 15 },
        { x: 80, y: 100, width: 15, height: 80 },
      ],
      bullets: 5,
      agent: { x: canvas.width / 2 - 60, y: canvas.height - 40 },
    },
    // 26
    {
      enemies: [
        { x: 320, y: 80, size: 120 },
        { x: canvas.width - 320, y: 80, size: 120 },
        { x: canvas.width / 2, y: 180, size: 120 },
        { x: 320, y: canvas.height - 310, size: 120 },
        { x: canvas.width - 320, y: canvas.height - 310, size: 120 },
      ],
      walls: [{ x: 200, y: 130, width: 15, height: 80 }],
      bullets: 4,
      agent: { x: 150, y: canvas.height - 40 },
    },
    // 27
    {
      enemies: [
        { x: 240, y: 100, size: 120 },
        { x: canvas.width - 240, y: 100, size: 120 },
        { x: canvas.width / 2, y: 220, size: 120 },
        { x: 240, y: canvas.height - 290, size: 120 },
        { x: canvas.width - 240, y: canvas.height - 290, size: 120 },
      ],
      walls: [
        { x: canvas.width / 2 - 80, y: 160, width: 160, height: 15 },
        { x: 140, y: 200, width: 15, height: 80 },
        { x: canvas.width - 155, y: 200, width: 15, height: 80 },
      ],
      bullets: 4,
      agent: { x: canvas.width / 2, y: canvas.height - 40 },
    },
    // 28
    {
      enemies: [
        { x: 200, y: 110, size: 120 },
        { x: canvas.width - 200, y: 110, size: 120 },
        { x: canvas.width / 2, y: 230, size: 120 },
        { x: 200, y: canvas.height - 280, size: 120 },
        { x: canvas.width - 200, y: canvas.height - 280, size: 120 },
      ],
      walls: [
        { x: 120, y: 160, width: 15, height: 80 },
        { x: canvas.width - 135, y: 160, width: 15, height: 80 },
      ],
      bullets: 4,
      agent: { x: 160, y: canvas.height - 40 },
    },
    // 29
    {
      enemies: [
        { x: 280, y: 80, size: 120 },
        { x: canvas.width - 280, y: 80, size: 120 },
        { x: canvas.width / 2, y: 190, size: 120 },
        { x: 280, y: canvas.height - 300, size: 120 },
        { x: canvas.width - 280, y: canvas.height - 300, size: 120 },
      ],
      walls: [{ x: canvas.width / 2 - 100, y: 140, width: 200, height: 15 }],
      bullets: 4,
      agent: { x: canvas.width / 2 - 110, y: canvas.height - 40 },
    },
    // 30
    {
      enemies: [
        { x: 220, y: 100, size: 120 },
        { x: canvas.width - 220, y: 100, size: 120 },
        { x: canvas.width / 2, y: 210, size: 120 },
        { x: 220, y: canvas.height - 290, size: 120 },
        { x: canvas.width - 220, y: canvas.height - 290, size: 120 },
      ],
      walls: [
        { x: 100, y: 150, width: 15, height: 80 },
        { x: canvas.width - 115, y: 150, width: 15, height: 80 },
        { x: canvas.width / 2 - 90, y: 240, width: 180, height: 15 },
      ],
      bullets: 5,
      agent: { x: 180, y: canvas.height - 40 },
    },
    // Уровни 31–40
    // 31
    {
      enemies: [
        { x: 200, y: 90, size: 120 },
        { x: canvas.width - 200, y: 90, size: 120 },
        { x: canvas.width / 2, y: 200, size: 120 },
        { x: 200, y: canvas.height - 310, size: 120 },
        { x: canvas.width - 200, y: canvas.height - 310, size: 120 },
      ],
      walls: [
        { x: canvas.width / 2 - 110, y: 150, width: 220, height: 15 },
        { x: 80, y: 200, width: 15, height: 80 },
      ],
      bullets: 4,
      agent: { x: canvas.width / 2, y: canvas.height - 40 },
    },
    // 32
    {
      enemies: [
        { x: 250, y: 80, size: 120 },
        { x: canvas.width - 250, y: 80, size: 120 },
        { x: canvas.width / 2, y: 180, size: 120 },
        { x: 250, y: canvas.height - 290, size: 120 },
        { x: canvas.width - 250, y: canvas.height - 290, size: 120 },
      ],
      walls: [{ x: 150, y: 130, width: 15, height: 80 }],
      bullets: 4,
      agent: { x: 170, y: canvas.height - 40 },
    },
    // 33
    {
      enemies: [
        { x: 300, y: 100, size: 120 },
        { x: canvas.width - 300, y: 100, size: 120 },
        { x: canvas.width / 2, y: 220, size: 120 },
        { x: 300, y: canvas.height - 280, size: 120 },
        { x: canvas.width - 300, y: canvas.height - 280, size: 120 },
      ],
      walls: [{ x: canvas.width / 2 - 80, y: 160, width: 160, height: 15 }],
      bullets: 4,
      agent: { x: canvas.width / 2 - 130, y: canvas.height - 40 },
    },
    // 34
    {
      enemies: [
        { x: 220, y: 110, size: 120 },
        { x: canvas.width - 220, y: 110, size: 120 },
        { x: canvas.width / 2, y: 230, size: 120 },
        { x: 220, y: canvas.height - 270, size: 120 },
        { x: canvas.width - 220, y: canvas.height - 270, size: 120 },
      ],
      walls: [
        { x: 120, y: 160, width: 15, height: 80 },
        { x: canvas.width - 135, y: 160, width: 15, height: 80 },
        { x: canvas.width / 2 - 100, y: 250, width: 200, height: 15 },
      ],
      bullets: 4,
      agent: { x: 160, y: canvas.height - 40 },
    },
    // 35
    {
      enemies: [
        { x: 180, y: 80, size: 120 },
        { x: canvas.width - 180, y: 80, size: 120 },
        { x: canvas.width / 2, y: 200, size: 120 },
        { x: 180, y: canvas.height - 300, size: 120 },
        { x: canvas.width - 180, y: canvas.height - 300, size: 120 },
      ],
      walls: [
        { x: canvas.width / 2 - 120, y: 150, width: 240, height: 15 },
        { x: 100, y: 200, width: 15, height: 80 },
        { x: canvas.width - 115, y: 200, width: 15, height: 80 },
      ],
      bullets: 5,
      agent: { x: canvas.width / 2, y: canvas.height - 40 },
    },
    // 36
    {
      enemies: [
        { x: 280, y: 90, size: 120 },
        { x: canvas.width - 280, y: 90, size: 120 },
        { x: canvas.width / 2, y: 190, size: 120 },
        { x: 280, y: canvas.height - 290, size: 120 },
        { x: canvas.width - 280, y: canvas.height - 290, size: 120 },
      ],
      walls: [{ x: 180, y: 140, width: 15, height: 80 }],
      bullets: 4,
      agent: { x: 170, y: canvas.height - 40 },
    },
    // 37
    {
      enemies: [
        { x: 200, y: 120, size: 120 },
        { x: canvas.width - 200, y: 120, size: 120 },
        { x: canvas.width / 2, y: 240, size: 120 },
        { x: 200, y: canvas.height - 260, size: 120 },
        { x: canvas.width - 200, y: canvas.height - 260, size: 120 },
      ],
      walls: [{ x: canvas.width / 2 - 90, y: 170, width: 180, height: 15 }],
      bullets: 4,
      agent: { x: canvas.width / 2 - 70, y: canvas.height - 40 },
    },
    // 38
    {
      enemies: [
        { x: 320, y: 80, size: 120 },
        { x: canvas.width - 320, y: 80, size: 120 },
        { x: canvas.width / 2, y: 180, size: 120 },
        { x: 320, y: canvas.height - 310, size: 120 },
        { x: canvas.width - 320, y: canvas.height - 310, size: 120 },
      ],
      walls: [{ x: 200, y: 130, width: 15, height: 80 }],
      bullets: 4,
      agent: { x: 150, y: canvas.height - 40 },
    },
    // 39
    {
      enemies: [
        { x: 240, y: 100, size: 120 },
        { x: canvas.width - 240, y: 100, size: 120 },
        { x: canvas.width / 2, y: 220, size: 120 },
        { x: 240, y: canvas.height - 290, size: 120 },
        { x: canvas.width - 240, y: canvas.height - 290, size: 120 },
      ],
      walls: [
        { x: canvas.width / 2 - 110, y: 160, width: 220, height: 15 },
        { x: 140, y: 210, width: 15, height: 80 },
        { x: canvas.width - 155, y: 210, width: 15, height: 80 },
      ],
      bullets: 4,
      agent: { x: canvas.width / 2, y: canvas.height - 40 },
    },
    // 40
    {
      enemies: [
        { x: 200, y: 110, size: 120 },
        { x: canvas.width - 200, y: 110, size: 120 },
        { x: canvas.width / 2, y: 230, size: 120 },
        { x: 200, y: canvas.height - 280, size: 120 },
        { x: canvas.width - 200, y: canvas.height - 280, size: 120 },
      ],
      walls: [
        { x: 120, y: 160, width: 15, height: 80 },
        { x: canvas.width - 135, y: 160, width: 15, height: 80 },
      ],
      bullets: 4,
      agent: { x: 160, y: canvas.height - 40 },
    },
    // Уровни 41–50
    // 41
    {
      enemies: [
        { x: 280, y: 80, size: 120 },
        { x: canvas.width - 280, y: 80, size: 120 },
        { x: canvas.width / 2, y: 190, size: 120 },
        { x: 280, y: canvas.height - 300, size: 120 },
        { x: canvas.width - 280, y: canvas.height - 300, size: 120 },
      ],
      walls: [{ x: canvas.width / 2 - 100, y: 140, width: 200, height: 15 }],
      bullets: 4,
      agent: { x: canvas.width / 2 - 110, y: canvas.height - 40 },
    },
    // 42
    {
      enemies: [
        { x: 220, y: 100, size: 120 },
        { x: canvas.width - 220, y: 100, size: 120 },
        { x: canvas.width / 2, y: 210, size: 120 },
        { x: 220, y: canvas.height - 290, size: 120 },
        { x: canvas.width - 220, y: canvas.height - 290, size: 120 },
      ],
      walls: [
        { x: 100, y: 150, width: 15, height: 80 },
        { x: canvas.width - 115, y: 150, width: 15, height: 80 },
        { x: canvas.width / 2 - 90, y: 240, width: 180, height: 15 },
      ],
      bullets: 5,
      agent: { x: 180, y: canvas.height - 40 },
    },
    // 43
    {
      enemies: [
        { x: 200, y: 90, size: 120 },
        { x: canvas.width - 200, y: 90, size: 120 },
        { x: canvas.width / 2, y: 200, size: 120 },
        { x: 200, y: canvas.height - 310, size: 120 },
        { x: canvas.width - 200, y: canvas.height - 310, size: 120 },
      ],
      walls: [
        { x: canvas.width / 2 - 110, y: 150, width: 220, height: 15 },
        { x: 80, y: 200, width: 15, height: 80 },
      ],
      bullets: 4,
      agent: { x: canvas.width / 2, y: canvas.height - 40 },
    },
    // 44
    {
      enemies: [
        { x: 250, y: 80, size: 120 },
        { x: canvas.width - 250, y: 80, size: 120 },
        { x: canvas.width / 2, y: 180, size: 120 },
        { x: 250, y: canvas.height - 290, size: 120 },
        { x: canvas.width - 250, y: canvas.height - 290, size: 120 },
      ],
      walls: [{ x: 150, y: 130, width: 15, height: 80 }],
      bullets: 4,
      agent: { x: 170, y: canvas.height - 40 },
    },
    // 45
    {
      enemies: [
        { x: 300, y: 100, size: 120 },
        { x: canvas.width - 300, y: 100, size: 120 },
        { x: canvas.width / 2, y: 220, size: 120 },
        { x: 300, y: canvas.height - 280, size: 120 },
        { x: canvas.width - 300, y: canvas.height - 280, size: 120 },
      ],
      walls: [{ x: canvas.width / 2 - 80, y: 160, width: 160, height: 15 }],
      bullets: 4,
      agent: { x: canvas.width / 2 - 130, y: canvas.height - 40 },
    },
    // 46
    {
      enemies: [
        { x: 220, y: 110, size: 120 },
        { x: canvas.width - 220, y: 110, size: 120 },
        { x: canvas.width / 2, y: 230, size: 120 },
        { x: 220, y: canvas.height - 270, size: 120 },
        { x: canvas.width - 220, y: canvas.height - 270, size: 120 },
      ],
      walls: [
        { x: 120, y: 160, width: 15, height: 80 },
        { x: canvas.width - 135, y: 160, width: 15, height: 80 },
        { x: canvas.width / 2 - 100, y: 250, width: 200, height: 15 },
      ],
      bullets: 4,
      agent: { x: 160, y: canvas.height - 40 },
    },
    // 47
    {
      enemies: [
        { x: 180, y: 80, size: 120 },
        { x: canvas.width - 180, y: 80, size: 120 },
        { x: canvas.width / 2, y: 200, size: 120 },
        { x: 180, y: canvas.height - 300, size: 120 },
        { x: canvas.width - 180, y: canvas.height - 300, size: 120 },
      ],
      walls: [
        { x: canvas.width / 2 - 120, y: 150, width: 240, height: 15 },
        { x: 100, y: 200, width: 15, height: 80 },
        { x: canvas.width - 115, y: 200, width: 15, height: 80 },
      ],
      bullets: 5,
      agent: { x: canvas.width / 2, y: canvas.height - 40 },
    },
    // 48
    {
      enemies: [
        { x: 280, y: 90, size: 120 },
        { x: canvas.width - 280, y: 90, size: 120 },
        { x: canvas.width / 2, y: 190, size: 120 },
        { x: 280, y: canvas.height - 290, size: 120 },
        { x: canvas.width - 280, y: canvas.height - 290, size: 120 },
      ],
      walls: [{ x: 180, y: 140, width: 15, height: 80 }],
      bullets: 4,
      agent: { x: 170, y: canvas.height - 40 },
    },
    // 49
    {
      enemies: [
        { x: 200, y: 120, size: 120 },
        { x: canvas.width - 200, y: 120, size: 120 },
        { x: canvas.width / 2, y: 240, size: 120 },
        { x: 200, y: canvas.height - 260, size: 120 },
        { x: canvas.width - 200, y: canvas.height - 260, size: 120 },
      ],
      walls: [{ x: canvas.width / 2 - 90, y: 170, width: 180, height: 15 }],
      bullets: 4,
      agent: { x: canvas.width / 2 - 70, y: canvas.height - 40 },
    },
    // 50
    {
      enemies: [
        { x: 320, y: 80, size: 120 },
        { x: canvas.width - 320, y: 80, size: 120 },
        { x: canvas.width / 2, y: 180, size: 120 },
        { x: 320, y: canvas.height - 310, size: 120 },
        { x: canvas.width - 320, y: canvas.height - 310, size: 120 },
      ],
      walls: [{ x: 200, y: 130, width: 15, height: 80 }],
      bullets: 4,
      agent: { x: 150, y: canvas.height - 40 },
    },
    // Уровни 51–60
    // 51
    {
      enemies: [
        { x: 240, y: 100, size: 120 },
        { x: canvas.width - 240, y: 100, size: 120 },
        { x: canvas.width / 2, y: 220, size: 120 },
        { x: 240, y: canvas.height - 290, size: 120 },
        { x: canvas.width - 240, y: canvas.height - 290, size: 120 },
      ],
      walls: [
        { x: canvas.width / 2 - 110, y: 160, width: 220, height: 15 },
        { x: 140, y: 210, width: 15, height: 80 },
        { x: canvas.width - 155, y: 210, width: 15, height: 80 },
      ],
      bullets: 4,
      agent: { x: canvas.width / 2, y: canvas.height - 40 },
    },
    // 52
    {
      enemies: [
        { x: 200, y: 110, size: 120 },
        { x: canvas.width - 200, y: 110, size: 120 },
        { x: canvas.width / 2, y: 230, size: 120 },
        { x: 200, y: canvas.height - 280, size: 120 },
        { x: canvas.width - 200, y: canvas.height - 280, size: 120 },
      ],
      walls: [
        { x: 120, y: 160, width: 15, height: 80 },
        { x: canvas.width - 135, y: 160, width: 15, height: 80 },
      ],
      bullets: 4,
      agent: { x: 160, y: canvas.height - 40 },
    },
    // 53
    {
      enemies: [
        { x: 280, y: 80, size: 120 },
        { x: canvas.width - 280, y: 80, size: 120 },
        { x: canvas.width / 2, y: 190, size: 120 },
        { x: 280, y: canvas.height - 300, size: 120 },
        { x: canvas.width - 280, y: canvas.height - 300, size: 120 },
      ],
      walls: [{ x: canvas.width / 2 - 100, y: 140, width: 200, height: 15 }],
      bullets: 4,
      agent: { x: canvas.width / 2 - 110, y: canvas.height - 40 },
    },
    // 54
    {
      enemies: [
        { x: 220, y: 100, size: 120 },
        { x: canvas.width - 220, y: 100, size: 120 },
        { x: canvas.width / 2, y: 210, size: 120 },
        { x: 220, y: canvas.height - 290, size: 120 },
        { x: canvas.width - 220, y: canvas.height - 290, size: 120 },
      ],
      walls: [
        { x: 100, y: 150, width: 15, height: 80 },
        { x: canvas.width - 115, y: 150, width: 15, height: 80 },
        { x: canvas.width / 2 - 90, y: 240, width: 180, height: 15 },
      ],
      bullets: 5,
      agent: { x: 180, y: canvas.height - 40 },
    },
    // 55
    {
      enemies: [
        { x: 200, y: 90, size: 120 },
        { x: canvas.width - 200, y: 90, size: 120 },
        { x: canvas.width / 2, y: 200, size: 120 },
        { x: 200, y: canvas.height - 310, size: 120 },
        { x: canvas.width - 200, y: canvas.height - 310, size: 120 },
      ],
      walls: [
        { x: canvas.width / 2 - 110, y: 150, width: 220, height: 15 },
        { x: 80, y: 200, width: 15, height: 80 },
      ],
      bullets: 4,
      agent: { x: canvas.width / 2, y: canvas.height - 40 },
    },
    // 56
    {
      enemies: [
        { x: 250, y: 80, size: 120 },
        { x: canvas.width - 250, y: 80, size: 120 },
        { x: canvas.width / 2, y: 180, size: 120 },
        { x: 250, y: canvas.height - 290, size: 120 },
        { x: canvas.width - 250, y: canvas.height - 290, size: 120 },
      ],
      walls: [{ x: 150, y: 130, width: 15, height: 80 }],
      bullets: 4,
      agent: { x: 170, y: canvas.height - 40 },
    },
    // 57
    {
      enemies: [
        { x: 300, y: 100, size: 120 },
        { x: canvas.width - 300, y: 100, size: 120 },
        { x: canvas.width / 2, y: 220, size: 120 },
        { x: 300, y: canvas.height - 280, size: 120 },
        { x: canvas.width - 300, y: canvas.height - 280, size: 120 },
      ],
      walls: [{ x: canvas.width / 2 - 80, y: 160, width: 160, height: 15 }],
      bullets: 4,
      agent: { x: canvas.width / 2 - 130, y: canvas.height - 40 },
    },
    // Уровни 61–67
    // 61
    {
      enemies: [
        { x: 220, y: 110, size: 120 },
        { x: canvas.width - 220, y: 110, size: 120 },
        { x: canvas.width / 2, y: 230, size: 120 },
        { x: 220, y: canvas.height - 270, size: 120 },
        { x: canvas.width - 220, y: canvas.height - 270, size: 120 },
      ],
      walls: [
        { x: 120, y: 160, width: 15, height: 80 },
        { x: canvas.width - 135, y: 160, width: 15, height: 80 },
        { x: canvas.width / 2 - 100, y: 250, width: 200, height: 15 },
      ],
      bullets: 4,
      agent: { x: 160, y: canvas.height - 40 },
    },
    // 62
    {
      enemies: [
        { x: 180, y: 80, size: 120 },
        { x: canvas.width - 180, y: 80, size: 120 },
        { x: canvas.width / 2, y: 200, size: 120 },
        { x: 180, y: canvas.height - 300, size: 120 },
        { x: canvas.width - 180, y: canvas.height - 300, size: 120 },
      ],
      walls: [
        { x: canvas.width / 2 - 120, y: 150, width: 240, height: 15 },
        { x: 100, y: 200, width: 15, height: 80 },
        { x: canvas.width - 115, y: 200, width: 15, height: 80 },
      ],
      bullets: 5,
      agent: { x: canvas.width / 2, y: canvas.height - 40 },
    },
    // 63
    {
      enemies: [
        { x: 280, y: 90, size: 120 },
        { x: canvas.width - 280, y: 90, size: 120 },
        { x: canvas.width / 2, y: 190, size: 120 },
        { x: 280, y: canvas.height - 290, size: 120 },
        { x: canvas.width - 280, y: canvas.height - 290, size: 120 },
      ],
      walls: [{ x: 180, y: 140, width: 15, height: 80 }],
      bullets: 4,
      agent: { x: 170, y: canvas.height - 40 },
    },
    // 64
    {
      enemies: [
        { x: 200, y: 120, size: 120 },
        { x: canvas.width - 200, y: 120, size: 120 },
        { x: canvas.width / 2, y: 240, size: 120 },
        { x: 200, y: canvas.height - 260, size: 120 },
        { x: canvas.width - 200, y: canvas.height - 260, size: 120 },
      ],
      walls: [{ x: canvas.width / 2 - 90, y: 170, width: 180, height: 15 }],
      bullets: 4,
      agent: { x: canvas.width / 2 - 70, y: canvas.height - 40 },
    },
    // 65
    {
      enemies: [
        { x: 320, y: 80, size: 120 },
        { x: canvas.width - 320, y: 80, size: 120 },
        { x: canvas.width / 2, y: 180, size: 120 },
        { x: 320, y: canvas.height - 310, size: 120 },
        { x: canvas.width - 320, y: canvas.height - 310, size: 120 },
      ],
      walls: [{ x: 200, y: 130, width: 15, height: 80 }],
      bullets: 4,
      agent: { x: 150, y: canvas.height - 40 },
    },
    // 66
    {
      enemies: [
        { x: 240, y: 100, size: 120 },
        { x: canvas.width - 240, y: 100, size: 120 },
        { x: canvas.width / 2, y: 220, size: 120 },
        { x: 240, y: canvas.height - 290, size: 120 },
        { x: canvas.width - 240, y: canvas.height - 290, size: 120 },
      ],
      walls: [
        { x: canvas.width / 2 - 110, y: 160, width: 220, height: 15 },
        { x: 140, y: 210, width: 15, height: 80 },
        { x: canvas.width - 155, y: 210, width: 15, height: 80 },
      ],
      bullets: 4,
      agent: { x: canvas.width / 2, y: canvas.height - 40 },
    },
    // 67
    {
      enemies: [
        { x: 200, y: 110, size: 120 },
        { x: canvas.width - 200, y: 110, size: 120 },
        { x: canvas.width / 2, y: 230, size: 120 },
        { x: 200, y: canvas.height - 280, size: 120 },
        { x: canvas.width - 200, y: canvas.height - 280, size: 120 },
      ],
      walls: [
        { x: 120, y: 160, width: 15, height: 80 },
        { x: canvas.width - 135, y: 160, width: 15, height: 80 },
      ],
      bullets: 4,
      agent: { x: 160, y: canvas.height - 40 },
    },
    // Уровень 65 (агент слева)
    {
      enemies: [
        { x: 200, y: 80, size: 120 },
        { x: canvas.width - 200, y: 80, size: 120 },
        { x: canvas.width / 2, y: 180, size: 120 },
        { x: 200, y: canvas.height - 300, size: 120 },
        { x: canvas.width - 200, y: canvas.height - 300, size: 120 },
      ],
      walls: [
        { x: 120, y: 130, width: 15, height: 80 },
        { x: canvas.width - 135, y: 130, width: 15, height: 80 },
      ],
      bullets: 4,
      agent: { x: 160, y: canvas.height - 40 },
    },
    // Уровень 66 (агент по центру)
    {
      enemies: [
        { x: 180, y: 100, size: 120 },
        { x: canvas.width - 180, y: 100, size: 120 },
        { x: canvas.width / 2, y: 220, size: 120 },
        { x: 180, y: canvas.height - 280, size: 120 },
        { x: canvas.width - 180, y: canvas.height - 280, size: 120 },
      ],
      walls: [{ x: canvas.width / 2 - 110, y: 160, width: 220, height: 15 }],
      bullets: 5,
      agent: { x: canvas.width / 2, y: canvas.height - 40 },
    },
    // Уровень 67 (агент левее центра)
    {
      enemies: [
        { x: 250, y: 90, size: 120 },
        { x: canvas.width - 250, y: 90, size: 120 },
        { x: canvas.width / 2, y: 200, size: 120 },
        { x: 250, y: canvas.height - 290, size: 120 },
        { x: canvas.width - 250, y: canvas.height - 290, size: 120 },
      ],
      walls: [
        { x: 140, y: 140, width: 15, height: 80 },
        { x: canvas.width - 155, y: 140, width: 15, height: 80 },
        { x: canvas.width / 2 - 90, y: 240, width: 180, height: 15 },
      ],
      bullets: 4,
      agent: { x: canvas.width / 2 - 120, y: canvas.height - 40 },
    },
  ];

  function loadLevel(levelIndex) {
    if (levelIndex >= levels.length) {
      gameState = "victory";
      victoryScreen.style.display = "flex";
      playVictorySound();
      canvas.style.display = "none";
      restartButton.style.display = "none";
      levelSelectButton.style.display = "none";
      return;
    }
    const level = levels[levelIndex];
    enemies = level.enemies.map((e) => ({ ...e, active: true }));
    walls = level.walls ? level.walls.slice() : [];
    bulletsLeft = level.bullets;
    levelComplete = false;
    gameOver = false;
    bullets = [];
    explosionParticles = [];
    sparkParticles = [];
    killCount = 0;

    if (level.agent) {
      agent.x = level.agent.x;
      agent.y = level.agent.y;
    } else {
      agent.x = canvas.width / 2;
      agent.y = canvas.height - 40;
    }
    agent.y -= 30;
    agent.y -= 30;
    if (isMobile) agent.y -= 20; // теперь общее смещение -50 пикселей
    restartButton.style.display = "none";
    levelSelectButton.style.display = "none";
    agentAngle = 0;
    lastMuzzle = { x: agent.x, y: agent.y };
  }

  function checkLevelComplete() {
    const allDead = enemies.every((enemy) => !enemy.active);
    if (allDead && !levelComplete) {
      levelComplete = true;
      if (!unlockedLevels.includes(currentLevel)) {
        unlockedLevels.push(currentLevel);
        saveProgress();
      }
      setTimeout(() => {
        if (currentLevel === levels.length - 1) {
          gameState = "victory";
          victoryScreen.style.display = "flex";
          playVictorySound();
          canvas.style.display = "none";
          restartButton.style.display = "none";
          levelSelectButton.style.display = "none";
        } else {
          showLevelSelect();
        }
      }, 1500);
    }
  }

  function checkGameOver() {
    if (bulletsLeft <= 0 && bullets.length === 0 && !levelComplete) {
      gameOver = true;
      restartButton.style.display = "block";
      levelSelectButton.style.display = "block";
    }
  }

  restartButton.addEventListener("click", () => {
    playClickSound();
    loadLevel(currentLevel);
  });

  levelSelectButton.addEventListener("click", () => {
    playClickSound();
    showLevelSelect();
  });

  playButton.addEventListener("click", () => {
    playClickSound();
    showLevelSelect();
  });

  backButton.addEventListener("click", () => {
    playClickSound();
    showMenu();
  });

  // --- МЫШЬ ---
  canvas.addEventListener("mousemove", function (e) {
    if (gameState !== "playing") return;
    const { x, y } = getCanvasCoords(e.clientX, e.clientY);
    mouseX = x;
    mouseY = y;
    const dx = mouseX - agent.x;
    const dy = mouseY - agent.y;
    agentAngle = Math.atan2(-dy, dx);
  });

  canvas.addEventListener("click", function (e) {
    if (gameState !== "playing") return;
    if (levelComplete || gameOver) return;
    if (bulletsLeft <= 0) return;

    const { x: clickX, y: clickY } = getCanvasCoords(e.clientX, e.clientY);
    const dx = clickX - lastMuzzle.x;
    const dy = clickY - lastMuzzle.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 5) return;

    const dirX = dx / distance;
    const dirY = dy / distance;
    const speed = isMobile ? 22 : 10;

    bullets.push({
      x: lastMuzzle.x,
      y: lastMuzzle.y,
      vx: dirX * speed,
      vy: dirY * speed,
      radius: 3,
      active: true,
      ricochets: 0,
      trail: [],
    });

    bulletsLeft--;
    shakeAmount = INITIAL_SHAKE;
    fireSound();
  });

  // --- TOUCH УПРАВЛЕНИЕ ---
  canvas.addEventListener(
    "touchstart",
    function (e) {
      if (gameState !== "playing") return;
      e.preventDefault();
      const touch = e.touches[0];
      const { x, y } = getCanvasCoords(touch.clientX, touch.clientY);
      mouseX = x;
      mouseY = y;
      const dx = mouseX - agent.x;
      const dy = mouseY - agent.y;
      agentAngle = Math.atan2(-dy, dx);
    },
    { passive: false },
  );

  canvas.addEventListener(
    "touchmove",
    function (e) {
      if (gameState !== "playing") return;
      e.preventDefault();
      const touch = e.touches[0];
      const { x, y } = getCanvasCoords(touch.clientX, touch.clientY);
      mouseX = x;
      mouseY = y;
      const dx = mouseX - agent.x;
      const dy = mouseY - agent.y;
      agentAngle = Math.atan2(-dy, dx);
    },
    { passive: false },
  );

  canvas.addEventListener(
    "touchend",
    function (e) {
      if (gameState !== "playing") return;
      e.preventDefault();
      const touch = e.changedTouches[0];
      const { x, y } = getCanvasCoords(touch.clientX, touch.clientY);

      if (bulletsLeft > 0 && !levelComplete && !gameOver) {
        const dx = x - lastMuzzle.x;
        const dy = y - lastMuzzle.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance >= 5) {
          const dirX = dx / distance;
          const dirY = dy / distance;
          const speed = isMobile ? 22 : 10;
          bullets.push({
            x: lastMuzzle.x,
            y: lastMuzzle.y,
            vx: dirX * speed,
            vy: dirY * speed,
            radius: 3,
            active: true,
            ricochets: 0,
            trail: [],
          });
          bulletsLeft--;
          shakeAmount = INITIAL_SHAKE;
          fireSound();
        }
      }
      mouseX = agent.x;
      mouseY = agent.y;
    },
    { passive: false },
  );

  // --- ФИЗИКА ---
  function handleWallCollision(bullet, wall) {
    const closestX = Math.max(wall.x, Math.min(bullet.x, wall.x + wall.width));
    const closestY = Math.max(wall.y, Math.min(bullet.y, wall.y + wall.height));
    const dx = bullet.x - closestX;
    const dy = bullet.y - closestY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bullet.radius) {
      if (dist === 0) {
        const overlapLeft = bullet.x - wall.x;
        const overlapRight = wall.x + wall.width - bullet.x;
        const overlapTop = bullet.y - wall.y;
        const overlapBottom = wall.y + wall.height - bullet.y;
        const minOverlapX = Math.min(overlapLeft, overlapRight);
        const minOverlapY = Math.min(overlapTop, overlapBottom);
        if (minOverlapX < minOverlapY) {
          bullet.vx = -bullet.vx;
          if (overlapLeft < overlapRight) bullet.x = wall.x - bullet.radius;
          else bullet.x = wall.x + wall.width + bullet.radius;
        } else {
          bullet.vy = -bullet.vy;
          if (overlapTop < overlapBottom) bullet.y = wall.y - bullet.radius;
          else bullet.y = wall.y + wall.height + bullet.radius;
        }
      } else {
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = bullet.radius - dist;
        bullet.x += nx * overlap;
        bullet.y += ny * overlap;
        const dot = bullet.vx * nx + bullet.vy * ny;
        bullet.vx -= 2 * dot * nx;
        bullet.vy -= 2 * dot * ny;
      }
      return true;
    }
    return false;
  }

  // --- ОТРИСОВКА АГЕНТА (визуальное увеличение только на мобильных) ---
  function drawAgentWithArm() {
    const bodyImg = images.agentBody;
    const armImg = images.agentArm;
    const scale = isMobile ? 1.4 : 1.0; // мобильный множитель
    const agentHeight = agent.height * scale;
    const agentWidth = agentHeight * AGENT_ASPECT;

    if (!bodyImg.complete || !armImg.complete) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(
        agent.x - agentWidth / 2,
        agent.y - agentHeight / 2,
        agentWidth,
        agentHeight,
      );
      return { x: agent.x + agentWidth / 2, y: agent.y };
    }

    ctx.drawImage(
      bodyImg,
      agent.x - agentWidth / 2,
      agent.y - agentHeight / 2,
      agentWidth,
      agentHeight,
    );

    const shoulderX = agent.x + agentWidth * -0.05;
    const shoulderY = agent.y - agentHeight * 0.12;

    const realArmWidth = 1024;
    const realArmHeight = 1536;

    const armWidth = agentHeight * 0.55;
    const armHeight = armWidth * (realArmHeight / realArmWidth);

    const jointX = 312;
    const jointY = 787;

    const offsetX = jointX * (armWidth / realArmWidth);
    const offsetY = jointY * (armHeight / realArmHeight);

    ctx.save();
    ctx.translate(shoulderX, shoulderY);
    ctx.rotate(-agentAngle);
    ctx.drawImage(armImg, -offsetX, -offsetY, armWidth, armHeight);
    ctx.restore();

    const muzzleRelX = armWidth - offsetX + 8;
    const muzzleRelY = armHeight / 2 - offsetY + 24;
    const cos = Math.cos(agentAngle);
    const sin = Math.sin(agentAngle);
    const muzzleX = shoulderX + muzzleRelX * cos - muzzleRelY * sin;
    const muzzleY = shoulderY - muzzleRelX * sin - muzzleRelY * cos;

    return { x: muzzleX, y: muzzleY };
  }

  // --- ОТРИСОВКА ВРАГА (визуальное увеличение только на мобильных) ---
  function drawEnemySprite(enemy) {
    const img = images.enemy;
    const scale = isMobile ? 1.4 : 1.0;
    const height = enemy.size * scale;
    const width = height * ENEMY_ASPECT;
    const x = enemy.x;
    const y = enemy.y;

    if (!img.complete) {
      ctx.fillStyle = "#888";
      ctx.fillRect(x - width / 2, y - height / 2, width, height);
      return;
    }

    if (!isMobile) {
      const outlineColor = "#dd0000";
      const outlineWidth = 1;
      for (let dx = -outlineWidth; dx <= outlineWidth; dx += 2) {
        for (let dy = -outlineWidth; dy <= outlineWidth; dy += 2) {
          if (dx === 0 && dy === 0) continue;
          const tmpCanvas = document.createElement("canvas");
          tmpCanvas.width = width;
          tmpCanvas.height = height;
          const tmpCtx = tmpCanvas.getContext("2d");
          tmpCtx.drawImage(img, 0, 0, width, height);
          tmpCtx.globalCompositeOperation = "source-in";
          tmpCtx.fillStyle = outlineColor;
          tmpCtx.fillRect(0, 0, width, height);
          ctx.drawImage(
            tmpCanvas,
            x - width / 2 + dx,
            y - height / 2 + dy,
            width,
            height,
          );
        }
      }
    }

    ctx.drawImage(img, x - width / 2, y - height / 2, width, height);
  }

  // --- ПРОВЕРКА СТОЛКНОВЕНИЯ ---
  function circleRectCollision(bullet, rect) {
    const closestX = Math.max(rect.x, Math.min(bullet.x, rect.x + rect.width));
    const closestY = Math.max(rect.y, Math.min(bullet.y, rect.y + rect.height));
    const dx = bullet.x - closestX;
    const dy = bullet.y - closestY;
    return dx * dx + dy * dy < bullet.radius * bullet.radius;
  }

  // --- ГЛАВНЫЙ ИГРОВОЙ ЦИКЛ ---
  function gameLoop() {
    if (gameState !== "playing") {
      requestAnimationFrame(gameLoop);
      return;
    }

    if (shakeAmount > 0.5) {
      const shakeX = (Math.random() - 0.5) * shakeAmount * 2;
      const shakeY = (Math.random() - 0.5) * shakeAmount * 2;
      canvas.style.transform = `translate(${shakeX}px, ${shakeY}px)`;
      shakeAmount *= SHAKE_DECAY;
    } else {
      canvas.style.transform = "translate(0, 0)";
      shakeAmount = 0;
    }

    if (images.background.complete) {
      ctx.drawImage(images.background, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (isMobile) {
      // Редкие полосы для телефонов (каждые 8 пикселей)
      ctx.fillStyle = "rgba(0, 20, 0, 0.15)";
      for (let y = 0; y < canvas.height; y += 8) {
        ctx.fillRect(0, y, canvas.width, 2);
      }
    } else {
      // Частые полосы для ПК (каждые 4 пикселя)
      ctx.fillStyle = "rgba(0, 20, 0, 0.15)";
      for (let y = 0; y < canvas.height; y += 4) {
        ctx.fillRect(0, y, canvas.width, 2);
      }
    }

    const pattern = getWallPattern();
    if (pattern) {
      for (let wall of walls) {
        ctx.fillStyle = pattern;
        ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
        if (!isMobile) {
          ctx.strokeStyle = "#000";
          ctx.lineWidth = 2;
          ctx.strokeRect(wall.x, wall.y, wall.width, wall.height);
        }
      }
    } else {
      for (let wall of walls) {
        ctx.fillStyle = "#444";
        ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
        if (!isMobile) {
          ctx.strokeStyle = "#000";
          ctx.lineWidth = 2;
          ctx.strokeRect(wall.x, wall.y, wall.width, wall.height);
        }
      }
    }

    for (let enemy of enemies) {
      if (!enemy.active) continue;
      drawEnemySprite(enemy);
    }

    const muzzle = drawAgentWithArm();
    lastMuzzle = muzzle;

    if (bulletsLeft > 0 && !levelComplete && !gameOver) {
      ctx.save();
      ctx.strokeStyle = "#ff0";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(muzzle.x, muzzle.y);
      ctx.lineTo(mouseX, mouseY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    for (let i = 0; i < bullets.length; i++) {
      const bullet = bullets[i];
      if (!bullet.active) continue;

      const substeps = isMobile ? 2 : 4;
      let collided = false;
      for (let s = 0; s < substeps; s++) {
        bullet.x += bullet.vx / substeps;
        bullet.y += bullet.vy / substeps;

        for (let wall of walls) {
          if (handleWallCollision(bullet, wall)) {
            bullet.ricochets++;
            ricochetSound();
            if (bullet.ricochets > MAX_RICOCHETS) {
              bullet.active = false;
            }
            collided = true;
            break;
          }
        }
        if (!bullet.active || collided) break;
      }

      // След пули только на ПК
      bullet.trail.push({ x: bullet.x, y: bullet.y });
      if (bullet.trail.length > 12) bullet.trail.shift();

      for (let enemy of enemies) {
        if (!enemy.active) continue;

        const enemyWidth = enemy.size * ENEMY_ASPECT;
        const enemyHeight = enemy.size;

        const rect = {
          x: enemy.x - enemyWidth * 0.28,
          y: enemy.y - enemyHeight * (isMobile ? 0.39 : 0.33), // верх: 0.39 вместо 0.36
          width: enemyWidth * 0.53,
          height: enemyHeight * (isMobile ? 0.88 : 0.72), // высота: 0.88 вместо 0.82
        };

        if (circleRectCollision(bullet, rect)) {
          enemy.active = false;

          killCount++;
          const killSoundName = "kill" + Math.min(killCount, 5);
          playSound(killSoundName, 0.9);

          const particleCount = isMobile ? 4 : 12;
          for (let j = 0; j < particleCount; j++) {
            explosionParticles.push(
              new Particle(
                enemy.x,
                enemy.y,
                "rgb(207, 31, 0)",
                3,
                15 + Math.random() * 10,
                4,
              ),
            );
          }
          bullet.ricochets++;
          ricochetSound();
          if (bullet.ricochets > MAX_RICOCHETS) bullet.active = false;
          checkLevelComplete();
          checkGameOver();
          break;
        }
      }
      if (!bullet.active) continue;

      for (let wall of walls) {
        if (handleWallCollision(bullet, wall)) {
          bullet.ricochets++;
          ricochetSound();
          if (bullet.ricochets > MAX_RICOCHETS) bullet.active = false;
          break;
        }
      }
      if (!bullet.active) continue;

      let bounced = false;
      if (bullet.x - bullet.radius <= 0) {
        bullet.x = bullet.radius;
        bullet.vx = -bullet.vx;
        bounced = true;
      } else if (bullet.x + bullet.radius >= canvas.width) {
        bullet.x = canvas.width - bullet.radius;
        bullet.vx = -bullet.vx;
        bounced = true;
      }
      if (bullet.y - bullet.radius <= 0) {
        bullet.y = bullet.radius;
        bullet.vy = -bullet.vy;
        bounced = true;
      } else if (bullet.y + bullet.radius >= canvas.height) {
        bullet.y = canvas.height - bullet.radius;
        bullet.vy = -bullet.vy;
        bounced = true;
      }

      if (bounced) {
        bullet.ricochets++;
        ricochetSound();
        if (bullet.ricochets > MAX_RICOCHETS) bullet.active = false;
      }

      // Отрисовка следа
      if (bullet.trail.length > 1) {
        ctx.strokeStyle = "#ff0";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bullet.trail[0].x, bullet.trail[0].y);
        for (let t = 1; t < bullet.trail.length; t++) {
          ctx.lineTo(bullet.trail[t].x, bullet.trail[t].y);
        }
        ctx.lineTo(bullet.x, bullet.y);
        ctx.stroke();
      }

      ctx.fillStyle = "#ff0";
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
      if (!isMobile) {
        ctx.shadowColor = "#ff0";
        ctx.shadowBlur = 8;
      }
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
    }

    for (let i = explosionParticles.length - 1; i >= 0; i--) {
      const p = explosionParticles[i];
      p.update();
      if (p.isDead) explosionParticles.splice(i, 1);
      else p.draw(ctx);
    }
    if (!isMobile) {
      for (let i = sparkParticles.length - 1; i >= 0; i--) {
        const p = sparkParticles[i];
        p.update();
        if (p.isDead) sparkParticles.splice(i, 1);
        else p.draw(ctx);
      }
    } else {
      sparkParticles = [];
    }

    bullets = bullets.filter((b) => b.active);
    checkGameOver();

    ctx.fillStyle = "#fff";
    ctx.font = 'bold 20px "Courier New", monospace';
    if (!isMobile) {
      ctx.shadowColor = "#000";
      ctx.shadowBlur = 4;
    }
    ctx.textAlign = "left";
    ctx.fillText(`УРОВЕНЬ ${currentLevel + 1}`, 20, 35);
    ctx.fillText(`ПАТРОНЫ ${bulletsLeft}`, 20, 65);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    if (levelComplete) {
      ctx.fillStyle = "rgb(0, 212, 0)";
      ctx.font = 'bold 48px "Courier New", monospace';
      ctx.textAlign = "center";
      ctx.fillText("УРОВЕНЬ ПРОЙДЕН", canvas.width / 2, canvas.height / 2 - 20);
    }
    if (gameOver) {
      ctx.fillStyle = "rgb(202, 0, 0)";
      ctx.font = 'bold 48px "Courier New", monospace';
      ctx.textAlign = "center";
      ctx.fillText("ПРОВАЛ", canvas.width / 2, canvas.height / 2 - 20);
    }

    requestAnimationFrame(gameLoop);
  }

  // Закрытие финального экрана
  victoryScreen.addEventListener("click", () => {
    victoryScreen.style.display = "none";
    showMenu();
  });

  window.addEventListener("keydown", (e) => {
    if (gameState === "victory") {
      victoryScreen.style.display = "none";
      showMenu();
    }
  });

  // Кнопка фулскрина
  const fullscreenBtn = document.getElementById("fullscreenBtn");

  if (document.fullscreenEnabled || document.webkitFullscreenEnabled) {
    fullscreenBtn.style.display = "block";
  }

  fullscreenBtn.addEventListener("click", () => {
    const el = document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen();
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    }
    fullscreenBtn.style.display = "none";
  });

  // --- ЗАПУСК ---
  loadProgress();
  showMenu();
  gameLoop();
};
