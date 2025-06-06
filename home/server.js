// server.js

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*", // Allow connections from any origin
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Serve the index.html file and any other static assets in the folder
app.use(express.static(__dirname));

// --- Game Constants (should match client-side) ---
const WORLD_WIDTH = 1200 * 4;
const WORLD_HEIGHT = 900 * 4;
const PLAYER_SIZE = 100;
const PLAYER_MAX_HEALTH = 100;
const ATTACK_RANGE = 150; // How far a bat swing reaches
const ATTACK_DAMAGE = 20;

let players = {};

io.on('connection', (socket) => {
    console.log(`✅ Player connected: ${socket.id}`);

    // Create a new player object
    players[socket.id] = {
        id: socket.id,
        x: Math.random() * (WORLD_WIDTH - 200) + 100,
        y: Math.random() * (WORLD_HEIGHT - 200) + 100,
        health: PLAYER_MAX_HEALTH,
        maxHealth: PLAYER_MAX_HEALTH,
        direction: 1, // 1 for left, -1 for right
        weaponAngle: 0,
        kills: 0,
        name: 'BONKER' // Default name
    };

    // Listen for the player to set their username
    socket.on('setUsername', (username) => {
        if (players[socket.id]) {
            players[socket.id].name = username.substring(0, 15); // Use the provided username
            console.log(`Player ${socket.id} set username to: ${players[socket.id].name}`);

            // Send the initial game state to the new player
            socket.emit('gameState', {
                players: players,
                playerCount: Object.keys(players).length
            });

            // Inform other players about the new player
            socket.broadcast.emit('playerUpdate', players[socket.id]);
            io.emit('playerCountUpdate', Object.keys(players).length);
        }
    });

    // Handle player movement
    socket.on('move', (data) => {
        const player = players[socket.id];
        if (player) {
            player.x = data.x;
            player.y = data.y;
            player.direction = data.direction;
            player.weaponAngle = data.weaponAngle;

            // Broadcast the update to other players
            socket.broadcast.emit('playerUpdate', player);
        }
    });

    // Handle desktop area attacks
    socket.on('areaAttack', (data) => {
        handleAttack(socket.id, data.direction);
    });

    // Handle mobile collision attacks
    socket.on('mobileCollisionAttack', (data) => {
        handleAttack(socket.id, data.direction);
    });

    // Handle attack animations
    socket.on('attackAnimation', (data) => {
        socket.broadcast.emit('attackAnimation', data);
    });


    // Handle player respawn request
    socket.on('respawn', () => {
        const player = players[socket.id];
        if (player && player.health <= 0) {
            player.health = PLAYER_MAX_HEALTH;
            player.x = Math.random() * (WORLD_WIDTH - 200) + 100;
            player.y = Math.random() * (WORLD_HEIGHT - 200) + 100;

            // Inform everyone (including the player) about the respawn
            io.emit('playerRespawned', player);
        }
    });


    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`❌ Player disconnected: ${socket.id}`);
        delete players[socket.id];
        // Inform other players that this player has left
        io.emit('playerLeft', socket.id);
        io.emit('playerCountUpdate', Object.keys(players).length);
    });
});

function handleAttack(attackerId, direction) {
    const attacker = players[attackerId];
    if (!attacker || attacker.health <= 0) return;

    for (const victimId in players) {
        // Can't hit yourself
        if (victimId === attackerId) continue;

        const victim = players[victimId];
        if (victim.health <= 0) continue;

        const dx = victim.x - attacker.x;
        const dy = victim.y - attacker.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Check if victim is in range
        if (distance < ATTACK_RANGE) {
            // Check if victim is in the direction of the attack
            const isFacingVictim = (direction === -1 && dx > 0) || (direction === 1 && dx < 0);

            if (isFacingVictim) {
                // Inflict damage
                victim.health -= ATTACK_DAMAGE;
                io.emit('playerHit', {
                    playerId: victimId,
                    health: victim.health,
                    x: victim.x,
                    y: victim.y
                });

                // Check for kill
                if (victim.health <= 0) {
                    attacker.kills++;
                    // Broadcast the kill event
                    io.emit('playerKilled', {
                        killer: { id: attackerId, name: attacker.name, kills: attacker.kills },
                        victim: { id: victimId, name: victim.name }
                    });
                    // Also send a full update for the attacker to update their kill count
                    io.emit('playerUpdate', attacker);
                }
                // Stop after hitting one player to prevent cleaving through everyone
                break;
            }
        }
    }
}

server.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});