import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config } from './config';
import { App } from './App';
import { Documentation } from './Documentation';
import './style.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
});
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {/^\/docs\/?$/.test(window.location.pathname) ? (
          <Documentation />
        ) : (
          <App />
        )}
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
);
