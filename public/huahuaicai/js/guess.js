/**
 * 猜测输入管理
 */
const Guess = {
  isGuesser: false,

  init() {
    const input = document.getElementById('guess-input');
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.submit();
      });
    }
  },

  submit() {
    if (!this.isGuesser) return;
    const input = document.getElementById('guess-input');
    const text = input.value.trim();
    if (!text) return;
    WS.send('draw_guess', { text });
    input.value = '';
  },

  setResult(result) {
    if (result.correct) {
      this.addMessage('✅ 猜对了！「' + result.word + '」 +' + result.score + '分' + (result.streak > 1 ? ' 🔥连击x' + result.streak : ''), 'correct');
      Anim.correctExplosion(result.word);
    } else {
      this.addMessage('❌ 「' + result.guess + '」 不对哦' + (result.penalty ? ' (-' + result.penalty + '秒)' : ''), 'wrong');
      const input = document.getElementById('guess-input');
      if (input) Anim.shakeElement(input);
    }
  },

  addMessage(text, type = 'system') {
    const container = document.getElementById('guess-messages');
    if (!container) return;
    const msg = document.createElement('div');
    msg.className = 'guess-msg ' + type;
    msg.textContent = text;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  },

  setRole(isGuesser) {
    this.isGuesser = isGuesser;
    const input = document.getElementById('guess-input');
    const btn = document.getElementById('guess-btn');
    if (input) {
      input.disabled = !isGuesser;
      input.placeholder = isGuesser ? '输入你的猜测...' : '等待对方猜测...';
    }
    if (btn) btn.disabled = !isGuesser;
  },

  clear() {
    const container = document.getElementById('guess-messages');
    if (container) container.innerHTML = '';
  },

  registerHandlers() {
    WS.on('guess_result', (msg) => this.setResult(msg));
  }
};
