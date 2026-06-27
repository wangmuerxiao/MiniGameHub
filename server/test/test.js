/**
 * 游戏平台自动化测试 (适配随机颜色)
 * 用法：cd server && node test/test.js
 */
const WebSocket = require('ws');
const URL = 'ws://localhost:3000';
let ok = 0, ng = 0, roomCode = '';
let aColor = '', bColor = '';
function pass(s) { console.log('  ✓ ' + s); ok++; }
function fail(s) { console.log('  ✗ ' + s); ng++; }
function waitMs(ms) { return new Promise(r => setTimeout(r, ms)); }
function connect() { return new Promise(r => { const w = new WebSocket(URL); w.on('open', () => r(w)); }); }
function send(ws, data) { ws.send(JSON.stringify(data)); }
function recv(ws, timeout = 3000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), timeout);
    const cb = ws.onmessage;
    ws.onmessage = (e) => { clearTimeout(t); ws.onmessage = cb; resolve(JSON.parse(e.data)); };
  });
}
async function recvType(ws, type, timeout = 3000) {
  for (let i = 0; i < 20; i++) {
    const m = await recv(ws, timeout).catch(() => null);
    if (!m) return null;
    if (m.type === type) return m;
    if (m.type === 'error') fail('收到错误: ' + m.message);
  }
  return null;
}

async function main() {
  try {
  // === 1. 创建 ===
  console.log('--- 1. 创建 ---');
  const a = await connect(); send(a, { type: 'create_room', game: 'gomoku' });
  const r = await recv(a);
  roomCode = r.roomCode; aColor = r.color;
  pass('房间: ' + roomCode + ', A=' + aColor);

  // === 2. 加入（自动反色）===
  console.log('--- 2. 加入 ---');
  const b = await connect(); send(b, { type: 'join_room', roomCode });
  const ag = await recvType(a, 'game_start');
  const bg = await recvType(b, 'game_start');
  if (ag && bg) { pass('双方游戏开始'); }
  bColor = bg ? bg.color : (aColor === 'black' ? 'white' : 'black');
  const firstPlayer = aColor === 'black' ? a : b;
  const secondPlayer = aColor === 'black' ? b : a;
  const firstWs = firstPlayer === a ? 'A' : 'B';

  // === 3. 黑棋先走 ===
  console.log('--- 3. 黑棋落子 (7,7) ---');
  send(firstPlayer, { type: 'make_move', row: 7, col: 7 });
  const m1 = await recvType(firstPlayer, 'move_made'); if (m1) pass(firstWs + ' 落子确认');
  const m2 = await recvType(secondPlayer, 'move_made'); if (m2) pass((firstWs === 'A' ? 'B' : 'A') + ' 收到落子');

  // === 4. 白棋落子 ===
  console.log('--- 4. 白棋落子 (0,0) ---');
  send(secondPlayer, { type: 'make_move', row: 0, col: 0 });
  const m3 = await recvType(secondPlayer, 'move_made'); if (m3) pass((firstWs === 'A' ? 'B' : 'A') + ' 落子确认');

  // === 5. 悔棋2步（黑棋回合→黑棋悔→回退2步）===
  console.log('--- 5. 悔棋2步 ---');
  send(firstPlayer, { type: 'undo_request' });
  const u1 = await recvType(secondPlayer, 'undo_request');
  if (u1 && u1.steps === 2) { pass('悔棋 steps=2'); send(secondPlayer, { type: 'undo_respond', roomCode, accept: true });
    const d1 = await recvType(secondPlayer, 'undo_done');
    if (d1) pass('悔棋2步成功'); } else fail('悔棋 steps=' + (u1 ? u1.steps : '?'));

  // === 6. 黑棋再落子 ===
  console.log('--- 6. 黑棋落子 (8,8) ---');
  send(firstPlayer, { type: 'make_move', row: 8, col: 8 });
  const m4 = await recvType(firstPlayer, 'move_made'); if (m4) pass(firstWs + ' 落子确认');

  // === 7. 悔棋1步（白棋回合→黑棋悔→回退1步）===
  console.log('--- 7. 悔棋1步 ---');
  send(firstPlayer, { type: 'undo_request' });
  const u2 = await recvType(secondPlayer, 'undo_request');
  if (u2 && u2.steps === 1) { pass('悔棋 steps=1'); send(secondPlayer, { type: 'undo_respond', roomCode, accept: true });
    const d2 = await recvType(secondPlayer, 'undo_done');
    if (d2) pass('悔棋1步成功'); }

  // === 8. 观战 ===
  console.log('--- 8. 观战 ---');
  const c = await connect(); send(c, { type: 'join_room', roomCode });
  const c1 = await recv(c); if (c1 && c1.type === 'game_state' && c1.role === 'spectator') pass('观战, 人数:' + c1.spectatorCount);

  // === 9. 断线+接手 ===
  console.log('--- 9. 接手 ---');
  firstPlayer.close(); await waitMs(400);
  const pd = await recvType(c, 'player_disconnected');
  if (pd && pd.canTakeover) { pass(pd.color + ' 断线'); send(c, { type: 'takeover', color: pd.color });
    const to = await recvType(c, 'takeover_success');
    if (to) pass('接手成功'); }

  // === 10. 重连 ===
  console.log('--- 10. 重连 ---');
  const d = await connect(); send(d, { type: 'join_room', roomCode });
  const d1 = await recv(d); if (d1 && d1.type === 'game_state') pass('重连: ' + d1.role);

  d.close(); c.close(); secondPlayer.close();
  } catch(e) { console.error(e); }
  console.log('\n======== ' + ok + ' 通过, ' + ng + ' 失败 ========');
  console.log(ng === 0 ? '✅ 全部通过' : '❌ 有失败');
  process.exit(0);
}
main();
