# Device views

Utility, Auto Filter, Echo, and EQ Eight register profiles in `web/` and bind
to the actual device parameters in Live. A mismatched class or parameter
signature uses the generic panel. Rack devices use the same panel machinery.
Graph displays show approximations; no live analyzer or expanded view is
provided.

- `device-ui.js` validates bindings and supplies shared HTML controls.
- `parameter-sync.js` reconciles writes and Live acknowledgements per parameter.
- `device-gestures.js` and `svg-device-controls.js` handle input and drag ownership.
- `device-renderers/` holds the Echo and EQ Eight SVG models. Profiles adapt
  them to live instances. EQ Eight view edits use the validated `eq8_view`
  command; Echo links timing without linking offsets.

To add a profile, use `python3 tools/device_ui.py --help` for the capture,
scaffold, and audit commands. Register it after the shared toolkit in
`web/index.html`; include a generic **All parameters** fallback. Keep
device-specific curves and unit conversions with the renderer.

The in-repo models are sufficient to build. When importing an updated model,
run the matching `tools/sync_*` script with `--source` and review the resulting
parameter bindings. Keep session records, capture datasets, and screenshots
outside the release.

## Pointer and touch interaction

`DeviceGestures` owns parameter claims across simultaneous fingers. HTML ranges
and SVG scalars share relative screen-space dragging: knobs choose the dominant
horizontal or vertical axis after a 3px dead zone; sliders follow their displayed orientation.
A full scalar range takes 480 CSS pixels on touch or 360 with a mouse, independent
of the rendered knob size. Shift slows mouse adjustment by ten times. Movement
clamps incrementally so reversing at an endpoint responds immediately.

EQ Eight graph handles use nearest-center acquisition within 22 CSS pixels on
touch (44px diameter). Graph drags start from the current frequency/gain/Q,
retain the grabbed band/channel for each finger, and transform screen deltas to
plot deltas without snapping the handle to the initial contact point.
Device surfaces suppress text selection and callouts. Add Device does not focus
search automatically on coarse pointers; editable touch fields use at least 16px
text to avoid iOS focus zoom.

Two-finger control gestures must not zoom the page. The controller body declares
`touch-action: pan-x pan-y` (scrolling without pinch), while drag surfaces declare
`none`. `DeviceGestures.installTouchGuard()` adds non-passive capture listeners
for multi-touch on controls and WebKit gesture events. It records contacts at
touch-down, so dragging outside a control or replacing an SVG node does not
lose protection. Single-finger scrolling outside controls remains available;
there is no restrictive viewport maximum-scale/user-scalable setting.

## Streaming and lifecycle rules

`DeviceGestures.stream` sends a leading update, coalesces intermediate intent at
a bounded rate, and `flush` sends a distinct final value before releasing the
parameter claim. The interval grows with active parameter count to leave room
under the local/cloud relay's 30-command-per-second limit. Do not replace this
with a timer restarted on every movement: that starves writes during a drag.

All writes must pass the shared online/ownership check in `writeParameter` with
the originating pointer when applicable. Stationary gestures never write.
Disconnect, set change or backgrounding resets parameter/view queues, streams,
active gestures and pending requests; late callbacks are ignored by entry
identity and the app interaction generation. Reset actions cannot steal another
finger's parameter.

`node tests/integration/browser/app-interactions.cjs`, `node tests/unit/state/parameter-sync.cjs` and
`node tests/unit/interaction/device-streaming.cjs` cover these rules against production handlers
and controlled transports/clocks.
