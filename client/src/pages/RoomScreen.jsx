import { useState } from 'react';

const PLAYERS_PER_TEAM = 3;

export default function RoomScreen({
  roomState, socketId,
  onLeave, onSwitch, onStart, onSendChat, chatMessages
}) {
  const [msg, setMsg] = useState('');
  if (!roomState) return <div className="screen"><div className="loading">Loading room…</div></div>;

  const isHost = roomState.host === socketId;

  const inTeamA = roomState.originalTeams?.A?.find(p => p.id === socketId);
  const inTeamB = roomState.originalTeams?.B?.find(p => p.id === socketId);
  const isSpectator = roomState.spectators?.find(p => p.id === socketId);
  const myTeam = inTeamA ? 'A' : inTeamB ? 'B' : isSpectator ? 'spectator' : null;

  const canStart = (roomState.originalTeams?.A?.length >= 1) && (roomState.originalTeams?.B?.length >= 1);

  const sendChat = () => { if (msg.trim()) { onSendChat(msg.trim()); setMsg(''); } };

  return (
    <div className="screen room-screen">
      <header className="room-header">
        <button className="btn btn-ghost btn-sm" onClick={onLeave}>← Leave</button>
        <div className="room-code-display">
          Room: <strong>#{roomState.id}</strong>
          <span className="copy-hint">Share this code to invite friends!</span>
        </div>
        <div className="round-display">Best of 2 turns</div>
      </header>

      <div className="room-body">

        {/* How turns work */}
        <div className="turns-explainer">
          <span className="turns-icon">🔄</span>
          <div>
            <strong>Turn 1:</strong> Team A attacks · Team B defends
            &nbsp;&nbsp;→&nbsp;&nbsp;
            <strong>Turn 2:</strong> Team B attacks · Team A defends
          </div>
        </div>

        <div className="teams-grid">
          {/* Team A */}
          <div className="team-panel team-a-panel">
            <div className="team-header">
              <span className="team-icon">🟡</span>
              <span className="team-name">Team A</span>
              <span className="team-count">{roomState.originalTeams?.A?.length ?? 0}/{PLAYERS_PER_TEAM}</span>
            </div>
            <div className="team-role-tag attacker-role">Starts as ⚡ Attackers</div>
            <div className="player-slots">
              {Array.from({ length: PLAYERS_PER_TEAM }).map((_, i) => {
                const p = roomState.originalTeams?.A?.[i];
                return (
                  <div key={i} className={`player-slot ${p ? 'filled' : 'empty'} ${p?.id === socketId ? 'me' : ''}`}>
                    {p ? (
                      <><span className="slot-avatar">{p.avatar}</span>
                        <span className="slot-name">{p.name}{p.id === socketId ? ' (You)' : ''}</span></>
                    ) : <span className="slot-empty">Empty slot</span>}
                  </div>
                );
              })}
            </div>
            {myTeam !== 'A' && (
              <button className="btn btn-attacker" onClick={() => onSwitch('A')}
                disabled={roomState.originalTeams?.A?.length >= PLAYERS_PER_TEAM}>
                Join Team A
              </button>
            )}
          </div>

          <div className="vs-divider"><span>VS</span></div>

          {/* Team B */}
          <div className="team-panel team-b-panel">
            <div className="team-header">
              <span className="team-icon">🔵</span>
              <span className="team-name">Team B</span>
              <span className="team-count">{roomState.originalTeams?.B?.length ?? 0}/{PLAYERS_PER_TEAM}</span>
            </div>
            <div className="team-role-tag defender-role">Starts as 🛡️ Defenders</div>
            <div className="player-slots">
              {Array.from({ length: PLAYERS_PER_TEAM }).map((_, i) => {
                const p = roomState.originalTeams?.B?.[i];
                return (
                  <div key={i} className={`player-slot ${p ? 'filled' : 'empty'} ${p?.id === socketId ? 'me' : ''}`}>
                    {p ? (
                      <><span className="slot-avatar">{p.avatar}</span>
                        <span className="slot-name">{p.name}{p.id === socketId ? ' (You)' : ''}</span></>
                    ) : <span className="slot-empty">Empty slot</span>}
                  </div>
                );
              })}
            </div>
            {myTeam !== 'B' && (
              <button className="btn btn-defender" onClick={() => onSwitch('B')}
                disabled={roomState.originalTeams?.B?.length >= PLAYERS_PER_TEAM}>
                Join Team B
              </button>
            )}
          </div>
        </div>

        {roomState.spectators?.length > 0 && (
          <div className="spectator-bar">
            👁 Watching: {roomState.spectators.map(p => `${p.avatar || '👤'} ${p.name}`).join(', ')}
          </div>
        )}
        {myTeam && myTeam !== 'spectator' && (
          <button className="btn btn-ghost btn-sm switch-spectate" onClick={() => onSwitch('spectator')}>
            Switch to Spectator
          </button>
        )}

        {/* Rules */}
        <div className="rules-box">
          <h4>📜 Authentic Galah Panjang Rules</h4>
          <div className="rules-cols">
            <div>
              <strong>⚡ Attackers</strong>
              <ul>
                <li>Move right to reach the GOAL (col 8)</li>
                <li>Then return all the way back to START (col 0)</li>
                <li>Each attacker who completes the trip = <strong>+1 point</strong></li>
                <li>Avoid the galah-line guards!</li>
              </ul>
            </div>
            <div>
              <strong>🛡️ Defenders</strong>
              <ul>
                <li>H-Guards: slide UP/DOWN on their galah column</li>
                <li>V-Guard: slide LEFT/RIGHT on the centre row</li>
                <li>Tag attackers to eliminate them</li>
                <li>Prevent crossings before time runs out</li>
              </ul>
            </div>
          </div>
          <p className="controls-hint">Desktop: Arrow keys / WASD &nbsp;·&nbsp; Mobile: D-pad on screen</p>
        </div>

        {/* Chat */}
        <div className="chat-box">
          <div className="chat-messages">
            {chatMessages.slice(-20).map(m => (
              <div key={m.id} className={`chat-msg team-${m.team}`}>
                <span className="chat-avatar">{m.avatar}</span>
                <span className="chat-sender">{m.sender}:</span>
                <span className="chat-text">{m.message}</span>
              </div>
            ))}
          </div>
          <div className="chat-input-row">
            <input className="text-input small" placeholder="Say something..." value={msg}
              onChange={e => setMsg(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChat()} maxLength={200} />
            <button className="btn btn-secondary btn-sm" onClick={sendChat}>Send</button>
          </div>
        </div>

        {isHost ? (
          <button className="btn btn-primary btn-large start-btn" onClick={onStart} disabled={!canStart}>
            {canStart ? '🎮 Start Match' : 'Need at least 1 player per team'}
          </button>
        ) : (
          <div className="waiting-host">⏳ Waiting for host to start the match…</div>
        )}
      </div>
    </div>
  );
}
