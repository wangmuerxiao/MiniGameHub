/**
 * 动画管理器
 */
const Anim = {
  // 3-2-1 倒计时动画
  countdown(number, callback) {
    const el = document.getElementById('countdown-number');
    const textEl = document.getElementById('countdown-text');
    el.textContent = number;
    el.style.animation = 'none';
    void el.offsetHeight;
    el.style.animation = 'countdownPulse 1s ease-in-out';

    const texts = { 3: '准备好了吗？', 2: '集中注意力！', 1: '即将开始！' };
    textEl.textContent = texts[number] || '开始！';

    if (callback) setTimeout(callback, 900);
  },

  // 彩带效果
  confetti(count = 50) {
    const colors = ['#ff6b6b','#ffa94d','#ffd43b','#51cf66','#4dabf7','#cc5de8','#f06595'];
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = 'confetti-piece';
      el.style.left = Math.random() * 100 + 'vw';
      el.style.background = colors[Math.floor(Math.random() * colors.length)];
      el.style.width = (Math.random() * 8 + 6) + 'px';
      el.style.height = (Math.random() * 8 + 6) + 'px';
      el.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
      el.style.animationDuration = (Math.random() * 2 + 2) + 's';
      el.style.animationDelay = Math.random() * 0.5 + 's';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 4500);
    }
  },

  // 猜对爆炸
  correctExplosion(word) {
    const el = document.createElement('div');
    el.className = 'correct-explosion';
    el.textContent = '✅ ' + word;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1200);
    // Screen shake
    document.body.classList.add('screen-shake');
    setTimeout(() => document.body.classList.remove('screen-shake'), 400);
  },

  // 关卡通过动画
  levelComplete(title) {
    this.confetti(80);
    const el = document.createElement('div');
    el.style.cssText = `
      position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      font-size:3rem;font-weight:900;z-index:10000;pointer-events:none;
      background:linear-gradient(135deg,#ffd43b,#ff6b6b);
      -webkit-background-clip:text;-webkit-text-fill-color:transparent;
      animation:correctExplode 1.5s ease forwards;
    `;
    el.textContent = '🎉 ' + title + ' 🎉';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
  },

  // SSS 特效
  sssEffect() {
    const overlay = document.createElement('div');
    overlay.className = 'sss-overlay';
    for (let i = 0; i < 12; i++) {
      const ray = document.createElement('div');
      ray.className = 'sss-ray';
      ray.style.animationDelay = (i * 0.25) + 's';
      ray.style.transform = `rotate(${i * 30}deg)`;
      overlay.appendChild(ray);
    }
    document.body.appendChild(overlay);
    this.confetti(100);
    setTimeout(() => overlay.remove(), 5000);
  },

  // 输入框震动
  shakeElement(el) {
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 500);
  },

  // 浮动涂鸦背景
  initFloatingDoodles() {
    const container = document.getElementById('floating-doodles');
    if (!container) return;
    const doodles = ['🍎','🐶','✈️','⚽','☂️','🐱','🎸','🌈','🚀','🎯','🎨','🖌️','✏️','🌟','🎵'];
    for (let i = 0; i < 15; i++) {
      const d = document.createElement('div');
      d.className = 'doodle';
      d.textContent = doodles[Math.floor(Math.random() * doodles.length)];
      d.style.left = Math.random() * 100 + '%';
      d.style.fontSize = (Math.random() * 1.5 + 1.5) + 'rem';
      d.style.animationDuration = (Math.random() * 15 + 15) + 's';
      d.style.animationDelay = -(Math.random() * 30) + 's';
      container.appendChild(d);
    }
  },

  // 定时器警告
  setTimerWarning(level) {
    const timerEl = document.getElementById('hud-timer');
    if (!timerEl) return;
    timerEl.classList.remove('warning', 'danger');
    document.body.classList.remove('timer-danger');
    if (level === 'danger') {
      timerEl.classList.add('danger');
      document.body.classList.add('timer-danger');
    } else if (level === 'warning') {
      timerEl.classList.add('warning');
    }
  }
};
