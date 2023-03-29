const { SMFConnection } = require('./SMFlib.js');

(async () => {
	try {
		const db = await SMFConnection.SMFConnectionBuilder();

		db.create_syncTables();

		db.create_extraColumns();

		await db.end();
		console.log('Successfully prepared database. Follow any instructions above.');

	} catch (error) {
		console.error(error);
	}
})();