# 🏃 Galah Panjang — Online Multiplayer Game

A real-time multiplayer web game based on **Galah Panjang** (Galasin), the classic Malaysian/Indonesian traditional tag game. Built with React + Node.js + Socket.io.

---

## 🎮 Gameplay

### The Court
- A 7×5 grid representing the Galah Panjang court
- **4 horizontal "galah" lines** defended by the Defender team
- Attackers start on the left, goal is the right side

### Teams (3v3)
| Team | Role | Win Condition |
|------|------|--------------|
| ⚡ **Attackers** | Cross all galah lines and return | All 3 attackers cross to the goal |
| 🛡️ **Defenders** | Guard lines, tag attackers | Tag all attackers OR time runs out |

### Rules
- **Defenders** patrol their assigned horizontal galah line (can slide left/right)
- **Attackers** move freely on the grid
- If a defender touches an attacker → attacker is **eliminated**
- Attackers must cross all 4 lines to reach the goal
- Best of 3 rounds determines the winner
- Each round has a **120-second timer** — defenders win on timeout

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm 8+

### Installation

```bash
# Clone / download the project
cd galah-panjang

# Install all dependencies
npm run install:all

# (Also install root concurrently package)
npm install
```

### Development (run both server + client)

```bash
npm run dev
```

This starts:
- **Server** at `http://localhost:3001` (Socket.io + REST)
- **Client** at `http://localhost:3000` (React dev server)

### Production

```bash
# Build the React client
npm run build:client

# Serve the built client with a static server or CDN
# Run the production server
npm run start:server
```

---

## 📁 Project Structure

```
galah-panjang/
├── package.json            # Root scripts (concurrently)
│
├── server/
│   ├── package.json
│   └── server.js           # Express + Socket.io game server
│
└── client/
    ├── package.json
    └── src/
        ├── App.js           # Root component + screen router
        ├── App.css          # Global design system
        ├── index.js         # React entry point
        ├── hooks/
        │   ├── useSocket.js # Socket.io context provider
        │   └── useGame.js   # All game state + socket events
        └── pages/
            ├── RegisterScreen.jsx   # Name + avatar selection
            ├── LobbyScreen.jsx      # Matchmaking + leaderboard
            ├── RoomScreen.jsx       # Team lobby + chat
            └── GameScreen.jsx       # Game court + D-pad + HUD
```

---

## 🌐 Socket.io Events

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `register` | `{name, avatar}` | Register player |
| `create_room` | `{isPublic}` | Create a new room |
| `join_room` | `{roomId, team, asSpectator}` | Join a room |
| `switch_team` | `{team}` | Change team in lobby |
| `start_game` | — | Host starts the game |
| `player_move` | `{direction}` | Move player (up/down/left/right) |
| `chat_message` | `{message}` | Send chat |
| `play_again` | — | Reset room for new game |
| `leave_room` | — | Leave current room |
| `get_rooms` | — | Fetch public room list |
| `get_leaderboard` | — | Fetch global leaderboard |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `registered` | `{id, name}` | Confirm registration |
| `room_created` | `{roomId}` | Room created successfully |
| `room_state` | `RoomState` | Full room state update |
| `public_rooms` | `Room[]` | List of open public rooms |
| `round_started` | `{gameState, round}` | New round begins |
| `game_tick` | `{timeLeft, gameState}` | 1-second game tick |
| `game_state_update` | `{gameState}` | Position/state changes |
| `player_tagged` | `{attackerId, defenderId}` | Tag event |
| `round_ended` | `{winner, scores, round}` | Round result |
| `game_ended` | `{winner, scores, leaderboard}` | Full game result |
| `lobby_reset` | — | Room reset for new game |
| `chat_message` | `ChatMessage` | Incoming chat |
| `leaderboard` | `LeaderboardEntry[]` | Global leaderboard |
| `error` | `{msg}` | Error message |

---

## 🎮 Controls

### Desktop
| Key | Action |
|-----|--------|
| `↑` / `W` | Move up |
| `↓` / `S` | Move down |
| `←` / `A` | Move left |
| `→` / `D` | Move right |

### Mobile
On-screen **D-Pad** (tap buttons) — bottom of screen during gameplay.

---

## ⚙️ Configuration

### Server (`server/server.js`)
```js
const GRID_COLS = 7;          // Court width
const GRID_ROWS = 5;          // Court height
const PLAYERS_PER_TEAM = 3;   // Players per team
const GAME_DURATION = 120;    // Seconds per round
```

### Client (`client/.env`)
```
REACT_APP_SERVER_URL=http://localhost:3001
```
For production, set this to your deployed server URL.

---

## 🚢 Deployment

### Server (e.g. Railway, Render, Fly.io)
1. Deploy the `server/` folder
2. Set `PORT` environment variable
3. Enable WebSocket support

### Client (e.g. Vercel, Netlify)
1. Build: `npm run build:client`
2. Deploy `client/build/` as a static site
3. Set `REACT_APP_SERVER_URL` to your server URL

---

## 🔮 Future Enhancements
- [ ] Room password protection
- [ ] Custom round timer & round count
- [ ] Persistent leaderboard (database)
- [ ] Animated game intro cutscene
- [ ] Sound effects & background music
- [ ] Spectator view with scroll
- [ ] Mobile gyroscope tilt controls
- [ ] Tournament bracket mode

---

## 📜 About Galah Panjang

Galah Panjang (also called **Galasin** or **Main Galah**) is a traditional Malaysian and Indonesian team tag game played on a rectangular court divided by lines. One team defends the lines while the other tries to cross them all and return safely. It teaches agility, teamwork, and strategy — and now you can play it online! 🇲🇾🇮🇩
