window.onload = function () {
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  // --- Элементы интерфейса ---
  const menuScreen = document.getElementById("menuScreen");
  const levelSelectScreen = document.getElementById("levelSelectScreen");
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
          playClickSound(); // ← звук клика
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
  canvas.width = window.innerWidth * 0.8;
  canvas.height = window.innerHeight * 0.8;

  let currentLevel = 0;
  let enemies = [];
  let walls = [];
  let bulletsLeft = 0;
  let levelComplete = false;
  let gameOver = false;
  let killCount = 0; // счётчик убийств на уровне

  // Агент: его высота (размер по вертикали), ширина вычисляется по пропорции 1024/1536 ≈ 2/3
  const agent = {
    x: canvas.width / 2,
    y: canvas.height - 40,
    height: 250, // можешь изменить высоту агента здесь
  };

  // Соотношения сторон спрайтов
  const AGENT_ASPECT = 1024 / 1536; // ширина / высота ≈ 0.6667
  const ENEMY_ASPECT = 1023 / 1536; // ≈ 0.6660

  let bullets = [];
  let explosionParticles = [];
  let sparkParticles = [];
  let mouseX = agent.x;
  let mouseY = agent.y;
  let agentAngle = 0;
  let lastMuzzle = { x: agent.x, y: agent.y };

  const MAX_RICOCHETS = 8;

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
  for (let k = 1; k <= 5; k++) {
    loadSound("kill" + k, "sounds/kill" + k + ".mp3");
  }
  loadSound("click", "sounds/click.mp3");
  function playClickSound() {
    playSound("click", 0.7); // громкость можно менять (0.7 = 70%)
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
    agentBody: new Image(), // <-- ДОБАВЬ ЭТО
    agentArm: new Image(), // <-- ДОБАВЬ ЭТО
  };
  images.agentBody.src = "images/agent_body.png";
  images.agentArm.src = "images/agent_arm.png";
  images.agent.src = "images/agent.png";
  images.enemy.src = "images/enemy.png";
  images.wall.src = "images/wall.png";
  images.background.src = "images/bg.png";

  // --- КЛАСС ЧАСТИЦЫ ---
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

  // --- УРОВНИ (size у врагов теперь означает высоту) ---
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
        { x: 150, y: 80, size: 120 },
        { x: canvas.width - 150, y: 80, size: 120 },
        { x: canvas.width / 2 - 40, y: 200, size: 120 },
        { x: canvas.width / 2 + 40, y: 200, size: 120 },
        { x: canvas.width / 2, y: 320, size: 120 },
      ],
      walls: [
        { x: 80, y: 120, width: 100, height: 15 },
        { x: canvas.width - 180, y: 120, width: 100, height: 15 },
        { x: canvas.width / 2 - 6, y: 160, width: 15, height: 100 },
        { x: canvas.width / 2 - 80, y: 260, width: 160, height: 15 },
        { x: 200, y: 300, width: 15, height: 80 },
        { x: canvas.width - 212, y: 300, width: 15, height: 80 },
      ],
      bullets: 4,
      agent: { x: canvas.width / 2, y: canvas.height - 40 },
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
        { x: 180, y: 100, size: 120 },
        { x: canvas.width - 180, y: 100, size: 120 },
        { x: canvas.width / 2, y: 200, size: 120 },
        { x: 120, y: 300, size: 120 },
        { x: canvas.width - 120, y: 300, size: 120 },
      ],
      walls: [
        { x: 80, y: 250, width: 15, height: 80 },
        { x: canvas.width - 92, y: 250, width: 15, height: 80 },
        { x: canvas.width / 2 - 80, y: 160, width: 160, height: 15 },
      ],
      bullets: 4,
      agent: { x: canvas.width / 2, y: canvas.height - 40 },
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
  ];

  function loadLevel(levelIndex) {
    if (levelIndex >= levels.length) {
      alert("AGENT 67 WINS!");
      currentLevel = 0;
      loadLevel(0);
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
    agent.y -= 30; // поднять агента выше

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
        showLevelSelect();
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
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
    const dx = mouseX - agent.x;
    const dy = mouseY - agent.y;
    agentAngle = Math.atan2(-dy, dx);
  });

  canvas.addEventListener("click", function (e) {
    if (gameState !== "playing") return;
    if (levelComplete || gameOver) return;
    if (bulletsLeft <= 0) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const dx = clickX - lastMuzzle.x;
    const dy = clickY - lastMuzzle.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 5) return;

    const dirX = dx / distance;
    const dirY = dy / distance;
    const speed = 10;

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
    fireSound();
  });

  // --- TOUCH УПРАВЛЕНИЕ ---
  canvas.addEventListener(
    "touchstart",
    function (e) {
      if (gameState !== "playing") return;
      e.preventDefault();
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      mouseX = touch.clientX - rect.left;
      mouseY = touch.clientY - rect.top;
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
      const rect = canvas.getBoundingClientRect();
      mouseX = touch.clientX - rect.left;
      mouseY = touch.clientY - rect.top;
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
      if (
        mouseX !== undefined &&
        mouseY !== undefined &&
        bulletsLeft > 0 &&
        !levelComplete &&
        !gameOver
      ) {
        const dx = mouseX - lastMuzzle.x;
        const dy = mouseY - lastMuzzle.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance >= 5) {
          const dirX = dx / distance;
          const dirY = dy / distance;
          const speed = 10;
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

  // --- ОТРИСОВКА АГЕНТА (с учётом пропорций) ---
  function drawAgentWithArm() {
    const bodyImg = images.agentBody;
    const armImg = images.agentArm;
    const agentHeight = agent.height;
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

    // --- Тело ---
    ctx.drawImage(
      bodyImg,
      agent.x - agentWidth / 2,
      agent.y - agentHeight / 2,
      agentWidth,
      agentHeight,
    );

    // --- Плечо (точка, вокруг которой вращается рука) ---
    const shoulderX = agent.x + agentWidth * -0.05; // 25% ширины вправо от центра
    const shoulderY = agent.y - agentHeight * 0.12; // 15% высоты вверх от центра

    // --- Реальные размеры arm.png (замени на свои!) ---
    const realArmWidth = 1024;
    const realArmHeight = 1536;

    // --- Желаемый размер руки на экране ---
    const armWidth = agentHeight * 0.55; // длина руки (35% от высоты агента)
    const armHeight = armWidth * (realArmHeight / realArmWidth); // сохраняем пропорции

    // --- Координаты сустава в оригинале (ты замерил: 312, 787) ---
    const jointX = 312;
    const jointY = 787;

    // --- Пересчитываем смещения для масштабированного изображения ---
    const offsetX = jointX * (armWidth / realArmWidth);
    const offsetY = jointY * (armHeight / realArmHeight);

    // --- Рисуем руку с поворотом ---
    ctx.save();
    ctx.translate(shoulderX, shoulderY);
    ctx.rotate(-agentAngle);
    ctx.drawImage(armImg, -offsetX, -offsetY, armWidth, armHeight);
    ctx.restore();

    // --- Положение дула (конец ствола) ---
    const muzzleRelX = armWidth - offsetX + 8; // +5 значит прицел сдвинется дальше от плеча
    const muzzleRelY = armHeight / 2 - offsetY + 24; // -10 поднимет прицел выше  // центр руки по вертикали
    const cos = Math.cos(agentAngle);
    const sin = Math.sin(agentAngle);
    const muzzleX = shoulderX + muzzleRelX * cos - muzzleRelY * sin;
    const muzzleY = shoulderY - muzzleRelX * sin - muzzleRelY * cos;

    return { x: muzzleX, y: muzzleY };
  }

  // --- ОТРИСОВКА ВРАГА (с учётом пропорций) ---
  function drawEnemySprite(enemy) {
    const img = images.enemy;
    const height = enemy.size;
    const width = height * ENEMY_ASPECT;
    const x = enemy.x;
    const y = enemy.y;

    if (!img.complete) {
      ctx.fillStyle = "#888";
      ctx.fillRect(x - width / 2, y - height / 2, width, height);
      return;
    }
    ctx.drawImage(img, x - width / 2, y - height / 2, width, height);
  }

  // --- ПРОВЕРКА СТОЛКНОВЕНИЯ (прямоугольный хитбокс) ---
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

    // Фон
    if (images.background.complete) {
      ctx.drawImage(images.background, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Стены с повторяющейся текстурой (уменьшенной)
    // Стены с повторяющейся текстурой и контуром
    if (images.wall.complete) {
      for (let wall of walls) {
        // Тайлинг (как и было)
        const tileSize = 64;
        const tileCanvas = document.createElement("canvas");
        tileCanvas.width = tileSize;
        tileCanvas.height = tileSize;
        const tileCtx = tileCanvas.getContext("2d");
        tileCtx.drawImage(images.wall, 0, 0, tileSize, tileSize);
        const pattern = ctx.createPattern(tileCanvas, "repeat");
        ctx.fillStyle = pattern;
        ctx.fillRect(wall.x, wall.y, wall.width, wall.height);

        // Чёрный контур (тонкий)
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2; // 2 пикселя — не жирный, но заметный
        ctx.strokeRect(wall.x, wall.y, wall.width, wall.height);
      }
    } else {
      for (let wall of walls) {
        ctx.fillStyle = "#444";
        ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
        // Контур и для серых стен
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2;
        ctx.strokeRect(wall.x, wall.y, wall.width, wall.height);
      }
    }

    // Враги
    for (let enemy of enemies) {
      if (!enemy.active) continue;
      drawEnemySprite(enemy);
    }

    // Агент
    const muzzle = drawAgentWithArm();
    lastMuzzle = muzzle;

    // Прицел (жёлтый пунктир, без точки)
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

    // Пули
    for (let i = 0; i < bullets.length; i++) {
      const bullet = bullets[i];
      if (!bullet.active) continue;

      // Субстеппинг для точных столкновений
      const substeps = 4; // можно 3 или 5, чем больше — тем точнее, но чуть медленнее
      let collided = false;
      for (let s = 0; s < substeps; s++) {
        bullet.x += bullet.vx / substeps;
        bullet.y += bullet.vy / substeps;

        // Проверка стен
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

      bullet.trail.push({ x: bullet.x, y: bullet.y });
      if (bullet.trail.length > 12) bullet.trail.shift();

      // Попадание во врагов
      for (let enemy of enemies) {
        if (!enemy.active) continue;

        // Ширина врага в пикселях (с учётом пропорций)
        const enemyWidth = enemy.size * ENEMY_ASPECT;
        const enemyHeight = enemy.size;

        // Хитбокс: прямоугольник, плотно облегающий фигуру (без лишнего пространства над головой)
        const rect = {
          x: enemy.x - enemyWidth * 0.28,
          y: enemy.y - enemyHeight * 0.33,
          width: enemyWidth * 0.53,
          height: enemyHeight * 0.72,
        };

        if (circleRectCollision(bullet, rect)) {
          enemy.active = false;

          killCount++;
          const killSoundName = "kill" + Math.min(killCount, 5);
          playSound(killSoundName, 0.9);

          // Жёлтые частицы взрыва
          for (let j = 0; j < 12; j++) {
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

      // Стены
      for (let wall of walls) {
        if (handleWallCollision(bullet, wall)) {
          bullet.ricochets++;
          ricochetSound();
          if (bullet.ricochets > MAX_RICOCHETS) bullet.active = false;
          break;
        }
      }
      if (!bullet.active) continue;

      // Границы
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

      // След пули (жёлтый)
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
      // Пуля (жёлтая)
      ctx.fillStyle = "#ff0";
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = "#ff0";
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Частицы
    for (let i = explosionParticles.length - 1; i >= 0; i--) {
      const p = explosionParticles[i];
      p.update();
      if (p.isDead) explosionParticles.splice(i, 1);
      else p.draw(ctx);
    }
    for (let i = sparkParticles.length - 1; i >= 0; i--) {
      const p = sparkParticles[i];
      p.update();
      if (p.isDead) sparkParticles.splice(i, 1);
      else p.draw(ctx);
    }

    bullets = bullets.filter((b) => b.active);
    checkGameOver();

    // UI
    ctx.fillStyle = "#fff";
    ctx.font = 'bold 20px "Courier New", monospace';
    ctx.shadowColor = "#000"; // чёрная тень для контраста
    ctx.shadowBlur = 4;
    ctx.textAlign = "left";
    ctx.fillText(`УРОВЕНЬ ${currentLevel + 1}`, 20, 35);
    ctx.fillText(`ПАТРОНЫ ${bulletsLeft}`, 20, 65); // чуть раздвинул, чтобы не слипались
    ctx.shadowColor = "transparent"; // убираем тень, чтобы не мешала остальному
    ctx.shadowBlur = 0;

    if (levelComplete) {
      ctx.fillStyle = "rgb(0, 212, 0)"; // ярко-зелёный
      ctx.font = 'bold 48px "Courier New", monospace'; // жирный и крупный
      ctx.textAlign = "center";
      ctx.fillText("УРОВЕНЬ ПРОЙДЕН", canvas.width / 2, canvas.height / 2 - 20);
    }
    if (gameOver) {
      ctx.fillStyle = "rgb(202, 0, 0)"; // ярко-красный
      ctx.font = 'bold 48px "Courier New", monospace';
      ctx.textAlign = "center";
      ctx.fillText("ПРОВАЛ", canvas.width / 2, canvas.height / 2 - 20);
    }

    requestAnimationFrame(gameLoop);
  }

  // --- ЗАПУСК ---
  loadProgress();
  showMenu();
  gameLoop();
};
