const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: false,
    allowedHeaders: ['Content-Type']
  }
});

// ─── Game Constants ───────────────────────────────────────────────────────────
const GRID_COLS = 20;       // logical x units (0=start, 20=goal)
const GRID_ROWS = 30;       // logical y units across 3 rows
const PLAYERS_PER_TEAM = 3;
const GAME_DURATION = 150;  // seconds per turn
const TAG_RADIUS = 1.2;     // grid-cell proximity for tagging

/*
  ══════════════════════════════════════════════════════
  AUTHENTIC GALAH PANJANG SCORING
  ══════════════════════════════════════════════════════

  COURT (9 cols × 6 rows):
    col: 0       1   2   3   4   5   6   7   8
        [START]──────galah lines──────────[GOAL]
                 🛡️↕  🛡️↕  🛡️↕  🛡️↕
                          🚧↔  ← vertical guard (centre row)

  DEFENDERS:
    • Horizontal defenders (H-guards): guard galah COLUMNS 2, 4, 6
      They can only slide UP / DOWN along their assigned column.
    • Vertical defender (V-guard): guards the CENTRE ROW (row 3)
      They can only slide LEFT / RIGHT along that row.

  ATTACKER PHASE MACHINE:
    going → atGoal → returning → safe   (or → tagged at any point)

    'going'     : moving right toward goal (col 8)
    'atGoal'    : touched col 8 — must now return left
    'returning' : heading back toward start
    'safe'      : returned to col 0 — SCORES 1 POINT for their team this turn
    'tagged'    : eliminated by a defender

  TURN STRUCTURE (each team gets ONE turn attacking):
    Turn 1 → Team A attacks,  Team B defends
    Turn 2 → Team B attacks,  Team A defends
    Tiebreaker (if A.score === B.score after 2 turns) → sudden death

  SCORING:
    Each attacker who completes the full round trip (go + return) scores 1 point
    for their team in that turn. Safe crossings accumulate across turns.
    The team with MORE total safe crossings after both turns wins the match.
══════════════════════════════════════════════════════
*/

// ─── In-memory state ──────────────────────────────────────────────────────────
const rooms = {};
const players = {};
const leaderboard = [];

// ─── Room factory ─────────────────────────────────────────────────────────────
function createRoom(hostId, isPublic = true) {
  const roomId = uuidv4().slice(0, 6).toUpperCase();
  rooms[roomId] = {
    id: roomId,
    isPublic,
    phase: 'lobby',   // lobby | playing | ended
    host: hostId,
    originalTeams: { A: [], B: [] },  // fixed throughout match
    currentRoles: { attacker: [], defender: [] },  // swaps each turn
    spectators: [],
    gameState: null,
    timer: null,
    scores: { A: 0, B: 0 },          // total safe crossings per original team
    turn: 1,
    maxTurns: 2,
    chat: [],
  };
  return roomId;
}

// ─── Game state factory ───────────────────────────────────────────────────────
//
// Court is 2 columns × 3 rows.  Positions use floating-point units:
//   col: 0 (left/start) → GRID_COLS (right/goal)
//   row: 0 (top)        → GRID_ROWS (bottom)
//
// Defenders:
//   D0 (horizontal, top line)    — col moves freely, row fixed at GRID_ROWS/3
//   D1 (vertical, centre column) — row moves freely, col fixed at GRID_COLS/2
//                                   can also GRAB (extend arm) up or down
//   D2 (horizontal, bottom line) — col moves freely, row fixed at GRID_ROWS*2/3
//
function createGameState(room) {
  const atkIds = room.currentRoles.attacker;
  const defIds = room.currentRoles.defender;

  // Attackers: spread evenly across rows, start near left edge
  const attackers = atkIds.map((sid, i) => ({
    id: sid,
    name: players[sid]?.name || `Attacker ${i + 1}`,
    avatar: players[sid]?.avatar || '⚡',
    col: 1,
    row: (GRID_ROWS / (atkIds.length + 1)) * (i + 1),
    phase: 'going',
    scored: false,
  }));

  // coord system: col=0 (start/bottom) → GRID_COLS (goal/top)  maps to canvas Y (inverted)
  //               row=0 (left)          → GRID_ROWS (right)       maps to canvas X
  //
  // Canvas galah lines:
  //   D0 (top on screen, 1/3 from top)    → col = GRID_COLS * 2/3
  //   D2 (bottom on screen, 2/3 from top) → col = GRID_COLS * 1/3
  //   D1 (centre vertical)                → row = GRID_ROWS / 2
  //
  // D0/D2: direction='horizontal', col is FIXED, row slides (left/right on screen)
  // D1:    direction='vertical',   row is FIXED, col slides (up/down on screen)

  const d0 = defIds[0] ? {
    id: defIds[0],
    name: players[defIds[0]]?.name || 'D-Top',
    avatar: players[defIds[0]]?.avatar || '🛡️',
    direction: 'horizontal',
    col: Math.round(GRID_COLS * 2 / 3),   // 1/3 from top on screen
    row: Math.round(GRID_ROWS / 2),        // start at horizontal centre
  } : null;

  const d1 = defIds[1] ? {
    id: defIds[1],
    name: players[defIds[1]]?.name || 'D-Mid',
    avatar: players[defIds[1]]?.avatar || '🚧',
    direction: 'vertical',
    col: Math.round(GRID_COLS / 2),        // start at vertical centre
    row: Math.round(GRID_ROWS / 2),        // locked to centre column
    grabCooldown: 0,
  } : null;

  const d2 = defIds[2] ? {
    id: defIds[2],
    name: players[defIds[2]]?.name || 'D-Bot',
    avatar: players[defIds[2]]?.avatar || '🛡️',
    direction: 'horizontal',
    col: Math.round(GRID_COLS * 1 / 3),   // 2/3 from top on screen
    row: Math.round(GRID_ROWS / 2),        // start at horizontal centre
  } : null;

  const defenders = [d0, d1, d2].filter(Boolean);

  return {
    attackers,
    defenders,
    timeLeft: GAME_DURATION,
    phase: 'playing',
    turnScore: 0,
    winner: null,
  };
}

// ─── Public state helpers ─────────────────────────────────────────────────────
function getRoomPublicState(roomId) {
  const room = rooms[roomId];
  if (!room) return null;
  return {
    id: room.id,
    phase: room.phase,
    host: room.host,
    isPublic: room.isPublic,
    originalTeams: {
      A: room.originalTeams.A.map(sid => ({ id: sid, name: players[sid]?.name, avatar: players[sid]?.avatar })),
      B: room.originalTeams.B.map(sid => ({ id: sid, name: players[sid]?.name, avatar: players[sid]?.avatar })),
    },
    currentRoles: {
      attacker: room.currentRoles.attacker.map(sid => ({ id: sid, name: players[sid]?.name, avatar: players[sid]?.avatar })),
      defender: room.currentRoles.defender.map(sid => ({ id: sid, name: players[sid]?.name, avatar: players[sid]?.avatar })),
    },
    spectators: room.spectators.map(sid => ({ id: sid, name: players[sid]?.name })),
    scores: room.scores,
    turn: room.turn,
    maxTurns: room.maxTurns,
    gameState: room.gameState,
    playerCount: room.originalTeams.A.length + room.originalTeams.B.length,
    maxPlayers: PLAYERS_PER_TEAM * 2,
  };
}

function getPublicRooms() {
  return Object.values(rooms)
    .filter(r => r.isPublic && r.phase === 'lobby')
    .map(r => ({
      id: r.id,
      host: players[r.host]?.name || 'Unknown',
      playerCount: r.originalTeams.A.length + r.originalTeams.B.length,
      teamACcount: r.originalTeams.A.length,
      teamBCount: r.originalTeams.B.length,
      maxPlayers: PLAYERS_PER_TEAM * 2,
      maxPerTeam: PLAYERS_PER_TEAM,
      turn: r.turn,
      maxTurns: r.maxTurns,
    }));
}

// ─── Tag detection ────────────────────────────────────────────────────────────
function isTagged(att, def) {
  if (att.phase === 'tagged' || att.phase === 'safe') return false;
  const dc = Math.abs(def.col - att.col);
  const dr = Math.abs(def.row - att.row);

  if (def.direction === 'horizontal') {
    // D0/D2: col is the galah line (fixed), row slides left-right.
    // Tag if attacker is near the line (close col) AND within defender's left-right reach (close row).
    return dc <= TAG_RADIUS * 1.5 && dr <= TAG_RADIUS * 2;
  } else {
    // D1: row is the centre column (fixed), col slides up-down.
    // Tag if attacker is near the centre column (close row) AND within defender's up-down reach (close col).
    return dr <= TAG_RADIUS * 1.5 && dc <= TAG_RADIUS * 2;
  }
}

// Grab tag: ALL defenders extend arms LEFT (grabDir=-1) or RIGHT (grabDir=1).
// For horizontal defenders (D0/D2): they guard a fixed col line, grab extends their row reach.
// For vertical defender (D1):       it guards the centre row, grab extends left/right (row direction).
// Both cases: grab extends in the ROW direction, proximity check on COL axis.
function isGrabTagged(att, def, grabDir) {
  if (att.phase === 'tagged' || att.phase === 'safe') return false;

  if (def.direction === 'horizontal') {
    // D0/D2: col is their fixed line. Grab extends row reach left/right.
    // Attacker must be near their galah line (col proximity).
    const colMatch = Math.abs(def.col - att.col) <= TAG_RADIUS * 2;
    const rowMatch = grabDir === -1
      ? (att.row <= def.row && att.row >= def.row - TAG_RADIUS * 6)
      : (att.row >= def.row && att.row <= def.row + TAG_RADIUS * 6);
    return colMatch && rowMatch;
  } else {
    // D1: row is fixed centre column. Grab extends row reach left/right.
    // Attacker must be near the centre column (col proximity).
    const colMatch = Math.abs(def.col - att.col) <= TAG_RADIUS * 2;
    const rowMatch = grabDir === -1
      ? (att.row <= def.row && att.row >= def.row - TAG_RADIUS * 6)
      : (att.row >= def.row && att.row <= def.row + TAG_RADIUS * 6);
    return colMatch && rowMatch;
  }
}

// ─── Turn end logic ───────────────────────────────────────────────────────────
function checkTurnEnd(room) {
  const gs = room.gameState;
  if (!gs || gs.phase === 'ended') return;
  const allDone = gs.attackers.every(a => a.phase === 'safe' || a.phase === 'tagged');
  if (allDone || gs.timeLeft <= 0) endTurn(room);
}

function endTurn(room) {
  const gs = room.gameState;
  if (!gs || gs.phase === 'ended') return;
  clearInterval(room.timer);
  gs.phase = 'ended';

  const safeCrossings = gs.attackers.filter(a => a.phase === 'safe').length;
  gs.turnScore = safeCrossings;

  // Credit score to whichever original team was attacking this turn
  // Turn 1: A attacked. Turn 2: B attacked. Turn 3 (tiebreak): whoever is in currentRoles.attacker
  let attackingOriginalTeam = null;
  if (room.turn === 1) attackingOriginalTeam = 'A';
  else if (room.turn === 2) attackingOriginalTeam = 'B';
  else {
    // Tiebreaker: look up which original team the current attackers belong to
    const firstAttSid = room.currentRoles.attacker[0];
    attackingOriginalTeam = room.originalTeams.A.includes(firstAttSid) ? 'A' : 'B';
  }
  if (attackingOriginalTeam) room.scores[attackingOriginalTeam] += safeCrossings;

  io.to(room.id).emit('turn_ended', {
    turn: room.turn,
    safeCrossings,
    attackingTeam: attackingOriginalTeam,
    scores: room.scores,
  });

  if (room.turn >= room.maxTurns) {
    if (room.scores.A === room.scores.B) {
      setTimeout(() => {
        room.turn = 3;
        swapRoles(room);
        startTurn(room);
      }, 4000);
    } else {
      setTimeout(() => endMatch(room), 4000);
    }
  } else {
    setTimeout(() => {
      room.turn++;
      swapRoles(room);
      startTurn(room);
    }, 4000);
  }
}

function swapRoles(room) {
  [room.currentRoles.attacker, room.currentRoles.defender] =
    [room.currentRoles.defender, room.currentRoles.attacker];

  room.currentRoles.attacker.forEach(sid => { if (players[sid]) players[sid].currentRole = 'attacker'; });
  room.currentRoles.defender.forEach(sid => { if (players[sid]) players[sid].currentRole = 'defender'; });

  io.to(room.id).emit('roles_swapped', {
    newAttackers: room.currentRoles.attacker.map(sid => ({ id: sid, name: players[sid]?.name, avatar: players[sid]?.avatar })),
    newDefenders: room.currentRoles.defender.map(sid => ({ id: sid, name: players[sid]?.name, avatar: players[sid]?.avatar })),
  });
}

function endMatch(room) {
  room.phase = 'ended';
  const winner = room.scores.A > room.scores.B ? 'A'
    : room.scores.B > room.scores.A ? 'B' : 'draw';

  const allSids = [...room.originalTeams.A, ...room.originalTeams.B];
  allSids.forEach(sid => {
    const p = players[sid];
    if (!p) return;
    const wonMatch = room.originalTeams[winner]?.includes(sid) ?? false;
    const entry = leaderboard.find(l => l.id === sid);
    if (entry) { entry.wins += wonMatch ? 1 : 0; entry.gamesPlayed++; }
    else leaderboard.push({ id: sid, name: p.name, avatar: p.avatar, wins: wonMatch ? 1 : 0, gamesPlayed: 1 });
  });

  io.to(room.id).emit('match_ended', {
    winner,
    scores: room.scores,
    leaderboard: leaderboard.slice().sort((a, b) => b.wins - a.wins).slice(0, 10),
  });
}

function startTurn(room) {
  room.phase = 'playing';
  room.gameState = createGameState(room);
  io.to(room.id).emit('turn_started', {
    gameState: room.gameState,
    turn: room.turn,
    roles: {
      attackers: room.currentRoles.attacker.map(sid => ({ id: sid, name: players[sid]?.name, avatar: players[sid]?.avatar })),
      defenders: room.currentRoles.defender.map(sid => ({ id: sid, name: players[sid]?.name, avatar: players[sid]?.avatar })),
    },
    scores: room.scores,
  });

  room.timer = setInterval(() => {
    if (!room.gameState || room.gameState.phase === 'ended') return;
    room.gameState.timeLeft--;
    // Decrement grab cooldowns
    room.gameState.defenders.forEach(d => { if (d.grabCooldown > 0) d.grabCooldown--; });
    if (room.gameState.timeLeft <= 0) {
      endTurn(room);
    } else {
      io.to(room.id).emit('game_tick', { timeLeft: room.gameState.timeLeft, gameState: room.gameState });
    }
  }, 1000);
}

// ─── Socket events ────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] ${socket.id}`);

  socket.on('register', ({ name, avatar }) => {
    players[socket.id] = {
      id: socket.id,
      name: name || `Player_${socket.id.slice(0, 4)}`,
      avatar: avatar || '🎮',
      roomId: null,
      originalTeam: null,
      currentRole: null,
    };
    socket.emit('registered', { id: socket.id });
    socket.emit('public_rooms', getPublicRooms());
    socket.emit('leaderboard', leaderboard.slice().sort((a, b) => b.wins - a.wins).slice(0, 10));
  });

  socket.on('create_room', ({ isPublic = true } = {}) => {
    const p = players[socket.id];
    if (!p) return;
    const roomId = createRoom(socket.id, isPublic);
    socket.join(roomId);
    p.roomId = roomId;
    socket.emit('room_created', { roomId });
    socket.emit('room_state', getRoomPublicState(roomId));
    io.emit('public_rooms', getPublicRooms());
  });

  socket.on('get_rooms', () => socket.emit('public_rooms', getPublicRooms()));

  socket.on('join_room', ({ roomId, team, asSpectator = false }) => {
    const room = rooms[roomId];
    const p = players[socket.id];
    if (!room || !p) return socket.emit('error', { msg: 'Room not found' });
    if (room.phase !== 'lobby') return socket.emit('error', { msg: 'Game already started' });
    if (p.roomId && p.roomId !== roomId) doLeaveRoom(socket);

    socket.join(roomId);
    p.roomId = roomId;

    if (asSpectator) {
      if (!room.spectators.includes(socket.id)) room.spectators.push(socket.id);
      p.originalTeam = 'spectator';
      p.currentRole = 'spectator';
    } else {
      // Map legacy lobby labels ('attacker'->A, 'defender'->B) or direct 'A'/'B'
      const preferred = (team === 'attacker' || team === 'A') ? 'A' : 'B';
      const other     = preferred === 'A' ? 'B' : 'A';

      // Auto-assign: use preferred if space, else fall back to other team
      let targetTeam = null;
      if (room.originalTeams[preferred].length < PLAYERS_PER_TEAM) {
        targetTeam = preferred;
      } else if (room.originalTeams[other].length < PLAYERS_PER_TEAM) {
        targetTeam = other;
        socket.emit('info', { msg: `Team ${preferred} is full — you joined Team ${other} instead!` });
      } else {
        return socket.emit('error', { msg: 'Room is full — no spots available' });
      }

      if (!room.originalTeams[targetTeam].includes(socket.id)) {
        room.originalTeams[targetTeam].push(socket.id);
        if (targetTeam === 'A') {
          room.currentRoles.attacker.push(socket.id);
          p.currentRole = 'attacker';
        } else {
          room.currentRoles.defender.push(socket.id);
          p.currentRole = 'defender';
        }
      }
      p.originalTeam = targetTeam;
    }

    io.to(roomId).emit('room_state', getRoomPublicState(roomId));
    io.emit('public_rooms', getPublicRooms());
  });

  socket.on('switch_team', ({ team }) => {
    const p = players[socket.id];
    if (!p?.roomId) return;
    const room = rooms[p.roomId];
    if (!room || room.phase !== 'lobby') return;

    room.originalTeams.A = room.originalTeams.A.filter(id => id !== socket.id);
    room.originalTeams.B = room.originalTeams.B.filter(id => id !== socket.id);
    room.currentRoles.attacker = room.currentRoles.attacker.filter(id => id !== socket.id);
    room.currentRoles.defender = room.currentRoles.defender.filter(id => id !== socket.id);
    room.spectators = room.spectators.filter(id => id !== socket.id);

    if (team === 'spectator') {
      room.spectators.push(socket.id);
      p.originalTeam = 'spectator'; p.currentRole = 'spectator';
    } else {
      const t = team === 'B' ? 'B' : 'A';
      if (room.originalTeams[t].length >= PLAYERS_PER_TEAM)
        return socket.emit('error', { msg: 'Team is full' });
      room.originalTeams[t].push(socket.id);
      p.originalTeam = t;
      if (t === 'A') { room.currentRoles.attacker.push(socket.id); p.currentRole = 'attacker'; }
      else { room.currentRoles.defender.push(socket.id); p.currentRole = 'defender'; }
    }
    io.to(room.id).emit('room_state', getRoomPublicState(room.id));
  });

  socket.on('start_game', () => {
    const p = players[socket.id];
    if (!p?.roomId) return;
    const room = rooms[p.roomId];
    if (!room || room.host !== socket.id) return socket.emit('error', { msg: 'Only host can start' });
    if (room.originalTeams.A.length < 1 || room.originalTeams.B.length < 1)
      return socket.emit('error', { msg: 'Need at least 1 player per team' });
    startTurn(room);
    io.emit('public_rooms', getPublicRooms());
  });

  socket.on('player_move', ({ direction }) => {
    const p = players[socket.id];
    if (!p?.roomId) return;
    const room = rooms[p.roomId];
    if (!room?.gameState || room.phase !== 'playing' || room.gameState.phase !== 'playing') return;
    const gs = room.gameState;
    const STEP = 1.5;

    if (p.currentRole === 'attacker') {
      const att = gs.attackers.find(a => a.id === socket.id);
      if (!att || att.phase === 'tagged' || att.phase === 'safe') return;

      let { col, row } = att;
      // Court is portrait: UP moves toward goal (col increases), DOWN moves back
      // LEFT/RIGHT moves sideways (row changes)
      if (direction === 'up')    col = Math.min(GRID_COLS, col + STEP);
      else if (direction === 'down')  col = Math.max(0, col - STEP);
      else if (direction === 'left')  row = Math.max(0, row - STEP);
      else if (direction === 'right') row = Math.min(GRID_ROWS, row + STEP);
      att.col = col; att.row = row;

      // Phase transitions
      if (att.phase === 'going' && col >= GRID_COLS - 1) {
        att.phase = 'atGoal';
        io.to(room.id).emit('attacker_at_goal', { attackerId: socket.id, name: att.name, avatar: att.avatar });
      }
      if (att.phase === 'atGoal' && col < GRID_COLS - 1) {
        att.phase = 'returning';
        io.to(room.id).emit('attacker_returning', { attackerId: socket.id, name: att.name, avatar: att.avatar });
      }
      if (att.phase === 'returning' && col <= 1) {
        att.phase = 'safe';
        att.scored = true;
        gs.turnScore = (gs.turnScore || 0) + 1;
        io.to(room.id).emit('attacker_scored', { attackerId: socket.id, name: att.name, avatar: att.avatar, turnScore: gs.turnScore });
      }

      // Tag check
      for (const def of gs.defenders) {
        if (isTagged(att, def)) {
          att.phase = 'tagged';
          io.to(room.id).emit('player_tagged', { attackerId: socket.id, defenderId: def.id, attackerName: att.name });
          break;
        }
      }

      checkTurnEnd(room);
      io.to(room.id).emit('game_state_update', { gameState: gs });
    }

    if (p.currentRole === 'defender') {
      const def = gs.defenders.find(d => d.id === socket.id);
      if (!def) return;

      // Horizontal defender (D0/D2): only LEFT/RIGHT — moves row (X on screen), col locked
      if (def.direction === 'horizontal') {
        if      (direction === 'left')  def.row = Math.max(0, def.row - STEP);
        else if (direction === 'right') def.row = Math.min(GRID_ROWS, def.row + STEP);
        // ignore up/down entirely
      }
      // Vertical defender (D1): only UP/DOWN — moves col (Y on screen), row locked
      // Can move freely up to goal, but cannot cross into start zone (col <= 2)
      if (def.direction === 'vertical') {
        const D1_MIN = 4;  // just above start zone
        if      (direction === 'up')   def.col = Math.min(GRID_COLS - 1, def.col + STEP);
        else if (direction === 'down') def.col = Math.max(D1_MIN, def.col - STEP);
        // ignore left/right entirely
      }

      // Tag check
      for (const att of gs.attackers) {
        if (isTagged(att, def)) {
          att.phase = 'tagged';
          io.to(room.id).emit('player_tagged', { attackerId: att.id, defenderId: socket.id, attackerName: att.name });
        }
      }

      checkTurnEnd(room);
      io.to(room.id).emit('game_state_update', { gameState: gs });
    }
  });

  // ── Grab (D1 vertical defender only) ────────────────────────────────────
  socket.on('player_grab', ({ dir }) => {
    const p = players[socket.id];
    if (!p?.roomId) return;
    const room = rooms[p.roomId];
    if (!room?.gameState || room.phase !== 'playing') return;
    const gs = room.gameState;
    if (p.currentRole !== 'defender') return;

    const def = gs.defenders.find(d => d.id === socket.id);
    if (!def) return;
    if (def.grabCooldown > 0) return;

    def.grabCooldown = 0.5; // 0.5-second cooldown
    io.to(room.id).emit('defender_grab', { defenderId: socket.id, dir, defCol: def.col, defRow: def.row });

    // Check grab tag on attackers
    for (const att of gs.attackers) {
      if (isGrabTagged(att, def, dir)) {
        att.phase = 'tagged';
        io.to(room.id).emit('player_tagged', { attackerId: att.id, defenderId: socket.id, attackerName: att.name, byGrab: true });
      }
    }

    checkTurnEnd(room);
    io.to(room.id).emit('game_state_update', { gameState: gs });
  });

  socket.on('chat_message', ({ message }) => {
    const p = players[socket.id];
    if (!p?.roomId || !message?.trim()) return;
    const msg = { id: uuidv4(), sender: p.name, avatar: p.avatar, message: message.slice(0, 200), timestamp: Date.now(), team: p.originalTeam };
    rooms[p.roomId]?.chat.push(msg);
    io.to(p.roomId).emit('chat_message', msg);
  });

  socket.on('play_again', () => {
    const p = players[socket.id];
    if (!p?.roomId) return;
    const room = rooms[p.roomId];
    if (!room || room.host !== socket.id) return;
    clearInterval(room.timer);
    room.phase = 'lobby';
    room.turn = 1;
    room.scores = { A: 0, B: 0 };
    room.gameState = null;
    room.currentRoles.attacker = [...room.originalTeams.A];
    room.currentRoles.defender = [...room.originalTeams.B];
    room.originalTeams.A.forEach(sid => { if (players[sid]) players[sid].currentRole = 'attacker'; });
    room.originalTeams.B.forEach(sid => { if (players[sid]) players[sid].currentRole = 'defender'; });
    io.to(room.id).emit('room_state', getRoomPublicState(room.id));
    io.to(room.id).emit('lobby_reset');
  });

  function doLeaveRoom(socket) {
    const p = players[socket.id];
    if (!p?.roomId) return;
    const room = rooms[p.roomId];
    if (!room) return;
    room.originalTeams.A = room.originalTeams.A.filter(id => id !== socket.id);
    room.originalTeams.B = room.originalTeams.B.filter(id => id !== socket.id);
    room.currentRoles.attacker = room.currentRoles.attacker.filter(id => id !== socket.id);
    room.currentRoles.defender = room.currentRoles.defender.filter(id => id !== socket.id);
    room.spectators = room.spectators.filter(id => id !== socket.id);
    socket.leave(p.roomId);
    if (room.host === socket.id) {
      const all = [...room.originalTeams.A, ...room.originalTeams.B, ...room.spectators];
      room.host = all[0] || null;
    }
    const total = room.originalTeams.A.length + room.originalTeams.B.length + room.spectators.length;
    if (total === 0) { clearInterval(room.timer); delete rooms[p.roomId]; }
    else {
      io.to(p.roomId).emit('room_state', getRoomPublicState(p.roomId));
      if (room.phase === 'playing') endTurn(room);
    }
    p.roomId = null; p.originalTeam = null; p.currentRole = null;
    io.emit('public_rooms', getPublicRooms());
  }

  socket.on('leave_room', () => doLeaveRoom(socket));
  socket.on('disconnect', () => { doLeaveRoom(socket); delete players[socket.id]; console.log(`[-] ${socket.id}`); });
  socket.on('get_leaderboard', () => socket.emit('leaderboard', leaderboard.slice().sort((a, b) => b.wins - a.wins).slice(0, 10)));
});

app.get('/health', (req, res) => res.json({ status: 'ok', rooms: Object.keys(rooms).length }));
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => console.log(`🎮 Galah Panjang server :${PORT}`));
