export function initUI() {
  const playerNameInput = document.getElementById('player-name');
  const roomNameInput = document.getElementById('room-name');
  const startGameBtn = document.getElementById('start-game-btn');
  const errorContainer = document.getElementById('error-container');
  
  // Выбор режима
  document.querySelectorAll('.option-card[data-mode]').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.option-card[data-mode]').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      window.selectedMode = card.dataset.mode;
      console.log('Режим игры выбран:', window.selectedMode);
    });
  });
  
  // Выбор тем
  document.querySelectorAll('.option-card[data-category]').forEach(card => {
    card.addEventListener('click', () => {
      card.classList.toggle('selected');
      updateSelectedCategories();
    });
  });
  
  // Функция для обновления выбранных категорий
  function updateSelectedCategories() {
    const selectedCategories = Array.from(document.querySelectorAll('.option-card[data-category].selected'))
      .map(card => card.dataset.category);
    
    window.selectedCategories = selectedCategories;
    console.log('Темы вопросов выбраны:', window.selectedCategories);
    
    // Обновляем отображение выбранных тем
    const selectedCount = selectedCategories.length;
    const categoryLabel = document.querySelector('.form-label[for="category-select"]');
    if (categoryLabel) {
      if (selectedCount === 0) {
        categoryLabel.textContent = 'Темы вопросов (можно выбрать несколько)';
      } else {
        categoryLabel.textContent = `Темы вопросов (${selectedCount} выбрано)`;
      }
    }
  }
  
  // Создание комнаты
  startGameBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    const roomName = roomNameInput.value.trim();
    
    if (!name) {
      showError('Введите имя!');
      return;
    }
    
    // Проверяем, существует ли сокет и подключен ли он
    if (!window.socket) {
      console.error('Сокет не инициализирован');
      showError('Ошибка инициализации сокета. Перезагрузите страницу.');
      return;
    }
    
    console.log('Состояние сокета при нажатии:', {
      connected: window.socket.connected,
      readyState: window.socket.io?.engine?.readyState,
      id: window.socket.id
    });
    
    // Проверяем, установлено ли соединение
    if (!window.socket.connected) {
      // Пытаемся переподключиться
      console.log('Сокет не подключен, пытаемся переподключиться...');
      
      // Отключаем кнопку на время переподключения
      startGameBtn.disabled = true;
      startGameBtn.textContent = 'Подключение...';
      
      // Пытаемся переподключиться с таймаутом
      const reconnectTimeout = setTimeout(() => {
        startGameBtn.disabled = false;
        startGameBtn.textContent = 'Создать игру';
        showError('Не удалось подключиться к серверу');
      }, 3000);
      
      window.socket.once('connect', () => {
        clearTimeout(reconnectTimeout);
        console.log('Соединение восстановлено, пытаемся создать комнату...');
        createRoom();
      });
      
      window.socket.connect();
      return;
    }
    
    // Если соединение установлено, создаем комнату
    createRoom();
  });
  
  // Функция для создания комнаты
  function createRoom() {
    const name = playerNameInput.value.trim();
    const roomName = roomNameInput.value.trim();
    const mode = window.selectedMode || 'duel';
    const categories = window.selectedCategories || [];
    
    console.log(`Создание комнаты: ${name}, ${mode}, темы: ${categories.join(', ')}, название: ${roomName || 'авто'}`);
    
    // Отключаем кнопку на время отправки
    startGameBtn.disabled = true;
    startGameBtn.textContent = 'Создание комнаты...';
    
    // Создаем обработчик ответа
    const responseHandler = (data) => {
      console.log('Получен ответ от сервера на создание комнаты', data);
      
      // Очищаем обработчики
      window.socket.off('room-created', responseHandler);
      window.socket.off('error', responseHandler);
      
      // Возвращаем кнопку в исходное состояние
      startGameBtn.disabled = false;
      startGameBtn.textContent = 'Создать игру';
      
      // Обработка успешного создания комнаты
      handleRoomCreated(data);
    };
    
    const errorHandler = (error) => {
      console.error('Ошибка от сервера при создании комнаты:', error);
      
      // Очищаем обработчики
      window.socket.off('room-created', responseHandler);
      window.socket.off('error', errorHandler);
      
      // Возвращаем кнопку в исходное состояние
      startGameBtn.disabled = false;
      startGameBtn.textContent = 'Создать игру';
      
      // Показываем ошибку
      showError(`Ошибка создания комнаты: ${error}`);
    };
    
    // Устанавливаем обработчики
    window.socket.once('room-created', responseHandler);
    window.socket.once('error', errorHandler);
    
    // Таймаут ожидания ответа
    const timeout = setTimeout(() => {
      // Очищаем обработчики
      window.socket.off('room-created', responseHandler);
      window.socket.off('error', errorHandler);
      
      // Возвращаем кнопку в исходное состояние
      startGameBtn.disabled = false;
      startGameBtn.textContent = 'Создать игру';
      
      showError('Сервер не отвечает. Попробуйте позже.');
    }, 3000);
    
    // Отправляем запрос на создание комнаты
    window.socket.emit('create-room', { 
      playerName: name, 
      roomName: roomName || '',
      mode: mode,
      categories: categories,
      mapSize: 5
    });
  }
  
  // Обработка успешного создания комнаты
  function handleRoomCreated({ roomId, playerCount, name, categories }) {
    console.log(`Комната создана: ${roomId}, ожидаем ${playerCount} игроков`);
    window.currentRoomId = roomId;
    window.playerCount = playerCount;
    window.roomName = name;
    window.roomCategories = categories;
    
    // Показываем экран игры
    window.showScreen('game-screen');
    document.getElementById('player-name-display').textContent = `Вы: ${playerNameInput.value}`;
    
    // Обновляем таблицу результатов
    updateScoreboard([{
      id: window.socket.id,
      name: playerNameInput.value,
      score: 0
    }]);
    
    // Отображаем сообщение о создании комнаты
    const questionContainer = document.getElementById('question-container');
    questionContainer.innerHTML = `
      <div style="text-align: center; padding: 20px;">
        <h2>Комната создана!</h2>
        <p>Имя комнаты: <strong>${name}</strong></p>
        <p>Темы: ${window.roomCategories && window.roomCategories.length > 0 ? window.roomCategories.join(', ') : 'Все темы'}</p>
        <p>Ожидаем ${playerCount - 1} игроков...</p>
        <div class="room-id" style="margin-top: 15px; font-family: monospace; background: #4a5568; padding: 8px; border-radius: 8px;">
          ID: ${roomId}
        </div>
      </div>
    `;
  }
  
  function showError(message) {
    console.error('Показываем ошибку:', message);
    errorContainer.innerHTML = `<div class="error-message">${message}</div>`;
    setTimeout(() => {
      errorContainer.innerHTML = '';
    }, 5000);
  }
  
  // Экспортируем для использования в других модулях
  window.showError = showError;
  
  // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Проверяем существование сокета перед подпиской
  if (window.socket) {
    // Обработка событий от сервера
    window.socket.on('room-created', ({ roomId, playerCount, name, categories }) => {
      handleRoomCreated({ roomId, playerCount, name, categories });
    });
    
    window.socket.on('error', (error) => {
      console.error('Ошибка от сервера:', error);
      startGameBtn.disabled = false;
      startGameBtn.textContent = 'Создать игру';
      showError(`Ошибка: ${error}`);
    });
    
    window.socket.on('player-joined', ({ players, categories }) => {
      console.log('Игрок присоединился к комнате', players);
      updateScoreboard(players);
      
      // Обновляем отображение комнаты, если мы уже в игре
      if (document.getElementById('game-screen').classList.contains('active')) {
        const questionContainer = document.getElementById('question-container');
        if (questionContainer && window.roomName) {
          questionContainer.innerHTML = `
            <div style="text-align: center; padding: 20px;">
              <h2>Комната: ${window.roomName}</h2>
              <p>Темы: ${categories && categories.length > 0 ? categories.join(', ') : 'Все темы'}</p>
              <p>Ожидаем ${window.playerCount - players.length} игроков...</p>
              <div class="room-id" style="margin-top: 15px; font-family: monospace; background: #4a5568; padding: 8px; border-radius: 8px;">
                ID: ${window.currentRoomId}
              </div>
            </div>
          `;
        }
      }
    });
    
    window.socket.on('score-update', ({ scores }) => {
      console.log('Обновление счета', scores);
      updateScoreboard(scores);
    });
    
    window.socket.on('player-left', ({ playerId }) => {
      console.log('Игрок покинул комнату', playerId);
    });
    
    window.socket.on('game-started', () => {
      console.log('Игра началась!');
    });
    
    window.socket.on('new-question', (question) => {
      console.log('Получен новый вопрос', question);
      displayQuestion(question);
    });
    
    window.socket.on('basic-result', ({ scores, correctAnswer }) => {
      console.log('Получены результаты базового вопроса', scores, correctAnswer);
      displayBasicResults(scores, correctAnswer);
    });
    
    window.socket.on('sprint-start', (question) => {
      console.log('Начало спринт-раунда', question);
      displaySprintQuestion(question);
    });
    
    window.socket.on('sprint-update', ({ playerId, time, playerName }) => {
      console.log(`Спринт: ${playerName} ответил за ${time} сек`);
      updateSprintResults(playerId, time, playerName);
    });
    
    window.socket.on('sprint-result', ({ winner, winnerName, times }) => {
      console.log(`Спринт завершен. Победитель: ${winnerName}`);
      displaySprintResults(winner, winnerName, times);
    });
    
    window.socket.on('question-timeout', () => {
      console.log('Время на вопрос истекло');
      displayTimeout();
    });
    
    window.socket.on('answer-confirmed', ({ isCorrect }) => {
      console.log('Подтверждение ответа:', isCorrect ? 'верный' : 'неверный');
    });
  } else {
    // Если сокет еще не инициализирован, добавляем обработчик на событие инициализации
    document.addEventListener('socket-initialized', () => {
      if (window.socket) {
        // Повторно вызываем initUI, чтобы подписаться на события
        initUI();
      }
    });
  }
  
  // Функции отображения
  function updateScoreboard(players) {
    console.log('Обновление таблицы результатов', players);
    const scoreboard = document.getElementById('scoreboard');
    scoreboard.innerHTML = players.map(player => `
      <div class="player-score">
        <div class="player-name-score">${player.name}</div>
        <div class="player-points">${player.score}</div>
      </div>
    `).join('');
  }
  
  function displayQuestion(question) {
    console.log('Отображение вопроса', question);
    const questionContainer = document.getElementById('question-container');
    const optionsContainer = document.getElementById('options-container');
    
    questionContainer.innerHTML = `
      <div class="question-text">${question.text}</div>
      <div class="timer-bar">
        <div class="timer-progress"></div>
      </div>
    `;
    
    optionsContainer.innerHTML = question.options.map((option, index) => `
      <div class="option" data-index="${index}">${option}</div>
    `).join('');
    
    // Добавляем обработчики кликов
    document.querySelectorAll('.option').forEach(option => {
      option.addEventListener('click', () => {
        const index = parseInt(option.dataset.index);
        console.log(`Выбран ответ: ${index} (${question.options[index]})`);
        
        window.socket.emit('answer', {
          roomId: window.currentRoomId,
          questionId: question.id,
          answerIndex: index
        });
        
        // Отключаем выбор
        document.querySelectorAll('.option').forEach(opt => {
          opt.style.pointerEvents = 'none';
          opt.style.opacity = '0.7';
        });
      });
    });
  }
  
  function displayBasicResults(scores, correctAnswer) {
    console.log('Отображение результатов базового вопроса', scores, correctAnswer);
    const questionContainer = document.getElementById('question-container');
    
    // Подсвечиваем правильный ответ
    document.querySelectorAll('.option').forEach((option, index) => {
      if (index === correctAnswer) {
        option.style.background = '#48bb78';
      }
    });
    
    // Показываем результаты
    const resultsHTML = scores.map(score => `
      <div style="display: flex; justify-content: space-between; padding: 8px 0;">
        <span>${score.name}</span>
        <span style="color: ${score.isCorrect ? '#48bb78' : '#fc8181'}">
          ${score.isCorrect ? '✅ +10' : '❌'}
        </span>
      </div>
    `).join('');
    
    setTimeout(() => {
      questionContainer.innerHTML = `
        <div class="question-text">Результаты</div>
        <div style="margin-top: 15px;">${resultsHTML}</div>
      `;
    }, 1500);
  }
  
  function displaySprintQuestion(question) {
    console.log('Отображение спринт-вопроса', question);
    const questionContainer = document.getElementById('question-container');
    const optionsContainer = document.getElementById('options-container');
    
    questionContainer.innerHTML = `
      <div class="question-text">${question.text}</div>
      <div class="sprint-timer" id="sprint-timer">10.000</div>
    `;
    
    optionsContainer.innerHTML = question.options.map((option, index) => `
      <div class="option" data-index="${index}">${option}</div>
    `).join('');
    
    // Таймер спринта
    let timeLeft = 10;
    const timerElement = document.getElementById('sprint-timer');
    
    const timerInterval = setInterval(() => {
      timeLeft -= 0.001;
      timerElement.textContent = timeLeft.toFixed(3);
      
      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        displaySprintTimeout();
      }
    }, 1);
    
    // Добавляем обработчики кликов
    document.querySelectorAll('.option').forEach(option => {
      option.addEventListener('click', () => {
        const index = parseInt(option.dataset.index);
        console.log(`Спринт: выбран ответ ${index} (${question.options[index]})`);
        
        window.socket.emit('sprint-answer', {
          roomId: window.currentRoomId,
          questionId: question.id,
          answerIndex: index
        });
        
        // Отключаем выбор
        document.querySelectorAll('.option').forEach(opt => {
          opt.style.pointerEvents = 'none';
          opt.style.opacity = '0.7';
        });
        
        clearInterval(timerInterval);
      });
    });
  }
  
  function updateSprintResults(playerId, time, playerName) {
    console.log(`Обновление результатов спринта: ${playerName} - ${time} сек`);
    const optionsContainer = document.getElementById('options-container');
    const resultsDiv = document.getElementById('sprint-results') || document.createElement('div');
    
    if (!document.getElementById('sprint-results')) {
      resultsDiv.id = 'sprint-results';
      resultsDiv.style.marginTop = '15px';
      resultsDiv.style.paddingTop = '15px';
      resultsDiv.style.borderTop = '1px solid #4a5568';
      optionsContainer.appendChild(resultsDiv);
    }
    
    resultsDiv.innerHTML += `
      <div style="display: flex; justify-content: space-between; padding: 5px 0;">
        <span>${playerName}</span>
        <span>${time} с</span>
      </div>
    `;
  }
  
  function displaySprintResults(winner, winnerName, times) {
    console.log(`Отображение результатов спринта. Победитель: ${winnerName}`);
    const questionContainer = document.getElementById('question-container');
    
    const resultsHTML = times.map(time => `
      <div style="display: flex; justify-content: space-between; padding: 8px 0;">
        <span>${time.playerName}</span>
        <span>${time.time} с</span>
      </div>
    `).join('');
    
    questionContainer.innerHTML = `
      <div class="question-text">Спринт завершен!</div>
      <div style="margin: 15px 0; text-align: center; color: #4facfe; font-weight: bold;">
        Победитель: ${winnerName} +10
      </div>
      <div style="margin-top: 15px;">${resultsHTML}</div>
    `;
  }
  
  function displayTimeout() {
    console.log('Отображение таймаута');
    const questionContainer = document.getElementById('question-container');
    
    setTimeout(() => {
      questionContainer.innerHTML = `
        <div class="question-text">Время вышло!</div>
        <div style="margin-top: 15px; text-align: center; color: #fc8181;">
          Ответы не поступили
        </div>
      `;
    }, 1000);
  }
}