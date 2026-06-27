/**
 * 语音聊天（WebRTC）- Safari/iOS 兼容 + 防Glare
 */
const Voice = {
  enabled: false,
  localStream: null,
  peerConnections: {},
  remoteAudios: {},
  ICE_SERVERS: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.miwifi.com:3478' },
    { urls: 'stun:stun.chat.bilibili.com:3478' },
    { urls: 'stun:stun.hitv.com:3478' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
  ],

  // 判断PC是否可用（未关闭且未失败）
  _isPCAlive(pc) {
    if (!pc) return false;
    const s = pc.connectionState;
    return s !== 'closed' && s !== 'failed';
  },

  _forceMuted: false,

  toggle() {
    if (!WS.isConnected()) { App.showToast('连接已断开'); return; }
    if (this._forceMuted) { App.showToast('🔇 当前关卡禁止开启语音'); return; }
    const btn = document.getElementById('voice-btn');
    if (this.enabled) {
      this.enabled = false;
      this._updateBtn(btn, false);
      this._muteLocal();
      App.showToast('语音已关闭');
    } else {
      this.enabled = true;
      this._updateBtn(btn, true);
      if (this.localStream) {
        this._unmuteLocal();
        App.showToast('语音已开启');
      } else {
        this._startVoice().then(() => {
          App.showToast('语音已开启');
        }).catch(err => {
          this.enabled = false;
          this._updateBtn(btn, false);
          App.showToast('无法访问麦克风: ' + (err.message || err.name || ''));
        });
      }
    }
  },

  _updateBtn(btn, on) {
    if (!btn) return;
    if (on) {
      btn.textContent = '🟢';
      btn.title = '关闭语音';
      btn.classList.add('active');
    } else {
      btn.textContent = '🎤';
      btn.title = '开启语音';
      btn.classList.remove('active');
    }
  },

  async _startVoice() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false
    });
    this.localStream = stream;
    WS.send('voice_start', {});
    // 给已有PC添加音轨
    for (const peerId in this.peerConnections) {
      const pc = this.peerConnections[peerId];
      if (this._isPCAlive(pc)) {
        stream.getTracks().forEach(track => { try { pc.addTrack(track, stream); } catch(e) {} });
        await this._createOffer(peerId);
      }
    }
  },

  _createPC(peerId) {
    // 防止重复创建：已有可用PC则直接返回
    const old = this.peerConnections[peerId];
    if (old && this._isPCAlive(old)) {
      return old;
    }
    if (old) { try { old.close(); } catch(e) {} }
    let pc;
    try { pc = new RTCPeerConnection({ iceServers: this.ICE_SERVERS }); }
    catch(e) { return null; }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        WS.send('webrtc_ice_candidate', { candidate: event.candidate, to: peerId });
      }
    };
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) this._playRemoteAudio(peerId, event.streams[0]);
    };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'failed') { try { pc.restartIce(); } catch(e) {} }
    };
    this.peerConnections[peerId] = pc;
    return pc;
  },

  _playRemoteAudio(peerId, stream) {
    let audioEl = document.getElementById('remote-audio-' + peerId);
    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.id = 'remote-audio-' + peerId;
      audioEl.autoplay = true;
      audioEl.playsinline = true;
      audioEl.muted = false;
      audioEl.volume = 1.0;
      audioEl.style.display = 'none';
      document.body.appendChild(audioEl);
      this.remoteAudios[peerId] = audioEl;
    }
    audioEl.srcObject = stream;
    audioEl.play().then(() => {
      console.log('[Voice] 音频播放成功');
    }).catch(err => {
      console.warn('[Voice] 播放被阻止:', err.message);
      App.showToast('🎤 点击页面以开启语音');
      const tryPlay = () => {
        audioEl.play().catch(()=>{});
        document.removeEventListener('click', tryPlay);
        document.removeEventListener('touchstart', tryPlay);
      };
      document.addEventListener('click', tryPlay);
      document.addEventListener('touchstart', tryPlay);
    });
  },

  async _createOffer(peerId) {
    const pc = this.peerConnections[peerId];
    if (!pc) return;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      WS.send('webrtc_offer', { sdp: pc.localDescription, to: peerId });
    } catch (err) {}
  },

  async handleOffer(peerId, sdp) {
    let pc = this.peerConnections[peerId];
    if (!pc || !this._isPCAlive(pc)) pc = this._createPC(peerId);
    if (!pc) return;
    // 信令冲突处理
    if (pc.signalingState === 'have-local-offer') {
      try { await pc.setLocalDescription({ type: 'rollback' }); } catch(e) {}
    }
    // 添加本地音轨
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        if (!pc.getSenders().some(s => s.track === track)) {
          try { pc.addTrack(track, this.localStream); } catch(e) {}
        }
      });
    }
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      WS.send('webrtc_answer', { sdp: pc.localDescription, to: peerId });
      this._flushPendingICE(peerId);
    } catch (err) {}
  },

  async handleAnswer(peerId, sdp) {
    const pc = this.peerConnections[peerId];
    if (!pc || pc.signalingState !== 'have-local-offer') return;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      this._flushPendingICE(peerId);
    } catch (err) {}
  },

  async handleICE(peerId, candidate) {
    const pc = this.peerConnections[peerId];
    if (!pc) return;
    if (!pc.remoteDescription) {
      if (!pc._pendingICE) pc._pendingICE = [];
      pc._pendingICE.push(candidate);
      return;
    }
    try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
    catch (err) {}
  },

  async _flushPendingICE(peerId) {
    const pc = this.peerConnections[peerId];
    if (!pc || !pc._pendingICE || pc._pendingICE.length === 0) return;
    for (const c of pc._pendingICE) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch(e) {}
    }
    pc._pendingICE = [];
  },

  onVoiceStart(peerId) {
    const existing = this.peerConnections[peerId];

    if (existing && this._isPCAlive(existing)) {
      // PC已存在：检查是否需要补充音频
      if (this.enabled && this.localStream) {
        let needOffer = false;
        this.localStream.getTracks().forEach(track => {
          if (!existing.getSenders().some(s => s.track === track)) {
            try { existing.addTrack(track, this.localStream); needOffer = true; } catch(e) {}
          }
        });
        // 信令状态允许发offer时才重新协商
        if (needOffer && (existing.signalingState === 'stable' || existing.signalingState === 'have-remote-offer')) {
          this._createOffer(peerId);
        }
      }
      return;
    }

    App.showToast('🎤 对方已开麦');

    if (this.enabled && this.localStream) {
      const pc = this._createPC(peerId);
      if (!pc) return;
      this.localStream.getTracks().forEach(track => {
        if (!pc.getSenders().some(s => s.track === track)) {
          try { pc.addTrack(track, this.localStream); } catch(e) {}
        }
      });
      this._createOffer(peerId);
    } else {
      this._voiceStartSent = true;
      WS.send('voice_start', {});
    }
  },

  _muteLocal() { if (this.localStream) this.localStream.getTracks().forEach(t => { t.enabled = false; }); },
  _unmuteLocal() { if (this.localStream) this.localStream.getTracks().forEach(t => { t.enabled = true; }); },

  cleanup() {
    for (const id in this.peerConnections) { try { this.peerConnections[id].close(); } catch(e) {} }
    this.peerConnections = {};
    if (this.localStream) { this.localStream.getTracks().forEach(t => t.stop()); this.localStream = null; }
    for (const id in this.remoteAudios) {
      if (this.remoteAudios[id]) { this.remoteAudios[id].srcObject = null; try { this.remoteAudios[id].remove(); } catch(e) {} }
    }
    this.remoteAudios = {};
    this.enabled = false;
    this._voiceStartSent = false;
    this._forceMuted = false;
    const btn = document.getElementById('voice-btn');
    if (btn) { btn.textContent = '🎤'; btn.title = '开启语音'; btn.classList.remove('active'); }
  },

  registerHandlers() {
    WS.on('voice_start', (msg) => this.onVoiceStart(msg.from));
    WS.on('webrtc_offer', (msg) => this.handleOffer(msg.from, msg.sdp));
    WS.on('webrtc_answer', (msg) => this.handleAnswer(msg.from, msg.sdp));
    WS.on('webrtc_ice_candidate', (msg) => this.handleICE(msg.from, msg.candidate));
  }
};
