/** Unattended acceptance: actual Chrome inputs -> real M4L -> independent Live.
 * No app internals, fake DOM, mock sockets, or injected application events.
 */
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { NativeClient } from "./native-client.mjs";
import { NetworkProxy, NETWORK_PROFILES } from "./network-proxy.mjs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const transport = process.argv[2] || "local";
if (!["local", "cloud"].includes(transport)) throw Error("Use local or cloud");
const networkProfile = process.argv[3] || null;
if (networkProfile && !Object.hasOwn(NETWORK_PROFILES, networkProfile)) throw Error("Unknown network profile");
const networkSettings = networkProfile ? NETWORK_PROFILES[networkProfile] : null;
const runLabel = transport + (networkProfile ? "-" + networkProfile : "");
const artifacts = path.join(root, "tests/artifacts");
const sessionFile = path.join(artifacts, "runtime", transport, "session.json");
const report = {
  schema: 1,
  kind: "unattended-real-browser-native-live",
  transport,
  networkProfile,
  startedAt: new Date().toISOString(),
  status: "running",
  cases: [],
  assets: {},
  commands: [],
  limitations: [
    "Actual desktop Chrome, with separate browser contexts",
    "Touch input is Chrome touch emulation, not physical hardware",
    "Cloud serves deployed assets; Local serves the current QA build",
    "No real MIDI/Push hardware or computer sleep/restart in this suite",
  ],
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (message) =>
  String(message)
    .replace(/https?:\/\/[^\s'"<>]+/g, "[private URL]")
    .slice(0, 2000);
let browser, native;
const clients = [], proxies = [];
function startNative() { native = new NativeClient({ edits: true }); }
function call(op, args = {}) { return native.call(op, args); }
function projectNative(s) {
  return {
    tempo: s.tempo,
    playing: s.playing,
    metronome: s.metronome,
    tracks: s.tracks.map((t) => ({
      name: t.name,
      volume: t.volume,
      pan: t.pan,
      mute: t.mute,
      solo: t.solo,
      arm: t.arm,
      devices: t.devices.map((d) => d.name),
    })),
  };
}
async function rendered(page) {
  return page.evaluate(() => ({
    tempo: Number(document.querySelector("#tempo").value),
    playing: document.querySelector("#play").classList.contains("active"),
    metronome: document.querySelector("#metro").classList.contains("active"),
    tracks: [...document.querySelectorAll(".track[data-track]")].map((t) => ({
      name: t.querySelector(".trackhead>span")?.textContent.trim() || "Main",
      volume: Number(t.querySelector('input[aria-label$=" volume"]').value),
      pan: Number(t.querySelector('input[aria-label$=" pan"]').value),
      mute: t.querySelector(".activator")
        ? !t.querySelector(".activator").classList.contains("active")
        : false,
      solo: t.querySelector(".solo")?.classList.contains("active") || false,
      arm: t.querySelector(".arm")?.classList.contains("active") || false,
      devices: [...t.querySelectorAll(".devices .device:not(.child)")].map(
        (d) => d.textContent.trim(),
      ),
    })),
  }));
}
function diff(a, b, p = "$") {
  if (typeof a === "number" && typeof b === "number")
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-5
      ? []
      : [p];
  if (Array.isArray(a) && Array.isArray(b))
    return [
      ...(a.length === b.length ? [] : [p + ".length"]),
      ...a.flatMap((v, i) => diff(v, b[i], p + "[" + i + "]")),
    ];
  if (a && b && typeof a === "object" && typeof b === "object")
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) =>
      diff(a[k], b[k], p + "." + k),
    );
  return a === b ? [] : [p];
}
function requireValue(actual, expected, label) {
  if (diff(expected, actual).length)
    throw Error(
      label +
        ": expected " +
        JSON.stringify(expected) +
        " got " +
        JSON.stringify(actual),
    );
}
async function settle(expected) {
  const deadline = Date.now() + 12000;
  let stableSince = 0,
    previous,
    observations = 0,
    last = [];
  while (Date.now() < deadline) {
    const authoritative = projectNative(await call("snapshot"));
    const views = await Promise.all(clients.map((c) => rendered(c.page)));
    observations++;
    last = views.flatMap((view, i) =>
      diff(authoritative, view, "browser-" + i),
    );
    if (expected && !expected(authoritative))
      last.push("expected-native-intent");
    if (!last.length) {
      if (!previous || diff(previous, authoritative).length) {
        stableSince = Date.now();
        previous = authoritative;
      }
      if (Date.now() - stableSince >= 500)
        return { observations, native: authoritative, browsers: views };
    } else {
      stableSince = 0;
      previous = null;
    }
    await delay(100);
  }
  throw Error("Convergence deadline: " + last.join(", "));
}
async function scenario(id, action) {
  const start = Date.now();
  console.log("[" + transport + "] " + id);
  try {
    const evidence = await action();
    report.cases.push({
      id,
      status: "passed",
      durationMs: Date.now() - start,
      ...evidence,
    });
  } catch (error) {
    report.cases.push({
      id,
      status: "failed",
      durationMs: Date.now() - start,
      error: clean(error.message),
    });
    for (let i = 0; i < clients.length; i++)
      await clients[i].page
        .screenshot({
          path: path.join(artifacts, runLabel + "-failure-" + i + ".png"),
        })
        .catch(() => {});
    throw error;
  } finally {
    await save();
  }
}
async function save() {
  await fs.mkdir(artifacts, { recursive: true });
  await fs.writeFile(
    path.join(artifacts, "real-browsers-" + runLabel + ".json"),
    JSON.stringify(report, null, 2) + "\n",
    { mode: 0o600 },
  );
}
async function typeTempo(page, value) {
  const input = page.getByRole("spinbutton", { name: "Tempo", exact: true });
  await input.click();
  await input.press("ControlOrMeta+A");
  await input.pressSequentially(String(value));
  await input.press("Enter");
  await page.getByRole("button", { name: "Mixer", exact: true }).click();
}
async function openDevice(page, name) {
  await page.getByRole("button", { name, exact: true }).click();
  await page
    .locator("#drawerBody [data-device-face],#drawerBody [data-svg-device]")
    .waitFor({ timeout: 10000 });
}
async function parameterViews(name, expected) {
  const deadline = Date.now() + 10000;
  let last;
  while (Date.now() < deadline) {
    last = await Promise.all(
      clients.map(async ({ page }) => {
        const slider = page.getByRole("slider", { name, exact: true });
        if (!(await slider.isVisible()))
          throw Error("Device control is not visibly rendered: " + name);
        return slider.evaluate((hit) => ({
          value: Number(hit.getAttribute("aria-valuenow")),
          min: Number(hit.getAttribute("aria-valuemin")),
          max: Number(hit.getAttribute("aria-valuemax")),
          turn: parseFloat(
            getComputedStyle(hit.closest(".ut-knob")).getPropertyValue(
              "--turn",
            ),
          ),
          display: hit.getAttribute("aria-valuetext"),
        }));
      }),
    );
    if (
      last.every(
        (v) =>
          Math.abs(v.value - expected) < 1e-5 &&
          Math.abs(
            v.turn - (-135 + (270 * (expected - v.min)) / (v.max - v.min)),
          ) < 1e-4,
      )
    )
      return last;
    await delay(150);
  }
  throw Error(
    "Visible parameter " + name + " did not converge: " + JSON.stringify(last),
  );
}

async function parameterRead(track, devicePath, name) {
  const ps = await call("parameters", { track, devicePath });
  const p = ps.find((p) => p.name === name);
  if (!p) throw Error("Missing native parameter " + name);
  return p;
}
try {
  const session = JSON.parse(await fs.readFile(sessionFile, "utf8"));
  if (!session.url || (session.expires && session.expires < Date.now()))
    throw Error("No fresh active device session");
  startNative();
  await call("snapshot");
  await call("transport", { property: "playing", value: false });
  await call("transport", { property: "record", value: false });
  await call("transport", { property: "metronome", value: false });
  await call("tempo", { value: 120 });
  for (const track of ["Lab Audio", "Lab MIDI"])
    for (const [property, value] of Object.entries({
      mute: false,
      solo: false,
      arm: false,
      volume: 0.85,
      pan: 0,
    }))
      await call("mixer", { track, property, value });
  browser = await chromium.launch({
    channel: "chrome",
    headless: process.env.POCKET_LIVE_HEADED !== "1",
  });
  for (const name of ["A", "B", "C"]) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      hasTouch: true,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.on("websocket", (socket) => {
      socket.on("framesent", (frame) => {
        try {
          const m = JSON.parse(String(frame.payload));
          if (m.type === "command")
            report.commands.push({
              client: name,
              direction: "sent",
              id: m.id,
              op: m.op,
              target: m.target,
              value: m.value,
            });
        } catch {}
      });
      socket.on("framereceived", (frame) => {
        try {
          const m = JSON.parse(String(frame.payload));
          if (m.type === "result")
            report.commands.push({
              client: name,
              direction: "result",
              id: m.id,
              ok: m.ok,
              error: m.error ? clean(m.error) : undefined,
            });
        } catch {}
      });
    });
    page.on("response", (response) => {
      if (new URL(response.url()).pathname === "/app.js")
        response
          .body()
          .then(
            (body) =>
              (report.assets[name] = createHash("sha256")
                .update(body)
                .digest("hex")),
          )
          .catch(() => {});
    });
    const proxy = networkProfile ? await NetworkProxy.start(session.url, {
      profile: networkProfile, seed: 20261103 + proxies.length * 1000,
    }) : null;
    if (proxy) proxies.push(proxy);
    const url = proxy ? proxy.url.href : session.url;
    await page.goto(url);
    await page
      .getByRole("slider", { name: "Lab MIDI volume", exact: true })
      .waitFor({ timeout: 15000 });
    clients.push({ name, context, page, url, proxy });
  }
  const [A, B, C] = clients.map((c) => c.page);
  await scenario("three-real-browsers-join-current-Live", () => settle());
  await scenario("browser-tempo-to-Live-and-other-browsers", async () => {
    await typeTempo(A, 132.5);
    return settle((s) => s.tempo === 132.5);
  });
  await scenario("native-tempo-to-every-browser", async () => {
    await call("tempo", { value: 141.25 });
    return settle((s) => s.tempo === 141.25);
  });
  await scenario("browser-mute-solo-arm", async () => {
    for (const name of ["Lab Audio activator", "Lab MIDI solo", "Lab MIDI arm"])
      await B.getByRole("button", { name, exact: true }).click();
    return settle(
      (s) =>
        s.tracks.find((t) => t.name === "Lab Audio").mute &&
        s.tracks.find((t) => t.name === "Lab MIDI").solo &&
        s.tracks.find((t) => t.name === "Lab MIDI").arm,
    );
  });
  await scenario("browser-mixer-and-metronome", async () => {
    const initial = projectNative(await call("snapshot")),
      m = initial.tracks.find((t) => t.name === "Lab MIDI");
    await C.getByRole("button", { name: "Metronome", exact: true }).click();
    await C.getByRole("slider", { name: "Lab MIDI volume", exact: true }).press(
      "ArrowDown",
    );
    await C.getByRole("slider", { name: "Lab MIDI pan", exact: true }).press(
      "ArrowRight",
    );
    return settle(
      (s) =>
        s.metronome !== initial.metronome &&
        s.tracks.find((t) => t.name === "Lab MIDI").volume < m.volume &&
        s.tracks.find((t) => t.name === "Lab MIDI").pan > m.pan,
    );
  });
  await scenario("native-mixer-to-every-browser", async () => {
    await call("mixer", { track: "Lab MIDI", property: "volume", value: 0.63 });
    await call("mixer", { track: "Lab MIDI", property: "pan", value: -0.24 });
    await call("mixer", { track: "Lab MIDI", property: "arm", value: false });
    await call("mixer", { track: "Lab MIDI", property: "solo", value: false });
    return settle(
      (s) =>
        Math.abs(s.tracks.find((t) => t.name === "Lab MIDI").volume - 0.63) <
        1e-5,
    );
  });
  await scenario(
    "rapid-real-drag-streams-before-release-and-final-value",
    async () => {
      const fader = A.getByRole("slider", {
          name: "Lab MIDI volume",
          exact: true,
        }),
        box = await fader.boundingBox();
      await A.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await A.mouse.down();
      let before = (await call("snapshot")).tracks.find(
        (t) => t.name === "Lab MIDI",
      ).volume;
      try {
        for (let i = 1; i <= 12; i++) {
          await A.mouse.move(
            box.x + box.width / 2,
            box.y + box.height / 2 - i * 4,
          );
          // Keep the gesture active long enough for a deliberately delayed
          // first write to reach real Live before testing intermediate progress.
          await delay(Math.max(25, Math.ceil(((networkSettings?.delayMs || 0) + (networkSettings?.jitterMs || 0) + 200) / 12)));
        }
        let during;
        const progressDeadline = Date.now() + (networkSettings ? Math.max(1500, 4 * (networkSettings.delayMs + networkSettings.jitterMs)) : 0);
        do {
          during = (await call("snapshot")).tracks.find(t => t.name === "Lab MIDI").volume;
          if (during > before + 0.02) break;
          if (Date.now() < progressDeadline) await delay(100);
        } while (Date.now() < progressDeadline);
        if (during <= before + 0.02)
          throw Error("No native intermediate write before release");
      } finally {
        await A.mouse.up();
      }
      const final = Number(await fader.inputValue());
      return settle(
        (s) =>
          Math.abs(s.tracks.find((t) => t.name === "Lab MIDI").volume - final) <
          1e-5,
      );
    },
  );
  await scenario(
    "two-real-touch-drags-independent-without-pinch-zoom",
    async () => {
      const initial = projectNative(await call("snapshot")),
        boxes = await Promise.all(
          ["Lab Audio volume", "Lab MIDI volume"].map((name) =>
            A.getByRole("slider", { name, exact: true }).boundingBox(),
          ),
        );
      const cdp = await clients[0].context.newCDPSession(A),
        point = (id, offset) => ({
          id,
          x: boxes[id - 1].x + boxes[id - 1].width / 2,
          y: boxes[id - 1].y + boxes[id - 1].height / 2 + offset,
          radiusX: 2,
          radiusY: 2,
          force: 1,
        });
      const scale = await A.evaluate(() => visualViewport.scale);
      try {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [point(1, 0)],
        });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [point(1, 0), point(2, 0)],
        });
        for (let i = 1; i <= 8; i++) {
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [point(1, -i * 3), point(2, i * 3)],
          });
          await delay(25);
        }
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        requireValue(
          await A.evaluate(() => visualViewport.scale),
          scale,
          "Touch drag changed page zoom",
        );
        return await settle(
          (s) =>
            s.tracks.find((t) => t.name === "Lab Audio").volume >
              initial.tracks.find((t) => t.name === "Lab Audio").volume +
                0.02 &&
            s.tracks.find((t) => t.name === "Lab MIDI").volume <
              initial.tracks.find((t) => t.name === "Lab MIDI").volume - 0.02,
        );
      } finally {
        await cdp
          .send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
          })
          .catch(() => {});
        await cdp.detach();
      }
    },
  );
  await scenario("simultaneous-browser-edits-converge", async () => {
    await Promise.all([
      B.getByRole("slider", { name: "Lab MIDI pan", exact: true }).press(
        "ArrowLeft",
      ),
      C.getByRole("slider", { name: "Lab MIDI pan", exact: true }).press(
        "ArrowRight",
      ),
    ]);
    return settle();
  });
  await scenario("explicit-final-native-intent-wins", async () => {
    await call("mixer", { track: "Lab MIDI", property: "pan", value: 0.37 });
    return settle(
      (s) =>
        Math.abs(s.tracks.find((t) => t.name === "Lab MIDI").pan - 0.37) < 1e-5,
    );
  });
  await scenario("browser-local-navigation-does-not-propagate", async () => {
    const before = await Promise.all(
      [B, C].map((page) =>
        page.locator("nav [data-view].selected").getAttribute("data-view"),
      ),
    );
    await A.getByRole("button", { name: "Pinned", exact: true }).click();
    const after = await Promise.all(
      [B, C].map((page) =>
        page.locator("nav [data-view].selected").getAttribute("data-view"),
      ),
    );
    requireValue(after, before, "Other browsers navigation");
    return { before, after };
  });
  // Return to comparable mixer projections after browser-local navigation.
  await A.getByRole("button", { name: "Mixer", exact: true }).click();
  await scenario(
    "network-disconnect-mid-drag-never-replays-stale-intent",
    async () => {
      const fader = A.getByRole("slider", {
          name: "Lab MIDI volume",
          exact: true,
        }),
        box = await fader.boundingBox();
      await A.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await A.mouse.down();
      await A.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 16);
      try {
        await clients[0].context.setOffline(true);
        await A.locator("#offline.visible").waitFor({ timeout: 12000 });
        await A.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 60);
        await A.mouse.up();
        await call("mixer", {
          track: "Lab MIDI",
          property: "volume",
          value: 0.31,
        });
      } finally {
        await clients[0].context.setOffline(false);
        await A.mouse.up();
      }
      return settle(
        (s) =>
          Math.abs(s.tracks.find((t) => t.name === "Lab MIDI").volume - 0.31) <
          1e-5,
      );
    },
  );
  await scenario("browser-reload-gets-current-state", async () => {
    await C.reload();
    await C.getByRole("slider", {
      name: "Lab MIDI volume",
      exact: true,
    }).waitFor();
    return settle();
  });
  await scenario("browser-disconnect-native-edit-reconnect", async () => {
    await C.goto("about:blank");
    await call("tempo", { value: 128.75 });
    await C.goto(clients[2].url);
    await C.getByRole("slider", {
      name: "Lab MIDI volume",
      exact: true,
    }).waitFor();
    return settle((s) => s.tempo === 128.75);
  });
  await scenario("actual-transport-play-stop", async () => {
    await A.getByRole("button", { name: "Play", exact: true }).click();
    await settle((s) => s.playing);
    await B.getByRole("button", { name: "Stop", exact: true }).click();
    return settle((s) => !s.playing);
  });
  // Structural actions go through rendered controls, independently checked in Live.
  const trackRow = (page, name) =>
    page.locator(".track[data-track]").filter({
      has: page.getByRole("slider", { name: name + " volume", exact: true }),
    });
  const closePanel = async (page) => {
    if (await page.locator("#drawer").isVisible())
      await page
        .getByRole("button", { name: "Close panel", exact: true })
        .click();
  };
  const waitDetail = async (predicate) => {
    const until = Date.now() + 12000;
    let d;
    do {
      d = await call("detail_snapshot");
      if (predicate(d)) return d;
      await delay(150);
    } while (Date.now() < until);
    throw Error("Native structural deadline");
  };
  await scenario("browser-track-create-rename-delete", async () => {
    const before = await call("snapshot"),
      names = before.tracks.map((t) => t.name);
    await A.locator("nav")
      .getByRole("button", { name: "＋ Track", exact: true })
      .click();
    await A.getByRole("button", { name: "＋ MIDI track", exact: true }).click();
    const created = await settle(
        (s) => s.tracks.length === before.tracks.length + 1,
      ),
      name = created.native.tracks.find((t) => !names.includes(t.name)).name;
    await closePanel(A);
    await trackRow(A, name)
      .getByRole("button", { name: "Track controls", exact: true })
      .click();
    await A.locator("input[data-edit=track_name]").fill("Acceptance transient");
    await A.locator("input[data-edit=track_name]").press("Tab");
    await settle((s) =>
      s.tracks.some((t) => t.name === "Acceptance transient"),
    );
    A.once("dialog", (dialog) => dialog.accept());
    await A.getByRole("button", { name: "Delete track", exact: true }).click();
    await closePanel(A);
    return settle(
      (s) =>
        s.tracks.length === before.tracks.length &&
        !s.tracks.some((t) => t.name === "Acceptance transient"),
    );
  });
  await scenario("browser-scene-create-delete", async () => {
    const before = (await call("detail_snapshot")).sceneCount;
    await B.locator("nav")
      .getByRole("button", { name: "＋ Scene", exact: true })
      .click();
    await waitDetail((d) => d.sceneCount === before + 1);
    for (const { page } of clients)
      await page
        .locator("#scenerange")
        .filter({ hasText: "/ " + (before + 1) })
        .waitFor();
    await B.getByRole("button", { name: "↓ Scenes", exact: true }).click();
    await B.locator("#scenerange")
      .filter({
        hasText: before + 1 + "–" + (before + 1) + " / " + (before + 1),
      })
      .waitFor();
    await B.locator(".track.scenes [data-op=scene]").last().click();
    B.once("dialog", (dialog) => dialog.accept());
    await B.locator("[data-op=scene_delete]").click();
    await closePanel(B);
    const result = await waitDetail((d) => d.sceneCount === before);
    for (const { page } of clients)
      await page
        .locator("#scenerange")
        .filter({ hasText: "/ " + before })
        .waitFor();
    return { sceneCount: result.sceneCount };
  });
  for (const page of [A, B, C])
    await page.getByRole("button", { name: "Session", exact: true }).click();
  await scenario("browser-clip-create-rename-double-delete", async () => {
    await trackRow(A, "Lab MIDI")
      .getByRole("button", { name: "Clip options", exact: true })
      .first()
      .click();
    await A.getByRole("button", {
      name: "Create MIDI clip",
      exact: true,
    }).click();
    await waitDetail(
      (d) => d.tracks.find((t) => t.name === "Lab MIDI").clips[0].hasClip,
    );
    await A.locator("input[data-edit=clip_name]").fill("Acceptance MIDI");
    await A.locator("input[data-edit=clip_name]").press("Tab");
    await waitDetail(
      (d) =>
        d.tracks.find((t) => t.name === "Lab MIDI").clips[0].name ===
        "Acceptance MIDI",
    );
    for (const page of [A, B, C])
      await trackRow(page, "Lab MIDI")
        .locator(".clip .name")
        .filter({ hasText: "Acceptance MIDI" })
        .waitFor();
    await A.getByRole("button", { name: "Double loop", exact: true }).click();
    await waitDetail(
      (d) => d.tracks.find((t) => t.name === "Lab MIDI").clips[0].length === 8,
    );
    A.once("dialog", (dialog) => dialog.accept());
    await A.getByRole("button", { name: "Delete clip", exact: true }).click();
    const result = await waitDetail(
      (d) => !d.tracks.find((t) => t.name === "Lab MIDI").clips[0].hasClip,
    );
    await closePanel(A);
    for (const page of [A, B, C])
      await trackRow(page, "Lab MIDI")
        .locator(".clip .name")
        .filter({ hasText: "Acceptance MIDI" })
        .waitFor({ state: "hidden" });
    return { clip: result.tracks.find((t) => t.name === "Lab MIDI").clips[0] };
  });
  for (const device of ["Utility", "Auto Filter"]) {
    const inserted = await call("device_insert", {
      track: "Lab Audio",
      name: device,
    });
    await settle();
    await Promise.all(clients.map((c) => openDevice(c.page, device)));
    const parameter = device === "Utility" ? "Stereo Width" : "Frequency";
    await scenario(
      device + "-native-parameter-to-all-real-panels",
      async () => {
        const p = await parameterRead(
          "Lab Audio",
          inserted.devicePath,
          parameter,
        );
        const value = p.min + (p.max - p.min) * 0.42;
        await call("parameter", {
          track: "Lab Audio",
          devicePath: inserted.devicePath,
          parameter,
          value,
        });
        return {
          parameter,
          native: value,
          browsers: await parameterViews(parameter, value),
        };
      },
    );
    await scenario(
      device + "-real-knob-keyboard-to-native-and-panels",
      async () => {
        const p = await parameterRead(
          "Lab Audio",
          inserted.devicePath,
          parameter,
        );
        await A.getByRole("slider", { name: parameter, exact: true }).press(
          "ArrowUp",
        );
        let result;
        const deadline = Date.now() + 8000;
        do {
          result = await parameterRead(
            "Lab Audio",
            inserted.devicePath,
            parameter,
          );
          if (result.value > p.value) break;
          await delay(100);
        } while (Date.now() < deadline);
        if (result.value <= p.value)
          throw Error("Real knob did not mutate native parameter");
        return {
          parameter,
          native: result.value,
          browsers: await parameterViews(parameter, result.value),
        };
      },
    );
    for (const page of clients.map((c) => c.page))
      await page.locator("#drawer [data-op=close]").click();
  }
  if (networkSettings?.stallMs) {
    await scenario("one-stalled-browser-recovers-without-blocking-others", async () => {
      const before = Number(await A.getByRole("spinbutton", { name: "Tempo", exact: true }).inputValue());
      clients[0].proxy.hold(networkSettings.stallMs);
      await call("tempo", { value: 143.5 });
      await call("tempo", { value: 146.75 });
      for (const page of [B, C]) {
        await page.waitForFunction(() => Number(document.querySelector('#tempo').value) === 146.75, null, { timeout: 2000 });
      }
      const stalled = Number(await A.getByRole("spinbutton", { name: "Tempo", exact: true }).inputValue());
      requireValue(stalled, before, "Stall did not actually hold browser A updates");
      const result = await settle(s => s.tempo === 146.75);
      if (clients[0].proxy.evidence().inbound.maxDelayMs < 2000) throw Error("No measured inbound stall");
      return { ...result, holdMs: networkSettings.stallMs, stalledBrowserValue: stalled };
    });
  }
  if (networkProfile) {
    await scenario("network-layer-measured-delays-in-both-directions", async () => {
      const connections = proxies.map(proxy => proxy.evidence());
      for (const proxy of connections) {
        if (proxy.overflow) throw Error("Proxy queue overflowed");
        for (const direction of ["inbound", "outbound"]) {
          const stats = proxy[direction];
          if (!stats.forwarded || stats.minDelayMs < networkSettings.delayMs - networkSettings.jitterMs - 2) throw Error("Latency layer was not exercised");
        }
      }
      return { connections };
    });
  }
  await clients[0].page.screenshot({
    path: path.join(artifacts, runLabel + "-success.png"),
  });
  report.status = "passed";
} catch (error) {
  report.status = report.cases.length ? "failed" : "blocked";
  report.error = clean(error.message);
  console.error(report.status.toUpperCase() + ": " + report.error);
  process.exitCode = report.status === "blocked" ? 2 : 1;
} finally {
  if (native) {
    if (!native.closed) await call("transport", { property: "playing", value: false }).catch(() => {});
    await native.close();
  }
  await browser?.close();
  for (const proxy of proxies) await proxy.close();
  if (networkProfile) report.network = proxies.map(proxy => proxy.evidence());
  report.finishedAt = new Date().toISOString();
  await save();
  console.log(
    transport +
      ": " +
      report.cases.filter((c) => c.status === "passed").length +
      "/" +
      report.cases.length +
      " actual-browser cases passed",
  );
}
