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
        "maxnode/waveform-worker.cjs",
        "live.js",
        "panel-controls.js",
        "panel.js",
        "web-dist/index.html",
        "web-dist/app.js",
        "web-dist/style.css"
    ];
    let missingFile;
    for (const patch of paths) {
        const root = path.dirname(patch);
        const missing = supportFiles.find(file => !fs.existsSync(path.join(root, file)));
        if (missing) {
            missingFile ||= missing;
            continue;
        }
        try {
            require(path.join(root, "maxnode", "bridge.js"));
        } catch (error) {
            max.post("Pocket Live bridge initialization: " + (error.stack || error), max.POST_LEVELS.ERROR);
            max.outlet("startup_error", bridgeError(error));
        }
        return;
    }
    const cause = missingFile ? "Missing support file: " + missingFile + "." : "Max did not provide a usable device path.";
    max.post("Pocket Live: " + cause, max.POST_LEVELS.ERROR);
    max.outlet("startup_error", cause, "Extract the full ZIP and keep the Pocket Live folder together.");
}

function bridgeError(error) {
    if (error.code === "MODULE_NOT_FOUND") return "Node could not load a bridge dependency.";
    if (error.code === "EACCES" || error.code === "EPERM") return "Node was denied access to a support file.";
    if (error.code === "ENOENT") return "A file disappeared while Node was loading the bridge.";
    if (error instanceof SyntaxError && error.message.includes("config.json")) return "config.json contains invalid JSON.";
    const code = typeof error.code === "string" && /^[A-Z0-9_]{1,32}$/.test(error.code) ? error.code : error.name;
    return "The bridge threw an error during initialization (" + (code || "unknown error") + ").";
}

startBridge(String(process.argv[2] || ""));
