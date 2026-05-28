const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const mainMenu = document.getElementById('main-menu');
const buffMenu = document.getElementById('buff-menu');
const gameOverMenu = document.getElementById('game-over-menu');
const hud = document.getElementById('hud');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const buffBtns = document.querySelectorAll('.buff-btn');

const healthBarFill = document.getElementById('health-bar-fill');
const hpText = document.getElementById('hp-text');
const cycleText = document.getElementById('cycle-text');
const scoreText = document.getElementById('score-text');
const bossHealthWrapper = document.getElementById('boss-health-wrapper');
const bossHealthFill = document.getElementById('boss-health-fill');
const bossNameEl = document.getElementById('boss-name');

// Game State
let gameState = 'menu'; // menu, playing, buff, gameover
let lastTime = 0;
let keys = {};
let mouse = { x: 0, y: 0, isDown: false };

// Progress
let cycle = 1;
let score = 0;
let bossIndex = 0; // 0: Ione, 1: Jack, 2: Cristiane
const BOSS_NAMES = ['Ione (O Dinossauro)', 'Jack (O Homem Gordo)', 'Cristiane (O Anjo)'];

// Entities
let player;
let boss;
let projectiles = [];
let enemyProjectiles = [];
let particles = [];
let shockwaves = [];

// Input Listeners
window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
});
canvas.addEventListener('mousedown', () => mouse.isDown = true);
canvas.addEventListener('mouseup', () => mouse.isDown = false);

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);
buffBtns.forEach(btn => {
    btn.addEventListener('click', () => applyBuff(btn.dataset.buff));
});

// Utility
function getDistance(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
}

// Classes
class Player {
    constructor() {
        this.x = canvas.width / 2;
        this.y = canvas.height / 2;
        this.radius = 12;
        this.color = '#22d3ee'; // cyan-400
        this.baseSpeed = 4;
        this.speedMultiplier = 1;
        
        this.maxHp = 100;
        this.hp = 100;
        
        this.baseDamage = 15;
        this.damageMultiplier = 1;
        
        this.fireRate = 300; // ms
        this.lastFire = 0;
    }

    get speed() { return this.baseSpeed * this.speedMultiplier; }
    get damage() { return this.baseDamage * this.damageMultiplier; }

    update(dt) {
        // Movement
        let dx = 0;
        let dy = 0;
        if (keys['w'] || keys['arrowup']) dy -= 1;
        if (keys['s'] || keys['arrowdown']) dy += 1;
        if (keys['a'] || keys['arrowleft']) dx -= 1;
        if (keys['d'] || keys['arrowright']) dx += 1;

        // Normalize diagonal speed
        if (dx !== 0 && dy !== 0) {
            const length = Math.hypot(dx, dy);
            dx /= length;
            dy /= length;
        }

        this.x += dx * this.speed;
        this.y += dy * this.speed;

        // Bounds
        this.x = Math.max(this.radius, Math.min(canvas.width - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(canvas.height - this.radius, this.y));

        // Shooting
        if (mouse.isDown && performance.now() - this.lastFire > this.fireRate) {
            this.shoot();
            this.lastFire = performance.now();
        }
    }

    shoot() {
        const angle = Math.atan2(mouse.y - this.y, mouse.x - this.x);
        projectiles.push(new Projectile(this.x, this.y, angle, this.damage));
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw aiming indicator (pacifier style)
        const angle = Math.atan2(mouse.y - this.y, mouse.x - this.x);
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + Math.cos(angle) * 20, this.y + Math.sin(angle) * 20);
        ctx.strokeStyle = '#f472b6'; // pink-400
        ctx.lineWidth = 4;
        ctx.stroke();
    }

    takeDamage(amount) {
        this.hp -= amount;
        updateHUD();
        createParticles(this.x, this.y, this.color, 5);
        if (this.hp <= 0) {
            endGame();
        }
    }
}

class Projectile {
    constructor(x, y, angle, damage) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.speed = 8;
        this.radius = 5;
        this.damage = damage;
        this.color = '#f472b6'; // pink (chupeta)
        this.markedForDeletion = false;
    }

    update() {
        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;

        if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
            this.markedForDeletion = true;
        }
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
    }
}

class EnemyProjectile extends Projectile {
    constructor(x, y, angle, damage, speed = 5, color = '#facc15', radius = 6) {
        super(x, y, angle, damage);
        this.speed = speed;
        this.color = color;
        this.radius = radius;
    }
}

class Boss {
    constructor(hp, speed, damage, name) {
        this.x = canvas.width / 2;
        this.y = 100;
        this.maxHp = hp * Math.pow(1.05, cycle - 1); // 5% base health scaling per cycle
        this.hp = this.maxHp;
        this.baseSpeed = speed * Math.pow(1.02, cycle - 1); // 2% speed scaling
        this.damage = damage * Math.pow(1.05, cycle - 1); // 5% damage scaling
        this.name = name;
        this.radius = 30;
        this.markedForDeletion = false;
        
        // Ensure boss health wrapper is shown
        bossHealthWrapper.style.display = 'block';
        updateBossHUD();
    }

    takeDamage(amount) {
        this.hp -= amount;
        updateBossHUD();
        createParticles(this.x, this.y, this.color, 3);
        if (this.hp <= 0) {
            this.die();
        }
    }

    die() {
        this.markedForDeletion = true;
        createParticles(this.x, this.y, this.color, 30);
        showBuffMenu();
    }
    
    // Default collision with player
    checkPlayerCollision() {
        if (getDistance(this.x, this.y, player.x, player.y) < this.radius + player.radius) {
            player.takeDamage(this.damage * 0.5); // DPS contact damage
            // knockback player slightly
            const angle = Math.atan2(player.y - this.y, player.x - this.x);
            player.x += Math.cos(angle) * 10;
            player.y += Math.sin(angle) * 10;
        }
    }
}

// 1. Ione (Dinosaur)
class Ione extends Boss {
    constructor() {
        super(150, 2.5, 15, 'Ione (O Dinossauro)');
        this.color = '#22c55e'; // green
        this.state = 'chase'; // chase, prepare_dash, dash
        this.timer = 0;
        this.dashAngle = 0;
    }

    update(dt) {
        this.timer += dt;
        
        if (this.state === 'chase') {
            const angle = Math.atan2(player.y - this.y, player.x - this.x);
            this.x += Math.cos(angle) * this.baseSpeed;
            this.y += Math.sin(angle) * this.baseSpeed;
            
            // Dash every 3 seconds
            if (this.timer > 3000) {
                this.state = 'prepare_dash';
                this.timer = 0;
            }
        } else if (this.state === 'prepare_dash') {
            // Flash red to indicate dash
            this.color = Math.floor(this.timer / 100) % 2 === 0 ? '#ef4444' : '#22c55e';
            
            if (this.timer > 800) {
                this.state = 'dash';
                this.timer = 0;
                this.dashAngle = Math.atan2(player.y - this.y, player.x - this.x);
                this.color = '#15803d'; // dark green
            }
        } else if (this.state === 'dash') {
            this.x += Math.cos(this.dashAngle) * this.baseSpeed * 4;
            this.y += Math.sin(this.dashAngle) * this.baseSpeed * 4;
            
            createParticles(this.x, this.y, this.color, 1, 2); // trail
            
            if (this.timer > 500 || this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
                this.state = 'chase';
                this.timer = 0;
                this.color = '#22c55e';
            }
        }

        // Keep bounds
        this.x = Math.max(this.radius, Math.min(canvas.width - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(canvas.height - this.radius, this.y));
        
        this.checkPlayerCollision();
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        // Draw as a rounded rect/dino shape
        ctx.fillRect(this.x - this.radius, this.y - this.radius, this.radius*2, this.radius*2);
        // Eye
        ctx.fillStyle = 'white';
        ctx.fillRect(this.x + (this.dashAngle ? Math.cos(this.dashAngle)*10 : 10), this.y - 10, 8, 8);
        ctx.fillStyle = 'black';
        ctx.fillRect(this.x + (this.dashAngle ? Math.cos(this.dashAngle)*10 : 10)+2, this.y - 8, 4, 4);
    }
}

// 2. Jack (Fat Man)
class Jack extends Boss {
    constructor() {
        super(300, 1.2, 25, 'Jack (O Homem Gordo)');
        this.color = '#ea580c'; // orange
        this.radius = 40;
        this.state = 'walk'; // walk, jump, fall
        this.timer = 0;
        this.z = 0; // vertical height for jump
    }

    update(dt) {
        this.timer += dt;

        if (this.state === 'walk') {
            const angle = Math.atan2(player.y - this.y, player.x - this.x);
            this.x += Math.cos(angle) * this.baseSpeed;
            this.y += Math.sin(angle) * this.baseSpeed;

            if (this.timer > 4000) {
                this.state = 'jump';
                this.timer = 0;
            }
        } else if (this.state === 'jump') {
            this.z += dt * 0.2; // Go up
            if (this.timer > 1000) {
                this.state = 'fall';
                this.timer = 0;
            }
        } else if (this.state === 'fall') {
            this.z -= dt * 0.4; // Fall fast
            if (this.z <= 0) {
                this.z = 0;
                this.state = 'walk';
                this.timer = 0;
                
                // Shockwave
                shockwaves.push(new Shockwave(this.x, this.y, this.damage));
                createParticles(this.x, this.y, '#d97706', 20);
            }
        }

        this.x = Math.max(this.radius, Math.min(canvas.width - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(canvas.height - this.radius, this.y));

        if (this.z === 0) {
            this.checkPlayerCollision();
        }
    }

    draw(ctx) {
        // Shadow
        ctx.beginPath();
        const shadowRadius = Math.max(0, this.radius * (1 - this.z / 200));
        ctx.arc(this.x, this.y, shadowRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fill();

        // Body
        ctx.beginPath();
        ctx.arc(this.x, this.y - this.z, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.strokeStyle = '#9a3412';
        ctx.lineWidth = 3;
        ctx.stroke();
    }
}

// 3. Cristiane (Angel/Eye)
class Cristiane extends Boss {
    constructor() {
        super(120, 1.8, 10, 'Cristiane (O Anjo)');
        this.color = '#ffffff';
        this.radius = 25;
        this.timer = 0;
        this.attackPhase = 0;
    }

    update(dt) {
        this.timer += dt;

        // Try to maintain a distance of 200px from player
        const dist = getDistance(this.x, this.y, player.x, player.y);
        const angleToPlayer = Math.atan2(player.y - this.y, player.x - this.x);
        
        let targetAngle = angleToPlayer;
        if (dist < 200) {
            targetAngle += Math.PI; // Run away
        } else if (dist > 300) {
            targetAngle = angleToPlayer; // Move closer
        } else {
            targetAngle += Math.PI / 2; // Strafe
        }

        this.x += Math.cos(targetAngle) * this.baseSpeed;
        this.y += Math.sin(targetAngle) * this.baseSpeed;

        // Attack patterns
        if (this.timer > 2500) {
            this.timer = 0;
            this.attackPhase++;
            
            if (this.attackPhase % 2 === 0) {
                // Circle attack
                for(let i=0; i<8; i++) {
                    const angle = (i / 8) * Math.PI * 2;
                    enemyProjectiles.push(new EnemyProjectile(this.x, this.y, angle, this.damage, 4, '#38bdf8')); // blue
                }
            } else {
                // Burst attack towards player
                let burstCount = 0;
                const burstInt = setInterval(() => {
                    if(gameState !== 'playing' || this.markedForDeletion) return clearInterval(burstInt);
                    const aimAngle = Math.atan2(player.y - this.y, player.x - this.x) + (Math.random() - 0.5) * 0.2;
                    enemyProjectiles.push(new EnemyProjectile(this.x, this.y, aimAngle, this.damage, 6, '#fbbf24')); // yellow
                    burstCount++;
                    if(burstCount >= 3) clearInterval(burstInt);
                }, 200);
            }
        }

        this.x = Math.max(this.radius, Math.min(canvas.width - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(canvas.height - this.radius, this.y));
        
        this.checkPlayerCollision();
    }

    draw(ctx) {
        // Wings
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.beginPath();
        ctx.ellipse(this.x - 20, this.y, 20, 10, Math.PI/4, 0, Math.PI*2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(this.x + 20, this.y, 20, 10, -Math.PI/4, 0, Math.PI*2);
        ctx.fill();

        // Body (Eye)
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.strokeStyle = '#d1d5db';
        ctx.stroke();

        // Pupil
        const angle = Math.atan2(player.y - this.y, player.x - this.x);
        ctx.beginPath();
        ctx.arc(this.x + Math.cos(angle)*5, this.y + Math.sin(angle)*5, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#1d4ed8'; // blue-700
        ctx.fill();
        ctx.beginPath();
        ctx.arc(this.x + Math.cos(angle)*5, this.y + Math.sin(angle)*5, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#000000';
        ctx.fill();
    }
}

// Effects
class Particle {
    constructor(x, y, color, speedScale = 1) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.radius = Math.random() * 3 + 1;
        this.life = 1;
        this.decay = Math.random() * 0.02 + 0.02;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 3 * speedScale;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.decay;
    }
    draw(ctx) {
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

class Shockwave {
    constructor(x, y, damage) {
        this.x = x;
        this.y = y;
        this.radius = 0;
        this.maxRadius = 150;
        this.speed = 4;
        this.damage = damage;
        this.hasHit = false;
        this.markedForDeletion = false;
    }
    update() {
        this.radius += this.speed;
        if (this.radius > this.maxRadius) {
            this.markedForDeletion = true;
        }

        if (!this.hasHit && getDistance(this.x, this.y, player.x, player.y) < this.radius + player.radius && getDistance(this.x, this.y, player.x, player.y) > this.radius - 20) {
            player.takeDamage(this.damage);
            this.hasHit = true;
        }
    }
    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(234, 88, 12, ${1 - this.radius/this.maxRadius})`; // orange fade
        ctx.lineWidth = 10;
        ctx.stroke();
    }
}

function createParticles(x, y, color, amount, speedScale=1) {
    for (let i = 0; i < amount; i++) {
        particles.push(new Particle(x, y, color, speedScale));
    }
}

// Spawner
function spawnBoss() {
    switch(bossIndex) {
        case 0: boss = new Ione(); break;
        case 1: boss = new Jack(); break;
        case 2: boss = new Cristiane(); break;
    }
    bossNameEl.textContent = BOSS_NAMES[bossIndex];
}

// Game Core Functions
function startGame() {
    mainMenu.classList.add('hidden');
    gameOverMenu.classList.add('hidden');
    hud.classList.remove('hidden');
    
    player = new Player();
    cycle = 1;
    score = 0;
    bossIndex = 0;
    
    projectiles = [];
    enemyProjectiles = [];
    particles = [];
    shockwaves = [];
    
    updateHUD();
    spawnBoss();
    
    gameState = 'playing';
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

function endGame() {
    gameState = 'gameover';
    hud.classList.add('hidden');
    gameOverMenu.classList.remove('hidden');
    document.getElementById('final-cycle').textContent = cycle;
    document.getElementById('final-score').textContent = score;
    bossHealthWrapper.style.display = 'none';
}

function showBuffMenu() {
    gameState = 'buff';
    hud.classList.add('hidden');
    buffMenu.classList.remove('hidden');
    bossHealthWrapper.style.display = 'none';
    
    score++;
    bossIndex++;
    if (bossIndex > 2) {
        bossIndex = 0;
        cycle++;
    }
}

function applyBuff(type) {
    if (type === 'speed') {
        player.speedMultiplier *= 1.05;
    } else if (type === 'damage') {
        player.damageMultiplier *= 1.05;
    } else if (type === 'hp') {
        player.maxHp *= 1.05;
        player.hp = Math.min(player.maxHp, player.hp + (player.maxHp * 0.2));
    }
    
    buffMenu.classList.add('hidden');
    hud.classList.remove('hidden');
    
    // Clear arena
    projectiles = [];
    enemyProjectiles = [];
    shockwaves = [];
    
    spawnBoss();
    updateHUD();
    gameState = 'playing';
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

// UI Updates
function updateHUD() {
    const hpPercent = Math.max(0, (player.hp / player.maxHp) * 100);
    healthBarFill.style.width = hpPercent + '%';
    hpText.textContent = `${Math.ceil(Math.max(0, player.hp))}/${Math.ceil(player.maxHp)}`;
    cycleText.textContent = `Ciclo: ${cycle}`;
    scoreText.textContent = `Chefes Derrotados: ${score}`;
}

function updateBossHUD() {
    if (boss) {
        const hpPercent = Math.max(0, (boss.hp / boss.maxHp) * 100);
        bossHealthFill.style.width = hpPercent + '%';
    }
}

// Main Loop
function gameLoop(timestamp) {
    if (gameState !== 'playing') return;

    const dt = timestamp - lastTime;
    lastTime = timestamp;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Grid background
    ctx.strokeStyle = '#374151'; // gray-700
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.width; i += 40) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
    }
    for (let i = 0; i < canvas.height; i += 40) {
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
    }

    // Update & Draw Entities
    player.update(dt);
    player.draw(ctx);

    if (boss && !boss.markedForDeletion) {
        boss.update(dt);
        boss.draw(ctx);
    }

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.update();
        p.draw(ctx);
        if (p.life <= 0) particles.splice(i, 1);
    }

    // Shockwaves
    for (let i = shockwaves.length - 1; i >= 0; i--) {
        const s = shockwaves[i];
        s.update();
        s.draw(ctx);
        if (s.markedForDeletion) shockwaves.splice(i, 1);
    }

    // Projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.update();
        p.draw(ctx);
        
        // Check boss collision
        if (boss && !boss.markedForDeletion) {
            // Boss radius check is generic enough for now
            if (getDistance(p.x, p.y, boss.x, boss.y) < boss.radius + p.radius) {
                boss.takeDamage(p.damage);
                p.markedForDeletion = true;
            }
        }

        if (p.markedForDeletion) projectiles.splice(i, 1);
    }

    // Enemy Projectiles
    for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
        const ep = enemyProjectiles[i];
        ep.update();
        ep.draw(ctx);
        
        // Player collision
        if (getDistance(ep.x, ep.y, player.x, player.y) < player.radius + ep.radius) {
            player.takeDamage(ep.damage);
            ep.markedForDeletion = true;
        }

        if (ep.markedForDeletion) enemyProjectiles.splice(i, 1);
    }

    requestAnimationFrame(gameLoop);
}
