const { Events } = require('discord.js');
const { forumWatcher } = require('../forumWatcher.js');
const { discordWatcher } = require('../discordWatcher.js');
const { SMFConnection } = require('../SMFlib.js');

module.exports = {
	name: Events.ClientReady,
	once: true,
	async execute(client) {
		console.log(`Ready! Logged in as ${client.user.tag}`);

		try {
			const db = await SMFConnection.SMFConnectionBuilder();
			const fTime = await db.get_FLastSyncTime();
			console.log("Last forum sync time: ", fTime, "vs now: ", Math.floor(Date.now() / 1000));
			new forumWatcher(client, lastTick=fTime);

			const dTime = await db.get_DLastSyncTime();
			console.log("Last Discord sync time: ", dTime, "vs now: ", Math.floor(Date.now() / 1000));
			new discordWatcher(client, lastTick=dTime);

			db.end();
			return;

		} catch (err) {
			console.log('Failed to connect to db due to ', err);
		}

		new forumWatcher(client);
		new discordWatcher(client);
	},
};

// https://stackoverflow.com/questions/109086/stop-setinterval-call-in-javascript?rq=1