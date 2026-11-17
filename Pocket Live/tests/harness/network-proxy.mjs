/** Real HTTP/WebSocket forwarding with seeded, ordered message delays.
 * This adds latency to the browser leg; it never emulates Live or changes data.
 * WebSocket/TCP order is preserved. This is not IP packet-loss simulation.
 */
import http from 'node:http';
import https from 'node:https';
import { WebSocket, WebSocketServer } from 'ws';
import { performance } from 'node:perf_hooks';

export const NETWORK_PROFILES = Object.freeze({
  '50ms': { delayMs: 50, jitterMs: 0 },
  '150ms': { delayMs: 150, jitterMs: 0 },
  '500ms': { delayMs: 500, jitterMs: 0 },
  jitter: { delayMs: 150, jitterMs: 125 },
  stall: { delayMs: 150, jitterMs: 50, stallMs: 2500 },
});
const MAX_QUEUE_BYTES = 2 * 1024 * 1024;
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
function metrics() {
  return { received: 0, forwarded: 0, dropped: 0, maxQueuedBytes: 0,
    totalDelayMs: 0, minDelayMs: null, maxDelayMs: 0 };
}
class DelayedPipe {
  constructor(destination, profile, seed, stats, fail) {
    Object.assign(this, { destination, profile, stats, fail });
    this.random = random(seed); this.queue = []; this.bytes = 0;
    this.timer = null; this.closed = false; this.holdUntil = 0;
  }
  enqueue(data, binary) {
    if (this.closed) return;
    this.stats.received++;
    const now = performance.now();
    const sampled = Math.max(0, this.profile.delayMs + (2 * this.random() - 1) * this.profile.jitterMs);
    // Jitter must never reorder an ordered WebSocket stream.
    const due = Math.max(now + sampled, this.queue.at(-1)?.due || 0, this.holdUntil);
    if (this.bytes + data.length > MAX_QUEUE_BYTES) {
      this.stats.dropped++; this.fail('queue-overflow'); return;
    }
    this.queue.push({ data, binary, due, receivedAt: now });
    this.bytes += data.length;
    this.stats.maxQueuedBytes = Math.max(this.stats.maxQueuedBytes, this.bytes);
    this.schedule();
  }
  hold(ms) {
    if (this.closed) return;
    this.holdUntil = Math.max(this.holdUntil, performance.now() + ms);
    for (const item of this.queue) item.due = Math.max(item.due, this.holdUntil);
    clearTimeout(this.timer); this.timer = null; this.schedule();
  }
  schedule() {
    if (this.closed || this.timer || !this.queue.length) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.closed) return;
      const now = performance.now();
      while (this.queue.length && this.queue[0].due <= now) {
        if (this.destination.readyState !== WebSocket.OPEN) {
          this.fail('destination-closed'); return;
        }
        if (this.destination.bufferedAmount > MAX_QUEUE_BYTES) {
          this.fail('queue-overflow'); return;
        }
        const item = this.queue.shift(); this.bytes -= item.data.length;
        try {
          this.destination.send(item.data, { binary: item.binary }, error => { if (error) this.fail('send-error'); });
        } catch { this.fail('send-error'); return; }
        const elapsed = performance.now() - item.receivedAt;
        this.stats.forwarded++; this.stats.totalDelayMs += elapsed;
        this.stats.minDelayMs = Math.min(this.stats.minDelayMs ?? elapsed, elapsed);
        this.stats.maxDelayMs = Math.max(this.stats.maxDelayMs, elapsed);
      }
      this.schedule();
    }, Math.max(1, Math.ceil(this.queue[0].due - performance.now())));
  }
  close() {
    this.closed = true; clearTimeout(this.timer); this.timer = null;
    this.stats.dropped += this.queue.length; this.queue = []; this.bytes = 0;
  }
}

export class NetworkProxy {
  static async start(sessionURL, { profile, seed = 1 } = {}) {
    if (!Object.hasOwn(NETWORK_PROFILES, profile)) throw Error('Unknown network profile');
    const proxy = new NetworkProxy(new URL(sessionURL), profile, seed);
    await new Promise((resolve, reject) => {
      proxy.server.once('error', reject);
      proxy.server.listen(0, '127.0.0.1', resolve);
    });
    proxy.url = new URL(sessionURL);
    proxy.url.protocol = 'http:'; proxy.url.hostname = '127.0.0.1';
    proxy.url.port = String(proxy.server.address().port);
    return proxy;
  }
  constructor(upstream, profileName, seed) {
    Object.assign(this, { upstream, profileName, seed });
    this.profile = NETWORK_PROFILES[profileName];
    this.connections = new Set(); this.requests = new Set(); this.closed = false;
    this.stats = { profile: profileName, seed, ...this.profile,
      addedNominalRoundTripMs: 2 * this.profile.delayMs,
      connections: 0, terminated: 0, holds: 0, overflow: 0, sendErrors: 0, upstreamErrors: 0,
      outbound: metrics(), inbound: metrics() };
    const requester = upstream.protocol === 'https:' ? https : http;
    this.server = http.createServer((req, res) => {
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
      let target;
      try { target = new URL(req.url, upstream.origin); }
      catch { res.writeHead(400); res.end(); return; }
      if (target.origin !== upstream.origin) { res.writeHead(403); res.end(); return; }
      const headers = { ...req.headers, host: upstream.host };
      delete headers.cookie;
      const request = requester.request(target, { method: req.method, headers }, response => {
        res.writeHead(response.statusCode, response.headers); response.pipe(res);
      });
      this.requests.add(request);
      request.on('close', () => this.requests.delete(request));
      request.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Upstream unavailable'); });
      res.on('close', () => request.destroy()); request.end();
    });
    this.wss = new WebSocketServer({ noServer: true, maxPayload: MAX_QUEUE_BYTES });
    const room = upstream.pathname.split('/')[2];
    this.server.on('upgrade', (req, socket, head) => {
      let target;
      try { target = new URL(req.url, upstream.origin); }
      catch { socket.destroy(); return; }
      if (target.origin !== upstream.origin || target.pathname !== '/api/ws/' + room || target.search !== '?role=control') { socket.destroy(); return; }
      this.wss.handleUpgrade(req, socket, head, downstream => this.attach(downstream, target));
    });
  }
  attach(downstream, target) {
    if (this.closed) { downstream.terminate(); return; }
    target.protocol = this.upstream.protocol === 'https:' ? 'wss:' : 'ws:';
    const upstream = new WebSocket(target, { origin: this.upstream.origin, maxPayload: MAX_QUEUE_BYTES });
    const connection = { downstream, upstream, pipes: [] };
    this.connections.add(connection); this.stats.connections++;
    let ended = false;
    const end = (code = 1011, reason = 'Proxy connection closed') => {
      if (ended) return; ended = true;
      for (const pipe of connection.pipes) pipe.close();
      this.connections.delete(connection); this.stats.terminated++;
      // Propagate policy closure, but never put upstream URLs or secrets in reasons.
      const safeCode = [1000, 1001, 1008, 1009].includes(code) ? code : 1011;
      if (downstream.readyState === WebSocket.OPEN) downstream.close(safeCode, reason);
      else downstream.terminate();
      upstream.terminate();
    };
    const failed = reason => {
      if (reason === 'queue-overflow') this.stats.overflow++;
      if (reason === 'send-error') this.stats.sendErrors++;
      end();
    };
    // Browser may send authentication before the upstream handshake completes.
    // Pause the downstream stream until its real upstream connection is open.
    downstream.pause();
    const ordinal = this.stats.connections;
    const outbound = new DelayedPipe(upstream, this.profile, this.seed + ordinal * 2, this.stats.outbound, failed);
    const inbound = new DelayedPipe(downstream, this.profile, this.seed + ordinal * 2 + 1, this.stats.inbound, failed);
    connection.pipes.push(outbound, inbound);
    downstream.on('message', (data, binary) => outbound.enqueue(data, binary));
    upstream.on('message', (data, binary) => inbound.enqueue(data, binary));
    upstream.on('open', () => { if (!ended) downstream.resume(); });
    downstream.on('close', () => end(1001));
    upstream.on('close', code => end(code));
    downstream.on('error', () => end());
    upstream.on('error', () => { this.stats.upstreamErrors++; end(); });
  }
  hold(ms) {
    if (!Number.isFinite(ms) || ms < 0 || ms > 15000) throw Error('Invalid stall duration');
    this.stats.holds++;
    for (const connection of this.connections) for (const pipe of connection.pipes) pipe.hold(ms);
  }
  evidence() {
    return structuredClone(this.stats);
  }
  async close() {
    this.closed = true;
    for (const connection of this.connections) {
      for (const pipe of connection.pipes) pipe.close();
      connection.downstream.terminate(); connection.upstream.terminate();
    }
    for (const request of this.requests) request.destroy();
    await new Promise(resolve => this.wss.close(resolve));
    await new Promise(resolve => { this.server.close(resolve); this.server.closeAllConnections(); });
  }
}
