module.exports = function Def(mod) {

	const {command} = mod.require;

	command.add('def', (opcode, str) => {
		opcode = Number(opcode)
	
		const def = mod.compileProto(str.split(','))
		mod.hookOnce(opcode, def, event => {
		console.log(event)
		})
	})
mod.hook('S_TARGET_SELECTED',1, (event)=>{console.log(event)})

mod.hook('S_MESSAGE',1, (event)=>{console.log(event)})

command.add('select',(gameid) =>{
	mod.send('S_TARGET_SELECTED',1, {
		gameId: gameid
	})
})
}


// !def 202 "byte type, string message"