import React from 'react';
import ReactDOM from 'react-dom/client';
import './fonts';
import './index.css';
import App from './App';

// Service worker: registro en producción desde PwaUpdatePrompt + build Workbox (craco).

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
