import { DurableObject } from 'cloudflare:workers';
const digest = async (s) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
const token = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
// Reject bursts at the edge, before allocating or contacting a room.
async function rateLimited(request, limiter) {
  const key = request.headers.get('CF-Connecting-IP') || 'unknown-ip';
  const { success } = await limiter.limit({ key });
  return success
    ? null
    : new Response('Too many requests', {
        status: 429,
        headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' },
      });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/session' && request.method === 'POST') {
      const throttled = await rateLimited(request, env.SESSION_CREATION_LIMIT);
      if (throttled) return throttled;
      const room = crypto.randomUUID(),
        hostToken = token(),
        controlToken = token(),
        expires = Date.now() + 24 * 3600000;
      const stub = env.ROOMS.getByName(room);
      await stub.fetch(
        new Request('https://room/init', {
          method: 'POST',
          body: JSON.stringify({
            hostHash: await digest(hostToken),
            controlHash: await digest(controlToken),
            expires,
          }),
        }),
      );
      return Response.json(
        {
          room,
          hostToken,
          controlToken,
          expires,
          url: url.origin + '/s/' + room + '#' + controlToken,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const match = url.pathname.match(/^\/api\/ws\/([a-f0-9-]{36})$/);
    if (match) {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
        return new Response('WebSocket required', { status: 426 });
      const role = url.searchParams.get('role');
      if (role !== 'host' && role !== 'control')
        return new Response('Invalid role', { status: 400 });
      const throttled = await rateLimited(request, env.SOCKET_UPGRADE_LIMIT);
      if (throttled) return throttled;
      return env.ROOMS.getByName(match[1]).fetch(request);
    }
    if (url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    const r = await env.ASSETS.fetch(request);
    const h = new Headers(r.headers);
    h.set('Referrer-Policy', 'no-referrer');
    h.set('X-Content-Type-Options', 'nosniff');
    h.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' wss: ws:; img-src 'self' data:; frame-ancestors 'none'",
    );
    return new Response(r.body, { status: r.status, headers: h });
  },
};
export class LiveRoom extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/init' && request.method === 'POST') {
      if (await this.ctx.storage.get('meta')) return new Response('Exists', { status: 409 });
      const meta = await request.json();
      await this.ctx.storage.put('meta', meta);
      await this.ctx.storage.setAlarm(meta.expires);
      return new Response('Created');
    }
    const role = url.searchParams.get('role');
    if (!['host', 'control'].includes(role)) return new Response('Invalid role', { status: 400 });
    const meta = await this.ctx.storage.get('meta');
    if (!meta || meta.expires < Date.now()) {
      if (role === 'host') return new Response('Expired', { status: 410 });
      // Browser WebSockets cannot read the status of a rejected HTTP upgrade.
      const [client, server] = Object.values(new WebSocketPair());
      server.accept();
      server.close(1008, 'Session expired');
      return new Response(null, { status: 101, webSocket: client });
    }
    if (this.ctx.getWebSockets().length >= 16) return new Response('Session full', { status: 429 });
    const pair = new WebSocketPair();
    pair[1].serializeAttachment({
      id: crypto.randomUUID(),
      role,
      authenticated: false,
      created: Date.now(),
      window: Date.now(),
      count: 0,
    });
    this.ctx.acceptWebSocket(pair[1], [role]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  send(ws, obj) {
    try {
      ws.send(JSON.stringify(obj));
    } catch {}
  }
  authenticated(role) {
    return this.ctx.getWebSockets(role).filter((w) => w.deserializeAttachment()?.authenticated);
  }
  presence() {
    const message = { type: 'presence', controllers: this.authenticated('control').length };
    for (const host of this.authenticated('host')) this.send(host, message);
  }
  async webSocketMessage(ws, data) {
    const a = ws.deserializeAttachment();
    if (!a || a.retired) return;
    const limit = a.authenticated && a.role === 'host' ? 2097152 : 65536;
    if (typeof data !== 'string' || new TextEncoder().encode(data).byteLength > limit) {
      ws.close(1009, 'Message too large');
      return;
    }
    let m;
    try {
      m = JSON.parse(data);
    } catch {
      ws.close(1003, 'JSON required');
      return;
    }
    if (!m || typeof m !== 'object' || Array.isArray(m)) {
      ws.close(1003, 'JSON object required');
      return;
    }
    const meta = await this.ctx.storage.get('meta');
    if (!meta || meta.expires < Date.now()) {
      ws.close(1008, 'Session expired');
      return;
    }
    if (!a.authenticated) {
      const hash = await digest(String(m.token || ''));
      if (
        Date.now() - a.created > 10000 ||
        hash !== (a.role === 'host' ? meta.hostHash : meta.controlHash)
      ) {
        ws.close(1008, 'Invalid session key');
        return;
      }
      a.authenticated = true;
      ws.serializeAttachment(a);
      if (a.role === 'host') {
        for (const old of this.authenticated('host'))
          if (old !== ws) {
            const retired = old.deserializeAttachment();
            retired.authenticated = false;
            retired.retired = true;
            old.serializeAttachment(retired);
            old.close(1000, 'Host replaced');
          }
        for (const phone of this.authenticated('control'))
          this.send(phone, { type: 'connection', online: true });
      }
      this.send(ws, {
        type: 'welcome',
        role: a.role,
        online: this.authenticated('host').length > 0,
        controllers: this.authenticated('control').length,
      });
      this.presence();
      if (a.role === 'control')
        for (const host of this.authenticated('host')) this.send(host, { type: 'refresh' });
      return;
    }
    if (a.role === 'host') {
      if (m.type === 'state' || m.type === 'meters' || m.type === 'waveform')
        for (const phone of this.authenticated('control')) this.send(phone, m);
      if (m.type === 'result')
        for (const phone of this.authenticated('control'))
          if (phone.deserializeAttachment().id === m.client) this.send(phone, m);
    } else if (m.type === 'command') {
      if (Date.now() - a.window > 1000) {
        a.window = Date.now();
        a.count = 0;
      }
      if (++a.count > 30) {
        this.send(ws, { type: 'result', id: m.id, ok: false, error: 'Slow down' });
        return;
      }
      ws.serializeAttachment(a);
      const hosts = this.authenticated('host');
      if (!hosts.length) {
        this.send(ws, { type: 'result', id: m.id, ok: false, error: 'Live is offline' });
        return;
      }
      if (typeof m.op !== 'string' || m.op.length > 64) return;
      this.send(hosts[0], { type: 'command', id: m.id, client: a.id, request: m });
    }
  }
  webSocketClose(ws) {
    const a = ws.deserializeAttachment();
    if (!a?.authenticated) return;
    a.authenticated = false;
    ws.serializeAttachment(a);
    if (a.role === 'host' && !this.authenticated('host').length)
      for (const phone of this.authenticated('control'))
        this.send(phone, { type: 'connection', online: false });
    if (a.role === 'control') this.presence();
  }
  webSocketError(ws) {
    this.webSocketClose(ws);
    try {
      ws.close(1011, 'Connection error');
    } catch {}
  }
  async alarm() {
    for (const ws of this.ctx.getWebSockets())
      try {
        ws.close(1008, 'Session expired');
      } catch {}
    await this.ctx.storage.deleteAll();
  }
}
