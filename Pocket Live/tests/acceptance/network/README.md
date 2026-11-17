# Network acceptance

Network faults are a reusable forwarding layer around the existing real-browser
acceptance suite. There is no second model of Live and no mock browser socket.
The same 22 scenarios run against actual Chrome, M4L, and the independent native
Live observer. One extra check verifies that delay was really applied in both
directions; the stall profile adds a client-isolation/recovery check.

Run from the `Pocket Live/` source folder:

```sh
# Full matrix, both Local and deployed Cloud (slower than ordinary acceptance)
npm run test:network

# Select one profile and/or one transport
npm test -- --network=500ms --transport=local
npm test -- --network=jitter --transport=cloud
npm test -- --network=stall --transport=local
```

`--prepare` has the same explicit disposable-fixture meaning as normal acceptance.
Normal `npm test` stays the fast, unmodified-network path. `--network` cannot be
combined with `--probes`. Reports have distinct filenames and never overwrite the
normal acceptance reports.

| Profile | Added delay **each way** | Added nominal RTT | Extra fault |
|---|---:|---:|---|
| `50ms` | 50 ms | 100 ms | — |
| `150ms` | 150 ms | 300 ms | — |
| `500ms` | 500 ms | 1,000 ms | — |
| `jitter` | 150 ± 125 ms | 300 ms | Seeded variation per direction/connection |
| `stall` | 150 ± 50 ms | 300 ms | Hold browser A's messages both ways for 2,500 ms |

Each browser gets an independent loopback proxy. The proxy forwards current
production HTML/JS/CSS from the actual selected transport without modification.
Real browser WebSockets connect through it to that transport's actual server.
Only WebSocket application-message delivery is delayed; HTTP asset fetches and
connection handshakes are not throttled. Host/Origin headers are translated for
the real upstream connection. No system network settings or admin permissions
are required. No fault controls are added to the shipping app/device.

Delay is independently seeded per browser, connection and direction. FIFO order
is preserved: the next message cannot overtake a previously queued message.
Consequently, closely spaced messages can have correlated delays under jitter,
just as an ordered stream can have head-of-line blocking. The queue is bounded
to 2 MiB per direction, and overflow closes the connection. Closing a connection
discards its queue; nothing migrates to a replacement connection.

The stall case first holds A, then changes real Live twice. B and C must show
the latest native value while A is still held. A must subsequently recover, and
all three browsers must converge to the independently read native value. The
measured inbound hold must exceed two seconds, so a no-op fault injector fails.
The rapid-drag case keeps its pointer held long enough to prove intermediate
native progress despite the configured delay; final-value correctness and stable
cross-browser convergence retain the existing checks and deadlines.

Artifacts:

- `tests/artifacts/acceptance-network-run.json`: matrix/setup status.
- `tests/artifacts/real-browsers-<transport>-<profile>.json`: actual per-case
  native/browser evidence, asset hashes, seed, counts, queue peaks, and measured
  minimum/maximum/total forwarding delays in both directions.
- Failure/success screenshots include the transport and profile in their names.

The proxy never records authentication frames or session URLs in reports.
Network commands automatically run `tests/integration/transport/network-proxy.cjs`
before Live setup. This checks the injector itself using
real HTTP/WebSocket I/O: byte preservation, delays, jitter order, stale-queue
cancellation, and propagation of policy closures. It does not claim Live coverage.

## Limits

This tests application behavior under an added browser-leg delay, jitter, stalls
and the suite's existing real disconnect/reconnect actions. It does not simulate
IP packet loss, duplication or reordering, bandwidth limits, browser TLS/security
behavior, DNS/handshake latency, or latency on the separate M4L-to-Cloud host leg.
TCP normally hides packet reordering/loss behind ordered delivery/retransmission;
OS-level packet tests would be separate. A held proxy continues reading upstream,
so this also does not prove relay backpressure behavior when a client stops
reading TCP entirely. The Cloud path still uses the deployed
Cloud relay and assets, but the browser sees an HTTP loopback origin. Connection
color/secure-origin features should be checked on the direct URL separately.
Physical mobile lifecycle, host restarts, hardware MIDI/Push and long-running
performance remain separate coverage gaps.
