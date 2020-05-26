'use strict'

const PUBLIC_ENABLE = true,
	PUBLIC_MATCH = /^\?([^?].*)$/,
	CLI_MODE = true,
	readline = require('readline'),
	log = require('log')('Command'),
	rl = readline.createInterface({ input: process.stdin, output: process.stdout })
	

class Command {
	constructor(mod) {
		this.mod = mod

		this.hooks = {}

		let lastError = '',
			hookOverride = (name, version, cb) => {
				mod.hook(name, version, {order: -10}, cb)

				// Let other modules handle possible commands before we silence them
				mod.hook(name, version, {order: 10, filter: {silenced: null}}, event => {
					if(lastError) {
						if(!event.$silenced) this.message(lastError)
						lastError = ''
						return false
					}
				})
			},
			handleCommand = message => {
				try {
					var args = parseArgs(message)
				}
				catch(e) {
					lastError = 'Syntax error: ' + e.message
					return
				}

				try {
					if(!this.exec(args)) {
						lastError = `Unknown command "${args[0]}".`
						return
					}
				}
				catch(e) {
					this.message('Error running callback for command "' + args[0] + '".')
					console.error(e)
				}

				lastError = ''
				return false
			}

		// Whispers with regex match
		if(PUBLIC_ENABLE)
			hookOverride('C_CHAT_WHISPER', 1, event => {
				const match = PUBLIC_MATCH.exec(event.message)

				if(match) return handleCommand(match[1])
			})

		rl.on('line', (cmd) => {
			if(CLI_MODE) handleCommand(cmd)
		})
	}

	exec(str) {
		const args = Array.isArray(str) ? str : parseArgs(str)

		if(args.length === 0) return false

		const cb = this.hooks[args[0].toLowerCase()]

		if(cb) {
			cb.call(...args)
			return true
		}

		return false
	}

	add(cmd, cb, ctx) {
		if(typeof cb === 'function') {
			if(ctx !== undefined) cb = cb.bind(ctx)
		}
		else if(typeof cb === 'object') cb = makeSubCommandHandler(cb, ctx)
		else throw new Error('Callback must be a function or object')

		if(Array.isArray(cmd)) {
			for(let c of cmd) this.add(c, cb)
			return
		}

		if(typeof cmd !== 'string') throw new Error('Command must be a string or array of strings')
		if(cmd === '') throw new Error('Command must not be an empty string')

		if(this.hooks[cmd = cmd.toLowerCase()]) throw new Error('Command already registered:', cmd)

		this.hooks[cmd] = cb
	}

	remove(cmd) {
		if(Array.isArray(cmd)) {
			for(let c of cmd) this.remove(c)
			return
		}

		if(typeof cmd !== 'string') throw new Error('Command must be a string or array of strings')
		if(cmd === '') throw new Error('Command must not be an empty string')

		delete this.hooks[cmd.toLowerCase()]
	}

	message(msg) { // message ingame | find something that can be used without get kicked from server q.q
	/*	this.mod.send('C_CHAT_WHISPER', 1, {
			name: 'Proxy',
			message: msg
		}) 
	*/ 
		if(CLI_MODE) log.info(msg)
	}
}

function makeSubCommandHandler(_obj, ctx) {
	const obj = {}

	for(let cmd in _obj) {
		const cb = _obj[cmd]

		cmd = cmd.toLowerCase()

		if(typeof cb === 'function') obj[cmd] = ctx !== undefined ? cb.bind(ctx) : cb
		else if(typeof cb === 'object') obj[cmd] = makeSubCommandHandler(cb, ctx)
		else throw new Error('Sub-command callback must be a function or object')
	}

	return function subCommandHandler(cmd) {
		let cb = cmd !== undefined ? obj[cmd.toLowerCase()] : obj.$none

		if(cb) cb.call(...arguments)
		else if(cb = obj.$default) cb.call(cmd, ...arguments)
	}
}

function parseArgs(str) {
	const args = []

	let arg = '',
		quote = ''

	for(let i = 0, c = ''; i < str.length; i++) {
		c = str[i]

		switch(c) {
			case '\\':
				c = str[++i]

				if(c === undefined) throw new Error('Unexpected end of line')

				arg += c
				break
			case '\'':
			case '"':
				if(arg === '' && quote === '') {
					quote = c
					break
				}
				if(quote === c) {
					quote = ''
					break
				}
				arg += c
				break
			case ' ':
				if(quote === '') {
					if(arg !== '') {
						args.push(arg)
						arg = ''
					}
					break
				}
			default:
				arg += c
		}
	}

	if(arg !== '') {
		if(quote !== '') throw new Error('Expected ' + quote)

		args.push(arg)
	}

	return args
}

module.exports = function Require(mod) {
	if(mod.name !== 'command') throw SyntaxError(`Cannot require('command')\nUse "const {command} = mod.require" instead.`)

	return new Command(mod)
}