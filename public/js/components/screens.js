export function initScreens() {
  const homeScreen = document.getElementById('home-screen');
  const createRoomScreen = document.getElementById('create-room-screen');
  const gameScreen = document.getElementById('game-screen');
  
  window.showScreen = (screenId) => {
    document.querySelectorAll('.screen').forEach(screen => {
      screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
  };
  
  document.getElementById('create-room-btn').addEventListener('click', () => {
    console.log('Кнопка "Создать комнату" нажата');
    showScreen('create-room-screen');
  });
  
  document.getElementById('back-to-home').addEventListener('click', () => {
    console.log('Кнопка "Назад" нажата');
    showScreen('home-screen');
  });
}