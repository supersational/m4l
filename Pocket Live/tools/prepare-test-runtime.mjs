// QA supporting files only. Never publishes a device or writes final releases.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const root = fileURLToPath(new URL("../", import.meta.url));
const transport = process.argv[2];
if (!["cloud", "local"].includes(transport)) throw Error("Use cloud or local");
const runtime = path.join(root, "tests/artifacts/runtime", transport);
await fs.mkdir(path.join(runtime, "maxnode"), { recursive: true });
await fs.mkdir(path.join(runtime, "web-dist"), { recursive: true });
for (const name of ["live.js", "panel.js", "panel-controls.js"])
  await fs.copyFile(path.join(root, name), path.join(runtime, name));
for (const name of ["index.html", "app.js", "style.css", "manifest.json"])
  await fs.copyFile(
    path.join(root, "web-dist", name),
    path.join(runtime, "web-dist", name),
  );
const config = JSON.parse(
  await fs.readFile(path.join(root, "config.json"), "utf8"),
);
config.mode = transport;
await fs.writeFile(path.join(runtime, "config.json"), JSON.stringify(config));
await fs.writeFile(
  path.join(runtime, "maxnode/package.json"),
  '{"type":"commonjs"}\n',
);
await fs.copyFile(
  path.join(root, "maxnode/waveform-worker.cjs"),
  path.join(runtime, "maxnode/waveform-worker.cjs"),
);
await build({
  entryPoints: [path.join(root, "maxnode/bridge.js")],
  bundle: true,
  minify: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  external: ["max-api", "../config.json"],
  outfile: path.join(runtime, "maxnode/bridge.js"),
});
await fs.rm(path.join(runtime, "session.json"), { force: true });
console.log(runtime);
