const util = require('util'),
	fs = require('fs').promises,
	path = require('path')

module.exports = function Debug(mod) {
	mod.settings.$init({
		version: 1,
		defaults: {
			logger: {
				enabled: false,
				dir: '.',
				incoming: null,
				fake: false,
				silenced: null,
				unmapped: null,
				blacklist: []
			}
		}
	})

	const { command } = mod.require

	// Evaluate JavaScript ingame (Note: [] cannot be input due to chat limitations)
	command.add('eval', async str => {
		const val = await eval(unHtml(str))

		if(val == null)
			command.message(typeof val)
		else
			command.message(html(util.inspect(val, { maxArrayLength: 30, breakLength: Infinity })))
	})

	// Simulate most button presses
	command.add('input', (cmd = '', param = '', unk) => {
		mod.send('I_INPUT_COMMAND', 1, {
			command: unHtml(cmd),
			parameter: unHtml(param),
			unk: unk && unk.toLowerCase() !== 'false' && unk !== '0'
		})
	})

	// Unreal Engine 3 commands
	command.add('ue', (...args) => {
		mod.send('S_STEER_DEBUG_COMMAND', 1, { command: unHtml(args.join(' ')) })
	})

	// Reload specified mod
	command.add('reload', name => {
		if(!mod.isLoaded(name)) command.message(`Mod not found: ${name}`)
		else if(!mod.reload(name)) command.message(`${name} does not support reload`)
		else command.message(`Reloaded ${name}`)
	})

	// Packet logger
	{
		let hooks = [],
			logFile = '',
			blacklistSet = new Set(),
			writeBuffer = '',
			writeTimer = null

		reload()

		command.add('log', {
			$none() {
				command.message(`Logging to file ${(mod.settings.logger.enabled = !mod.settings.logger.enabled) ? 'enabled' : 'disabled'}.`)
				reload()
			},
			$default() {
				command.message(
`Log settings:
- file: ${mod.settings.logger.enabled ? logFile : 'disabled'}
- direction: ${stringifyFilter(mod.settings.logger.incoming, true)}
- fake: ${stringifyFilter(mod.settings.logger.fake)}
- blocked: ${stringifyFilter(mod.settings.logger.silenced)}
- unmapped: ${stringifyFilter(mod.settings.logger.unmapped)}
- blacklist: ${mod.settings.logger.blacklist.length} item(s)`
				)
			},
			direction(arg) {
				arg = arg.toLowerCase()
				if(!['both', 'client', 'server'].includes(arg)) {
					command.message(`Usage: ${this} both|client|server`)
					return
				}
				mod.settings.logger.incoming = parseFilter(arg)
				reload()
				command.message(`Packet direction: ${arg}`)
			},
			fake(arg) {
				arg = arg.toLowerCase()
				if(!['show', 'only', 'hide'].includes(arg)) {
					command.message(`Usage: ${this} show|only|hide`)
					return
				}
				mod.settings.logger.fake = parseFilter(arg)
				reload()
				command.message(`Fake packets: ${arg}`)
			},
			blocked(arg) {
				arg = arg.toLowerCase()
				if(!['show', 'only', 'hide'].includes(arg)) {
					command.message(`Usage: ${this} show|only|hide`)
					return
				}
				mod.settings.logger.silenced = parseFilter(arg)
				reload()
				command.message(`Blocked packets: ${arg}`)
			},
			unmapped(arg) {
				arg = arg.toLowerCase()
				if(!['show', 'only', 'hide'].includes(arg)) {
					command.message(`Usage: ${this} show|only|hide`)
					return
				}
				mod.settings.logger.unmapped = parseFilter(arg)
				reload()
				command.message(`Unmapped packets: ${arg}`)
			}
		})

		function hook() { hooks.push(mod.hook(...arguments)) }

		function reload() {
			unload()
			if(mod.settings.logger.enabled) load()
		}

		function load() {
			logFile = path.resolve(
				path.join(
					...(mod.settings.logger.dir.startsWith('.') ? [__dirname, '../..'] : []), // Relative to tera-proxy dir
					mod.settings.logger.dir,
					`tera-proxy-${Date.now()}.log`
				)
			)
			blacklistSet = new Set(mod.settings.logger.blacklist)

			const cache = []

			hook('*', 'raw', {
				order: -Infinity,
				filter: { incoming: mod.settings.logger.incoming }
			}, (code, data) => {
				// Clone and cache the original packet prior to other hooks
				cache.push({ code, data: Buffer.from(data) })
			})

			hook('*', 'raw', {
				order: Infinity,
				filter: {
					incoming: mod.settings.logger.incoming,
					// These need to go through so we can clean up from our previous hook, even if we're not logging them
					fake: null,
					modified: null,
					silenced: null
				}
			}, (code, data) => {
				if(data.$fake) {
					if(!data.$silenced) // We probably don't ever need to log fake silenced packets
						writePacket({ code, data }, {
							incoming: data.$incoming,
							fake: true,
							silenced: false
						})
					return
				}

				const origPacket = cache.pop() // This will be null for the command packet when enabling logger
				if(origPacket)
					writePacket(origPacket, {
						incoming: data.$incoming,
						fake: false,
						silenced: data.$modified
					})

				if(data.$modified && !data.$silenced) // We probably don't ever need to log fake silenced packets
					writePacket({ code, data }, {
						incoming: data.$incoming,
						fake: true,
						silenced: false
					})
			})
		}

		function unload() {
			if(hooks.length) {
				for(let h of hooks) mod.unhook(h)

				hooks = []
			}
		}

		function writePacket(pkt, flags) {
			if(mod.settings.logger.fake !== null && mod.settings.logger.fake !== flags.fake) return
			if(mod.settings.logger.silenced !== null && mod.settings.logger.silenced !== flags.silenced) return

			const name = mod.dispatch.protocol.packetEnum.code.get(pkt.code)

			if(mod.settings.logger.unmapped !== null && mod.settings.logger.unmapped !== !!name) return
			if(blacklistSet.has(name)) return

			const defs = name && mod.dispatch.protocol.constructor.defs.get(name),
				defVersion = defs && Math.max(...defs.keys())

			let symbol = flags.fake ? '*' : flags.silenced ? 'X' : '-'
			symbol = flags.incoming ? `<${symbol}` : `${symbol}>`

			let parsed = null,
				badDef = false

			if(defs)
				try {
					parsed = mod.parse(pkt.code, defVersion, pkt.data)
					badDef = mod.packetLength(pkt.code, defVersion, parsed) !== pkt.data.length
				}
				catch(e) { badDef = true }

			write(
`[${timestampNow()}] ${symbol} ${name || pkt.code}${defs ? `.${defVersion}` : ''}${badDef ? ' (bad def)' : ''}
${pkt.data.slice(0, 4).toString('hex')}${pkt.data.length > 4 ? ` ${pkt.data.slice(4).toString('hex')}` : ''}`
			)

			if(parsed) {
				const defaultBigIntToJSON = BigInt.prototype.toJSON,
					defaultBufferToJSON = Buffer.prototype.toJSON
				BigInt.prototype.toJSON = function() { return this.toString() }
				Buffer.prototype.toJSON = function() { return this.toString('hex') }

				try { write(JSON.stringify(parsed)) } catch(e) {}

				BigInt.prototype.toJSON = defaultBigIntToJSON
				Buffer.prototype.toJSON = defaultBufferToJSON
			}

			write('------------------------------')
		}

		function write(str) {
			writeBuffer += str + '\n'
			if(!writeTimer) writeTimer = mod.setTimeout(doWrite, 1000)
		}

		async function doWrite() {
			const q = fs.appendFile(logFile, writeBuffer)
			writeBuffer = ''
			await q
			writeTimer = writeBuffer ? mod.setTimeout(doWrite, 1000) : null
		}

		function parseFilter(str) {
			if(str === 'show' || str === 'both') return null
			if(str === 'only' || str === 'server') return true
			if(str === 'hide' || str === 'client') return false
		}

		function stringifyFilter(filter, direction) {
			if(direction) {
				if(filter === null) return 'both'
				if(filter === true) return 'server'
				if(filter === false) return 'client'
			}

			if(filter === null) return 'show'
			if(filter === true) return 'only'
			if(filter === false) return 'hide'
		}
	}

	this.destructor = () => { command.remove(['eval', 'input', 'ue', 'reload', 'log']) }
}

// Helper functions

const ESCAPED = { '<': '&lt;', '>': '&gt;', '&': '&amp;' },
	NORMAL = { '&lt;': '<', '&gt;': '>', '&amp;': '&' }

function html(str) { return str.replace(/[<>&]/g, m => ESCAPED[m]) }
function unHtml(str) { return str.replace(/&[^;]+;/g, m => NORMAL[m]) }

function timestampNow() {
	const date = new Date()
	return `${date.getHours().toString().padStart(2, '0')
	}:${date.getMinutes().toString().padStart(2, '0')
	}:${date.getSeconds().toString().padStart(2, '0')
	}.${date.getMilliseconds().toString().padStart(3, '0')}`
}