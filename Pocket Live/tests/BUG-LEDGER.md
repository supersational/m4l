# Pocket Live bug ledger — 3 November 2026

This ledger counts nine fixed issue categories from the recent hardening pass,
plus three additional failures now fixed and verified against real Live. It excludes test-selector mistakes,
fixture races, missing dependencies and historical bugs from earlier work.
“Fixed” below means fixed in source; it does not imply every production asset
has been deployed. Cloud tests use deployed web/Worker assets; Local uses QA.

| ID | Product issue | Status/evidence |
|---|---|---|
| PL-001 | Valid JSON primitives/arrays could throw in Local and Worker message handlers | Fixed in source; malformed-message regressions |
| PL-002 | Slow Local clients silently missed updates instead of reconnecting | Fixed in source; actual socket/backpressure regression |
| PL-003 | Retired Cloud sockets could still forward commands during reconnect | Fixed in source; stale-socket regression |
| PL-004 | Repeated Cloud starts could leave obsolete sockets/retries active | Fixed in source; repeated-start regression |
| PL-005 | A replaced Worker host retained authentication until its close callback | Fixed in source; retired-host regression |
| PL-006 | Identical repeated previews could discard a valid ACK and send duplicate native writes | Fixed in source; regression and mutation proof |
| PL-007 | Releasing a pointer could retain a pending stream and block/overwrite its next owner | Fixed in source; regression and mutation proof |
| PL-008 | SVG drags could continue through removed, disabled or replaced parameters | Fixed in source; move/release/timer regressions and mutation proof |
| PL-009 | Deleted device models could persist or return through late reads/ACKs and continue queued writes | Fixed in source; app integration and targeted queue cancellation regressions |
| PL-010 | An idle focused tempo input does not display native/external tempo changes | **Fixed**; real browsers/native Live regression |
| PL-011 | An idle focused pinned pan slider does not display native/external changes | **Fixed**; real browsers/native Live regression |
| PL-012 | Scene pagination in one browser moves the scene window in the others | **Fixed**; real three-browser regression, including off-page clip edits |

The three fixes and unfinished-edit preservation are checked by an unattended command:

```sh
npm run test:probes -- --transport=local
# Or --transport=cloud for the deployed UI.
```

It builds/loads the QA runtime, discovers the actual private link, drives real
Chrome and independently reads Live. Any regression produces a nonzero exit.
Results: `tests/artifacts/sync-gap-probes-local.json` and `sync-gap-probes-cloud.json`.
The default `npm test` now includes these probes after the original 22 scenarios
on each transport. All now pass, including the additional unfinished-edit/Escape check. The focused
`test:probes` command is a faster reproduction, not a way of hiding known failures.

PL-010/011 used focus as an indefinite “do not update” condition. Tempo now
tracks an actual dirty edit/commit and supports Escape without writing stale
text. Pinned ranges protect only owned gestures or pending writes, not idle
keyboard focus. Real tests verify idle updates and preserved unfinished typing.

PL-012 stored `sceneOffset` in the shared native snapshot. Browsers now retain
their own scene offsets and request targeted `scene_window` results; these reads
do not mutate or rebroadcast shared view state. Short bounded native leases
retain current off-page clip targets across shared refreshes. Tests create and
rename page-two clips after multiple refreshes while other browsers stay on page
one, and verify returning to page one when the last page is deleted.

## Real Sets — 5 November 2026

`npm run test:demo` found these against Live's actual demo Set. All fixed in source;
real-Live evidence is in `tests/artifacts/real-set-*.json`.

| ID | Product issue | Status/evidence |
|---|---|---|
| PL-013 | Browser stayed on “Syncing…” for any Set whose snapshot exceeded 32,767 characters: Max truncates symbols sent to `node.script`, and the bridge swallowed the JSON error | **Fixed**; all JSON now leaves `live.js` through ASCII frames. Real Set + `large-set.cjs`, whose outlet rejects any oversized symbol |
| PL-014 | A full snapshot blocked Max's thread (410–875ms for 18 tracks) every refresh **and after every command** | **Fixed**; per-track cache with time-budgeted, touched-first reads. Mute round trip about 900ms → about 160ms; telemetry p95 108ms |
| PL-015 | Arrangement waveforms never appeared: the worker inherited Node for Max's `--import` loader and crashed; errors were discarded | **Fixed**; `execArgv: []`. Real-Set case requires a drawn waveform |
| PL-016 | Warp markers were forwarded as one raw JSON string, so even working peaks could not be mapped | **Fixed**; real-Set waveform case |
| PL-017 | Messages sent before `node.script` finished starting (“Node script not ready”) | **Fixed**; `live.js` reads and sends nothing until the bridge's first `refresh` |
| PL-018 | Long results (`device_get`, `scene_window`, notes) could hit the PL-013 limit; every snapshot read an unused selected device's parameters | **Fixed**; same framing; `state.device` is now always null and the browser's existing `device_get` is used |
| PL-019 | An idle device with nobody connected cost 29ms of every 100ms tick, about 350 Live API calls | **Fixed**; read tiers, presence idling and meter deltas: 12ms with a controller, about 1.2ms with none |
| PL-020 | One permanent `LiveAPI` object per Live object: about 90% of a slow first read, and worse on larger Sets | **Fixed**; shared `Ref` lens, rationed promotion. Demo Set first read about 3.2s → about 0.6s |
| PL-021 | Listing `parameters` and `clip_slots` made Live create an ID for every child: 34,225 IDs and 7.5s for `parameters` on 83 tracks, 6,592 IDs and 4.2s for `clip_slots` at 103 scenes | **Fixed**; `childAt()` reads the one child needed by path. `large-set.cjs` fails if either list is requested during load or refresh, and inserting a scene must re-resolve slots |
| PL-022 | Nothing appeared in the browser until the whole Set had been read: 16.8s cold at 67 tracks | **Fixed**; mixer strips first, then each track in full. 67 tracks cold: painted about 0.75s, filled about 5.1s. Real-Set case reports `paintedMs` and `filledMs` |
| PL-023 | A change made in Live took 5.6–8.6s to reach the browser on a 67-track Set: it waited for the round-robin and then for a snapshot rate-limited to 570ms | **Fixed**; observers for mute, solo, arm, slot indexes, mixer and transport send small patches. Native mute 7–119ms, fader 9–230ms, clip launch 186–272ms. Real-Set cases bound each at 1s |
| PL-024 | The steady background sweep spent 50–85ms of every 100ms tick on a 67-track Set: its 5s cache expired before each revisit, so every visit re-read about 45 objects at about 1ms a lens switch | **Fixed**; observed values are not re-read, the cache scales with Set size and is jittered, the sweep has a 12ms slot and serves stale values once over it. About 17ms a tick |
| PL-025 | Every mute reloaded the whole Set in each browser (292KB) and the button waited for it | **Fixed**; versioned snapshots, in-place patch updates, and taps held until Live answers. A tap shows in about 1–8ms |
| PL-026 | The cloud transport dropped meter messages under backpressure, which would have lost discrete changes sent the same way | **Fixed** before shipping patches: patches are flagged `keep` |
| PL-027 | `app-interactions.cjs` never set `snapshotReady`, so the app refused every command and the test stopped at its first check | **Fixed** in the fixture. The whole browser-interaction suite runs again |
| PL-028 | Renames, colours, Device On, added devices and clip edits made in Live waited for the background sweep: about 20s on a 67-track Set | **Fixed**; observed, re-read from cache in 1–3ms and sent as that one track. Real-Set cases bound each at 1s |
| PL-029 | Any edit outside the patched values resent the whole 290KB Set, rate-limited to about one every 570ms | **Fixed**; up to eight changed tracks and song values go as a `replace` patch of about 4KB |
| PL-030 | A change handled by a scheduled `Task` waited 70–180ms behind Live redrawing it | **Fixed**; discrete changes and structural re-reads run inside the notification, which allows reads |
| PL-031 | Observing every clip and device name of a large Set would take thousands of observers | **Fixed** by design: those are observed only for tracks a browser reports on screen (`view`), and a track scrolled into view is re-read once |
| PL-032 | `liveUpdates: true` reached browsers only with the next full snapshot, about 18s after the observers were ready (40s instead of 22s) | **Fixed**; the song is re-read when readiness flips, so it goes out as a `song` patch on the next tick |
| PL-033 | Renaming one of the first eight scenes changed the snapshot's shape and resent the whole 290KB Set | **Fixed**; the first scene page travels in the song patch; the shape is only the track and scene IDs |
| PL-034 | Scene names past the first page were not observed and waited for the sweep | **Fixed**; every scene page a browser reports is observed; a change there makes browsers reload that page |
| PL-035 | Fader and tempo moves waited up to 100ms for the tick | **Fixed**; the first change of a burst goes from the notification with Live's display text, the rest at most every 30ms |
| PL-036 | A stop waiting for the launch quantum (`fired_slot_index` -2) was not shown, and a tapped launch showed nothing until Live answered | **Fixed**; the playing clip and its Stop button blink while a stop is pending; a tapped launch or stop pulses at once |
| PL-037 | The real-Set clip launch time included the Python driver's own call | **Fixed** in the harness; it now times pending launch, playing and pending stop from after the call |
| PL-038 | Sends on off-screen tracks were observed, the bulk of observer install time on Sets with many returns | **Fixed**; sends are observed only on screen and swept elsewhere; a track scrolled into view is re-read first |

Known limit: on a heavily loaded machine (Live at about 140% CPU when stopped, plus antivirus) the real-Set telemetry check fails for both the old and the new code: Max's ticks start every 125–220ms instead of 100ms.

Known limit: LiveAPI itself strips backslashes from names before Pocket Live reads them.
