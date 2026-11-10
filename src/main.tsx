import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { getState, subscribe } from './core/store';
import { engine } from './core/engine';
import { fetchFallbackLyric } from './core/lyrics';
import { parseLrc } from './core/lrc';

// 调试/e2e 句柄：浏览器控制台或 Playwright 里可直接读状态、驱动播放
declare global {
  interface Window {
    __qy?: {
      getState: typeof getState;
      subscribe: (fn: () => void) => () => void;
      engine: typeof engine;
      fetchFallbackLyric: typeof fetchFallbackLyric;
      parseLrc: typeof parseLrc;
    };
  }
}
window.__qy = {
  getState,
  subscribe,
  engine,
  fetchFallbackLyric,
  parseLrc,
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
