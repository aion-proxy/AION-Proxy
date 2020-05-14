module.exports = {
	ModManager: require('./mod-manager'), // need to rewrite this later lot of tera stuff still in there.
	//Dispatch: require('./connection/dispatch'), // working on this now
	Connection: require('./connection'), // better & smooth connection + subscripts when?
	FakeClient: require('./clients/FakeClient'), // needs rework for sure
	RealClient: require('./clients/RealClient') // same here
}