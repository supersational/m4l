// Load the bridge relative to the actual AMXD, without Max's script search path.
const fs = require("node:fs");
const path = require("node:path");
const max = require("max-api");

function devicePathCandidates(filename) {
    if (process.platform !== "darwin") return path.isAbsolute(filename) ? [filename] : [];
    const volumePath = /^([^/:]+):(\/.*)$/.exec(filename);
    if (!volumePath) return path.isAbsolute(filename) ? [filename] : [];
    const [, volume, relative] = volumePath;
    return [path.join("/Volumes", volume, relative), relative].filter(candidate => fs.existsSync(candidate));
}

function startBridge(filename) {
    const paths = devicePathCandidates(filename);
    const supportFiles = [
        "maxnode/bridge.js",
        "config.json",
        "live.js",
        "panel-controls.js",
        "panel.js",
        "web-dist/index.html"
    ];
    for (const patch of paths) {
        const root = path.dirname(patch);
        if (supportFiles.some(file => !fs.existsSync(path.join(root, file)))) continue;
        try {
            require(path.join(root, "maxnode", "bridge.js"));
        } catch (error) {
            max.post("Pocket Live bridge initialization: " + (error.stack || error), max.POST_LEVELS.ERROR);
            max.outlet("startup_error", "Bridge initialization error. Open Max Window for details.");
        }
        return;
    }
    const message = paths.length
        ? "Support files missing. Keep the whole extracted Pocket Live folder together."
        : "Device path unavailable. Load Pocket Live.amxd from the extracted Pocket Live folder.";
    max.post("Pocket Live: " + message, max.POST_LEVELS.ERROR);
    max.outlet("startup_error", message);
}

startBridge(String(process.argv[2] || ""));
