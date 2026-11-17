# Pocket Live tests

**Real Live and real Chrome are the default acceptance path.** No fake DOM,
simulated Live model or mock WebSocket can produce a passing acceptance result.

Run from the `Pocket Live/` source folder:

| Command | Behaviour |
|---|---|
| `npm test` | Automatically build/load QA on an existing disposable lab fixture, discover its link, and run actual Chrome ↔ M4L ↔ Live checks over Local and Cloud |
| `npm test -- --prepare` | First replace the current unsaved set with the disposable fixture; never saves a set |
| `npm test -- --transport=local` | Same unattended checks using the current minified Local build |
| `npm test -- --transport=cloud` | Same unattended checks using the real deployed Cloudflare service and web assets |
| `npm run test:demo` | Opens Live's demo Set (Help > Load Demo Set, **discarding unsaved changes**) and tests the real device against it over Local and Cloud. See [Real Sets](#real-sets) |
| `npm run test:network` | Existing real-browser suite through seeded latency/jitter/stall proxies, full matrix on Local and Cloud |
| `npm test -- --network=500ms --transport=local` | One selected real-network profile; isolated reports |
| `npm run test:regressions` | Small retained race/fault suite; each script has a concrete reason in `regressions.json` |
| `npm run test:offline` | Explicitly run all older component/unit checks; this is never substituted for real acceptance |
| `npm run test:unit` / `test:integration` | Explicit component groups for development |
| `npm run test:convergence -- --session-file <private-file>` | Additional protocol-client/native-oracle checks; not real browser input |
| `npm run test:live:legacy -- --allow-live-edits --suite smoke` | Retained older cloud-only probes, superseded as the main acceptance route |

Requirements: running Live with AbletonKernel configured, installed Google Chrome,
Node dependencies (`npm ci`), and Python able to run this checkout's AMXD builder.
The main browser suite needs only Python standard library + the existing Kernel
client; it does not require Python `websockets`. `POCKET_LIVE_PYTHON` selects a
Python interpreter. `ABLETON_KERNEL_PATH` selects a nonstandard Kernel checkout.
Real browser acceptance also uses the separate py2max Live lab to load its QA
device. The default is the sibling `py2max/live_test_lab` checkout. Set
`POCKET_LIVE_LAB_ROOT` if it is elsewhere, and add that py2max checkout to Live
Places as `py2max`. Neither dependency is needed to build the release or run
the offline checks.
No other Kernel client may run concurrently.

Normal `npm test` checks the fixture before editing: exactly two ordinary tracks,
uniquely named `Lab Audio` and `Lab MIDI`. If prerequisites are missing, the run
is **blocked**, exits nonzero and does not replace the result with mock passes.
Use `--prepare` only when the current set is disposable. Existing user sets are
not overwritten by default. The setup normalizes test state, loads isolated QA
supporting files and never publishes a test device into `amxd_py2max`.

The runner uses three isolated real browser contexts, actual keyboard/mouse/touch
input, and reads only rendered DOM controls. Native readback is independent Python
Live API access through AbletonKernel. Stable shared state must match for 500ms
inside a 12-second deadline. Actions have known expected native effects; agreement
on an unchanged or wrong value does not suffice. Device tests read the actual
native DeviceParameters independently of Pocket Live IDs/ACKs.

`tests/artifacts/acceptance-run.json` is the overall result for the latest command,
including blocked/failed setup. `real-browsers-local.json` and `real-browsers-cloud.json` contain
per-case evidence, timing, native/browser values and web bundle hashes. Failures
save screenshots; successful runs save a final screenshot. Artifacts are ignored
by Git. Private session URLs and keys are not logged in reports or screenshots.

See [the harness guide](harness/README.md) for implementation and extension details,
and [coverage/gaps](acceptance/README.md) for the remaining acceptance contract.

## Focused-control, pagination and reconnect regressions

`npm run test:probes -- --transport=local` automatically exercises focused-control,
unfinished-edit/Escape, independent scene pagination and repeated-reconnect
regressions in real Live/Chrome. The default `npm test` includes these five checks
after the 22 baseline scenarios on each transport. See [the bug ledger](BUG-LEDGER.md).

See [network profiles and limits](acceptance/network/README.md) for the optional
network layer. It reuses the real-browser cases and independent Live observer.

## Real Sets

The fixture suites use a tiny two-track Set, so they could not catch the failures
that only appear on real projects. `tests/harness/real-set.mjs` runs against any Set:

```sh
npm run test:demo                                  # Load the demo Set, both transports
npm run test:demo -- --transport=local             # One transport
node tests/harness/real-set.mjs                    # Whatever Set is open now
node tests/harness/real-set.mjs --scale=64         # Also duplicate tracks to reach 64 (unsaved)
node tests/harness/real-set.mjs --profile=returns,scenes   # Shape the Set first: large, returns, scenes
```

It checks that every track renders and matches native readback, that the snapshot
really exceeded Max's limit (otherwise the run proves nothing), browser and native
mute, tempo, non-ASCII names, scene paging, opening a device, Arrangement clips with
a drawn waveform, telemetry gaps, and idle traffic. Mutations are restored and
nothing is saved. Reports: `tests/artifacts/real-set-<transport>[-scaleN|-<profiles>].json`.
Each profile has budgets in `tests/harness/real-set-budgets.json` (case name, evidence field,
maximum); a case over budget fails, so a slowdown on one shape of Set is caught there.

Only `--open-demo` touches the UI, because Live has no API for opening a Set. Live's
save dialog has no accessible buttons, so it needs `cliclick` and a real mouse click.
The click is skipped unless Live is frontmost, so Live must stay in front until the
dialog closes. It needs Accessibility permission. Other runs use only the Kernel.

The profile fixtures in `fixtures/` use synthetic IDs and do not need any
capture datasets or private session files.
