import { useState, useEffect, useCallback, useRef } from 'react';
import { useSocket } from './useSocket';

export function useGame() {
  const { socketRef, connected } = useSocket();
  const socket = socketRef; // keep name for on/off listeners
  // Helper that always uses the live socket via ref — never stale
  const emit = useCallback((event, data) => socketRef?.current?.emit(event, data), [socketRef]);
  const [screen, setScreen] = useState('register');
  const [playerInfo, setPlayerInfo] = useState(null);
  const [publicRooms, setPublicRooms] = useState([]);
  const [roomState, setRoomState] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [turn, setTurn] = useState(1);
  const [currentRoles, setCurrentRoles] = useState(null); // { attackers, defenders }
  const [notification, setNotification] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [turnResult, setTurnResult] = useState(null);   // shown after each turn ends
  const [matchResult, setMatchResult] = useState(null); // shown after match ends
  const [tagEffect, setTagEffect] = useState(null);
  const [scoreEvent, setScoreEvent] = useState(null);   // flash when attacker scores
  const [rolesSwapPending, setRolesSwapPending] = useState(false);

  const [grabState, setGrabState] = useState(null);

  // ── Sound effects (Web Audio API — no external deps needed) ──────────────
  const audioCtx = useRef(null);
  const playSound = useCallback((type) => {
    try {
      if (!audioCtx.current) audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtx.current;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);

      if (type === 'grab') {
        o.type = 'sawtooth'; o.frequency.setValueAtTime(220, ctx.currentTime);
        o.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.15);
        g.gain.setValueAtTime(0.18, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
        o.start(); o.stop(ctx.currentTime + 0.18);
      } else if (type === 'tag') {
        o.type = 'square'; o.frequency.setValueAtTime(440, ctx.currentTime);
        o.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.25);
        g.gain.setValueAtTime(0.25, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        o.start(); o.stop(ctx.currentTime + 0.3);
      } else if (type === 'score') {
        o.type = 'sine';
        o.frequency.setValueAtTime(523, ctx.currentTime);
        o.frequency.setValueAtTime(659, ctx.currentTime + 0.1);
        o.frequency.setValueAtTime(784, ctx.currentTime + 0.2);
        g.gain.setValueAtTime(0.2, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        o.start(); o.stop(ctx.currentTime + 0.4);
      } else if (type === 'goal') {
        o.type = 'sine';
        [523, 659, 784, 1047].forEach((freq, i) => {
          o.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.08);
        });
        g.gain.setValueAtTime(0.22, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        o.start(); o.stop(ctx.currentTime + 0.5);
      } else if (type === 'move') {
        o.type = 'sine'; o.frequency.setValueAtTime(880, ctx.currentTime);
        g.gain.setValueAtTime(0.04, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
        o.start(); o.stop(ctx.currentTime + 0.04);
      }
    } catch(e) { /* audio blocked — ignore */ }
  }, []);

  const keysHeld = useRef(new Set());
  const moveLoop = useRef(null);

  const notify = useCallback((msg, type = 'info') => {
    setNotification({ msg, type, id: Date.now() });
    setTimeout(() => setNotification(null), 3500);
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────
  const register = useCallback((name, avatar) => {
    setPlayerInfo({ name, avatar });
    emit('register', { name, avatar });
  }, [emit]);

  const createRoom = useCallback((isPublic = true) => emit('create_room', { isPublic }), [emit]);

  const joinRoom = useCallback((roomId, team, asSpectator = false) => {
    emit('join_room', { roomId, team, asSpectator });
  }, [emit]);

  const leaveRoom = useCallback(() => {
    emit('leave_room');
    setRoomState(null); setGameState(null); setTurnResult(null);
    setMatchResult(null); setChatMessages([]); setCurrentRoles(null);
    setScreen('lobby');
  }, [emit]);

  const switchTeam = useCallback((team) => emit('switch_team', { team }), [emit]);
  const startGame  = useCallback(() => emit('start_game'), [emit]);
  const playAgain  = useCallback(() => emit('play_again'), [emit]);
  const sendChat   = useCallback((message) => emit('chat_message', { message }), [emit]);
  const sendMove   = useCallback((direction) => emit('player_move', { direction }), [emit]);
  const sendGrab   = useCallback((dir) => emit('player_grab', { dir }), [emit]);

  // Keep refs so keyboard handlers always call latest version (avoids stale closure)
  const sendMoveRef = useRef(sendMove);
  const sendGrabRef = useRef(sendGrab);
  useEffect(() => { sendMoveRef.current = sendMove; }, [sendMove]);
  useEffect(() => { sendGrabRef.current = sendGrab; }, [sendGrab]);

  // ── Move loop ─────────────────────────────────────────────────────────────
  const startMoveLoop = useCallback(() => {
    if (moveLoop.current) return;
    moveLoop.current = setInterval(() => {
      const map = {
        up:    ['ArrowUp', 'w', 'W'],
        down:  ['ArrowDown', 's', 'S'],
        left:  ['ArrowLeft', 'a', 'A'],
        right: ['ArrowRight', 'd', 'D'],
      };
      Object.entries(map).forEach(([dir, keys]) => {
        if (keys.some(k => keysHeld.current.has(k))) {
          socketRef?.current?.emit('player_move', { direction: dir });
        }
      });
    }, 100);
  }, [socketRef]);

  const stopMoveLoop = useCallback(() => {
    clearInterval(moveLoop.current);
    moveLoop.current = null;
    keysHeld.current.clear();
  }, []);

  useEffect(() => {
    if (screen !== 'game') { stopMoveLoop(); return; }

    const onDown = e => {
      keysHeld.current.add(e.key);
      // Read socketRef.current directly — guaranteed fresh, no stale closure
      if (e.key === 'q' || e.key === 'Q') { e.preventDefault(); socketRef?.current?.emit('player_grab', { dir: -1 }); }
      if (e.key === 'e' || e.key === 'E') { e.preventDefault(); socketRef?.current?.emit('player_grab', { dir:  1 }); }
    };
    const onUp = e => keysHeld.current.delete(e.key);

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    startMoveLoop();
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      stopMoveLoop();
    };
  }, [screen, startMoveLoop, stopMoveLoop, socketRef]);

  // ── Socket events ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socketRef?.current) return;
    const s = socketRef.current;

    s.on('registered', () => {
      setScreen('lobby');
      emit('get_rooms');
      emit('get_leaderboard');
    });

    s.on('room_created', () => setScreen('room'));

    s.on('room_state', (state) => {
      setRoomState(state);
      setTurn(state.turn);
      if (screen !== 'game') setScreen('room');
    });

    s.on('public_rooms', rooms => setPublicRooms(rooms));
    s.on('leaderboard',  lb    => setLeaderboard(lb));

    // ── Turn started ────────────────────────────────────────────────────────
    s.on('turn_started', ({ gameState: gs, turn: t, roles, scores }) => {
      setGameState(gs);
      setTurn(t);
      setCurrentRoles(roles);
      setTurnResult(null);
      setMatchResult(null);
      setRolesSwapPending(false);
      setRoomState(prev => prev ? { ...prev, scores, turn: t } : prev);
      setScreen('game');

      const isTiebreaker = t === 3;
      notify(
        isTiebreaker
          ? '⚡ TIEBREAKER — sudden death!'
          : `Turn ${t}: ${roles.attackers.map(p => p.name).join(', ')} attacking!`,
        isTiebreaker ? 'warning' : 'info'
      );
    });

    // ── Live ticks ──────────────────────────────────────────────────────────
    s.on('game_tick', ({ timeLeft, gameState: gs }) => {
      setGameState({ ...gs, timeLeft });
    });

    s.on('game_state_update', ({ gameState: gs }) => {
      setGameState(prev => ({ ...prev, ...gs }));
    });

    // ── Attacker milestones ─────────────────────────────────────────────────
    s.on('attacker_at_goal', ({ attackerId, name, avatar }) => {
      playSound('goal');
      notify(`${avatar} ${name} reached the GOAL! Now return!`, 'info');
    });

    s.on('attacker_returning', ({ attackerId, name, avatar }) => {
      notify(`${avatar} ${name} is heading back!`, 'info');
    });

    s.on('attacker_scored', ({ attackerId, name, avatar, turnScore }) => {
      setScoreEvent({ attackerId, name, avatar, turnScore, id: Date.now() });
      setTimeout(() => setScoreEvent(null), 2000);
      playSound('score');
      notify(`🎉 ${avatar} ${name} scored! Turn total: ${turnScore}`, 'success');
    });

    // ── Tagging ─────────────────────────────────────────────────────────────
    s.on('player_tagged', ({ attackerId, defenderId, attackerName }) => {
      setTagEffect({ attackerId, defenderId, id: Date.now() });
      setTimeout(() => setTagEffect(null), 1000);
      playSound('tag');
      notify(`💥 ${attackerName} was tagged!`, 'warning');
    });

    // ── Defender grab (broadcast to ALL clients for animation) ───────────────
    s.on('defender_grab', ({ defenderId, dir }) => {
      setGrabState({ defenderId, dir, id: Date.now() });
      playSound('grab');
      setTimeout(() => setGrabState(null), 550);
    });

    // ── Turn ended ──────────────────────────────────────────────────────────
    s.on('turn_ended', ({ turn: t, safeCrossings, attackingTeam, scores }) => {
      setTurnResult({ turn: t, safeCrossings, attackingTeam, scores });
      setRoomState(prev => prev ? { ...prev, scores } : prev);
      notify(
        `Turn ${t} ended — Team ${attackingTeam} scored ${safeCrossings} crossing${safeCrossings !== 1 ? 's' : ''}!`,
        safeCrossings > 0 ? 'success' : 'error'
      );
    });

    // ── Roles swapped ───────────────────────────────────────────────────────
    s.on('roles_swapped', ({ newAttackers, newDefenders }) => {
      setCurrentRoles({ attackers: newAttackers, defenders: newDefenders });
      setRolesSwapPending(true);
      notify(`🔄 Teams swap! ${newAttackers.map(p => p.name).join(', ')} now attacking!`, 'info');
    });

    // ── Match ended ─────────────────────────────────────────────────────────
    s.on('match_ended', ({ winner, scores, leaderboard: lb }) => {
      setMatchResult({ winner, scores });
      setLeaderboard(lb);
    });

    s.on('lobby_reset', () => {
      setGameState(null); setTurnResult(null); setMatchResult(null);
      setCurrentRoles(null); setRolesSwapPending(false);
      setScreen('room');
    });

    s.on('chat_message', msg => setChatMessages(prev => [...prev.slice(-50), msg]));
    s.on('error', ({ msg }) => notify(`❌ ${msg}`, 'error'));
    s.on('info',  ({ msg }) => notify(`ℹ️ ${msg}`, 'info'));

    return () => {
      ['registered','room_created','room_state','public_rooms','leaderboard',
       'turn_started','game_tick','game_state_update','attacker_at_goal',
       'attacker_returning','attacker_scored','player_tagged','defender_grab','turn_ended',
       'roles_swapped','match_ended','lobby_reset','chat_message','error','info'
      ].forEach(e => s.off(e));
    };
  }, [socketRef, connected, notify, screen, playSound]);

  return {
    screen, setScreen,
    playerInfo,
    publicRooms,
    roomState,
    gameState,
    turn,
    currentRoles,
    notification,
    chatMessages,
    leaderboard,
    turnResult,
    matchResult,
    tagEffect,
    scoreEvent,
    grabState,
    rolesSwapPending,
    register, createRoom, joinRoom, leaveRoom,
    switchTeam, startGame, playAgain, sendChat, sendMove, sendGrab,
    keysHeld,
  };
}
