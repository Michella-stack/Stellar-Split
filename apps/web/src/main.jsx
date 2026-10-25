import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { ToastProvider } from './components/Toast.jsx';
import { createRouter } from './routes/index.jsx';
import { WalletProvider } from './wallets/WalletProvider.jsx';
import { CONFIG } from './config/env.js';
import ConfigError from './routes/ConfigError.jsx';
import './styles/app.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {CONFIG.ok ? (
      <ToastProvider>
        <WalletProvider>
          <RouterProvider router={createRouter()} />
        </WalletProvider>
      </ToastProvider>
    ) : (
      <ConfigError problems={CONFIG.problems} />
    )}
  </StrictMode>,
);
