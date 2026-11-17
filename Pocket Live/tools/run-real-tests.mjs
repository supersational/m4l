// One unattended command: build QA, load real M4L, discover link, drive real Chrome.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { NETWORK_PROFILES } from "../tests/harness/network-proxy.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2),
  reset = args.includes("--prepare"),
  probes = args.includes("--probes");
const network = args.find(a => a.startsWith("--network="))?.slice(10) || null;
const chosen =
  args.find((a) => a.startsWith("--transport="))?.split("=")[1] || "both";
if (
  args.some(
    (a) =>
      a !== "--prepare" &&
      a !== "--probes" &&
      !/^--transport=(local|cloud|both)$/.test(a) &&
      !/^--network=(all|50ms|150ms|500ms|jitter|stall)$/.test(a),
  ) ||
  !["local", "cloud", "both"].includes(chosen) || (network && probes)
)
  throw Error(
    "Use --prepare, --transport=local|cloud|both, --network=all|50ms|150ms|500ms|jitter|stall (network and probes cannot be combined)",
  );
const python = process.env.POCKET_LIVE_PYTHON || "python3";
const reportPath = path.join(
  root,
  network ? "tests/artifacts/acceptance-network-run.json" : probes
    ? "tests/artifacts/acceptance-probes-run.json"
    : "tests/artifacts/acceptance-run.json",
);
const summary = {
  schema: 1,
  kind: probes ? "real-live-gap-probes" : "unattended-real-live",
  startedAt: new Date().toISOString(),
  status: "running",
  transport: chosen,
  network,
  resetFixture: reset,
  transports: [],
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const writeSummary = () =>
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2) + "\n", {
    mode: 0o600,
  });
writeSummary();
process.on("exit", (code) => {
  summary.status = code === 0 ? "passed" : code === 2 ? "blocked" : "failed";
  summary.finishedAt = new Date().toISOString();
  try {
    writeSummary();
  } catch {}
});

function run(
  command,
  argv,
  timeout = 240000,
  capture = false,
  allowFailure = false,
) {
  const result = spawnSync(command, argv, {
    cwd: root,
    stdio: capture ? "pipe" : "inherit",
    encoding: "utf8",
    timeout,
  });
  if (result.error) throw Error("Runner process failed: " + result.error.code);
  if (result.status !== 0) {
    if (capture) console.error(result.stdout || "Live preparation failed");
    if (!allowFailure) process.exit(result.status || 1);
    process.exitCode = process.exitCode === 1 ? 1 : result.status === 2 ? 2 : 1;
  }
  return result.stdout;
}
// Verify the injector with actual socket I/O before relying on its evidence.
if (network) {
  run(process.execPath, [path.join(root, "tests/integration/transport/network-proxy.cjs")], 30000);
  summary.proxySelfCheck = "passed";
  writeSummary();
}
// Never silently replace real acceptance with a simulated pass.
const preflight = spawnSync(
  python,
  [path.join(root, "tests/harness/prepare-live.py")],
  { cwd: root, encoding: "utf8", timeout: 15000 },
);
let inspected;
try {
  inspected = JSON.parse(preflight.stdout);
} catch {}
if (!inspected?.ok) {
  console.error(
    "BLOCKED: Live/AbletonKernel is unavailable. Configure it and rerun; mocks were not substituted.",
  );
  process.exit(2);
}
const ordinary = inspected.state.tracks
  .filter((t) => t.kind === "track")
  .map((t) => t.name);
if (
  !reset &&
  (ordinary.length !== 2 ||
    !ordinary.includes("Lab MIDI") ||
    !ordinary.includes("Lab Audio"))
) {
  console.error(
    "BLOCKED: Open a disposable lab fixture, or use --prepare to replace the current unsaved set. Nothing was saved or changed.",
  );
  process.exit(2);
}
run(python, [path.join(root, "tools/package_release.py"), "--web-only"]);
for (const transport of chosen === "both" ? ["local", "cloud"] : [chosen]) {
  run(process.execPath, [
    path.join(root, "tools/prepare-test-runtime.mjs"),
    transport,
  ]);
  const runtime = path.join(root, "tests/artifacts/runtime", transport);
  const options = [
    path.join(root, "tests/harness/prepare-live.py"),
    "--allow-live-edits",
    "--transport",
    transport,
    "--runtime-root",
    runtime,
  ];
  if (reset) options.push("--reset");
  run(python, options, 240000, true);
  const deadline = Date.now() + 20000;
  let found = false;
  while (Date.now() < deadline) {
    try {
      const session = JSON.parse(
        fs.readFileSync(path.join(runtime, "session.json"), "utf8"),
      );
      if (session.url && (!session.expires || session.expires > Date.now())) {
        found = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!found) {
    console.error(
      "BLOCKED: Running device did not publish a fresh " +
        transport +
        " session.",
    );
    process.exit(2);
  }
  const suites = network
    ? (network === "all" ? Object.keys(NETWORK_PROFILES) : [network]).map(profile => ({ suite: "real-browsers", profile }))
    : (probes ? ["sync-gap-probes"] : ["real-browsers", "sync-gap-probes"]).map(suite => ({ suite, profile: null }));
  for (const {suite, profile} of suites) {
    run(
      process.execPath,
      [path.join(root, "tests/harness/" + suite + ".mjs"), transport, ...(profile ? [profile] : [])],
      300000,
      false,
      true,
    );
    const reportName = suite + "-" + transport + (profile ? "-" + profile : "") + ".json";
    const evidence = JSON.parse(
      fs.readFileSync(path.join(root, "tests/artifacts", reportName), "utf8"),
    );
    summary.transports.push({
      transport,
      suite,
      profile,
      status: evidence.status,
      cases: evidence.cases.length,
      passed: evidence.cases.filter((c) => c.status === "passed").length,
      failed: evidence.cases.filter((c) => c.status !== "passed").length,
      report: reportName,
    });
    writeSummary();
  }
}
