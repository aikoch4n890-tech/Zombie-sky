// Zombie Sky - servidor da live
// Entrega o jogo (index.html) e repassa chat, presentes e curtidas da live do TikTok para o jogo.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket, { WebSocketServer } from 'ws';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const KEY = process.env.EULER_API_KEY || undefined; // opcional: chave grátis do eulerstream.com
const GAME = path.join(DIR, 'index.html');

// ---------- site ----------
const server = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  if (p === '/health') { res.writeHead(200); return res.end('ok'); }
  if (p === '/resolve') return resolve(new URL(req.url, 'http://x').searchParams.get('url') || '', res);
  if (p !== '/' && p !== '/index.html') { res.writeHead(404); return res.end('Não encontrado'); }
  fs.readFile(GAME, (err, buf) => {
    if (err) { res.writeHead(500); return res.end('index.html não encontrado'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
});

// ---------- link curto da live (vm.tiktok.com/…) -> @ ----------
const TT = /^([\w-]+\.)*tiktok\.com$/i;
async function resolve(link, res) {
  const out = o => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  try {
    let u = new URL(link.trim());
    for (let i = 0; i < 6; i++) {
      if (!TT.test(u.hostname)) return out({ user: '' });
      const m = u.pathname.match(/\/@([\w.]{2,30})/);
      if (m) return out({ user: m[1] });
      const r = await fetch(u, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36' }, signal: AbortSignal.timeout(8000) });
      const loc = r.headers.get('location');
      if (!loc) { const t = (await r.text()).slice(0, 200000); const h = t.match(/tiktok\.com\/@([\w.]{2,30})/); return out({ user: h ? h[1] : '' }); }
      u = new URL(loc, u);
    }
  } catch (e) { console.log('resolve falhou:', e?.message); }
  out({ user: '' });
}

// ---------- ponte TikTok -> jogo (pelo WebSocket do Euler Stream: ele mesmo entra na live) ----------
const rooms = new Map(); // @ -> { up, clients, timer, last }
const wss = new WebSocketServer({ server, path: '/ws' });

const send = (room, obj) => { const s = typeof obj === 'string' ? obj : JSON.stringify(obj); for (const c of room.clients) if (c.readyState === 1) c.send(s); };
const status = (room, st, msg) => { room.last = { status: st, msg }; send(room, room.last); console.log(`[@${room.user}] ${st}: ${msg}`); };
const CLOSE = {
  4404: [20000, u => `@${u} não está ao vivo agora`],
  4005: [20000, () => 'A live terminou'],
  4401: [60000, () => 'Chave EULER_API_KEY inválida: confira no Render'],
  4400: [60000, () => 'O Euler não aceitou esse @'],
  4429: [60000, () => 'Muitas conexões ao mesmo tempo no Euler, esperando'],
  4006: [5000, () => 'A live ficou sem mensagens'],
  4555: [3000, () => 'Reconectando'],
};

function startRoom(room) {
  clearTimeout(room.timer);
  if (room.up || !room.clients.size) return;
  status(room, 'connecting', `Procurando a live de @${room.user}…`);
  const url = (process.env.EULER_WS_URL || 'wss://ws.eulerstream.com') + '?uniqueId=' + encodeURIComponent(room.user) + (KEY ? '&apiKey=' + encodeURIComponent(KEY) : '');
  const up = new WebSocket(url);
  room.up = up;
  let opened = false;
  up.on('open', () => { opened = true; status(room, 'connecting', `Entrando na live de @${room.user}…`); });
  up.on('message', buf => {
    const txt = buf.toString();
    let d; try { d = JSON.parse(txt); } catch { return; }
    if (!room.last || room.last.status !== 'connected') status(room, 'connected', `Conectado à live de @${room.user}`);
    for (const m of d.messages || []) {
      if (m.type === 'room.status' && m.data) {
        const st = m.data.state;
        if (st === 'offline') status(room, 'waiting', `@${room.user} não está ao vivo agora`);
        else if (st === 'connected') status(room, 'connected', `Conectado à live de @${room.user}`);
        else if (st === 'error') status(room, 'waiting', 'Erro no Euler: ' + (m.data.message || '').slice(0, 80));
      }
    }
    send(room, txt);
  });
  up.on('close', (code, reason) => {
    if (room.up !== up) return;
    room.up = null;
    if (!room.clients.size) return;
    const [ms, f] = CLOSE[code] || [10000, () => `Conexão caiu (${code}${reason?.length ? ' ' + reason.toString().slice(0, 60) : ''})`];
    const why = !KEY && !opened && (code === 4401 || code === 1006) ? 'Falta a chave grátis do Euler: coloque EULER_API_KEY no Render' : f(room.user);
    status(room, 'waiting', `${why} · tentando de novo em ${Math.round(ms / 1000)} s`);
    room.timer = setTimeout(() => startRoom(room), ms);
  });
  up.on('error', e => console.log(`[@${room.user}] erro:`, e?.message || e));
}

wss.on('connection', (ws, req) => {
  const user = (new URL(req.url, 'http://x').searchParams.get('user') || '').replace(/^@/, '').trim().toLowerCase();
  if (!/^[\w.]{2,30}$/.test(user)) { ws.send(JSON.stringify({ status: 'error', msg: 'Coloque um @ válido' })); return ws.close(); }
  let room = rooms.get(user);
  if (!room) { room = { user, clients: new Set(), up: null, timer: null, last: null }; rooms.set(user, room); }
  clearTimeout(room.closeTimer);
  room.clients.add(ws);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  if (room.last) ws.send(JSON.stringify(room.last));
  startRoom(room);
  ws.on('close', () => {
    room.clients.delete(ws);
    if (!room.clients.size) room.closeTimer = setTimeout(() => {
      if (room.clients.size) return;
      clearTimeout(room.timer);
      if (room.up) { const u = room.up; room.up = null; try { u.close(); } catch {} }
      rooms.delete(user);
      console.log(`[@${user}] sem jogadores, desconectado`);
    }, 60000);
  });
});

// mantém a conexão do jogo viva (o Render corta conexões paradas)
setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch {} } }, 25000);

server.listen(PORT, () => console.log(`Zombie Sky rodando na porta ${PORT} · chave Euler: ${KEY ? 'configurada' : 'NÃO configurada'}`));
