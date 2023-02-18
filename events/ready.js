const { Events } = require('discord.js');
const { forumWatcher } = require('../forumWatcher.js');

module.exports = {
	name: Events.ClientReady,
	once: true,
	execute(client) {
		console.log(`Ready! Logged in as ${client.user.tag}`);

		new forumWatcher(client);
	},
};

// https://stackoverflow.com/questions/109086/stop-setinterval-call-in-javascript?rq=1