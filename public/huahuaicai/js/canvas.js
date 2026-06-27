/**
 * 画板管理器 - 绘制 + 同步 (Safari兼容)
 */
const CanvasManager = {
  canvas: null,
  ctx: null,
  isDrawing: false,
  currentColor: '#2d2d3f',
  currentWidth: 3,
  lastX: 0,
  lastY: 0,
  strokeCount: 0,
  strokeLimit: null,
  isDrawer: false,
  points: [],
  strokes: [],
  remoteDrawing: false,
  remoteColor: '#2d2d3f',
  remoteWidth: 3,
  remoteLastX: 0,
  remoteLastY: 0,
  // 关卡机制
  oneStrokeMode: false,
  inkFadeSec: 0,
  brushAnim: null, // 'grow' | 'shrink'
  brushAnimStart: 0,
  mirrorMode: false,
  shakeMode: false,
  canvasRotation: 0, // 当前画布旋转角度

  init() {
    this.canvas = document.getElementById('draw-canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    // Safari: 设置 canvas 自身的 touch-action
    this.canvas.style.touchAction = 'none';
    this.canvas.style.webkitTouchCallout = 'none';
    this.canvas.style.webkitUserSelect = 'none';
    window.addEventListener('resize', () => this._resize());
    this._bindInput();
    this._bindToolbar();
  },

  _resize() {
    const wrapper = document.getElementById('canvas-wrapper');
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;
    const dpr = window.devicePixelRatio || 1;
    // 保存当前画布内容
    let imageData = null;
    try {
      imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    } catch(e) {}
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    // 重绘已有笔画
    this._redraw();
  },

  resizeAfterShow() {
    // 双重 requestAnimationFrame 确保 Safari 布局完成
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this._resize();
      });
    });
  },

  _getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if (e.changedTouches && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    let x = clientX - rect.left;
    let y = clientY - rect.top;
    // 画布旋转时，反向旋转坐标使触摸位置与画面对应
    if (this.canvasRotation !== 0) {
      const cx = rect.width / 2, cy = rect.height / 2;
      const rad = -this.canvasRotation * Math.PI / 180;
      const dx = x - cx, dy = y - cy;
      x = cx + dx * Math.cos(rad) - dy * Math.sin(rad);
      y = cy + dx * Math.sin(rad) + dy * Math.cos(rad);
    }
    return { x, y };
  },

  _bindInput() {
    const c = this.canvas;

    // 使用 Pointer Events (Safari 13+ 支持，比 touch/mouse 更可靠)
    if (window.PointerEvent) {
      c.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        c.setPointerCapture(e.pointerId);
        this._onStart(e);
      }, { passive: false });
      c.addEventListener('pointermove', (e) => {
        e.preventDefault();
        this._onMove(e);
      }, { passive: false });
      c.addEventListener('pointerup', (e) => {
        e.preventDefault();
        this._onEnd();
      }, { passive: false });
      c.addEventListener('pointercancel', (e) => {
        e.preventDefault();
        this._onEnd();
      }, { passive: false });
      // Safari: 也监听 lostpointercapture
      c.addEventListener('lostpointercapture', (e) => {
        this._onEnd();
      });
    } else {
      // 回退到 touch + mouse
      c.addEventListener('touchstart', (e) => { e.preventDefault(); this._onStart(e); }, { passive: false });
      c.addEventListener('touchmove', (e) => { e.preventDefault(); this._onMove(e); }, { passive: false });
      c.addEventListener('touchend', (e) => { e.preventDefault(); this._onEnd(); }, { passive: false });
      c.addEventListener('touchcancel', (e) => { this._onEnd(); });
      c.addEventListener('mousedown', (e) => this._onStart(e));
      c.addEventListener('mousemove', (e) => this._onMove(e));
      c.addEventListener('mouseup', () => this._onEnd());
      c.addEventListener('mouseleave', () => this._onEnd());
    }

    // 阻止 Safari 的默认手势
    c.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
    c.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
  },

  _bindToolbar() {
    document.querySelectorAll('.color-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentColor = btn.dataset.color;
      });
    });
    document.querySelectorAll('.size-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentWidth = parseInt(btn.dataset.width);
      });
    });
  },

  _onStart(e) {
    if (!this.isDrawer) return;
    if (this.strokeLimit && this.strokeCount >= this.strokeLimit) return;
    // 一笔封神：已经画过一笔则锁定
    if (this.oneStrokeMode && this.strokeCount >= 1) return;
    const pos = this._getPos(e);
    if (pos.x < 0 || pos.y < 0) return;
    this.isDrawing = true;
    this.lastX = pos.x;
    this.lastY = pos.y;
    this.points = [pos];
    this.strokeCount++;
    this._updateStrokeDisplay();

    // 计算当前笔刷宽度（笔刷动画）
    let w = this.currentWidth;
    if (this.brushAnim === 'grow') {
      const elapsed = (Date.now() - this.brushAnimStart) / 1000;
      w = Math.min(50, 3 + elapsed * 3); // 每秒+3
    } else if (this.brushAnim === 'shrink') {
      const elapsed = (Date.now() - this.brushAnimStart) / 1000;
      w = Math.max(1, 20 - elapsed * 2); // 每秒-2，从20开始
    }

    // 抖手模式：随机偏移
    let dx = 0, dy = 0;
    if (this.shakeMode) {
      dx = (Math.random() - 0.5) * 10;
      dy = (Math.random() - 0.5) * 10;
    }
    const drawX = pos.x + dx, drawY = pos.y + dy;

    // 画点
    this.ctx.beginPath();
    this.ctx.arc(drawX, drawY, w / 2, 0, Math.PI * 2);
    this.ctx.fillStyle = this.currentColor;
    this.ctx.fill();

    // 镜像模式
    if (this.mirrorMode) {
      const cw = this.canvas.width / (window.devicePixelRatio || 1);
      this.ctx.beginPath();
      this.ctx.arc(cw - drawX, drawY, w / 2, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // 存储并发送（发送变换后的坐标 + 镜像标志）
    this.strokes.push({ type: 'start', x: drawX, y: drawY, color: this.currentColor, width: w, mirror: this.mirrorMode, time: Date.now() });
    WS.send('draw_stroke', { phase: 'start', x: drawX, y: drawY, color: this.currentColor, width: w, mirror: this.mirrorMode });
    if (this.inkFadeSec > 0) this._startInkFade();
  },

  _onMove(e) {
    if (!this.isDrawing || !this.isDrawer) return;
    const pos = this._getPos(e);

    // 计算当前笔刷宽度
    let w = this.currentWidth;
    if (this.brushAnim === 'grow') {
      const elapsed = (Date.now() - this.brushAnimStart) / 1000;
      w = Math.min(50, 3 + elapsed * 3);
    } else if (this.brushAnim === 'shrink') {
      const elapsed = (Date.now() - this.brushAnimStart) / 1000;
      w = Math.max(1, 20 - elapsed * 2);
    }

    // 抖手模式
    let dx = 0, dy = 0;
    if (this.shakeMode) {
      dx = (Math.random() - 0.5) * 10;
      dy = (Math.random() - 0.5) * 10;
    }
    const drawX = pos.x + dx, drawY = pos.y + dy;

    // 画线
    this.ctx.beginPath();
    this.ctx.moveTo(this.lastX, this.lastY);
    this.ctx.lineTo(drawX, drawY);
    this.ctx.strokeStyle = this.currentColor;
    this.ctx.lineWidth = w;
    this.ctx.stroke();

    // 镜像模式
    if (this.mirrorMode) {
      const cw = this.canvas.width / (window.devicePixelRatio || 1);
      this.ctx.beginPath();
      this.ctx.moveTo(cw - this.lastX, this.lastY);
      this.ctx.lineTo(cw - drawX, drawY);
      this.ctx.stroke();
    }

    this.lastX = drawX;
    this.lastY = drawY;

    // 存储并发送
    this.strokes.push({ type: 'move', x: drawX, y: drawY, width: w, mirror: this.mirrorMode, time: Date.now() });
    WS.send('draw_stroke', { phase: 'move', x: drawX, y: drawY, width: w, mirror: this.mirrorMode });
  },

  _onEnd() {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    this.points = [];
    this.strokes.push({ type: 'end' });
    WS.send('draw_stroke', { phase: 'end' });
  },

  // === 远程笔画接收 ===
  onRemoteStrokeStart(data) {
    this.remoteDrawing = true;
    this.remoteColor = data.color || '#2d2d3f';
    this.remoteWidth = data.width || 3;
    this.remoteLastX = data.x;
    this.remoteLastY = data.y;
    this.remoteMirror = !!data.mirror;

    this.ctx.beginPath();
    this.ctx.arc(data.x, data.y, this.remoteWidth / 2, 0, Math.PI * 2);
    this.ctx.fillStyle = this.remoteColor;
    this.ctx.fill();

    // 镜像：绘制对称点
    if (this.remoteMirror) {
      const cw = this.canvas.width / (window.devicePixelRatio || 1);
      this.ctx.beginPath();
      this.ctx.arc(cw - data.x, data.y, this.remoteWidth / 2, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.strokes.push({ type: 'start', x: data.x, y: data.y, color: data.color, width: data.width, mirror: data.mirror, time: Date.now() });
    if (this.inkFadeSec > 0) this._startInkFade();
  },

  onRemoteStrokeMove(data) {
    if (!this.remoteDrawing) return;
    if (data.width) this.remoteWidth = data.width;
    const cw = this.canvas.width / (window.devicePixelRatio || 1);

    // 主线
    this.ctx.beginPath();
    this.ctx.moveTo(this.remoteLastX, this.remoteLastY);
    this.ctx.lineTo(data.x, data.y);
    this.ctx.strokeStyle = this.remoteColor;
    this.ctx.lineWidth = this.remoteWidth;
    this.ctx.stroke();

    // 镜像线
    if (this.remoteMirror) {
      this.ctx.beginPath();
      this.ctx.moveTo(cw - this.remoteLastX, this.remoteLastY);
      this.ctx.lineTo(cw - data.x, data.y);
      this.ctx.stroke();
    }

    this.remoteLastX = data.x;
    this.remoteLastY = data.y;
    this.strokes.push({ type: 'move', x: data.x, y: data.y, width: data.width, mirror: data.mirror, time: Date.now() });
  },

  onRemoteStrokeEnd() {
    this.remoteDrawing = false;
    this.remoteMirror = false;
    this.strokes.push({ type: 'end' });
  },

  onRemoteClear() {
    this.strokes = [];
    this._clearCanvas();
  },

  onRemoteUndo() {
    if (this.strokes.length > 0) {
      let idx = this.strokes.length - 1;
      while (idx > 0 && this.strokes[idx].type !== 'start') idx--;
      this.strokes = this.strokes.slice(0, idx);
      this._redraw();
    }
  },

  undo() {
    if (!this.isDrawer) return;
    if (this.strokes.length === 0) return;
    let idx = this.strokes.length - 1;
    while (idx > 0 && this.strokes[idx].type !== 'start') idx--;
    this.strokes = this.strokes.slice(0, idx);
    this.strokeCount = Math.max(0, this.strokeCount - 1);
    this._updateStrokeDisplay();
    this._redraw();
    WS.send('draw_undo', {});
  },

  clear() {
    if (!this.isDrawer) return;
    this.strokes = [];
    this.strokeCount = 0;
    this._updateStrokeDisplay();
    this._clearCanvas();
    WS.send('draw_clear', {});
  },

  _clearCanvas() {
    const dpr = window.devicePixelRatio || 1;
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();
  },

  _redraw() {
    this._clearCanvas();
    const now = Date.now();
    const fadeSec = this.inkFadeSec || 0;
    const cw = this.canvas.width / (window.devicePixelRatio || 1);
    let curColor = '#2d2d3f';
    let curWidth = 3;
    let drawing = false;
    let lx = 0, ly = 0;
    let curMirror = false;

    for (const s of this.strokes) {
      if (fadeSec > 0 && s.time && (now - s.time) > fadeSec * 1000) {
        if (s.type === 'start') drawing = false;
        continue;
      }

      let alpha = 1;
      if (fadeSec > 0 && s.time) {
        const age = (now - s.time) / 1000;
        alpha = Math.max(0, 1 - age / fadeSec);
      }
      this.ctx.globalAlpha = alpha;

      if (s.type === 'start') {
        curColor = s.color || curColor;
        curWidth = s.width || curWidth;
        curMirror = !!s.mirror;
        lx = s.x; ly = s.y;
        drawing = true;
        this.ctx.beginPath();
        this.ctx.arc(s.x, s.y, curWidth / 2, 0, Math.PI * 2);
        this.ctx.fillStyle = curColor;
        this.ctx.fill();
        if (curMirror) {
          this.ctx.beginPath();
          this.ctx.arc(cw - s.x, s.y, curWidth / 2, 0, Math.PI * 2);
          this.ctx.fill();
        }
      } else if (s.type === 'move' && drawing) {
        this.ctx.beginPath();
        this.ctx.moveTo(lx, ly);
        this.ctx.lineTo(s.x, s.y);
        this.ctx.strokeStyle = curColor;
        this.ctx.lineWidth = curWidth;
        this.ctx.stroke();
        if (curMirror) {
          this.ctx.beginPath();
          this.ctx.moveTo(cw - lx, ly);
          this.ctx.lineTo(cw - s.x, s.y);
          this.ctx.stroke();
        }
        lx = s.x; ly = s.y;
      } else if (s.type === 'end') {
        drawing = false;
      }
    }
    this.ctx.globalAlpha = 1;
  },

  _updateStrokeDisplay() {
    const el = document.getElementById('status-strokes');
    if (el && this.strokeLimit) {
      el.textContent = this.strokeCount + '/' + this.strokeLimit + ' 笔';
      el.style.display = '';
    }
  },

  setDrawer(isDrawer, strokeLimit) {
    this.isDrawer = isDrawer;
    this.strokeLimit = strokeLimit;
    this.strokeCount = 0;
    this.strokes = [];
    this.remoteDrawing = false;
    this._stopInkFade();
    this._clearCanvas();
    const toolbar = document.getElementById('toolbar');
    if (toolbar) toolbar.style.display = isDrawer ? '' : 'none';
    const overlay = document.getElementById('canvas-overlay');
    if (overlay) overlay.style.display = 'none';
  },

  _inkFadeRAF: null,
  _startInkFade() {
    if (this._inkFadeRAF) return;
    const loop = () => {
      if (this.inkFadeSec <= 0) { this._inkFadeRAF = null; return; }
      this._redraw();
      this._inkFadeRAF = requestAnimationFrame(loop);
    };
    this._inkFadeRAF = requestAnimationFrame(loop);
  },
  _stopInkFade() {
    if (this._inkFadeRAF) { cancelAnimationFrame(this._inkFadeRAF); this._inkFadeRAF = null; }
  },

  setHidden(hidden) {
    const overlay = document.getElementById('canvas-overlay');
    if (overlay) overlay.style.display = hidden ? '' : 'none';
    if (hidden) {
      const toolbar = document.getElementById('toolbar');
      if (toolbar) toolbar.style.display = 'none';
    }
  },

  reset() {
    this.strokes = [];
    this.strokeCount = 0;
    this.isDrawing = false;
    this.remoteDrawing = false;
    this.oneStrokeMode = false;
    this.inkFadeSec = 0;
    this.brushAnim = null;
    this.mirrorMode = false;
    this.shakeMode = false;
    this._stopInkFade();
    this._clearCanvas();
  },

  registerHandlers() {
    WS.on('draw_start', (msg) => this.onRemoteStrokeStart(msg));
    WS.on('draw_move', (msg) => this.onRemoteStrokeMove(msg));
    WS.on('draw_end', () => this.onRemoteStrokeEnd());
    WS.on('draw_clear', () => this.onRemoteClear());
    WS.on('draw_undo', () => this.onRemoteUndo());
  }
};
