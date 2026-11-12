import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { Replay } from './Replay.js';
import './styles.css';
import { ThemeProvider } from './Theme.js';
import { BrandStudio } from './BrandStudio.js';
const route = location.pathname.replace(/\/+$/, '') || '/';
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      {route === '/brand' ? <BrandStudio /> : route === '/replay' ? <Replay /> : <App />}
    </ThemeProvider>
  </React.StrictMode>,
);
