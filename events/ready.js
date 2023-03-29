const { Events } = require('discord.js');
const { forumWatcher } = require('../forumWatcher.js');
const { discordWatcher } = require('../discordWatcher.js');
const { SMFConnection } = require('../SMFlib.js');

module.exports = {
	name: Events.ClientReady,
	once: true,
	myForumWatcher: new forumWatcher(),
	myDiscordWatcher: new discordWatcher(),
	async execute(client) {
		console.log(`Ready! Logged in as ${client.user.tag}`);

		try {
			const db = await SMFConnection.SMFConnectionBuilder();
			const fTime = await db.get_FLastSyncTime();
			// console.log('Last forum sync time: ', fTime, 'vs now: ', Math.floor(Date.now() / 1000));
			this.myForumWatcher.setLastTick(fTime);
			this.myForumWatcher.startWatching(client);

			const dTime = await db.get_DLastSyncTime();
			// console.log('Last Discord sync time: ', dTime, 'vs now: ', Math.floor(Date.now() / 1000));
			this.myDiscordWatcher.syncEverythingSince(client, dTime);

			db.end();
			return;

		} catch (err) {
			console.log('Failed to connect to db due to ', err);
		}

		this.myForumWatcher.startWatching(client);
		this.myDiscordWatcher.syncEverythingSince(client);
	},
};

// https://stackoverflow.com/questions/109086/stop-setinterval-call-in-javascript?rq=1