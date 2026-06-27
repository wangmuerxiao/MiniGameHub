# 🎮 MiniGameHub - 多人联机小游戏平台

一个基于 WebSocket 的实时多人联机小游戏平台，支持多种经典游戏，让玩家可以邀请好友一起在线游戏。

## ✨ 特性

- 🎯 **实时对战** - 基于 WebSocket 的实时通信，低延迟游戏体验
- 🏠 **房间系统** - 创建/加入房间，支持房间密码保护
- 👥 **多人游戏** - 支持 2-4 人同时在线游戏
- 🎨 **精美界面** - 现代化 UI 设计，流畅的动画效果
- 📱 **响应式** - 支持 PC 和移动端访问
- 🔄 **断线重连** - 自动重连机制，游戏不中断
- 👁️ **观战模式** - 支持观战其他玩家的游戏

## 🎯 支持的游戏

### 1. 五子棋 (Gomoku)
- 经典双人对弈游戏
- 五子连珠获胜
- 支持观战和接手

### 2. 你画我猜 (Draw & Guess)
- 多人绘画猜词游戏
- 实时绘画同步
- 语音提示功能

### 3. 数独 (Sudoku)
- 协作解谜模式
- 多种难度级别
- 实时同步进度

## 🚀 快速开始

### 环境要求

- Node.js >= 14.0.0
- npm >= 6.0.0

### 安装步骤

1. **克隆仓库**
```bash
git clone https://github.com/wangmuerxiao/MiniGameHub.git
cd MiniGameHub
```

2. **安装后端依赖**
```bash
cd server
npm install
```

3. **启动服务器**
```bash
# 生产模式
npm start

# 开发模式（自动重启）
npm run dev
```

4. **访问游戏**
打开浏览器访问：`http://localhost:3000`

## 📁 项目结构

```
MiniGameHub/
├── public/                    # 前端静态文件
│   ├── index.html            # 主页面（游戏大厅）
│   ├── css/
│   │   └── style.css        # 主样式文件
│   ├── js/
│   │   ├── lobby.js         # 游戏大厅逻辑
│   │   └── gomoku.js        # 五子棋游戏逻辑
│   ├── shudu/               # 数独游戏
│   │   ├── index.html
│   │   ├── css/style.css
│   │   └── js/game.js
│   └── huahuaicai/          # 你画我猜游戏
│       ├── index.html
│       ├── css/style.css
│       └── js/
├── server/                    # 后端服务
│   ├── server.js             # 主服务器
│   ├── games/                # 游戏逻辑
│   │   ├── gomoku.js        # 五子棋逻辑
│   │   └── drawguess.js     # 你画我猜逻辑
│   └── package.json
├── .gitignore
└── README.md
```

## 🔧 配置说明

### 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `PORT` | `3000` | 服务器监听端口 |

### 自定义配置

在 `server/server.js` 中可以修改以下配置：

```javascript
const PORT = process.env.PORT || 3000;  // 服务器端口
```

## 🌐 部署指南

### 本地部署

```bash
# 1. 克隆项目
git clone https://github.com/wangmuerxiao/MiniGameHub.git
cd MiniGameHub

# 2. 安装依赖
cd server && npm install

# 3. 启动服务
npm start
```

### 云服务器部署

#### 使用 PM2 部署（推荐）

```bash
# 1. 安装 PM2
npm install -g pm2

# 2. 进入项目目录
cd MiniGameHub/server

# 3. 安装依赖
npm install

# 4. 使用 PM2 启动
pm2 start server.js --name "minigamehub"

# 5. 设置开机自启
pm2 startup
pm2 save
```

#### 使用 Docker 部署

```dockerfile
# Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "server/server.js"]
```

```bash
# 构建镜像
docker build -t minigamehub .

# 运行容器
docker run -d -p 3000:3000 --name minigamehub minigamehub
```

### Nginx 反向代理配置

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## 🎮 游戏玩法

### 五子棋
1. 进入游戏大厅，点击"五子棋"卡片
2. 创建房间或加入已有房间
3. 等待对手加入
4. 轮流落子，先形成五子连珠者获胜

### 你画我猜
1. 进入游戏大厅，点击"你画我猜"卡片
2. 创建房间并邀请好友
3. 轮流担任画手，其他玩家猜词
4. 猜对得分，最终得分最高者获胜

### 数独
1. 进入游戏大厅，点击"数独"卡片
2. 选择难度级别
3. 与搭档协作完成数独
4. 合理分工，共同解谜

## 🛠️ 技术栈

### 后端
- **Node.js** - 运行环境
- **WebSocket (ws)** - 实时通信
- **HTTP Server** - 静态文件服务

### 前端
- **HTML5 Canvas** - 游戏渲染
- **CSS3** - 样式和动画
- **原生 JavaScript** - 游戏逻辑
- **WebSocket API** - 实时通信

## 📝 开发说明

### 添加新游戏

1. 在 `server/games/` 目录创建新的游戏逻辑文件
2. 在 `server/server.js` 中注册新游戏
3. 在 `public/` 目录创建对应的前端文件
4. 在游戏大厅添加游戏入口

### 代码规范

- 使用 ES6+ 语法
- 保持代码简洁清晰
- 添加必要的注释
- 遵循现有代码风格

## 🤝 贡献指南

欢迎贡献代码！请遵循以下步骤：

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 👨‍💻 作者

**阿标科技** - [wangmuerxiao](https://github.com/wangmuerxiao)

## 🙏 致谢

感谢所有为这个项目做出贡献的开发者！

---

⭐ 如果觉得这个项目不错，请给个 Star 支持一下！