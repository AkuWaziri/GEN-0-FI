import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Guard against uncaught third-party relay or iframe authorization rejections
if (typeof window !== 'undefined') {
  const isAuthOrOriginError = (msg?: unknown) => {
    if (!msg) return false;
    let text = '';
    if (typeof msg === 'string') {
      text = msg;
    } else if (msg instanceof Error) {
      text = `${msg.message} ${msg.stack || ''}`;
    } else {
      try {
        text = JSON.stringify(msg);
      } catch {
        text = String(msg);
      }
    }
    const lower = text.toLowerCase();
    return (
      lower.includes('not been authorized yet') ||
      lower.includes('has not been authorized') ||
      lower.includes('not in your allow list') ||
      lower.includes('origin_not_allowed') ||
      lower.includes('apkt002') ||
      lower.includes('apkt005') ||
      lower.includes('unverified domain') ||
      lower.includes('analyticssdkapierror') ||
      lower.includes('analytics sdk:')
    );
  };

  const origError = console.error;
  console.error = (...args: unknown[]) => {
    if (args.some((arg) => isAuthOrOriginError(arg))) {
      return;
    }
    origError.apply(console, args);
  };

  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (args.some((arg) => isAuthOrOriginError(arg))) {
      return;
    }
    origWarn.apply(console, args);
  };

  window.addEventListener(
    'error',
    (event) => {
      if (isAuthOrOriginError(event.message) || isAuthOrOriginError(event.error)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
      }
    },
    true
  );

  window.addEventListener(
    'unhandledrejection',
    (event) => {
      if (isAuthOrOriginError(event.reason)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
      }
    },
    true
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

