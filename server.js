const express = require('express');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const app = express();
const server = http.createServer(app);

console.log('🚀 Запуск сервера...');

// Статические файлы
app.use(express.static('public'));
console.log('📂 Статические файлы подключены');

// Импортируем единую систему комнат и логику
let roomManager, gameLogic;
try {
  roomManager = require('./config/rooms');
  gameLogic = require('./config/game-logic');
  console.log('✅ Конфигурация комнат и логики загружена');
} catch (error) {
  console.error('❌ Ошибка загрузки конфигурации:', error);
  process.exit(1);
}

const { startGame, handleBasicAnswer, handleSprintAnswer } = gameLogic;

// Настройки CORS для лучшей совместимости
console.log('🔧 Настраиваем Socket.IO...');
const io = require('socket.io')(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e8,
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true
  }
});

// Подробное логирование событий сокета
io.engine.on('connection_error', (err) => {
  console.error('❌ Ошибка подключения на уровне движка:', err);
});

io.engine.on('headers', (headers, req) => {
  console.log('📡 Заголовки запроса:', headers);
});

io.on('connection', (socket) => {
  console.log(`\n🔗 Новое подключение: ${socket.id}`);
  
  // Логирование всех событий сокета
  socket.onAny((event, ...args) => {
    console.log(`📨 Получено событие: ${event}`, args.length > 0 ? JSON.stringify(args) : '');
  });
  
  socket.onAnyOutgoing((event, ...args) => {
    console.log(`📤 Отправлено событие: ${event}`, args.length > 0 ? JSON.stringify(args) : '');
  });
  
  // Запрос списка комнат
  socket.on('request-room-list', () => {
    console.log('📋 Запрос списка комнат');
    try {
      const roomList = Object.values(roomManager.rooms).map(room => ({
        id: room.id,
        name: room.name || `Комната ${room.id.slice(0, 4)}`,
        playersCount: room.players.length,
        requiredPlayers: room.mode === "duel" ? 2 : 
                       (room.mode === "alliance-1v2" ? 3 : 4),
        status: room.gameState,
        mode: room.mode,
        categories: room.categories || []
      }));
      
      console.log('📋 Отправка списка комнат:', roomList);
      socket.emit('room-list-update', roomList);
    } catch (error) {
      console.error('❌ Ошибка при обработке request-room-list:', error);
      socket.emit('error', 'Ошибка при получении списка комнат');
    }
  });
  
  // Создание комнаты
  socket.on('create-room', (data) => {
    console.log('🆕 Создание комнаты с данными:', data);
    try {
      const { playerName, roomName, mode, categories } = data;
      const mapSize = data.mapSize || 5;
      
      if (!playerName) {
        console.error('❌ Имя игрока не указано');
        socket.emit('error', 'Имя игрока не указано');
        return;
      }
      
      // Если категории не переданы или пусты, используем все темы
      const finalCategories = (categories && categories.length > 0) ? 
        categories : null;
      
      console.log(`🆕 Попытка создать комнату: ${playerName}, ${mode}, темы: ${finalCategories}, название: ${roomName || 'авто'}`);
      roomManager.createRoom(io, socket, { 
        playerName, 
        roomName,
        mode, 
        categories: finalCategories,
        mapSize 
      }, uuidv4);
      
      console.log('✅ Команда createRoom вызвана');
    } catch (error) {
      console.error('❌ Критическая ошибка при создании комнаты:', error);
      socket.emit('error', 'Критическая ошибка при создании комнаты');
    }
  });
  
  // Присоединение к комнате
  socket.on('join-room', (data) => {
    console.log('👥 Присоединение к комнате с данными:', data);
    try {
      const { roomId, playerName } = data;
      
      if (!roomId) {
        console.error('❌ ID комнаты не указан');
        socket.emit('error', 'ID комнаты не указан');
        return;
      }
      
      if (!playerName) {
        console.error('❌ Имя игрока не указано');
        socket.emit('error', 'Имя игрока не указано');
        return;
      }
      
      roomManager.joinRoom(io, socket, { roomId, playerName });
    } catch (error) {
      console.error('❌ Ошибка при присоединении к комнате:', error);
      socket.emit('error', 'Ошибка при присоединении к комнате');
    }
  });
  
  // Начало игры
  socket.on('start-game', (data) => {
    console.log('🎮 Начало игры с данными:', data);
    try {
      const { roomId } = data;
      
      if (!roomId) {
        console.error('❌ ID комнаты не указан');
        socket.emit('error', 'ID комнаты не указан');
        return;
      }
      
      const room = roomManager.rooms[roomId];
      if (room && room.players.some(p => p.id === socket.id)) {
        console.log(`🎮 Запуск игры в комнате ${roomId}`);
        startGame(io, roomId);
      } else {
        console.error('❌ Игрок не является участником комнаты');
        socket.emit('error', 'Вы не являетесь участником этой комнаты');
      }
    } catch (error) {
      console.error('❌ Ошибка при запуске игры:', error);
      socket.emit('error', 'Ошибка при запуске игры');
    }
  });
  
  // Ответ на базовый вопрос
  socket.on('answer', (data) => {
    console.log('📝 Получен ответ на базовый вопрос:', data);
    try {
      const { roomId, questionId, answerIndex } = data;
      
      if (!roomId || !questionId || answerIndex === undefined) {
        console.error('❌ Некорректные данные для ответа');
        return;
      }
      
      handleBasicAnswer(io, socket, { roomId, questionId, answerIndex });
    } catch (error) {
      console.error('❌ Ошибка при обработке ответа:', error);
    }
  });
  
  // Спринт-ответ
  socket.on('sprint-answer', (data) => {
    console.log('⚡ Получен спринт-ответ:', data);
    try {
      const { roomId, questionId, answerIndex } = data;
      
      if (!roomId || !questionId || answerIndex === undefined) {
        console.error('❌ Некорректные данные для спринт-ответа');
        return;
      }
      
      handleSprintAnswer(io, socket, { roomId, questionId, answerIndex });
    } catch (error) {
      console.error('❌ Ошибка при обработке спринт-ответа:', error);
    }
  });
  
  // Отключение
  socket.on('disconnect', (reason) => {
    console.log(`\n🔌 Отключение сокета ${socket.id}, причина: ${reason}`);
    
    for (const roomId in roomManager.rooms) {
      try {
        const room = roomManager.rooms[roomId];
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        
        if (playerIndex !== -1) {
          console.log(`👥 Игрок ${socket.id} покинул комнату ${roomId}`);
          room.players.splice(playerIndex, 1);
          
          // Если комната опустела
          if (room.players.length === 0) {
            console.log(`🗑️ Удаление пустой комнаты ${roomId}`);
            delete roomManager.rooms[roomId];
            io.emit('room-list-update', Object.values(roomManager.rooms).map(room => ({
              id: room.id,
              name: room.name || `Комната ${room.id.slice(0, 4)}`,
              playersCount: room.players.length,
              requiredPlayers: room.mode === "duel" ? 2 : 
                             (room.mode === "alliance-1v2" ? 3 : 4),
              status: room.gameState,
              mode: room.mode,
              categories: room.categories || []
            })));
          } else {
            // Обновляем список комнат
            console.log(`🔄 Обновление комнаты ${roomId} после выхода игрока`);
            io.to(roomId).emit('player-left', { playerId: socket.id });
            io.to(roomId).emit('score-update', {
              scores: room.players.map(p => ({ id: p.id, name: p.name, score: p.score }))
            });
            
            // Если игра была в процессе и остался один игрок, завершаем игру
            if (room.gameState === 'in-progress' && room.players.length === 1) {
              console.log(`🔚 Завершение игры в комнате ${roomId} (остался один игрок)`);
              room.gameState = 'waiting';
              io.to(roomId).emit('game-ended', { reason: 'Один игрок остался' });
            }
          }
        }
      } catch (error) {
        console.error(`❌ Ошибка при обработке отключения в комнате ${roomId}:`, error);
      }
    }
  });
  
  // Обработка ошибок сокета
  socket.on('error', (error) => {
    console.error('❌ Ошибка сокета:', error);
  });
  
  // Подтверждение подключения
  socket.emit('connection-confirmed', {
    status: 'connected',
    socketId: socket.id,
    timestamp: Date.now()
  });
  console.log('✅ Подключение подтверждено');
});

// Обработчик ошибок для сервера
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error('\n❌ Порт уже занят другим процессом!');
    console.log('   Решение:');
    console.log('   1. Найдите и завершите процесс, занимающий порт:');
    console.log('      - Для Linux/Mac: sudo lsof -i :3000 или sudo kill $(sudo lsof -t -i:3000)');
    console.log('      - Для Windows: netstat -ano | findstr :3000 затем taskkill /PID <PID> /F');
    console.log('   2. Или используйте другой порт:');
    console.log('      - Запустите с переменной окружения: PORT=3001 node server.js');
    process.exit(1);
  } else {
    console.error('❌ Неизвестная ошибка сервера:', error);
    process.exit(1);
  }
});

// Определение порта
const PORT = process.env.PORT || 3000;

// Запуск сервера
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎉 Сервер успешно запущен: http://0.0.0.0:${PORT}`);
  console.log(`💡 Откройте в браузере на КЛИЕНТСКОМ компьютере: http://ВАШ_IP_СЕРВЕРА:${PORT}`);
  console.log(`🔍 Для проверки подключения Socket.IO откройте: http://ВАШ_IP_СЕРВЕРА:${PORT}/socket.io/socket.io.js`);
  console.log('\n📌 ВАЖНО: Замените "ВАШ_IP_СЕРВЕРА" на реальный IP-адрес вашего сервера!');
  console.log('   Например: http://192.168.1.100:3000');
});