// Hotfix for https://github.com/nodejs/node/issues/30039
'use strict'
require('module').wrapper[0] += `'use strict';`

if(process.platform !== 'win32') {
	console.error('Aion Proxy only supports Windows.')
	return
}

const logRoot = require('log'),
	log = logRoot('proxy'),
	net = require('net'),
	fs = require('fs'),
	path = require('path'),
	settings = require('../../settings/_aion-proxy_.json')

;(async () => {
	log.info(`Node version: ${process.versions.node}`);

	try {
		await new Promise((resolve, reject) => {
			net.createServer().listen('\\\\.\\pipe\\aion-proxy', resolve).on('error', reject)
		})
	}
	catch(e) {
		log.error('Another instance of Aion Proxy is already running. Please close it then try again.')
		return
	}

	if(settings.devWarnings) logRoot.level = 'dwarn'

	if(settings.autoUpdate) {
		log.info('Checking for updates')

		try {
			const branch = settings.branch || 'master'

			if(await (new (require('updater'))).update({
				dir: path.join(__dirname, '../..'),
				//manifestUrl: `https://raw.githubusercontent.com/aion-proxy/aion-proxy/${branch}/manifest.json`,
				//defaultUrl: `https://raw.githubusercontent.com/aion-proxy/aion-proxy/${branch}/`,
				preUpdate(changed) {
					let winDivertChanged = false
					for(let file of changed)
						if(file.startsWith('node_modules/proxy-game/bin/')) winDivertChanged = true

					if(winDivertChanged) require('child_process').spawnSync('sc', ['stop', 'windivert'])
					if(changed.has('bin/node.exe')) return true
				}
			})) {
				log.info('Aion Proxy has been updated. Please restart it to apply changes.')
				process.exit()
			}
			log.info('Proxy is up to date')
		}
		catch(e) {
			log.error('Error checking for updates:')
			if(e.request) log.error(e.message)
			else log.error(e)
		}
	}

	const ProxyGame = require('proxy-game'),
		   servers = require('./servers'),
		{ Connection, RealClient } = require('aion-proxy-game');
	

	let initialized = false
	/*
		const modManager = new ModManager({
			modsDir: path.join(__dirname, '..', '..', 'mods'),
			settingsDir: path.join(__dirname, '..', '..', 'settings'),
			autoUpdate: settings.autoUpdateMods
		})

		await modManager.init()
	*/
	const redirects = [],
		serverQ = []

	for(let data of servers) {
		let redirect

		const server = net.createServer(socket => {
			if(!initialized) { // Should never happen, but would result in an infinite loop otherwise
				socket.end()
				return
			}

			const logThis = log(`Client ${socket.remoteAddress}:${socket.remotePort}`)

			socket.setNoDelay(true)
			
			
			const connection = new Connection(),
				  client = new RealClient(connection, socket),
				  srvConn = connection.connect(client, { host: redirect[2], port: redirect[3] }) // Connect to self to bypass redirection

			logThis.log('Connection to Login/Gameserver')

			socket.on('error', err => {
				if(err.code === 'ECONNRESET') logThis.log('Lost connection to Client')
				else logThis.warn(err)
			})
			
			srvConn.on('connect', () => {
                logThis.log(`connected to ${srvConn.remoteAddress}:${srvConn.remotePort}`)
			})

			srvConn.on('error', err => {
				if(err.code === 'ECONNRESET') logThis.log('Lost connection to server')
				else if(err.code === 'ETIMEDOUT') logThis.log('Timed out waiting for server response')
				else logThis.warn(err)
			})

			srvConn.on('close', () => { logThis.log('Disconnected') })
		})
		
		serverQ.push(new Promise((resolve, reject) => {
			server.listen(0, '127.0.0.2', resolve).on('error', reject)
		}).then(() => {
			const addr = server.address()
			redirects.push(redirect = [data.ip, data.port, addr.address, addr.port = addr.port])
		}))
	}
	await Promise.all(serverQ)



	try {
		// Swap gameserver addresses with proxy ones
		const pg = new ProxyGame(`tcp && (${
			['127.0.0.2', ...new Set(servers.map(s => s.ip))].map(ip => `ip.SrcAddr == ${ip}||ip.DstAddr==${ip}`).join('||')
		})`, ...redirects)

		setInterval(() => { pg }, 60000) // TODO: Store object in C++ memory and only delete on close()
	}
	catch(e) {
		let msg = null
		
		switch(e.code) {
			case 2:
				msg = [
					'Failed to load WinDivert driver file.',
					'Start aion Proxy prior to any VPN software.',
					'Make sure anti-virus software did not delete required files.',
					'Open an administrator command prompt and enter \'sc stop windivert1.4\'.'
				]
				break
			case 5:
				msg = [
					'Access denied.',
					'Right click aionProxy.bat and select \'Run as administrator\'.',
					'Disable or uninstall your anti-virus software.'
				]
				break
			case 577:
				msg = [
					'WinDivert driver signature could not be verified.',
					'Update Windows.',
					'If using Windows 7 or earlier, upgrade to a later version.'
				]
				break
			case 1275:
				msg = [
					'WinDivert driver was blocked.',
					'Uninstall your anti-virus software completely, then restart your computer.'
				]
				break
			case 1753:
				msg = [
					'Base Filtering Engine service is disabled.',
					'Run "services.msc".',
					'Right-click the "Base Filtering Engine" service, select \'Properties\'.',
					'Change \'Startup type\' to \'Automatic\', then click \'Start\'.'
				]
				break
			default:
				throw e
		}

		log.error(`${msg.shift()}${msg.length > 1 ? '\n' : ''}${msg.map(s => '\n* ' + s).join('')}`)
		process.exit(1)
	}

	log.info('OK Ready for connection')
	initialized = true
})().catch(e => {
	log.error(e)
	process.exit(1)
})
