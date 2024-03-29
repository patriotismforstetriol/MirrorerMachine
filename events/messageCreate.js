const { Events } = require('discord.js');
const { getSubjectLine, SMFConnection } = require('../SMFlib.js');

module.exports = {
	name: Events.MessageCreate,
	async execute(message) {
		// No bot messages and discard irrelevant channels
		if (message.author.bot) return;

		try {
			const db = await SMFConnection.SMFConnectionBuilder();
			const isSyncChannel = await db.check_discordBoardMembership(message.channelId);
			if (isSyncChannel) {
				// We are in the main body of one of the forum-board-synced Discord channels
				// So this message starts a new topic/thread

				// First create the thread in Discord
				const subjectline = getSubjectLine(message);
				await message.startThread({
					name: subjectline,
				}).catch(console.error);

				// Then copy thread topic and post to SMF
				await db.sync_newTopic(message, subjectline);
				await message.react('🌐');

			} else {
				const isSyncThread = await db.check_discordTopicMembership(message.channelId);
				if (isSyncThread) {
					// We are in a Discord thread that is being synced with a forum topic
					// So this message continues a topic/thread
					await db.sync_newMsgInTopic(message);
					await message.react('🌐');

				}
				// If we didn't make either of the above conditions, we can ignore this message
			}

			await db.end();
		} catch (err) {
			console.log('Failed to connect to db due to ', err);
			// await message.reply({ content:'Failed to connect to my database!', ephemeral:true });
		}
	},
};