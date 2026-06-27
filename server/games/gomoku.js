/**
 * 五子棋游戏逻辑
 * 15×15 棋盘，黑先白后，五连获胜
 */

const BOARD_SIZE = 15;

class GomokuGame {
  constructor() {
    this.board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
    this.currentTurn = 'black'; // 黑先
    this.winner = null;
    this.moveHistory = [];
    this.started = false;
  }

  /**
   * 落子
   * @param {number} row - 行 (0-14)
   * @param {number} col - 列 (0-14)
   * @param {string} player - 'black' | 'white'
   * @returns {{ success: boolean, message?: string }}
   */
  makeMove(row, col, player) {
    if (this.winner) {
      return { success: false, message: '游戏已结束' };
    }
    if (!this.started) {
      return { success: false, message: '游戏尚未开始' };
    }
    if (player !== this.currentTurn) {
      return { success: false, message: '还没轮到你' };
    }
    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
      return { success: false, message: '落子位置超出棋盘' };
    }
    if (this.board[row][col] !== null) {
      return { success: false, message: '该位置已有棋子' };
    }

    // 落子
    this.board[row][col] = player;
    this.moveHistory.push({ row, col, player });

    // 检查胜利
    const winLine = this._checkWin(row, col, player);
    if (winLine) {
      this.winner = player;
      return { success: true, gameOver: true, winner: player, winLine };
    }

    // 检查平局
    if (this._isBoardFull()) {
      this.winner = 'draw';
      return { success: true, gameOver: true, winner: 'draw' };
    }

    // 切换回合
    this.currentTurn = this.currentTurn === 'black' ? 'white' : 'black';
    return { success: true, gameOver: false, nextTurn: this.currentTurn };
  }

  /**
   * 检查五连
   */
  _checkWin(row, col, player) {
    const directions = [
      [0, 1],   // 水平
      [1, 0],   // 垂直
      [1, 1],   // 对角线 ↘
      [1, -1],  // 对角线 ↙
    ];

    for (const [dr, dc] of directions) {
      const line = [{ row, col }];
      // 正方向
      for (let i = 1; i < 5; i++) {
        const r = row + dr * i;
        const c = col + dc * i;
        if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && this.board[r][c] === player) {
          line.push({ row: r, col: c });
        } else break;
      }
      // 反方向
      for (let i = 1; i < 5; i++) {
        const r = row - dr * i;
        const c = col - dc * i;
        if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && this.board[r][c] === player) {
          line.unshift({ row: r, col: c });
        } else break;
      }
      if (line.length >= 5) return line;
    }
    return null;
  }

  /**
   * 检查棋盘是否已满
   */
  _isBoardFull() {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (this.board[r][c] === null) return false;
      }
    }
    return true;
  }

  /**
   * 悔棋：撤销最后 n 步
   * @param {number} n - 回退步数
   * @returns {{ success: boolean, removed?: Array, message?: string }}
   */
  undoSteps(n) {
    if (this.moveHistory.length < n) {
      return { success: false, message: `无法回退${n}步，仅有${this.moveHistory.length}步` };
    }
    const removed = [];
    for (let i = 0; i < n; i++) {
      const step = this.moveHistory.pop();
      this.board[step.row][step.col] = null;
      removed.unshift(step);
    }
    // 回退到第一个被移除步骤的玩家回合
    this.currentTurn = removed[0].player;
    this.winner = null;
    return { success: true, removed };
  }

  /**
   * 重置游戏
   */
  reset() {
    this.board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
    this.currentTurn = 'black';
    this.winner = null;
    this.moveHistory = [];
    this.started = true;
  }

  /**
   * 获取游戏状态（用于同步）
   */
  getState() {
    return {
      board: this.board,
      currentTurn: this.currentTurn,
      winner: this.winner,
      moveHistory: this.moveHistory,
      started: this.started,
    };
  }
}

module.exports = { GomokuGame, BOARD_SIZE };
