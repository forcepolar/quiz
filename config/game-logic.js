const { rooms } = require('./rooms');
const path = require('path');
const fs = require('fs');

// Функция для безопасного перемешивания ответов
function shuffleOptions(question) {
  const shuffled = [...question.options];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  const newAnswerIndex = shuffled.indexOf(question.options[question.answer]);
  
  return {
    ...question,
    options: shuffled,
    answer: newAnswerIndex
  };
}

// Старт игры
function startGame(io, roomId) {
  try {
    const room = rooms[roomId];
    if (!room) {
      console.error(`Комната ${roomId} не найдена при запуске игры`);
      return;
    }
    
    room.map = generateMap(room.mapSize, room.mapSize, 
      room.mode === "duel" ? 2 : (room.mode === "alliance-1v2" ? 3 : 4)
    );
    
    // Сбросим lastAnswer для всех игроков
    room.players.forEach(player => {
      player.lastAnswer = null;
    });
    
    // Выбираем случайный вопрос
    const questionsPath = path.join(__dirname, '..', 'data', 'questions.json');
    let questions;
    
    try {
      questions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));
    } catch (error) {
      console.error('Ошибка чтения questions.json:', error);
      return;
    }
    
    // Фильтруем вопросы по категориям
    let availableQuestions = questions.filter(q => 
      q.type === "basic" && !room.usedQuestions?.includes(q.id)
    );
    
    // Если есть выбранные категории, фильтруем по ним
    if (room.categories && room.categories.length > 0) {
      availableQuestions = availableQuestions.filter(q => 
        room.categories.includes(q.category)
      );
    }
    
    if (availableQuestions.length === 0) {
      console.log(`Нет доступных вопросов для комнаты ${roomId}, сбрасываем список`);
      room.usedQuestions = [];
      return startGame(io, roomId);
    }
    
    const question = availableQuestions[
      Math.floor(Math.random() * availableQuestions.length)
    ];
    room.currentQuestion = question;
    room.usedQuestions.push(question.id);
    
    // Перемешиваем ответы перед отправкой
    const shuffledQuestion = shuffleOptions(question);
    io.to(roomId).emit('new-question', shuffledQuestion);
    
    console.log(`Новый вопрос в комнате ${roomId}: ${question.text}`);
    
    // Запускаем таймер 10 секунд
    room.questionTimeout = setTimeout(() => {
      io.to(roomId).emit('question-timeout', { questionId: question.id });
      
      // Проверяем, кто не ответил
      room.players.forEach(player => {
        if (!player.lastAnswer) {
          player.lastAnswer = { isCorrect: false, time: null };
        }
      });
      
      // Обрабатываем результаты
      handleQuestionResults(io, roomId);
    }, 10000);
  } catch (error) {
    console.error(`Ошибка при запуске игры в комнате ${roomId}:`, error);
  }
}

// Генерация карты
function generateMap(width, height, playerCount) {
  const map = Array(height).fill().map(() => Array(width).fill(0));
  
  for (let i = 0; i < playerCount; i++) {
    const x = i % 2 === 0 ? 0 : width - 1;
    const y = Math.floor(i / 2) * (height - 1);
    map[y][x] = i + 1;
  }
  
  return map;
}

// Обработка результатов базового вопроса
function handleQuestionResults(io, roomId) {
  try {
    const room = rooms[roomId];
    if (!room) return;
    
    const correctPlayers = room.players.filter(p => p.lastAnswer?.isCorrect);
    
    if (correctPlayers.length > 1) {
      // Переход к спринт-раунду
      const questionsPath = path.join(__dirname, '..', 'data', 'questions.json');
      let questions;
      
      try {
        questions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));
      } catch (error) {
        console.error('Ошибка чтения questions.json:', error);
        return;
      }
      
      // Фильтруем спринт-вопросы по категориям
      let sprintQuestions = questions.filter(q => 
        q.type === "sprint" && !room.usedQuestions.includes(q.id)
      );
      
      // Если есть выбранные категории, фильтруем по ним
      if (room.categories && room.categories.length > 0) {
        sprintQuestions = sprintQuestions.filter(q => 
          room.categories.includes(q.category)
        );
      }
      
      if (sprintQuestions.length === 0) {
        console.log(`Нет спринт-вопросов для комнаты ${roomId}, сбрасываем список`);
        room.usedQuestions = [];
        return handleQuestionResults(io, roomId);
      }
      
      const sprintQuestion = sprintQuestions[
        Math.floor(Math.random() * sprintQuestions.length)
      ];
      
      room.currentQuestion = sprintQuestion;
      room.usedQuestions.push(sprintQuestion.id);
      room.sprintStartTime = Date.now();
      
      // Перемешиваем спринт-вопрос
      const shuffledSprint = shuffleOptions(sprintQuestion);
      io.to(roomId).emit('sprint-start', shuffledSprint);
      
      console.log(`Спринт-раунд в комнате ${roomId}: ${sprintQuestion.text}`);
    } else {
      correctPlayers.forEach(p => p.score += 10);
      
      // Отправляем результаты
      io.to(roomId).emit('basic-result', {
        scores: room.players.map(p => ({ 
          id: p.id, 
          name: p.name,
          score: p.score,
          isCorrect: p.lastAnswer?.isCorrect 
        })),
        correctAnswer: room.currentQuestion.answer
      });
      
      console.log(`Результаты базового вопроса в комнате ${roomId}:`, 
        room.players.map(p => `${p.name}: ${p.score} (${p.lastAnswer?.isCorrect ? 'верно' : 'неверно'})`));
      
      // Через 2.5 секунды стартуем новую игру
      setTimeout(() => startGame(io, roomId), 2500);
    }
  } catch (error) {
    console.error(`Ошибка при обработке результатов в комнате ${roomId}:`, error);
  }
}

// Обработка базового ответа
function handleBasicAnswer(io, socket, { roomId, questionId, answerIndex }) {
  try {
    const room = rooms[roomId];
    if (!room || !room.currentQuestion || room.currentQuestion.id !== questionId || room.currentQuestion.type !== "basic") {
      console.log(`Некорректные данные для ответа в комнате ${roomId}`);
      return;
    }
    
    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.lastAnswer) {
      console.log(`Игрок ${socket.id} уже ответил или не найден в комнате ${roomId}`);
      return;
    }
    
    // Проверяем ответ по индексу
    const isCorrect = answerIndex === room.currentQuestion.answer;
    
    player.lastAnswer = { 
      isCorrect,
      time: null 
    };
    
    console.log(`Игрок ${player.name} ответил ${isCorrect ? 'верно' : 'неверно'} в комнате ${roomId}`);
    
    // Отправляем подтверждение игроку
    socket.emit('answer-confirmed', { 
      isCorrect,
      questionId,
      answerIndex 
    });
    
    // Проверяем, ответили ли все
    const allAnswered = room.players.every(p => p.lastAnswer !== null);
    
    if (allAnswered) {
      clearTimeout(room.questionTimeout);
      handleQuestionResults(io, roomId);
    }
  } catch (error) {
    console.error(`Ошибка при обработке базового ответа в комнате ${roomId}:`, error);
  }
}

// Обработка спринт-ответа
function handleSprintAnswer(io, socket, { roomId, questionId, answerIndex }) {
  try {
    const room = rooms[roomId];
    if (!room || !room.currentQuestion || room.currentQuestion.id !== questionId || room.currentQuestion.type !== "sprint") {
      console.log(`Некорректные данные для спринт-ответа в комнате ${roomId}`);
      return;
    }
    
    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.lastAnswer?.isCorrect) {
      console.log(`Игрок ${socket.id} не может ответить в спринте в комнате ${roomId}`);
      return;
    }
    
    // Проверяем ответ по индексу
    const isCorrect = answerIndex === room.currentQuestion.answer;
    
    if (!isCorrect) {
      socket.emit('sprint-answer-result', { 
        isCorrect: false,
        correctAnswer: room.currentQuestion.answer
      });
      return;
    }
    
    const timeTaken = Date.now() - room.sprintStartTime;
    player.lastAnswer.time = timeTaken;
    
    socket.emit('sprint-answer-result', { 
      isCorrect: true,
      time: timeTaken 
    });
    
    io.to(roomId).emit('sprint-update', {
      playerId: socket.id,
      time: (timeTaken / 1000).toFixed(3),
      playerName: player.name
    });
    
    console.log(`Игрок ${player.name} ответил верно за ${timeTaken}мс в спринте комнаты ${roomId}`);
    
    // Определение победителя спринта
    const allAnswered = room.players.filter(p => p.lastAnswer?.isCorrect)
      .every(p => p.lastAnswer.time !== null);
    
    if (allAnswered) {
      const correctPlayers = room.players.filter(p => p.lastAnswer?.isCorrect);
      const fastest = correctPlayers
        .sort((a, b) => (a.lastAnswer.time || Infinity) - (b.lastAnswer.time || Infinity))[0];
      
      if (fastest) {
        fastest.score += 10;
        
        io.to(roomId).emit('sprint-result', { 
          winner: fastest.id,
          winnerName: fastest.name,
          times: correctPlayers.map(p => ({
            playerId: p.id,
            playerName: p.name,
            time: p.lastAnswer.time ? (p.lastAnswer.time / 1000).toFixed(3) : null
          }))
        });
        
        console.log(`Победитель спринта в комнате ${roomId}: ${fastest.name}`);
        
        setTimeout(() => startGame(io, roomId), 3000);
      }
    }
  } catch (error) {
    console.error(`Ошибка при обработке спринт-ответа в комнате ${roomId}:`, error);
  }
}

module.exports = { startGame, handleBasicAnswer, handleSprintAnswer, generateMap };