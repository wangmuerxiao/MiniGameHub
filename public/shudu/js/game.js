/**
 * 数独游戏主逻辑
 * 支持单人模式和双人协作模式
 */

// ===== 游戏状态 =====
let puzzle = [];           // 当前谜题（完整）
let solution = [];         // 完整解答
let board = [];            // 当前玩家填写的棋盘
let fixedCells = [];       // 固定格子（谜题自带的）
let visibleCells = [];     // 可见格子（协作模式：该玩家能看到的格子）
let otherVisible = [];     // 对方可见格子（用于显示问号）
let selectedCell = null;   // 当前选中的格子 {row, col}
let otherSelectedCell = null; // 对方选中的格子 {row, col}
let hintsUsed = 0;         // 已使用提示次数
let errors = 0;            // 错误次数
let timer = 0;             // 计时器（秒）
let timerInterval = null;  // 计时器间隔
let isGameComplete = false; // 游戏是否完成
let currentDifficulty = 'easy'; // 当前难度
let history = [];          // 操作历史记录

// ===== 游戏模式 =====
let gameMode = 'single';   // 'single' 或 'coop'
let ws = null;             // WebSocket 连接
let roomCode = null;       // 房间码
let playerId = null;       // 玩家 ID
let hintsUnlimited = false; // 是否解锁无限提示

// ===== WebSocket 连接 =====
const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${protocol}//${location.host}/game/ws`;

// ===== 心跳保活 =====
let heartbeatTimer = null;
let heartbeatMissed = 0;
const HEARTBEAT_INTERVAL = 15000;
const HEARTBEAT_MAX_MISS = 3;

function startHeartbeat() {
  stopHeartbeat();
  heartbeatMissed = 0;
  heartbeatTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      heartbeatMissed++;
      if (heartbeatMissed >= HEARTBEAT_MAX_MISS) {
        console.warn('心跳超时，连接已断开');
        ws.close();
        return;
      }
      ws.send(JSON.stringify({ type: 'ping' }));
    }
  }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  heartbeatMissed = 0;
}

// ===== 页面切换 =====
function showModeSelect() {
  document.getElementById('mode-select').style.display = 'block';
  document.getElementById('difficulty-select').style.display = 'none';
  document.getElementById('coop-select').style.display = 'none';
  document.getElementById('game-view').style.display = 'none';
  document.getElementById('complete-overlay').style.display = 'none';
  stopTimer();

  // 重置游戏状态
  isGameComplete = false;
}

function showDifficultySelect() {
  document.getElementById('mode-select').style.display = 'none';
  document.getElementById('difficulty-select').style.display = 'block';
  document.getElementById('coop-select').style.display = 'none';
  document.getElementById('game-view').style.display = 'none';
}

function showCoopSelect() {
  document.getElementById('mode-select').style.display = 'none';
  document.getElementById('difficulty-select').style.display = 'none';
  document.getElementById('coop-select').style.display = 'block';
  document.getElementById('game-view').style.display = 'none';
  showCoopLobby();
}

function showCoopLobby() {
  document.getElementById('coop-lobby').style.display = 'block';
  document.getElementById('coop-difficulty').style.display = 'none';
  document.getElementById('coop-join').style.display = 'none';
  document.getElementById('coop-waiting').style.display = 'none';
}

function showCoopDifficulty() {
  document.getElementById('coop-lobby').style.display = 'none';
  document.getElementById('coop-difficulty').style.display = 'block';
  document.getElementById('coop-join').style.display = 'none';
  document.getElementById('coop-waiting').style.display = 'none';
}

function showJoinRoom() {
  document.getElementById('coop-lobby').style.display = 'none';
  document.getElementById('coop-difficulty').style.display = 'none';
  document.getElementById('coop-join').style.display = 'block';
  document.getElementById('coop-waiting').style.display = 'none';
}

function showWaitingRoom(code) {
  document.getElementById('coop-lobby').style.display = 'none';
  document.getElementById('coop-difficulty').style.display = 'none';
  document.getElementById('coop-join').style.display = 'none';
  document.getElementById('coop-waiting').style.display = 'block';
  document.getElementById('coop-room-code-text').textContent = code;
}

// ===== 单人模式 =====
async function startSingleGame(difficulty) {
  gameMode = 'single';
  currentDifficulty = difficulty;

  // 地狱模式提示
  if (difficulty === 'expert') {
    showToast('地狱模式生成中，请耐心等待...');
  } else {
    showToast('正在生成谜题...');
  }

  try {
    const apiPath = window.location.pathname.includes('/game/') ? '/game/api/sudoku/generate' : '/api/sudoku/generate';
    const response = await fetch(`${apiPath}?difficulty=${difficulty}`);
    const data = await response.json();

    if (data.error) {
      showToast('生成谜题失败：' + data.error);
      return;
    }

    puzzle = data.puzzle;
    solution = data.solution;
    board = puzzle.map(row => [...row]);
    fixedCells = puzzle.map(row => row.map(cell => cell !== 0));
    visibleCells = fixedCells.map(row => row.map(() => true)); // 单人模式全部可见

    resetGameState();
    showGameView();
    showToast('谜题已生成，开始解题！');
  } catch (err) {
    showToast('网络错误，请重试');
    console.error(err);
  }
}

// ===== 协作模式 =====
async function createCoopRoom(difficulty) {
  gameMode = 'coop';
  currentDifficulty = difficulty;

  try {
    showToast('正在生成谜题...');
    await connectWebSocket();

    ws.onmessage = (e) => {
      handleCoopMessage(JSON.parse(e.data));
    };

    ws.send(JSON.stringify({ type: 'create_room', game: 'sudoku', difficulty }));
  } catch (err) {
    showToast('连接服务器失败');
    console.error(err);
  }
}

async function joinCoopRoom() {
  const input = document.getElementById('coop-room-input');
  const code = input.value.trim();
  if (code.length !== 6) {
    showToast('请输入6位房间码');
    return;
  }

  gameMode = 'coop';

  try {
    await connectWebSocket();

    ws.onmessage = (e) => {
      handleCoopMessage(JSON.parse(e.data));
    };

    ws.send(JSON.stringify({ type: 'join_room', roomCode: code }));
  } catch (err) {
    showToast('连接服务器失败');
    console.error(err);
  }
}

function connectWebSocket() {
  return new Promise((resolve, reject) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      resolve(ws);
      return;
    }

    ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      console.log('WebSocket 已连接');
      startHeartbeat();
      resolve(ws);
    };

    ws.onclose = () => {
      console.log('WebSocket 已断开');
      stopHeartbeat();
      if (gameMode === 'coop' && !isGameComplete) {
        showToast('连接已断开，正在重连...');
        setTimeout(() => {
          if (roomCode) {
            reconnectCoop();
          }
        }, 1000);
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket 连接失败', err);
      reject(err);
    };
  });
}

async function reconnectCoop() {
  try {
    // 清理旧的语音连接
    for (const peerId in peerConnections) {
      try { peerConnections[peerId].close(); } catch(e) {}
    }
    peerConnections = {};

    await connectWebSocket();

    ws.onmessage = (e) => {
      handleCoopMessage(JSON.parse(e.data));
    };

    ws.send(JSON.stringify({ type: 'join_room', roomCode, rejoin: true }));

    // 重连后如果之前开了语音，重新发送 voice_start
    if (voiceEnabled && localStream) {
      setTimeout(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'voice_start' }));
        }
      }, 500);
    }
  } catch (err) {
    showToast('重连失败');
  }
}

function handleCoopMessage(msg) {
  switch (msg.type) {
    case 'room_created':
      roomCode = msg.roomCode;
      playerId = msg.playerId;
      showWaitingRoom(roomCode);
      break;

    case 'game_start':
      // 游戏开始，初始化棋盘
      puzzle = msg.puzzle;
      solution = msg.solution;
      board = msg.board || puzzle.map(row => [...row]);
      fixedCells = puzzle.map(row => row.map(cell => cell !== 0));
      visibleCells = msg.visibleCells;
      otherVisible = msg.otherVisible || []; // 对方可见的格子

      // 调试：统计可见性
      const myVisibleCount = visibleCells.flat().filter(v => v).length;
      const otherVisibleCount = otherVisible.flat().filter(v => v).length;
      const fixedCount = fixedCells.flat().filter(v => v).length;
      console.log(`[DEBUG] 我的可见=${myVisibleCount}, 对方可见=${otherVisibleCount}, 已知数字=${fixedCount}`);

      resetGameState();
      showGameView();
      showToast('游戏开始！');
      break;

    case 'move_made':
      // 对手落子
      board[msg.row][msg.col] = msg.value;
      renderBoard();
      break;

    case 'cell_select':
      // 对方选中了格子
      otherSelectedCell = { row: msg.row, col: msg.col };
      updateHighlights();
      break;

    case 'game_over':
      // 游戏结束
      isGameComplete = true;
      stopTimer();
      showCompleteDialog(msg.grade, msg.time, msg.errors, msg.hints);
      break;

    case 'player_joined':
      showToast('对手已加入');
      document.getElementById('coop-players-count').textContent = '2';
      break;

    case 'player_left':
      showToast('对手已断开');
      document.getElementById('coop-players-count').textContent = '1';
      otherSelectedCell = null;
      updateHighlights();
      break;

    case 'voice_start':
      onVoiceStart(msg.from);
      break;

    case 'webrtc_offer':
      handleOffer(msg.from, msg.sdp);
      break;

    case 'webrtc_answer':
      handleAnswer(msg.from, msg.sdp);
      break;

    case 'webrtc_ice_candidate':
      handleIceCandidate(msg.from, msg.candidate);
      break;

    case 'error':
      showToast(msg.message);
      if (msg.message === '房间不存在') {
        showCoopLobby();
      }
      break;

    case 'pong':
      heartbeatMissed = 0;
      break;
  }
}

function leaveCoopRoom() {
  if (ws) {
    ws.send(JSON.stringify({ type: 'leave_room' }));
    ws.close();
    ws = null;
  }
  roomCode = null;
  showCoopLobby();
}

function copyCoopRoomCode() {
  const code = document.getElementById('coop-room-code-text').textContent;
  navigator.clipboard.writeText(code).then(() => {
    showToast('✅ 房间码已复制');
  }).catch(() => {
    showToast('复制失败，请手动复制');
  });
}

// ===== 初始化游戏状态 =====
function resetGameState() {
  hintsUsed = 0;
  errors = 0;
  timer = 0;
  isGameComplete = false;
  selectedCell = null;
  otherSelectedCell = null;
  history = [];

  updateDifficultyDisplay(currentDifficulty);
  updateStats();
  renderBoard();
  startTimer();
}

// ===== 显示游戏页面 =====
function showGameView() {
  document.getElementById('mode-select').style.display = 'none';
  document.getElementById('difficulty-select').style.display = 'none';
  document.getElementById('coop-select').style.display = 'none';
  document.getElementById('game-view').style.display = 'block';

  // 协作模式显示额外信息
  if (gameMode === 'coop') {
    document.getElementById('coop-info').style.display = 'flex';
    document.getElementById('coop-players-count').textContent = '2';
    document.getElementById('voice-section').style.display = '';
    document.getElementById('restart-btn').style.display = 'none';
    document.getElementById('back-btn').textContent = '← 退出房间';
  } else {
    document.getElementById('coop-info').style.display = 'none';
    document.getElementById('voice-section').style.display = 'none';
    document.getElementById('restart-btn').style.display = 'block';
    document.getElementById('back-btn').textContent = '← 返回';
  }
}

// ===== 渲染棋盘 =====
function renderBoard() {
  const boardEl = document.getElementById('sudoku-board');
  boardEl.innerHTML = '';

  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const cell = document.createElement('div');
      cell.className = 'sudoku-cell';
      cell.dataset.row = row;
      cell.dataset.col = col;

      const value = board[row][col];
      const isMyVisible = visibleCells[row] && visibleCells[row][col];
      const isOtherVisible = otherVisible[row] && otherVisible[row][col];
      const isFixed = fixedCells[row][col];

      if (gameMode === 'coop') {
        if (isFixed) {
          // 这是题目自带的已知数字
          if (isMyVisible) {
            // 我能看到的已知数字 - 显示数字
            cell.textContent = value;
            cell.classList.add('sudoku-cell--fixed');
          } else if (isOtherVisible) {
            // 对方能看到但我看不到的已知数字 - 显示问号
            cell.classList.add('sudoku-cell--hidden');
            cell.textContent = '?';
          } else {
            // 两人都看不到的已知数字
            if (currentDifficulty === 'expert') {
              // 地狱模式：显示问号
              cell.classList.add('sudoku-cell--hidden');
              cell.textContent = '?';
            } else {
              // 其他难度：显示空格
              cell.classList.add('sudoku-cell--empty');
            }
          }
        } else {
          // 这是用户可以填写的格子
          if (value !== 0) {
            // 用户已经填写了数字 - 对所有人都可见
            cell.textContent = value;
            cell.classList.add('sudoku-cell--user');
          }
          // 否则显示空格（可以填写）
        }
      } else {
        // 单人模式
        if (value !== 0) {
          cell.textContent = value;
        }

        if (isFixed) {
          cell.classList.add('sudoku-cell--fixed');
        } else if (value !== 0) {
          cell.classList.add('sudoku-cell--user');
        }
      }

      // 点击事件
      cell.addEventListener('click', () => selectCell(row, col));

      boardEl.appendChild(cell);
    }
  }

  updateHighlights();
}

// ===== 选择格子 =====
function selectCell(row, col) {
  selectedCell = { row, col };
  updateHighlights();

  // 协作模式：同步选中格子给对方
  if (gameMode === 'coop' && ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'cell_select', row, col }));
  }
}

// ===== 更新高亮 =====
function updateHighlights() {
  const cells = document.querySelectorAll('.sudoku-cell');

  cells.forEach(cell => {
    const r = parseInt(cell.dataset.row);
    const c = parseInt(cell.dataset.col);

    // 清除所有高亮
    cell.classList.remove(
      'sudoku-cell--selected',
      'sudoku-cell--other-selected',
      'sudoku-cell--highlighted',
      'sudoku-cell--same-number',
      'sudoku-cell--error',
      'sudoku-cell--hint'
    );

    if (selectedCell) {
      const sr = selectedCell.row;
      const sc = selectedCell.col;

      // 选中的格子
      if (r === sr && c === sc) {
        cell.classList.add('sudoku-cell--selected');
      }
      // 同行、同列、同宫高亮
      else if (r === sr || c === sc || (Math.floor(r / 3) === Math.floor(sr / 3) && Math.floor(c / 3) === Math.floor(sc / 3))) {
        cell.classList.add('sudoku-cell--highlighted');
      }

      // 相同数字高亮
      const selectedValue = board[sr][sc];
      if (selectedValue !== 0 && board[r][c] === selectedValue && !(r === sr && c === sc)) {
        cell.classList.add('sudoku-cell--same-number');
      }
    }

    // 对方选中的格子（协作模式）
    if (otherSelectedCell && gameMode === 'coop') {
      if (r === otherSelectedCell.row && c === otherSelectedCell.col) {
        cell.classList.add('sudoku-cell--other-selected');
      }
    }

    // 检查错误
    if (!fixedCells[r][c] && board[r][c] !== 0 && board[r][c] !== solution[r][c]) {
      cell.classList.add('sudoku-cell--error');
    }
  });
}

// ===== 输入数字 =====
function inputNumber(num) {
  if (!selectedCell || isGameComplete) return;

  const { row, col } = selectedCell;

  // 固定格子不能修改
  if (fixedCells[row][col]) return;

  // 记录历史
  history.push({
    row,
    col,
    oldValue: board[row][col],
    newValue: num
  });

  // 设置数字
  board[row][col] = num;

  // 协作模式：同步到服务器
  if (gameMode === 'coop' && ws) {
    ws.send(JSON.stringify({
      type: 'move_made',
      row,
      col,
      value: num
    }));
  }

  // 检查是否错误
  if (num !== solution[row][col]) {
    errors++;
    updateStats();
    showToast('❌ 数字错误！');
  }

  renderBoard();
  checkCompletion();
}

// ===== 擦除数字 =====
function eraseNumber() {
  if (!selectedCell || isGameComplete) return;

  const { row, col } = selectedCell;

  if (fixedCells[row][col]) return;

  // 记录历史
  history.push({
    row,
    col,
    oldValue: board[row][col],
    newValue: 0
  });

  board[row][col] = 0;

  // 协作模式：同步到服务器
  if (gameMode === 'coop' && ws) {
    ws.send(JSON.stringify({
      type: 'move_made',
      row,
      col,
      value: 0
    }));
  }

  renderBoard();
}

// ===== 获取提示（调用服务器 API） =====
async function getHint() {
  if (isGameComplete) return;

  // 检查提示次数
  if (!hintsUnlimited && hintsUsed >= 3) {
    showPasswordDialog();
    return;
  }

  showToast('正在获取提示...');

  try {
    const apiPath = window.location.pathname.includes('/game/') ? '/game/api/sudoku/hint' : '/api/sudoku/hint';
    const response = await fetch(apiPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ board })
    });

    const hint = await response.json();

    if (hint.error) {
      showToast('无法推理出下一步，请尝试其他方法');
      return;
    }

    const { row, col, value, method } = hint;

    // 填入正确答案
    board[row][col] = value;
    hintsUsed++;

    // 协作模式：同步到服务器
    if (gameMode === 'coop' && ws) {
      ws.send(JSON.stringify({
        type: 'move_made',
        row, col, value
      }));
    }

    updateStats();
    selectedCell = { row, col };
    renderBoard();

    // 标记为提示
    const cell = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    if (cell) {
      cell.classList.add('sudoku-cell--hint');
      // 天眼提示使用不同颜色
      if (hint.isEye) {
        cell.classList.add('sudoku-cell--eye');
      }
    }

    const posName = String.fromCharCode(65 + col) + (row + 1);
    if (hint.isEye) {
      showToast(`👁 天眼：${posName} = ${value}`);
    } else {
      showToast(`💡 ${posName} = ${value}`);
    }

    // 显示推理方法
    lastHintMethod = method;
    document.getElementById('hint-method-value').textContent = method;
    document.getElementById('hint-method').style.display = 'block';

    checkCompletion();

  } catch (err) {
    showToast('获取提示失败');
    console.error(err);
  }
}

let lastHintMethod = ''; // 保存最后一次提示的推理方法

// ===== 密码验证 =====
function showPasswordDialog() {
  document.getElementById('password-overlay').style.display = 'flex';
  document.getElementById('hint-password').value = '';
  document.getElementById('hint-password').focus();
}

function closePasswordDialog() {
  document.getElementById('password-overlay').style.display = 'none';
}

function checkPassword() {
  const password = document.getElementById('hint-password').value;
  // 从配置中读取密码，默认为 888888
  const correctPassword = window.HINT_PASSWORD || '888888';
  if (password === correctPassword) {
    hintsUnlimited = true;
    closePasswordDialog();
    showToast('✅ 密码正确，已解锁无限提示！');
    // 继续执行提示
    getHint();
  } else {
    showToast('❌ 密码错误');
  }
}

// ===== 撤销操作 =====
function undoAction() {
  if (isGameComplete || history.length === 0) {
    showToast('没有可撤销的操作');
    return;
  }

  const lastAction = history.pop();
  board[lastAction.row][lastAction.col] = lastAction.oldValue;

  // 协作模式：同步到服务器
  if (gameMode === 'coop' && ws) {
    ws.send(JSON.stringify({
      type: 'move_made',
      row: lastAction.row,
      col: lastAction.col,
      value: lastAction.oldValue
    }));
  }

  selectedCell = { row: lastAction.row, col: lastAction.col };
  renderBoard();
  showToast('↩️ 已撤销');
}

// ===== 重新开始（生成新谜题） =====
async function restartGame() {
  document.getElementById('complete-overlay').style.display = 'none';

  if (gameMode === 'coop') {
    // 协作模式：通知服务器重新生成谜题
    if (ws && ws.readyState === WebSocket.OPEN) {
      showToast('正在生成新谜题...');
      ws.send(JSON.stringify({ type: 'restart_game' }));
    } else {
      showToast('连接已断开');
      showModeSelect();
    }
    return;
  }

  // 单人模式
  showToast('正在生成新谜题...');
  try {
    await startSingleGame(currentDifficulty);
  } catch (err) {
    showToast('生成谜题失败');
    console.error(err);
  }
}

// ===== 检查解答 =====
function checkSolution() {
  if (isGameComplete) return;

  let isCorrect = true;
  let emptyCount = 0;

  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (board[row][col] === 0) {
        emptyCount++;
      } else if (board[row][col] !== solution[row][col]) {
        isCorrect = false;
      }
    }
  }

  if (emptyCount > 0) {
    showToast(`还有 ${emptyCount} 个空格子未填！`);
  } else if (isCorrect) {
    showToast('✅ 解答正确！');
  } else {
    showToast('❌ 存在错误，请检查红色格子！');
  }
}

// ===== 检查是否完成 =====
function checkCompletion() {
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (board[row][col] !== solution[row][col]) {
        return false;
      }
    }
  }

  isGameComplete = true;
  stopTimer();

  // 协作模式：通知服务器
  if (gameMode === 'coop' && ws) {
    ws.send(JSON.stringify({
      type: 'game_complete',
      time: timer,
      errors,
      hints: hintsUsed
    }));
  } else {
    // 单人模式：计算评价等级
    const grade = calculateGrade(timer, errors);
    setTimeout(() => {
      showCompleteDialog(grade, timer, errors, hintsUsed);
    }, 300);
  }

  return true;
}

// ===== 计算评价等级 =====
function calculateGrade(time, errors) {
  // 根据时间和错误次数计算等级
  // S: 时间 < 5分钟 且 错误 = 0
  // A: 时间 < 10分钟 且 错误 <= 2
  // B: 时间 < 20分钟 且 错误 <= 5
  // C: 其他

  const minutes = time / 60;

  if (minutes < 5 && errors === 0) return 'S';
  if (minutes < 10 && errors <= 2) return 'A';
  if (minutes < 20 && errors <= 5) return 'B';
  return 'C';
}

// ===== 显示完成弹窗 =====
function showCompleteDialog(grade, time, errs, hints) {
  const minutes = Math.floor(time / 60);
  const seconds = time % 60;
  const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  const difficultyNames = {
    easy: '简单',
    medium: '中等',
    hard: '困难',
    expert: '地狱'
  };

  // 设置评价图标
  const gradeIcons = { S: '🏆', A: '🎉', B: '👍', C: '💪' };
  document.getElementById('complete-icon').textContent = gradeIcons[grade] || '🎉';
  document.getElementById('complete-title').textContent = gameMode === 'coop' ? '协作完成！' : '恭喜完成！';

  // 设置统计信息
  let statsHtml = `
    <span class="grade-${grade}">${grade}</span><br>
    难度：${difficultyNames[currentDifficulty]}<br>
    用时：${timeStr}<br>
    错误次数：${errs}<br>
    使用提示：${hints} 次
  `;

  if (gameMode === 'coop') {
    statsHtml += '<br><br>🤝 双人协作完成！';
  }

  document.getElementById('complete-stats').innerHTML = statsHtml;

  // 显示再来一局按钮
  document.getElementById('restart-game-btn').style.display = 'block';
  document.getElementById('restart-game-btn').textContent = gameMode === 'coop' ? '🔄 再来一局' : '🔄 再来一局';

  document.getElementById('complete-overlay').style.display = 'flex';
}

// ===== 离开游戏 =====
function leaveGame() {
  stopVoice();
  otherSelectedCell = null;
  if (gameMode === 'coop') {
    leaveCoopRoom();
  }
  showModeSelect();
}

// ===== 计时器 =====
function startTimer() {
  stopTimer();
  timer = 0;
  updateTimerDisplay();

  timerInterval = setInterval(() => {
    timer++;
    updateTimerDisplay();
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function updateTimerDisplay() {
  const minutes = Math.floor(timer / 60);
  const seconds = timer % 60;
  document.getElementById('timer').textContent =
    `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// ===== 更新统计信息 =====
function updateStats() {
  document.getElementById('hints-count').textContent = hintsUsed;
  document.getElementById('errors-count').textContent = errors;
}

// ===== 更新难度显示 =====
function updateDifficultyDisplay(difficulty) {
  const difficultyNames = {
    easy: '简单',
    medium: '中等',
    hard: '困难',
    expert: '地狱'
  };

  document.getElementById('game-difficulty').textContent = difficultyNames[difficulty] || '简单';
}

// ===== Toast 通知 =====
let toastTimer;
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast toast--show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.className = 'toast';
  }, 2500);
}

// ===== 语音功能（WebRTC） =====
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.miwifi.com:3478' },
  { urls: 'stun:stun.chat.bilibili.com:3478' },
  { urls: 'stun:stun.hitv.com:3478' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
];

let voiceEnabled = false;
let localStream = null;
let peerConnections = {};
let remoteAudios = {};

function toggleVoice() {
  if (!isWsOpen()) { showToast('连接已断开'); return; }
  const btn = document.getElementById('voice-section');
  if (voiceEnabled) {
    voiceEnabled = false;
    btn.textContent = '🎤 语音';
    btn.classList.remove('voice-btn--active');
    muteLocalAudio();
    showToast('语音已关闭');
  } else {
    voiceEnabled = true;
    btn.textContent = '🎤 语音';
    btn.classList.add('voice-btn--active');
    if (localStream) {
      unmuteLocalAudio();
      showToast('语音已开启');
    } else {
      startVoice().then(() => {
        showToast('语音已开启');
      }).catch(err => {
        voiceEnabled = false;
        btn.textContent = '🎤 语音';
        btn.classList.remove('voice-btn--active');
        showToast('无法访问麦克风');
        console.error(err);
      });
    }
  }
}

function muteLocalAudio() {
  if (localStream) {
    localStream.getTracks().forEach(track => { track.enabled = false; });
  }
}

function unmuteLocalAudio() {
  if (localStream) {
    localStream.getTracks().forEach(track => { track.enabled = true; });
  }
}

async function startVoice() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false
  });
  localStream = stream;

  // 通知服务器
  if (ws) {
    ws.send(JSON.stringify({ type: 'voice_start' }));
  }

  // 为已有的 PeerConnection 添加音轨
  for (const peerId in peerConnections) {
    const pc = peerConnections[peerId];
    if (pc && pc.connectionState !== 'closed') {
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });
      await createAndSendOffer(peerId);
    }
  }
}

function createPeerConnectionForPeer(peerId) {
  if (peerConnections[peerId]) {
    try { peerConnections[peerId].close(); } catch(e) {}
  }

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  pc.onicecandidate = (event) => {
    if (event.candidate && ws) {
      ws.send(JSON.stringify({
        type: 'webrtc_ice_candidate',
        candidate: event.candidate,
        to: peerId
      }));
    }
  };

  pc.ontrack = (event) => {
    if (event.streams && event.streams[0]) {
      let audioEl = document.getElementById('remote-audio-' + peerId);
      if (!audioEl) {
        audioEl = document.createElement('audio');
        audioEl.id = 'remote-audio-' + peerId;
        audioEl.autoplay = true;
        audioEl.playsinline = true;
        audioEl.volume = 1.0;
        audioEl.muted = false;
        audioEl.style.display = 'none';
        document.body.appendChild(audioEl);
        remoteAudios[peerId] = audioEl;
      }
      audioEl.srcObject = event.streams[0];
      audioEl.play().then(() => {
        console.log('[WebRTC] 远程音频播放成功');
      }).catch(err => {
        console.warn('[WebRTC] 自动播放失败，等待用户交互:', err);
        showToast('🎤 点击页面任意位置以开启语音播放');
        const tryPlay = () => {
          audioEl.play().then(() => {
            console.log('[WebRTC] 用户交互后音频播放成功');
          }).catch(() => {});
          document.removeEventListener('click', tryPlay);
          document.removeEventListener('touchstart', tryPlay);
        };
        document.addEventListener('click', tryPlay);
        document.addEventListener('touchstart', tryPlay);
      });
    }
  };

  pc.onconnectionstatechange = () => {
    console.log('[WebRTC] 连接状态 [' + peerId + ']:', pc.connectionState);
    if (pc.connectionState === 'failed') {
      pc.restartIce();
    }
  };

  peerConnections[peerId] = pc;
  return pc;
}

async function createAndSendOffer(peerId) {
  const pc = peerConnections[peerId];
  if (!pc) return;
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({
      type: 'webrtc_offer',
      sdp: pc.localDescription,
      to: peerId
    }));
  } catch (err) {
    console.error('[WebRTC] 创建 Offer 失败:', err);
  }
}

async function handleOffer(peerId, sdp) {
  let pc = peerConnections[peerId];
  if (!pc) {
    pc = createPeerConnectionForPeer(peerId);
  }

  // 处理信令冲突
  if (pc.signalingState === 'have-local-offer') {
    try {
      await pc.setLocalDescription({ type: 'rollback' });
    } catch (e) {}
  }

  // 如果有本地流，添加音轨
  if (localStream) {
    localStream.getTracks().forEach(track => {
      const senders = pc.getSenders();
      if (!senders.some(s => s.track === track)) {
        pc.addTrack(track, localStream);
      }
    });
  }

  try {
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    ws.send(JSON.stringify({
      type: 'webrtc_answer',
      sdp: pc.localDescription,
      to: peerId
    }));
  } catch (err) {
    console.error('[WebRTC] 处理 Offer 失败:', err);
  }
}

async function handleAnswer(peerId, sdp) {
  const pc = peerConnections[peerId];
  if (!pc) return;
  try {
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  } catch (err) {
    console.error('[WebRTC] 处理 Answer 失败:', err);
  }
}

async function handleIceCandidate(peerId, candidate) {
  const pc = peerConnections[peerId];
  if (!pc) return;
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (err) {
    console.error('[WebRTC] 添加 ICE candidate 失败:', err);
  }
}

function onVoiceStart(peerId) {
  // 如果已经有活跃连接，忽略
  if (peerConnections[peerId]) {
    const state = peerConnections[peerId].connectionState;
    if (state === 'connected' || state === 'connecting' || state === 'new') {
      return;
    }
    // 连接已失败或关闭，清理后重建
    if (state === 'failed' || state === 'closed' || state === 'disconnected') {
      try { peerConnections[peerId].close(); } catch(e) {}
      delete peerConnections[peerId];
    }
  }

  showToast('🎤 对方已开麦');

  // 创建 PeerConnection
  if (!peerConnections[peerId]) {
    createPeerConnectionForPeer(peerId);
  }

  const pc = peerConnections[peerId];

  // 如果我已开麦，添加音轨并发起 offer
  if (voiceEnabled && localStream) {
    localStream.getTracks().forEach(track => {
      if (!pc.getSenders().some(s => s.track === track)) {
        pc.addTrack(track, localStream);
      }
    });
    if (!pc.localDescription) {
      createAndSendOffer(peerId);
    }
  } else {
    // 我没开麦，回复 voice_start
    if (!pc._voiceStartSent) {
      pc._voiceStartSent = true;
      ws.send(JSON.stringify({ type: 'voice_start' }));
    }
  }
}

function stopVoice() {
  for (const peerId in peerConnections) {
    try { peerConnections[peerId].close(); } catch(e) {}
  }
  peerConnections = {};

  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  for (const peerId in remoteAudios) {
    if (remoteAudios[peerId]) {
      remoteAudios[peerId].srcObject = null;
    }
  }
  remoteAudios = {};

  voiceEnabled = false;
}

function isWsOpen() {
  return ws && ws.readyState === WebSocket.OPEN;
}

// ===== 键盘事件 =====
document.addEventListener('keydown', (e) => {
  if (isGameComplete) return;

  // 数字键 1-9
  if (e.key >= '1' && e.key <= '9') {
    inputNumber(parseInt(e.key));
    return;
  }

  // 删除键
  if (e.key === 'Delete' || e.key === 'Backspace') {
    eraseNumber();
    return;
  }

  // 方向键
  if (selectedCell) {
    let { row, col } = selectedCell;

    switch (e.key) {
      case 'ArrowUp':
        row = Math.max(0, row - 1);
        break;
      case 'ArrowDown':
        row = Math.min(8, row + 1);
        break;
      case 'ArrowLeft':
        col = Math.max(0, col - 1);
        break;
      case 'ArrowRight':
        col = Math.min(8, col + 1);
        break;
      default:
        return;
    }

    selectCell(row, col);
  }
});

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', () => {
  showModeSelect();
});
