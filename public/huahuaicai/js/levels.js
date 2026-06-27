/**
 * 关卡配置 + 词库
 */
const Levels = {
  configs: [
    { id: 1,  name: '新手画师',   time: 90,  desc: '90秒 · 有提示 · 教学关' },
    { id: 2,  name: '灵魂画手',   time: 75,  desc: '75秒 · 连错扣时' },
    { id: 3,  name: '极速挑战',   time: 45,  desc: '45秒 · 无提示' },
    { id: 4,  name: '三笔大师',   time: 60,  desc: '60秒 · 最多3笔' },
    { id: 5,  name: '盲画危机',   time: 60,  desc: '60秒 · 看不到画布' },
    { id: 6,  name: '一笔封神',   time: 60,  desc: '60秒 · 只能画一笔' },
    { id: 7,  name: '隐形墨水',   time: 75,  desc: '75秒 · 笔画3秒消失' },
    { id: 8,  name: '越来越粗',   time: 60,  desc: '60秒 · 笔刷自动变粗' },
    { id: 9,  name: '越来越细',   time: 60,  desc: '60秒 · 笔刷自动变细' },
    { id: 10, name: '倒计时爆炸', time: 60,  desc: '60秒 · 每10秒清空画布' },
    { id: 11, name: '画布旋转',   time: 75,  desc: '75秒 · 画布每5秒旋转' },
    { id: 12, name: '反向提示',   time: 75,  desc: '75秒 · 提示是假的' },
    { id: 13, name: '只能画不能说', time: 60, desc: '60秒 · 关闭语音' },
    { id: 14, name: '反义词挑战', time: 75,  desc: '75秒 · 只能说反义描述' },
    { id: 15, name: '相反画法',   time: 60,  desc: '60秒 · 画相反的东西' },
    { id: 16, name: '抽象大师',   time: 90,  desc: '90秒 · 语音为主' },
    { id: 17, name: '幸运轮盘',   time: 60,  desc: '60秒 · 随机负面BUFF' },
    { id: 18, name: '史诗Boss关', time: 180, desc: '180秒 · 连战10词' },
  ],

  grades: [
    { grade: 'SSS', minAcc: 0.95, minStreak: 15, label: '无需语言',   message: '你们已经不需要说话了。', icon: '🌟' },
    { grade: 'SS',  minAcc: 0.90, minStreak: 10, label: '双人成神',   message: '默契度突破天际！',       icon: '✨' },
    { grade: 'S',   minAcc: 0.85, minStreak: 7,  label: '灵魂共鸣',   message: '心有灵犀一点通！',       icon: '🏆' },
    { grade: 'A',   minAcc: 0.75, minStreak: 5,  label: '心有灵犀',   message: '你们的默契令人羡慕！',   icon: '🎉' },
    { grade: 'B',   minAcc: 0.60, minStreak: 3,  label: '默契搭档',   message: '配合越来越好了！',       icon: '👍' },
    { grade: 'C',   minAcc: 0.40, minStreak: 0,  label: '普通朋友',   message: '还需要更多磨合。',       icon: '😊' },
    { grade: 'D',   minAcc: 0,    minStreak: 0,  label: '初识阶段',   message: '默契之路才刚开始。',     icon: '🤝' },
  ],

  getConfig(level) {
    return this.configs[level - 1] || this.configs[0];
  },

  getGrade(stats) {
    const acc = stats.totalRounds > 0 ? stats.correctGuesses / stats.totalRounds : 0;
    const streak = stats.maxStreak;
    for (const g of this.grades) {
      if (acc >= g.minAcc && streak >= g.minStreak) return g;
    }
    return this.grades[this.grades.length - 1];
  },

  getGradeClass(grade) {
    return 'grade-' + grade.grade;
  }
};
