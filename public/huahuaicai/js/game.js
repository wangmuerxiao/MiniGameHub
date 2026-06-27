/**
 * 游戏状态管理 + HUD
 */
const Game = {
  phase: 'idle',
  mode: 'campaign',
  level: 1,
  round: 0,
  timer: 0,
  score: 0,
  streak: 0,
  isDrawer: false,
  currentWord: '',
  hintsAllowed: false,
  _nextReady: false,

  mechanics: null,
  _mechanicTimers: [],

  onRoundStart(msg) {
    this.phase = 'playing';
    this.mode = msg.mode;
    this.level = msg.level;
    this.round = msg.round;
    this.timer = msg.time;
    this.isDrawer = msg.role === 'drawer';
    this.currentWord = msg.word || '';
    this.hintsAllowed = msg.hintsAllowed || false;
    this._nextReady = false;
    this.mechanics = msg.mechanics || null;
    this._clearMechanicTimers();

    // Update HUD
    this._updateHUD();
    this._updateStatus();
    this._updateTimer();

    // Setup canvas
    CanvasManager.setDrawer(this.isDrawer, msg.strokeLimit);
    if (msg.canvasHidden && this.isDrawer) {
      CanvasManager.setHidden(true);
    } else {
      CanvasManager.setHidden(false);
    }

    // Setup guess area
    Guess.setRole(!this.isDrawer);
    Guess.clear();

    // Show hint button
    const hintBtn = document.getElementById('hint-btn');
    if (hintBtn) hintBtn.style.display = this.hintsAllowed && !this.isDrawer ? '' : 'none';

    // 特殊词库信息（反义词/相反画法/反向提示）— 必须在 Guess.clear() 之后
    if (msg.extra) {
      this._showExtraInfo(msg.extra);
    }

    // 应用关卡机制
    if (this.mechanics) this._applyMechanics(this.mechanics);

    // Boss关进度提示
    if (msg.bossProgress) {
      Guess.addMessage('👹 第 ' + msg.bossProgress.current + '/' + msg.bossProgress.total + ' 词！', 'system');
      App.showToast('👹 Boss ' + msg.bossProgress.current + '/' + msg.bossProgress.total);
    }

    // Show game view
    App.showView('view-game');
    CanvasManager.resizeAfterShow();
  },

  _showExtraInfo(extra) {
    if (extra.hint) {
      // 反义词/反向提示：显示描述提示
      Guess.addMessage('💡 提示：' + extra.hint, 'system');
    }
    if (extra.draw) {
      // 相反画法：提示画手要画什么
      if (this.isDrawer) {
        Guess.addMessage('🎨 请画出「' + extra.draw + '」（与词语相反）', 'system');
      } else {
        Guess.addMessage('🎨 画手在画与词语相反的东西', 'system');
      }
    }
  },

  _applyMechanics(m) {
    // 一笔封神
    if (m.oneStroke && this.isDrawer) {
      CanvasManager.oneStrokeMode = true;
      Guess.addMessage('⚡ 一笔封神模式：只能画一笔！', 'system');
    }
    // 隐形墨水
    if (m.inkFade) {
      CanvasManager.inkFadeSec = m.inkFade;
      Guess.addMessage('💧 隐形墨水：笔画' + m.inkFade + '秒后消失！', 'system');
    }
    // 越来越粗
    if (m.brushGrow && this.isDrawer) {
      CanvasManager.brushAnim = 'grow';
      CanvasManager.brushAnimStart = Date.now();
      Guess.addMessage('🖌️ 笔刷会越来越粗！赶紧画关键部分！', 'system');
    }
    // 越来越细
    if (m.brushShrink && this.isDrawer) {
      CanvasManager.brushAnim = 'shrink';
      CanvasManager.brushAnimStart = Date.now();
      Guess.addMessage('✏️ 笔刷会越来越细！先画粗的部分！', 'system');
    }
    // 倒计时爆炸
    if (m.autoClear) {
      Guess.addMessage('💥 每' + m.autoClear + '秒清空画布！快速画！', 'system');
      const interval = setInterval(() => {
        if (this.phase !== 'playing') { clearInterval(interval); return; }
        CanvasManager.clear();
        App.showToast('💥 画布已清空！');
      }, m.autoClear * 1000);
      this._mechanicTimers.push(interval);
    }
    // 画布旋转
    if (m.canvasRotate) {
      Guess.addMessage('🔄 画布每' + m.canvasRotate + '秒旋转！', 'system');
      let rotAngle = 0;
      const interval = setInterval(() => {
        if (this.phase !== 'playing') { clearInterval(interval); return; }
        rotAngle += 90;
        const wrapper = document.getElementById('canvas-wrapper');
        if (wrapper) wrapper.style.transform = 'rotate(' + rotAngle + 'deg)';
        CanvasManager.canvasRotation = rotAngle % 360;
        App.showToast('🔄 画布旋转 ' + rotAngle + '°');
      }, m.canvasRotate * 1000);
      this._mechanicTimers.push(interval);
    }
    // 只能画不能说：强制关闭语音，关卡内禁止开启
    if (m.muteVoice) {
      this._voiceWasEnabled = Voice.enabled;
      if (Voice.enabled) {
        Voice._muteLocal(); // 只静音，不断开连接
      }
      Voice.enabled = false;
      Voice._forceMuted = true;
      const btn = document.getElementById('voice-btn');
      if (btn) { btn.textContent = '🎤'; btn.title = '关卡限制：无法开启语音'; btn.classList.remove('active'); }
      Guess.addMessage('🔇 只能画不能说模式：语音已关闭，本关无法开启', 'system');
    }
    // 幸运轮盘：随机一个负面BUFF（互斥）
    if (m.wheel) {
      const buffs = [
        { name: '画布旋转', fn: () => { this._applyMechanics({ canvasRotate: 5 }); } },
        { name: '三笔限制', fn: () => { CanvasManager.strokeLimit = 3; Guess.addMessage('🎰 三笔限制！', 'system'); } },
        { name: '镜像模式', fn: () => { CanvasManager.mirrorMode = true; Guess.addMessage('🎰 镜像模式！画出来是左右镜像的', 'system'); } },
        { name: '抖手模式', fn: () => { CanvasManager.shakeMode = true; Guess.addMessage('🎰 抖手模式！线条会抖动', 'system'); } },
      ];
      const buff = buffs[Math.floor(Math.random() * buffs.length)];
      App.showToast('🎰 幸运轮盘：' + buff.name);
      buff.fn();
    }
    // Boss关
    if (m.boss) {
      Guess.addMessage('👹 Boss关：连续挑战' + m.boss + '个词！', 'system');
    }
    // 抽象大师
    if (m.abstractMode) {
      Guess.addMessage('🎭 抽象大师：语音交流为主，画画为辅', 'system');
    }
  },

  _clearMechanicTimers() {
    this._mechanicTimers.forEach(t => clearInterval(t));
    this._mechanicTimers = [];
    // 重置画布状态
    const wrapper = document.getElementById('canvas-wrapper');
    if (wrapper) wrapper.style.transform = '';
    CanvasManager.oneStrokeMode = false;
    CanvasManager.inkFadeSec = 0;
    CanvasManager.brushAnim = null;
    CanvasManager.mirrorMode = false;
    CanvasManager.shakeMode = false;
    CanvasManager.canvasRotation = 0;
    // 恢复语音状态
    if (Voice._forceMuted) {
      Voice._forceMuted = false;
      if (this._voiceWasEnabled) {
        Voice.enabled = true;
        Voice._unmuteLocal();
        const btn = document.getElementById('voice-btn');
        if (btn) { btn.textContent = '🟢'; btn.title = '关闭语音'; btn.classList.add('active'); }
      }
      this._voiceWasEnabled = false;
    }
  },

  onTimerTick(time) {
    this.timer = time;
    this._updateTimer();
    // Warning states
    if (time <= 10) {
      Anim.setTimerWarning('danger');
    } else if (time <= 20) {
      Anim.setTimerWarning('warning');
    } else {
      Anim.setTimerWarning(null);
    }
  },

  _rulesShown: false,

  onCountdown(number) {
    App.showView('view-countdown');
    // 第一个倒计时数字时显示规则提示
    if (!this._rulesShown) {
      this._rulesShown = true;
      const overlay = document.getElementById('rules-overlay');
      if (overlay) {
        overlay.style.display = '';
        setTimeout(() => { overlay.style.display = 'none'; }, 2500);
      }
    }
    Anim.countdown(number);
  },

  onLevelComplete(stats) {
    this.phase = 'level_complete';
    Anim.levelComplete(stats.levelName);
    Anim.confetti(60);

    document.getElementById('lc-title').textContent = '🎉 ' + stats.levelName + ' 通过！';
    document.getElementById('lc-stats').innerHTML =
      '得分：' + stats.score + '<br>' +
      '最高连击：' + stats.streak + '<br>' +
      '猜对：' + stats.correctGuesses + '/' + stats.totalRounds;

    const nextBtn = document.getElementById('lc-next-btn');
    if (stats.level >= Levels.configs.length) {
      nextBtn.textContent = '♾️ 进入无限模式';
    } else {
      nextBtn.textContent = '第 ' + (stats.level + 1) + ' 关 →';
    }

    App.showView('view-level-complete');
  },

  onGameOver(data) {
    this.phase = 'game_over';
    Anim.setTimerWarning(null);
    Result.show(data.stats, data.grade, data.guessLogs);
  },

  nextLevel() {
    WS.send('draw_next', {});
  },


  requestHint() {
    WS.send('draw_hint', {});
  },

  onHintResult(hint) {
    if (hint.trick) {
      Guess.addMessage('💡 提示：' + hint.hint + '（' + hint.length + '个字）⚠️ 这个提示可能是假的！', 'system');
    } else {
      Guess.addMessage('💡 提示：' + hint.hint + '（' + hint.length + '个字）', 'system');
    }
  },

  onError(msg) {
    App.showToast(msg.message);
  },

  exitGame() {
    if (confirm('确定退出当前游戏？')) {
      Anim.setTimerWarning(null);
      Voice.cleanup();
      WS.send('leave_room', {});
      WS.clearRoom();
      this._rulesShown = false;
      window.location.href = '/game/huahuaicai/index.html';
    }
  },

  _updateHUD() {
    const levelEl = document.getElementById('hud-level');
    const roundEl = document.getElementById('hud-round');
    const scoreEl = document.getElementById('hud-score');
    const streakEl = document.getElementById('hud-streak');

    if (this.mode === 'campaign') {
      const config = Levels.getConfig(this.level);
      levelEl.textContent = '关卡 ' + this.level + ' ' + config.name;
    } else {
      levelEl.textContent = '♾️ 无限模式';
    }
    roundEl.textContent = '第 ' + this.round + ' 回合';
    scoreEl.textContent = '🏆 ' + this.score;
    if (this.streak > 1) {
      streakEl.style.display = '';
      streakEl.textContent = '🔥 ' + this.streak;
    } else {
      streakEl.style.display = 'none';
    }
  },

  _updateTimer() {
    const el = document.getElementById('timer-value');
    if (el) el.textContent = this.timer;
  },

  _updateStatus() {
    const roleEl = document.getElementById('status-role');
    const wordEl = document.getElementById('status-word');
    const strokesEl = document.getElementById('status-strokes');
    const wrongEl = document.getElementById('status-wrong');

    if (this.isDrawer) {
      roleEl.textContent = '✏️ 你是画手';
      wordEl.textContent = this.currentWord;
      wordEl.style.display = '';
    } else {
      roleEl.textContent = '🔍 你是猜词者';
      wordEl.textContent = '???';
      wordEl.style.display = '';
    }

    // Stroke counter
    if (this.mode === 'campaign') {
      const config = Levels.getConfig(this.level);
      if (config.strokeLimit) {
        strokesEl.textContent = '0/' + config.strokeLimit + ' 笔';
        strokesEl.style.display = '';
      } else {
        strokesEl.style.display = 'none';
      }
      wrongEl.style.display = 'none';
    } else {
      strokesEl.style.display = 'none';
      wrongEl.style.display = 'none';
    }
  },

  updateScore(score, streak) {
    this.score = score;
    this.streak = streak;
    this._updateHUD();
  },

  registerHandlers() {
    WS.on('countdown', (msg) => this.onCountdown(msg.number));
    WS.on('round_start', (msg) => this.onRoundStart(msg));
    WS.on('timer_tick', (msg) => this.onTimerTick(msg.time));
    WS.on('level_complete', (msg) => this.onLevelComplete(msg.stats));
    WS.on('game_over', (msg) => this.onGameOver(msg));
    WS.on('hint_result', (msg) => this.onHintResult(msg));
    WS.on('error', (msg) => this.onError(msg));
    // Track score from guess results
    WS.on('guess_result', (msg) => {
      if (msg.correct && msg.score) {
        this.score += msg.score;
        this.streak = msg.streak || 0;
        this._updateHUD();
      } else if (!msg.correct) {
        this.streak = 0;
        this._updateHUD();
      }
    });
  }
};
