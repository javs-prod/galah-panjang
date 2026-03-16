import { useSocket } from './hooks/useSocket';
import { useGame } from './hooks/useGame';
import RegisterScreen from './pages/RegisterScreen';
import LobbyScreen from './pages/LobbyScreen';
import RoomScreen from './pages/RoomScreen';
import GameScreen from './pages/GameScreen';
import './App.css';

function Notification({ notification }) {
  if (!notification) return null;
  return (
    <div className={`notification notification-${notification.type}`} key={notification.id}>
      {notification.msg}
    </div>
  );
}

function ConnectionBanner({ connected }) {
  if (connected) return null;
  return <div className="connection-banner">⚠️ Connecting to server…</div>;
}

export default function App() {
  const { socketRef, connected } = useSocket();
  const {
    screen, playerInfo, publicRooms, roomState,
    gameState, turn, currentRoles,
    notification, chatMessages, leaderboard,
    turnResult, matchResult, tagEffect, scoreEvent, grabState,
    register, createRoom, joinRoom, leaveRoom,
    switchTeam, startGame, playAgain, sendChat, sendMove, sendGrab,
  } = useGame();

  const socketId = socketRef?.current?.id;

  return (
    <div className="app">
      <ConnectionBanner connected={connected} />
      <Notification notification={notification} />

      {screen === 'register' && (
        <RegisterScreen onRegister={register} />
      )}

      {screen === 'lobby' && (
        <LobbyScreen
          playerInfo={playerInfo}
          publicRooms={publicRooms}
          leaderboard={leaderboard}
          onCreateRoom={createRoom}
          onJoinRoom={joinRoom}
          setScreen={() => {}}
        />
      )}

      {screen === 'room' && (
        <RoomScreen
          roomState={roomState}
          socketId={socketId}
          onLeave={leaveRoom}
          onSwitch={switchTeam}
          onStart={startGame}
          onSendChat={sendChat}
          chatMessages={chatMessages}
        />
      )}

      {screen === 'game' && (
        <GameScreen
          gameState={gameState}
          roomState={roomState}
          socketId={socketId}
          turn={turn}
          currentRoles={currentRoles}
          turnResult={turnResult}
          matchResult={matchResult}
          tagEffect={tagEffect}
          scoreEvent={scoreEvent}
          grabState={grabState}
          onMove={sendMove}
          onGrab={sendGrab}
          onLeave={leaveRoom}
          onPlayAgain={playAgain}
          chatMessages={chatMessages}
          onSendChat={sendChat}
        />
      )}
    </div>
  );
}
