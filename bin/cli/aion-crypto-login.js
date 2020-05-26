// <3 Pinkie Pie

const INIT_KEY = Buffer.from('6b60cb5b82ce90b1cc2b6c556c6c6c6c', 'hex')

const crypto = require('crypto')

class AionCryptoLogin {
	constructor() {
		this._setKey(INIT_KEY)

		this.init = false
	}

	encrypt(data) {
		data = data.slice(2) // Ignore header

		// First packet from server is encrypted twice and contains key setup info
		if(!this.init) {
			this.init = true

			// Extract new key
			this._setKey(data.slice(153, 153 + 16))

			// Reserve space for overflow
			data.writeInt32LE(0, data.length - 8)

			// XOR bytes 4...(length-8)
			for(let i = 4, xor = data.readInt32LE(0); i < data.length - 4; i += 4) {
				const next = data.readInt32LE(i)
				xor += next
				data.writeInt32LE(next ^ xor, i)
			}
		}

		// Aion little-endian variant of Blowfish
		for(let i = 0; i < data.length; i += 4) data.writeUInt32BE(data.readUInt32LE(i), i)
		this.cipher.update(data).copy(data)
		for(let i = 0; i < data.length; i += 4) data.writeUInt32BE(data.readUInt32LE(i), i)
	}

	decrypt(data) {
		data = data.slice(2) // Ignore header

		// Aion little-endian variant of Blowfish
		for(let i = 0; i < data.length; i += 4) data.writeUInt32BE(data.readUInt32LE(i), i)
		this.decipher.update(data).copy(data)
		for(let i = 0; i < data.length; i += 4) data.writeUInt32BE(data.readUInt32LE(i), i)

		// First packet from server is encrypted twice and contains key setup info
		if(!this.init) {
			this.init = true

			// XOR bytes 4...(length-8)
			for(let i = data.length - 12, xor = data.readInt32LE(data.length - 8); i >= 4; i -= 4) {
				const next = data.readInt32LE(i) ^ xor
				data.writeInt32LE(next, i)
				xor -= next
			}

			data.writeInt32LE(0, data.length - 8)

			// Extract new key
			this._setKey(data.slice(153, 153 + 16))
		}
	}

	checksum(data) {
		data = data.slice(2) // Ignore header

		let acc = 0
		for(let i = data.length - 8; i >= 0; i -= 4) acc ^= data.readInt32LE(i)

		return acc === 0
	}

	_setKey(key) {
		this.cipher = crypto.createCipheriv('bf-ecb', key, null).setAutoPadding(false)
		this.decipher = crypto.createDecipheriv('bf-ecb', key, null).setAutoPadding(false)
	}
}

module.exports = AionCryptoLogin