/**
 * 应用入口 - 视图管理 + 初始化
 */
const App = {
  currentView: 'view-home',
  _toastTimer: null,

  init() {
    // Register all WS handlers
    Room.registerHandlers();
    Game.registerHandlers();
    Guess.registerHandlers();
    CanvasManager.registerHandlers();
    Voice.registerHandlers();

    // Initialize modules
    Lobby.init();
    CanvasManager.init();
    Guess.init();

    console.log('🎨 默契画猜 已初始化');
  },

  showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById(viewId);
    if (el) {
      el.classList.add('active');
      this.currentView = viewId;
    }
  },

  showHome() {
    this.showView('view-home');
    Anim.setTimerWarning(null);
  },

  showRoom() {
    Room.createRoom();
  },

  showJoinRoom() {
    this.showView('view-room');
    document.getElementById('room-join-panel').style.display = '';
    document.getElementById('room-wait-panel').style.display = 'none';
    document.getElementById('room-code-input').focus();
  },

  showRules() {
    this.showView('view-rules');
  },

  showHistory() {
    this.showView('view-history');
  },

  leaveRoom() {
    Room.leaveRoom();
  },

  restartGame() {
    Game.score = 0;
    Game.streak = 0;
    Game.round = 0;
    Game._rulesShown = false;
    Anim.setTimerWarning(null);
    // Send restart to server, which will auto-start again
    WS.send('draw_restart', {});
    this.showView('view-room');
    document.getElementById('room-join-panel').style.display = 'none';
    document.getElementById('room-wait-panel').style.display = '';
    document.getElementById('room-wait-text').textContent = '准备开始新一局...';
  },

  showAIReport() {
    Result.showAIReport();
  },

  showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.className = 'toast';
    }, 2500);
  }
};

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
