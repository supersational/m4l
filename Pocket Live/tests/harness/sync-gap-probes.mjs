/** Unattended real browser/Live probes for previously uncovered UI states.
 * Findings are reported separately from the main acceptance baseline.
 */
import { chromium } from "playwright";
import { NativeClient } from "./native-client.mjs";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const transport = process.argv[2] || "cloud";
if (!["local", "cloud"].includes(transport)) throw Error("Use local or cloud");
const report = {
  schema: 1,
  kind: "real-live-sync-gap-probes",
  transport,
  startedAt: new Date().toISOString(),
  cases: [],
};
const native = new NativeClient({ edits: true }),
  pages = [];
let browser;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function poll(read, predicate, timeout = 3500) {
  const end = Date.now() + timeout;
  let result;
  do {
    result = await read();
    if (predicate(result)) return result;
    await delay(100);
  } while (Date.now() < end);
  return result;
}
async function probe(id, run) {
  try {
    const evidence = await run();
    report.cases.push({
      id,
      status: evidence.reproduced ? "confirmed-bug" : "passed",
      ...evidence,
    });
    console.log(id + ": " + (evidence.reproduced ? "CONFIRMED BUG" : "passed"));
  } catch (error) {
    report.cases.push({
      id,
      status: "error",
      error: String(error.message)
        .replace(/https?:\/\/[^\s]+/g, "[private URL]")
        .slice(0, 1500),
    });
    console.log(id + ": probe error");
  }
}
try {
  const session = JSON.parse(
    await fs.readFile(
      root + "tests/artifacts/runtime/" + transport + "/session.json",
      "utf8",
    ),
  );
  const initial = await native.call("snapshot");
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (let i = 0; i < 3; i++) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    await page.goto(session.url);
    await page
      .getByRole("slider", { name: "Lab MIDI volume", exact: true })
      .waitFor();
    pages.push(page);
  }
  const [A, B, C] = pages;
  await probe("focused-idle-tempo-misses-native-update", async () => {
    const target = initial.tempo < 990 ? initial.tempo + 3 : initial.tempo - 3;
    await A.getByRole("spinbutton", { name: "Tempo", exact: true }).click();
    await native.call("tempo", { value: target });
    const values = await poll(
      () =>
        Promise.all(
          pages.map((p) =>
            p
              .getByRole("spinbutton", { name: "Tempo", exact: true })
              .inputValue(),
          ),
        ),
      (v) => v.every((x) => Math.abs(Number(x) - target) < 1e-5),
    );
    const actual = (await native.call("snapshot")).tempo;
    await A.screenshot({
      path: root + "tests/artifacts/" + transport + "-focused-tempo.png",
    });
    await A.getByRole("button", { name: "Mixer", exact: true }).click();
    return {
      reproduced:
        actual !== target ||
        values.some((v) => Math.abs(Number(v) - target) > 1e-5),
      native: actual,
      browsers: values.map(Number),
      action: "Focus tempo without editing; change native tempo",
    };
  });
  await probe("focused-pinned-pan-misses-native-update", async () => {
    await A.getByRole("button", { name: "Pin Lab MIDI", exact: true }).click();
    await A.getByRole("button", { name: /^Pinned/ }).click();
    const input = A.locator(".pinned-track-param input[type=range]").nth(1);
    await input.focus();
    const before = Number(await input.inputValue()),
      target = before === -0.27 ? 0.19 : -0.27;
    await native.call("mixer", {
      track: "Lab MIDI",
      property: "pan",
      value: target,
    });
    const value = await poll(
      () => input.inputValue(),
      (v) => Math.abs(Number(v) - target) < 1e-5,
    );
    const others = await Promise.all(
      [B, C].map((p) =>
        p
          .getByRole("slider", { name: "Lab MIDI pan", exact: true })
          .inputValue(),
      ),
    );
    const actual = (await native.call("snapshot")).tracks.find(
      (t) => t.name === "Lab MIDI",
    ).pan;
    await A.screenshot({
      path: root + "tests/artifacts/" + transport + "-focused-pinned-pan.png",
    });
    await A.getByRole("button", { name: "Mixer", exact: true }).click();
    return {
      reproduced:
        Math.abs(actual - target) > 1e-5 ||
        others.some((v) => Math.abs(Number(v) - target) > 1e-5) ||
        Math.abs(Number(value) - target) > 1e-5,
      native: actual,
      pinnedBrowser: Number(value),
      otherBrowsers: others.map(Number),
      action: "Keyboard-focus pinned pan; change native pan",
    };
  });
  await probe(
    "unfinished-tempo-edit-survives-native-update-and-escape",
    async () => {
      const field = A.getByRole("spinbutton", { name: "Tempo", exact: true });
      await field.click();
      await field.press("ControlOrMeta+A");
      await field.pressSequentially("146.2");
      await native.call("tempo", { value: 139.5 });

      await poll(
        () =>
          B.getByRole("spinbutton", {
            name: "Tempo",
            exact: true,
          }).inputValue(),
        (v) => Number(v) === 139.5,
      );
      const draft = await field.inputValue();
      await field.press("Escape");
      const cancelled = await poll(
        () =>
          Promise.all(
            pages.map((p) =>
              p
                .getByRole("spinbutton", { name: "Tempo", exact: true })
                .inputValue(),
            ),
          ),
        (v) => v.every((x) => Number(x) === 139.5),
      );
      const actual = (await native.call("snapshot")).tempo;
      return {
        reproduced:
          draft !== "146.2" ||
          actual !== 139.5 ||
          cancelled.some((v) => Number(v) !== 139.5),
        draft,
        native: actual,
        browsers: cancelled.map(Number),
      };
    },
  );
  await probe(
    "scene-pagination-unexpectedly-changes-other-browsers",
    async () => {
      const before = (await native.call("detail_snapshot")).sceneCount;
      if (before !== 8)
        throw Error(
          "Pagination probe requires the eight-scene disposable fixture",
        );
      try {
        await A.locator("nav")
          .getByRole("button", { name: "＋ Scene", exact: true })
          .click();
        await poll(
          () => native.call("detail_snapshot"),
          (d) => d.sceneCount === 9,
        );
        await A.locator("#scenerange").filter({ hasText: "1–8 / 9" }).waitFor();
        const untouchedBefore = await A.locator("#scenerange").innerText();
        await B.getByRole("button", { name: "↓ Scenes", exact: true }).click();
        await B.locator("#scenerange").filter({ hasText: "9–9 / 9" }).waitFor();
        await delay(2200);
        const ranges = await Promise.all(
          pages.map((p) => p.locator("#scenerange").innerText()),
        );
        const midi = B.locator(".track[data-track]").filter({
          has: B.getByRole("slider", { name: "Lab MIDI volume", exact: true }),
        });
        await midi
          .getByRole("button", { name: "Clip options", exact: true })
          .first()
          .click();
        await B.getByRole("button", {
          name: "Create MIDI clip",
          exact: true,
        }).click();
        await B.locator("input[data-edit=clip_name]").waitFor();
        await delay(2200);
        await B.locator("input[data-edit=clip_name]").fill("Page 2 regression");
        await B.locator("input[data-edit=clip_name]").press("Tab");
        const clipState = await poll(
          () => native.call("detail_snapshot"),
          (d) =>
            d.tracks.find((t) => t.name === "Lab MIDI").clips[8].name ===
            "Page 2 regression",
        );
        const offPageClip = clipState.tracks.find((t) => t.name === "Lab MIDI")
          .clips[8];
        if (offPageClip.name !== "Page 2 regression")
          throw Error("Off-page clip rename failed after shared refresh");
        B.once("dialog", (d) => d.accept());
        await B.getByRole("button", {
          name: "Delete clip",
          exact: true,
        }).click();
        await poll(
          () => native.call("detail_snapshot"),
          (d) => !d.tracks.find((t) => t.name === "Lab MIDI").clips[8].hasClip,
        );
        await B.getByRole("button", {
          name: "Close panel",
          exact: true,
        }).click();
        return {
          reproduced:
            ranges[0] !== untouchedBefore ||
            ranges[2] !== untouchedBefore ||
            ranges[1] !== "9–9 / 9",
          untouchedBefore,
          browsers: ranges,
          offPageClip,
          action: "Only browser B navigates to scene page two",
        };
      } finally {
        if ((await native.call("detail_snapshot")).sceneCount === 9) {
          await B.locator("#scenerange")
            .filter({ hasText: "9–9 / 9" })
            .waitFor();
          await B.locator(".track.scenes [data-op=scene]").first().click();
          B.once("dialog", (d) => d.accept());
          await B.locator("[data-op=scene_delete]").click();
          await poll(
            () => native.call("detail_snapshot"),
            (d) => d.sceneCount === 8,
          );
        }
      }
    },
  );
  await probe("repeated-reconnect-receives-current-native-state", async () => {
    const rounds = [], errors = [];
    const onError = error => errors.push(error.message);
    A.on("pageerror", onError);
    try {
      for (let round = 0; round < 3; round++) {
        await A.context().setOffline(true);
        await A.locator("#offline.visible").waitFor();
        const target = 131 + round;
        await native.call("tempo", { value: target });
        await A.context().setOffline(false);
        await A.locator("#connection.online").waitFor({ timeout: 20000 });
        const values = await poll(
          () => Promise.all(pages.map(p => p.getByRole("spinbutton", { name: "Tempo", exact: true }).inputValue())),
          v => v.every(x => Math.abs(Number(x) - target) < 1e-5),
          10000,
        );
        // Include delayed callbacks/ACKs, not just the first matching frame.
        await delay(1000);
        const actual = (await native.call("snapshot")).tempo;
        const settled = await Promise.all(pages.map(p => p.getByRole("spinbutton", { name: "Tempo", exact: true }).inputValue()));
        rounds.push({ target, native: actual, browsers: values.map(Number), settled: settled.map(Number) });
      }
      return {
        reproduced: errors.length > 0 || rounds.some(r => r.native !== r.target || [...r.browsers, ...r.settled].some(v => Math.abs(v - r.target) > 1e-5)),
        rounds, errors,
        action: "Disconnect A three times; edit actual Live while offline; all three browsers must settle on current Live state",
      };
    } finally {
      A.off("pageerror", onError);
      await A.context().setOffline(false);
    }
  });
  report.status = report.cases.some((c) => c.status !== "passed")
    ? "findings"
    : "passed";
} catch (error) {
  report.status = "blocked";
  report.error = String(error.message)
    .replace(/https?:\/\/[^\s]+/g, "[private URL]")
    .slice(0, 1000);
} finally {
  await browser?.close();
  await native.close();
  report.finishedAt = new Date().toISOString();
  const output =
    root + "tests/artifacts/sync-gap-probes-" + transport + ".json";
  await fs.writeFile(output, JSON.stringify(report, null, 2) + "\n", {
    mode: 0o600,
  });
  console.log(output);
  process.exitCode =
    report.status === "passed" ? 0 : report.status === "blocked" ? 2 : 1;
}
