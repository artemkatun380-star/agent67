window.onload = function() {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    canvas.width = window.innerWidth * 0.8;
    canvas.height = window.innerHeight * 0.8;

    // --- Агент 67 ---
    const agent = {
        x: canvas.width / 2,
        y: canvas.height - 40,
        size: 28
    };

    let bullets = [];
    let mouseX = agent.x;
    let mouseY = agent.y;
    let agentAngle = 0;          // угол поворота агента (в радианах)
    let lastMuzzle = { x: agent.x, y: agent.y }; // координаты дула для выстрела

    const MAX_RICOCHETS = 8;

    // --- ЗВУКИ ---
    let audioCtx = null;
    function initAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }
    function playSound(freq, type, duration, vol = 0.08) {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    }
    function fireSound() {
        playSound(150, 'square', 0.08, 0.12);
        setTimeout(() => playSound(60, 'sawtooth', 0.12, 0.08), 30);
    }
    function ricochetSound() {
        playSound(1000, 'triangle', 0.04, 0.08);
    }

    // --- УРОВНИ (три штуки) ---
    const levels = [
        // Уровень 1
        {
            enemies: [
                { x: 200, y: 100, size: 24 },
                { x: canvas.width - 200, y: 100, size: 24 },
                { x: canvas.width / 2, y: 200, size: 28 },
                { x: 140, y: canvas.height - 150, size: 20 },
                { x: canvas.width - 140, y: canvas.height - 150, size: 20 }
            ],
            walls: [
                { x: canvas.width / 2 - 120, y: 140, width: 240, height: 12 },
                { x: 100, y: canvas.height / 2 - 60, width: 12, height: 120 },
                { x: canvas.width - 112, y: canvas.height / 2 - 60, width: 12, height: 120 }
            ],
            bullets: 5,
            agent: { x: canvas.width / 2, y: canvas.height - 40 }
        },
        // Уровень 2
        {
            enemies: [
                { x: 150, y: 80, size: 20 },
                { x: canvas.width - 150, y: 80, size: 20 },
                { x: canvas.width / 2 - 40, y: 200, size: 26 },
                { x: canvas.width / 2 + 40, y: 200, size: 26 },
                { x: canvas.width / 2, y: 320, size: 30 }
            ],
            walls: [
                { x: 80, y: 120, width: 100, height: 12 },
                { x: canvas.width - 180, y: 120, width: 100, height: 12 },
                { x: canvas.width / 2 - 6, y: 160, width: 12, height: 100 },
                { x: canvas.width / 2 - 80, y: 260, width: 160, height: 12 },
                { x: 200, y: 300, width: 12, height: 80 },
                { x: canvas.width - 212, y: 300, width: 12, height: 80 }
            ],
            bullets: 4,
            agent: { x: canvas.width / 2, y: canvas.height - 40 }
        },
        // Уровень 3
        {
            enemies: [
                { x: 120, y: 90, size: 22 },
                { x: canvas.width - 120, y: 90, size: 22 },
                { x: 200, y: 220, size: 26 },
                { x: canvas.width - 200, y: 220, size: 26 },
                { x: canvas.width / 2, y: 300, size: 30 }
            ],
            walls: [
                { x: 60, y: 140, width: 140, height: 12 },
                { x: canvas.width - 200, y: 140, width: 140, height: 12 },
                { x: canvas.width / 2 - 6, y: 100, width: 12, height: 150 },
                { x: 160, y: 250, width: 12, height: 100 },
                { x: canvas.width - 172, y: 250, width: 12, height: 100 }
            ],
            bullets: 4,
            agent: { x: canvas.width / 2, y: canvas.height - 40 }
        }
    ];

    let currentLevel = 0;
    let enemies = [];
    let walls = [];
    let bulletsLeft = 0;
    let levelComplete = false;
    let gameOver = false;

    const restartButton = document.getElementById('restartButton');

    function loadLevel(levelIndex) {
        if (levelIndex >= levels.length) {
            alert('АГЕНТ 67 ВЫПОЛНИЛ МИССИЮ. МЕМ СПАСЁН.');
            currentLevel = 0;
            loadLevel(0);
            return;
        }
        const level = levels[levelIndex];
        enemies = level.enemies.map(e => ({ ...e, active: true }));
        walls = level.walls ? level.walls.slice() : [];
        bulletsLeft = level.bullets;
        levelComplete = false;
        gameOver = false;
        bullets = [];

        if (level.agent) {
            agent.x = level.agent.x;
            agent.y = level.agent.y;
        } else {
            agent.x = canvas.width / 2;
            agent.y = canvas.height - 40;
        }

        restartButton.style.display = 'none';
        // сбросим угол и дуло на случай перезапуска
        agentAngle = 0;
        lastMuzzle = { x: agent.x, y: agent.y };
    }

    loadLevel(currentLevel);

    function checkLevelComplete() {
        const allDead = enemies.every(enemy => !enemy.active);
        if (allDead && !levelComplete) {
            levelComplete = true;
            setTimeout(() => {
                currentLevel++;
                loadLevel(currentLevel);
            }, 1500);
        }
    }

    function checkGameOver() {
        if (bulletsLeft <= 0 && bullets.length === 0 && !levelComplete) {
            gameOver = true;
            restartButton.style.display = 'block';
        }
    }

    restartButton.addEventListener('click', () => {
        loadLevel(currentLevel);
    });

    // --- МЫШЬ ---
    canvas.addEventListener('mousemove', function(e) {
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;

        // Вычисляем угол к мыши (с учётом инверсии Y)
        const dx = mouseX - agent.x;
        const dy = mouseY - agent.y;
        agentAngle = Math.atan2(-dy, dx); // 0 вправо, растёт против часовой
    });

    canvas.addEventListener('click', function(e) {
        initAudio();
        if (levelComplete || gameOver) return;
        if (bulletsLeft <= 0) return;

        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        // Используем lastMuzzle как точку старта пули
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
            trail: []
        });

        bulletsLeft--;
        fireSound();
    });

    // --- ФИЗИКА СТОЛКНОВЕНИЯ С ПРЯМОУГОЛЬНИКОМ (без изменений) ---
    function handleWallCollision(bullet, wall) {
        const closestX = Math.max(wall.x, Math.min(bullet.x, wall.x + wall.width));
        const closestY = Math.max(wall.y, Math.min(bullet.y, wall.y + wall.height));
        const dx = bullet.x - closestX;
        const dy = bullet.y - closestY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < bullet.radius) {
            if (dist === 0) {
                const overlapLeft = bullet.x - wall.x;
                const overlapRight = (wall.x + wall.width) - bullet.x;
                const overlapTop = bullet.y - wall.y;
                const overlapBottom = (wall.y + wall.height) - bullet.y;
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

    // --- ОТРИСОВКА АГЕНТА С ПИСТОЛЕТОМ ---
    function drawAgent() {
        const size = agent.size;
        const x = agent.x;
        const y = agent.y;
        const angle = agentAngle;

        // Тело
        ctx.strokeStyle = '#0f0';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, y - size * 0.3);
        ctx.lineTo(x, y + size * 0.5);
        ctx.stroke();

        // Ноги
        ctx.beginPath();
        ctx.moveTo(x, y + size * 0.5);
        ctx.lineTo(x - 8, y + size * 0.9);
        ctx.moveTo(x, y + size * 0.5);
        ctx.lineTo(x + 8, y + size * 0.9);
        ctx.stroke();

        // Голова
        ctx.fillStyle = '#0f0';
        ctx.beginPath();
        ctx.arc(x, y - size * 0.5, size * 0.25, 0, Math.PI * 2);
        ctx.fill();

        // Рука с пистолетом
        const shoulderX = x + Math.cos(angle) * 8;
        const shoulderY = y - Math.sin(angle) * 8 - size * 0.1;
        const handX = shoulderX + Math.cos(angle) * 15;
        const handY = shoulderY - Math.sin(angle) * 15;

        ctx.strokeStyle = '#0f0';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(shoulderX, shoulderY);
        ctx.lineTo(handX, handY);
        ctx.stroke();

        // Пистолет (ствол)
        const barrelLength = 20;
        const barrelEndX = handX + Math.cos(angle) * barrelLength;
        const barrelEndY = handY - Math.sin(angle) * barrelLength;

        ctx.strokeStyle = '#aaa';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(handX, handY);
        ctx.lineTo(barrelEndX, barrelEndY);
        ctx.stroke();

        // Глушитель
        const silencerLength = 12;
        const silencerWidth = 6;
        const silencerX = barrelEndX + Math.cos(angle) * silencerLength / 2;
        const silencerY = barrelEndY - Math.sin(angle) * silencerLength / 2;

        ctx.save();
        ctx.translate(silencerX, silencerY);
        ctx.rotate(-angle);
        ctx.fillStyle = '#555';
        ctx.fillRect(-silencerLength / 2, -silencerWidth / 2, silencerLength, silencerWidth);
        ctx.restore();

        // Координаты дула (кончик глушителя)
        const muzzleX = barrelEndX + Math.cos(angle) * silencerLength;
        const muzzleY = barrelEndY - Math.sin(angle) * silencerLength;

        return { x: muzzleX, y: muzzleY };
    }

    // --- ОТРИСОВКА ВРАГА-ЧЕЛОВЕЧКА ---
    function drawEnemy(x, y, size) {
        ctx.strokeStyle = '#ff0044';
        ctx.lineWidth = 2;
        // Ноги
        ctx.beginPath();
        ctx.moveTo(x, y + size * 0.5);
        ctx.lineTo(x - 6, y + size * 0.9);
        ctx.moveTo(x, y + size * 0.5);
        ctx.lineTo(x + 6, y + size * 0.9);
        ctx.stroke();
        // Тело
        ctx.beginPath();
        ctx.moveTo(x, y - size * 0.3);
        ctx.lineTo(x, y + size * 0.5);
        ctx.stroke();
        // Руки (в стороны)
        ctx.beginPath();
        ctx.moveTo(x, y - size * 0.1);
        ctx.lineTo(x - 10, y + size * 0.2);
        ctx.moveTo(x, y - size * 0.1);
        ctx.lineTo(x + 10, y + size * 0.2);
        ctx.stroke();
        // Голова
        ctx.fillStyle = '#ff0044';
        ctx.beginPath();
        ctx.arc(x, y - size * 0.5, size * 0.25, 0, Math.PI * 2);
        ctx.fill();
    }

    // --- ГЛАВНЫЙ ИГРОВОЙ ЦИКЛ ---
    function gameLoop() {
        // Фон
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Scanlines
        ctx.fillStyle = 'rgba(0, 20, 0, 0.15)';
        for (let y = 0; y < canvas.height; y += 4) {
            ctx.fillRect(0, y, canvas.width, 2);
        }

        // Стены
        ctx.fillStyle = '#1a1a1a';
        ctx.strokeStyle = '#0f0';
        ctx.lineWidth = 2;
        for (let wall of walls) {
            ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
            ctx.strokeRect(wall.x + 1, wall.y + 1, wall.width - 2, wall.height - 2);
        }

        // Враги
        for (let enemy of enemies) {
            if (!enemy.active) continue;
            drawEnemy(enemy.x, enemy.y, enemy.size);
        }

        // Агент и получение координат дула
        const muzzle = drawAgent();
        lastMuzzle = muzzle;  // запоминаем для выстрела

        // Прицел (от дула)
        if (bulletsLeft > 0 && !levelComplete && !gameOver) {
            ctx.strokeStyle = '#0f0';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(muzzle.x, muzzle.y);
            ctx.lineTo(mouseX, mouseY);
            ctx.stroke();
            ctx.fillStyle = '#0f0';
            ctx.beginPath();
            ctx.arc(mouseX, mouseY, 5, 0, Math.PI * 2);
            ctx.fill();
        }

        // Пули
        for (let i = 0; i < bullets.length; i++) {
            const bullet = bullets[i];
            if (!bullet.active) continue;

            bullet.x += bullet.vx;
            bullet.y += bullet.vy;

            // Трейл
            bullet.trail.push({ x: bullet.x, y: bullet.y });
            if (bullet.trail.length > 12) bullet.trail.shift();

            // Враги
            for (let enemy of enemies) {
                if (!enemy.active) continue;
                const dx = bullet.x - enemy.x;
                const dy = bullet.y - enemy.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < bullet.radius + enemy.size * 0.4) { // подгоняем под размер врага
                    enemy.active = false;
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
            if (bullet.x - bullet.radius <= 0) { bullet.x = bullet.radius; bullet.vx = -bullet.vx; bounced = true; }
            else if (bullet.x + bullet.radius >= canvas.width) { bullet.x = canvas.width - bullet.radius; bullet.vx = -bullet.vx; bounced = true; }
            if (bullet.y - bullet.radius <= 0) { bullet.y = bullet.radius; bullet.vy = -bullet.vy; bounced = true; }
            else if (bullet.y + bullet.radius >= canvas.height) { bullet.y = canvas.height - bullet.radius; bullet.vy = -bullet.vy; bounced = true; }

            if (bounced) {
                bullet.ricochets++;
                ricochetSound();
                if (bullet.ricochets > MAX_RICOCHETS) bullet.active = false;
            }

            // Рисуем след
            if (bullet.trail.length > 1) {
                ctx.strokeStyle = '#0f0';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(bullet.trail[0].x, bullet.trail[0].y);
                for (let t = 1; t < bullet.trail.length; t++) {
                    ctx.lineTo(bullet.trail[t].x, bullet.trail[t].y);
                }
                ctx.lineTo(bullet.x, bullet.y);
                ctx.stroke();
            }
            // Рисуем пулю
            ctx.fillStyle = '#0f0';
            ctx.beginPath();
            ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowColor = '#0f0';
            ctx.shadowBlur = 8;
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        bullets = bullets.filter(b => b.active);
        checkGameOver();

        // UI
        ctx.fillStyle = '#0f0';
        ctx.font = '18px "Courier New", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`УРОВЕНЬ ${currentLevel + 1}`, 20, 35);
        ctx.fillText(`ПАТРОНЫ ${bulletsLeft}`, 20, 60);

        if (levelComplete) {
            ctx.fillStyle = '#0f0';
            ctx.font = '36px "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.fillText('УРОВЕНЬ ПРОЙДЕН', canvas.width / 2, canvas.height / 2 - 20);
        }
        if (gameOver) {
            ctx.fillStyle = '#ff0044';
            ctx.font = '36px "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.fillText('ПРОВАЛ', canvas.width / 2, canvas.height / 2 - 20);
        }

        requestAnimationFrame(gameLoop);
    }

    gameLoop();
};