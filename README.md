[![Build Status](https://circleci.com/gh/theQRL/qrl-wallet.svg?style=shield&circle-token=:circle-token)](https://circleci.com/gh/theQRL/qrl-wallet)
[![Codacy Badge](https://api.codacy.com/project/badge/Grade/c91e0f3f6ca04283879cbbe6a5f4f53d)](https://www.codacy.com/app/scottdonaldau/qrl-wallet?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=theQRL/qrl-wallet&amp;utm_campaign=Badge_Grade)
[![Maintainability](https://api.codeclimate.com/v1/badges/30e006c07f50365faa9a/maintainability)](https://codeclimate.com/github/theQRL/qrl-wallet/maintainability)
[![Known Vulnerabilities](https://snyk.io/test/github/theqrl/qrl-wallet/badge.svg)](https://snyk.io/test/github/theqrl/qrl-wallet)
[![MIT licensed](https://img.shields.io/badge/license-MIT-blue.svg)](https://raw.githubusercontent.com/theQRL/qrl-wallet/master/LICENSE)

# qrl-wallet | wallet.theqrl.org

This is the QRL wallet application developed by The QRL team, and hosted on wallet.theqrl.org

It provides both web and desktop interfaces using [Meteor](https://www.meteor.com/), [Semantic UI](https://semantic-ui.com/), [NodeJS](https://nodejs.org/en/) and [Electron](https://electronjs.org/).

All secure XMSS operations are run in a web assembly compiled version of [qrllib](https://github.com/theQRL/qrllib) locally in your browser or desktop application. Keys stay in the memory space of the XMSS object, which is destroyed the moment you close the wallet, browser window or desktop application.


## Development Dependencies

The following dependencies are required for a functional local development environment.

[NodeJS](https://nodejs.org/en/) v8.9.3

[Meteor](https://www.meteor.com/install)

[qrl-electrify](https://www.npmjs.com/package/qrl-electrify)

	npm install -g qrl-electrify

[chimp](https://github.com/xolvio/chimp)

	npm install -g chimp

Windows Only - [Build Tools for Visual Studio 2017](https://www.visualstudio.com/downloads/#build-tools-for-visual-studio-2017)


Windows Only - [node-gyp](https://github.com/nodejs/node-gyp)

	npm install -g node-gyp


## Install qrl-wallet

	git clone https://github.com/theQRL/qrl-wallet.git
	cd qrl-wallet
	meteor npm install --unsafe-perm
	cd .electrify
	npm install
	cd ..

## Run Meteor

	meteor

## Run Tests	

Note: meteor must already be running for this to work!

	chimp --ddp=http://localhost:3000 --watch --path=tests

## Run Electron Client

	electrify

## Package Electron Client

	mkdir .electrify/.dist
	electrify package -o .electrify/.dist/

