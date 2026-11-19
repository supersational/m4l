"""Build the web controller and stage a portable Pocket Live device package."""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlsplit

SOURCE = Path(__file__).resolve().parents[1]
ESBUILD = SOURCE / "node_modules/.bin/esbuild"
WEB = SOURCE / "web"
WEB_DIST = SOURCE / "web-dist"
WEB_ASSETS = ("index.html", "app.js", "style.css")
WEB_FILES = (*WEB_ASSETS, "manifest.json")
NATIVE_SOURCES = ("live.js", "panel.js", "panel-controls.js", "maxnode/waveform-worker.cjs")
RELEASE_FILES = {
    *NATIVE_SOURCES,
    *(f"web-dist/{name}" for name in WEB_FILES),
    "Pocket Live.amxd", "README.md", "config.json",
    "maxnode/package.json", "maxnode/bridge.js",
}
SCRIPT = re.compile(r'<script src="/([^"<>]+)"></script>')
INSTALL_README = """# Pocket Live

Keep this whole folder together. Drag `Pocket Live.amxd` onto an audio track
in Ableton Live with Max for Live. Pick **Local** for the same Wi-Fi or
**Cloud** to connect over the internet, then open the controller or scan the QR.

Only share the controller link with people you want to control your Live Set.
"""


def write_manifest(directory, name, files):
    contents = {file: hashlib.sha256((directory / file).read_bytes()).hexdigest()
                for file in sorted(files)}
    (directory / name).write_text(json.dumps(contents, indent=2) + "\n")


def esbuild(*args):
    subprocess.run([str(ESBUILD), *map(str, args)], check=True)


def build_web():
    """Bundle the browser assets shared by the Worker and the local device."""
    WEB_DIST.mkdir(exist_ok=True)
    for renderer, symbol in (("echo", "EchoRenderer"), ("eq8", "EQ8Renderer"),
                             ("operator", "OperatorRenderer")):
        esbuild(WEB / f"device-renderers/{renderer}/index.js", "--bundle",
                "--format=iife", f"--global-name={symbol}", "--target=es2020",
                f"--outfile={WEB / (renderer + '-renderer.js')}")
    html = (WEB / "index.html").read_text()
    with tempfile.TemporaryDirectory(prefix="pocket-live-web-") as tmp:
        entry = Path(tmp) / "controller.mjs"
        entry.write_text("\n;\n".join((WEB / name).read_text()
                                     for name in SCRIPT.findall(html)))
        esbuild(entry, "--minify", "--target=es2020", "--format=iife",
                "--define:module=undefined", f"--outfile={WEB_DIST / 'app.js'}")
    esbuild(WEB / "style.css", "--minify", f"--outfile={WEB_DIST / 'style.css'}")
    html = SCRIPT.sub("", html).replace("</body>", '<script src="/app.js"></script></body>')
    (WEB_DIST / "index.html").write_text(re.sub(r'>\s+<', '><', html).strip())
    write_manifest(WEB_DIST, "manifest.json", WEB_ASSETS)
    subprocess.run(["node", str(SOURCE / "tools/check_browser_bundle.cjs"),
                    str(WEB_DIST)], check=True)
    print("Built web controller:", WEB_DIST)


def worker_origin(value):
    """Store only an HTTPS origin; the device appends its own API paths."""
    try:
        url = urlsplit(value)
        if (url.scheme == "https" and url.hostname and url.username is None
                and url.password is None and not any(ch.isspace() for ch in value)
                and url.path in ("", "/") and "?" not in value and "#" not in value):
            _ = url.port  # Validate an explicitly supplied port.
            return f"https://{url.netloc}"
    except ValueError:
        pass
    raise argparse.ArgumentTypeError("expected an HTTPS origin, e.g. https://relay.example.com")


def check_output(output):
    allowed = RELEASE_FILES | {"release-manifest.json"}
    directories = {Path(file).parent for file in allowed} - {Path(".")}
    if output.is_symlink() or (output.exists() and not output.is_dir()):
        raise SystemExit("Choose a real directory for --output.")
    for path in output.rglob("*"):
        relative = path.relative_to(output)
        if path.is_symlink() or (
            not (path.is_dir() and relative in directories)
            and not (path.is_file() and (relative.as_posix() in allowed
                                         or path.name == ".DS_Store"))
        ):
            raise SystemExit("Output contains files outside the release package. "
                             "Use a fresh --output directory.")


def stage_release(stage, worker):
    """Assemble exactly the runtime files; never copy the working tree."""
    (stage / "maxnode").mkdir()
    (stage / "web-dist").mkdir()
    for name in NATIVE_SOURCES:
        shutil.copyfile(SOURCE / name, stage / name)
    for name in WEB_FILES:
        shutil.copyfile(WEB_DIST / name, stage / "web-dist" / name)
    config = json.loads((SOURCE / "config.json").read_text())
    if worker:
        config["worker"] = worker
    (stage / "config.json").write_text(json.dumps(config, indent=2) + "\n")
    (stage / "README.md").write_text(INSTALL_README)
    (stage / "maxnode/package.json").write_text('{"type":"commonjs"}\n')
    esbuild(SOURCE / "maxnode/bridge.js", "--bundle", "--minify", "--platform=node",
            "--target=node18", "--format=cjs", "--external:max-api",
            "--external:../config.json", f"--outfile={stage / 'maxnode/bridge.js'}")
    subprocess.run([sys.executable, str(SOURCE / "build.py"), "--portable", "--output",
                    str(stage / "Pocket Live.amxd")], check=True)
    write_manifest(stage, "release-manifest.json", RELEASE_FILES)


def package_release(output, worker):
    with tempfile.TemporaryDirectory(prefix="pocket-live-release-") as tmp:
        stage = Path(tmp)
        stage_release(stage, worker)
        check_output(output)
        for name in sorted(RELEASE_FILES | {"release-manifest.json"}):
            target = output / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(stage / name, target)
    print("Packaged device:", output)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--web-only", action="store_true", help="Build web-dist for Cloudflare")
    parser.add_argument("--output", type=Path, default=SOURCE / "dist/Pocket Live")
    parser.add_argument("--worker-url", type=worker_origin, help="Point this device package at your Cloud relay")
    args = parser.parse_args()
    if args.web_only and args.worker_url:
        parser.error("--worker-url configures a device package, not web-dist")
    if not ESBUILD.is_file():
        parser.exit(1, "Run npm ci in the Pocket Live source folder first.\n")
    output = args.output.absolute()
    if not args.web_only:
        check_output(output)
    build_web()
    if not args.web_only:
        package_release(output, args.worker_url)


if __name__ == "__main__":
    main()
