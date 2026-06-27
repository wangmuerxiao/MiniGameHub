/**
 * 数独游戏服务器
 * 独立于五子棋项目
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const qqwing = require('qqwing');

const PORT = 3001;

// --- 静态文件服务 ---
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// 解析 qqwing 字符串为数组
function parseSudoku(str) {
  const result = [];
  const lines = str.split('\n');
  for (const line of lines) {
    if (line.includes('---') || line.trim() === '') continue;
    const row = [];
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch >= '1' && ch <= '9') {
        row.push(parseInt(ch));
      } else if (ch === '.' || ch === '0') {
        row.push(0);
      }
    }
    if (row.length === 9) {
      result.push(row);
    }
  }
  return result;
}

// 获取给定数量（提示数量）
function getGivenCount(puzzle) {
  let count = 0;
  for (const row of puzzle) {
    for (const cell of row) {
      if (cell !== 0) count++;
    }
  }
  return count;
}

// 生成数独谜题 API
function generatePuzzle(difficulty) {
  // 根据难度设置目标给定数量范围
  // qqwing 生成的谜题通常给定数较少，调整范围
  const difficultyRanges = {
    easy: { min: 30, max: 40 },    // 简单：30-40 个给定
    medium: { min: 25, max: 29 },  // 中等：25-29 个给定
    hard: { min: 20, max: 24 }     // 困难：20-24 个给定
  };

  const range = difficultyRanges[difficulty] || difficultyRanges.easy;
  const maxAttempts = 100; // 最大尝试次数

  let bestPuzzle = null;
  let bestDiff = Infinity;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const puzzle = new qqwing();
    puzzle.generatePuzzleSymmetry(qqwing.Symmetry.RANDOM);

    const puzzleStr = puzzle.getPuzzleString();
    const solutionStr = puzzle.getSolutionString();
    const puzzleArray = parseSudoku(puzzleStr);
    const solutionArray = parseSudoku(solutionStr);
    const givenCount = getGivenCount(puzzleArray);

    // 检查是否在目标难度范围内
    if (givenCount >= range.min && givenCount <= range.max) {
      // 验证解答
      const solved = puzzle.solve();
      if (solved) {
        return {
          puzzle: puzzleArray,
          solution: solutionArray,
          difficulty: difficulty,
          givenCount: givenCount
        };
      }
    }

    // 记录最接近目标的谜题
    const mid = (range.min + range.max) / 2;
    const diff = Math.abs(givenCount - mid);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestPuzzle = {
        puzzle: puzzleArray,
        solution: solutionArray,
        difficulty: difficulty,
        givenCount: givenCount
      };
    }
  }

  // 返回最接近目标的谜题
  return bestPuzzle;
}

const server = http.createServer((req, res) => {
  let url = req.url.split('?')[0];

  // API: 生成谜题
  if (url === '/api/generate') {
    const params = new URL(req.url, `http://localhost:${PORT}`).searchParams;
    const difficulty = params.get('difficulty') || 'easy';

    try {
      const result = generatePuzzle(difficulty);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 静态文件服务
  if (url === '/' || url === '/shudu' || url === '/shudu/') url = '/index.html';
  if (url.startsWith('/shudu/')) url = url.slice(6);

  const filePath = path.join(__dirname, '..', 'public', url);
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    }
  });
});

server.listen(PORT, () => {
  console.log(`数独服务器运行在 http://localhost:${PORT}`);
  console.log('联机模式预留 WebSocket，暂未实现');
});
