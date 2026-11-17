# Pocket Live acceptance harness

## Default: unattended real browsers and native Live

`npm test` invokes `tools/run-real-tests.mjs`; no interactive computer-use agent
is involved. `--prepare` explicitly replaces the current unsaved set. The normal
route requires the dedicated two-track fixture before it edits anything.

The runner builds minified web assets, prepares isolated QA support files for
Local/Cloud, builds a QA AMXD pointing at those files, loads it through Live's
browser and waits for the running device's fresh `session.json`. The device now
exports the selected Local **or** Cloud URL automatically. No clipboard operation,
manual URL copying, browser account or manual tab switching is required.

Files and responsibilities:

- `tools/run-real-tests.mjs`: prerequisites, setup, transport selection, process deadlines.
- `tools/prepare-test-runtime.mjs`: private QA resources with transport-specific config.
- `prepare-live.py`: bounded native setup/build/load; no saving or final release publishing.
- `real-browsers.mjs`: actual Chrome contexts and real DOM input; no application globals or injected application events.
- `native-driver.py`: persistent typed JSONL native readback/stimuli. No caller-supplied Python execution endpoint.
- `live_oracle.py`: separate native state observer and exclusive Kernel lock.

Use `POCKET_LIVE_HEADED=1 npm test -- --transport=local` to watch the same automatic
test run. Default is headless installed Chrome. Every run closes its own browser
contexts and native driver, stops test playback, and writes machine-readable
reports/screenshots. It leaves the disposable Live fixture open and unsaved.

Extend real scenarios before adding mocked acceptance substitutes. Give every
stimulus a known expected native effect and read rendered values in all clients.
Exact scheduler/socket races that cannot be forced reliably in a normal real run
can retain a deterministic regression, with its concrete reason documented in
`tests/regressions.json`.

## Run the independent convergence check

From the `Pocket Live/` source folder:

```sh
npm run test:convergence -- --session-file session.json
```

This opens **three protocol clients**, reads Ableton independently through
AbletonKernel, and checks initial join, refresh and reconnect. It does not move
controls in real browsers. The default makes no musical edits; joining asks the
host for fresh state. Both Local and Cloud use the same runner and scenario code.
Supply a private JSON file containing `{"url":"<the complete private controller link>"}`
for the desired transport. The bridge's `session.json` is currently the cloud
session; it does not automatically follow the Local tab. Keep session files out
of Git and never put a private link on a command line or in a test report.

For additional tempo writes and concurrent edits, open a **disposable** set with
`Lab MIDI` and `Lab Audio` tracks, stop playback, then run:

```sh
npm run test:convergence -- --session-file session.json --allow-live-edits
```

The flag enables a browser-protocol tempo write, two concurrent writes, an
explicit final write, and original-tempo restoration. It does not create or
replace a set. Track markers are a guard, not proof that a set is disposable.
Do not interact with Live during this run. Restoration is verified and a failed
restore makes the run fail. A command already accepted by Live cannot be recalled.

Requirements: Python `websockets==15.0.1`, running Pocket Live host,
and AbletonKernel configured in Live. To use an isolated dependency environment
without installing this repository or modifying your global Python:

```sh
uv run --no-project --with websockets==15.0.1 python tests/harness/run-convergence.py --session-file session.json
```

Saved cloud sessions expire; load the device to get a current link before running.
 Set `ABLETON_KERNEL_PATH` if its checkout
is not the sibling `ableton-kernel` folder. The native oracle is read-only and
has no Pocket Live dependency. **Do not run any other Kernel client concurrently**:
its legacy discovery mechanism has a single reply destination. Our lock prevents
two instances of this oracle; it cannot coordinate unrelated legacy tools.

## What agreement means

`acceptance.py` projects an explicit common subset: tempo, transport flags,
loop/signature, scene count, ordered tracks/returns/master, mute/solo/arm, mixer
values/sends and top-level device identity/on states. Max IDs and Python Live IDs
are unrelated, so identity uses structural order, kind, names and classes.
Numeric tolerance is `1e-5` in raw API units. Missing fields, reordered objects,
wrong types and nonfinite values fail. Meter/playhead samples and browser-local
navigation are deliberately outside this comparison.

Every client must agree with independent Live readback for at least 500ms within
10 seconds. The reference must also stop changing. A single lucky matching poll,
all clients agreeing with a wrong cache, or a successful ACK without native
mutation cannot pass. Tests of the harness demonstrate these false-pass traps.
Concurrent edits use native acceptance order, not browser clocks; after both
ACKs the shared value must match one accepted intent. A subsequent explicit
write has a known expected final value.

## Reports and limits

`tests/artifacts/convergence.json` records each case, allowlisted event trace,
overall status and limitations. Exit codes: `0` passed, `1` failed, `2` blocked
by prerequisites. No private URLs, tokens, full packets or audio paths are logged.
Use `--report` to preserve distinct Local/Cloud runs. Missing prerequisites never
produce a pass. These checks do not claim clip/parameter-detail, physical touch,
MIDI/Push, browser lifecycle, fault injection, performance or soak acceptance.
Those remain separate scenarios in `tests/acceptance/`.

Offline queue integration additionally runs 40 seeded three-client schedules
with delayed/reordered ACKs and interleaved snapshots against a **simulated**
authoritative host. It asserts intermediate protection and final convergence,
and prints the seed and trace on failure. These are application-message order
experiments; they do not simulate TCP packet reordering. Real TCP loss typically
stalls/reconnects the stream. Keep the distinction explicit in future adapters.

## Adding scenarios that find bugs

1. State the invariant and observable failure before implementing the scenario.
2. Keep the independent native oracle and expected final intent separate from ACKs.
3. Give every wait a deadline; require stability and intermediate writes when relevant.
4. Capture a deterministic seed/trace and minimize failures before fixing them.
5. Deliberately disable the behavior under test. The intended assertion must fail.
6. Label evidence accurately: unit, component/loopback integration, protocol-to-Live,
   real-browser, or physical hardware. Register offline scripts in `suites.json`.

This pass verified targeted mutations for duplicate-write suppression, stale-ACK
revision protection, gesture retirement and stale SVG-target cancellation. No
source mutations are left on disk. Full real-Live/browser acceptance still needs
its own evidence; green offline tests cannot substitute for it.

Shared connection rules, cancellation boundaries, and instructions for adding a
real browser/native suite: [CONNECTION-INVARIANTS.md](CONNECTION-INVARIANTS.md).
Both browser suites now reuse `NativeClient`; do not duplicate the native RPC.


## Optional network layer

`network-proxy.mjs` forwards actual WebSocket traffic with bounded FIFO queues,
seeded delays, and explicit stalls. `real-browsers.mjs` accepts a third positional
profile argument; the setup runner exposes `--network=<profile>|all` and the
`test:network` command. Reuse `NetworkProxy.start(sessionURL, {profile, seed})`
and `hold(ms)` for future real-network scenarios; always close it in `finally`.
See [profiles, commands, measurements and limits](../acceptance/network/README.md).
