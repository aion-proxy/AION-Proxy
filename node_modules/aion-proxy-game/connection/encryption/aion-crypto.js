// <3 Pinkie Pie
// :3

const STATIC_KEY = Buffer.from('nKO/WctQ0AVLbpzfBkS6NevDYT8ourG5CRlmdjyJ72aswx4EPq1UgZhFMXH?3iI9', 'ASCII')

class AionCrypto {
	constructor() {
		// Game version 7.2.0.0
		this.opAdd = 0xd9
		this.opXor = 0xdb
		this.keyXor = 0xcd92e4d9
		this.keyAdd = 0x3ff2ccdf

		this.serverKey = null
		this.clientKey = null
	}

	encryptServer(data) {
		// Encrypt opcode
		const opcode = this._encryptOpcode(opcode)
		data.writeUInt16LE(opcode, 2)
		data.writeUInt16LE(~opcode & 0xffff, 5) // Integrity check

		if(opcode === 72) {
			if(this.serverKey) throw Error('Duplicate key packet received')

			const key = data.readUInt32LE(7)
			this.serverKey = Buffer.allocUnsafe(8)
			this.serverKey.writeUInt32LE(key, 0)
			this.serverKey.writeUInt32LE(0x87546ca1, 4)
			this.clientKey = Buffer.from(this.serverKey)

			// Encrypt key
			data.writeUInt32LE(this._encryptKey(key), 7)
		}
		else if(!this.serverKey) throw Error('First packet must be key (72)')
		else this._encrypt(data, this.serverKey)
	}

	decryptServer(data) {
		if(this.serverKey) this._decrypt(data, this.serverKey)

		// Integrity check
		let opcode = data.readUInt16LE(2)
		if((opcode ^ data.readUInt16LE(5)) !== 0xffff) throw Error('Integrity check failed (invalid encryption keys)')

		// Decrypt opcode
		data.writeUInt16LE(opcode = this._decryptOpcode(opcode), 2)

		if(opcode === 72) {
			if(this.serverKey) throw Error('Duplicate key packet received')

			const key = this._decryptKey(data.readUInt32LE(7))
			this.serverKey = Buffer.allocUnsafe(8)
			this.serverKey.writeUInt32LE(key, 0)
			this.serverKey.writeUInt32LE(0x87546ca1, 4)
			this.clientKey = Buffer.from(this.serverKey)
		}
		else if(!this.serverKey) throw Error('First packet must be key (72)')
	}

	encryptClient(data) {
		if(!this.clientKey)	throw Error('Cannot send client packet before key setup')

		this._encrypt(data, this.clientKey)
	}

	decryptClient(data) {
		if(!this.clientKey)	throw Error('Cannot send client packet before key setup')

		this._decrypt(data, this.clientKey)
	}

	_encryptOpcode(op) { return (op + this.opAdd ^ this.opXor) & 0xffff }
	_decryptOpcode(op) { return ((op ^ this.opXor) - this.opAdd) & 0xffff }

	_encryptKey(key) { return ((key ^ this.keyXor) + this.keyAdd) >>> 0 }
	_decryptKey(key) { return (key - this.keyAdd ^ this.keyXor) >>> 0 }

	_encrypt(data, key) {
		// Encrypt first byte
		let prev = data[2] ^= key[0]

		// Encrypt rest
		for(let i = 3; i < data.length; i++) {
			const ki = i - 2

			prev = data[i] ^= STATIC_KEY[ki & 0b111111] ^ key[ki & 0b111] ^ prev
		}

		key.writeBigUInt64LE(key.readBigUInt64LE(0) + BigInt(data.length - 2) & 0xffffffffffffffffn, 0)
	}

	_decrypt(data, key) {
		// Decrypt first byte
		let prev = data[2]
		data[2] ^= key[0]

		// Decrypt rest
		for(let i = 3; i < data.length; i++) {
			const ki = i - 2,
				next = data[i]

			data[i] ^= STATIC_KEY[ki & 0b111111] ^ key[ki & 0b111] ^ prev
			prev = next
		}

		key.writeBigUInt64LE(key.readBigUInt64LE(0) + BigInt(data.length - 2) & 0xffffffffffffffffn, 0)
	}
}

module.exports = AionCrypto