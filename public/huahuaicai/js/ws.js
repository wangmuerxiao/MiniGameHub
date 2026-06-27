/**
 * WebSocket 管理器
 */
const WS = {
  socket: null,
  handlers: {},
  heartbeatTimer: null,
  heartbeatMissed: 0,
  HEARTBEAT_INTERVAL: 15000,
  HEARTBEAT_MAX_MISS: 3,
  _reconnecting: false,
  _roomCode: null,
  _playerId: null,

  getUrl() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${location.host}/game/ws`;
  },

  connect() {
    return new Promise((resolve, reject) => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        resolve(this.socket);
        return;
      }
      this.socket = new WebSocket(this.getUrl());
      this.socket.onopen = () => {
        console.log('[WS] 已连接');
        this.startHeartbeat();
        resolve(this.socket);
      };
      this.socket.onclose = () => {
        console.log('[WS] 已断开');
        this.stopHeartbeat();
        this._tryReconnect();
      };
      this.socket.onerror = (err) => {
        console.error('[WS] 连接失败', err);
        reject(err);
      };
      this.socket.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'pong') { this.heartbeatMissed = 0; return; }
          const handler = this.handlers[msg.type];
          if (handler) handler(msg);
        } catch (err) {
          console.error('[WS] 消息解析失败', err);
        }
      };
    });
  },

  on(type, handler) {
    this.handlers[type] = handler;
  },

  off(type) {
    delete this.handlers[type];
  },

  send(type, data = {}) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type, ...data }));
    }
  },

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatMissed = 0;
    this.heartbeatTimer = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.heartbeatMissed++;
        if (this.heartbeatMissed >= this.HEARTBEAT_MAX_MISS) {
          console.warn('[WS] 心跳超时');
          this.socket.close();
          return;
        }
        this.send('ping');
      }
    }, this.HEARTBEAT_INTERVAL);
  },

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.heartbeatMissed = 0;
  },

  _tryReconnect() {
    if (this._reconnecting) return;
    if (!this._roomCode) return;
    this._reconnecting = true;
    console.log('[WS] 尝试重连...');
    App.showToast('连接断开，正在重连...');
    setTimeout(async () => {
      try {
        await this.connect();
        this._reconnecting = false;
        if (this._roomCode) {
          this.send('join_room', { roomCode: this._roomCode, rejoin: true });
          App.showToast('重连成功！');
        }
      } catch (e) {
        this._reconnecting = false;
        App.showToast('重连失败，请刷新页面');
      }
    }, 1500);
  },

  setRoom(roomCode, playerId) {
    this._roomCode = roomCode;
    this._playerId = playerId;
  },

  clearRoom() {
    this._roomCode = null;
    this._playerId = null;
  },

  isConnected() {
    return this.socket && this.socket.readyState === WebSocket.OPEN;
  },

  close() {
    this.stopHeartbeat();
    this._roomCode = null;
    this._playerId = null;
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }
  }
};
