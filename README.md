# Max for Live devices

This repo contains the source code for **Pocket Live**, with more Max for Live
devices to come. Finished builds go in [`devices/`](devices/); editable Pocket
Live source is in [`Pocket Live/`](Pocket%20Live/).

## Use Pocket Live

Drag [`Pocket Live.amxd`](devices/Pocket%20Live/Pocket%20Live.amxd) onto an audio
track in Ableton Live with Max for Live. Keep the whole
[`devices/Pocket Live/`](devices/Pocket%20Live/) folder together: the device
loads its supporting files from there. No build or deployment is needed.

Choose **Local** to control Live from another browser on the same Wi-Fi, or
**Cloud** to use the included relay over the internet. Scan the QR code or
click **Open Controller**. Anyone with the private link can control the set.

## Host your own Cloud relay

Pocket Live uses a Cloudflare Worker to serve the web controller and a
SQLite-backed Durable Object to relay WebSocket messages. This runs on
[Cloudflare Workers Free within its quotas](https://developers.cloudflare.com/durable-objects/platform/pricing/).

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
