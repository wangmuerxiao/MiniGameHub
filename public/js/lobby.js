/**
 * 游戏大厅逻辑
 * 房间创建/加入、WebSocket 连接管理、UI 过渡
 */

// ===== WebSocket 连接 =====
const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${protocol}//${location.host}/game/ws`;
let ws = null;
let currentGame = null;
let clientRoomCode = null;  // 客户端存储的房间码
let heartbeatTimer = null;   // 心跳定时器
let heartbeatMissed = 0;     // 连续丢包计数
const HEARTBEAT_INTERVAL = 15000;  // 15 秒发一次 ping
const HEARTBEAT_MAX_MISS = 3;      // 连续丢 3 次判定断开

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

function connectWS() {
  stopHeartbeat();
  // 清理旧连接
  if (ws) {
    try { ws.close(); } catch(e) {}
    ws = null;
  }
  return new Promise((resolve, reject) => {
    ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      console.log('WebSocket 已连接');
      startHeartbeat();
      resolve(ws);
    };

    // 注意：不在这里设置 ws.onclose，由调用者设置

    ws.onerror = (err) => {
      console.error('WebSocket 连接失败', err);
      stopHeartbeat();
      reject(err);
    };
  });
}

// ===== 粒子背景 =====
(function initParticles() {
  const canvas = document.getElementById('particles');
  const ctx = canvas.getContext('2d');
  let particles = [];
  let animId;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  class Particle {
    constructor() {
      this.reset();
    }
    reset() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.size = Math.random() * 2 + 0.5;
      this.speedX = (Math.random() - 0.5) * 0.5;
      this.speedY = (Math.random() - 0.5) * 0.5;
      this.opacity = Math.random() * 0.4 + 0.1;
    }
    update() {
      this.x += this.speedX;
      this.y += this.speedY;
      if (this.x < -10 || this.x > canvas.width + 10 || this.y < -10 || this.y > canvas.height + 10) {
        this.reset();
        // 让粒子从边缘重新出现
        if (Math.random() > 0.5) {
          this.x = Math.random() * canvas.width;
          this.y = Math.random() < 0.5 ? -10 : canvas.height + 10;
        } else {
          this.y = Math.random() * canvas.height;
          this.x = Math.random() < 0.5 ? -10 : canvas.width + 10;
        }
      }
    }
    draw(ctx) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(124, 77, 255, ${this.opacity * 0.7})`;
      ctx.fill();
    }
  }

  const count = Math.min(80, Math.floor(window.innerWidth * window.innerHeight / 12000));
  for (let i = 0; i < count; i++) {
    particles.push(new Particle());
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
      p.update();
      p.draw(ctx);
    }
    animId = requestAnimationFrame(animate);
  }
  animate();
})();

// ===== 游戏选择 =====
function selectGame(game) {
  if (game === 'coming') return;
  currentGame = game;
  document.getElementById('room-game-title').textContent = '🎯 五子棋';
  showCreateView();
  document.getElementById('room-panel').style.display = 'flex';
}

// ===== 房间面板控制 =====
function closeRoomPanel() {
  document.getElementById('room-panel').style.display = 'none';
  currentGame = null;
}

function showCreateView() {
  document.getElementById('create-view').style.display = 'block';
  document.getElementById('join-view').style.display = 'none';
  document.getElementById('waiting-view').style.display = 'none';
}

function showJoinView() {
  document.getElementById('create-view').style.display = 'none';
  document.getElementById('join-view').style.display = 'block';
  document.getElementById('waiting-view').style.display = 'none';
}

// ===== 创建房间 =====
async function createRoom() {
  try {
    await connectWS();

    ws.onclose = () => {
      console.log('WebSocket 已断开');
      stopHeartbeat();
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'room_created') {
        clientRoomCode = msg.roomCode;
        document.getElementById('room-code-text').textContent = msg.roomCode;
        document.getElementById('create-view').style.display = 'none';
        document.getElementById('join-view').style.display = 'none';
        document.getElementById('waiting-view').style.display = 'flex';
      } else if (msg.type === 'game_start') {
        startGame(msg);
      } else if (msg.type === 'pong') {
        heartbeatMissed = 0;
      }
    };

    ws.send(JSON.stringify({ type: 'create_room', game: 'gomoku' }));
  } catch (err) {
    showToast('连接服务器失败，请稍后重试');
  }
}

// ===== 加入房间 =====
async function joinRoom() {
  const input = document.getElementById('room-code-input');
  const code = input.value.trim();
  if (code.length !== 6) {
    showToast('请输入6位房间码');
    return;
  }

  try {
    await connectWS();

    ws.onclose = () => {
      console.log('WebSocket 已断开');
      stopHeartbeat();
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'game_state') {
        clientRoomCode = msg.roomCode || clientRoomCode;
        if (msg.role === 'spectator') {
          startSpectate(msg);
        } else if (msg.role === 'player') {
          // 重连或新手：进入游戏界面，init 后同步棋盘
          enterGameView();
          const mc = msg.color || 'black';
          const oc = mc === 'black' ? 'white' : 'black';
          document.getElementById('player-avatar').textContent = mc === 'black' ? '⚫' : '⚪';
          document.getElementById('player-name').textContent = '你';
          document.getElementById('player-badge').textContent = mc === 'black' ? '黑棋' : '白棋';
          document.getElementById('player-badge').className = `player-badge player-badge--${mc}`;
          document.getElementById('opponent-avatar').textContent = oc === 'black' ? '⚫' : '⚪';
          document.getElementById('opponent-name').textContent = '对手';
          document.getElementById('opponent-badge').textContent = oc === 'black' ? '黑棋' : '白棋';
          document.getElementById('opponent-badge').className = `player-badge player-badge--${oc}`;
          initGomoku(mc, msg.currentTurn || 'black', 'player', msg);
          updateRoleUI();
        }
      } else if (msg.type === 'game_start') {
        startGame(msg);
      } else if (msg.type === 'error') {
        showToast(msg.message);
        ws.close();
      } else if (msg.type === 'pong') {
        heartbeatMissed = 0;
      }
    };

    ws.send(JSON.stringify({ type: 'join_room', roomCode: code }));
  } catch (err) {
    showToast('连接服务器失败，请稍后重试');
  }
}

// ===== 进入游戏界面（通用） =====
function enterGameView() {
  document.getElementById('room-panel').style.display = 'none';
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('game-view').style.display = 'flex';
  if (clientRoomCode) {
    document.getElementById('room-label').textContent = `房间: ${clientRoomCode}`;
  }
}

// ===== 开始游戏（玩家） =====
function startGame(msg) {
  enterGameView();
  const myColor = msg.color;
  const oppColor = myColor === 'black' ? 'white' : 'black';

  document.getElementById('player-avatar').textContent = myColor === 'black' ? '⚫' : '⚪';
  document.getElementById('player-name').textContent = '你';
  document.getElementById('player-badge').textContent = myColor === 'black' ? '黑棋' : '白棋';
  document.getElementById('player-badge').className = `player-badge player-badge--${myColor}`;

  document.getElementById('opponent-avatar').textContent = oppColor === 'black' ? '⚫' : '⚪';
  document.getElementById('opponent-name').textContent = '对手';
  document.getElementById('opponent-badge').textContent = oppColor === 'black' ? '黑棋' : '白棋';
  document.getElementById('opponent-badge').className = `player-badge player-badge--${oppColor}`;

  updateTurnIndicator(msg.currentTurn, myColor);
  initGomoku(myColor, msg.currentTurn, 'player');
}

// ===== 观战模式 =====
function startSpectate(msg) {
  enterGameView();
  document.getElementById('turn-indicator').style.display = 'none';
  document.getElementById('spectator-badge').style.display = 'inline-block';
  initGomoku(null, msg.currentTurn || 'black', 'spectator', msg);
}

// ===== 更新回合指示器 =====
function updateTurnIndicator(currentTurn, myColor) {
  const el = document.getElementById('turn-indicator');
  const isMyTurn = currentTurn === myColor;
  el.textContent = isMyTurn ? '轮到你' : '等待对手';
  el.className = `turn-badge ${isMyTurn ? 'turn-badge--your' : 'turn-badge--opponent'}`;

  // 同时更新玩家徽章
  const myBadge = document.getElementById('player-badge');
  const oppBadge = document.getElementById('opponent-badge');
  myBadge.classList.toggle('player-badge--active', isMyTurn);
  oppBadge.classList.toggle('player-badge--active', !isMyTurn);
}

// ===== 复制房间码 =====
function copyRoomCode() {
  const code = document.getElementById('room-code-text').textContent;
  navigator.clipboard.writeText(code).then(() => {
    showToast('✅ 房间码已复制');
  }).catch(() => {
    showToast('复制失败，请手动复制');
  });
}

// ===== Toast 通知 =====
let toastTimer;
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast toast--show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.className = 'toast toast--hide';
  }, 2500);
}

// ===== 键盘快捷键 =====
document.addEventListener('keydown', (e) => {
  // ESC 关闭面板
  if (e.key === 'Escape') {
    if (document.getElementById('room-panel').style.display === 'flex') {
      closeRoomPanel();
    }
  }
  // Enter 加入房间
  if (e.key === 'Enter' && document.getElementById('join-view').style.display === 'block') {
    joinRoom();
  }
});

// ===== 剪贴板检测（进页面直接弹窗确认） =====
setTimeout(function() {
  navigator.clipboard.readText().then(function(text) {
    var m = text.match(/\d{6}/);
    if (m) {
      var code = m[0];
      showClipboardPrompt(code);
    }
  }).catch(function() {});
}, 800);

function showClipboardPrompt(code) {
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = 'display:flex;z-index:200';
  overlay.innerHTML = '<div class="modal" style="text-align:center;">' +
    '<h3 style="margin-bottom:12px;">📋 发现房间号</h3>' +
    '<div class="room-code-display" style="margin-bottom:16px;"><strong>' + code + '</strong></div>' +
    '<p style="color:var(--text-secondary);margin-bottom:20px;">是否加入该房间？</p>' +
    '<div style="display:flex;gap:12px;justify-content:center;">' +
    '<button class="btn btn-primary" id="clip-yes">✅ 加入</button>' +
    '<button class="btn btn-secondary" id="clip-no">❌ 忽略</button>' +
    '</div></div>';
  document.body.appendChild(overlay);

  document.getElementById('clip-yes').onclick = function() {
    overlay.remove();
    var input = document.getElementById('room-code-input');
    if (input) input.value = code;
    clientRoomCode = code;
    showToast('正在加入 ' + code + '…');
    // 直接走 joinRoom 流程
    joinRoomByCode(code);
  };
  document.getElementById('clip-no').onclick = function() {
    overlay.remove();
  };
}

async function joinRoomByCode(code) {
  try {
    await connectWS();

    ws.onclose = () => {
      console.log('WebSocket 已断开');
      stopHeartbeat();
    };

    ws.onmessage = function(e) {
      var msg = JSON.parse(e.data);
      if (msg.type === 'game_state') {
        clientRoomCode = msg.roomCode || clientRoomCode;
        if (msg.role === 'spectator') startSpectate(msg);
        else if (msg.role === 'player') {
          enterGameView();
          var mc = msg.color || 'black';
          var oc = mc === 'black' ? 'white' : 'black';
          document.getElementById('player-avatar').textContent = mc === 'black' ? '⚫' : '⚪';
          document.getElementById('player-name').textContent = '你';
          document.getElementById('player-badge').textContent = mc === 'black' ? '黑棋' : '白棋';
          document.getElementById('player-badge').className = 'is-badge';
          document.getElementById('opponent-avatar').textContent = oc === 'black' ? '⚫' : '⚪';
          document.getElementById('opponent-name').textContent = '对手';
          document.getElementById('opponent-badge').textContent = oc === 'black' ? '黑棋' : '白棋';
          document.getElementById('opponent-badge').className = 'is-badge';
          initGomoku(mc, msg.currentTurn || 'black', 'player', msg);
          updateRoleUI();
        }
      } else if (msg.type === 'game_start') startGame(msg);
      else if (msg.type === 'error') { showToast(msg.message); ws.close(); }
    };
    ws.send(JSON.stringify({ type: 'join_room', roomCode: code }));
  } catch(e) { showToast('连接服务器失败'); }
}
