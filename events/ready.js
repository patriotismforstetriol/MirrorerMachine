const { Events } = require('discord.js');
const { forumWatcher } = require('../forumWatcher.js');
const { SMFConnection } = require('../SMFlib.js');

module.exports = {
	name: Events.ClientReady,
	once: true,
	async execute(client) {
		console.log(`Ready! Logged in as ${client.user.tag}`);

		try {
			const db = await SMFConnection.SMFConnectionBuilder();
			const time = await db.get_FLastSyncTime();
			console.log("Last sync time: ", time, "vs now: ", Math.floor(Date.now() / 1000));
			new forumWatcher(client, lastTick=time);
			db.end();
			return;

		} catch (err) {
			console.log('Failed to connect to db due to ', err);
		}

		new forumWatcher(client);
	},
};

// https://stackoverflow.com/questions/109086/stop-setinterval-call-in-javascript?rq=1