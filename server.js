// Zombie Sky - servidor da live
// Entrega o jogo (index.html) e repassa chat, presentes e curtidas da live do TikTok para o jogo.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';

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

// ---------- ponte TikTok -> jogo ----------
const rooms = new Map(); // @ -> { conn, clients, timer, closing }
const wss = new WebSocketServer({ server, path: '/ws' });

const send = (room, obj) => { const s = JSON.stringify(obj); for (const c of room.clients) if (c.readyState === 1) c.send(s); };
const status = (room, st, msg) => { room.last = { status: st, msg }; send(room, room.last); console.log(`[@${room.user}] ${st}: ${msg}`); };
const usr = u => ({ uniqueId: u?.uniqueId || u?.userId || '', nickname: u?.nickname || u?.uniqueId || '' });

function startRoom(room) {
  clearTimeout(room.timer);
  if (room.conn || !room.clients.size) return;
  status(room, 'connecting', `Procurando a live de @${room.user}…`);
  const conn = new TikTokLiveConnection(room.user, { signApiKey: KEY, enableExtendedGiftInfo: true });
  room.conn = conn;

  conn.on(WebcastEvent.CHAT, d => send(room, { messages: [{ type: 'chat', user: usr(d.user), comment: d.comment || '' }] }));
  conn.on(WebcastEvent.LIKE, d => send(room, { messages: [{ type: 'like', user: usr(d.user), likeCount: d.likeCount || 1 }] }));
  conn.on(WebcastEvent.GIFT, d => {
    const g = d.giftDetails || {}, x = d.extendedGiftInfo || {};
    send(room, { messages: [{
      type: 'gift', user: usr(d.user), repeatEnd: !!d.repeatEnd,
      gift: { name: g.giftName || x.name || '', diamondCount: g.diamondCount ?? x.diamond_count ?? 0, giftType: g.giftType ?? x.type, repeatCount: d.repeatCount || 1 }
    }] });
  });
  const retry = (ms, why) => {
    if (room.conn !== conn) return;
    room.conn = null;
    try { conn.disconnect(); } catch {}
    if (!room.clients.size) return;
    status(room, 'waiting', `${why} · tentando de novo em ${Math.round(ms / 1000)} s`);
    room.timer = setTimeout(() => startRoom(room), ms);
  };
  conn.on(WebcastEvent.STREAM_END, () => retry(20000, 'A live terminou'));
  conn.on(ControlEvent.DISCONNECTED, () => retry(5000, 'Conexão com o TikTok caiu'));
  conn.on(ControlEvent.ERROR, e => console.log(`[@${room.user}] erro:`, e?.message || e));

  conn.connect()
    .then(st => status(room, 'connected', `Conectado à live de @${room.user}`))
    .catch(e => {
      const m = String(e?.message || e);
      const off = /offline|not.*live|UserOffline/i.test(m + (e?.constructor?.name || ''));
      retry(off ? 20000 : 10000, off ? `@${room.user} não está ao vivo agora` : `Erro: ${m.slice(0, 80)}`);
    });
}

wss.on('connection', (ws, req) => {
  const user = (new URL(req.url, 'http://x').searchParams.get('user') || '').replace(/^@/, '').trim().toLowerCase();
  if (!/^[\w.]{2,30}$/.test(user)) { ws.send(JSON.stringify({ status: 'error', msg: 'Coloque um @ válido' })); return ws.close(); }
  let room = rooms.get(user);
  if (!room) { room = { user, clients: new Set(), conn: null, timer: null, last: null }; rooms.set(user, room); }
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
      if (room.conn) { try { room.conn.disconnect(); } catch {} room.conn = null; }
      rooms.delete(user);
      console.log(`[@${user}] sem jogadores, desconectado`);
    }, 60000);
  });
});

// mantém a conexão do jogo viva (o Render corta conexões paradas)
setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch {} } }, 25000);

server.listen(PORT, () => console.log(`Zombie Sky rodando na porta ${PORT}`));
