# Pocket Live architecture

The browser controls Live over WebSockets. `live.js` is the authority on
native state; it runs in Max and uses LiveAPI. The Node for Max bridge talks to
it through Max messages and owns the connection and the latest Set.
`build.py` creates the native patch and wires those pieces together.

## Connection paths

- **Local:** `maxnode/local-transport.cjs` serves the bundled controller from
  the host Mac. It chooses a port automatically and restricts requests to its
  local addresses. It works without internet if the Wi-Fi permits client
  connections.
- **Cloud:** `maxnode/cloud-transport.cjs` opens an outbound connection to
  `worker.js`. The Worker serves the same UI and uses a Durable Object per
  session to relay messages. Separate host and browser keys are hashed in
  storage; the controller key is in the URL fragment. Cloud sessions expire
  after 24 hours. Switching mode also switches the QR/link.

Both paths use the same typed commands. Live validates the Set epoch and
allowed object IDs. A missing acknowledgement has an unknown outcome;
mutations are never replayed after reconnecting. Browsers wait for a fresh
snapshot before enabling writes. See the
[connection rules](../tests/harness/CONNECTION-INVARIANTS.md) for invariants.

## Large Sets and updates

Live reads mixer strips first, then fills device and clip details in small
batches. Core state uses observers; visible tracks, scene pages, and open or
pinned devices add scoped observers. Node applies patches to its current Set
so browser joins get an immediate snapshot. Sequence numbers and periodic
digests detect gaps and repair them without a settled full-state heartbeat.
The browser paints changed controls once per animation frame and skips
off-screen meters and strips.

Scene paging and the Pinned view are private to each browser. Pin identities
are kept in browser storage for the current session and Set. Finished
Arrangement recordings can show downsampled peaks computed on the Mac; the
controller does not stream audio or send local file paths to the relay.

## Build boundary

`tools/package_release.py` builds `web-dist/` for both Cloud and Local. Full
packaging stages the AMXD, minified Node bridge, separate waveform worker,
static assets, and configuration before copying them into the output folder.
An explicit list controls what ships. Live's Node for Max supplies `max-api`
and runs the device without a separate Node/npm install.
