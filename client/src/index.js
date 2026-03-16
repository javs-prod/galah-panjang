import React from 'react';
import ReactDOM from 'react-dom/client';
import { SocketProvider } from './hooks/useSocket';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <SocketProvider>
    <App />
  </SocketProvider>
);
