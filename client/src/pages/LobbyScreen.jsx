import { useState } from 'react';

const MAX_PER_TEAM = 3;

export default function LobbyScreen({
  playerInfo, publicRooms, leaderboard,
  onCreateRoom, onJoinRoom
}) {
  const [joinId, setJoinId] = useState('');
  const [tab, setTab] = useState('rooms');

  const handleDirectJoin = () => {
    const code = joinId.trim().toUpperCase();
    if (code.length === 6) { onJoinRoom(code, 'attacker'); setJoinId(''); }
  };

  return (
    <div className="screen lobby-screen">
      <header className="lobby-header">
        <div className="header-brand"><span>🏃</span><h2>Galah Panjang</h2></div>
        <div className="player-badge"><span>{playerInfo?.avatar}</span><span>{playerInfo?.name}</span></div>
      </header>

      <div className="lobby-content">
        <div className="action-bar">
          <button className="btn btn-primary" onClick={() => onCreateRoom(true)}>+ Create Room</button>
          <div className="join-direct">
            <input className="text-input small" placeholder="Room code…" value={joinId} maxLength={6}
              onChange={e => setJoinId(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleDirectJoin()} />
            <button className="btn btn-secondary" onClick={handleDirectJoin}>Join</button>
          </div>
        </div>

        <div className="tabs">
          <button className={`tab ${tab === 'rooms' ? 'active' : ''}`} onClick={() => setTab('rooms')}>
            🎮 Rooms ({publicRooms.length})
          </button>
          <button className={`tab ${tab === 'leaderboard' ? 'active' : ''}`} onClick={() => setTab('leaderboard')}>
            🏆 Leaderboard
          </button>
        </div>

        {tab === 'rooms' && (
          <div className="rooms-list">
            {publicRooms.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">🎯</span>
                <p>No open rooms. Be the first to create one!</p>
              </div>
            ) : publicRooms.map(room => {
              const aCount  = room.teamACcount  ?? 0;
              const bCount  = room.teamBCount   ?? 0;
              const maxPT   = room.maxPerTeam   ?? MAX_PER_TEAM;
              const aFull   = aCount >= maxPT;
              const bFull   = bCount >= maxPT;
              const bothFull = aFull && bFull;

              return (
                <div className="room-card" key={room.id}>
                  <div className="room-info">
                    <div className="room-code">#{room.id}</div>
                    <div className="room-host">Host: {room.host}</div>
                    <div className="room-meta">
                      {/* Per-team slots */}
                      <span className={`team-slot-badge ${aFull ? 'full' : ''}`}>
                        🟡 A: {aCount}/{maxPT}
                      </span>
                      <span className={`team-slot-badge ${bFull ? 'full' : ''}`}>
                        🔵 B: {bCount}/{maxPT}
                      </span>
                    </div>
                  </div>
                  <div className="room-actions">
                    <button className="btn btn-sm btn-attacker"
                      onClick={() => onJoinRoom(room.id, 'attacker')}
                      disabled={bothFull}
                      title={aFull && !bFull ? 'A full → will join B' : ''}>
                      {aFull && !bFull ? '🟡→🔵 Join' : '🟡 Team A'}
                    </button>
                    <button className="btn btn-sm btn-defender"
                      onClick={() => onJoinRoom(room.id, 'defender')}
                      disabled={bothFull}
                      title={bFull && !aFull ? 'B full → will join A' : ''}>
                      {bFull && !aFull ? '🔵→🟡 Join' : '🔵 Team B'}
                    </button>
                    <button className="btn btn-sm btn-ghost"
                      onClick={() => onJoinRoom(room.id, null, true)}>
                      👁 Watch
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'leaderboard' && (
          <div className="leaderboard">
            {leaderboard.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">🏆</span>
                <p>No games played yet. Start one!</p>
              </div>
            ) : leaderboard.map((entry, i) => (
              <div className="lb-row" key={entry.id}>
                <span className="lb-rank">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`}</span>
                <span className="lb-avatar">{entry.avatar}</span>
                <span className="lb-name">{entry.name}</span>
                <span className="lb-stats">{entry.wins}W / {entry.gamesPlayed}G</span>
                <div className="lb-bar">
                  <div className="lb-bar-fill" style={{ width: `${(entry.wins / Math.max(entry.gamesPlayed, 1)) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
