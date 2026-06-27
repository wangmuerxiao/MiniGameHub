/**
 * 数独游戏主逻辑
 */

// ===== 游戏状态 =====
let puzzle = [];           // 当前谜题
let solution = [];         // 完整解答
let board = [];            // 当前玩家填写的棋盘
let fixedCells = [];       // 固定格子（谜题自带的）
let selectedCell = null;   // 当前选中的格子 {row, col}
let hintsRemaining = 3;    // 剩余提示次数
let errors = 0;            // 错误次数
let timer = 0;             // 计时器（秒）
let timerInterval = null;  // 计时器间隔
let isGameComplete = false; // 游戏是否完成
let currentDifficulty = 'easy'; // 当前难度

// ===== 页面切换 =====
function showModeSelect() {
  document.getElementById('mode-select').style.display = 'block';
  document.getElementById('difficulty-select').style.display = 'none';
  document.getElementById('game-view').style.display = 'none';
  stopTimer();
}

function showDifficultySelect() {
  document.getElementById('mode-select').style.display = 'none';
  document.getElementById('difficulty-select').style.display = 'block';
  document.getElementById('game-view').style.display = 'none';
}

function goBack() {
  // 返回游戏大厅（跳转到五子棋大厅）
  window.location.href = '/';
}

// ===== 开始游戏 =====
async function startGame(difficulty) {
  currentDifficulty = difficulty;

  // 显示加载状态
  showToast('正在生成谜题...');

  try {
    // 调用 API 生成谜题
    const response = await fetch(`/api/generate?difficulty=${difficulty}`);
    const data = await response.json();

    if (data.error) {
      showToast('生成谜题失败：' + data.error);
      return;
    }

    // 初始化游戏状态
    puzzle = data.puzzle;
    solution = data.solution;
    board = puzzle.map(row => [...row]);
    fixedCells = puzzle.map(row => row.map(cell => cell !== 0));

    // 重置游戏状态
    hintsRemaining = 3;
    errors = 0;
    timer = 0;
    isGameComplete = false;
    selectedCell = null;

    // 更新 UI
    updateDifficultyDisplay(difficulty);
    updateStats();
    renderBoard();

    // 显示游戏页面
    document.getElementById('mode-select').style.display = 'none';
    document.getElementById('difficulty-select').style.display = 'none';
    document.getElementById('game-view').style.display = 'block';

    // 启动计时器
    startTimer();

    showToast('谜题已生成，开始解题！');
  } catch (err) {
    showToast('网络错误，请重试');
    console.error(err);
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
      if (value !== 0) {
        cell.textContent = value;
      }

      // 设置样式
      if (fixedCells[row][col]) {
        cell.classList.add('sudoku-cell--fixed');
      } else if (value !== 0) {
        cell.classList.add('sudoku-cell--user');
      }

      // 点击事件
      cell.addEventListener('click', () => selectCell(row, col));

      boardEl.appendChild(cell);
    }
  }

  // 更新高亮
  updateHighlights();
}

// ===== 选择格子 =====
function selectCell(row, col) {
  selectedCell = { row, col };
  updateHighlights();
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

  // 设置数字
  board[row][col] = num;

  // 检查是否错误
  if (num !== solution[row][col]) {
    errors++;
    updateStats();
    showToast('❌ 数字错误！');
  }

  // 更新棋盘
  renderBoard();

  // 检查是否完成
  checkCompletion();
}

// ===== 擦除数字 =====
function eraseNumber() {
  if (!selectedCell || isGameComplete) return;

  const { row, col } = selectedCell;

  // 固定格子不能修改
  if (fixedCells[row][col]) return;

  // 清除数字
  board[row][col] = 0;

  // 更新棋盘
  renderBoard();
}

// ===== 获取提示 =====
function getHint() {
  if (isGameComplete) return;

  if (hintsRemaining <= 0) {
    showToast('💡 提示次数已用完！');
    return;
  }

  // 找到一个空格子
  const emptyCells = [];
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (board[row][col] === 0) {
        emptyCells.push({ row, col });
      }
    }
  }

  if (emptyCells.length === 0) {
    showToast('没有空格子了！');
    return;
  }

  // 随机选择一个空格子
  const randomIndex = Math.floor(Math.random() * emptyCells.length);
  const { row, col } = emptyCells[randomIndex];

  // 填入正确答案
  board[row][col] = solution[row][col];
  hintsRemaining--;

  // 更新 UI
  updateStats();

  // 选中这个格子
  selectedCell = { row, col };
  renderBoard();

  // 标记为提示
  const cell = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
  if (cell) {
    cell.classList.add('sudoku-cell--hint');
  }

  showToast('💡 已提示一个数字！');

  // 检查是否完成
  checkCompletion();
}

// ===== 撤销操作 =====
function undoAction() {
  if (!selectedCell || isGameComplete) return;

  const { row, col } = selectedCell;

  // 固定格子不能修改
  if (fixedCells[row][col]) return;

  // 清除数字
  board[row][col] = 0;

  // 更新棋盘
  renderBoard();
}

// ===== 重新开始 =====
function restartGame() {
  // 重置棋盘
  board = puzzle.map(row => [...row]);
  hintsRemaining = 3;
  errors = 0;
  timer = 0;
  isGameComplete = false;
  selectedCell = null;

  // 更新 UI
  updateStats();
  renderBoard();
  startTimer();

  // 隐藏完成弹窗
  document.getElementById('complete-overlay').style.display = 'none';

  showToast('游戏已重新开始！');
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

  // 游戏完成！
  isGameComplete = true;
  stopTimer();

  // 显示完成弹窗
  setTimeout(() => {
    showCompleteDialog();
  }, 300);

  return true;
}

// ===== 显示完成弹窗 =====
function showCompleteDialog() {
  const minutes = Math.floor(timer / 60);
  const seconds = timer % 60;
  const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  const difficultyNames = {
    easy: '简单',
    medium: '中等',
    hard: '困难'
  };

  document.getElementById('complete-stats').innerHTML = `
    难度：${difficultyNames[currentDifficulty]}<br>
    用时：${timeStr}<br>
    错误次数：${errors}<br>
    使用提示：${3 - hintsRemaining} 次
  `;

  document.getElementById('complete-overlay').style.display = 'flex';
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
  document.getElementById('hints-count').textContent = hintsRemaining;
  document.getElementById('errors-count').textContent = errors;
}

// ===== 更新难度显示 =====
function updateDifficultyDisplay(difficulty) {
  const difficultyNames = {
    easy: '简单',
    medium: '中等',
    hard: '困难'
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
