# Pocket Live

Pocket Live is a **Max for Live device** that lets you control your Ableton Live
Set from a phone, tablet, or computer. Launch clips, mix tracks, and tweak
devices from a browser on the same Wi-Fi or over the internet.

**[Get the latest Pocket Live release](https://github.com/supersational/m4l/releases/latest)** · [Download the v0.1.0 device ZIP](https://github.com/supersational/m4l/releases/download/v0.1.0/Pocket-Live-v0.1.0.zip)

## Install and connect

1. **Extract the device ZIP** and keep the whole `Pocket Live` folder together.
2. **Drag `Pocket Live.amxd`** from that folder onto an audio track in Ableton
   Live with Max for Live.
3. **Open the controller.** Choose **Local** for the same Wi-Fi or **Cloud**
   for internet access through the included relay. Scan the QR code or click
   **Open Controller**.

Share the controller link only with people you want to control the Set.

## Source and builds

This repo contains Pocket Live and will host more Max for Live devices.
Finished builds go in [`devices/`](devices/). Editable Pocket Live source
is in [`Pocket Live/`](Pocket%20Live/).

## Host your own Cloud relay

Pocket Live uses a Cloudflare Worker to serve the web controller and a
SQLite-backed Durable Object to relay WebSocket messages. This runs on
[Cloudflare Workers Free within its quotas](https://developers.cloudflare.com/durable-objects/platform/pricing/).
The included config throttles new sessions and new WebSocket connections per IP.
These limits reduce abuse; they do not cap total account usage.

With Node.js, npm, Python 3 and a Cloudflare account, run from the repo root:

```sh
cd "Pocket Live"
npm ci
npm run build:web
npx wrangler@4 login
npx wrangler@4 deploy
```

Wrangler reads the included [`wrangler.toml`](Pocket%20Live/wrangler.toml). If a
Worker with that name already exists in your account, choose a fresh `name` in the
config first. Use the HTTPS URL printed by Wrangler to build a device pointed at
your relay:

```sh
npm run package -- --worker-url "https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev"
```

Drag the new `dist/Pocket Live/Pocket Live.amxd` into Live, keeping its support
files next to it. Choose **Cloud** and open the new controller link.

See the [source guide](Pocket%20Live/README.md) for builds, tests, and the code map.
