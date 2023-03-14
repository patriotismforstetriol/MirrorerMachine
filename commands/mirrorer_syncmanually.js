const { SlashCommandBuilder, PermissionFlagsBits, MessageType } = require('discord.js');
const { SMFConnection, getSubjectLine } = require('../SMFlib.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('mirrorer_syncmanually')
		.setDescription('Force update MirrorerMachine\'s database entry for a particular Discord message.')
		.setDefaultMemberPermissions(PermissionFlagsBits.ViewAuditLog)
		.addStringOption(option => option.setName('messagelink')
			.setDescription('discord.com link(s) of the Discord message(s) in question.')
			.setRequired(true)),
	async execute(interaction) {
		// Might be better to try with input being the message link, to deal with threads well eg:
		// https://discord.com/channels/701692471603626145/1072846827226939453/1072847844714750022

		const linkRegex = /discord\.com\/channels\/(?<guildId>\d+)\/(?<channelId>\d+)\/(?<messageId>\d+)/g;
		const linksDecoded = interaction.options.getString('messagelink').matchAll(linkRegex);

		let replyText = '**Processed**:\n';
		await interaction.reply({ content:'**Processing**', ephemeral:true });

		for (const linkDecoded of linksDecoded) {

			if (interaction.member.guild.id !== linkDecoded.groups.guildId) {
				replyText = replyText + `<https://discord.com/channels/${linkDecoded.groups.guildId}/${linkDecoded.groups.channelId}/${linkDecoded.groups.messageId}> is not in the current Discord server. `
                + 'An /updatedb command and the message it refers to must be in the same server.\n';
				// await interaction.editReply();
				continue;
			}

			let targetMsg = undefined;
			try {
				const channel = await interaction.member.guild.channels.fetch(linkDecoded.groups.channelId);
				if (channel === undefined || channel.constructor.name === 'Collection') {
					throw new Error(`Could not find specific channel id ${linkDecoded.groups.channelId}`);
				}

				targetMsg = await channel.messages.fetch(linkDecoded.groups.messageId);
				if (targetMsg === undefined || targetMsg.constructor.name === 'Collection') {
					throw new Error(`Could not find specific message id ${linkDecoded.groups.messageId}`);
				}

			} catch (err) {
				console.log('Could not find message due to ', err);
				replyText = replyText + `<https://discord.com/channels/${linkDecoded.groups.guildId}/${linkDecoded.groups.channelId}/${linkDecoded.groups.messageId}>: Invalid link/message cannot be found.\n`;
				continue;
			}

			try {
				const db = await SMFConnection.SMFConnectionBuilder();

				replyText = await updateInDB(targetMsg, db, interaction, replyText);

				await db.end();
			} catch (err) {
				console.log('Failed to connect to db due to ', err);
				replyText = replyText + 'Failed to connect to my database!';
				await interaction.editReply(replyText);
				return;
			}
		}

		replyText = replyText + '**done.**';
		await interaction.editReply(replyText);

	},
};

async function updateInDB(discordMessage, db, interaction, replyText) {
	// Four possible cases:
	// 1. Message entry exists in database, just needs updating. Do as events/messageUpdate.js
	// 2. Message does not exist in database, and starts a thread.
	//  Check if a thread has been manually created in the meantime. If so, create it and call update on all of its children.
	//   otherwise, do as events/messageCreate.js
	// 3. Message does not exist in database, and continues a thread. Do as events/messageCreate.js
	// 4. Message does not belong to any topic or thread that is being mirrored. Ignore it.
	const isSynced = await db.check_discordMsgMembership(discordMessage.id);
	if (isSynced) {
		// Case 1. Update the existing message entry in the database
		// Temporarily remove emoticon reaction, for buffering
		const reaction1 = discordMessage.reactions.cache.get('🌐');
		if (reaction1 !== undefined) {
			reaction1.remove()
				.catch(error => console.error('Failed to remove reactions:', error));
		}
		await discordMessage.react('⏳');

		// modify the content of the message
		await db.sync_updateMsg(discordMessage);

		discordMessage.reactions.cache.get('⏳').remove()
			.catch(error => console.error('Failed to remove reactions:', error));
		discordMessage.react('🌐');
		replyText = replyText + `<https://discord.com/channels/${discordMessage.guildId}/${discordMessage.channelId}/${discordMessage.id}>: 🌐\n`;
		interaction.editReply(replyText);
	} else {
		const isSyncChannel = await db.check_discordBoardMembership(discordMessage.channelId);
		if (isSyncChannel) {
			// Case 2: We are in the main body of one of the forum-board-synced Discord channels
			// So this message starts a new topic/thread, if one has not been manually created.
			replyText = replyText + `<https://discord.com/channels/${discordMessage.guildId}/${discordMessage.channelId}/${discordMessage.id}>: 🌐\n`;

			// Has a thread been manually created?
			if (discordMessage.hasThread) { // discordMessage.flags.has(MessageFlags.FLAGS.HAS_THREAD)) {
				// Sync the thread starter
				const thread = await discordMessage.guild.channels.fetch(discordMessage.id);
				if (thread === undefined || thread.constructor.name === 'Collection') {
					console.log('Thought I found a manual thread but it seems to have no follow-up messages.');
				}

				// Then copy thread topic and post to SMF
				await db.sync_newTopic(discordMessage, thread.name);
				discordMessage.react('🌐');

				// Then sync all sub-messages
				const threadContents = await thread.messages.fetch();
				for (const subMessage of threadContents) {
					if (subMessage[1].type != MessageType.ThreadStarterMessage) {
						try {
							replyText = await updateInDB(subMessage[1], db, interaction, replyText);
						} catch (err) {
							throw new Error('Error processing submessages of manual thread: ' + err);
						}
					}
				}

			} else {
				// Thread has not been manually created: Create the thread
				const subjectline = getSubjectLine(discordMessage);
				await discordMessage.startThread({
					name: subjectline,
				}).catch(console.error);

				// Then copy thread topic and post to SMF
				await db.sync_newTopic(discordMessage, subjectline);
				discordMessage.react('🌐');

			}
			interaction.editReply(replyText);

		} else {
			const isSyncThread = await db.check_discordTopicMembership(discordMessage.channelId);
			if (isSyncThread) {
				// Case 3: We are in a Discord thread that is being synced with a forum topic
				// So this message continues a topic/thread
				await db.sync_newMsgInTopic(discordMessage);
				discordMessage.react('🌐');
				replyText = replyText + `<https://discord.com/channels/${discordMessage.guildId}/${discordMessage.channelId}/${discordMessage.id}>: 🌐\n`;
				interaction.editReply(replyText);

			} else {
				// Case 4: we can ignore this message
				replyText = replyText + `<https://discord.com/channels/${discordMessage.guildId}/${discordMessage.channelId}/${discordMessage.id}> does not belong to my list of things that should be mirrored.\n`;
				interaction.editReply(replyText);
			}
		}
	}
	return replyText;
}
