import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import '@fontsource-variable/figtree';
import '@fontsource-variable/bricolage-grotesque';
import './ui/tokens.css';
import './ui/app.css';
// Dropped in Task 6, once the rebuilt components no longer use its classes.
import './style.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
