class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.socket = io();
        
        // Set canvas size
        this.canvas.width = 800;
        this.canvas.height = 600;
        
        // Create car object
        this.car = {
            x: this.canvas.width / 2,
            y: this.canvas.height - 100,
            width: 60,
            height: 100,
            speed: 5
        };
        
        // Initialize controls
        this.keys = {
            ArrowUp: false,
            ArrowDown: false,
            ArrowLeft: false,
            ArrowRight: false
        };
        
        // Game state
        this.score = 0;
        this.obstacles = [];
        this.isGameRunning = false;
        this.animationFrameId = null;
        
        // Initialize sounds with debug logging
        this.sounds = {};
        this.initSounds();
        
        // Mobile control states
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        this.joystick = null;
        this.joystickData = { x: 0, y: 0 };
        this.isAccelerating = false;

        if (this.isMobile) {
            this.initMobileControls();
        }

        // Initialize high score
        this.highScore = parseInt(localStorage.getItem('highScore')) || 0;
        document.getElementById('highScore').textContent = this.highScore;

        // Add difficulty settings
        this.difficulties = {
            easy: {
                obstacleSpeed: 2,
                obstacleFrequency: 0.015,
                carSpeed: 6,
                score: 1
            },
            medium: {
                obstacleSpeed: 3,
                obstacleFrequency: 0.02,
                carSpeed: 5,
                score: 2
            },
            hard: {
                obstacleSpeed: 4,
                obstacleFrequency: 0.025,
                carSpeed: 4,
                score: 3
            }
        };
        
        this.currentDifficulty = 'medium';
        this.initDifficultySelection();

        // Add road boundaries
        this.road = {
            topWidth: 400,    // Width of road at the top
            bottomWidth: 700, // Width of road at the bottom
            leftOffset: 200,  // Left edge of road at the top
            rightOffset: 600  // Right edge of road at the top
        };

        this.isPaused = false;
        this.initPauseMenu();

        // Add car themes
        this.carThemes = {
            red: {
                main: '#ff0000',
                secondary: '#cc0000',
                window: '#87CEEB',
                speed: 5
            },
            blue: {
                main: '#4169e1',
                secondary: '#1e3c72',
                window: '#add8e6',
                speed: 4.5
            },
            yellow: {
                main: '#ffd700',
                secondary: '#daa520',
                window: '#87CEEB',
                speed: 5.5
            }
        };
        
        this.currentCarTheme = 'red';
        this.initCarSelection();

        this.init();
    }
    
    init() {
        // Event listeners for keyboard
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));
        window.addEventListener('keyup', (e) => this.handleKeyUp(e));
        
        // Button event listeners
        const startButton = document.getElementById('startGame');
        if (startButton) {
            startButton.addEventListener('click', () => {
                console.log('Starting game...');  // Debug log
                this.startGame();
            });
        }
        
        const joinButton = document.getElementById('joinGame');
        if (joinButton) {
            joinButton.addEventListener('click', () => this.joinMultiplayerGame());
        }
        
        const restartButton = document.getElementById('restartGame');
        if (restartButton) {
            restartButton.addEventListener('click', () => {
                this.startGame();
            });
        }

        // Add sound toggle
        const soundToggle = document.getElementById('soundToggle');
        if (soundToggle) {
            soundToggle.addEventListener('click', () => {
                this.toggleSound();
                soundToggle.textContent = this.sounds.engine.muted ? '🔇' : '🔊';
                soundToggle.classList.toggle('muted', this.sounds.engine.muted);
            });
        }

        // Add resize handler
        window.addEventListener('resize', () => this.handleResize());
        this.handleResize(); // Initial resize

        // Add game over menu button handler
        const gameOverMenuBtn = document.getElementById('gameOverMenu');
        if (gameOverMenuBtn) {
            gameOverMenuBtn.addEventListener('click', () => {
                this.returnToMenu();
            });
        }
    }
    
    handleKeyDown(e) {
        if (this.keys.hasOwnProperty(e.key)) {
            this.keys[e.key] = true;
        }
    }
    
    handleKeyUp(e) {
        if (this.keys.hasOwnProperty(e.key)) {
            this.keys[e.key] = false;
        }
    }
    
    update() {
        if (this.isMobile) {
            // Mobile controls with road constraints
            const speed = this.car.speed * 1.5;
            
            if (this.joystickData.x || this.joystickData.y) {
                const newX = this.car.x + this.joystickData.x * speed;
                const newY = this.car.y + this.joystickData.y * speed;
                this.moveCarWithinRoad(newX, newY);
            }

            if (this.isAccelerating) {
                this.moveCarWithinRoad(this.car.x, this.car.y - speed);
            }
        } else {
            // Keyboard controls with road constraints
            let newX = this.car.x;
            let newY = this.car.y;

            if (this.keys.ArrowUp) newY -= this.car.speed;
            if (this.keys.ArrowDown) newY += this.car.speed;
            if (this.keys.ArrowLeft) newX -= this.car.speed;
            if (this.keys.ArrowRight) newX += this.car.speed;

            this.moveCarWithinRoad(newX, newY);
        }
        
        // Update obstacles
        this.updateObstacles();
        
        // Emit position to server
        this.socket.emit('updatePosition', {
            gameId: 'game1',
            position: { x: this.car.x, y: this.car.y }
        });

        // Update engine sound based on movement
        if (this.isAccelerating || this.keys.ArrowUp || Math.abs(this.joystickData.y) > 0.5) {
            this.sounds.engine.volume = 0.3;
        } else {
            this.sounds.engine.volume = 0.1;
        }
    }
    
    draw() {
        // Clear canvas and draw background gradient
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        gradient.addColorStop(0, '#1a1a2e'); // Dark blue sky
        gradient.addColorStop(1, '#000000'); // Darker at bottom
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw stars in the background
        this.drawStars();

        // Draw road
        this.drawRoad();
        
        // Draw player car
        this.drawPlayerCar(this.car.x, this.car.y, this.car.width, this.car.height);
        
        // Draw obstacles
        this.drawObstacles();
        
        // Draw score
        this.ctx.fillStyle = 'white';
        this.ctx.font = '24px "Press Start 2P"';
        this.ctx.fillText(`Score: ${this.score}`, 10, 30);
    }
    
    drawPlayerCar(x, y, width, height) {
        const theme = this.carThemes[this.currentCarTheme];

        // Car shadow
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        this.ctx.beginPath();
        this.ctx.ellipse(x + width/2, y + height * 0.95, width * 0.7, height * 0.1, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Main body (lower part)
        this.ctx.fillStyle = theme.main;
        this.ctx.beginPath();
        this.ctx.moveTo(x + width * 0.15, y + height * 0.5);
        this.ctx.lineTo(x + width * 0.85, y + height * 0.5);
        this.ctx.quadraticCurveTo(x + width, y + height * 0.5, x + width, y + height * 0.6);
        this.ctx.lineTo(x + width, y + height * 0.8);
        this.ctx.quadraticCurveTo(x + width * 0.9, y + height * 0.9, x + width * 0.9, y + height * 0.9);
        this.ctx.lineTo(x + width * 0.1, y + height * 0.9);
        this.ctx.quadraticCurveTo(x, y + height * 0.9, x, y + height * 0.8);
        this.ctx.lineTo(x, y + height * 0.6);
        this.ctx.quadraticCurveTo(x, y + height * 0.5, x + width * 0.15, y + height * 0.5);
        this.ctx.fill();

        // Car hood and roof
        this.ctx.fillStyle = theme.secondary;
        this.ctx.beginPath();
        this.ctx.moveTo(x + width * 0.15, y + height * 0.5);
        this.ctx.lineTo(x + width * 0.85, y + height * 0.5);
        this.ctx.quadraticCurveTo(x + width * 0.85, y + height * 0.3, x + width * 0.7, y + height * 0.2);
        this.ctx.lineTo(x + width * 0.3, y + height * 0.2);
        this.ctx.quadraticCurveTo(x + width * 0.15, y + height * 0.3, x + width * 0.15, y + height * 0.5);
        this.ctx.fill();

        // Windshield
        this.ctx.fillStyle = theme.window;
        this.ctx.beginPath();
        this.ctx.moveTo(x + width * 0.25, y + height * 0.45);
        this.ctx.lineTo(x + width * 0.75, y + height * 0.45);
        this.ctx.quadraticCurveTo(x + width * 0.75, y + height * 0.3, x + width * 0.65, y + height * 0.25);
        this.ctx.lineTo(x + width * 0.35, y + height * 0.25);
        this.ctx.quadraticCurveTo(x + width * 0.25, y + height * 0.3, x + width * 0.25, y + height * 0.45);
        this.ctx.fill();

        // Windshield reflection
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(x + width * 0.35, y + height * 0.27);
        this.ctx.quadraticCurveTo(x + width * 0.5, y + height * 0.32, x + width * 0.65, y + height * 0.27);
        this.ctx.stroke();

        // Headlights
        this.ctx.fillStyle = '#FFFF00';
        // Left headlight
        this.ctx.beginPath();
        this.ctx.ellipse(x + width * 0.2, y + height * 0.55, width * 0.08, height * 0.03, 0, 0, Math.PI * 2);
        this.ctx.fill();
        // Right headlight
        this.ctx.beginPath();
        this.ctx.ellipse(x + width * 0.8, y + height * 0.55, width * 0.08, height * 0.03, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Headlight glow
        const gradient = this.ctx.createRadialGradient(
            x + width * 0.2, y + height * 0.55, 0,
            x + width * 0.2, y + height * 0.55, width * 0.15
        );
        gradient.addColorStop(0, 'rgba(255, 255, 0, 0.3)');
        gradient.addColorStop(1, 'rgba(255, 255, 0, 0)');
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.ellipse(x + width * 0.2, y + height * 0.55, width * 0.15, height * 0.06, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Repeat for right headlight
        const gradient2 = this.ctx.createRadialGradient(
            x + width * 0.8, y + height * 0.55, 0,
            x + width * 0.8, y + height * 0.55, width * 0.15
        );
        gradient2.addColorStop(0, 'rgba(255, 255, 0, 0.3)');
        gradient2.addColorStop(1, 'rgba(255, 255, 0, 0)');
        this.ctx.fillStyle = gradient2;
        this.ctx.beginPath();
        this.ctx.ellipse(x + width * 0.8, y + height * 0.55, width * 0.15, height * 0.06, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Taillights
        this.ctx.fillStyle = '#FF0000';
        this.ctx.beginPath();
        this.ctx.ellipse(x + width * 0.15, y + height * 0.85, width * 0.06, height * 0.02, 0, 0, Math.PI * 2);
        this.ctx.ellipse(x + width * 0.85, y + height * 0.85, width * 0.06, height * 0.02, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Wheels with details
        this.drawWheel(x + width * 0.2, y + height * 0.75, width * 0.12);
        this.drawWheel(x + width * 0.8, y + height * 0.75, width * 0.12);

        // Add car-specific details based on theme
        if (this.currentCarTheme === 'blue') {
            // Add SUV-specific details (roof racks, bigger body)
            this.drawSUVDetails(x, y, width, height);
        } else if (this.currentCarTheme === 'yellow') {
            // Add supercar details (spoiler, side vents)
            this.drawSupercarDetails(x, y, width, height);
        }
    }

    drawWheel(x, y, size) {
        // Tire
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.beginPath();
        this.ctx.arc(x, y, size, 0, Math.PI * 2);
        this.ctx.fill();

        // Rim
        this.ctx.fillStyle = '#DDD';
        this.ctx.beginPath();
        this.ctx.arc(x, y, size * 0.7, 0, Math.PI * 2);
        this.ctx.fill();

        // Spokes
        this.ctx.strokeStyle = '#999';
        this.ctx.lineWidth = size * 0.2;
        for (let i = 0; i < 5; i++) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, y);
            const angle = (i * Math.PI * 2) / 5;
            this.ctx.lineTo(
                x + Math.cos(angle) * size * 0.6,
                y + Math.sin(angle) * size * 0.6
            );
            this.ctx.stroke();
        }

        // Hub cap
        this.ctx.fillStyle = '#EEE';
        this.ctx.beginPath();
        this.ctx.arc(x, y, size * 0.25, 0, Math.PI * 2);
        this.ctx.fill();

        // Hub cap detail
        this.ctx.strokeStyle = '#CCC';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.arc(x, y, size * 0.35, 0, Math.PI * 2);
        this.ctx.stroke();
    }
    
    updateObstacles() {
        const difficulty = this.difficulties[this.currentDifficulty];
        
        // Add new obstacles with road constraints
        if (Math.random() < difficulty.obstacleFrequency) {
            const roadWidth = this.getRoadWidthAtY(0);
            const leftBoundary = this.getLeftBoundaryAtY(0);
            const rightBoundary = leftBoundary + roadWidth;
            
            // Spawn obstacle within road boundaries
            const obstacleX = Math.random() * (roadWidth - 40) + leftBoundary;
            
            this.obstacles.push({
                x: obstacleX,
                y: -60,
                width: 40,
                height: 60,
                speed: difficulty.obstacleSpeed
            });
        }
        
        // Update obstacle positions with road constraints
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obstacle = this.obstacles[i];
            obstacle.y += obstacle.speed;
            
            // Keep obstacle within road boundaries
            const roadWidth = this.getRoadWidthAtY(obstacle.y);
            const leftBoundary = this.getLeftBoundaryAtY(obstacle.y);
            const rightBoundary = leftBoundary + roadWidth;
            
            obstacle.x = Math.max(
                leftBoundary,
                Math.min(obstacle.x, rightBoundary - obstacle.width)
            );

            if (obstacle.y > this.canvas.height) {
                this.obstacles.splice(i, 1);
                // Score based on difficulty
                this.score += difficulty.score;
                if (this.score > this.highScore) {
                    this.highScore = this.score;
                    localStorage.setItem('highScore', this.highScore);
                    document.getElementById('highScore').textContent = this.highScore;
                    
                    const highScoreElement = document.querySelector('.high-score');
                    highScoreElement.classList.add('new-record');
                    setTimeout(() => {
                        highScoreElement.classList.remove('new-record');
                    }, 1000);
                }
                document.getElementById('score').textContent = this.score;
                this.sounds.point.currentTime = 0;
                this.sounds.point.play().catch(err => console.log('Audio error:', err));
            } else if (this.checkCollision(this.car, obstacle)) {
                this.gameOver();
            }
        }
    }
    
    drawObstacles() {
        this.obstacles.forEach(obstacle => {
            const x = obstacle.x;
            const y = obstacle.y;
            const width = obstacle.width;
            const height = obstacle.height;

            // Shadow
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            this.ctx.beginPath();
            this.ctx.ellipse(x + width/2, y + height * 0.9, width * 0.6, height * 0.1, 0, 0, Math.PI * 2);
            this.ctx.fill();

            // Main body
            this.ctx.fillStyle = '#4a90e2';
            this.ctx.beginPath();
            this.ctx.moveTo(x + width * 0.1, y + height * 0.7);
            this.ctx.lineTo(x + width * 0.9, y + height * 0.7);
            this.ctx.quadraticCurveTo(x + width, y + height * 0.7, x + width, y + height * 0.5);
            this.ctx.lineTo(x + width, y + height * 0.8);
            this.ctx.quadraticCurveTo(x + width * 0.9, y + height * 0.95, x + width * 0.7, y + height * 0.95);
            this.ctx.lineTo(x + width * 0.3, y + height * 0.95);
            this.ctx.quadraticCurveTo(x + width * 0.1, y + height * 0.95, x, y + height * 0.8);
            this.ctx.lineTo(x, y + height * 0.5);
            this.ctx.quadraticCurveTo(x, y + height * 0.7, x + width * 0.1, y + height * 0.7);
            this.ctx.fill();

            // Hood and roof
            this.ctx.fillStyle = '#3a7abd';
            this.ctx.beginPath();
            this.ctx.moveTo(x + width * 0.1, y + height * 0.7);
            this.ctx.lineTo(x + width * 0.9, y + height * 0.7);
            this.ctx.quadraticCurveTo(x + width, y + height * 0.7, x + width, y + height * 0.5);
            this.ctx.lineTo(x + width * 0.8, y + height * 0.2);
            this.ctx.quadraticCurveTo(x + width * 0.7, y + height * 0.1, x + width * 0.5, y + height * 0.1);
            this.ctx.quadraticCurveTo(x + width * 0.3, y + height * 0.1, x + width * 0.2, y + height * 0.2);
            this.ctx.lineTo(x, y + height * 0.5);
            this.ctx.quadraticCurveTo(x, y + height * 0.7, x + width * 0.1, y + height * 0.7);
            this.ctx.fill();

            // Windows
            this.ctx.fillStyle = '#87CEEB';
            this.ctx.beginPath();
            this.ctx.moveTo(x + width * 0.2, y + height * 0.25);
            this.ctx.lineTo(x + width * 0.8, y + height * 0.25);
            this.ctx.quadraticCurveTo(x + width * 0.7, y + height * 0.15, x + width * 0.5, y + height * 0.15);
            this.ctx.quadraticCurveTo(x + width * 0.3, y + height * 0.15, x + width * 0.2, y + height * 0.25);
            this.ctx.fill();

            // Headlights
            this.ctx.fillStyle = '#FFFF00';
            this.ctx.beginPath();
            this.ctx.ellipse(x + width * 0.15, y + height * 0.3, width * 0.08, height * 0.04, 0, 0, Math.PI * 2);
            this.ctx.ellipse(x + width * 0.85, y + height * 0.3, width * 0.08, height * 0.04, 0, 0, Math.PI * 2);
            this.ctx.fill();

            // Wheels
            this.drawWheel(x + width * 0.2, y + height * 0.8, width * 0.15);
            this.drawWheel(x + width * 0.8, y + height * 0.8, width * 0.15);
        });
    }
    
    checkCollision(rect1, rect2) {
        return rect1.x < rect2.x + rect2.width &&
               rect1.x + rect1.width > rect2.x &&
               rect1.y < rect2.y + rect2.height &&
               rect1.y + rect1.height > rect2.y;
    }
    
    gameOver() {
        // Stop game
        this.isGameRunning = false;
        cancelAnimationFrame(this.animationFrameId);
        
        // Stop sounds
        this.sounds.background.pause();
        this.sounds.engine.pause();
        
        // Play crash sound
        this.sounds.crash.currentTime = 0;
        this.sounds.crash.play().catch(err => console.log('Audio error:', err));
        
        // Update final score
        document.getElementById('finalScore').textContent = this.score;
        
        // Show game over screen with fade effect
        const gameOverScreen = document.getElementById('gameOver');
        if (gameOverScreen) {
            gameOverScreen.style.opacity = '0';
            gameOverScreen.style.display = 'block';
            
            // Fade in animation
            setTimeout(() => {
                gameOverScreen.style.opacity = '1';
            }, 50);
        }
        
        // Hide ESC hint
        document.body.classList.remove('game-running');
    }
    
    startGame() {
        if (this.isGameRunning) return;
        
        // Update car speed based on difficulty
        this.car.speed = this.difficulties[this.currentDifficulty].carSpeed;
        
        // Reset game state
        this.isGameRunning = true;
        this.score = 0;
        this.obstacles = [];
        this.car.x = this.canvas.width / 2;
        this.car.y = this.canvas.height - 100;
        
        // Hide menu and game over screen
        const menu = document.getElementById('menu');
        const gameOver = document.getElementById('gameOver');
        if (menu) menu.style.display = 'none';
        if (gameOver) gameOver.style.display = 'none';
        
        // Reset score display
        document.getElementById('score').textContent = '0';
        document.getElementById('highScore').textContent = this.highScore;

        // Show ESC hint
        document.body.classList.add('game-running');
        
        // Hide pause menu if visible
        const pauseMenu = document.getElementById('pauseMenu');
        if (pauseMenu) {
            pauseMenu.style.display = 'none';
        }

        // Start sounds with user interaction
        const startSounds = async () => {
            try {
                await this.sounds.background.play();
                await this.sounds.engine.play();
                console.log('Sounds started successfully');
                document.removeEventListener('click', startSounds);
            } catch (error) {
                console.error('Error starting sounds:', error);
            }
        };

        // Try to play sounds immediately
        startSounds().catch(() => {
            console.log('Adding click listener for sounds');
            document.addEventListener('click', startSounds);
        });

        // Start game loop
        this.gameLoop();
    }
    
    gameLoop() {
        if (!this.isGameRunning || this.isPaused) {
            cancelAnimationFrame(this.animationFrameId);
            return;
        }

        this.update();
        this.draw();

        this.animationFrameId = requestAnimationFrame(() => this.gameLoop());
    }
    
    joinMultiplayerGame() {
        console.log('Joining multiplayer game...');
    }

    // Add sound control method
    toggleSound() {
        const isMuted = this.sounds.engine.muted;
        Object.values(this.sounds).forEach(sound => {
            sound.muted = !isMuted;
        });
    }

    initSounds() {
        const soundFiles = {
            background: '/sounds/background.mp3',
            engine: '/sounds/engine.mp3',
            crash: '/sounds/crash.mp3',
            point: '/sounds/point.mp3'
        };

        // Create and configure audio objects
        Object.entries(soundFiles).forEach(([key, path]) => {
            try {
                console.log(`Loading sound: ${path}`); // Debug log
                const audio = new Audio(path);
                
                // Configure based on sound type
                if (key === 'background') {
                    audio.loop = true;
                    audio.volume = 0.2;
                } else if (key === 'engine') {
                    audio.loop = true;
                    audio.volume = 0; // Start at 0, will be adjusted during gameplay
                } else {
                    audio.volume = 0.4;
                }

                this.sounds[key] = audio;

                // Add load event listener
                audio.addEventListener('canplaythrough', () => {
                    console.log(`${key} sound loaded successfully`);
                });

                // Add error listener
                audio.addEventListener('error', (e) => {
                    console.error(`Error loading ${key} sound:`, e);
                });

                // Preload the sound
                audio.load();
            } catch (error) {
                console.error(`Could not initialize ${key} sound:`, error);
            }
        });
    }

    initMobileControls() {
        // Create acceleration button
        const accelerationBtn = document.createElement('div');
        accelerationBtn.className = 'acceleration-button';
        accelerationBtn.innerHTML = '🏎️';
        document.body.appendChild(accelerationBtn);

        // Add touch events for acceleration
        accelerationBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.isAccelerating = true;
        });
        accelerationBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.isAccelerating = false;
        });

        // Initialize joystick
        const options = {
            zone: document.getElementById('joystickZone'),
            mode: 'static',
            position: {
                left: '80px',
                bottom: '80px'
            },
            color: '#ff6b6b',
            size: window.innerWidth < 480 ? 80 : 100,
            lockX: false,
            lockY: false,
            catchDistance: 150,
            dynamicPage: true
        };

        this.joystick = nipplejs.create(options);

        // Joystick event handlers
        this.joystick.on('move', (evt, data) => {
            const force = Math.min(data.force, 1);
            this.joystickData = {
                x: data.vector.x * force,
                y: -data.vector.y * force // Invert Y for correct direction
            };
        });

        this.joystick.on('end', () => {
            this.joystickData = { x: 0, y: 0 };
        });
    }

    // Add resize handler
    handleResize() {
        const container = document.querySelector('.game-container');
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        
        // Set canvas size based on container and device
        if (window.innerWidth <= 768) { // Mobile devices
            if (window.innerHeight > window.innerWidth) { // Portrait
                this.canvas.style.width = '100%';
                this.canvas.style.height = 'auto';
            } else { // Landscape
                this.canvas.style.height = '90vh';
                this.canvas.style.width = 'auto';
            }
        } else { // Desktop
            // Maintain aspect ratio
            const aspectRatio = 4/3;
            let newWidth = containerWidth;
            let newHeight = containerWidth / aspectRatio;

            if (newHeight > containerHeight) {
                newHeight = containerHeight;
                newWidth = containerHeight * aspectRatio;
            }

            this.canvas.style.width = `${newWidth}px`;
            this.canvas.style.height = `${newHeight}px`;
        }

        // Update joystick position if it exists
        if (this.joystick && this.isMobile) {
            this.joystick.destroy();
            this.initMobileControls();
        }
    }

    drawStars() {
        // Create twinkling stars
        for (let i = 0; i < 50; i++) {
            const x = Math.random() * this.canvas.width;
            const y = Math.random() * (this.canvas.height / 2); // Only in upper half
            const size = Math.random() * 2;
            const opacity = Math.random();
            
            this.ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
            this.ctx.beginPath();
            this.ctx.arc(x, y, size, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    drawRoad() {
        // Sky gradient with stars
        const skyGradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        skyGradient.addColorStop(0, '#000033');
        skyGradient.addColorStop(1, '#001f3f');
        this.ctx.fillStyle = skyGradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw stars
        this.drawStars();

        // Road background with perspective
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.beginPath();
        this.ctx.moveTo(200, 0);
        this.ctx.lineTo(600, 0);
        this.ctx.lineTo(this.canvas.width - 100, this.canvas.height);
        this.ctx.lineTo(100, this.canvas.height);
        this.ctx.closePath();
        this.ctx.fill();

        // Road texture (asphalt pattern)
        this.drawRoadTexture();

        // Draw street lights
        this.drawStreetLights();

        // Center lines with glow
        this.drawCenterLines();

        // Side barriers
        this.drawSideBarriers();

        // Road reflections and shine
        this.drawRoadEffects();
    }

    drawRoadTexture() {
        // Create asphalt pattern
        for (let y = 0; y < this.canvas.height; y += 20) {
            const width = this.getRoadWidthAtY(y);
            const x = this.getLeftBoundaryAtY(y);
            
            // Dark asphalt base
            this.ctx.fillStyle = '#222222';
            this.ctx.fillRect(x, y, width, 10);
            
            // Add random gravel texture
            this.ctx.fillStyle = 'rgba(40, 40, 40, 0.5)';
            for (let i = 0; i < width; i += 10) {
                if (Math.random() > 0.7) {
                    this.ctx.fillRect(x + i, y, 5, 5);
                }
            }
        }
    }

    drawStreetLights() {
        const spacing = 200; // Distance between lights
        
        for (let y = 0; y < this.canvas.height; y += spacing) {
            const progress = y / this.canvas.height;
            const width = this.getRoadWidthAtY(y);
            const leftX = this.getLeftBoundaryAtY(y);
            const rightX = leftX + width;
            const scale = 1 - progress * 0.7; // Scale down with perspective
            
            // Left street light
            this.drawStreetLight(leftX - 30 * scale, y, scale, 'left');
            // Right street light
            this.drawStreetLight(rightX + 30 * scale, y, scale, 'right');
        }
    }

    drawStreetLight(x, y, scale, side) {
        const height = 100 * scale;
        const poleWidth = 5 * scale;
        
        // Light pole
        this.ctx.fillStyle = '#333';
        this.ctx.fillRect(x - poleWidth/2, y, poleWidth, height);
        
        // Light fixture
        const fixtureWidth = 30 * scale;
        const fixtureHeight = 10 * scale;
        const fixtureX = side === 'left' ? x : x - fixtureWidth;
        
        this.ctx.fillStyle = '#444';
        this.ctx.fillRect(fixtureX, y, fixtureWidth, fixtureHeight);
        
        // Light glow
        const gradient = this.ctx.createRadialGradient(
            x, y + fixtureHeight,
            0,
            x, y + fixtureHeight,
            100 * scale
        );
        gradient.addColorStop(0, 'rgba(255, 255, 200, 0.3)');
        gradient.addColorStop(1, 'rgba(255, 255, 200, 0)');
        
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        if (side === 'left') {
            this.ctx.moveTo(x, y + fixtureHeight);
            this.ctx.lineTo(x + 100 * scale, y + height * 2);
            this.ctx.lineTo(x - 20 * scale, y + height * 2);
        } else {
            this.ctx.moveTo(x, y + fixtureHeight);
            this.ctx.lineTo(x - 100 * scale, y + height * 2);
            this.ctx.lineTo(x + 20 * scale, y + height * 2);
        }
        this.ctx.closePath();
        this.ctx.fill();
    }

    drawCenterLines() {
        // Double yellow lines
        this.ctx.strokeStyle = '#ffff00';
        this.ctx.lineWidth = 4;
        this.ctx.setLineDash([30, 20]);
        
        // Left line
        this.ctx.beginPath();
        this.ctx.moveTo(this.canvas.width/2 - 5, 0);
        this.ctx.lineTo(this.canvas.width/2 - 5, this.canvas.height);
        this.ctx.stroke();
        
        // Right line
        this.ctx.beginPath();
        this.ctx.moveTo(this.canvas.width/2 + 5, 0);
        this.ctx.lineTo(this.canvas.width/2 + 5, this.canvas.height);
        this.ctx.stroke();
        
        // Add glow effect
        this.ctx.shadowColor = '#ffff00';
        this.ctx.shadowBlur = 10;
        this.ctx.stroke();
        this.ctx.shadowBlur = 0;
        this.ctx.setLineDash([]);
    }

    drawSideBarriers() {
        for (let y = 0; y < this.canvas.height; y += 20) {
            const width = this.getRoadWidthAtY(y);
            const x = this.getLeftBoundaryAtY(y);
            const scale = 1 - (y / this.canvas.height) * 0.7;
            
            // Guard rails
            this.ctx.fillStyle = '#666';
            this.ctx.fillRect(x - 10 * scale, y, 5 * scale, 15 * scale);
            this.ctx.fillRect(x + width + 5 * scale, y, 5 * scale, 15 * scale);
            
            // Reflective markers
            if (y % 60 === 0) {
                this.ctx.fillStyle = '#ff6b6b';
                this.ctx.beginPath();
                this.ctx.rect(x - 12 * scale, y + 5 * scale, 3 * scale, 5 * scale);
                this.ctx.rect(x + width + 9 * scale, y + 5 * scale, 3 * scale, 5 * scale);
                this.ctx.fill();
                
                // Marker glow
                const markerGlow = this.ctx.createRadialGradient(
                    x - 10 * scale, y + 7 * scale, 0,
                    x - 10 * scale, y + 7 * scale, 10 * scale
                );
                markerGlow.addColorStop(0, 'rgba(255, 107, 107, 0.3)');
                markerGlow.addColorStop(1, 'rgba(255, 107, 107, 0)');
                this.ctx.fillStyle = markerGlow;
                this.ctx.fill();
            }
        }
    }

    drawRoadEffects() {
        // Road shine
        const roadShine = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        roadShine.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
        roadShine.addColorStop(0.5, 'rgba(255, 255, 255, 0.05)');
        roadShine.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        this.ctx.fillStyle = roadShine;
        this.ctx.beginPath();
        this.ctx.moveTo(200, 0);
        this.ctx.lineTo(600, 0);
        this.ctx.lineTo(this.canvas.width - 100, this.canvas.height);
        this.ctx.lineTo(100, this.canvas.height);
        this.ctx.closePath();
        this.ctx.fill();
        
        // Light reflections on road
        for (let y = 0; y < this.canvas.height; y += 200) {
            const width = this.getRoadWidthAtY(y);
            const x = this.getLeftBoundaryAtY(y);
            const scale = 1 - (y / this.canvas.height) * 0.7;
            
            // Create light pools from street lights
            const leftGlow = this.ctx.createRadialGradient(
                x, y, 0,
                x, y, 100 * scale
            );
            leftGlow.addColorStop(0, 'rgba(255, 255, 200, 0.1)');
            leftGlow.addColorStop(1, 'rgba(255, 255, 200, 0)');
            
            this.ctx.fillStyle = leftGlow;
            this.ctx.beginPath();
            this.ctx.ellipse(x, y, 100 * scale, 50 * scale, 0, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Right side light pool
            const rightGlow = this.ctx.createRadialGradient(
                x + width, y, 0,
                x + width, y, 100 * scale
            );
            rightGlow.addColorStop(0, 'rgba(255, 255, 200, 0.1)');
            rightGlow.addColorStop(1, 'rgba(255, 255, 200, 0)');
            
            this.ctx.fillStyle = rightGlow;
            this.ctx.beginPath();
            this.ctx.ellipse(x + width, y, 100 * scale, 50 * scale, 0, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    initDifficultySelection() {
        const difficultyBtns = document.querySelectorAll('.difficulty-btn');
        
        // Set initial selection
        document.querySelector(`[data-difficulty="${this.currentDifficulty}"]`)?.classList.add('selected');

        difficultyBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // Remove previous selection
                difficultyBtns.forEach(b => b.classList.remove('selected'));
                
                // Add selection to clicked button
                btn.classList.add('selected');
                
                // Update difficulty
                this.currentDifficulty = btn.dataset.difficulty;
                
                // Update car speed
                this.car.speed = this.difficulties[this.currentDifficulty].carSpeed;
            });
        });
    }

    moveCarWithinRoad(newX, newY) {
        // Calculate road boundaries at the car's Y position
        const roadWidth = this.getRoadWidthAtY(newY);
        const leftBoundary = this.getLeftBoundaryAtY(newY);
        const rightBoundary = leftBoundary + roadWidth;

        // Keep car within road boundaries
        this.car.x = Math.max(
            leftBoundary + this.car.width * 0.5,
            Math.min(newX, rightBoundary - this.car.width * 0.5)
        );
        
        // Keep car within vertical boundaries
        this.car.y = Math.max(
            50, // Minimum distance from top
            Math.min(newY, this.canvas.height - this.car.height - 10)
        );
    }

    getRoadWidthAtY(y) {
        // Calculate road width based on perspective
        const progress = y / this.canvas.height;
        return this.road.topWidth + (this.road.bottomWidth - this.road.topWidth) * progress;
    }

    getLeftBoundaryAtY(y) {
        // Calculate left boundary of road based on perspective
        const progress = y / this.canvas.height;
        return this.road.leftOffset + (100 - this.road.leftOffset) * progress;
    }

    initPauseMenu() {
        // Add keyboard listener for ESC key
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isGameRunning) {
                this.togglePause();
            }
        });

        // Add button listeners
        const resumeBtn = document.getElementById('resumeGame');
        const returnBtn = document.getElementById('returnToMenu');
        
        if (resumeBtn) {
            resumeBtn.addEventListener('click', () => this.togglePause());
        }
        
        if (returnBtn) {
            returnBtn.addEventListener('click', () => this.returnToMenu());
        }
    }

    togglePause() {
        if (!this.isGameRunning) return;

        this.isPaused = !this.isPaused;
        const pauseMenu = document.getElementById('pauseMenu');
        
        if (this.isPaused) {
            // Stop game loop and sounds
            cancelAnimationFrame(this.animationFrameId);
            this.sounds.background.pause();
            this.sounds.engine.pause();
            
            // Show pause menu
            if (pauseMenu) {
                pauseMenu.style.display = 'block';
            }
        } else {
            // Hide pause menu
            if (pauseMenu) {
                pauseMenu.style.display = 'none';
            }
            
            // Resume sounds and game loop
            this.sounds.background.play();
            this.sounds.engine.play();
            this.gameLoop();
        }
    }

    returnToMenu() {
        // Stop game
        this.isGameRunning = false;
        this.isPaused = false;
        cancelAnimationFrame(this.animationFrameId);
        
        // Stop sounds
        Object.values(this.sounds).forEach(sound => {
            sound.pause();
            sound.currentTime = 0;
        });
        
        // Hide pause menu and game over screen
        const pauseMenu = document.getElementById('pauseMenu');
        const gameOver = document.getElementById('gameOver');
        if (pauseMenu) pauseMenu.style.display = 'none';
        if (gameOver) gameOver.style.display = 'none';
        
        // Show main menu
        const menu = document.getElementById('menu');
        if (menu) menu.style.display = 'block';
        
        // Reset game state
        this.score = 0;
        this.obstacles = [];
        this.car.x = this.canvas.width / 2;
        this.car.y = this.canvas.height - 100;
        document.getElementById('score').textContent = '0';
    }

    initCarSelection() {
        const carBtns = document.querySelectorAll('.car-btn');
        
        carBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // Remove previous selection
                carBtns.forEach(b => b.classList.remove('selected'));
                
                // Add selection to clicked button
                btn.classList.add('selected');
                
                // Update car theme
                this.currentCarTheme = btn.dataset.car;
                
                // Update car speed based on theme
                this.car.speed = this.carThemes[this.currentCarTheme].speed;
            });
        });
    }

    drawSUVDetails(x, y, width, height) {
        // Roof racks
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(x + width * 0.3, y + height * 0.2);
        this.ctx.lineTo(x + width * 0.7, y + height * 0.2);
        this.ctx.stroke();

        // Cross bars
        for (let i = 0.35; i <= 0.65; i += 0.15) {
            this.ctx.beginPath();
            this.ctx.moveTo(x + width * i, y + height * 0.15);
            this.ctx.lineTo(x + width * i, y + height * 0.25);
            this.ctx.stroke();
        }
    }

    drawSupercarDetails(x, y, width, height) {
        // Spoiler
        this.ctx.fillStyle = this.carThemes[this.currentCarTheme].secondary;
        this.ctx.beginPath();
        this.ctx.moveTo(x + width * 0.2, y + height * 0.3);
        this.ctx.lineTo(x + width * 0.8, y + height * 0.3);
        this.ctx.lineTo(x + width * 0.9, y + height * 0.25);
        this.ctx.lineTo(x + width * 0.1, y + height * 0.25);
        this.ctx.fill();

        // Side vents
        this.ctx.fillStyle = '#333';
        this.ctx.beginPath();
        this.ctx.moveTo(x + width * 0.1, y + height * 0.5);
        this.ctx.lineTo(x + width * 0.2, y + height * 0.5);
        this.ctx.lineTo(x + width * 0.15, y + height * 0.6);
        this.ctx.lineTo(x + width * 0.05, y + height * 0.6);
        this.ctx.fill();

        // Repeat for right side
        this.ctx.beginPath();
        this.ctx.moveTo(x + width * 0.9, y + height * 0.5);
        this.ctx.lineTo(x + width * 0.8, y + height * 0.5);
        this.ctx.lineTo(x + width * 0.85, y + height * 0.6);
        this.ctx.lineTo(x + width * 0.95, y + height * 0.6);
        this.ctx.fill();
    }
}

// Initialize game when page loads
window.onload = () => {
    const game = new Game();
}; 