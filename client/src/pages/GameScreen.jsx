import { useRef, useEffect, useCallback } from 'react';

// ─── Server coordinate space (must match server.js) ──────────────────────────
// GRID_COLS = 20  (x: 0=bottom/start, 20=top/goal)
// GRID_ROWS = 30  (y: 0=left edge, 30=right edge)
// Court is portrait: attackers run UPWARD (col increases toward goal at top)
//
// Canvas maps:
//   server col  →  canvas Y  (flipped: col=0 at bottom, col=GRID_COLS at top)
//   server row  →  canvas X  (row=0 at left, row=GRID_ROWS at right)
//
// Defender layout:
//   D0 (horizontal) — fixed col=GRID_COLS/3  (top third) — slides left/right (row changes)
//   D1 (vertical)   — fixed row=GRID_ROWS/2  (centre)    — slides up/down   (col changes) + grab
//   D2 (horizontal) — fixed col=GRID_COLS*2/3(bot third)  — slides left/right (row changes)

const SRV_COLS  = 20;   // server GRID_COLS
const SRV_ROWS  = 30;   // server GRID_ROWS

// Convert server (col, row) → canvas (x, y)
// col: 0=start(bottom) → SRV_COLS=goal(top)   maps to canvas Y inverted
// row: 0=left          → SRV_ROWS=right        maps to canvas X
function srv2canvas(col, row, W, H) {
  const x = (row  / SRV_ROWS) * W;
  const y = H - (col / SRV_COLS) * H;   // flip Y so goal is at top
  return { x, y };
}

// ─── Human figure ─────────────────────────────────────────────────────────────
function drawHuman(ctx, cx, cy, size, opts = {}) {
  const {
    shirtColor = '#3b82f6',
    skinColor  = '#fcd7b0',
    pantsColor = '#0f172a',
    shoeColor  = '#111827',
    avatar     = '😀',
    isMe       = false,
    facing     = 0,      // 1=right, -1=left, 0=up
    phase      = 'going',
    grabbing   = false,
    grabDir    = 0,
    tagFlash   = false,
    scoreFlash = false,
    alpha      = 1,
  } = opts;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  const s = size;

  // Shadow
  ctx.save();
  ctx.scale(1, 0.25);
  ctx.beginPath();
  ctx.ellipse(0, s * 1.5, s * 0.5, s * 0.2, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fill();
  ctx.restore();

  // Glow ring
  if (isMe || tagFlash || scoreFlash) {
    ctx.beginPath();
    ctx.ellipse(0, s * 0.1, s * 1.0, s * 1.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = tagFlash   ? 'rgba(239,68,68,0.3)'
                  : scoreFlash ? 'rgba(34,197,94,0.3)'
                               : 'rgba(250,204,21,0.18)';
    ctx.fill();
  }

  // Legs
  ctx.lineCap = 'round';
  ctx.lineWidth = s * 0.22;
  ctx.strokeStyle = pantsColor;
  ctx.beginPath(); ctx.moveTo(-s*0.2, s*0.55); ctx.lineTo(-s*0.25, s*1.35); ctx.stroke();
  ctx.beginPath(); ctx.moveTo( s*0.2, s*0.55); ctx.lineTo( s*0.25, s*1.35); ctx.stroke();

  // Shoes
  ctx.fillStyle = shoeColor;
  ctx.beginPath(); ctx.ellipse(-s*0.28, s*1.42, s*0.18, s*0.09, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse( s*0.28, s*1.42, s*0.18, s*0.09, 0, 0, Math.PI*2); ctx.fill();

  // Torso
  ctx.beginPath();
  ctx.roundRect(-s*0.36, -s*0.1, s*0.72, s*0.68, s*0.1);
  ctx.fillStyle = shirtColor;
  ctx.fill();

  // Collar V
  ctx.beginPath();
  ctx.moveTo(-s*0.13, -s*0.1); ctx.lineTo(0, s*0.08); ctx.lineTo(s*0.13, -s*0.1);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = s*0.06; ctx.stroke();

  // Avatar on shirt chest
  ctx.font = `${s * 0.36}px serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(avatar, 0, s * 0.24);

  // Arms
  ctx.lineWidth = s * 0.2;
  ctx.strokeStyle = skinColor;
  ctx.lineCap = 'round';
  if (grabbing) {
    const armY = s * 0.05;
    if (grabDir <= 0) {
      // Left arm extends
      ctx.beginPath(); ctx.moveTo(-s*0.36, armY); ctx.lineTo(-s*1.2, armY); ctx.stroke();
      ctx.beginPath(); ctx.arc(-s*1.2, armY, s*0.18, 0, Math.PI*2);
      ctx.fillStyle = '#ef4444'; ctx.fill();
      ctx.strokeStyle = '#fca5a5'; ctx.lineWidth = s*0.07; ctx.stroke();
      // Right arm hangs normally
      ctx.strokeStyle = skinColor; ctx.lineWidth = s*0.2;
      ctx.beginPath(); ctx.moveTo(s*0.36, armY); ctx.lineTo(s*0.5, s*0.42); ctx.stroke();
    } else {
      // Left arm hangs normally
      ctx.beginPath(); ctx.moveTo(-s*0.36, armY); ctx.lineTo(-s*0.5, s*0.42); ctx.stroke();
      // Right arm extends
      ctx.strokeStyle = skinColor; ctx.lineWidth = s*0.2;
      ctx.beginPath(); ctx.moveTo(s*0.36, armY); ctx.lineTo(s*1.2, armY); ctx.stroke();
      ctx.beginPath(); ctx.arc(s*1.2, armY, s*0.18, 0, Math.PI*2);
      ctx.fillStyle = '#ef4444'; ctx.fill();
      ctx.strokeStyle = '#fca5a5'; ctx.lineWidth = s*0.07; ctx.stroke();
    }
  } else {
    ctx.beginPath(); ctx.moveTo(-s*0.36, s*0.05); ctx.lineTo(-s*0.5, s*0.42); ctx.stroke();
    ctx.beginPath(); ctx.moveTo( s*0.36, s*0.05); ctx.lineTo( s*0.5, s*0.42); ctx.stroke();
  }

  // Neck
  ctx.lineWidth = s * 0.2; ctx.strokeStyle = skinColor; ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.moveTo(0, -s*0.1); ctx.lineTo(0, -s*0.3); ctx.stroke();

  // Head
  ctx.beginPath();
  ctx.ellipse(0, -s*0.52, s*0.3, s*0.33, 0, 0, Math.PI*2);
  ctx.fillStyle = skinColor; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = s*0.04; ctx.stroke();

  // Hair
  ctx.beginPath();
  ctx.ellipse(0, -s*0.74, s*0.31, s*0.17, 0, Math.PI, Math.PI*2);
  ctx.fillStyle = '#1e293b'; ctx.fill();

  // Eyes — face direction
  const eyeX = facing !== 0 ? facing * s * 0.09 : 0;
  ctx.fillStyle = '#1e293b';
  ctx.beginPath(); ctx.arc(eyeX - s*0.08, -s*0.52, s*0.055, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(eyeX + s*0.08, -s*0.52, s*0.055, 0, Math.PI*2); ctx.fill();

  // Mouth
  ctx.beginPath(); ctx.arc(0, -s*0.42, s*0.09, 0.15, Math.PI-0.15);
  ctx.strokeStyle = '#c0392b'; ctx.lineWidth = s*0.05; ctx.stroke();

  // Crown for "me"
  if (isMe) {
    ctx.font = `${s*0.42}px serif`; ctx.textAlign = 'center';
    ctx.fillText('👑', 0, -s*1.05);
  }

  // Direction arrow for attackers
  if (phase === 'going') {
    ctx.font = `${s*0.34}px serif`; ctx.textAlign = 'center';
    ctx.fillText('↑', s*0.85, -s*0.1);
  } else if (phase === 'returning') {
    ctx.font = `${s*0.34}px serif`; ctx.textAlign = 'center';
    ctx.fillText('↓', s*0.85, -s*0.1);
  } else if (phase === 'atGoal') {
    ctx.font = `${s*0.34}px serif`; ctx.textAlign = 'center';
    ctx.fillText('🎯', 0, -s*1.05);
  }

  ctx.restore();
}

// ─── Court drawing ────────────────────────────────────────────────────────────
function drawCourt(ctx, W, H) {
  // 2 columns (left/right) × 3 rows (top/mid/bot in screen = goal side / mid / start side)
  const cols = 2, rows = 3;
  const cw = W / cols, ch = H / rows;

  const tileColors = [
    ['#163a2a', '#1a4431'],   // top row (goal side)
    ['#143325', '#18402c'],   // middle
    ['#122e21', '#163629'],   // bottom row (start side)
  ];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = tileColors[r][c];
      ctx.fillRect(c * cw, r * ch, cw + 1, ch + 1);
      // Grass stripe texture
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 1;
      for (let g = 0; g < 5; g++) {
        const gy = r * ch + (ch / 5) * g + ch / 10;
        ctx.beginPath(); ctx.moveTo(c*cw+4, gy); ctx.lineTo(c*cw+cw-4, gy); ctx.stroke();
      }
      // Depth gradient
      const grad = ctx.createLinearGradient(0, r*ch, 0, r*ch+ch);
      grad.addColorStop(0, 'rgba(255,255,255,0.03)');
      grad.addColorStop(1, 'rgba(0,0,0,0.08)');
      ctx.fillStyle = grad; ctx.fillRect(c*cw, r*ch, cw, ch);
    }
  }

  // Court outline
  ctx.strokeStyle = 'rgba(250,204,21,0.7)'; ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, W-4, H-4);

  // ── GOAL zone at TOP ──
  ctx.fillStyle = 'rgba(245,158,11,0.1)';
  ctx.fillRect(0, 0, W, H * 0.08);
  ctx.strokeStyle = 'rgba(245,158,11,0.8)'; ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, W-4, H * 0.08 - 2);
  ctx.fillStyle = 'rgba(245,158,11,0.9)';
  ctx.font = `bold ${Math.max(11, W * 0.04)}px "JetBrains Mono", monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('⭐ GOAL ⭐', W / 2, H * 0.042);

  // ── START zone at BOTTOM ──
  ctx.fillStyle = 'rgba(34,197,94,0.1)';
  ctx.fillRect(0, H * 0.92, W, H * 0.08);
  ctx.strokeStyle = 'rgba(34,197,94,0.8)'; ctx.lineWidth = 2;
  ctx.strokeRect(2, H * 0.92, W-4, H * 0.08 - 2);
  ctx.fillStyle = 'rgba(34,197,94,0.9)';
  ctx.font = `bold ${Math.max(11, W * 0.04)}px "JetBrains Mono", monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('🏁 START / RETURN', W / 2, H * 0.958);

  // ── Horizontal galah lines ──
  // D0: 1/3 from top on screen = col 2/3 of SRV_COLS → y = H*(1 - 2/3) = H/3
  drawGalahH(ctx, W, H * (1/3), '#facc15', 'D0 ← →');
  // D2: 2/3 from top on screen = col 1/3 of SRV_COLS → y = H*(1 - 1/3) = H*2/3
  drawGalahH(ctx, W, H * (2/3), '#facc15', 'D2 ← →');

  // ── Vertical galah line (D1 centre) ──
  drawGalahV(ctx, W / 2, H, '#f97316', 'D1 ↑ ↓');
}

function drawGalahH(ctx, W, y, color, label) {
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0,   color+'00');
  grad.addColorStop(0.15, color+'cc');
  grad.addColorStop(0.85, color+'cc');
  grad.addColorStop(1,   color+'00');
  ctx.shadowColor = color; ctx.shadowBlur = 8;
  ctx.strokeStyle = grad; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = color+'bb';
  ctx.font = `bold ${Math.max(9, W*0.028)}px monospace`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText(label, 6, y - 3);
}

function drawGalahV(ctx, x, H, color, label) {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0,   color+'00');
  grad.addColorStop(0.1, color+'cc');
  grad.addColorStop(0.9, color+'cc');
  grad.addColorStop(1,   color+'00');
  ctx.shadowColor = color; ctx.shadowBlur = 10;
  ctx.strokeStyle = grad; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = color+'bb';
  ctx.font = `bold ${Math.max(9, H*0.022)}px monospace`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(label, x + 5, H * 0.08);
}

// ─── Canvas component ─────────────────────────────────────────────────────────
function GameCanvas({ gameState, socketId, tagEffect, scoreEvent, grabState }) {
  const canvasRef    = useRef(null);
  const containerRef = useRef(null);
  const animRef      = useRef(null);
  const frameRef     = useRef(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !gameState) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    frameRef.current = (frameRef.current + 1) % 120;
    const tick = frameRef.current;

    ctx.clearRect(0, 0, W, H);

    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#091520'); bg.addColorStop(1, '#060e18');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    drawCourt(ctx, W, H);

    const figSize = Math.min(W, H) * 0.072;

    // ── Draw defenders ──
    (gameState.defenders || []).forEach(def => {
      const isMe = def.id === socketId;
      // Map def position to canvas
      // D0/D2 horizontal: col is fixed (maps to Y), row slides (maps to X)
      // D1 vertical:      row is fixed centre (maps to X=W/2), col slides (maps to Y)
      const pos = srv2canvas(def.col, def.row, W, H);

      // Patrol range indicator
      ctx.save();
      ctx.strokeStyle = isMe ? 'rgba(249,115,22,0.55)' : 'rgba(249,115,22,0.18)';
      ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
      if (def.direction === 'horizontal') {
        // slides horizontally → draw horizontal dashed line at its Y
        ctx.beginPath(); ctx.moveTo(W*0.02, pos.y); ctx.lineTo(W*0.98, pos.y); ctx.stroke();
      } else {
        // slides vertically → draw vertical dashed line at its X
        ctx.beginPath(); ctx.moveTo(pos.x, H*0.02); ctx.lineTo(pos.x, H*0.98); ctx.stroke();
      }
      ctx.setLineDash([]); ctx.restore();

      const isGrabbing = grabState?.defenderId === def.id;
      const bob = isMe ? Math.sin(tick * 0.12) * 2.5 : 0;
      // Shift horizontal defenders UP so the figure body is centred ON the galah line.
      // Figure centre = (head_top + feet) / 2 = (-s*0.85 + s*1.42)/2 = s*0.285
      // where s = figSize * 1.12. So offset = -(figSize * 1.12 * 0.285)
      const defSize = figSize * 1.12;
      const yOffset = def.direction === 'horizontal' ? -(defSize * 0.285) : 0;

      drawHuman(ctx, pos.x, pos.y + bob + yOffset, defSize, {
        shirtColor: isMe ? '#dc2626' : '#991b1b',
        skinColor:  '#f5c5a3',
        pantsColor: '#1c1917',
        shoeColor:  '#0c0a09',
        avatar: def.avatar,
        isMe,
        facing: def.direction === 'horizontal' ? 1 : 0,
        phase: 'standing',
        grabbing: isGrabbing,
        grabDir: grabState?.dir ?? 0,
      });

      ctx.fillStyle = isMe ? '#fed7aa' : '#fdba74';
      ctx.font = `bold ${Math.max(9, figSize * 0.52)}px monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(def.name.slice(0, 8), pos.x, pos.y + yOffset - figSize * 1.1);
    });

    // ── Draw attackers ──
    const sorted = [...(gameState.attackers || [])].sort((a, b) => {
      const o = { going:2, atGoal:2, returning:2, tagged:0, safe:1 };
      return (o[a.phase]??1) - (o[b.phase]??1);
    });

    sorted.forEach(att => {
      const isMe = att.id === socketId;
      const pos  = srv2canvas(att.col, att.row, W, H);

      if (att.phase === 'tagged') {
        ctx.save(); ctx.globalAlpha = 0.32;
        ctx.font = `${figSize*1.5}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('💀', pos.x, pos.y);
        ctx.restore(); return;
      }

      const isTagFlash   = tagEffect?.attackerId   === att.id;
      const isScoreFlash = scoreEvent?.attackerId  === att.id;
      const bob = isMe
        ? Math.sin(tick * 0.15) * 3
        : Math.sin(tick * 0.1 + att.row * 0.5) * 1.8;

      // Shirt colour: orange going up, blue returning down, green safe
      const shirtColor = att.phase === 'safe'      ? '#16a34a'
                       : att.phase === 'returning' ? (isMe ? '#2563eb' : '#1d4ed8')
                                                   : (isMe ? '#d97706' : '#92400e');

      drawHuman(ctx, pos.x, pos.y + bob, figSize, {
        shirtColor,
        skinColor:  '#fcd7b0',
        pantsColor: '#0f172a',
        shoeColor:  '#111827',
        avatar: att.avatar,
        isMe,
        facing: att.phase === 'returning' ? -1 : 1,
        phase:  att.phase,
        tagFlash:   isTagFlash,
        scoreFlash: isScoreFlash,
        alpha: att.phase === 'safe' ? 0.65 : 1,
      });

      ctx.fillStyle = isMe ? '#fef3c7' : '#fde68a';
      ctx.font = `bold ${Math.max(9, figSize * 0.52)}px monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(att.name.slice(0, 8), pos.x, pos.y - figSize * 1.1);

      if (att.phase === 'safe') {
        ctx.font = `${figSize*0.85}px serif`; ctx.textAlign = 'center';
        ctx.fillText('✅', pos.x + figSize*0.95, pos.y - figSize*0.7);
      }
      if (att.phase === 'atGoal') {
        ctx.font = `${figSize*0.85}px serif`; ctx.textAlign = 'center';
        ctx.fillText('🔄', pos.x + figSize*0.95, pos.y - figSize*0.7);
      }
    });

    animRef.current = requestAnimationFrame(draw);
  }, [gameState, socketId, tagEffect, scoreEvent, grabState]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  useEffect(() => {
    const resize = () => {
      if (!containerRef.current || !canvasRef.current) return;
      const { width, height } = containerRef.current.getBoundingClientRect();
      // Portrait aspect: COLS:ROWS = 2:3
      const aspect = 2 / 3;
      let w = Math.min(width, height * aspect);
      let h = w / aspect;
      if (h > height) { h = height; w = h * aspect; }
      canvasRef.current.width  = Math.floor(w);
      canvasRef.current.height = Math.floor(h);
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  return (
    <div ref={containerRef} className="canvas-container" style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <canvas ref={canvasRef} className="game-canvas" />
    </div>
  );
}

// ─── D-Pad ─────────────────────────────────────────────────────────────────────
function DPad({ onMove, onGrab, canGrab }) {
  const fire = dir => e => { e.preventDefault(); onMove(dir); };
  return (
    <div className="controls-row">
      {/* Left: directional pad */}
      <div className="dpad">
        <div className="dpad-row">
          <button className="dpad-btn" onTouchStart={fire('up')} onMouseDown={fire('up')}>▲</button>
        </div>
        <div className="dpad-row">
          <button className="dpad-btn" onTouchStart={fire('left')} onMouseDown={fire('left')}>◄</button>
          <div className="dpad-center">●</div>
          <button className="dpad-btn" onTouchStart={fire('right')} onMouseDown={fire('right')}>►</button>
        </div>
        <div className="dpad-row">
          <button className="dpad-btn" onTouchStart={fire('down')} onMouseDown={fire('down')}>▼</button>
        </div>
      </div>

      {/* Right: grab buttons (only for defenders) */}
      {canGrab && (
        <div className="grab-panel">
          <div className="grab-label">GRAB</div>
          <button className="dpad-btn grab-btn grab-btn-large"
            onTouchStart={e => { e.preventDefault(); onGrab(-1); }}
            onMouseDown={() => onGrab(-1)}>
            <span>✋</span><span className="grab-dir">Q ←</span>
          </button>
          <button className="dpad-btn grab-btn grab-btn-large"
            onTouchStart={e => { e.preventDefault(); onGrab(1); }}
            onMouseDown={() => onGrab(1)}>
            <span>✋</span><span className="grab-dir">→ E</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function GameScreen({
  gameState, roomState, socketId, turn, currentRoles,
  turnResult, matchResult, tagEffect, scoreEvent, grabState,
  onMove, onGrab, onLeave, onPlayAgain,
  chatMessages,
}) {
  // grabState now comes from server via useGame — all clients see it in sync

  const myRole = currentRoles?.attackers?.find(p => p.id === socketId) ? 'attacker'
    : currentRoles?.defenders?.find(p => p.id === socketId) ? 'defender' : 'spectator';

  const myOriginalTeam = roomState?.originalTeams?.A?.find(p => p.id === socketId) ? 'A'
    : roomState?.originalTeams?.B?.find(p => p.id === socketId) ? 'B' : null;

  const isHost = roomState?.host === socketId;
  const isTiebreaker = turn === 3;
  const myAttackerState = gameState?.attackers?.find(a => a.id === socketId);
  const myDefender = gameState?.defenders?.find(d => d.id === socketId);
  const isDefender = myRole === 'defender';

  return (
    <div className="screen game-screen">

      {/* HUD */}
      <div className="game-hud">
        <div className="hud-top-row">
          <button className="btn btn-ghost btn-sm" onClick={onLeave}>← Leave</button>
          <div className="hud-scores" style={{flex:1}}>
            <div className={`score-block team-a ${myOriginalTeam==='A'?'my-team':''}`}>
              <span className="score-label">🟡 A</span>
              <span className="score-num">{roomState?.scores?.A ?? 0}</span>
            </div>
            <div className="hud-center">
              <div className="turn-label">{isTiebreaker ? '⚡ TIEBREAKER' : `Turn ${turn}/2`}</div>
              <div className="timer-display">
                {gameState?.timeLeft !== undefined && (
                  <span className={gameState.timeLeft <= 15 ? 'timer-urgent' : ''}>
                    ⏱ {gameState.timeLeft}s
                  </span>
                )}
              </div>
              <div className="turn-score-live">✅ {gameState?.turnScore ?? 0} crossed</div>
            </div>
            <div className={`score-block team-b ${myOriginalTeam==='B'?'my-team':''}`}>
              <span className="score-num">{roomState?.scores?.B ?? 0}</span>
              <span className="score-label">B 🔵</span>
            </div>
          </div>
        </div>
        <div className="hud-role-row">
          <span className={`role-badge role-${myRole}`}>
            {myRole==='attacker' ? '⚡ Attacker' : myRole==='defender' ? '🛡️ Defender' : '👁 Spectator'}
          </span>
          {isDefender && (
            <span className="role-badge" style={{background:'#7c3aed22',color:'#a78bfa',border:'1px solid #7c3aed'}}>
              ✋ Q grab left · E grab right
            </span>
          )}
          {myAttackerState && myRole==='attacker' && (
            <span className={`phase-badge phase-${myAttackerState.phase}`}>
              {myAttackerState.phase==='going'     ? '↑ Head to GOAL (top)'
              :myAttackerState.phase==='atGoal'    ? '🎯 At GOAL — Return!'
              :myAttackerState.phase==='returning' ? '↓ Return to START (bottom)'
              :myAttackerState.phase==='safe'      ? '✅ Safe! Point scored!'
              :'💀 Tagged'}
            </span>
          )}
        </div>
      </div>

      {/* Court */}
      <GameCanvas gameState={gameState} socketId={socketId} tagEffect={tagEffect} scoreEvent={scoreEvent} grabState={grabState} />

      {/* Status */}
      {gameState && (
        <div className="status-bar">
          <span>⚡ {gameState.attackers?.filter(a=>a.phase!=='tagged').length??0} alive</span>
          <span>✅ {gameState.attackers?.filter(a=>a.phase==='safe').length??0} safe</span>
          <span>🎯 {gameState.attackers?.filter(a=>a.phase==='atGoal').length??0} at goal</span>
          <span>↩ {gameState.attackers?.filter(a=>a.phase==='returning').length??0} returning</span>
        </div>
      )}

      {myRole !== 'spectator' && <DPad onMove={onMove} onGrab={onGrab} canGrab={isDefender} />}
      {myRole !== 'spectator' && (
        <div className="keyboard-hint">
          ↑↓←→ / WASD to move{isDefender ? ' · Q grab ← · E grab →' : ' · Goal is at the TOP'}
        </div>
      )}

      {scoreEvent && (
        <div className="score-flash">
          <span>{scoreEvent.avatar}</span>
          <span className="score-flash-name">{scoreEvent.name}</span>
          <span className="score-flash-points">+1 🎉</span>
        </div>
      )}

      {turnResult && !matchResult && (
        <div className="overlay turn-overlay">
          <div className="overlay-card">
            <div className="overlay-emoji">{turnResult.safeCrossings > 0 ? '🎉' : '🛡️'}</div>
            <h2>Turn {turnResult.turn} Over!</h2>
            <p className="overlay-sub">
              Team {turnResult.attackingTeam} scored <strong>{turnResult.safeCrossings}</strong> crossing{turnResult.safeCrossings !== 1 ? 's' : ''}
            </p>
            <div className="overlay-scores">
              <div className="ov-score team-a">🟡 A: {turnResult.scores.A}</div>
              <div className="ov-score team-b">B: {turnResult.scores.B} 🔵</div>
            </div>
            {turn < 2 && <p className="next-hint">🔄 Teams swap roles for Turn 2…</p>}
            {turn === 2 && turnResult.scores.A === turnResult.scores.B && (
              <p className="next-hint">⚡ Tied! Tiebreaker next…</p>
            )}
          </div>
        </div>
      )}

      {matchResult && (
        <div className="overlay match-over-overlay">
          <div className="overlay-card big">
            <div className="overlay-emoji big">
              {matchResult.winner==='draw'?'🤝':matchResult.winner==='A'?'🟡':'🔵'}
            </div>
            <h1>{matchResult.winner==='draw' ? "It's a Draw!" : `Team ${matchResult.winner} Wins!`}</h1>
            <p className="overlay-sub">Final Scores</p>
            <div className="final-scores">
              <div className={`final-score-block ${myOriginalTeam==='A'?'my-team':''}`}>
                <span>🟡 Team A</span><span className="final-num">{matchResult.scores.A}</span><span className="final-label">crossings</span>
              </div>
              <div className={`final-score-block ${myOriginalTeam==='B'?'my-team':''}`}>
                <span>🔵 Team B</span><span className="final-num">{matchResult.scores.B}</span><span className="final-label">crossings</span>
              </div>
            </div>
            <div className="overlay-actions">
              {isHost && <button className="btn btn-primary" onClick={onPlayAgain}>🔄 Play Again</button>}
              <button className="btn btn-ghost" onClick={onLeave}>← Back to Lobby</button>
            </div>
          </div>
        </div>
      )}

      <div className="mini-chat">
        {chatMessages.slice(-5).map(m => (
          <div key={m.id} className="mini-chat-msg">{m.avatar} {m.sender}: {m.message}</div>
        ))}
      </div>

    </div>
  );
}
