import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App';
import { startTheme } from './lib/theme';
import { startLanguage } from './lib/i18n';
import './index.css';

// Apply the stored theme before the first paint, and keep following the OS
// while the choice is "system".
startTheme();

// Say which language the page is in, so assistive technology reads it aloud
// in that language rather than in the one index.html happens to declare.
startLanguage();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
