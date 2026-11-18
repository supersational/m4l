// This runs inside Max, independently of the Node bridge and its support files.
let started = false;
let ready = false;
let failed = false;

function label(name, text) {
    const target = this.patcher.getnamed(name);
    if (target) target.message("set", text);
}

function initialize() {
    let version = "unavailable";
    try {
        const app = new LiveAPI(null, "live_app");
        const reported = String(app.call("get_version_string"));
        if (/^\d+\.\d+/.test(reported)) version = reported;
    } catch (error) {
        post("Pocket Live: unable to read the Live version.\n");
    }
    label("live_version", "Live " + version);
    if (started) return;
    started = true;
    watchdog.schedule(8000);
    const patchFile = this.patcher.filepath;
    if (!patchFile) {
        startup_error("Load Pocket Live.amxd from the extracted Pocket Live folder.");
        return;
    }
    outlet(0, patchFile);
}

function bridge_ready() {
    ready = true;
    failed = false;
    watchdog.cancel();
}

function startup_error(...parts) {
    if (failed) return;
    failed = true;
    ready = false;
    watchdog.cancel();
    label("status", "Bridge failed to start");
    label("notice", parts.join(" "));
    label("count", "");
}

const watchdog = new Task(() => {
    if (!ready) startup_error("No response from Node for Max. Open Max Window for details.");
}, this);
