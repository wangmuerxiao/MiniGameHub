/**
 * 结算页面
 */
const Result = {
  show(stats, gradeData, guessLogs) {
    // Grade info
    const grade = gradeData || Levels.getGrade(stats);
    document.getElementById('result-icon').textContent = grade.icon;
    document.getElementById('result-title').textContent = stats.mode === 'infinite' ? '游戏结束' : '闯关结束';
    document.getElementById('grade-letter').textContent = grade.grade;
    document.getElementById('grade-label').textContent = grade.label;
    document.getElementById('result-message').textContent = grade.message;

    // Grade class
    const gradeEl = document.getElementById('result-grade');
    gradeEl.className = 'result-grade ' + Levels.getGradeClass(grade);

    // Stats
    const statsEl = document.getElementById('result-stats');
    const minutes = Math.floor(stats.totalTime / 60);
    const seconds = stats.totalTime % 60;
    const timeStr = minutes > 0 ? minutes + '分' + seconds + '秒' : seconds + '秒';

    statsEl.innerHTML = `
      <div class="stat-card">
        <div class="stat-card-value">${stats.totalRounds}</div>
        <div class="stat-card-label">完成回合</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-value">${stats.correctGuesses}</div>
        <div class="stat-card-label">猜对词语</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-value">${stats.maxStreak}</div>
        <div class="stat-card-label">最高连击</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-value">${stats.accuracy}%</div>
        <div class="stat-card-label">正确率</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-value">${stats.totalScore}</div>
        <div class="stat-card-label">总得分</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-value">${timeStr}</div>
        <div class="stat-card-label">游戏时长</div>
      </div>
    `;

    // SSS effect
    if (grade.grade === 'SSS') {
      setTimeout(() => Anim.sssEffect(), 500);
    } else if (grade.grade === 'SS' || grade.grade === 'S') {
      Anim.confetti(60);
    }

    // Store guessLogs for future AI
    this._lastGuessLogs = guessLogs || [];

    App.showView('view-result');
  },

  _lastGuessLogs: [],

  showAIReport() {
    App.showToast('🤖 AI默契分析即将上线！');
  }
};
