/** Pocket Live against a real, large, non-fixture Set: real Live + real Chrome.
 *
 *   npm run test:demo                       Help > Load Demo Set, both transports
 *   npm run test:demo -- --transport=local  One transport
 *   npm run test:demo -- --scale=64         Also duplicate tracks to reach N tracks
 *   npm run test:demo -- --profile=returns  Shape the Set first: large (64 tracks), returns
 *                                           (12 returns), scenes (64 scenes); comma-separated
 *   node tests/harness/real-set.mjs         Use the Set that is already open
 *
 * Each profile has budgets (real-set-budgets.json): a case whose evidence exceeds one fails, so a
 * change that slows a shape of Set down is caught on that shape.
 *
 * --open-demo discards unsaved changes in the open Set. Nothing is ever saved.
 * Edits are limited to tempo, one mute, one rename and --scale, and are restored.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const artifacts = path.join(root, "tests/artifacts");
const args = process.argv.slice(2);
const openDemo = args.includes("--open-demo");
const profiles = (args.find((a) => a.startsWith("--profile="))?.slice(10) || "").split(",").filter(Boolean);
const PROFILES = { large: { tracks: 64 }, returns: { returns: 12 }, scenes: { scenes: 64 } };
for (const p of profiles) if (!PROFILES[p]) throw Error("Unknown profile " + p + "; use " + Object.keys(PROFILES).join(", "));
const shapeOf = Object.assign({}, ...profiles.map((p) => PROFILES[p]));
const scale = Number(args.find((a) => a.startsWith("--scale="))?.slice(8) || shapeOf.tracks || 0);
const chosen = args.find((a) => a.startsWith("--transport="))?.slice(12) || "both";
if (args.some((a) => a !== "--open-demo" && !/^--scale=\d+$/.test(a) && !/^--transport=(local|cloud|both)$/.test(a) && !/^--profile=[\w,]+$/.test(a)))
  throw Error("Use --open-demo, --scale=N, --profile=large,returns,scenes, --transport=local|cloud|both");
// Budgets: case name -> evidence field -> maximum. The default applies, then each profile's.
const budgetFile = JSON.parse(fs.readFileSync(new URL("./real-set-budgets.json", import.meta.url), "utf8"));
const budgets = {};
for (const p of ["default", ...profiles]) for (const [name, limits] of Object.entries(budgetFile[p] || {})) budgets[name] = { ...budgets[name], ...limits };
const runName = profiles.length ? "-" + profiles.join("-") : scale ? "-scale" + scale : "";
const python = process.env.POCKET_LIVE_PYTHON || "python3";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const LIMIT = 32767; // Max's symbol truncation point: the original failure.
const FAST_MS = 1000; // A change made in Live must show this fast whatever the Set size.

async function until(check, label, ms = 15000, every = 100) {
  const deadline = Date.now() + ms;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await check();
      if (last) return last;
    } catch (error) {
      last = error.message;
    }
    await delay(every);
  }
  throw Error(label + " (last: " + JSON.stringify(last)?.slice(0, 200) + ")");
}

class Native {
  constructor() {
    this.pending = new Map();
    this.next = 0;
    this.process = spawn(python, [path.join(root, "tests/harness/real-set-driver.py")], { stdio: ["pipe", "pipe", "ignore"] });
    createInterface({ input: this.process.stdout }).on("line", (line) => {
      const m = JSON.parse(line), p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      m.ok ? p.resolve(m.result) : p.reject(Error(m.error));
    });
    this.process.on("exit", () => { for (const p of this.pending.values()) p.reject(Error("Native driver exited")); this.pending.clear(); });
  }
  call(op, extra = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.next;
      this.pending.set(id, { resolve, reject });
      this.process.stdin.write(JSON.stringify({ id, op, ...extra }) + "\n");
    });
  }
  close() { this.process.stdin.end(); return new Promise((r) => this.process.once("exit", r)); }
}

function kernelReady() {
  const r = spawnSync(python, [path.join(root, "tests/harness/prepare-live.py")], { encoding: "utf8", timeout: 15000 });
  try { return JSON.parse(r.stdout).ok ? JSON.parse(r.stdout).state : null; } catch { return null; }
}
async function ensureLive() {
  if (kernelReady()) return;
  console.log("Starting Live…");
  spawnSync("open", ["-a", process.env.POCKET_LIVE_APP || "Ableton Live 12 Suite"]);
  await until(kernelReady, "Live/AbletonKernel did not become available", 180000);
}
const liveKernel = (code) => {
  const script = `import sys;sys.path.insert(0,'tests/harness')
from live_oracle import LiveOracle
o=LiveOracle(timeout=5)
print(o.kernel.exec(${JSON.stringify(code)}))
o.close()`;
  const r = spawnSync(python, ["-c", script], { cwd: root, encoding: "utf8", timeout: 10000 });
  return r.status === 0 ? r.stdout.trim() : null;
};
// The UI is used only here, because Live has no API for opening a Set. Live's
// save dialog is custom-drawn: it has no accessible buttons and ignores synthetic
// AX clicks, so "Don't Save" needs a real mouse event at its fixed offset.
async function loadDemoSet() {
  if (spawnSync("which", ["cliclick"]).status) throw Error("--open-demo needs cliclick (brew install cliclick)");
  // Survives only in the Set being replaced, so opening is detected reliably.
  if (liveKernel("song.set_data('pocket_live_marker',1)\nTrue") !== "True") throw Error("Could not mark the open Set");
  // This click blocks until the dialog closes, so it runs in the background.
  const click = `tell application "System Events" to tell process "Live"
    set frontmost to true
    delay 0.3
    click menu item "Load Demo Set" of menu "Help" of menu bar 1
  end tell`;
  const menu = spawn("osascript", ["-e", click], { stdio: "ignore" });
  const dialog = `tell application "System Events" to tell process "Live"
    repeat with w in windows
      if (name of w as string) is "" then
        set {wx, wy} to position of w
        set {ww, wh} to size of w
        if ww < 700 and wh < 300 then return ((wx + 73) as string) & "," & ((wy + 117) as string)
      end if
    end repeat
    return ""
  end tell`;
  await until(() => {
    const at = spawnSync("osascript", ["-e", dialog], { encoding: "utf8", timeout: 5000 }).stdout?.trim();
    // A real mouse click lands on whatever is in front, so never click unless that is Live.
    const front = spawnSync("osascript", ["-e", 'tell application "System Events" to get frontmost of process "Live"'], { encoding: "utf8", timeout: 5000 }).stdout?.trim();
    if (at && front === "true") spawnSync("cliclick", ["c:" + at]);
    return liveKernel("song.get_data('pocket_live_marker',0)") === "0";
  }, "Demo Set did not open (Live must stay in front until its save dialog is dismissed)", 180000).finally(() => menu.kill());
  await delay(5000); // Let the Set's devices finish loading.
}

async function caseRun(report, name, fn) {
  const started = Date.now();
  try {
    const evidence = await fn();
    const over = Object.entries(budgets[name] || {}).filter(([k, max]) => Number.isFinite(evidence?.[k]) && evidence[k] > max).map(([k, max]) => `${k} ${evidence[k]} > ${max}`);
    if (over.length) throw Error("Over budget: " + over.join(", "));
    report.cases.push({ name, status: "passed", ms: Date.now() - started, evidence });
    console.log("  ok   " + name);
  } catch (error) {
    report.cases.push({ name, status: "failed", ms: Date.now() - started, error: String(error.message).replace(/https?:\/\/[^\s'"<>]+/g, "[private URL]") });
    console.log("  FAIL " + name + ": " + report.cases.at(-1).error);
  }
}
const pct = (list, p) => { const s = [...list].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null; };

async function runTransport(transport, browser) {
  const report = { schema: 1, kind: "real-set", transport, profiles, startedAt: new Date().toISOString(), status: "running", cases: [] };
  console.log("\n[" + transport + "]");
  const runtime = path.join(artifacts, "runtime", transport);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  // Only one Kernel client may run, so the native driver opens after preparation.
  const original = kernelReady();
  let native;
  const ordinary = original.tracks.filter((t) => t.kind === "track");
  const host = ordinary[0].name, probeIndex = Math.min(1, ordinary.length - 1), probe = ordinary[probeIndex];
  const restore = [];
  try {
    run(process.execPath, [path.join(root, "tools/prepare-test-runtime.mjs"), transport]);
    fs.rmSync(path.join(runtime, "session.json"), { force: true });
    const prepared = spawnSync(python, [path.join(root, "tests/harness/prepare-live.py"), "--allow-live-edits", "--transport", transport, "--runtime-root", runtime, "--track", host, "--timeout", "30"], { cwd: root, encoding: "utf8", timeout: 240000 });
    if (prepared.status) throw Error("QA device did not load: " + prepared.stdout);
    native = new Native();
    const session = await until(() => { const s = JSON.parse(fs.readFileSync(path.join(runtime, "session.json"), "utf8")); return s.url && s; }, "Device never published a link", 30000);

    const frames = { state: [], meters: [], maxState: 0, deviceGets: 0 };
    page.on("websocket", (ws) => ws.on("framereceived", ({ payload }) => {
      const text = String(payload), type = text.slice(9, 15), now = Date.now();
      if (type.startsWith("state")) { frames.state.push(now); frames.maxState = Math.max(frames.maxState, text.length); }
      // Song values now usually arrive in a patch rather than a whole snapshot.
      if (!frames.liveUpdates && text.includes('"liveUpdates":true')) frames.liveUpdates = now;
      if (type.startsWith("meters")) frames.meters.push(now);
    }).on("framesent", ({ payload }) => { if (String(payload).includes('"op":"device_get"')) frames.deviceGets++; }));
    // Where the last patch spent its time: Live to Node, Node to this page, then to the next frame.
    const lastPatch = () => page.evaluate(() => { const p = window.__patches?.at(-1); return p ? { bridgeMs: p.bridgeMs, arriveMs: p.arriveMs, drawnMs: p.drawnMs ?? null } : null; });
    const opened = Date.now();
    await page.goto(session.url);
    // A native read blocks Live's main thread, so it must not run during the timed load.
    const scope = original.tracks.length;
    let live;

    await caseRun(report, "first paint: every track appears, no offline banner", async () => {
      await until(() => page.evaluate((n) => document.querySelectorAll(".track[data-track]").length === n, scope), `Expected ${scope} rendered tracks`, scope > 40 ? 60000 : 20000);
      const offline = await page.locator("#offline.visible").count();
      if (offline) throw Error("Offline banner is still visible");
      const paintedMs = Date.now() - opened;
      await until(() => page.evaluate(() => !document.querySelector(".track.pending")), "Tracks never finished filling in", scope > 40 ? 60000 : 20000);
      live = await native.call("read");
      return { firstStateMs: frames.state[0] - opened, paintedMs, filledMs: Date.now() - opened, snapshots: frames.state.length, tracks: scope };
    });
    await caseRun(report, "snapshot really exceeds Max's symbol limit", async () => {
      await until(() => frames.maxState > 0, "No state frame");
      // Otherwise this run could not have caught the original truncation bug.
      if (frames.maxState <= LIMIT) throw Error("Snapshot only " + frames.maxState + " characters; Set too small to prove framing");
      return { stateChars: frames.maxState };
    });
    await caseRun(report, "rendered tracks match independent native readback", async () => {
      const shown = await page.evaluate(() => [...document.querySelectorAll(".track[data-track]")].map((t) => ({
        name: t.querySelector(".trackhead>span")?.textContent.trim() || "Main",
        // The attribute: a range input rounds its displayed value to its 0.001 step.
        volume: Number(t.querySelector('input[aria-label$=" volume"]').getAttribute("value")),
        devices: [...t.querySelectorAll(".devices .device:not(.child)")].map((d) => d.textContent.trim()),
      })));
      const mismatches = [];
      live.tracks.forEach((t, i) => {
        if (shown[i].name !== t.name && t.kind !== "master") mismatches.push(t.name + ": name " + shown[i].name);
        if (Math.abs(shown[i].volume - t.volume) > 1e-5) mismatches.push(t.name + ": volume");
        const expected = t.devices.slice(0, 32).map((d) => d.name).join("|");
        if (shown[i].devices.join("|") !== expected) mismatches.push(t.name + ": devices");
      });
      if (mismatches.length) throw Error(mismatches.slice(0, 5).join("; "));
      return { compared: live.tracks.length };
    });
    await caseRun(report, "Live's own changes are observed", async () => {
      // The device installs its observers after the first load; it says when they are all in place.
      await until(() => frames.liveUpdates, "Observers never finished installing", 60000);
      return { readyMs: frames.liveUpdates - opened };
    });
    await caseRun(report, "browser mute reaches Live quickly", async () => {
      const button = page.locator(`.track[data-track] .activator`).nth(probeIndex);
      restore.push(() => native.call("set_mute", { track: probeIndex, value: probe.mute }));
      // Timed inside the page, from the real pointerdown to the button changing: Playwright's
      // own click and polling would otherwise dominate the number.
      await button.evaluate((b) => {
        const target = b.dataset.target, tap = (window.__tap = {});
        document.addEventListener("pointerdown", () => { tap.down ??= performance.now(); }, { capture: true, once: true });
        new MutationObserver((records, o) => { if (records.some((r) => r.target.matches?.(`.activator[data-target="${target}"]`))) { tap.shown = performance.now(); o.disconnect(); } }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["class"] });
      });
      const started = Date.now();
      await button.click();
      // The tap shows at once; Live then confirms it.
      await until(async () => (await button.evaluate((e) => e.classList.contains("active"))) === probe.mute, "Browser did not show the tap", 1000);
      const shown_ms = await page.evaluate(() => Math.round((window.__tap.shown - window.__tap.down) * 10) / 10);
      if (!(shown_ms < 50)) throw Error("Tap took " + shown_ms + "ms to show");
      await until(async () => (await native.call("read")).tracks[probeIndex].mute === !probe.mute, "Native mute did not change", 3000);
      const native_ms = Date.now() - started;
      const latency = await page.evaluate(() => Number.parseInt(document.querySelector("#latency")?.textContent, 10));
      // The part of the ACK spent inside Max and Live, as the bridge measured it.
      const split = await page.evaluate(() => window.__lastAck || null);
      return { shownMs: shown_ms, nativeMs: native_ms, ackMs: latency, inLiveMs: split?.liveMs ?? null, upMs: split?.upMs ?? null, downMs: split?.downMs ?? null };
    });
    await caseRun(report, "native mute change reaches the browser", async () => {
      const button = page.locator(`.track[data-track] .activator`).nth(probeIndex);
      await native.call("set_mute", { track: probeIndex, value: probe.mute });
      const started = Date.now();
      // Observed in Live and patched straight through: this must not depend on Set size.
      await until(async () => (await button.evaluate((e) => e.classList.contains("active"))) === !probe.mute, "Browser missed native mute", FAST_MS, 10);
      return { ms: Date.now() - started, patch: await lastPatch() };
    });
    await caseRun(report, "native fader move reaches the browser", async () => {
      const fader = page.locator(`.track[data-track] input[aria-label$=" volume"]`).nth(probeIndex);
      restore.push(() => native.call("set_volume", { track: probeIndex, value: probe.volume }));
      const target = probe.volume > 0.5 ? 0.4 : 0.7;
      await native.call("set_volume", { track: probeIndex, value: target });
      const started = Date.now();
      await until(async () => Math.abs(Number(await fader.evaluate((e) => e.value)) - target) < 1e-3, "Browser missed native fader", FAST_MS, 10);
      const ms = Date.now() - started;
      // The dB text is formatted by Live (str_for_value) inside the notification; it must arrive too.
      const shown = await fader.evaluate((e) => e.closest(".track").querySelector(".volread").textContent);
      if (!/dB|inf/i.test(shown)) throw Error("Fader text was not Live's: " + shown);
      return { ms, shown, patch: await lastPatch() };
    });
    await caseRun(report, "native clip launch reaches the browser", async () => {
      const spot = await page.evaluate(() => { const strips = [...document.querySelectorAll(".track[data-track]")].filter((t) => t.querySelector(".trackstop")); for (let i = 0; i < strips.length; i++) { const clips = [...strips[i].querySelectorAll(".clip")]; const slot = clips.findIndex((c) => c.classList.contains("loaded")); if (slot >= 0) return { track: i, slot }; } return null; });
      if (!spot) return { skipped: "no clip in the first eight scenes" };
      restore.push(() => native.call("stop_clips"));
      const clip = page.locator(".track[data-track]").filter({ has: page.locator(".trackstop") }).nth(spot.track).locator(".clip").nth(spot.slot);
      // Live marks the clip triggered at once and plays it on the next launch quantum, so the
      // browser must show the pending launch fast; playing follows when Live says so.
      await native.call("fire", spot);
      const started = Date.now();
      await until(async () => clip.evaluate((e) => e.classList.contains("playing") || e.classList.contains("triggered")), "Browser missed native clip launch", FAST_MS, 10);
      const ms = Date.now() - started;
      await until(async () => clip.evaluate((e) => e.classList.contains("playing")), "Browser never showed the clip playing", 10000, 10);
      const playingMs = Date.now() - started;
      // A stop also waits for the quantum: the browser shows it pending.
      await native.call("stop_track", { track: spot.track });
      const stopAt = Date.now();
      const stopping = await until(async () => clip.evaluate((e) => e.classList.contains("stopping") || !e.classList.contains("playing")), "Browser missed the pending stop", FAST_MS, 10).then(() => clip.evaluate((e) => e.classList.contains("stopping")));
      const stopMs = Date.now() - stopAt;
      await native.call("stop_clips");
      return { ms, playingMs, stopMs, stopShownPending: stopping, ...spot };
    });
    await caseRun(report, "native scene launch shows pending", async () => {
      restore.push(() => native.call("stop_clips"));
      const scene = page.locator('[data-op="scene_fire"]').first();
      await native.call("fire_scene", { scene: 0 });
      const started = Date.now();
      // Live marks the scene triggered until the launch quantum; then its clips play.
      const pending = await until(async () => (await scene.evaluate((e) => e.classList.contains("triggered"))) || (await page.locator(".track[data-track] .clip.playing").count()) > 0, "Browser missed the scene launch", FAST_MS, 10).then(() => scene.evaluate((e) => e.classList.contains("triggered")));
      const ms = Date.now() - started;
      await native.call("stop_clips");
      await until(async () => !(await scene.evaluate((e) => e.classList.contains("triggered"))), "Scene stayed pending", 10000, 50);
      return { ms, shownPending: pending };
    });
    await caseRun(report, "native tempo change reaches the browser", async () => {
      restore.push(() => native.call("set_tempo", { value: original.tempo }));
      const target = original.tempo === 127 ? 128 : 127;
      await native.call("set_tempo", { value: target });
      const started = Date.now();
      await until(async () => Number(await page.inputValue("#tempo")) === target, "Browser missed native tempo", FAST_MS, 10);
      return { ms: Date.now() - started };
    });
    await caseRun(report, "tempo typed in the browser reaches Live", async () => {
      restore.push(() => native.call("set_tempo", { value: original.tempo }));
      const target = original.tempo === 133 ? 134 : 133;
      await page.fill("#tempo", String(target));
      await page.press("#tempo", "Enter");
      await until(async () => Math.abs((await native.call("read")).tempo - target) < 1e-3, "Native tempo did not change", 3000);
      return { target };
    });
    await caseRun(report, "non-ASCII and JSON-significant names survive framing", async () => {
      restore.push(() => native.call("rename", { track: probeIndex, name: probe.name }));
      // No backslash: LiveAPI itself strips those from names, before Pocket Live sees them.
      const name = 'Pocket ✓ "q" 日本語 🎹';
      await native.call("rename", { track: probeIndex, name });
      const started = Date.now();
      // Observed: a rename shows as fast as a mute, whatever the Set size.
      await until(async () => (await page.locator(".track[data-track]").nth(probeIndex).locator(".trackhead>span").first().textContent()).trim() === name, "Name was corrupted or slow", FAST_MS, 10);
      return { ms: Date.now() - started, patch: await lastPatch() };
    });
    await caseRun(report, "native track colour reaches the browser", async () => {
      const before = Number(await native.call("track_color", { track: probeIndex }));
      restore.push(() => native.call("set_color", { track: probeIndex, value: before }));
      const target = before === 0xff3636 ? 0x3c5aff : 0xff3636;
      await native.call("set_color", { track: probeIndex, value: target });
      const started = Date.now(), strip = page.locator(".track[data-track]").nth(probeIndex);
      // Live snaps a colour to its palette, so wait for any change rather than the exact value.
      await until(async () => !(await strip.getAttribute("style")).includes(before.toString(16).padStart(6, "0")), "Browser missed native colour", FAST_MS, 10);
      return { ms: Date.now() - started };
    });
    await caseRun(report, "native Device On reaches the browser", async () => {
      const devices = live.tracks[probeIndex].devices;
      if (!devices.length) return { skipped: "probe track has no devices" };
      const on = !!devices[0].on;
      restore.push(() => native.call("device_on", { track: probeIndex, device: 0, value: on ? 1 : 0 }));
      await native.call("device_on", { track: probeIndex, device: 0, value: on ? 0 : 1 });
      const started = Date.now(), button = page.locator(".track[data-track]").nth(probeIndex).locator(".devices .device:not(.child)").first();
      await until(async () => (await button.evaluate((e) => e.classList.contains("off"))) === on, "Browser missed native Device On", FAST_MS, 10);
      return { ms: Date.now() - started };
    });
    await caseRun(report, "native clip rename reaches the browser", async () => {
      // A track on screen: its clips are observed.
      const spot = await page.evaluate(() => { const strips = [...document.querySelectorAll(".track[data-track]")], box = document.querySelector("#main").getBoundingClientRect(); for (let i = 0; i < strips.length; i++) { const r = strips[i].getBoundingClientRect(); if (r.left < box.left || r.right > box.right || !strips[i].querySelector(".trackstop")) continue; const slot = [...strips[i].querySelectorAll(".clip")].findIndex((c) => c.classList.contains("loaded")); if (slot >= 0) return { strip: i, slot }; } return null; });
      if (!spot) return { skipped: "no clip on a visible track" };
      const trackIndex = (await page.evaluate(() => [...document.querySelectorAll(".track[data-track]")].map((t) => !!t.querySelector(".trackstop")))).slice(0, spot.strip).filter(Boolean).length;
      const before = await native.call("clip_name", { track: trackIndex, slot: spot.slot });
      restore.push(() => native.call("clip_rename", { track: trackIndex, slot: spot.slot, name: before }));
      const name = "Pocket clip ✓";
      await native.call("clip_rename", { track: trackIndex, slot: spot.slot, name });
      const started = Date.now(), clip = page.locator(".track[data-track]").nth(spot.strip).locator(".clip").nth(spot.slot);
      await until(async () => (await clip.locator(".name").textContent()).trim() === name, "Browser missed native clip rename", FAST_MS, 10);
      return { ms: Date.now() - started, track: trackIndex, slot: spot.slot };
    });
    await caseRun(report, "native scene rename reaches the browser", async () => {
      // Scene names were part of the snapshot's shape: a rename resent the whole Set. Now it is
      // observed and goes in the song patch.
      const before = await native.call("scene_name", { scene: 0 });
      restore.push(() => native.call("scene_rename", { scene: 0, name: before }));
      const name = "Pocket scene ✓";
      await native.call("scene_rename", { scene: 0, name });
      const started = Date.now(), scene = page.locator('[data-op="scene_fire"]').first();
      await until(async () => (await scene.textContent()).includes(name), "Browser missed native scene rename", FAST_MS, 10);
      return { ms: Date.now() - started };
    });
    await caseRun(report, "scrolled-to clips are observed too", async () => {
      // Clips are watched only where a browser is looking: scroll to the far end, then edit there.
      await page.evaluate(() => { const m = document.querySelector("#main"); m.scrollLeft = m.scrollWidth; });
      await delay(1500); // The view report, then the observers for what came into view.
      const spot = await page.evaluate(() => { const strips = [...document.querySelectorAll(".track[data-track]")], box = document.querySelector("#main").getBoundingClientRect(); for (let i = strips.length - 1; i >= 0; i--) { const r = strips[i].getBoundingClientRect(); if (r.left < box.left || r.right > box.right || !strips[i].querySelector(".trackstop")) continue; const slot = [...strips[i].querySelectorAll(".clip")].findIndex((c) => c.classList.contains("loaded")); if (slot >= 0) return { strip: i, slot }; } return null; });
      if (!spot) return { skipped: "no clip on the last visible tracks" };
      const trackIndex = (await page.evaluate(() => [...document.querySelectorAll(".track[data-track]")].map((t) => !!t.querySelector(".trackstop")))).slice(0, spot.strip).filter(Boolean).length;
      if (trackIndex < 8) return { skipped: "Set too narrow to scroll" };
      const before = await native.call("clip_name", { track: trackIndex, slot: spot.slot });
      restore.push(() => native.call("clip_rename", { track: trackIndex, slot: spot.slot, name: before }));
      const name = "Scrolled ✓";
      await native.call("clip_rename", { track: trackIndex, slot: spot.slot, name });
      const started = Date.now(), clip = page.locator(".track[data-track]").nth(spot.strip).locator(".clip").nth(spot.slot);
      await until(async () => (await clip.locator(".name").textContent()).trim() === name, "Browser missed a clip rename on a scrolled-to track", FAST_MS, 10);
      await page.evaluate(() => { document.querySelector("#main").scrollLeft = 0; });
      return { ms: Date.now() - started, track: trackIndex };
    });
    await caseRun(report, "scene paging shows off-page scenes", async () => {
      const count = (await native.call("state")).scenes;
      if (count <= 8) return { skipped: "Set has 8 or fewer scenes" };
      await page.locator("footer [data-op=next]").click();
      await page.locator("#scenerange").filter({ hasText: `9–${Math.min(16, count)} / ${count}` }).waitFor({ timeout: 8000 });
      await page.locator("footer [data-op=previous]").click();
      return { scenes: count };
    });
    await caseRun(report, "a large device opens with its parameters", async () => {
      const devices = page.locator(".track[data-track] .devices .device:not(.child)");
      const names = await devices.allInnerTexts();
      const preferred = names.findIndex((n) => /Drum Rack|Rack|Reverb|Compressor|Delay/.test(n));
      await devices.nth(Math.max(0, preferred)).click();
      await page.locator("#drawerBody input, #drawerBody [data-device-face], #drawerBody [data-svg-device]").first().waitFor({ timeout: 8000 });
      await page.keyboard.press("Escape");
      return { device: names[Math.max(0, preferred)] };
    });
    await caseRun(report, "an open device follows Live without polling", async () => {
      const devices = live.tracks[probeIndex].devices;
      if (!devices.length) return { skipped: "probe track has no devices" };
      await page.locator(".track[data-track]").nth(probeIndex).locator(".devices .device:not(.child)").first().click();
      // The panel's model, read from the page: a continuous parameter other than Device On.
      const pick = await until(() => page.evaluate(() => { const d = window.__openDevice?.(); if (!d) return null; const i = d.parameters.findIndex((p, i) => i > 0 && p.enabled && !p.quantized); return i < 0 ? { none: true } : { index: i, id: d.parameters[i].id, min: d.parameters[i].min, max: d.parameters[i].max, value: d.parameters[i].value }; }), "Device panel never loaded", 8000);
      if (pick.none) { await page.locator('#drawer [data-op="close"]').click(); return { skipped: "no continuous parameter" }; }
      restore.push(() => native.call("set_device_param", { track: probeIndex, device: 0, param: pick.index, value: pick.value }));
      await delay(1000); // The view report, then the observers for this device.
      const gets = frames.deviceGets, target = pick.min + (pick.max - pick.min) * (pick.value - pick.min < (pick.max - pick.min) / 2 ? 0.75 : 0.25);
      await native.call("set_device_param", { track: probeIndex, device: 0, param: pick.index, value: target });
      const started = Date.now();
      await until(() => page.evaluate(({ id, target }) => { const p = window.__openDevice?.()?.parameters.find((p) => p.id === id); return p && Math.abs(p.value - target) < 1e-4; }, { id: pick.id, target }), "Open device missed a change made in Live", FAST_MS, 10);
      const ms = Date.now() - started, polled = frames.deviceGets - gets;
      await native.call("set_device_param", { track: probeIndex, device: 0, param: pick.index, value: pick.value });
      await page.locator('#drawer [data-op="close"]').click();
      if (polled) throw Error("The panel fetched the device " + polled + " times instead of being patched");
      return { ms, param: pick.index, patch: await lastPatch() };
    });
    await caseRun(report, "Arrangement view shows the Set's clips", async () => {
      const facts = await native.call("state");
      await page.getByRole("button", { name: "Arrangement", exact: true }).click();
      if (facts.arrangement) await page.locator("#main [data-op=arrclip]").first().waitFor({ timeout: 8000 });
      if (facts.arrangement) await until(() => page.locator("#main canvas.clip-waveform,#main .clip-waveform").count(), "No audio waveform drew", 20000);
      await page.screenshot({ path: path.join(artifacts, `real-set-${transport}-arrangement.png`) });
      await page.getByRole("button", { name: "Session", exact: true }).click();
      return { arrangementClips: facts.arrangement };
    });
    await caseRun(report, "Max stays responsive: telemetry does not stall", async () => {
      frames.meters.length = 0;
      await delay(10000);
      const gaps = frames.meters.slice(1).map((t, i) => t - frames.meters[i]);
      const result = { messages: frames.meters.length, p50: pct(gaps, 0.5), p95: pct(gaps, 0.95), max: Math.max(...gaps) };
      // Idle meters only send changes plus a 4Hz keepalive.
      if (frames.meters.length < 30 || result.p95 > 400 || result.max > 1500) throw Error("Telemetry stalled: " + JSON.stringify(result));
      return result;
    });
    await caseRun(report, "idle Set does not flood the connection", async () => {
      await delay(6000); // Let the scene-page lease from the paging case expire.
      const at = frames.state.length;
      await delay(11000);
      const sent = frames.state.length - at;
      if (sent > 4) throw Error(sent + " snapshots in 11s while idle");
      return { snapshotsIn11s: sent };
    });
    await page.screenshot({ path: path.join(artifacts, `real-set-${transport}.png`) });
  } finally {
    for (const undo of restore.reverse()) await undo().catch(() => {});
    await context.close();
    await native?.close();
    report.finishedAt = new Date().toISOString();
    report.status = report.cases.length && report.cases.every((c) => c.status === "passed") ? "passed" : "failed";
    fs.mkdirSync(artifacts, { recursive: true });
    fs.writeFileSync(path.join(artifacts, `real-set-${transport}${runName}.json`), JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  }
  return report;
}
function run(command, argv) {
  const r = spawnSync(command, argv, { cwd: root, encoding: "utf8", timeout: 240000 });
  if (r.status) throw Error(path.basename(argv[0]) + " failed: " + (r.stderr || r.stdout).slice(0, 400));
}

let browser, exit = 0;
try {
  await ensureLive();
  if (openDemo) await loadDemoSet();
  run(python, [path.join(root, "tools/package_release.py"), "--web-only"]);
  if (scale) {
    const native = new Native();
    await native.call("remove_qa");
    let count = (await native.call("read")).tracks.filter((t) => t.kind === "track").length, source = 0;
    while (count < scale) {
      count = await native.call("duplicate", { track: source });
      source = (source + 2) % count; // Spread duplicates across the Set's varied tracks.
    }
    console.log("Scaled Set to " + count + " tracks (unsaved)");
    // Duplicated tracks keep Live busy loading samples; timing them then measures that.
    await until(async () => { const t = Date.now(); await native.call("state"); return Date.now() - t < 500; }, "Live stayed busy after scaling", 120000);
    await native.close();
  }
  {
    const native = new Native();
    await native.call("stop");
    // Returns and scenes for the chosen profiles, added unsaved like --scale.
    if (shapeOf.returns) { let n = (await native.call("read")).tracks.filter((t) => t.kind === "return").length; while (n < shapeOf.returns) n = await native.call("add_return"); console.log("Set has " + n + " returns (unsaved)"); }
    if (shapeOf.scenes) { let n = (await native.call("state")).scenes; while (n < shapeOf.scenes) n = await native.call("add_scene"); console.log("Set has " + n + " scenes (unsaved)"); }
    await native.close();
  }
  browser = await chromium.launch({ channel: "chrome", headless: !process.env.POCKET_LIVE_HEADED });
  for (const transport of chosen === "both" ? ["local", "cloud"] : [chosen]) {
    const report = await runTransport(transport, browser);
    if (report.status !== "passed") exit = 1;
    console.log(`[${transport}] ${report.status}: ${report.cases.filter((c) => c.status === "passed").length}/${report.cases.length}`);
  }
} catch (error) {
  console.error("BLOCKED: " + String(error.message).replace(/https?:\/\/[^\s'"<>]+/g, "[private URL]"));
  exit = 2;
} finally {
  await browser?.close();
}
process.exit(exit);
