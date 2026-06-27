/**
 * 游戏平台 WebSocket 服务器
 * 支持：房间管理、对弈、观战、断线重连、观战接手
 */

const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { GomokuGame } = require('./games/gomoku');
const { DrawGuessGame } = require('./games/drawguess');
const qqwing = require('qqwing');

const PORT = process.env.PORT || 3000;

// --- 静态文件服务 ---
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
};

// 解析 qqwing 字符串为数组
function parseSudoku(str) {
  const result = [];
  const lines = str.split('\n');
  for (const line of lines) {
    if (line.includes('---') || line.trim() === '') continue;
    const row = [];
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch >= '1' && ch <= '9') {
        row.push(parseInt(ch));
      } else if (ch === '.' || ch === '0') {
        row.push(0);
      }
    }
    if (row.length === 9) {
      result.push(row);
    }
  }
  return result;
}

// 获取给定数量
function getGivenCount(puzzle) {
  let count = 0;
  for (const row of puzzle) {
    for (const cell of row) {
      if (cell !== 0) count++;
    }
  }
  return count;
}

// 生成可见性矩阵（协作模式）- 同时返回两个玩家的可见性
function generateVisibleCellsPair(puzzle, difficulty) {
  const visible1 = Array.from({ length: 9 }, () => Array(9).fill(false));
  const visible2 = Array.from({ length: 9 }, () => Array(9).fill(false));

  // 收集所有有数字的格子
  const filledCells = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (puzzle[r][c] !== 0) {
        filledCells.push({ row: r, col: c });
      }
    }
  }

  // 根据难度设置可见比例
  const visibilityConfig = {
    easy: { shared: 0.6, unique: 0.2 },    // 总共 80% 可见，60% 共同，20% 各自独有
    medium: { shared: 0.3, unique: 0.3 },   // 总共 60% 可见，30% 共同，30% 各自独有
    hard: { shared: 0.1, unique: 0.3 },     // 总共 40% 可见，10% 共同，30% 各自独有
    expert: { shared: 0.05, unique: 0.25 }  // 总共 30% 可见，5% 共同，25% 各自独有
  };

  const config = visibilityConfig[difficulty] || visibilityConfig.medium;
  const sharedCount = Math.floor(filledCells.length * config.shared);
  const uniqueCount = Math.floor(filledCells.length * config.unique);

  // 随机打乱格子顺序
  const shuffled = [...filledCells].sort(() => Math.random() - 0.5);

  let idx = 0;

  // 1. 共同可见的格子（两人都能看到）
  for (let i = 0; i < sharedCount && idx < shuffled.length; i++, idx++) {
    visible1[shuffled[idx].row][shuffled[idx].col] = true;
    visible2[shuffled[idx].row][shuffled[idx].col] = true;
  }

  // 2. 玩家1独有的格子
  for (let i = 0; i < uniqueCount && idx < shuffled.length; i++, idx++) {
    visible1[shuffled[idx].row][shuffled[idx].col] = true;
  }

  // 3. 玩家2独有的格子
  for (let i = 0; i < uniqueCount && idx < shuffled.length; i++, idx++) {
    visible2[shuffled[idx].row][shuffled[idx].col] = true;
  }

  return { visible1, visible2 };
}

// 计算数独评价等级
function calculateSudokuGrade(time, errors) {
  const minutes = time / 60;

  if (minutes < 5 && errors === 0) return 'S';
  if (minutes < 10 && errors <= 2) return 'A';
  if (minutes < 20 && errors <= 5) return 'B';
  return 'C';
}

// 获取数独提示（使用 qqwing 解题）
function getSudokuHint(board) {
  const puzzle = new qqwing();

  // 设置当前棋盘
  const boardArray = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      boardArray.push(board[r][c]);
    }
  }
  puzzle.setPuzzle(boardArray);

  // 记录解题历史
  puzzle.setRecordHistory(true);

  // 解决谜题
  const solved = puzzle.solve();

  if (!solved) {
    // 保底机制：天眼提示
    return getEyeHint(board);
  }

  // 获取解答字符串并解析为数组
  const solutionStr = puzzle.getSolutionString();
  const solution = parseSudoku(solutionStr);

  // 获取解题指令（对象数组）
  const instructions = puzzle.getSolveInstructions();

  // 先找逻辑推理步骤
  for (let i = 0; i < instructions.length; i++) {
    const inst = instructions[i];
    const type = inst.getType();

    // 跳过 given (type 0)
    if (type === 0) continue;

    // 跳过猜测 (type 5)
    if (type === 5) continue;

    const row = inst.getRow();
    const col = inst.getColumn();
    const value = inst.getValue();
    const desc = inst.getDescription();

    // 检查这个步骤是否适用于当前棋盘状态
    if (board[row][col] !== 0) continue;

    // 验证这个值是否正确（对比解答）
    const solutionValue = solution[row][col];
    if (value !== solutionValue) {
      console.log(`警告：提示值不匹配 [${row},${col}] 提示=${value} 解答=${solutionValue}`);
      continue;
    }

    // 提取推理方法（根据 qqwing 的实际描述）
    let method = '逻辑推理';
    if (desc === 'Mark only possibility for cell') {
      method = '唯一候选数';
    } else if (desc === 'Mark single possibility for value in section') {
      method = '宫唯一';
    } else if (desc === 'Mark single possibility for value in row') {
      method = '行唯一';
    } else if (desc === 'Mark single possibility for value in column') {
      method = '列唯一';
    } else if (desc.includes('naked pair')) {
      method = '数对排除';
    } else if (desc.includes('hidden pair')) {
      method = '隐性数对';
    } else if (desc.includes('pointing')) {
      method = '指向排除';
    } else if (desc.includes('box')) {
      method = '宫排除';
    } else if (desc.includes('Remove possibilities')) {
      method = '排除法';
    }

    return { row, col, value, method };
  }

  // 如果没有逻辑推理步骤，找猜测步骤（试数法）
  for (let i = 0; i < instructions.length; i++) {
    const inst = instructions[i];
    const type = inst.getType();

    // 只处理猜测步骤 (type 5)
    if (type !== 5) continue;

    const row = inst.getRow();
    const col = inst.getColumn();
    const value = inst.getValue();

    // 检查这个步骤是否适用于当前棋盘状态
    if (board[row][col] !== 0) continue;

    // 验证这个值是否正确（对比解答）
    const solutionValue = solution[row][col];
    if (value !== solutionValue) {
      console.log(`警告：提示值不匹配 [${row},${col}] 提示=${value} 解答=${solutionValue}`);
      continue;
    }

    return { row, col, value, method: '试数法' };
  }

  // 保底机制：天眼提示
  return getEyeHint(board);
}

// 天眼提示（保底机制）
function getEyeHint(board) {
  // 找到一个空格子，直接给出正确答案
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (board[r][c] === 0) {
        // 使用简单的方法计算正确答案
        const value = getCorrectValue(board, r, c);
        if (value > 0) {
          return { row: r, col: c, value, method: '天眼', isEye: true };
        }
      }
    }
  }
  return { error: '无法提示' };
}

// 计算某个格子的正确值
function getCorrectValue(board, row, col) {
  // 尝试每个数字
  for (let num = 1; num <= 9; num++) {
    if (isValidPlacement(board, row, col, num)) {
      // 创建临时棋盘验证
      const tempBoard = board.map(r => [...r]);
      tempBoard[row][col] = num;

      // 检查是否可解
      const puzzle = new qqwing();
      puzzle.setPuzzle(tempBoard.flat());
      if (puzzle.solve()) {
        return num;
      }
    }
  }
  return 0;
}

// 检查数字是否可以放在指定位置
function isValidPlacement(board, row, col, num) {
  // 检查行
  for (let c = 0; c < 9; c++) {
    if (board[row][c] === num) return false;
  }

  // 检查列
  for (let r = 0; r < 9; r++) {
    if (board[r][col] === num) return false;
  }

  // 检查宫
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let r = boxRow; r < boxRow + 3; r++) {
    for (let c = boxCol; c < boxCol + 3; c++) {
      if (board[r][c] === num) return false;
    }
  }

  return true;
}

// 生成数独谜题
function generateSudokuPuzzle(difficulty) {
  const difficultyRanges = {
    easy: { min: 30, max: 40, noGuess: true },    // 简单模式：不需要猜测
    medium: { min: 25, max: 29, noGuess: false },  // 中等模式：允许猜测
    hard: { min: 20, max: 24, noGuess: false },    // 困难模式：允许猜测
    expert: { min: 17, max: 22, noGuess: false }   // 地狱模式：允许猜测
  };

  const range = difficultyRanges[difficulty] || difficultyRanges.medium;
  const maxAttempts = 200;

  let bestPuzzle = null;
  let bestDiff = Infinity;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const puzzle = new qqwing();
    puzzle.generatePuzzleSymmetry(qqwing.Symmetry.RANDOM);

    // 先获取谜题
    const puzzleStr = puzzle.getPuzzleString();
    const puzzleArray = parseSudoku(puzzleStr);
    const givenCount = getGivenCount(puzzleArray);

    // 解决谜题获取正确答案
    puzzle.setRecordHistory(true);
    const solved = puzzle.solve();
    if (!solved) continue;

    // 简单模式：跳过需要猜测的谜题
    if (range.noGuess) {
      const instructions = puzzle.getSolveInstructions();
      let hasGuess = false;
      for (const inst of instructions) {
        if (inst.getType() === 5) {
          hasGuess = true;
          break;
        }
      }
      if (hasGuess) continue;
    }

    // 在 solve() 之后获取 solution
    const solutionStr = puzzle.getSolutionString();
    const solutionArray = parseSudoku(solutionStr);

    // 验证 solution 是否正确（应该没有空格）
    const solutionGivenCount = getGivenCount(solutionArray);
    if (solutionGivenCount !== 81) continue;

    if (givenCount >= range.min && givenCount <= range.max) {
      return {
        puzzle: puzzleArray,
        solution: solutionArray,
        difficulty: difficulty,
        givenCount: givenCount
      };
    }

    const mid = (range.min + range.max) / 2;
    const diff = Math.abs(givenCount - mid);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestPuzzle = {
        puzzle: puzzleArray,
        solution: solutionArray,
        difficulty: difficulty,
        givenCount: givenCount
      };
    }
  }

  return bestPuzzle;
}

const server = http.createServer((req, res) => {
  let url = req.url.split('?')[0];

  // 数独 API（支持 /api 和 /game/api 两种路径）
  if (url === '/api/sudoku/generate' || url === '/game/api/sudoku/generate') {
    const params = new URL(req.url, `http://localhost:${PORT}`).searchParams;
    const difficulty = params.get('difficulty') || 'easy';

    try {
      const result = generateSudokuPuzzle(difficulty);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 数独提示 API
  if (url === '/api/sudoku/hint' || url === '/game/api/sudoku/hint') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { board } = JSON.parse(body);
        const hint = getSudokuHint(board);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(hint || { error: '无法推理出下一步' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 静态文件服务
  if (url === '/' || url === '/game' || url === '/game/') url = '/index.html';
  if (url.startsWith('/game/')) url = url.slice(5);
  const filePath = path.join(__dirname, '..', 'public', url);
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); }
    else { res.writeHead(200, { 'Content-Type': contentType }); res.end(data); }
  });
});

// --- WebSocket ---
const wss = new WebSocketServer({ server });

// 房间: roomCode → { game, gameInstance, roomCode, players: Map<ws,{color}>, spectators: Set<ws>, disconnectedSlots: Set, playerColors: Map<'black'|'white', ws|null> }
const rooms = new Map();

// 数独房间: roomCode → { game: 'sudoku', puzzle, solution, board, visibleCells, players: Map<ws, {playerId, visibleCells}>, difficulty }
const sudokuRooms = new Map();

// 默契画猜房间: roomCode → DrawGuessGame instance
const drawGuessRooms = new Map();

let sessionCounter = 0;
function nextSid() { return 's' + (++sessionCounter); }

function generateRoomCode() {
  // 6位纯数字房间码（100000~999999）
  let code = '';
  for (let i = 0; i < 6; i++) code += Math.floor(Math.random() * 10);
  if (rooms.has(code) || sudokuRooms.has(code) || drawGuessRooms.has(code)) return generateRoomCode();
  return code;
}

function send(ws, data) {
  if (ws.readyState === 1) ws.send(JSON.stringify(data));
}

// 广播给房间所有人（玩家+观战者）
function broadcast(room, data, excludeWs = null) {
  for (const [pws] of room.players) { if (pws.readyState === 1 && pws !== excludeWs) send(pws, data); }
  for (const sws of room.spectators) { if (sws.readyState === 1 && sws !== excludeWs) send(sws, data); }
}

// 获取游戏状态（给新加入者同步）
function getGameState(room) {
  const g = room.gameInstance;
  const players = {};
  for (const [pws, info] of room.players) {
    const alive = pws.readyState === 1 && !room.disconnectedSlots.has(info.color);
    players[info.color] = { connected: alive, sid: pws._sid };
  }
  return {
    type: 'game_state',
    board: g.board,
    currentTurn: g.currentTurn,
    winner: g.winner,
    started: g.started,
    moveHistory: g.moveHistory,
    players,
    spectatorCount: room.spectators.size,
    disconnectedSlots: [...room.disconnectedSlots],
  };
}

// 获取观战人数
function spectatorCount(room) {
  return room.spectators.size;
}

// 销毁房间
function destroyRoom(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  for (const [pws] of room.players) { pws._roomCode = null; try { pws.close(); } catch(e){} }
  for (const sws of room.spectators) { sws._roomCode = null; try { sws.close(); } catch(e){} }
  rooms.delete(roomCode);
  console.log(`房间 ${roomCode} 已销毁`);
}

wss.on('connection', (ws) => {
  ws._sid = nextSid();
  ws._roomCode = null;
  ws._playerColor = null;
  ws._wantsRematch = false;
  console.log(`连接 ${ws._sid}`);

  ws.on('message', (raw, isBinary) => {
    // 忽略二进制消息（WebRTC 直接传输音频）
    if (isBinary) return;

    let msg;
    try { msg = JSON.parse(raw.toString()); }
    catch { send(ws, { type: 'error', message: '无效消息格式' }); return; }

    switch (msg.type) {

      // ---- 创建房间 ----
      case 'create_room': {
        // 数独房间
        if (msg.game === 'sudoku') {
          const roomCode = generateRoomCode();
          const difficulty = msg.difficulty || 'medium';

          const puzzleData = generateSudokuPuzzle(difficulty);
          const { visible1, visible2 } = generateVisibleCellsPair(puzzleData.puzzle, difficulty);

          // 调试：统计可见性
          const visible1Count = visible1.flat().filter(v => v).length;
          const visible2Count = visible2.flat().filter(v => v).length;
          const sharedCount = visible1.flat().filter((v, i) => v && visible2.flat()[i]).length;
          console.log(`数独房间 ${roomCode} 可见性统计: 玩家1=${visible1Count}, 玩家2=${visible2Count}, 共同=${sharedCount}`);

          const room = {
            game: 'sudoku',
            puzzle: puzzleData.puzzle,
            solution: puzzleData.solution,
            board: puzzleData.puzzle.map(row => [...row]),
            visibleCellsPair: { visible1, visible2 }, // 存储两个玩家的可见性
            players: new Map(),
            difficulty,
            roomCode,
            createdAt: Date.now()
          };

          // 第一个玩家使用 visible1
          room.players.set(ws, { playerId: ws._sid, playerIndex: 1 });

          sudokuRooms.set(roomCode, room);
          ws._roomCode = roomCode;
          ws._playerId = ws._sid;

          send(ws, {
            type: 'room_created',
            roomCode,
            playerId: ws._sid
          });

          console.log(`数独房间 ${roomCode} 创建，难度=${difficulty}`);
          break;
        }

        // 默契画猜房间
        if (msg.game === 'drawguess') {
          const roomCode = generateRoomCode();
          const game = new DrawGuessGame(roomCode);
          game.addPlayer(ws, ws._sid);
          drawGuessRooms.set(roomCode, game);
          ws._roomCode = roomCode;
          ws._gameType = 'drawguess';
          send(ws, { type: 'room_created', roomCode, playerId: ws._sid });
          console.log(`默契画猜房间 ${roomCode} 创建`);
          break;
        }

        // 五子棋房间
        const roomCode = generateRoomCode();
        const gameInstance = new GomokuGame();
        const room = {
          game: msg.game || 'gomoku',
          players: new Map(),
          spectators: new Set(),
          gameInstance,
          roomCode,
          disconnectedSlots: new Set(),
          score: { black: 0, white: 0 },
        };
        rooms.set(roomCode, room);
        const color = Math.random() < 0.5 ? 'black' : 'white';
        room.players.set(ws, { color });
        ws._roomCode = roomCode;
        ws._playerColor = color;
        send(ws, { type: 'room_created', roomCode, color });
        console.log(`房间 ${roomCode} 创建，房主=${color}`);
        break;
      }

      // ---- 加入房间（自动判断身份） ----
      case 'join_room': {
        const roomCode = msg.roomCode?.trim();

        // 先检查默契画猜房间
        const drawRoom = drawGuessRooms.get(roomCode);
        if (drawRoom) {
          if (drawRoom.players.size >= 2) {
            send(ws, { type: 'error', message: '房间已满' });
            return;
          }
          drawRoom.addPlayer(ws, ws._sid);
          ws._roomCode = roomCode;
          ws._gameType = 'drawguess';
          // Notify both players
          for (const [pws, info] of drawRoom.players) {
            if (pws === ws) {
              send(pws, { type: 'room_joined', roomCode, playerId: ws._sid, players: drawRoom.getState().players });
            } else {
              send(pws, { type: 'player_joined', playerId: ws._sid });
            }
          }
          console.log(`玩家加入默契画猜房间 ${roomCode}`);
          // Auto-start when both players are in
          if (drawRoom.players.size === 2) {
            setTimeout(() => {
              drawRoom.startGame('campaign');
            }, 1500);
          }
          return;
        }

        // 先检查数独房间
        const sudokuRoom = sudokuRooms.get(roomCode);
        if (sudokuRoom) {
          if (sudokuRoom.players.size >= 2) {
            send(ws, { type: 'error', message: '房间已满' });
            return;
          }

          // 第二个玩家使用 visible2
          sudokuRoom.players.set(ws, { playerId: ws._sid, playerIndex: 2 });

          ws._roomCode = roomCode;
          ws._playerId = ws._sid;

          const { visible1, visible2 } = sudokuRoom.visibleCellsPair;

          // 给第二个玩家发送游戏开始
          send(ws, {
            type: 'game_start',
            puzzle: sudokuRoom.puzzle,
            solution: sudokuRoom.solution,
            board: sudokuRoom.board,
            visibleCells: visible2,        // 玩家2能看到的
            otherVisible: visible1,        // 玩家1能看到的（用于显示问号）
            difficulty: sudokuRoom.difficulty
          });

          // 给第一个玩家发送游戏开始和 player_joined
          for (const [pws, info] of sudokuRoom.players) {
            if (pws !== ws && pws.readyState === 1) {
              send(pws, {
                type: 'game_start',
                puzzle: sudokuRoom.puzzle,
                solution: sudokuRoom.solution,
                board: sudokuRoom.board,
                visibleCells: visible1,    // 玩家1能看到的
                otherVisible: visible2,    // 玩家2能看到的（用于显示问号）
                difficulty: sudokuRoom.difficulty
              });
              // 通知第一个玩家对手已加入
              send(pws, { type: 'player_joined' });
            }
          }

          console.log(`玩家加入数独房间 ${roomCode}，双方开始游戏`);
          return;
        }

        // 五子棋房间
        const room = rooms.get(roomCode);
        if (!room) { send(ws, { type: 'error', message: '房间不存在' }); return; }

        // 检查是否重连——之前断线的玩家
        const prevColor = msg.rejoinColor;
        if (prevColor) {
          // 检查该颜色是否真的断线了（在 disconnectedSlots 中，或者原来的连接已断开）
          let canRejoin = room.disconnectedSlots.has(prevColor);

          // 如果不在 disconnectedSlots 中，检查原来的连接是否已断开
          if (!canRejoin) {
            for (const [pws, info] of room.players) {
              if (info.color === prevColor && pws.readyState !== 1) {
                canRejoin = true;
                // 清理旧连接
                room.players.delete(pws);
                // 取消断线定时器
                if (room._disconnectTimer && room._disconnectTimer[prevColor]) {
                  clearTimeout(room._disconnectTimer[prevColor]);
                  delete room._disconnectTimer[prevColor];
                }
                break;
              }
            }
          }

          if (canRejoin) {
            // 允许重连
            room.disconnectedSlots.delete(prevColor);
            room.players.set(ws, { color: prevColor });
            ws._roomCode = roomCode;
            ws._playerColor = prevColor;
            ws._wantsRematch = false;

            // 取消断线定时器
            if (room._disconnectTimer && room._disconnectTimer[prevColor]) {
              clearTimeout(room._disconnectTimer[prevColor]);
              delete room._disconnectTimer[prevColor];
            }

            send(ws, { type: 'game_state', ...getGameState(room), color: prevColor, role: 'player' });
            broadcast(room, { type: 'player_rejoined', color: prevColor }, ws);
            console.log(`房间 ${roomCode}: 玩家 ${prevColor} 重连`);
            return;
          }
        }

        // 检查是否有空位
        let emptyColor = null;
        const occupied = new Set();
        for (const [, info] of room.players) {
          if (!room.disconnectedSlots.has(info.color)) occupied.add(info.color);
        }
        // 也检查 ws 连接状态
        for (const [pws, info] of room.players) {
          if (pws.readyState !== 1 || room.disconnectedSlots.has(info.color)) {
            occupied.delete(info.color);
            // 这个位其实已经断线了
            if (!room.disconnectedSlots.has(info.color)) {
              room.disconnectedSlots.add(info.color);
              broadcast(room, { type: 'player_disconnected', color: info.color });
            }
          }
        }
        if (!occupied.has('black')) emptyColor = 'black';
        else if (!occupied.has('white')) emptyColor = 'white';

        if (emptyColor) {
          // 有空位，加入为新手
          // 先清理旧该颜色连接
          for (const [oldWs, info] of room.players) {
            if (info.color === emptyColor) {
              room.players.delete(oldWs);
              oldWs._roomCode = null;
              oldWs._playerColor = null;
              try { oldWs.close(); } catch(e){}
              break;
            }
          }
          room.players.set(ws, { color: emptyColor });
          room.disconnectedSlots.delete(emptyColor);
          ws._roomCode = roomCode;
          ws._playerColor = emptyColor;
          ws._wantsRematch = false;

          const isStarted = room.gameInstance.started;
          if (!isStarted && room.players.size === 2) {
            room.gameInstance.started = true;
          }

          send(ws, {
            type: 'game_state',
            ...getGameState(room),
            color: emptyColor,
            role: 'player',
          });
          // 新手首次加入不发 player_rejoined
          if (room.gameInstance.started) {
            // 只有在游戏进行中才可能是重连
            broadcast(room, { type: 'player_rejoined', color: emptyColor }, ws);
          }

          if (room.gameInstance.started) {
            if (!isStarted) {
              // 首个游戏开始：通知双方
              for (const [pws, info] of room.players) {
                send(pws, { type: 'game_start', color: info.color, currentTurn: room.gameInstance.currentTurn });
              }
            }
            // 游戏已在进行中 → game_state 已包含全部信息，不再发 game_start
          }
          console.log(`房间 ${roomCode}: 新手加入为 ${emptyColor}`);
          return;
        }

        // 无空位，加入观战
        room.spectators.add(ws);
        ws._roomCode = roomCode;
        ws._playerColor = null;
        send(ws, { type: 'game_state', ...getGameState(room), role: 'spectator' });
        broadcast(room, { type: 'spectator_count', count: spectatorCount(room) });
        console.log(`房间 ${roomCode}: 观战者加入，共 ${room.spectators.size} 人`);
        break;
      }

      // ---- 落子 ----
      case 'make_move': {
        const room = rooms.get(ws._roomCode);
        if (!room) { send(ws, { type: 'error', message: '你不在任何房间' }); return; }
        if (!ws._playerColor) { send(ws, { type: 'error', message: '观战者不能落子' }); return; }
        if (room.gameInstance.winner) { send(ws, { type: 'error', message: '游戏已结束' }); return; }

        const { row, col } = msg;
        const result = room.gameInstance.makeMove(row, col, ws._playerColor);
        if (!result.success) { send(ws, { type: 'error', message: result.message }); return; }

        broadcast(room, {
          type: 'move_made',
          row, col,
          player: ws._playerColor,
          currentTurn: room.gameInstance.currentTurn,
        });

        if (result.gameOver) {
          // 更新比分
          if (result.winner && result.winner !== 'draw') {
            room.score[result.winner] = (room.score[result.winner] || 0) + 1;
          }
          broadcast(room, {
            type: 'game_over',
            winner: result.winner,
            winLine: result.winLine || null,
            score: room.score
          });
        }
        break;
      }

      // ---- 聊天 ----
      case 'chat': {
        const room = rooms.get(ws._roomCode);
        if (!room) return;
        const from = ws._playerColor || '观战者';
        // 发给除自己外的所有人（玩家+观战者），避免from字段回环
        for (const [pws] of room.players) {
          if (pws !== ws && pws.readyState === 1) send(pws, { type: 'chat', message: msg.message, from });
        }
        for (const sws of room.spectators) {
          if (sws.readyState === 1) send(sws, { type: 'chat', message: msg.message, from });
        }
        break;
      }

      // ---- 语音开始通知（WebRTC 信令触发） ----
      case 'voice_start': {
        console.log(`[${ws._sid}] voice_start 收到, roomCode=${ws._roomCode}, gameType=${ws._gameType}`);
        // 检查默契画猜房间
        const drawRoom4voice = drawGuessRooms.get(ws._roomCode);
        if (drawRoom4voice) {
          let forwarded = 0;
          for (const [pws] of drawRoom4voice.players) {
            if (pws !== ws && pws.readyState === 1) {
              send(pws, { type: 'voice_start', from: ws._sid });
              forwarded++;
            }
          }
          console.log(`[${ws._sid}] 默契画猜 voice_start 转发给 ${forwarded} 人`);
          return;
        }

        // 检查数独房间
        const sudokuRoom = sudokuRooms.get(ws._roomCode);
        if (sudokuRoom) {
          for (const [pws, info] of sudokuRoom.players) {
            if (pws !== ws && pws.readyState === 1) {
              send(pws, { type: 'voice_start', from: ws._sid });
            }
          }
          console.log(`[${ws._sid}] 数独房间 voice_start 转发`);
          return;
        }

        // 五子棋房间
        const room = rooms.get(ws._roomCode);
        if (!room) return;
        for (const [pws] of room.players) {
          if (pws !== ws && pws.readyState === 1) send(pws, { type: 'voice_start', from: ws._sid });
        }
        for (const sws of room.spectators) {
          if (sws !== ws && sws.readyState === 1) send(sws, { type: 'voice_start', from: ws._sid });
        }
        console.log(`[${ws._sid}] voice_start 转发`);
        break;
      }

      // ---- 再来一局 ----
      case 'rematch': {
        const room = rooms.get(ws._roomCode);
        if (!room) return;
        if (!ws._playerColor) { send(ws, { type: 'error', message: '观战者无法重开' }); return; }
        ws._wantsRematch = true;

        let bothReady = true;
        for (const [pws] of room.players) {
          if (!pws._wantsRematch) { bothReady = false; break; }
        }
        if (bothReady && room.players.size >= 2) {
          room.gameInstance.reset();
          // 随机分配先后手
          const firstColor = Math.random() < 0.5 ? 'black' : 'white';
          room.gameInstance.currentTurn = firstColor;
          for (const [pws] of room.players) {
            pws._wantsRematch = false;
            send(pws, { type: 'game_start', color: pws._playerColor, currentTurn: firstColor });
          }
          // 通知观战者棋盘重置
          for (const sws of room.spectators) {
            if (sws.readyState === 1) send(sws, { type: 'game_state', ...getGameState(room), role: 'spectator' });
          }
          broadcast(room, { type: 'chat', message: `新一局开始！${firstColor === 'black' ? '黑棋' : '白棋'}先手`, from: '系统' });
        } else {
          for (const [pws] of room.players) {
            if (pws !== ws) send(pws, { type: 'rematch_request' });
          }
        }
        break;
      }

      // ---- 悔棋 ----
      case 'undo_request': {
        const room = rooms.get(ws._roomCode);
        if (!room) { send(ws, { type: 'error', message: '你不在任何房间' }); return; }
        if (!ws._playerColor) { send(ws, { type: 'error', message: '观战者不能悔棋' }); return; }
        if (room.gameInstance.winner) { send(ws, { type: 'error', message: '游戏已结束' }); return; }
        if (!room.gameInstance.started) { send(ws, { type: 'error', message: '游戏尚未开始' }); return; }
        if (room.gameInstance.moveHistory.length === 0) { send(ws, { type: 'error', message: '没有可悔的棋' }); return; }

        // 计算回退步数，目标是"回到申请人落子前"
        // currentTurn == 申请者 → 对手刚走，需回退 2 步（对手+自己上一手）
        // currentTurn != 申请者 → 自己刚走，回退 1 步（仅自己的）
        const g = room.gameInstance;
        const steps = g.currentTurn === ws._playerColor ? 2 : 1;
        if (g.moveHistory.length < steps) { send(ws, { type: 'error', message: `步数不足以回退${steps}步` }); return; }

        // 检查是否已有待处理请求
        if (room._pendingUndo) { send(ws, { type: 'error', message: '已有待处理的悔棋请求' }); return; }

        room._pendingUndo = { from: ws, fromColor: ws._playerColor, steps };

        // 通知对手
        for (const [pws] of room.players) {
          if (pws !== ws) send(pws, { type: 'undo_request', fromColor: ws._playerColor, steps });
        }
        broadcast(room, { type: 'chat', message: `${ws._playerColor === 'black' ? '黑棋' : '白棋'}请求悔棋（回退${steps}步）`, from: '系统' }, ws);
        break;
      }

      case 'undo_respond': {
        const room = rooms.get(ws._roomCode);
        if (!room) return;
        if (!room._pendingUndo) { send(ws, { type: 'error', message: '没有待处理的悔棋请求' }); return;
        }
        if (msg.accept) {
          const result = room.gameInstance.undoSteps(room._pendingUndo.steps);
          if (result.success) {
            broadcast(room, {
              type: 'undo_done',
              removed: result.removed,
              steps: room._pendingUndo.steps,
              currentTurn: room.gameInstance.currentTurn,
            });
            broadcast(room, { type: 'chat', message: `悔棋成功，已回退${room._pendingUndo.steps}步`, from: '系统' });
          }
        } else {
          send(room._pendingUndo.from, { type: 'undo_rejected', message: '对方拒绝了悔棋请求' });
          broadcast(room, { type: 'chat', message: '悔棋请求被拒绝', from: '系统' });
        }
        room._pendingUndo = null;
        break;
      }

      // ---- 观战者接手 ----
      case 'takeover': {
        const room = rooms.get(ws._roomCode);
        if (!room) { send(ws, { type: 'error', message: '你不在任何房间' }); return; }
        if (!room.spectators.has(ws)) { send(ws, { type: 'error', message: '只有观战者可以接手' }); return; }

        const targetColor = msg.color;
        if (!targetColor || !room.disconnectedSlots.has(targetColor)) {
          send(ws, { type: 'error', message: '该位置不可接手' }); return;
        }

        // 接手：从观战者移除，加入玩家
        room.spectators.delete(ws);
        room.disconnectedSlots.delete(targetColor);

        // 清理旧的断线连接
        for (const [oldWs, info] of room.players) {
          if (info.color === targetColor) {
            room.players.delete(oldWs);
            oldWs._roomCode = null;
            oldWs._playerColor = null;
            try { oldWs.close(); } catch(e){}
            break;
          }
        }

        room.players.set(ws, { color: targetColor });
        ws._playerColor = targetColor;
        ws._wantsRematch = false;

        send(ws, {
          type: 'takeover_success',
          color: targetColor,
          currentTurn: room.gameInstance.currentTurn,
          gameState: getGameState(room),
        });

        broadcast(room, { type: 'chat', message: `观战者接替了 ${targetColor === 'black' ? '黑棋' : '白棋'}`, from: '系统' }, ws);
        broadcast(room, { type: 'player_rejoined', color: targetColor }, ws);
        broadcast(room, { type: 'spectator_count', count: spectatorCount(room) });
        console.log(`房间 ${room.roomCode}: 观战者接手 ${targetColor}`);
        break;
      }

      // ---- WebRTC 信令转发（支持点对点） ----
      case 'webrtc_offer': {
        console.log(`[${ws._sid}] webrtc_offer → ${msg.to}, room=${ws._roomCode}`);
        // 检查默契画猜房间
        const drawRoomOffer = drawGuessRooms.get(ws._roomCode);
        if (drawRoomOffer) {
          const targetId = msg.to;
          for (const [pws] of drawRoomOffer.players) {
            if (pws._sid === targetId && pws.readyState === 1) {
              send(pws, { type: 'webrtc_offer', sdp: msg.sdp, from: ws._sid });
              console.log(`[${ws._sid}] webrtc_offer 已转发给 ${targetId}`);
              break;
            }
          }
          return;
        }

        // 检查数独房间
        const sudokuRoom = sudokuRooms.get(ws._roomCode);
        if (sudokuRoom) {
          const targetId = msg.to;
          for (const [pws, info] of sudokuRoom.players) {
            if (pws._sid === targetId && pws.readyState === 1) {
              send(pws, { type: 'webrtc_offer', sdp: msg.sdp, from: ws._sid });
              break;
            }
          }
          console.log(`[${ws._sid}] 数独 WebRTC offer → ${targetId}`);
          return;
        }

        // 五子棋房间
        const room = rooms.get(ws._roomCode);
        if (!room) return;
        const targetId = msg.to;
        for (const [pws] of room.players) {
          if (pws._sid === targetId && pws.readyState === 1) {
            send(pws, { type: 'webrtc_offer', sdp: msg.sdp, from: ws._sid });
            break;
          }
        }
        for (const sws of room.spectators) {
          if (sws._sid === targetId && sws.readyState === 1) {
            send(sws, { type: 'webrtc_offer', sdp: msg.sdp, from: ws._sid });
            break;
          }
        }
        console.log(`[${ws._sid}] WebRTC offer → ${targetId}`);
        break;
      }

      case 'webrtc_answer': {
        // 检查默契画猜房间
        const drawRoomAnswer = drawGuessRooms.get(ws._roomCode);
        if (drawRoomAnswer) {
          const targetId = msg.to;
          for (const [pws] of drawRoomAnswer.players) {
            if (pws._sid === targetId && pws.readyState === 1) {
              send(pws, { type: 'webrtc_answer', sdp: msg.sdp, from: ws._sid });
              break;
            }
          }
          return;
        }

        // 检查数独房间
        const sudokuRoom = sudokuRooms.get(ws._roomCode);
        if (sudokuRoom) {
          const targetId = msg.to;
          for (const [pws, info] of sudokuRoom.players) {
            if (pws._sid === targetId && pws.readyState === 1) {
              send(pws, { type: 'webrtc_answer', sdp: msg.sdp, from: ws._sid });
              break;
            }
          }
          console.log(`[${ws._sid}] 数独 WebRTC answer → ${targetId}`);
          return;
        }

        // 五子棋房间
        const room = rooms.get(ws._roomCode);
        if (!room) return;
        const targetId = msg.to;
        for (const [pws] of room.players) {
          if (pws._sid === targetId && pws.readyState === 1) {
            send(pws, { type: 'webrtc_answer', sdp: msg.sdp, from: ws._sid });
            break;
          }
        }
        for (const sws of room.spectators) {
          if (sws._sid === targetId && sws.readyState === 1) {
            send(sws, { type: 'webrtc_answer', sdp: msg.sdp, from: ws._sid });
            break;
          }
        }
        console.log(`[${ws._sid}] WebRTC answer → ${targetId}`);
        break;
      }

      case 'webrtc_ice_candidate': {
        // 检查默契画猜房间
        const drawRoomICE = drawGuessRooms.get(ws._roomCode);
        if (drawRoomICE) {
          const targetId = msg.to;
          for (const [pws] of drawRoomICE.players) {
            if (pws._sid === targetId && pws.readyState === 1) {
              send(pws, { type: 'webrtc_ice_candidate', candidate: msg.candidate, from: ws._sid });
              break;
            }
          }
          return;
        }
        // 检查数独房间
        const sudokuRoom = sudokuRooms.get(ws._roomCode);
        if (sudokuRoom) {
          const targetId = msg.to;
          for (const [pws, info] of sudokuRoom.players) {
            if (pws._sid === targetId && pws.readyState === 1) {
              send(pws, { type: 'webrtc_ice_candidate', candidate: msg.candidate, from: ws._sid });
              break;
            }
          }
          console.log(`[${ws._sid}] 数独 WebRTC ICE → ${targetId}`);
          return;
        }

        // 五子棋房间
        const room = rooms.get(ws._roomCode);
        if (!room) return;
        const targetId = msg.to;
        for (const [pws] of room.players) {
          if (pws._sid === targetId && pws.readyState === 1) {
            send(pws, { type: 'webrtc_ice_candidate', candidate: msg.candidate, from: ws._sid });
            break;
          }
        }
        for (const sws of room.spectators) {
          if (sws._sid === targetId && sws.readyState === 1) {
            send(sws, { type: 'webrtc_ice_candidate', candidate: msg.candidate, from: ws._sid });
            break;
          }
        }
        console.log(`[${ws._sid}] WebRTC ICE → ${targetId}`);
        break;
      }

      // ---- 数独选中格子同步 ----
      case 'cell_select': {
        const sudokuRoom = sudokuRooms.get(ws._roomCode);
        if (sudokuRoom) {
          const { row, col } = msg;
          for (const [pws, info] of sudokuRoom.players) {
            if (pws !== ws && pws.readyState === 1) {
              send(pws, { type: 'cell_select', row, col });
            }
          }
          return;
        }
        break;
      }

      // ==================== 默契画猜消息 ====================

      case 'draw_ready': {
        const drawRoom = drawGuessRooms.get(ws._roomCode);
        if (!drawRoom) break;
        const ready = drawRoom.toggleReady(ws);
        for (const [pws] of drawRoom.players) {
          send(pws, { type: 'player_ready', playerId: ws._sid, ready });
        }
        // Check if both ready
        if (drawRoom.bothReady()) {
          for (const [pws] of drawRoom.players) {
            send(pws, { type: 'both_ready' });
          }
        }
        return;
      }

      case 'draw_start': {
        const drawRoom = drawGuessRooms.get(ws._roomCode);
        if (!drawRoom) break;
        if (!drawRoom.bothReady()) {
          send(ws, { type: 'error', message: '双方都需准备' });
          return;
        }
        drawRoom.startGame(msg.mode || 'campaign');
        return;
      }

      case 'draw_stroke': {
        const drawRoom = drawGuessRooms.get(ws._roomCode);
        if (!drawRoom) { console.log('[draw_stroke] 无房间', ws._roomCode); break; }
        const result = drawRoom.addStroke(ws, { type: msg.phase, x: msg.x, y: msg.y, color: msg.color, width: msg.width });
        if (!result) console.log('[draw_stroke] addStroke 失败 phase=' + msg.phase + ' isDrawer=' + (ws === drawRoom.drawerWs) + ' gamePhase=' + drawRoom.phase);
        return;
      }

      case 'draw_clear': {
        const drawRoom = drawGuessRooms.get(ws._roomCode);
        if (!drawRoom) break;
        drawRoom.clearCanvas(ws);
        return;
      }

      case 'draw_undo': {
        const drawRoom = drawGuessRooms.get(ws._roomCode);
        if (!drawRoom) break;
        drawRoom.undoStroke(ws);
        return;
      }

      case 'draw_guess': {
        const drawRoom = drawGuessRooms.get(ws._roomCode);
        if (!drawRoom) break;
        drawRoom.submitGuess(ws, msg.text);
        return;
      }

      case 'draw_hint': {
        const drawRoom = drawGuessRooms.get(ws._roomCode);
        if (!drawRoom) break;
        const hint = drawRoom.getHint();
        if (hint) {
          send(ws, { type: 'hint_result', ...hint });
        } else {
          send(ws, { type: 'error', message: '当前不允许提示' });
        }
        return;
      }

      case 'draw_next': {
        const drawRoom = drawGuessRooms.get(ws._roomCode);
        if (!drawRoom) break;
        drawRoom.nextLevel();
        return;
      }

      case 'draw_start_infinite': {
        const drawRoom = drawGuessRooms.get(ws._roomCode);
        if (!drawRoom) break;
        drawRoom.startInfinite();
        return;
      }

      case 'draw_restart': {
        const drawRoom = drawGuessRooms.get(ws._roomCode);
        if (!drawRoom) break;
        if (drawRoom.players.size === 2) {
          drawRoom.startGame('campaign');
        }
        return;
      }

      // ==================== 数独落子同步 ====================
      case 'move_made': {
        // 检查是否是数独房间
        const sudokuRoom = sudokuRooms.get(ws._roomCode);
        if (sudokuRoom) {
          const { row, col, value } = msg;

          // 基本验证
          if (typeof row !== 'number' || typeof col !== 'number' ||
              row < 0 || row > 8 || col < 0 || col > 8 ||
              typeof value !== 'number' || value < 0 || value > 9) {
            send(ws, { type: 'error', message: '无效的落子参数' });
            return;
          }

          // 不允许修改固定格子
          if (sudokuRoom.puzzle[row][col] !== 0) {
            send(ws, { type: 'error', message: '不能修改固定格子' });
            return;
          }

          sudokuRoom.board[row][col] = value;

          for (const [pws, info] of sudokuRoom.players) {
            if (pws !== ws && pws.readyState === 1) {
              send(pws, { type: 'move_made', row, col, value });
            }
          }
          return;
        }

        // 五子棋落子
        const room = rooms.get(ws._roomCode);
        if (!room) { send(ws, { type: 'error', message: '你不在任何房间' }); return; }
        if (!ws._playerColor) { send(ws, { type: 'error', message: '观战者不能落子' }); return; }
        if (room.gameInstance.winner) { send(ws, { type: 'error', message: '游戏已结束' }); return; }

        const { row, col } = msg;
        const result = room.gameInstance.makeMove(row, col, ws._playerColor);
        if (!result.success) { send(ws, { type: 'error', message: result.message }); return; }

        broadcast(room, {
          type: 'move_made',
          row, col,
          player: ws._playerColor,
          currentTurn: room.gameInstance.currentTurn,
        });

        if (result.gameOver) {
          if (result.winner && result.winner !== 'draw') {
            room.score[result.winner] = (room.score[result.winner] || 0) + 1;
          }
          broadcast(room, {
            type: 'game_over',
            winner: result.winner,
            winLine: result.winLine || null,
            score: room.score
          });
        }
        break;
      }

      // ---- 数独游戏完成 ----
      case 'game_complete': {
        const sudokuRoom = sudokuRooms.get(ws._roomCode);
        if (sudokuRoom) {
          const { time, errors, hints } = msg;
          const grade = calculateSudokuGrade(time, errors);

          for (const [pws, info] of sudokuRoom.players) {
            if (pws.readyState === 1) {
              send(pws, { type: 'game_over', grade, time, errors, hints });
            }
          }

          console.log(`数独房间 ${ws._roomCode} 完成，等级=${grade}`);
          return;
        }
        break;
      }

      // ---- 数独重新开始 ----
      case 'restart_game': {
        const sudokuRoom = sudokuRooms.get(ws._roomCode);
        if (sudokuRoom) {
          // 生成新谜题
          const puzzleData = generateSudokuPuzzle(sudokuRoom.difficulty);
          const { visible1, visible2 } = generateVisibleCellsPair(puzzleData.puzzle, sudokuRoom.difficulty);

          // 更新房间数据
          sudokuRoom.puzzle = puzzleData.puzzle;
          sudokuRoom.solution = puzzleData.solution;
          sudokuRoom.board = puzzleData.puzzle.map(row => [...row]);
          sudokuRoom.visibleCellsPair = { visible1, visible2 };

          // 给所有玩家发送新的游戏开始
          for (const [pws, info] of sudokuRoom.players) {
            if (pws.readyState === 1) {
              const isFirstPlayer = info.playerIndex === 1;
              send(pws, {
                type: 'game_start',
                puzzle: puzzleData.puzzle,
                solution: puzzleData.solution,
                board: sudokuRoom.board,
                visibleCells: isFirstPlayer ? visible1 : visible2,
                otherVisible: isFirstPlayer ? visible2 : visible1,
                difficulty: sudokuRoom.difficulty
              });
            }
          }

          console.log(`数独房间 ${ws._roomCode} 重新开始`);
          return;
        }
        break;
      }

      // ---- 数独房间离开 ----
      case 'leave_room': {
        // 默契画猜房间
        const drawRoomLeave = drawGuessRooms.get(ws._roomCode);
        if (drawRoomLeave) {
          drawRoomLeave.removePlayer(ws);
          for (const [pws] of drawRoomLeave.players) {
            if (pws.readyState === 1) send(pws, { type: 'player_left' });
          }
          if (drawRoomLeave.players.size === 0) {
            drawRoomLeave.cleanup();
            drawGuessRooms.delete(ws._roomCode);
          }
          ws._roomCode = null;
          ws._gameType = null;
          return;
        }

        const sudokuRoom = sudokuRooms.get(ws._roomCode);
        if (sudokuRoom) {
          sudokuRoom.players.delete(ws);

          for (const [pws, info] of sudokuRoom.players) {
            if (pws.readyState === 1) {
              send(pws, { type: 'player_left' });
            }
          }

          if (sudokuRoom.players.size === 0) {
            sudokuRooms.delete(ws._roomCode);
            console.log(`数独房间 ${ws._roomCode} 已销毁`);
          }

          ws._roomCode = null;
          ws._playerId = null;
          return;
        }
        break;
      }

      // ---- 心跳 ----
      case 'ping': {
        send(ws, { type: 'pong' });
        break;
      }

      default:
        send(ws, { type: 'error', message: `未知消息类型: ${msg.type}` });
    }
  });

  // ---- 断线 ----
  ws.on('close', () => {
    console.log(`断开 ${ws._sid}`);
    const roomCode = ws._roomCode;
    if (!roomCode) return;

    // 检查默契画猜房间
    const drawRoom = drawGuessRooms.get(roomCode);
    if (drawRoom) {
      drawRoom.removePlayer(ws);
      for (const [pws] of drawRoom.players) {
        if (pws.readyState === 1) {
          send(pws, { type: 'player_left' });
        }
      }
      if (drawRoom.players.size === 0) {
        drawRoom.cleanup();
        drawGuessRooms.delete(roomCode);
        console.log(`默契画猜房间 ${roomCode} 已销毁`);
      }
      ws._roomCode = null;
      ws._gameType = null;
      return;
    }

    // 检查数独房间
    const sudokuRoom = sudokuRooms.get(roomCode);
    if (sudokuRoom) {
      sudokuRoom.players.delete(ws);

      for (const [pws, info] of sudokuRoom.players) {
        if (pws.readyState === 1) {
          send(pws, { type: 'player_left' });
        }
      }

      if (sudokuRoom.players.size === 0) {
        sudokuRooms.delete(roomCode);
        console.log(`数独房间 ${roomCode} 已销毁`);
      }

      ws._roomCode = null;
      ws._playerId = null;
      return;
    }

    // 五子棋断线
    const room = rooms.get(roomCode);
    if (!room) return;

    const wasPlayer = ws._playerColor && room.players.has(ws);
    const wasSpectator = room.spectators.has(ws);

    if (wasSpectator) {
      room.spectators.delete(ws);
      broadcast(room, { type: 'spectator_count', count: spectatorCount(room) });
    }

    if (wasPlayer) {
      const dColor = ws._playerColor;
      room.players.delete(ws);
      room._disconnectTimer = room._disconnectTimer || {};
      room._disconnectTimer[dColor] = setTimeout(() => {
        const r = rooms.get(roomCode);
        if (!r) return;
        const stillGone = ![...r.players.keys()].some(pw => pw._playerColor === dColor && pw.readyState === 1);
        if (stillGone) {
          r.disconnectedSlots.add(dColor);
          broadcast(r, { type: 'player_disconnected', color: dColor, canTakeover: true });
          broadcast(r, { type: 'chat', message: `${dColor === 'black' ? '黑棋' : '白棋'}已断线`, from: '系统' });
        }
        delete (r._disconnectTimer || {})[dColor];
      }, 2000);
    }

    ws._roomCode = null;
    ws._playerColor = null;

    setTimeout(() => maybeDestroyRoom(room), 2500);
  });

  ws.on('error', (err) => {
    console.error('WebSocket 错误:', err.message);
  });
});

function maybeDestroyRoom(room) {
  // 只有所有玩家都断线且无观战者时才销毁
  const allPlayersDisconnected = room.players.size === 0 || [...room.players.keys()].every(pws => pws.readyState !== 1);
  const noSpectators = room.spectators.size === 0 || [...room.spectators].every(sws => sws.readyState !== 1);

  if (allPlayersDisconnected && noSpectators) {
    // 延迟 60 秒销毁（给重连留时间）
    if (!room._destroyTimer) {
      room._destroyTimer = setTimeout(() => {
        const room2 = rooms.get(room.roomCode);
        if (room2) {
          const stillEmpty = room2.players.size === 0 && room2.spectators.size === 0;
          if (stillEmpty) destroyRoom(room.roomCode);
        }
        room._destroyTimer = null;
      }, 60000);
    }
  } else {
    if (room._destroyTimer) {
      clearTimeout(room._destroyTimer);
      room._destroyTimer = null;
    }
  }
}

// 定期清理（断线超过 5 分钟的空房间直接销毁）
setInterval(() => {
  for (const [code, room] of rooms) {
    const hasLivePlayer = [...room.players.keys()].some(pws => pws.readyState === 1);
    const hasLiveSpectator = [...room.spectators].some(sws => sws.readyState === 1);
    if (!hasLivePlayer && !hasLiveSpectator) {
      destroyRoom(code);
    }
  }
}, 300000);

// 服务端心跳
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.readyState === 1) ws.ping();
  });
}, 25000);

server.listen(PORT, () => {
  console.log(`游戏服务器运行在 http://localhost:${PORT}`);
  console.log('观战/重连/接手 功能已启用');
});
