import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "tests/suites.json"), "utf8"),
);
const registered = Object.values(manifest).flat();
const discover = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? discover(path.join(dir, entry.name))
        : /\.(cjs|py)$/.test(entry.name)
          ? [
              path.relative(
                path.join(root, "tests"),
                path.join(dir, entry.name),
              ),
            ]
          : [],
    );
const discovered = ["unit", "integration"].flatMap((group) =>
  discover(path.join(root, "tests", group)),
);
if (
  new Set(registered).size !== registered.length ||
  registered.length !== discovered.length ||
  discovered.some((file) => !registered.includes(file))
)
  throw Error(
    "Offline suite index must list every unit/integration script exactly once",
  );
const choice = process.argv[2] || "offline";
if (
  !["offline", "unit", "integration", "regressions", "--list"].includes(choice)
)
  throw Error("Use offline, unit, integration, regressions or --list");
const groups =
  choice === "unit" || choice === "integration"
    ? [choice]
    : Object.keys(manifest);
const regressionIndex = JSON.parse(
  fs.readFileSync(path.join(root, "tests/regressions.json"), "utf8"),
);
const files =
  choice === "regressions"
    ? Object.keys(regressionIndex)
    : groups.flatMap((group) => manifest[group]);
if (files.some((file) => !registered.includes(file)))
  throw Error("Unregistered regression file");
if (choice === "--list") {
  for (const file of files) console.log(file);
  process.exit(0);
}
const started = Date.now(),
  results = [];
let failed = 0;
for (const file of files) {
  console.log("\n[" + file + "]");
  const caseStart = Date.now();
  const result = spawnSync(
    file.endsWith(".py") ? "python3" : process.execPath,
    [path.join(root, "tests", file)],
    { cwd: root, stdio: "inherit", timeout: 30000 },
  );
  const status = result.error || result.status !== 0 ? "failed" : "passed";
  results.push({
    id: file,
    kind: file.split("/")[0],
    status,
    durationMs: Date.now() - caseStart,
    exitCode: result.status,
    error: result.error?.code || null,
  });
  if (status === "failed") {
    failed++;
    console.error(
      "FAIL " + file + (result.error ? " — " + result.error.message : ""),
    );
  }
}
const artifacts = path.join(root, "tests/artifacts");
fs.mkdirSync(artifacts, { recursive: true });
fs.writeFileSync(
  path.join(artifacts, "offline.json"),
  JSON.stringify(
    {
      schema: 1,
      startedAt: new Date(started).toISOString(),
      status: failed ? "failed" : "passed",
      durationMs: Date.now() - started,
      selection: choice,
      cases: results,
      notRun: [
        "real-browser",
        "physical-mobile",
        "native-live-acceptance",
        "deployed-cloud-acceptance",
      ],
    },
    null,
    2,
  ) + "\n",
  { mode: 0o600 },
);
console.log(
  `\n${files.length - failed}/${files.length} offline scripts passed. Live/browser hardware acceptance was not run.`,
);
process.exitCode = failed ? 1 : 0;
