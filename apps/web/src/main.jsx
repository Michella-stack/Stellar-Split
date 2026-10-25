import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { ToastProvider } from './components/Toast.jsx';
import { I18nProvider } from './i18n/I18nProvider.jsx';
import { createRouter } from './routes/index.jsx';
import { WalletProvider } from './wallets/WalletProvider.jsx';
import { CONFIG } from './config/env.js';
import { loadLiveRates } from './lib/rates.js';
import ConfigError from './routes/ConfigError.jsx';
import './styles/app.css';

// Live exchange-rate estimates load in the background. Until they arrive (or if they never do), fixed sample rates are used.
loadLiveRates();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <I18nProvider>
      {CONFIG.ok ? (
        <ToastProvider>
          <WalletProvider>
            <RouterProvider router={createRouter()} />
          </WalletProvider>
        </ToastProvider>
      ) : (
        <ConfigError problems={CONFIG.problems} />
      )}
    </I18nProvider>
  </StrictMode>,
);
