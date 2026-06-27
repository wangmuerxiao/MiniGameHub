/**
 * 房间管理
 */
const Room = {
  roomCode: null,
  playerId: null,
  players: [],

  async createRoom() {
    try {
      await WS.connect();
      WS.send('create_room', { game: 'drawguess' });
    } catch (e) {
      App.showToast('连接服务器失败');
    }
  },

  async joinRoom() {
    const input = document.getElementById('room-code-input');
    const code = input.value.trim();
    if (code.length !== 6) { App.showToast('请输入6位房间码'); return; }
    try {
      await WS.connect();
      WS.send('join_room', { roomCode: code });
    } catch (e) {
      App.showToast('连接服务器失败');
    }
  },

  onRoomCreated(msg) {
    this.roomCode = msg.roomCode;
    this.playerId = msg.playerId;
    WS.setRoom(this.roomCode, this.playerId);
    this.players = [{ id: msg.playerId }];
    this._updateUI();
    App.showView('view-room');
    document.getElementById('room-join-panel').style.display = 'none';
    document.getElementById('room-wait-panel').style.display = '';
    document.getElementById('room-wait-text').textContent = '等待对手加入...';

    // Auto-copy room code
    this._autoCopy();
  },

  onRoomJoined(msg) {
    this.roomCode = msg.roomCode;
    this.playerId = msg.playerId;
    WS.setRoom(this.roomCode, this.playerId);
    this.players = msg.players || [];
    this._updateUI();
    App.showView('view-room');
    document.getElementById('room-join-panel').style.display = 'none';
    document.getElementById('room-wait-panel').style.display = '';
  },

  onPlayerJoined(msg) {
    if (!this.players.find(p => p.id === msg.playerId)) {
      this.players.push({ id: msg.playerId });
    }
    this._updateUI();
    document.getElementById('room-wait-text').textContent = '对手已加入，游戏即将开始...';
    App.showToast('对手已加入！');
  },

  onPlayerLeft() {
    App.showToast('对手已断开');
    document.getElementById('room-wait-text').textContent = '等待对手加入...';
    this._updateUI();
  },

  leaveRoom() {
    WS.send('leave_room', {});
    WS.clearRoom();
    Voice.cleanup();
    this.roomCode = null;
    this.playerId = null;
    this.players = [];
    App.showHome();
  },

  _autoCopy() {
    const code = this.roomCode;
    if (!code) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(() => {
        App.showToast('✅ 房间码 ' + code + ' 已自动复制');
      }).catch(() => {
        App.showToast('房间码：' + code + '（请手动复制）');
      });
    } else {
      // Fallback
      const input = document.createElement('input');
      input.value = code;
      document.body.appendChild(input);
      input.select();
      try { document.execCommand('copy'); App.showToast('✅ 房间码 ' + code + ' 已自动复制'); }
      catch(e) { App.showToast('房间码：' + code); }
      document.body.removeChild(input);
    }
  },

  copyCode() {
    const code = this.roomCode || document.getElementById('room-code-text').textContent;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(() => {
        App.showToast('✅ 已复制');
      }).catch(() => App.showToast('复制失败'));
    }
  },

  _updateUI() {
    document.getElementById('room-code-text').textContent = this.roomCode || '------';

    for (let i = 0; i < 2; i++) {
      const slot = document.getElementById('player-slot-' + i);
      const p = this.players[i];
      if (p) {
        const isMe = p.id === this.playerId;
        slot.querySelector('.player-avatar').textContent = isMe ? '🎨' : '🖼️';
        slot.querySelector('.player-name').textContent = isMe ? '我' : '对手';
        slot.querySelector('.player-status').textContent = '✅ 已加入';
        slot.classList.add('ready');
      } else {
        slot.querySelector('.player-avatar').textContent = i === 0 ? '🎨' : '🖼️';
        slot.querySelector('.player-name').textContent = '等待加入...';
        slot.querySelector('.player-status').textContent = '-';
        slot.classList.remove('ready');
      }
    }
  },

  registerHandlers() {
    WS.on('room_created', (msg) => this.onRoomCreated(msg));
    WS.on('room_joined', (msg) => this.onRoomJoined(msg));
    WS.on('player_joined', (msg) => this.onPlayerJoined(msg));
    WS.on('player_left', () => this.onPlayerLeft());
  }
};
