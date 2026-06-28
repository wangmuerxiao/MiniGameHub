# 游戏平台开发者对接文档

## 项目架构

```
小游戏/
├── server/
│   ├── server.js            # 主服务器：房间管理、消息路由、WebRTC 信令、游戏 API
│   ├── package.json
│   ├── games/
│   │   ├── gomoku.js        # 五子棋游戏逻辑
│   │   └── drawguess.js     # 默契画猜游戏逻辑（18关 + 无限模式）
│   └── test/
│       └── test.js          # 自动化测试脚本
├── public/
│   ├── index.html           # 大厅入口：游戏选择
│   ├── css/style.css        # 公共样式
│   ├── js/
│   │   ├── lobby.js         # 大厅逻辑：WebSocket 连接、房间创建/加入、自动重连
│   │   └── gomoku.js        # 五子棋客户端：Canvas 棋盘、落子、观战、WebRTC 语音
│   ├── shudu/               # 数独游戏
│   │   ├── index.html
│   │   ├── css/style.css
│   │   └── js/game.js
│   ├── huahuaicai/          # 默契画猜游戏
│   │   ├── index.html
│   │   ├── README.md        # 详细文档
│   │   ├── css/style.css
│   │   └── js/
│   │       ├── app.js       # 应用入口
│   │       ├── canvas.js    # 画板管理
│   │       ├── game.js      # 游戏状态 + 关卡机制
│   │       ├── guess.js     # 猜测逻辑
│   │       ├── levels.js    # 关卡配置
│   │       ├── room.js      # 房间管理
│   │       ├── voice.js     # WebRTC 语音
│   │       └── ws.js        # WebSocket 通信
│   └── voicetest/           # 语音调试页面
│       └── index.html
└── shudu/                   # 旧版数独（未使用，可删除）
```

## 如何新增一个游戏

### 步骤概览

1. **创建游戏目录** `public/新游戏名/`
2. **创建游戏文件** HTML、CSS、JS
3. **添加服务端 API**（如果需要）
4. **在主页添加入口卡片**
5. **测试并部署**

### 详细步骤

#### 1. 创建游戏目录结构

```bash
mkdir -p public/新游戏名/css public/新游戏名/js
```

#### 2. 创建游戏页面 `public/新游戏名/index.html`

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>游戏名称</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <!-- 游戏内容 -->
  <script src="js/game.js"></script>
</body>
</html>
```

#### 3. 创建游戏逻辑 `public/新游戏名/js/game.js`

```javascript
// 游戏状态
let gameState = {};

// 初始化游戏
function initGame() {
  // 初始化逻辑
}

// 返回主页
function goBack() {
  window.location.href = '/';
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  initGame();
});
```

#### 4. 添加服务端 API（如需要）

在 `server/server.js` 中添加：

```javascript
// 游戏 API
if (url === '/api/新游戏名/xxx') {
  // 处理逻辑
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result));
  return;
}
```

#### 5. 在主页添加入口卡片

在 `public/index.html` 的 `<div class="game-grid">` 中添加：

```html
<!-- 新游戏卡片 -->
<div class="game-card" data-game="新游戏名" onclick="window.location.href='新游戏名/index.html'">
  <div class="game-card-glow"></div>
  <div class="game-card-content">
    <div class="game-icon">
      <!-- 图标 SVG -->
    </div>
    <h2 class="game-name">游戏名称</h2>
    <p class="game-desc">游戏描述</p>
    <span class="game-badge">单人/多人</span>
  </div>
</div>
```

#### 6. 添加 npm 依赖（如需要）

```bash
cd server
npm install 包名
```

---

## 现有游戏列表

### 五子棋 (gomoku)

- **类型**：双人对弈
- **目录**：`public/` (主页)
- **功能**：对弈、观战、语音聊天、悔棋、比分

### 数独 (shudu)

- **类型**：单人解谜
- **目录**：`public/shudu/`
- **功能**：简单/中等/困难难度、提示、计时
- **依赖**：qqwing (npm)

### 默契画猜 (huahuaicai)

- **类型**：双人合作
- **目录**：`public/huahuaicai/`
- **服务端**：`server/games/drawguess.js`
- **功能**：18 关闯关 + 无限模式、WebRTC 语音、1368 词库、关卡机制系统
- **详细文档**：`public/huahuaicai/README.md`

---

## 文件修改清单

每次修改后，需要上传以下文件到服务器：

### 修改类型说明

| 类型 | 说明 | 需要上传 |
|------|------|----------|
| 前端修改 | HTML/CSS/JS | `public/` 目录下对应文件 |
| 后端修改 | 服务器逻辑 | `server/server.js` |
| 新增依赖 | npm 包 | `server/package.json` + 运行 `npm install` |
| 新增游戏 | 新目录 | 整个 `public/新游戏名/` 目录 |

### 示例

**修改五子棋棋盘大小**：
- 修改文件：`public/css/style.css`
- 上传：`public/css/style.css`

**添加数独游戏**：
- 新增文件：`public/shudu/` 整个目录
- 修改文件：`public/index.html`、`server/server.js`
- 新增依赖：`server/package.json`
- 上传：以上所有文件 + 运行 `npm install qqwing`

**修改语音功能**：
- 修改文件：`public/js/gomoku.js`
- 上传：`public/js/gomoku.js`

---

## WebSocket 消息协议

所有消息均为 JSON。

### 房间管理

| 消息 | 方向 | 参数 | 说明 |
|---|---|---|---|
| `create_room` | C→S | `{ game }` | 创建房间，随机分配颜色 |
| `join_room` | C→S | `{ roomCode, rejoinColor? }` | 加入房间，rejoinColor 用于重连 |
| `room_created` | S→C | `{ roomCode, color }` | 房间创建成功 |
| `game_state` | S→C | `{ board, currentTurn, role, score, ... }` | 完整状态同步（重连/观战） |
| `game_start` | S→C | `{ color, currentTurn }` | 双方就绪/新局开始，每局随机先手 |

### 对弈

| 消息 | 方向 | 参数 | 说明 |
|---|---|---|---|
| `make_move` | C→S | `{ row, col }` | 落子（行/列 0-14） |
| `move_made` | S→C | `{ row, col, player, currentTurn }` | 落子确认（广播所有人） |
| `game_over` | S→C | `{ winner, winLine, score }` | 游戏结束 winner=black/white/draw，包含比分 |

### WebRTC 语音信令

| 消息 | 方向 | 参数 | 说明 |
|---|---|---|---|
| `voice_start` | C→S | — | 通知房间内所有人我已开麦 |
| `voice_start` | S→C | `{ from }` | 转发开麦通知（附带发送者 ID） |
| `webrtc_offer` | C→S | `{ sdp, to }` | 发送 SDP Offer（指定接收者） |
| `webrtc_offer` | S→C | `{ sdp, from }` | 转发 Offer（附带发送者 ID） |
| `webrtc_answer` | C→S | `{ sdp, to }` | 发送 SDP Answer（指定接收者） |
| `webrtc_answer` | S→C | `{ sdp, from }` | 转发 Answer（附带发送者 ID） |
| `webrtc_ice_candidate` | C→S | `{ candidate, to }` | 发送 ICE Candidate（指定接收者） |
| `webrtc_ice_candidate` | S→C | `{ candidate, from }` | 转发 ICE Candidate（附带发送者 ID） |

### 默契画猜消息

| 消息 | 方向 | 参数 | 说明 |
|---|---|---|---|
| `draw_start` | C→S | `{ mode }` | 开始游戏 |
| `round_start` | S→C | `{ round, level, role, word, time, mechanics, ... }` | 回合开始 |
| `draw_stroke` | C→S | `{ phase, x, y, color, width, mirror }` | 笔画事件 |
| `draw_start` / `draw_move` / `draw_end` | S→C | `{ x, y, color, width, mirror }` | 转发笔画 |
| `draw_clear` | S→C | — | 清空画布 |
| `draw_undo` | S→C | — | 撤销笔画 |
| `timer_tick` | S→C | `{ time }` | 计时器 |
| `guess_submit` | C→S | `{ text }` | 提交猜测 |
| `guess_result` | S→C | `{ correct, guess, word, score, streak }` | 猜测结果 |
| `hint_request` | C→S | — | 请求提示 |
| `hint_result` | S→C | `{ hint, length, trick? }` | 提示结果 |
| `draw_next` | C→S | — | 进入下一关 |
| `level_complete` | S→C | `{ stats }` | 关卡完成 |
| `game_over` | S→C | `{ stats, grade, guessLogs }` | 游戏结束 |

---

## 房间模型

```javascript
room = {
  game: 'gomoku',
  gameInstance: <GomokuGame>,
  roomCode: 'ABC123',
  players: Map<ws, {color}>,       // 对弈者，最多 2 人
  spectators: Set<ws>,             // 观战者，无上限
  disconnectedSlots: Set,          // 断线玩家颜色 {'black','white'}
  score: { black: 0, white: 0 },   // 比分记录
  _pendingUndo: {from, fromColor, steps},  // 待处理悔棋请求
  _destroyTimer: timeout,          // 60s 延迟销毁定时器
  _disconnectTimer: {}             // 断线定时器（延迟发送断线通知）
}
```

---

## 功能说明

### 语音聊天（WebRTC）

- 使用 WebRTC 点对点音频传输
- 支持多人同时语音（每个参与者建立独立连接）
- STUN 服务器：Google 公共 STUN
- 信令通过 WebSocket 转发（支持点对点，通过 `to` 字段指定接收者）
- 关麦只静音，不断开连接
- 断线后自动重连并恢复语音

### 自动重连

- WebSocket 断开后自动重连（1 秒延迟）
- 重连时发送 `rejoinColor` 参数，服务端识别为重连
- 重连后自动恢复游戏状态和语音连接
- 浏览器切后台再切回前台也会触发重连检查

### 比分系统

- 每局游戏结束更新比分
- 比分存储在房间对象中
- 客户端实时显示双方比分

### 随机先手

- 每局开始随机分配先手颜色
- 再来一局时也会重新随机分配

---

## 定时器

- 客户端心跳：15s ping，连丢 3 次判定断开
- 服务端心跳：25s WebSocket ping（原生）
- 空房间销毁：60s 延迟 + 5min 兜底
- 断线通知：2s 延迟（避免短暂断线误报）

---

## 部署

```bash
cd server
npm install
pm2 restart game-platform
```

Nginx 配置（`location ^~ /game` 必须加 `^~` 防止 CSS/JS 被拦截）：
```nginx
location ^~ /game {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

---

## 技术栈

- **前端**：原生 HTML/CSS/JavaScript
- **后端**：Node.js + WebSocket (ws 库)
- **语音**：WebRTC（点对点音频）
- **数独生成**：qqwing 库
- **部署**：PM2 + Nginx 反向代理

---

## 本次修改记录

### 2024-XX-XX 添加数独游戏

**修改的文件**：
1. `server/server.js` - 添加数独 API (`/api/sudoku/generate`)
2. `server/package.json` - 添加 qqwing 依赖
3. `public/index.html` - 添加数独游戏卡片入口
4. `public/shudu/index.html` - 新增数独页面
5. `public/shudu/css/style.css` - 新增数独样式
6. `public/shudu/js/game.js` - 新增数独逻辑

**新增依赖**：
- `qqwing` - 数独生成库

**部署步骤**：
1. 上传以上所有文件
2. 在服务器运行 `cd server && npm install qqwing`
3. 重启服务器 `pm2 restart game-platform`
