# Real acceptance coverage and remaining work

The main route is `npm test`, which runs unattended actual Chrome + M4L + Live.
Missing Live does not turn into a mocked pass. The user must explicitly choose
`--prepare` before an arbitrary current set can be replaced. No set is saved.

Implemented real scenarios run unchanged against Local and Cloud:

- Three independent browser contexts joining the current native state.
- Browser tempo/mixer/mute/solo/arm/metronome changes, and native changes back to every browser.
- Rapid actual mouse drags: native intermediate changes **before release**, then final-value agreement.
- Two simultaneous Chrome touch contacts: independent faders and no page pinch zoom.
- Concurrent browser edits, followed by a known final accepted native write.
- Browser-local navigation isolation; refresh and disconnect/native-edit/reconnect.
- Network disconnect during an active drag, with a newer native value preserved after reconnect.
- Actual transport start/stop.
- Browser track creation, rename and deletion.
- Browser scene creation/deletion with independent native scene count and all-browser footer checks.
- Browser MIDI clip creation, rename, doubled loop and deletion, with independent native clip readback.
- Utility and Auto Filter native-to-panel and actual panel-to-native parameter changes across three panels.

The common mixer/transport convergence comparator is independent of Pocket Live's
snapshot and ACK data. Detailed native snapshots additionally inspect actual
clips/scenes/device paths. Native accepted order defines concurrent results;
browser clocks do not. Numeric comparison tolerance is `1e-5` raw API units.
Volatile meters/playhead and browser-local navigation are not literal shared-state
comparisons; navigation gets its own isolation check.

**Still to implement/validate**, not implicit passes: device/track reordering,
clip recording and finalized audio waveform data, deletion during every profile's
active gesture, fine-grained browser suspension/background/rotation recovery,
Live restart/set replacement/M4L reload during edits, persisted mappings across
actual reopen, adversarial real relay clients, many-browser load,
long-running resource/CPU/listener soak. An optional real-browser latency/jitter
matrix now exists; see [network coverage and limits](network/README.md).
External MIDI/Push and physical mobile touch require their actual hardware.
Chrome touch emulation is explicitly labelled and does not claim phone coverage.

Cloud uses the currently deployed real web UI; Local uses the current QA minified
build. Reports record the observed JS hashes. A Cloud pass does not establish that
undeployed browser/Worker changes were exercised. No deployment is hidden inside
the test command.

Retained component regressions are opt-in through `test:regressions`. Their scope
is exact race/failure interleavings already known to expose real bugs, plus checks
that the acceptance oracle cannot falsely pass. Other historical checks remain
available explicitly through `test:offline`; they are not acceptance evidence.

## Regressions added after the baseline

Idle focused tempo and pinned pan controls previously retained stale values;
scene pagination moved other browsers unexpectedly. All three are fixed. The
main test command includes five real-browser checks covering these fixes,
preservation/cancellation of unfinished tempo typing and repeated reconnects
with native changes while a browser is offline. Page-two clip creation and
rename are independently checked after shared refreshes. See [the ledger](../BUG-LEDGER.md).
