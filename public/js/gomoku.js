/**
 * 五子棋客户端
 * Canvas 棋盘渲染、落子交互、观战、接手、悔棋、聊天、再来一局
 */

const BOARD_SIZE = 15;
const CELL_SIZE = 35;
const MARGIN = 28;
const STONE_RADIUS = 14;
const CANVAS_SIZE = MARGIN * 2 + CELL_SIZE * (BOARD_SIZE - 1);

let myColor = null;
let myRole = null;
let currentTurn = 'black';
let boardState = [];
let gameOver = false;
let lastMove = null;
let wsDisconnected = false;
let takeoverTarget = null;
let pendingUndo = false;
let winLine = null;          // 胜利五连坐标
let winAnimFrame = null;     // 胜利动画帧 ID
let touchUsed = false;       // 触摸事件触发后短暂屏蔽 click
let stoneSound = null;       // 落子音效
let placeMode = 'quick';     // 'quick'=长按预览松手落子, 'confirm'=点击选择再点击确认
let confirmSelRow = -1;      // 确认模式已选行
let confirmSelCol = -1;      // 确认模式已选列
let voiceEnabled = false;    // 语音是否开启
let localStream = null;      // 本地麦克风流
let peerConnections = {};    // WebRTC PeerConnection 列表（peerId -> RTCPeerConnection）
let audioCtx = null;         // AudioContext（播放）

// ===== 初始化 =====
function initGomoku(color, turn, role, gameStateMsg) {
  myColor = color || null;
  myRole = role || 'player';
  currentTurn = turn || 'black';
  gameOver = false;
  lastMove = null;
  takeoverTarget = null;
  pendingUndo = false;

  // 始终重建棋盘（避免重连时旧数组残留）
  boardState = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));

  // 从 game_state 同步（重连/观战时传入）
  if (gameStateMsg && gameStateMsg.board) {
    for (let r = 0; r < BOARD_SIZE; r++)
      for (let c = 0; c < BOARD_SIZE; c++)
        boardState[r][c] = gameStateMsg.board[r][c];
    currentTurn = gameStateMsg.currentTurn || currentTurn;
    if (gameStateMsg.moveHistory && gameStateMsg.moveHistory.length > 0) {
      const last = gameStateMsg.moveHistory[gameStateMsg.moveHistory.length - 1];
      lastMove = { row: last.row, col: last.col, time: Date.now() };
    }
    gameOver = !!gameStateMsg.winner;
  }

  // 先设消息处理（确保后续消息走 handleGameMessage）
  // 统一消息入口：文本→JSON
  ws.onmessage = function(e) {
    handleGameMessage(e);
  };

  const canvas = document.getElementById('gomoku-board');
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const isMobile = window.innerWidth <= 768;
  // 棋盘大小：手机端接近屏幕宽度，桌面端也更大
  const maxSize = isMobile
    ? Math.min(window.innerWidth - 20, window.innerHeight * 0.55, 600)
    : Math.min(window.innerWidth - 40, window.innerHeight - 280, 750);
  const scale = maxSize / CANVAS_SIZE;
  canvas.style.width = `${CANVAS_SIZE * scale}px`;
  canvas.style.height = `${CANVAS_SIZE * scale}px`;

  drawBoard();
  updateRoleUI();

  // 落子音效
  if (!stoneSound) {
    stoneSound = new Audio('assets/stone.mp3');
    stoneSound.volume = 0.6;
  }

  // ---- 通用 ----
  function placeStone(row, col) {
    if (!isWsOpen()) { showToast('连接已断开'); return; }
    ws.send(JSON.stringify({ type: 'make_move', roomCode: clientRoomCode, row, col }));
  }

  // 能否落子（严格）
  function canPlace() {
    if (gameOver) return false;
    if (myRole !== 'player') return false;
    if (currentTurn !== myColor) return false;
    return true;
  }
  // 能否预览（宽松：只要是对弈玩家且游戏未结束就可以看虚影）
  function canPreview() {
    return !gameOver && myRole === 'player';
  }

  // 屏幕坐标 → 棋盘行列
  function clientToBoard(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const sx = CANVAS_SIZE / rect.width;
    const sy = CANVAS_SIZE / rect.height;
    const bx = (clientX - rect.left) * sx;
    const by = (clientY - rect.top) * sy;
    return {
      col: Math.round((bx - MARGIN) / CELL_SIZE),
      row: Math.round((by - MARGIN) / CELL_SIZE)
    };
  }

  // 行列是否合法且为空
  function isValidPos(row, col) {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE && boardState[row][col] === null;
  }

  // ======== 模式 A：快速模式（长按预览 + 松手落子） ========
  let touchSnapRow = -1, touchSnapCol = -1, touchValid = false;
  let previewTimer = null, previewVisible = false;

  const touchPreview = document.getElementById('touch-preview');
  const previewCtx = touchPreview.getContext('2d');
  const PREVIEW_SIZE = 100;
  const PREVIEW_SRC = PREVIEW_SIZE / 0.5; // 200px

  function updateSnapPos(touch) {
    const pos = clientToBoard(touch.clientX, touch.clientY);
    if (isValidPos(pos.row, pos.col)) {
      touchSnapRow = pos.row; touchSnapCol = pos.col; touchValid = true;
    } else {
      touchSnapRow = Math.max(0, Math.min(BOARD_SIZE - 1, pos.row));
      touchSnapCol = Math.max(0, Math.min(BOARD_SIZE - 1, pos.col));
      touchValid = false;
    }
    drawBoard();
    if (placeMode === 'confirm' && confirmSelRow >= 0) {
      // confirm 模式下显示已选标记
      drawConfirmMarker(confirmSelRow, confirmSelCol);
    }
    if (touchValid) drawHoverStone(touchSnapRow, touchSnapCol);
  }

  function drawTouchPreview() {
    const tx = MARGIN + touchSnapCol * CELL_SIZE;
    const ty = MARGIN + touchSnapRow * CELL_SIZE;
    const half = PREVIEW_SRC / 2;
    previewCtx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
    previewCtx.save();
    previewCtx.beginPath();
    previewCtx.arc(PREVIEW_SIZE/2, PREVIEW_SIZE/2, PREVIEW_SIZE/2 - 3, 0, Math.PI*2);
    previewCtx.clip();
    previewCtx.drawImage(canvas, tx - half, ty - half, PREVIEW_SRC, PREVIEW_SRC, 0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
    previewCtx.restore();
    const cx = PREVIEW_SIZE/2, cy = PREVIEW_SIZE/2;
    previewCtx.strokeStyle = touchValid ? 'rgba(0,191,165,0.9)' : 'rgba(255,107,107,0.8)';
    previewCtx.lineWidth = 1.5;
    previewCtx.beginPath();
    previewCtx.moveTo(cx-10,cy); previewCtx.lineTo(cx-4,cy);
    previewCtx.moveTo(cx+4,cy); previewCtx.lineTo(cx+10,cy);
    previewCtx.moveTo(cx,cy-10); previewCtx.lineTo(cx,cy-4);
    previewCtx.moveTo(cx,cy+4); previewCtx.lineTo(cx,cy+10);
    previewCtx.stroke();
    previewCtx.fillStyle = touchValid ? 'rgba(0,191,165,0.9)' : 'rgba(255,107,107,0.9)';
    previewCtx.beginPath(); previewCtx.arc(cx, cy, 3, 0, Math.PI*2); previewCtx.fill();
  }

  canvas.ontouchstart = (e) => {
    if (!canPreview()) return;
    e.preventDefault();
    touchUsed = true;
    clearTimeout(canvas._touchClearTimer);
    canvas._touchClearTimer = setTimeout(() => { touchUsed = false; }, 800);

    if (placeMode === 'confirm') {
      // === 确认模式：点击选择 → 再次点击确认 ===
      const pos = clientToBoard(e.touches[0].clientX, e.touches[0].clientY);
      if (!isValidPos(pos.row, pos.col)) return;
      if (confirmSelRow === pos.row && confirmSelCol === pos.col && canPlace()) {
        // 再次点击同一位置 → 确认落子
        confirmSelRow = -1; confirmSelCol = -1;
        drawBoard();
        placeStone(pos.row, pos.col);
      } else {
        // 选择新位置
        confirmSelRow = pos.row; confirmSelCol = pos.col;
        drawBoard();
        drawConfirmMarker(confirmSelRow, confirmSelCol);
        showToast('已选位置 ' + String.fromCharCode(65 + pos.col) + (pos.row + 1) + '，再次点击确认');
      }
      return;
    }

    // === 快速模式：长按预览 + 松手落子 ===
    updateSnapPos(e.touches[0]);
    clearTimeout(previewTimer);
    previewVisible = false;
    previewTimer = setTimeout(() => {
      previewVisible = true;
      touchPreview.style.left = e.touches[0].clientX + 'px';
      touchPreview.style.top = (e.touches[0].clientY - 72) + 'px';
      drawTouchPreview();
      touchPreview.classList.add('show');
    }, 200);
  };

  canvas.ontouchmove = (e) => {
    if (placeMode === 'confirm') {
      if (confirmSelRow < 0) return;
      e.preventDefault();
      const pos = clientToBoard(e.touches[0].clientX, e.touches[0].clientY);
      if (isValidPos(pos.row, pos.col) && (pos.row !== confirmSelRow || pos.col !== confirmSelCol)) {
        confirmSelRow = pos.row; confirmSelCol = pos.col;
        drawBoard();
        drawConfirmMarker(confirmSelRow, confirmSelCol);
      }
      return;
    }

    if (previewTimer === null) return;
    e.preventDefault();
    touchUsed = true;
    clearTimeout(canvas._touchClearTimer);
    canvas._touchClearTimer = setTimeout(() => { touchUsed = false; }, 800);
    updateSnapPos(e.touches[0]);
    if (previewVisible) {
      touchPreview.style.left = e.touches[0].clientX + 'px';
      touchPreview.style.top = (e.touches[0].clientY - 72) + 'px';
      drawTouchPreview();
    }
  };

  canvas.ontouchend = (e) => {
    touchPreview.classList.remove('show');
    if (placeMode === 'confirm') {
      // 确认模式不需要 touchend 处理（已在 touchstart 完成）
      return;
    }

    clearTimeout(previewTimer);
    previewTimer = null;
    previewVisible = false;
    touchUsed = true;
    clearTimeout(canvas._touchClearTimer);
    canvas._touchClearTimer = setTimeout(() => { touchUsed = false; }, 800);
    drawBoard();
    if (touchValid && touchSnapRow >= 0 && touchSnapCol >= 0 && canPlace()) {
      placeStone(touchSnapRow, touchSnapCol);
    } else if (touchValid && !canPlace() && currentTurn !== myColor) {
      showToast('还没轮到你哦~');
    }
    touchSnapRow = -1; touchSnapCol = -1; touchValid = false;
  };

  canvas.ontouchcancel = () => {
    clearTimeout(previewTimer);
    previewTimer = null;
    touchPreview.classList.remove('show');
    previewVisible = false;
    drawBoard();
    // confirm 模式下不清除选择
    if (placeMode !== 'confirm') {
      touchSnapRow = -1; touchSnapCol = -1; touchValid = false;
    }
  };

  // ==== 桌面端：点击落子（touchUsed 防止触摸后重复触发） ====
  canvas.onclick = (e) => {
    if (touchUsed) return;
    if (!canPlace()) { if (currentTurn !== myColor && myRole === 'player') showToast('还没轮到你哦~'); return; }
    const pos = clientToBoard(e.clientX, e.clientY);
    if (!isValidPos(pos.row, pos.col)) return;

    if (placeMode === 'confirm') {
      if (confirmSelRow === pos.row && confirmSelCol === pos.col) {
        confirmSelRow = -1; confirmSelCol = -1;
        drawBoard();
        placeStone(pos.row, pos.col);
      } else {
        confirmSelRow = pos.row; confirmSelCol = pos.col;
        drawBoard();
        drawConfirmMarker(confirmSelRow, confirmSelCol);
        showToast('已选 ' + String.fromCharCode(65 + pos.col) + (pos.row + 1) + '，再次点击确认');
      }
      return;
    }

    placeStone(pos.row, pos.col);
  };

  // ==== 悬停预览（两种模式都支持） ====
  canvas.onmousemove = (e) => {
    if (gameOver || myRole !== 'player') {
      if (canvas.dataset.hoverRow !== undefined) { delete canvas.dataset.hoverRow; delete canvas.dataset.hoverCol; drawBoard(); if (placeMode === 'confirm' && confirmSelRow >= 0) drawConfirmMarker(confirmSelRow, confirmSelCol); }
      return;
    }
    if (placeMode === 'confirm') {
      // confirm 模式：鼠标悬停显示临时预览，但不清除已选
      const pos = clientToBoard(e.clientX, e.clientY);
      if (isValidPos(pos.row, pos.col) && (canvas.dataset.hoverRow != pos.row || canvas.dataset.hoverCol != pos.col)) {
        canvas.dataset.hoverRow = pos.row; canvas.dataset.hoverCol = pos.col;
        drawBoard();
        if (confirmSelRow >= 0) drawConfirmMarker(confirmSelRow, confirmSelCol);
        // 悬停位置不等于已选位置时画虚影
        if (pos.row !== confirmSelRow || pos.col !== confirmSelCol) drawHoverStone(pos.row, pos.col);
      }
      return;
    }
    // 快速模式：原有悬停逻辑
    if (currentTurn !== myColor) {
      if (canvas.dataset.hoverRow !== undefined) { delete canvas.dataset.hoverRow; delete canvas.dataset.hoverCol; drawBoard(); }
      return;
    }
    const pos = clientToBoard(e.clientX, e.clientY);
    if (!isValidPos(pos.row, pos.col)) {
      if (canvas.dataset.hoverRow !== undefined) { delete canvas.dataset.hoverRow; delete canvas.dataset.hoverCol; drawBoard(); }
      return;
    }
    if (canvas.dataset.hoverRow != pos.row || canvas.dataset.hoverCol != pos.col) {
      canvas.dataset.hoverRow = pos.row; canvas.dataset.hoverCol = pos.col;
      drawBoard();
      drawHoverStone(pos.row, pos.col);
    }
  };

  canvas.onmouseleave = () => {
    delete canvas.dataset.hoverRow; delete canvas.dataset.hoverCol;
    drawBoard();
    if (placeMode === 'confirm' && confirmSelRow >= 0) drawConfirmMarker(confirmSelRow, confirmSelCol);
  };
  ws.onclose = () => {
    if (!gameOver) {
      wsDisconnected = true;
      appendChat('system', '🔌 连接已断开，正在重连...');
      showToast('连接已断开，正在重连...');
      stopHeartbeat();
      // 自动重连
      setTimeout(() => {
        if (clientRoomCode && !isWsOpen()) {
          reconnectAndRestore();
        }
      }, 1000);
    } else {
      stopHeartbeat();
    }
  };
  document.getElementById('chat-messages').innerHTML = '<div class="chat-msg chat-msg--system">💡 游戏开始！黑棋先手</div>';
  wsDisconnected = false;
  window.addEventListener('beforeunload', beforeUnloadHandler);
}

// ===== 同步状态 =====
function syncGameState(msg) {
  if (msg.board) {
    for (let r = 0; r < BOARD_SIZE; r++)
      for (let c = 0; c < BOARD_SIZE; c++)
        boardState[r][c] = msg.board[r][c];
  }
  currentTurn = msg.currentTurn || 'black';
  if (msg.moveHistory && msg.moveHistory.length > 0) {
    const last = msg.moveHistory[msg.moveHistory.length - 1];
    lastMove = { row: last.row, col: last.col, time: Date.now() };
    gameOver = !!msg.winner;
    // 如果游戏还在进行，清除胜利线
    if (!gameOver) winLine = null;
  } else {
    lastMove = null;
    gameOver = false;
    winLine = null;
  }

  if (msg.disconnectedSlots) {
    if (msg.disconnectedSlots.length > 0) {
      takeoverTarget = msg.disconnectedSlots[0];
      document.getElementById('takeover-btn').style.display = 'inline-flex';
    } else {
      takeoverTarget = null;
      document.getElementById('takeover-btn').style.display = 'none';
    }
  }
  if (msg.spectatorCount !== undefined) updateSpecCount(msg.spectatorCount);
  drawBoard();
  if (myRole === 'player') updateTurnIndicator(currentTurn, myColor);
}

function updateRoleUI() {
  const sb = document.getElementById('spectator-badge');
  const ti = document.getElementById('turn-indicator');
  const tb = document.getElementById('takeover-btn');
  if (myRole === 'spectator') {
    sb.style.display = 'inline-block'; ti.style.display = 'none';
    tb.style.display = takeoverTarget ? 'inline-flex' : 'none';
  } else {
    sb.style.display = 'none'; ti.style.display = 'inline-block'; tb.style.display = 'none';
  }
}

function updateSpecCount(n) {
  const el = document.getElementById('spectator-count');
  document.getElementById('spec-num').textContent = n;
  el.style.display = n > 0 ? 'inline' : 'none';
}

// 更新比分显示
function updateScore(score) {
  if (!score) return;
  const playerScoreEl = document.getElementById('player-score');
  const opponentScoreEl = document.getElementById('opponent-score');
  if (!playerScoreEl || !opponentScoreEl) return;

  if (myRole === 'player' && myColor) {
    // 玩家视角：左边是对手，右边是自己
    const opponentColor = myColor === 'black' ? 'white' : 'black';
    opponentScoreEl.textContent = score[opponentColor] || 0;
    playerScoreEl.textContent = score[myColor] || 0;
  } else {
    // 观战者视角：左边黑棋，右边白棋
    opponentScoreEl.textContent = score.black || 0;
    playerScoreEl.textContent = score.white || 0;
  }
}

// ===== 消息处理 =====
function handleGameMessage(e) {
  const msg = JSON.parse(e.data);
  switch (msg.type) {

    case 'game_state':
      myColor = msg.color || null;
      myRole = msg.role || 'spectator';
      syncGameState(msg);
      updateRoleUI();
      if (msg.role === 'spectator') { appendChat('system', '👁 你正在观战'); updatePlayerInfoForSpectator(msg); }
      else if (msg.role === 'player' && msg.color) updateOpponentInfo(msg);
      break;

    case 'game_start':
      boardState = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
      lastMove = null; gameOver = false; pendingUndo = false;
      winLine = null;
      if (winAnimFrame) { cancelAnimationFrame(winAnimFrame); winAnimFrame = null; }
      document.getElementById('victory-banner').style.display = 'none';
      confirmSelRow = -1; confirmSelCol = -1;
      myRole = 'player';
      if (msg.color) myColor = msg.color;
      currentTurn = msg.currentTurn || 'black';
      drawBoard(); updateRoleUI();
      // 更新比分名称
      if (myColor) {
        const opponentColor = myColor === 'black' ? 'white' : 'black';
        document.getElementById('opponent-score-name').textContent = opponentColor === 'black' ? '黑棋' : '白棋';
        document.getElementById('player-score-name').textContent = myColor === 'black' ? '黑棋' : '白棋';
      }
      updateTurnIndicator(currentTurn, myColor);
      document.getElementById('result-overlay').style.display = 'none';
      document.getElementById('undo-overlay').style.display = 'none';
      document.getElementById('chat-messages').innerHTML = '';
      appendChat('system', '🆕 新一局开始！黑棋先手');
      break;

    case 'move_made':
      boardState[msg.row][msg.col] = msg.player;
      currentTurn = msg.currentTurn;
      lastMove = { row: msg.row, col: msg.col, time: Date.now() };
      pendingUndo = false;
      // 播放落子音效
      if (stoneSound) { stoneSound.currentTime = 0; stoneSound.play().catch(() => {}); }
      document.getElementById('undo-overlay').style.display = 'none';
      drawBoard();
      if (myRole === 'player') updateTurnIndicator(currentTurn, myColor);
      if (msg.player !== myColor) {
        const pos = `${String.fromCharCode(65 + msg.col)}${msg.row + 1}`;
        appendChat('system', `${myRole === 'spectator' ? (msg.player === 'black' ? '黑棋' : '白棋') : '对手'}落子 ${pos}`);
      }
      break;

    case 'game_over':
      gameOver = true; pendingUndo = false;
      document.getElementById('undo-overlay').style.display = 'none';
      if (msg.winLine) {
        winLine = msg.winLine;
        startWinAnimation();
      }
      drawBoard();
      document.getElementById('takeover-btn').style.display = 'none';
      // 更新比分
      if (msg.score) {
        updateScore(msg.score);
      }
      if (myRole === 'player') {
        // 1.5s 后显示炫酷胜利标志，然后再过 1.5s 弹窗
        setTimeout(() => showVictoryBanner(msg.winner), 600);
        setTimeout(() => {
          document.getElementById('victory-banner').style.display = 'none';
          showResult(msg.winner);
        }, 2800);
      } else {
        appendChat('system', `游戏结束！${msg.winner === 'black' ? '黑棋胜' : msg.winner === 'white' ? '白棋胜' : '平局'}`);
      }
      break;

    case 'undo_request':
      appendChat('system', '🔄 对手请求悔棋');
      showToast('对手请求悔棋！');
      pendingUndo = true;
      document.getElementById('undo-overlay').style.display = 'flex';
      break;

    case 'undo_done': {
      const removed = Array.isArray(msg.removed) ? msg.removed : [msg.removed];
      for (const step of removed) {
        boardState[step.row][step.col] = null;
      }
      currentTurn = msg.currentTurn;
      // 更新 lastMove 为悔棋后棋盘上最后一步
      const remainingHistory = boardState.flatMap ? null : null; // 无法从客户端获取，设为 null
      lastMove = null;
      pendingUndo = false;
      document.getElementById('undo-overlay').style.display = 'none';
      drawBoard();
      if (myRole === 'player') updateTurnIndicator(currentTurn, myColor);
      appendChat('system', `✅ 悔棋成功，回退${msg.steps || removed.length}步！`);
      break;
    }

    case 'undo_rejected':
      pendingUndo = false;
      document.getElementById('undo-overlay').style.display = 'none';
      appendChat('system', '❌ 对方拒绝了悔棋请求');
      showToast('悔棋被拒绝');
      break;

    case 'player_disconnected':
      appendChat('system', `${msg.color === 'black' ? '黑棋' : '白棋'}已断线，等待重连或接手`);
      if (msg.canTakeover && myRole === 'spectator') { takeoverTarget = msg.color; document.getElementById('takeover-btn').style.display = 'inline-flex'; }
      break;

    case 'player_rejoined':
      appendChat('system', `${msg.color === 'black' ? '黑棋' : '白棋'}已重新加入`);
      takeoverTarget = null; document.getElementById('takeover-btn').style.display = 'none';
      break;

    case 'spectator_count': updateSpecCount(msg.count); break;

    case 'takeover_success':
      myRole = 'player'; myColor = msg.color; takeoverTarget = null;
      updateRoleUI(); updateTurnIndicator(msg.currentTurn, myColor);
      if (msg.gameState) syncGameState(msg.gameState);
      appendChat('me', `你接替了${msg.color === 'black' ? '黑棋' : '白棋'}`);
      document.getElementById('result-overlay').style.display = 'none';
      document.getElementById('player-avatar').textContent = myColor === 'black' ? '⚫' : '⚪';
      document.getElementById('player-name').textContent = '你';
      document.getElementById('player-badge').textContent = myColor === 'black' ? '黑棋' : '白棋';
      document.getElementById('player-badge').className = 'is-badge';
      break;

    case 'chat':
      if (msg.from === '系统') {
        appendChat('system', msg.message);
      } else if (msg.from === '观战者') {
        // 观战者发的消息
        appendChat('opponent', msg.message, '观战者');
        showDanmaku('观战者: ' + msg.message, '#888');
      } else if (msg.from !== myColor && msg.from !== '观战者') {
        const label = msg.from === 'black' ? '黑棋' : msg.from === 'white' ? '白棋' : msg.from;
        appendChat('opponent', msg.message, label);
        showDanmaku(label + ': ' + msg.message, msg.from === 'black' ? '#333' : '#888');
      }
      break;

    case 'rematch_request':
      appendChat('system', '🔄 对手想再来一局'); showToast('对手也想再来一局！');
      document.getElementById('result-subtitle').textContent = '对手已就绪，点击再来一局即可开始';
      break;

    case 'opponent_disconnected':
      if (!gameOver) { appendChat('system', '⚠️ 对手已断开连接'); showToast('对手已离开房间'); }
      break;

    case 'pong':
      if (typeof heartbeatMissed !== 'undefined') heartbeatMissed = 0;
      break;

    case 'error': showToast(msg.message); break;

    case 'voice_start':
      console.log('[VOICE] 收到 voice_start 消息, from=', msg.from);
      onVoiceStart(msg.from);
      break;

    case 'webrtc_offer':
      console.log('[VOICE] 收到 webrtc_offer 消息, from=', msg.from);
      handleOffer(msg.from, msg.sdp);
      break;

    case 'webrtc_answer':
      console.log('[VOICE] 收到 webrtc_answer 消息, from=', msg.from);
      handleAnswer(msg.from, msg.sdp);
      break;

    case 'webrtc_ice_candidate':
      console.log('[VOICE] 收到 webrtc_ice_candidate 消息, from=', msg.from);
      handleIceCandidate(msg.from, msg.candidate);
      break;
  }
}

// ===== 辅助 UI 更新 =====
function updatePlayerInfoForSpectator(msg) {
  const pl = msg.players || {};
  const b = pl['black'], w = pl['white'];
  document.getElementById('opponent-avatar').textContent = '⚫';
  document.getElementById('opponent-name').textContent = '黑棋' + (b && !b.connected ? ' (断线)' : '');
  document.getElementById('opponent-badge').textContent = '黑棋';
  document.getElementById('opponent-badge').className = 'is-badge';
  document.getElementById('player-avatar').textContent = '⚪';
  document.getElementById('player-name').textContent = '白棋' + (w && !w.connected ? ' (断线)' : '');
  document.getElementById('player-badge').textContent = '白棋';
  document.getElementById('player-badge').className = 'is-badge';
  updateTurnIndicator(msg.currentTurn, null);
  document.getElementById('turn-indicator').style.display = 'none';
}

function updateOpponentInfo(msg) {
  const oc = myColor === 'black' ? 'white' : 'black';
  document.getElementById('opponent-avatar').textContent = oc === 'black' ? '⚫' : '⚪';
  document.getElementById('opponent-name').textContent = '对手';
  document.getElementById('opponent-badge').textContent = oc === 'black' ? '黑棋' : '白棋';
  document.getElementById('opponent-badge').className = 'is-badge';
}

function updateTurnIndicator(turn, myClr) {
  const el = document.getElementById('turn-indicator');
  if (!myClr) { el.textContent = (turn === 'black' ? '黑棋' : '白棋') + '回合'; el.className = 'is-turn is-turn--opponent'; return; }
  const isMy = turn === myClr;
  el.textContent = isMy ? '轮到你' : '等待对手';
  el.className = `is-turn ${isMy ? 'is-turn--your' : 'is-turn--opponent'}`;
  const mb = document.getElementById('player-badge'), ob = document.getElementById('opponent-badge');
  if (mb) mb.classList.toggle('is-badge--active', isMy);
  if (ob) ob.classList.toggle('is-badge--active', !isMy);
}

function requestTakeover() {
  if (!takeoverTarget) { showToast('暂无可接手的位置'); return; }
  if (myRole !== 'spectator') { showToast('只有观战者可以接手'); return; }
  if (!isWsOpen()) { showToast('连接已断开'); return; }
  ws.send(JSON.stringify({ type: 'takeover', color: takeoverTarget, roomCode: clientRoomCode }));
}

// ===== 悔棋 =====
function requestUndo() {
  if (!isWsOpen()) { showToast('连接已断开'); return; }
  if (gameOver) { showToast('游戏已结束'); return; }
  if (myRole !== 'player') { showToast('观战者不能悔棋'); return; }
  ws.send(JSON.stringify({ type: 'undo_request', roomCode: clientRoomCode }));
  showToast('悔棋请求已发送');
}

function respondUndo(accept) {
  if (!isWsOpen()) return;
  ws.send(JSON.stringify({ type: 'undo_respond', roomCode: clientRoomCode, accept }));
  document.getElementById('undo-overlay').style.display = 'none';
  pendingUndo = false;
}

// ===== 落子模式切换 =====
function togglePlaceMode() {
  placeMode = placeMode === 'quick' ? 'confirm' : 'quick';
  confirmSelRow = -1; confirmSelCol = -1;
  const btn = document.getElementById('mode-toggle');
  if (placeMode === 'confirm') {
    btn.textContent = '👆 确认';
    btn.className = 'act-btn';
    showToast('确认模式：点击选位，再次确认落子');
  } else {
    btn.textContent = '👆';
    btn.className = 'act-btn';
    showToast('快速模式：点击/长按落子');
    showToast('快速模式：点击/长按落子');
  }
  drawBoard();
}

function drawConfirmMarker(row, col) {
  const canvas = document.getElementById('gomoku-board');
  const ctx = canvas.getContext('2d');
  const x = MARGIN + col * CELL_SIZE;
  const y = MARGIN + row * CELL_SIZE;
  const s = STONE_RADIUS + 4;
  ctx.strokeStyle = 'rgba(255, 107, 107, 0.8)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.arc(x, y, s, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

// ===== 胜利炫酷动画 =====
let _winParticles = [];
let _winStartTime = 0;

function startWinAnimation() {
  if (!winLine || winLine.length < 5) return;
  _winParticles = [];
  for (const p of winLine) {
    const cx = MARGIN + p.col * CELL_SIZE;
    const cy = MARGIN + p.row * CELL_SIZE;
    for (let i = 0; i < 14; i++) {
      _winParticles.push({
        x: cx, y: cy,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8,
        life: 1,
        decay: 0.008 + Math.random() * 0.025,
        size: 2 + Math.random() * 4,
        hue: Math.random() < 0.5 ? (30 + Math.random() * 20) : (340 + Math.random() * 20),
      });
    }
  }
  _winStartTime = Date.now();
  if (winAnimFrame) cancelAnimationFrame(winAnimFrame);
  _animateWin();
}

function _drawWinHighlight(ctx) {
  if (!winLine || winLine.length < 5) return;
  const first = winLine[0], last = winLine[winLine.length - 1];
  const x1 = MARGIN + first.col*CELL_SIZE, y1 = MARGIN + first.row*CELL_SIZE;
  const x2 = MARGIN + last.col*CELL_SIZE, y2 = MARGIN + last.row*CELL_SIZE;
  ctx.save();
  ctx.shadowColor = 'rgba(255, 215, 0, 0.7)';
  ctx.shadowBlur = 8;
  ctx.strokeStyle = 'rgba(255, 59, 48, 0.85)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();
  ctx.fillStyle = 'rgba(255, 215, 0, 0.85)';
  for (const p of winLine) {
    ctx.beginPath();
    ctx.arc(MARGIN + p.col*CELL_SIZE, MARGIN + p.row*CELL_SIZE, 4, 0, Math.PI*2);
    ctx.fill();
  }
}

function _animateWin() {
  var canvas = document.getElementById('gomoku-board');
  var ctx = canvas.getContext('2d');
  var elapsed = Date.now() - _winStartTime;

  // 重绘棋盘（含静态高亮）
  drawBoard();

  // 闪光线 + 脉冲环
  if (winLine && winLine.length >= 5) {
    var phase = elapsed / 300;
    var first = winLine[0], last = winLine[winLine.length - 1];
    var x1 = MARGIN + first.col*CELL_SIZE, y1 = MARGIN + first.row*CELL_SIZE;
    var x2 = MARGIN + last.col*CELL_SIZE, y2 = MARGIN + last.row*CELL_SIZE;
    var alpha = 0.5 + 0.5 * Math.sin(phase);
    ctx.save();
    ctx.shadowColor = 'rgba(255, 215, 0, 0.9)';
    ctx.shadowBlur = 12 + 6 * Math.sin(phase);
    ctx.strokeStyle = 'rgba(255, 215, 0, ' + alpha + ')';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
    for (var i = 0; i < winLine.length; i++) {
      var p = winLine[i];
      var px = MARGIN + p.col*CELL_SIZE, py = MARGIN + p.row*CELL_SIZE;
      var r = STONE_RADIUS + 6 + 4 * Math.sin(phase + p.row);
      ctx.strokeStyle = 'rgba(255, 215, 0, ' + (0.4 + 0.3 * Math.sin(phase + p.col)) + ')';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI*2);
      ctx.stroke();
    }
  }

  // 粒子
  for (var j = 0; j < _winParticles.length; j++) {
    var pt = _winParticles[j];
    if (pt.life <= 0) continue;
    pt.x += pt.vx;
    pt.y += pt.vy;
    pt.life -= pt.decay;
    var a = pt.life * 0.8;
    ctx.fillStyle = 'hsla(' + pt.hue + ', 100%, 60%, ' + a + ')';
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size * pt.life, 0, Math.PI*2);
    ctx.fill();
  }

  // 跑 ~2.5 秒后停止循环
  if (elapsed < 2500) {
    winAnimFrame = requestAnimationFrame(_animateWin);
  } else {
    winAnimFrame = null;
    // 最后重绘一次（清除动画残留，只留静态高亮）
    drawBoard();
  }
}

// ===== 绘制 =====
function drawBoard() {
  const canvas = document.getElementById('gomoku-board');
  const ctx = canvas.getContext('2d');
  const size = CANVAS_SIZE;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#faecd8';
  ctx.beginPath(); ctx.roundRect(MARGIN - 10, MARGIN - 10, size - MARGIN * 2 + 20, size - MARGIN * 2 + 20, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(139, 90, 43, 0.35)'; ctx.lineWidth = 0.7;
  for (let i = 0; i < BOARD_SIZE; i++) {
    const p = MARGIN + i * CELL_SIZE;
    ctx.beginPath(); ctx.moveTo(MARGIN, p); ctx.lineTo(size - MARGIN, p); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p, MARGIN); ctx.lineTo(p, size - MARGIN); ctx.stroke();
  }
  const stars = [[3,3],[3,7],[3,11],[7,3],[7,7],[7,11],[11,3],[11,7],[11,11]];
  ctx.fillStyle = 'rgba(139, 90, 43, 0.55)';
  for (const [r,c] of stars) { ctx.beginPath(); ctx.arc(MARGIN + c*CELL_SIZE, MARGIN + r*CELL_SIZE, 3, 0, Math.PI*2); ctx.fill(); }
  ctx.fillStyle = 'rgba(139, 90, 43, 0.45)'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < BOARD_SIZE; i++) {
    ctx.fillText(String.fromCharCode(65 + i), MARGIN + i*CELL_SIZE, MARGIN - 16);
    ctx.fillText(i + 1, MARGIN - 18, MARGIN + i*CELL_SIZE);
  }
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++)
      if (boardState[r] && boardState[r][c]) drawStone(ctx, r, c, boardState[r][c], false);
  if (lastMove && boardState[lastMove.row] && boardState[lastMove.row][lastMove.col]) {
    const x = MARGIN + lastMove.col*CELL_SIZE, y = MARGIN + lastMove.row*CELL_SIZE;
    ctx.strokeStyle = 'rgba(255, 215, 64, 0.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, STONE_RADIUS + 2, 0, Math.PI*2); ctx.stroke();
  }

  // 胜利五连高亮 — 交给动画函数
  if (winLine && winLine.length >= 5) {
    _drawWinHighlight(ctx);
  }
}

function drawStone(ctx, row, col, color, isHover) {
  const x = MARGIN + col*CELL_SIZE, y = MARGIN + row*CELL_SIZE;
  const r = isHover ? STONE_RADIUS*0.8 : STONE_RADIUS;
  ctx.save();
  if (color === 'black') {
    const g = ctx.createRadialGradient(x-3, y-4, r*0.1, x, y, r);
    g.addColorStop(0, '#555'); g.addColorStop(0.6, '#1a1a1a'); g.addColorStop(1, '#000');
    ctx.fillStyle = isHover ? 'rgba(0,0,0,0.35)' : g;
  } else {
    const g = ctx.createRadialGradient(x-2, y-3, r*0.1, x, y, r);
    g.addColorStop(0, '#fff'); g.addColorStop(0.5, '#f0f0f0'); g.addColorStop(1, '#c8c8c8');
    ctx.fillStyle = isHover ? 'rgba(255,255,255,0.55)' : g;
  }
  if (!isHover) {
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 3;
  }
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();

  // 虚影棋子加醒目的边框
  if (isHover) {
    ctx.strokeStyle = color === 'black' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }
  ctx.restore();
}

function drawHoverStone(row, col) {
  drawStone(document.getElementById('gomoku-board').getContext('2d'), row, col, myColor, true);
}

// ===== 炫酷胜利标志 =====
function showVictoryBanner(winner) {
  const banner = document.getElementById('victory-banner');
  const icon = document.getElementById('victory-icon');
  const text = document.getElementById('victory-text');

  banner.style.display = 'flex';
  banner.classList.add('victory-banner--show');

  if (winner === myColor) {
    icon.textContent = '🏆';
    text.textContent = 'VICTORY';
    text.style.color = '#ffd700';
    banner.style.background = 'rgba(0,0,0,0.7)';
  } else if (winner === 'draw') {
    icon.textContent = '🤝';
    text.textContent = 'DRAW';
    text.style.color = '#fff';
    banner.style.background = 'rgba(0,0,0,0.5)';
  } else {
    icon.textContent = '💪';
    text.textContent = 'DEFEAT';
    text.style.color = '#ff8a80';
    banner.style.background = 'rgba(0,0,0,0.65)';
  }

  setTimeout(() => banner.classList.remove('victory-banner--show'), 2200);
}

function showResult(winner) {
  // 停止胜利动画
  if (winAnimFrame) { cancelAnimationFrame(winAnimFrame); winAnimFrame = null; }
  winLine = null;

  const overlay = document.getElementById('result-overlay');
  overlay.style.display = 'flex';
  document.getElementById('undo-overlay').style.display = 'none';
  const icon = document.getElementById('result-icon'), title = document.getElementById('result-title'), sub = document.getElementById('result-subtitle');
  if (winner === myColor) {
    icon.textContent = '🏆'; title.textContent = '你赢了！'; title.style.color = 'var(--accent-gold)'; sub.textContent = '棋艺精湛';
  } else if (winner === 'draw') {
    icon.textContent = '🤝'; title.textContent = '平局'; title.style.color = 'var(--accent-cyan)'; sub.textContent = '棋逢对手';
  } else {
    icon.textContent = '😔'; title.textContent = '你输了'; title.style.color = 'var(--accent-pink)'; sub.textContent = '再来一局吧';
  }
  appendChat('system', `游戏结束！${winner === myColor ? '你赢了🎉' : winner === 'draw' ? '平局🤝' : '对手获胜'}`);
}

function requestRematch() {
  document.getElementById('result-overlay').style.display = 'none';
  document.getElementById('undo-overlay').style.display = 'none';
  if (isWsOpen()) ws.send(JSON.stringify({ type: 'rematch', roomCode: clientRoomCode }));
  else showToast('连接已断开');
}

function leaveGame() {
  document.getElementById('result-overlay').style.display = 'none';
  document.getElementById('game-view').style.display = 'none';
  document.getElementById('lobby').style.display = 'block';
  document.getElementById('takeover-btn').style.display = 'none';
  document.getElementById('spectator-badge').style.display = 'none';
  document.getElementById('spectator-count').style.display = 'none';
  document.getElementById('undo-overlay').style.display = 'none';
  gameOver = true; lastMove = null; clientRoomCode = null; wsDisconnected = false;
  myRole = null; myColor = null; takeoverTarget = null; pendingUndo = false;
  stopVoice();
  stopHeartbeat();
  if (ws) { ws.onmessage = null; ws.onclose = null; ws.close(); ws = null; }
  window.removeEventListener('beforeunload', beforeUnloadHandler);
  document.getElementById('chat-messages').innerHTML = '';
}

function beforeUnloadHandler(e) {
  if (isWsOpen() && !gameOver) { e.preventDefault(); e.returnValue = '游戏进行中，确定离开？'; }
}

function isWsOpen() { return ws && ws.readyState === WebSocket.OPEN && !wsDisconnected; }

function sendChat() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  if (!isWsOpen()) { showToast('连接已断开'); return; }
  ws.send(JSON.stringify({ type: 'chat', message: text, roomCode: clientRoomCode }));
  appendChat('me', text);
  input.value = '';
}

function appendChat(type, message, label, isEmoji) {
  var container = document.getElementById('chat-messages');
  var div = document.createElement('div');
  var prefix = '';
  if (type === 'me') prefix = '你: ';
  else if (type === 'opponent') prefix = (label || '对手') + ': ';

  // 构建显示内容
  var content = '';
  if (isEmoji || (typeof message === 'string' && message.indexOf('[嘿嘿]') >= 0)) {
    var plain = typeof message === 'string' ? message.replace('[嘿嘿]', '') : message;
    content = prefix + '<img src="assets/hehe.png" style="width:40px;height:auto;vertical-align:middle;" title="嘿嘿"> ' + plain;
  } else {
    content = prefix + message;
  }

  div.className = 'chat-msg chat-msg--' + (type === 'system' ? 'system' : type);
  div.innerHTML = content;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function sendQuickChat(text, isEmoji) {
  if (!isWsOpen()) { showToast('连接已断开'); return; }
  var display = text;
  if (isEmoji) {
    // 发送图片表情，消息格式包含图片标识
    display = '<img src="assets/hehe.png" style="width:48px;height:auto;vertical-align:middle;"> 嘿嘿';
  }
  ws.send(JSON.stringify({ type: 'chat', message: text, roomCode: clientRoomCode }));
  appendChat('me', text, null, isEmoji);
}

// ===== 弹幕 =====
function showDanmaku(text, color, hasEmoji) {
  const layer = document.getElementById('danmaku-layer');
  const el = document.createElement('div');
  el.className = 'danmaku-item';
  el.style.top = (10 + Math.random() * 40) + '%';
  el.style.color = color || 'var(--accent-purple)';
  if (hasEmoji || (typeof text === 'string' && text.indexOf('[嘿嘿]') >= 0)) {
    el.innerHTML = '<img src="assets/hehe.png" style="width:72px;height:auto;vertical-align:middle;margin-right:6px;">' + text.replace('[嘿嘿]', '嘿嘿');
  } else {
    el.innerHTML = text;
  }
  el.addEventListener('animationend', () => el.remove());
  layer.appendChild(el);
}

// ===== WebRTC 语音聊天（多人支持） =====
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
];

// 调试：记录远程音频元素
let remoteAudios = {};

// 切换语音开关
async function toggleVoice() {
  console.log('[VOICE] toggleVoice 被调用, voiceEnabled=', voiceEnabled);
  if (!isWsOpen()) { showToast('连接已断开'); return; }
  const btn = document.getElementById('voice-btn');
  if (voiceEnabled) {
    // 关麦：只静音，保持连接
    voiceEnabled = false;
    btn.classList.remove('voice-act--on');
    btn.style.backgroundColor = '#ff3b30';
    muteLocalAudio();
    showToast('语音已关闭');
    console.log('[WebRTC]','语音已关闭（静音）');
  } else {
    // 开麦
    voiceEnabled = true;
    btn.classList.add('voice-act--on');
    btn.style.backgroundColor = '#34c759';
    try {
      if (localStream) {
        // 已有麦克风，取消静音
        unmuteLocalAudio();
        showToast('语音已开启');
        console.log('[WebRTC]','语音已开启（取消静音）');
      } else {
        // 获取麦克风并建立连接
        await startVoice();
        showToast('语音已开启');
        console.log('[WebRTC]','语音已开启');
      }
    } catch(e) {
      voiceEnabled = false;
      btn.classList.remove('voice-act--on');
      btn.style.backgroundColor = '#ff3b30';
      showToast('无法访问麦克风: ' + e.message);
      console.log('[WebRTC]','getUserMedia 失败: ' + e.message);
    }
  }
}

// 静音本地音频
function muteLocalAudio() {
  if (localStream) {
    localStream.getTracks().forEach(track => {
      track.enabled = false;
    });
    console.log('[WebRTC]','本地音频已静音');
  }
}

// 取消静音本地音频
function unmuteLocalAudio() {
  if (localStream) {
    localStream.getTracks().forEach(track => {
      track.enabled = true;
    });
    console.log('[WebRTC]','本地音频已取消静音');
  }
}

// 开启语音：获取麦克风 + 通知所有人 + 为已知参与者创建连接
async function startVoice() {
  console.log('[VOICE] startVoice 被调用');
  console.log('[WebRTC]','请求麦克风权限...');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false
  });
  localStream = stream;
  console.log('[WebRTC]','getUserMedia 成功，音频轨道数: ' + stream.getAudioTracks().length);

  // 通知房间内所有人我已开麦
  ws.send(JSON.stringify({ type: 'voice_start', roomCode: clientRoomCode }));
  console.log('[WebRTC]','已发送 voice_start 通知');

  console.log('[WebRTC]','当前 PeerConnection 数量: ' + Object.keys(peerConnections).length);

  // 为已有的 PeerConnection 添加音轨并发起 offer
  for (const peerId in peerConnections) {
    const pc = peerConnections[peerId];
    if (pc && pc.connectionState !== 'closed') {
      try {
        stream.getTracks().forEach(track => {
          pc.addTrack(track, stream);
          console.log('[WebRTC]','addTrack 成功: ' + track.kind + ' → ' + peerId);
        });
        console.log('[WebRTC]','sender 数量 [' + peerId + ']: ' + pc.getSenders().length);
        await createAndSendOffer(peerId);
      } catch (err) {
        console.log('[WebRTC]','为 ' + peerId + ' 添加音轨失败: ' + err.message);
      }
    }
  }
}

// 为特定参与者创建 PeerConnection
function createPeerConnectionForPeer(peerId) {
  console.log('[VOICE] createPeerConnectionForPeer 被调用, peerId=', peerId);
  if (peerConnections[peerId]) {
    try { peerConnections[peerId].close(); } catch(e) {}
  }

  console.log('[WebRTC]','创建 PeerConnection for: ' + peerId);
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  // ICE candidate → 发送给对方
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('[VOICE] ICE candidate 生成, type=', event.candidate.type, 'address=', event.candidate.address);
      ws.send(JSON.stringify({
        type: 'webrtc_ice_candidate',
        candidate: event.candidate,
        to: peerId
      }));
    } else {
      console.log('[VOICE] ICE 候选者收集完成');
    }
  };

  // 收到远端音频
  pc.ontrack = (event) => {
    console.log('[WebRTC]','★ ontrack 触发，来自: ' + peerId);
    if (event.streams && event.streams[0]) {
      let audioEl = document.getElementById('remote-audio-' + peerId);
      if (!audioEl) {
        audioEl = document.createElement('audio');
        audioEl.id = 'remote-audio-' + peerId;
        audioEl.autoplay = true;
        audioEl.playsinline = true;
        audioEl.volume = 1.0;
        audioEl.muted = false; // 显式取消静音
        audioEl.style.display = 'none';
        document.body.appendChild(audioEl);
        remoteAudios[peerId] = audioEl;
        console.log('[WebRTC]','创建 audio 元素 for: ' + peerId);
      }

      // 关键：设置 srcObject 并确保不静音
      audioEl.srcObject = event.streams[0];
      audioEl.muted = false;

      const audioTracks = event.streams[0].getAudioTracks();
      console.log('[WebRTC]','remote stream 收到，音频轨道数: ' + audioTracks.length);
      if (audioTracks.length > 0) {
        console.log('[WebRTC]','音频轨道 muted: ' + audioTracks[0].muted + ', enabled: ' + audioTracks[0].enabled);
      }
      console.log('[WebRTC]','当前 audio 元素数量: ' + Object.keys(remoteAudios).length);

      // 尝试播放
      const playPromise = audioEl.play();
      if (playPromise) {
        playPromise.then(() => {
          console.log('[WebRTC]','audio.play 成功，来自: ' + peerId + '，音量: ' + audioEl.volume + '，muted: ' + audioEl.muted);
        }).catch(err => {
          console.log('[WebRTC]','audio.play 失败: ' + err.message + '，尝试用户交互后播放');
          // 如果自动播放失败，添加一次性点击监听
          const tryPlay = () => {
            audioEl.play().then(() => {
              console.log('[WebRTC]','用户交互后 audio.play 成功');
            }).catch(e => console.log('[WebRTC]','用户交互后仍失败: ' + e.message));
            document.removeEventListener('click', tryPlay);
            document.removeEventListener('touchstart', tryPlay);
          };
          document.addEventListener('click', tryPlay);
          document.addEventListener('touchstart', tryPlay);
        });
      }
    }
  };

  pc.onconnectionstatechange = () => {
    console.log('[VOICE] 连接状态变化 [' + peerId + ']: ' + pc.connectionState);
    if (pc.connectionState === 'connected') {
      console.log('[VOICE] ✓ 与 ' + peerId + ' 连接成功');
      const receivers = pc.getReceivers();
      receivers.forEach(r => {
        if (r.track.kind === 'audio') {
          console.log('[VOICE] 音频接收器: muted=' + r.track.muted + ', readyState=' + r.track.readyState);
        }
      });
    }
    if (pc.connectionState === 'failed') {
      console.log('[VOICE] ✗ 与 ' + peerId + ' 连接失败');
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log('[VOICE] ICE 状态变化 [' + peerId + ']: ' + pc.iceConnectionState);
    if (pc.iceConnectionState === 'failed') {
      console.log('[VOICE] ✗ ICE 连接失败，尝试 restart...');
      pc.restartIce();
    }
  };

  peerConnections[peerId] = pc;
  return pc;
}

// 为特定参与者创建并发送 Offer
async function createAndSendOffer(peerId) {
  const pc = peerConnections[peerId];
  if (!pc) return;
  try {
    console.log('[WebRTC]','创建 Offer → ' + peerId + '，sender数量: ' + pc.getSenders().length);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({
      type: 'webrtc_offer',
      sdp: pc.localDescription,
      to: peerId
    }));
    console.log('[WebRTC]','offer 发送完成 → ' + peerId);
  } catch (err) {
    console.log('[WebRTC]','创建 Offer 失败: ' + err.message);
  }
}

// 处理收到的 Offer
async function handleOffer(peerId, sdp) {
  console.log('[VOICE] handleOffer 被调用, peerId=', peerId);
  console.log('[WebRTC]','收到 offer，来自: ' + peerId);
  console.log('[WebRTC]','当前 PeerConnection 数量: ' + Object.keys(peerConnections).length);

  let pc = peerConnections[peerId];
  if (!pc) {
    pc = createPeerConnectionForPeer(peerId);
  }

  // 如果当前状态是 have-local-offer，说明我们也在发起连接，需要处理冲突
  if (pc.signalingState === 'have-local-offer') {
    console.log('[WebRTC]','检测到信令冲突，rollback 后处理 offer');
    try {
      await pc.setLocalDescription({ type: 'rollback' });
    } catch (e) {
      console.log('[WebRTC]','rollback 失败: ' + e.message);
    }
  }

  // 如果有本地流，添加音轨
  if (localStream) {
    localStream.getTracks().forEach(track => {
      const senders = pc.getSenders();
      const alreadyAdded = senders.some(s => s.track === track);
      if (!alreadyAdded) {
        pc.addTrack(track, localStream);
        console.log('[WebRTC]','addTrack 成功: ' + track.kind + ' → ' + peerId);
      }
    });
  }

  try {
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    console.log('[WebRTC]','Offer remoteDescription 设置成功，来自: ' + peerId);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    ws.send(JSON.stringify({
      type: 'webrtc_answer',
      sdp: pc.localDescription,
      to: peerId
    }));
    console.log('[WebRTC]','answer 发送完成 → ' + peerId);
  } catch (err) {
    console.log('[WebRTC]','处理 Offer 失败: ' + err.message);
  }
}

// 处理收到的 Answer
async function handleAnswer(peerId, sdp) {
  console.log('[WebRTC]','收到 answer，来自: ' + peerId);
  const pc = peerConnections[peerId];
  if (!pc) {
    console.log('[WebRTC]','没有找到 PeerConnection for: ' + peerId);
    return;
  }
  try {
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    console.log('[WebRTC]','Answer remoteDescription 设置成功，来自: ' + peerId);
  } catch (err) {
    console.log('[WebRTC]','处理 Answer 失败: ' + err.message);
  }
}

// 处理收到的 ICE Candidate
async function handleIceCandidate(peerId, candidate) {
  console.log('[WebRTC]','收到 ICE candidate，来自: ' + peerId);
  const pc = peerConnections[peerId];
  if (!pc) {
    console.log('[WebRTC]','没有找到 PeerConnection for: ' + peerId);
    return;
  }
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
    console.log('[WebRTC]','ICE candidate 添加成功，来自: ' + peerId);
  } catch (err) {
    console.log('[WebRTC]','添加 ICE candidate 失败: ' + err.message);
  }
}

// 对方开麦通知 → 创建 PeerConnection 准备接收音频
function onVoiceStart(peerId) {
  console.log('[VOICE] onVoiceStart 被调用, peerId=', peerId);
  console.log('[WebRTC]','收到 voice_start，来自: ' + peerId);
  console.log('[WebRTC]','当前 PeerConnection 数量: ' + Object.keys(peerConnections).length);

  // 如果已经有与该参与者的连接（任何状态），忽略重复的 voice_start
  if (peerConnections[peerId]) {
    const pc = peerConnections[peerId];
    const state = pc.connectionState;
    console.log('[WebRTC]','已存在 PeerConnection [' + peerId + ']，状态: ' + state);
    // 只在连接失败或关闭时才重新创建
    if (state === 'connected' || state === 'connecting' || state === 'new') {
      console.log('[WebRTC]','忽略重复 voice_start');
      return;
    }
    console.log('[WebRTC]','连接状态为 ' + state + '，重新创建');
  }

  appendChat('system', '🎤 对方已开麦');

  // 为该参与者创建 PeerConnection
  if (!peerConnections[peerId]) {
    createPeerConnectionForPeer(peerId);
    console.log('[WebRTC]','已创建 PeerConnection for: ' + peerId);
  }

  const pc = peerConnections[peerId];

  // 如果我已开麦，添加音轨并由我发起 offer
  if (voiceEnabled && localStream) {
    const senders = pc.getSenders();
    localStream.getTracks().forEach(track => {
      const alreadyAdded = senders.some(s => s.track === track);
      if (!alreadyAdded) {
        pc.addTrack(track, localStream);
        console.log('[WebRTC]','addTrack 成功: ' + track.kind + ' → ' + peerId);
      }
    });
    // 我已开麦，由我发起 offer（只在没有 localDescription 时）
    if (!pc.localDescription) {
      createAndSendOffer(peerId);
    } else {
      console.log('[WebRTC]','已有 localDescription，跳过创建 offer');
    }
  } else {
    // 我没开麦，回复 voice_start 让对方知道我存在
    // 但只回复一次，避免无限循环
    if (!peerConnections[peerId]._voiceStartSent) {
      peerConnections[peerId]._voiceStartSent = true;
      ws.send(JSON.stringify({ type: 'voice_start', roomCode: clientRoomCode }));
      console.log('[WebRTC]','回复 voice_start（等待接收音频）');
    }
  }
}

// 停止语音（退出游戏时调用）
function stopVoice() {
  console.log('[WebRTC]','停止语音...');
  // 关闭所有 PeerConnection
  for (const peerId in peerConnections) {
    try {
      peerConnections[peerId].close();
      console.log('[WebRTC]','PeerConnection 已关闭: ' + peerId);
    } catch(e) {}
  }
  peerConnections = {};

  // 停止本地音频
  if (localStream) {
    localStream.getTracks().forEach(track => {
      track.stop();
      console.log('[WebRTC]','本地音频轨道已停止');
    });
    localStream = null;
  }

  // 清理所有远程音频元素
  document.querySelectorAll('[id^="remote-audio-"]').forEach(el => el.remove());
  remoteAudios = {};
  console.log('[WebRTC]','已清理所有远程音频元素');

  voiceEnabled = false;
  console.log('[WebRTC]','语音已完全停止');
}


// ===== 后台保活与重连 =====
document.addEventListener('visibilitychange', function() {
  if (!document.hidden && ws && ws.readyState !== WebSocket.OPEN && clientRoomCode) {
    // 回前台时如果断线了，自动重连
    showToast('正在重连...');
    reconnectAndRestore();
  }
});

// 重连并恢复状态
async function reconnectAndRestore() {
  try {
    // 保存当前语音状态和游戏状态
    const wasVoiceEnabled = voiceEnabled;
    const savedMyColor = myColor;
    const savedMyRole = myRole;

    // 关闭旧的 WebRTC 连接
    for (const peerId in peerConnections) {
      try { peerConnections[peerId].close(); } catch(e) {}
    }
    peerConnections = {};

    // 重新连接 WebSocket
    await connectWS();

    // 重新设置消息处理
    ws.onmessage = function(e) {
      handleGameMessage(e);
    };

    // 重新设置断线处理（关键！）
    ws.onclose = () => {
      if (!gameOver) {
        wsDisconnected = true;
        appendChat('system', '🔌 连接已断开，正在重连...');
        showToast('连接已断开，正在重连...');
        stopHeartbeat();
        // 自动重连
        setTimeout(() => {
          if (clientRoomCode && !isWsOpen()) {
            reconnectAndRestore();
          }
        }, 1000);
      } else {
        stopHeartbeat();
      }
    };

    wsDisconnected = false;

    // 重新加入房间，带上之前的颜色信息（用于重连）
    const joinMsg = { type: 'join_room', roomCode: clientRoomCode };
    if (savedMyColor && savedMyRole === 'player') {
      joinMsg.rejoinColor = savedMyColor;
    }
    ws.send(JSON.stringify(joinMsg));

    showToast('重连成功');

    // 如果之前开了语音，重新建立语音连接
    if (wasVoiceEnabled && localStream) {
      console.log('[WebRTC] 重连后恢复语音连接');
      // 通知房间内所有人我已开麦
      ws.send(JSON.stringify({ type: 'voice_start', roomCode: clientRoomCode }));
    } else if (wasVoiceEnabled) {
      // 如果之前开了麦克风但没有本地流，重新获取
      try {
        await startVoice();
      } catch(e) {
        console.error('[WebRTC] 重连后恢复麦克风失败:', e);
      }
    }
  } catch(e) {
    showToast('重连失败，请刷新页面');
    console.error('重连失败:', e);
  }
}
