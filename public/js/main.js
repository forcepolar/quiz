import { initScreens } from './components/screens.js';
import { initUI } from './components/ui.js';
import { initSocket } from './socket.js';

// Глобальные переменные
let playerName = '';
let selectedMode = 'duel';
let selectedCategory = '';

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
  initScreens();
  initUI();
  initSocket();
  
  console.log('🎮 Игра запущена');
});