const { Events } = require('discord.js');
const { SMFConnection } = require('../SMFlib.js');

module.exports = {
	name: Events.MessageUpdate,
	async execute(oldMessage, newMessage) {
		// ISSUE: this only runs when the message was created in the same session of Mirrorer

		// No bot messages
		if (newMessage.author.bot) return;

		// Subject line cannot change, even if editing first message of a thread

		try {
			const db = await SMFConnection.SMFConnectionBuilder();
			// newMessage keeps the same id as old message
			const isSynced = await db.check_discordMsgMembership(newMessage.id);
			if (isSynced) {
				// Temporarily remove emoticon reaction, for buffering
				newMessage.reactions.cache.get('🌐').remove()
					.catch(error => console.error('Failed to remove reactions:', error));
				newMessage.react('⏳');

				// modify the content of the message
				await db.sync_updateMsg(newMessage);

				newMessage.reactions.cache.get('⏳').remove()
					.catch(error => console.error('Failed to remove reactions:', error));
				await newMessage.react('🌐');
			}
		} catch (err) {
			console.log('Failed to connect to db due to ', err);
			await newMessage.reply('Failed to connect to my database!');
		}
	},
};