import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// Open the browser's calendar / clock on a click anywhere in a date or time field,
// not only on its small icon. Typing in the field still works.
const PICKER_TYPES = new Set(['date', 'time', 'datetime-local', 'month', 'week']);
document.addEventListener('click', (e) => {
  const el = e.target;
  if (!(el instanceof HTMLInputElement) || !PICKER_TYPES.has(el.type) || el.disabled || el.readOnly) return;
  try {
    el.showPicker();
  } catch {
    // older browsers, or the picker is already open
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
