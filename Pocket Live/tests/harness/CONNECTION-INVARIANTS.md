# Connection and convergence boundaries

The browser connection lifecycle lives at the top of `web/app.js`. Local and
Cloud share it and all controls use the same `send()` path.

## Rules for future changes

- Every WebSocket callback captures its socket and checks `ws === socket`.
  An old close, error, or message must never affect the replacement connection.
- A relay's `online` message only announces a host. Writes become available
  after a valid native snapshot arrives. Host replacement invalidates readiness
  even when the browser WebSocket itself stays open.
- Pending requests are owned by one socket. They have a six-second deadline,
  are bounded to 128, and are removed on failed sends, results, disconnect, or
  interaction reset. Command envelope fields cannot be overwritten by arguments.
- Commands are never queued for reconnect or retried automatically. A missing
  acknowledgement means unknown outcome, not failure to execute. A fresh native
  snapshot establishes the truth; replaying a toggle/create/delete is unsafe.
- `resetInteractions()` is the common cancellation boundary for gestures,
  parameter queues, view reads, and outstanding requests. Keep new controls on
  this path rather than adding private reconnect queues.
- Backoff resets after native state arrives, not merely after TCP opens.
- Browser navigation remains local. Scene-page reads must not mutate the shared
  native snapshot or navigate another browser.

## Independent native observer

Both real-browser suites use `tests/harness/native-client.mjs`. It manages a
single typed JSONL driver, bounded pending requests, deadlines, write errors,
child exit, and shutdown. New suites should reuse it, not copy subprocess RPC.
The Python driver independently observes actual Live through AbletonKernel;
Pocket Live's acknowledgement is never the native oracle.

Never run two Kernel clients concurrently. The driver holds the observer lock.
UI acceptance scripts operate real Chrome inputs and inspect rendered DOM. They
do not inject app state, replace browser sockets, or use a mocked Live model.

## Evidence and limits

`npm test` runs the baseline and gap regressions against Local and deployed
Cloud. The repeated-reconnect regression disconnects one actual browser three
times, changes native tempo while it is offline, then checks all three browsers
and Live, including a delayed check for late callbacks/stale writes. Page errors
also fail that regression.

This demonstrates real reconnect convergence, but does not deterministically
force every obsolete-socket callback ordering. Packet duplication/reordering,
physical mobile lifecycle, native host replacement/restart, hardware MIDI/Push,
long-duration leaks, and large-set/many-client performance still need dedicated
real-environment scenarios. Do not report those as covered by this suite.

The optional `test:network` matrix adds ordered browser-leg message delay, seeded
jitter and one-client stalls through real forwarding proxies. Its exact scope
and remaining packet/host-leg limitations are in `tests/acceptance/network/README.md`.
