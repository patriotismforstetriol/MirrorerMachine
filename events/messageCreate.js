const { Events } = require('discord.js');
const { threadChannels, myForumId, myEmail } = require('../config.json');
const { pool } = require('../dbtest');

module.exports = {
	name: Events.MessageCreate,
	async execute(message) {
		// No bot messages and discard irrelevant channels
		if (message.author.bot) return;
		if ((threadChannels.filter(channel => channel === message.channelId)).length === 0) {
			return;
		}

		let subjectline;

		if (message.content.length > 81) {
			// if message length <= 81: start a thread with that message as both title and content
			subjectline = message.content;

		} else {
			// if message is longer than that but the first line is in the right length:
			// first line is the title
			const firstLine = message.content.split(/\n(.*)/s);

			if (firstLine.length === 0 || firstLine[0] === undefined) return;

			if (firstLine[0].length <= 81) {
				subjectline = firstLine[0];
			} else {
				// Otherwise cropped portion of post text is the title
				subjectline = `${(firstLine[0]).substring(0, 77)}...`;
			}
		}

		await message.startThread({
			name: subjectline,
		}).catch(console.error);

		try {
			// connect to database
			const conn = await pool.getConnection();
			await conn.query('USE forums;');

			// Get board ID of board that corresponds to this channel
			const board_qry = await conn.query(`SELECT forum_boardId FROM discordmirror_boards where discord_boardId LIKE '${message.channelId}'`);
			if (board_qry.length === 0) {
				// Does throw error crash this?
				throw new Error(`Could not find board corresponding to channel ${message.channelId} in \`discordmirror_boards\``);
			}
			const board = board_qry[0].forum_boardId;

			// Get Mirrorer's name for the person who posted this
			const usersName_qry = await conn.query(`SELECT discord_member_name FROM discordmirror_members WHERE discordid_member LIKE ${message.author.id};`);
			if (usersName_qry.length === 0) {
				throw new Error(`Could not find a name for user ${message.author.id}.`);
			}
			const usersName = usersName_qry[0].discord_member_name;

			// Start transaction so that no other ID numbers can be added in the meantime.
			await conn.beginTransaction();
			// Work out what the next message ID will be
			const msgId_qry = await conn.query('SELECT auto_increment FROM information_schema.tables WHERE TABLE_NAME LIKE \'itsa_messages\';');
			if (msgId_qry.length === 0) {
				throw new Error('Could not get message id.');
			}
			const msgId = msgId_qry[0].auto_increment;

			// Add the new topic and post to the database (using known board and message IDs)
			const topicInsert = await conn.query(`INSERT INTO itsa_topics (id_board, id_first_msg, id_last_msg, id_member_started) VALUES (${board}, ${msgId}, ${msgId}, ${myForumId}); `);
			if (topicInsert.constructor.name !== 'OkPacket') {
				throw new Error('Database new topic INSERT failed.');
			}

			// Find out what the topic ID is
			const topicId_qry = await conn.query(`SELECT id_topic FROM itsa_topics WHERE id_first_msg=${msgId};`);
			if (topicId_qry.length === 0) {
				throw new Error('Could not get topic id.');
			}
			const topicId = topicId_qry[0].id_topic;

			// Add the new message and post to the database (using known board, topic, and msg IDs)
			const msgContent = `[size=1][i][Message from Discord user ${usersName}][/i][/size]\n\n${message.content}`;
			const msgInsert = await conn.query('INSERT INTO itsa_messages (id_msg, id_topic, id_board, poster_time, id_member, subject, poster_name, poster_email, body) '
                + `VALUES (${msgId}, ${topicId}, ${board}, UNIX_TIMESTAMP(), ${myForumId}, '${subjectline}', '${usersName}', '${myEmail}', '${msgContent}'); `);
			if (msgInsert.constructor.name !== 'OkPacket') {
				throw new Error('Database new message INSERT failed.');
			}

			// End transaction if we got this far.
			await conn.commit();

			// Track them in our discord link databases too
			// Note: thread id is same as founder message ID
			const topicLink_qry = await conn.query(`INSERT INTO discordmirror_topics (discord_topicId, forum_topicId) VALUES (${message.id}, ${topicId}); `);
			if (topicLink_qry.constructor.name !== 'OkPacket') {
				throw new Error('Database new topic link INSERT failed.');
			}

			const msgLink_qry = await conn.query(`INSERT INTO discordmirror_messages (discord_messageId, forum_messageId) VALUES (${message.id}, ${msgId}); `);
			if (msgLink_qry.constructor.name !== 'OkPacket') {
				throw new Error('Database new message link INSERT failed.');
			}

			await message.react('🌐');
			await conn.end();
		} catch (err) {
			console.log('Failed to connect to db due to ', err);
			await message.reply('Failed to connect to my database!');
		}

	},
};