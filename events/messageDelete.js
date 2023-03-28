const { Events } = require('discord.js');
const { SMFConnection } = require('../SMFlib.js');

module.exports = {
	name: Events.MessageDelete,
	async execute(message) {
		// No bot messages
		if (message.author.bot) return;

		try {
			const db = await SMFConnection.SMFConnectionBuilder();
			// newMessage keeps the same id as old message
			const isSynced = await db.check_discordMsgMembership(message.id);
			if (isSynced) {
				await db.sync_deleteMsg(message);
			}

			await db.end();
		} catch (err) {
			console.log('Failed to connect to db due to ', err);
			// await message.reply({ content:'Failed to connect to my database!', ephemeral:true });
		}
	},
};