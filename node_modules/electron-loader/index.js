// Hotfix for https://github.com/nodejs/node/issues/30039
'use strict'
require('module').wrapper[0] += `'use strict';`

const path = require('path'),
	{ app, BrowserWindow, Menu } = require('electron')

function load(appDir) {
	appDir = path.resolve(appDir)

	const appConfig = require(path.join(appDir, 'app.json'))

	if(!appConfig.main && !appConfig.main_js) throw Error('main or main_js required in app.json')

	// Disable the default app menu & shortcuts
	Menu.setApplicationMenu(null)

	/*
		Here we disable Chromium profiles. This has the following effects:
		* Less space used on users' computers (~6MB savings for even the smallest apps).
		* Allows multiple instances of the same app without additional workarounds.
		* Apps will always boot in a clean state, without any leftovers from previous runs.

		Known side-effects:
		* Remote files will not be cached automatically.
		* Local Storage and Indexed Databases will not be available.
		* If you want to enforce single-instance, it is advised to implement it yourself in main_js.
		* Dev Tools cannot be launched for several seconds following application startup, but will function normally afterwards.
		* The Chromium log (if enabled) will show several errors on startup.
	*/

	// Turn off as many disk cache options as we can
	for(let s of [
		'disable-databases',
		'disable-http-cache',
		'disable-gpu-program-cache',
		'disable-gpu-shader-disk-cache',
		'disable-local-storage',
		'disable-mojo-local-storage',
	])
		app.commandLine.appendSwitch(s)

	// Black hole any writes that we can't disable
	app.setPath('userData', path.join(app.getPath('temp'), 'nul'))

	app.once('ready', () => {
		// Run any JavaScript that needs to execute in the main process
		if(appConfig.main_js) require(path.join(appDir, appConfig.main_js))

		// Show our main window
		if(appConfig.main) new BrowserWindow(appConfig.window).loadURL(`file://${path.join(appDir, appConfig.main)}`)
	})
}

if(process.mainModule.filename === __filename)
	load(path.resolve(__dirname, '../..')) // Assumes we're installed to node_modules/electron-loader/
else
	/*
		Makes it possible to override app dir via a stub, ie.:
		require('electron-loader')(progress.argv[2])
	*/
	module.exports = load