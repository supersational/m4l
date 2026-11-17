# Pocket Live source

See the [repo README](../README.md) to install the finished device or host your
own Cloud relay.

| Path | What it contains |
| --- | --- |
| `build.py`, `panel*.js` | Native Max for Live patch and device panel |
| `live.js` | Reads and writes the Live Set through LiveAPI |
| `maxnode/` | Node for Max bridge, LAN server, relay client, waveform worker |
| `web/` | Browser UI, gestures, and device views |
| `worker.js`, `wrangler.toml` | Cloudflare relay and deployment configuration |
| `tools/`, `tests/` | Build tools and verification |

## Build and test

Run from this folder with Node.js, npm, and Python 3:

```sh
npm ci
npm run package
npm run test:offline
```

The build produces `dist/Pocket Live/`. It bundles browser assets and Node
dependencies; the native AMXD uses relative paths to its support files. To
refresh the repo’s finished device after validating a build:

```sh
npm run package -- --output "../devices/Pocket Live"
```

Build a self-hosted variant with `--worker-url`. This changes only the generated
package's public relay URL. Use a fresh output path if the destination contains
runtime files from a running device.

- [Architecture and runtime flow](docs/ARCHITECTURE.md)
- [Device views and gesture rules](docs/DEVICE-VIEWS.md)
- [Real Live acceptance and test prerequisites](tests/README.md)
