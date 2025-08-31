// Хранилище комнат
const rooms = {};

// Генерация имени комнаты
function generateRoomName() {
  const prefixes = ['Комната', 'Игра', 'Викторина', 'Квиз'];
  const suffixes = ['Огонь', 'Молния', 'Звезда', 'Победа', 'Экспресс'];
  return `${prefixes[Math.floor(Math.random() * prefixes.length)]} ${suffixes[Math.floor(Math.random() * suffixes.length)]}`;
}

// Получение количества игроков для режима
function getRequiredPlayers(mode) {
  switch (mode) {
    case 'duel': return 2;
    case 'alliance-1v2': return 3;
    case 'alliance-2v2': return 4;
    default: return 2;
  }
}

// Экспортируем хранилище и функции
module.exports = {
  rooms,
  createRoom: (io, socket, { playerName, roomName, mode, categories, mapSize }, uuidv4) => {
    try {
      const roomId = uuidv4().slice(0, 6).toUpperCase();
      
      // Если пользователь указал имя комнаты, используем его, иначе генерируем
      const finalRoomName = roomName && roomName.trim() !== '' ? 
        roomName : generateRoomName();
      
      rooms[roomId] = {
        id: roomId,
        name: finalRoomName,
        players: [{ 
          id: socket.id, 
          name: playerName, 
          score: 0,
          team: 1,
          lastAnswer: null
        }],
        mode,
        categories: categories || [], // Теперь это массив тем (или пустой массив)
        mapSize,
        gameState: "waiting",
        usedQuestions: [],
        hostId: socket.id
      };
      
      socket.join(roomId);
      
      // Отправляем подтверждение
      socket.emit('room-created', { 
        roomId, 
        playerCount: getRequiredPlayers(mode),
        map: null,
        name: finalRoomName,
        categories: rooms[roomId].categories
      });
      
      console.log(`Комната создана: ${roomId}, создатель: ${playerName}, название: ${finalRoomName}, темы: ${rooms[roomId].categories.join(', ')}`);
      
      // Обновляем список комнат
      io.emit('room-list-update', Object.values(rooms).map(room => ({
        id: room.id,
        name: room.name,
        playersCount: room.players.length,
        requiredPlayers: getRequiredPlayers(room.mode),
        status: room.gameState,
        mode: room.mode,
        categories: room.categories
      })));
    } catch (error) {
      console.error('Ошибка при создании комнаты:', error);
      socket.emit('error', 'Ошибка при создании комнаты');
    }
  },
  joinRoom: (io, socket, { roomId, playerName }) => {
    try {
      if (!rooms[roomId]) {
        socket.emit('error', "Комната не существует");
        console.log(`Попытка присоединиться к несуществующей комнате: ${roomId}`);
        return;
      }
      
      const playerCount = getRequiredPlayers(rooms[roomId].mode);
      if (rooms[roomId].players.length >= playerCount) {
        socket.emit('error', "Комната заполнена");
        console.log(`Комната ${roomId} заполнена, попытка присоединиться отклонена`);
        return;
      }
      
      const player = { 
        id: socket.id, 
        name: playerName, 
        score: 0,
        team: rooms[roomId].players.length + 1,
        lastAnswer: null
      };
      
      rooms[roomId].players.push(player);
      socket.join(roomId);
      
      console.log(`Игрок ${playerName} присоединился к комнате ${roomId}`);
      
      // Уведомляем всех в комнате
      io.to(roomId).emit('player-joined', { 
        players: rooms[roomId].players.map(p => ({ 
          id: p.id,
          name: p.name, 
          score: p.score,
          team: p.team 
        })),
        categories: rooms[roomId].categories
      });
      
      // Отправляем подтверждение
      socket.emit('room-joined', { 
        roomId,
        name: rooms[roomId].name,
        players: rooms[roomId].players.map(p => ({ 
          id: p.id,
          name: p.name, 
          score: p.score,
          team: p.team 
        })),
        isHost: false,
        mapSize: rooms[roomId].mapSize,
        categories: rooms[roomId].categories
      });
      
      // Обновляем список комнат
      io.emit('room-list-update', Object.values(rooms).map(room => ({
        id: room.id,
        name: room.name,
        playersCount: room.players.length,
        requiredPlayers: getRequiredPlayers(room.mode),
        status: room.gameState,
        mode: room.mode,
        categories: room.categories
      })));
      
      // Старт игры при наборе игроков
      if (rooms[roomId].players.length === playerCount && 
          rooms[roomId].gameState === "waiting") {
        rooms[roomId].gameState = "in-progress";
        io.to(roomId).emit('game-started');
        console.log(`Игра в комнате ${roomId} началась`);
        require('./game-logic').startGame(io, roomId);
      }
    } catch (error) {
      console.error('Ошибка при присоединении к комнате:', error);
      socket.emit('error', 'Ошибка при присоединении к комнате');
    }
  }
};