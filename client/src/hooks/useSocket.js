import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

// Auto-detect server URL:
//   • If REACT_APP_SERVER_URL env var is set (production deploy), use it.
//   • Otherwise derive from the browser's own hostname so that
//     mobile phones on the same WiFi (e.g. http://192.168.1.5:3000)
//     automatically connect to http://192.168.1.5:3001 — not localhost.
function getServerUrl() {
  if (process.env.REACT_APP_SERVER_URL) return process.env.REACT_APP_SERVER_URL;
  const { hostname, protocol } = window.location;
  return `${protocol}//${hostname}:3001`;
}

const SERVER_URL = getServerUrl();

export function SocketProvider({ children }) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [player, setPlayer] = useState(null);

  useEffect(() => {
    const socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 10000,
    });
    socketRef.current = socket;

    socket.on('connect',    () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('registered', (data) => setPlayer(data));

    return () => socket.disconnect();
  }, []);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, socketRef, connected, player, setPlayer }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
