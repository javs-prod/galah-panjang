import { useState } from 'react';

const AVATARS = ['⚡','🐆','🦅','🔥','💥','🌪️','🦁','🐉','⚔️','🛡️','🎯','🏃'];

export default function RegisterScreen({ onRegister }) {
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('⚡');

  const handleSubmit = () => {
    if (name.trim().length < 2) return;
    onRegister(name.trim(), avatar);
  };

  return (
    <div className="screen register-screen">
      <div className="register-card">
        <div className="game-logo">
          <span className="logo-icon">🏃</span>
          <h1>Galah Panjang</h1>
          <p className="tagline">Malaysian Traditional Tag Game · Online Multiplayer</p>
        </div>

        <div className="field-group">
          <label>Your Name</label>
          <input
            className="text-input"
            type="text"
            maxLength={16}
            placeholder="Enter your name..."
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            autoFocus
          />
        </div>

        <div className="field-group">
          <label>Pick Your Avatar</label>
          <div className="avatar-grid">
            {AVATARS.map(a => (
              <button
                key={a}
                className={`avatar-btn ${avatar === a ? 'selected' : ''}`}
                onClick={() => setAvatar(a)}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        <div className="preview-box">
          <span className="preview-avatar">{avatar}</span>
          <span className="preview-name">{name || 'Your Name'}</span>
        </div>

        <button
          className="btn btn-primary btn-large"
          onClick={handleSubmit}
          disabled={name.trim().length < 2}
        >
          Enter the Game →
        </button>
      </div>
    </div>
  );
}
