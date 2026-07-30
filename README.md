> [!NOTE]
> This code relates to version 1.x of QRL, the world's first open-source PQ blockchain, which has been securing digital assets since December 2016.
> The next generation of QRL, version 2.0, is in development and has its own repositories. See [this discussion page](https://github.com/orgs/theQRL/discussions/2).

[![Release Build](https://github.com/theQRL/qrl-wallet/actions/workflows/release-build.yml/badge.svg)](https://github.com/theQRL/qrl-wallet/actions/workflows/release-build.yml)
[![Codacy Badge](https://api.codacy.com/project/badge/Grade/a91585507ea24454a43190dfb48d8c09)](https://www.codacy.com/app/qrl/qrl-wallet?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=theQRL/qrl-wallet&amp;utm_campaign=Badge_Grade)
[![MIT licensed](https://img.shields.io/badge/license-MIT-blue.svg)](https://raw.githubusercontent.com/theQRL/qrl-wallet/main/LICENSE)

# qrl-wallet | wallet.theqrl.org

This is the QRL wallet application developed by The QRL team, and hosted on wallet.theqrl.org

It provides both web and desktop interfaces using [Meteor](https://www.meteor.com/), [Tailwind CSS](https://tailwindcss.com/), [daisyUI](https://daisyui.com/), [NodeJS](https://nodejs.org/en/) and [Electron](https://electronjs.org/).

All secure XMSS operations are run in a web assembly compiled version of [qrllib](https://github.com/theQRL/qrllib) locally in your browser or desktop application. Keys stay in the memory space of the XMSS object, which is destroyed the moment you close the wallet, browser window or desktop application.


## Development Dependencies

The following dependencies are required for a functional local development environment.

[NodeJS](https://nodejs.org/en/) v22 — we recommend nvm, which will pick up the version in
[.nvmrc](.nvmrc). That file is the authoritative version for both local development and CI.

[Meteor](https://www.meteor.com/install) 3.4 — install per the official instructions
(`npm install -g meteor`). The project pins its release in
[.meteor/release](.meteor/release), and the tool springboards to that version automatically.

[node-gyp](https://github.com/nodejs/node-gyp)

	npm install -g node-gyp

_node-gyp issues can generally be solved with updating npm (npm i -g npm) and rebuilding modules (npm rebuild)_

Linux only: libusb-dev, libudev-dev and libarchive-tools

	sudo apt-get install libusb-dev libudev-dev libarchive-tools

Windows only: [Build Tools for Visual Studio](https://visualstudio.microsoft.com/downloads/) (the "Desktop development with C++" workload), required to compile the native USB/HID modules.

Everything else — including `@theqrl/electrify-qrl` for the desktop build and `electron-builder` for the installers — is a local dependency installed by `npm install`. No global installs are needed beyond the above.


## Install qrl-wallet

	git clone https://github.com/theQRL/qrl-wallet.git
	cd qrl-wallet
	npm install

## Run QRL Wallet (web wallet)

	meteor

A locally running wallet will be available at http://localhost:3000

The compiled Tailwind stylesheet (`public/tailwind-output.css`) is committed, so `meteor` alone
gives a fully styled wallet. If you are editing styles or Tailwind classes, use the dev script
instead — it rebuilds the stylesheet on change alongside Meteor:

	npm run dev

To rebuild the stylesheet once, without watching:

	npm run build:css

## Lint

	npm run releaseready

This runs `meteor lint` and is the check to run before opening a pull request.

## Tests

There is currently no working automated test suite: `npm test` is a placeholder, and the legacy
browser tests under `tests/` have no runner wired up. Changes should be verified by hand until a
runner is reinstated.

## Run QRL Wallet (desktop client)

	npm run electron

## Package Electron Client

Ensure a `node` binary for the platform being built for is present in `.electrify/bin`. To copy the
one currently on your PATH:

	npm run acquire:node

The wallet holds no server-side database, so no mongo binaries are required.

1. Clean only the target platform output in `.electrify/.dist`

> MacOS, Linux and Windows

	npm run cleanDist

For explicit platform cleanup:

	npm run cleanDist:darwin
	npm run cleanDist:linux
	npm run cleanDist:win32

2. Package Electron App

> MacOS, Linux and Windows

	npm run releaseready
	npm run build

For explicit platform packaging:

	npm run build:darwin
	npm run build:linux
	npm run build:win32

## Build Installer

	npm run installer

Installers are produced by [electron-builder](https://www.electron.build/): a `.dmg` on macOS,
`.deb` and `.pacman` packages on Linux, and an NSIS `.exe` on Windows. Output is written alongside
the packaged app in `.electrify/.dist`.

For explicit platform installers:

	npm run installer:darwin
	npm run installer:linux
	npm run installer:win32

## Releases

Official desktop artifacts are built and published by the
[release-build workflow](.github/workflows/release-build.yml), which runs on a `v*` tag across a
six-platform matrix.

If you have issues, the [QRL Discord](https://discord.gg/jBT6BEp) is a good place to ask for help.
