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
        startup_error("Max did not provide the device’s file path.", "Load Pocket Live.amxd from the extracted Pocket Live folder.");
        return;
    }
    outlet(0, patchFile);
}

function bridge_ready() {
    ready = true;
    failed = false;
    watchdog.cancel();
}

function startup_error(cause, nextStep) {
    if (failed) return;
    failed = true;
    label("headline", ready ? "Pocket Live stopped" : "Pocket Live couldn’t start");
    label("status", ready ? "Bridge stopped" : "Startup error");
    ready = false;
    watchdog.cancel();
    label("subtitle", String(cause));
    label("notice", nextStep || "Open Max Window for the full error.");
    label("count", "");
    label("url", "");
    const qr = this.patcher.getnamed("qr");
    if (qr) qr.message("qr", "");
}

const watchdog = new Task(() => {
    if (!ready) startup_error("Node for Max did not respond within 8 seconds.");
}, this);
