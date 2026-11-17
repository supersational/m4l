// Verify the fault injector itself with real HTTP/WebSocket I/O. This is not
// Live acceptance: it prevents a disconnected/no-op/reordering proxy from
// producing misleading acceptance evidence.
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { WebSocket, WebSocketServer } = require('ws');
(async () => {
  const { NetworkProxy } = await import('../../harness/network-proxy.mjs');
  const server = http.createServer((req, res) => { res.end('real upstream bytes'); });
  const wss = new WebSocketServer({ server });
  const sockets = new Set();
  let expectedOrigin;
  wss.on('connection', (socket, req) => {
    assert.equal(req.headers.origin, expectedOrigin);
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    socket.on('message', (data, binary) => {
      if (String(data) === 'policy-close') socket.close(1008, 'Invalid key');
      else socket.send(data, { binary });
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  expectedOrigin = `http://127.0.0.1:${server.address().port}`;
  let proxy, client;
  const deadline = setTimeout(() => { throw Error('Proxy self-check timed out'); }, 15000);
  try {
    proxy = await NetworkProxy.start(expectedOrigin + '/s/test#private-key', { profile: 'jitter', seed: 42 });
    assert.equal(await (await fetch(proxy.url)).text(), 'real upstream bytes');
    const url = new URL('/api/ws/test?role=control', proxy.url); url.protocol = 'ws:';
    client = new WebSocket(url);
    await once(client, 'open');
    const received = [];
    const completed = new Promise(resolve => client.on('message', (data, binary) => {
      received.push({ value: binary ? data.toString("hex") : String(data), binary });
      if (received.length === 101) resolve();
    }));
    for (let i = 0; i < 100; i++) client.send('message-' + i);
    client.send(Buffer.from([0, 1, 2, 255]));
    await completed;
    assert.deepEqual(received.slice(0, 100), Array.from({length: 100}, (_, i) => ({value: 'message-' + i, binary: false})));
    assert.equal(received[100].binary, true);
    assert.equal(received[100].value, '000102ff');
    for (const dir of ['inbound', 'outbound']) {
      const stats = proxy.evidence()[dir];
      assert.equal(stats.forwarded, 101);
      assert.ok(stats.minDelayMs >= 23, 'Both directions must actually be delayed');
    }
    proxy.hold(1500);
    client.send('must-not-cross-connections');
    await new Promise(resolve => setTimeout(resolve, 100));
    const closed = once(client, 'close'); client.close(); await closed;
    client = new WebSocket(url); await once(client, 'open');
    const next = once(client, 'message'); client.send('new-connection');
    const [data] = await next; assert.equal(String(data), 'new-connection');
    assert.ok(proxy.evidence().outbound.dropped >= 1, 'Queued data must be discarded on close');
    const policy = once(client, 'close'); client.send('policy-close');
    const [code] = await policy; assert.equal(code, 1008);
    assert.equal(proxy.evidence().overflow, 0);
    console.log('Proxy: actual HTTP forwarding, bidirectional delay, seeded jitter/FIFO, binary preservation, stale-queue discard and policy closure passed.');
  } finally {
    clearTimeout(deadline); client?.terminate(); await proxy?.close();
    for (const socket of sockets) socket.terminate();
    await new Promise(resolve => wss.close(resolve));
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
