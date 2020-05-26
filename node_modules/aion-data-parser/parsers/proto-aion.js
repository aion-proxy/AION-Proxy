const Proto = require('./proto')

class ProtoAion extends Proto {
	constructor(gameVersion) {
		super(gameVersion, true)

		Object.assign(this, {
			bool: {
				compileRead(compile, id) { compile.str += `${id} = !!data.dv.getUint8(data.pos++)\n` },
				compileWrite(compile, id) { compile.str += `data.dv.setUint8(data.pos++, ${id} ? 1 : 0)\n` },
				length: 1
			},

			byte: Proto.StandardType('Uint8'),
			int16: Proto.StandardType('Int16'),
			uint16: Proto.StandardType('Uint16'),
			int32: Proto.StandardType('Int32'),
			uint32: Proto.StandardType('Uint32'),
			int64: Proto.StandardType('BigInt64'),
			uint64: Proto.StandardType('BigUint64'),
			float: Proto.StandardType('Float32'),
			double: Proto.StandardType('Float64'),

			string: {
				compileRead(compile, id) {
					const startPos = compile.local()

					compile.str += `const ${startPos} = data.pos\n`
					// Find string terminator
					compile.str += `while(data.dv.getUint16(data.pos, true)) data.pos += 2\n`
					compile.str += `${id} = ${startPos} === data.pos ? '' : data.buf.toString('ucs2', ${startPos}, data.pos)\n`
					compile.str += `data.pos += 2\n`
				},

				compileWrite(compile, id) {
					compile.str += `if(typeof ${id} !== 'string' && ${id} != null) throw TypeError('${id} must be a string, null, or undefined')\n`
					id = compile.makeLocal(id, `''`)

					compile.str += `data.buf.fill(${id} + '\\0', data.pos, data.pos += 2 + 2*${id}.length, 'ucs2')\n`
				},

				compileLength(compile, id) {
					compile.str += `if(typeof ${id} !== 'string' && ${id} != null) throw TypeError('${id} must be a string, null, or undefined')\n`
					id = compile.makeLocal(id, `''`)

					compile.str += `len += 2 + 2*${id}.length\n`

					const str = compile.str
					compile.str = ''
					return str
				}
			}
		})
	}
}

module.exports = ProtoAion