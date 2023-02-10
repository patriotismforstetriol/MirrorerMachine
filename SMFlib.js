// Library functions for syncing between Simple Machines Forum and Discord server
const { Message, Attachment } = require('discord.js');
const mariadb = require('mariadb');
const { dbUsername, dbHostname, dbPw, myForumId, myEmail } = require('./config.json');


/* GENERAL CATEGORY */

/** Converts a Discord message's content to a thread title/subject line */
function getSubjectLine(message) {
	// Check that 'message' is a discord.js message object
	if (!(message instanceof Message)) return undefined;

	let subjectline;
	if (message.content.length <= 81) {
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
	return subjectline;
}
exports.getSubjectLine = getSubjectLine;

/** Adds an author disclaimer to the top of a Discord message string's content */
function getForumReadyContent(message, author) {
	// Check that 'message' is a discord.js message object
	if (!(message instanceof Message)) return undefined;

	// SOURCE: https://codepen.io/intercaetera/pen/bgWdqe
	// Regular expressions for Markdown
	// Discord Markdown does not have headings. Sad.
	/* const h1regex = /# (.*?)(?:\ *)\n/g;
	const h2regex = /## (.*?)(?:\ *)\n/g;
	const h3regex = /### (.*?)(?:\ *)\n/g;

	const h1regexUnderline = /(.*?)\n={3,}/g;
	const h2regexUnderline = /(.*?)\n-{3,}/g;

	// Set replace values for headers
	const h1replace = '[size=x-large][b]$1[/b][/size][hr]';
	const h2replace = '[size=large]$1[/size][hr]';
	const h3replace = '[size=medium]$1[/size]';
	*/

	const boldItalicRegex = /(?:\*\*\*|___)(.*?)(?:\*\*\*|___)(?![^\[]*\])/g;
	const boldRegex = /(?:\*\*|__)(.*?)(?:\*\*|__)(?![^\[]*\])/g;
	const italicRegex = /(?:\*|_)(.*?)(?:\*|_)(?![^\[]*\])/g;
	const strikethroughRegex = /~~(.*?)~~/g;

	const imgRegex = /!\[(?:.*?)\]\((.*?)\)/g;
	const urlRegex = /\[(.*?)\]\((.*?)\)/g;
	const codeRegex = /```(?:\ *)\n(.*?)(?:\ *)\n```/g;


	let output = message.content;

	// Process attachments
	const attachs = [];
	for (const attachment of message.attachments.values()) {
		attachs.push(convertDiscordAttachmentToMarkdown(attachment));
	}
	// Remove falsy values (eg undefineds)
	const realattachs = attachs.filter(Boolean);

	/* if (h3replace) {
		output = output.replace(h3regex, h3replace);
	}

	if (h2replace) {
		output = output.replace(h2regex, h2replace);
		output = output.replace(h2regexUnderline, h2replace);
	}

	if (h1replace) {
		output = output.replace(h1regex, h1replace);
		output = output.replace(h1regexUnderline, h1replace);
	}*/

	output = output.replace(imgRegex, '[img]$1[/img]');
	output = output.replace(urlRegex, '[url=$2]$1[/url]');
	output = output.replace(codeRegex, '[code]$1[/code]');

	output = output.replace(boldItalicRegex, '[b][i]$1[/i][/b]');
	output = output.replace(boldRegex, '[b]$1[/b]');
	output = output.replace(italicRegex, '[i]$1[/i]');
	output = output.replace(strikethroughRegex, '[s]$1[/s]');

	if (realattachs.length > 0) {
		return `[size=1][i][Message from Discord user ${author}][/i][/size]\n\n${realattachs.join('\n')}\n${output}`;
	} else {
		return `[size=1][i][Message from Discord user ${author}][/i][/size]\n\n${output}`;
	}
}
exports.getForumReadyContent = getForumReadyContent;

function convertDiscordAttachmentToMarkdown(attachment) {
	// Check that 'message' is a discord.js message object
	if (!(attachment instanceof Attachment)) return undefined;

	const isImg = /^image\//g;
	if (isImg.test(attachment.contentType)) {
		return `[img]${attachment.proxyURL}[/img]`;
	}

	const isVideo = /^video\//g;
	if (isVideo.test(attachment.contentType)) {
		return `[html]<video width="${attachment.width}" height="${attachment.height}" controls="controls"><source src="${attachment.url}" type="${attachment.contentType}">` +
			'Your browser does not support this video element.</video>[/html]';
	}

	const isAudio = /^audio\//g;
	if (isAudio.test(attachment.contentType)) {
		return `[html]<audio controls="controls"><source src="${attachment.url}" type="${attachment.contentType}">` +
			'Your browser does not support the audio element.</audio>[/html]';
	}

	// Attachment not one of our supported types
	return '[size=1][i]{unsupported attachment}[/i][/size]';

}

/* SMF DATABASE INTERACTION */

const pool = mariadb.createPool({
	host: dbHostname,
	user: dbUsername,
	password: dbPw,
	connectionLimit: 5,
});
exports.pool = pool;

/**
 *
 */
class SMFConnection {
	/** Function to construct an SMFConnection object and its database connection.
     *
     * Both the function and the returned class throw errors on database connection fails,
     * so should probably be wrapped in a try/catch.
     * You should call `.end();` on the returned object at the end of its scope.
     *
     * @returns Initialised SMFConnection object
     */
	static async SMFConnectionBuilder() {
		const conn = await pool.getConnection();
		await conn.query('USE forums;');
		return new SMFConnection(conn);
	}

	constructor(conn) {
		this.conn = conn;
	}

	async end() {
		await this.conn.end();
	}

	async beginTransaction() {
		await this.conn.beginTransaction();
	}

	async commit() {
		await this.conn.commit();
	}

	/* Higher level methods */
	async create_syncTables() {
		await this.create_syncMemberTable().then((value) => {
			if (value.constructor.name !== 'OkPacket') {
				throw new Error('Sync member table creation failed.');
			}
		});

		await this.create_syncBoardTable().then((value) => {
			if (value.constructor.name !== 'OkPacket') {
				throw new Error('Sync boards table creation failed.');
			}
		});

		await this.create_syncTopicTable().then((value) => {
			if (value.constructor.name !== 'OkPacket') {
				throw new Error('Sync topic table creation failed.');
			}
		});

		await this.creatE_syncMsgTable().then((value) => {
			if (value.constructor.name !== 'OkPacket') {
				throw new Error('Sync messages table creation failed.');
			}
		});
	}

	async sync_newTopic(discordMessageObject, topicName = undefined) {
		// Get board ID of board that corresponds to this channel
		const board = await this.get_forumBoardId_fromDiscord(discordMessageObject.channelId);

		// Get Mirrorer's name for the person who posted this
		const usersName = await this.get_discordMemberName(discordMessageObject.author.id);
		const msgContent = getForumReadyContent(discordMessageObject, usersName);
		const msgTitle = topicName === undefined ? getSubjectLine(discordMessageObject) : topicName;

		// Start transaction so that no other ID numbers can be added in the meantime.
		await this.beginTransaction();
		const msgId = await this.get_nextUnusedMsgId();

		// Add the new topic to the database (using known board and message IDs)
		await this.put_newTopic(board, msgId);

		// Find out what the topic ID it was just given is
		const topicId = await this.get_forumTopicId_fromFirstMsg(msgId);

		// Add the new message and post to the database (using known board, topic, and msg IDs)
		await this.put_newMsg_setId(msgId, topicId, board, usersName, msgTitle, msgContent);

		// End transaction if we got this far.
		await this.commit();

		// Track them in our discord link databases too
		// Note: thread id is same as founder message id
		await this.put_topicIdPair(topicId, discordMessageObject.id);
		await this.put_msgIdPair(msgId, discordMessageObject.id);
	}

	async sync_newMsgInTopic(discordMessageObject) {
		// Get Mirrorer's name for the person who posted this
		const usersName = await this.get_discordMemberName(discordMessageObject.author.id);
		const msgContent = getForumReadyContent(discordMessageObject, usersName);

		// Get forum id of this thread/topic
		const topicId = await this.get_forumTopicId_fromDiscord(discordMessageObject.channelId);

		// Get the info we need about that topic
		const boardId = await this.get_forumBoardId_fromTopic(topicId);
		const msgTitle = await this.get_topicTitle_fromForumTopic(topicId);

		await this.beginTransaction();
		const msgId = await this.get_nextUnusedMsgId();

		// Add the new message and post to the database (using known board, topic, and msg IDs)
		await this.put_newMsg_setId(msgId, topicId, boardId, usersName, msgTitle, msgContent);

		// Update the latest message id in the topic row
		await this.update_forumTopic_wLatestMsg(topicId, msgId);

		await this.commit();

		// Track msg in our discord link database
		await this.put_msgIdPair(msgId, discordMessageObject.id);
	}

	async sync_updateMsg(discordMessageObject) {
		const msgId = await this.get_forumMsgId_fromDiscord(discordMessageObject.id);
		const usersName = await this.get_discordMemberName(discordMessageObject.author.id);
		const newBody = getForumReadyContent(discordMessageObject, usersName);

		this.update_forumMsg(msgId, usersName, newBody);
	}

	async sync_deleteMsg(discordMessageObject) {
		// Is it the first message in a topic? Then it can't be deleted
		const msgId = await this.get_forumMsgId_fromDiscord(discordMessageObject.id);
		const isTopic = await this.check_discordTopicMembership(discordMessageObject.id);
		if (isTopic) {
			const usersName = await this.get_discordMemberName(discordMessageObject.author.id);
			const newBody = `[size=1][i][Message from Discord user ${usersName}]\n\n[Message deleted][/i][/size]`;
			this.update_forumMsg(msgId, usersName, newBody);

			// throw new Error('First messages in topics cannot be deleted.');
		} else {
			// It is a topic body message: delete it from discordmirror_messages and itsa_messages

			// But first, if we need to update the latest message in topic field, do that.
			try {
				// If this does not raise an error, then the message is the last in the topic
				const topicId = await this.get_forumTopicId_fromLastMsg(msgId);
				// so the last message in topic field must be updated.
				this.update_forumTopic_deleteLatestMsg(topicId, msgId);

			} catch (err) {
				// This is not a latest message
			}

			this.delete_msgIdPair(msgId, discordMessageObject.id);
			this.delete_forumMsg(msgId);
		}
	}

	/* Functions on: discordmirror_members */
	async create_syncMemberTable() {
		return await this.conn.query('CREATE TABLE discordmirror_members('
            + 'discordid_member VARCHAR(30) PRIMARY KEY, '
            + 'discord_member_name VARCHAR(80) UNIQUE NOT NULL, '
            + 'date_registered DATE NOT NULL DEFAULT CURRENT_DATE);');
	}

	async get_discordMemberName(discordMemberId) {
		const usersName_qry = await this.conn.query(`SELECT discord_member_name FROM discordmirror_members WHERE discordid_member LIKE ${discordMemberId};`);
		if (usersName_qry.length === 0) {
			throw new Error(`Could not find a name for user ${discordMemberId}.`);
		}
		return usersName_qry[0].discord_member_name;
	}

	/* Functions on: discordmirror_boards */
	async create_syncBoardTable() {
		return await this.conn.query('CREATE TABLE discordmirror_boards('
            + 'discord_boardId VARCHAR(30) UNIQUE NOT NULL, '
            + 'forum_boardId SMALLINT(5) UNSIGNED PRIMARY KEY);');
	}

	async check_discordBoardMembership(discordChannelId) {
		const qry = await this.conn.query('SELECT EXISTS '
			+ `( SELECT 1 FROM discordmirror_boards WHERE discord_boardId LIKE '${discordChannelId}')`
			+ 'AS isMember;');
		// length == 0 should be impossible with this query
		/* if (qry.length === 0) {
			throw new Error(`Could not find board corresponding to Discord channel ${discordChannelId} in \`discordmirror_boards\``);
		}*/
		// returns 0 for no, 1 for yes
		return qry[0].isMember;
	}

	async get_forumBoardId_fromDiscord(discordBoardId) {
		const qry = await this.conn.query(`SELECT forum_boardId FROM discordmirror_boards WHERE discord_boardId LIKE '${discordBoardId}'`);
		if (qry.length === 0) {
			throw new Error(`Could not find board corresponding to Discord channel ${discordBoardId} in \`discordmirror_boards\``);
		}
		return qry[0].forum_boardId;
	}

	async get_discordBoardId_fromForum(forumBoardId) {
		const qry = await this.conn.query(`SELECT discord_boardId FROM discordmirror_boards WHERE forum_boardId = ${forumBoardId}`);
		if (qry.length === 0) {
			throw new Error(`Could not find Discord channel corresponding to board ${forumBoardId} in \`discordmirror_boards\``);
		}
		return qry[0].discord_boardId;
	}

	async get_forumBoardId_fromTopic(forumTopicId) {
		const qry = await this.conn.query(`SELECT id_board FROM itsa_topics WHERE id_topic=${forumTopicId};`);
		if (qry.length === 0) {
			throw new Error('Could not get board id.');
		}
		return qry[0].id_board;
	}

	async put_boardIdPair_byName(forumBoardName, discordBoardId) {
		const forumBoardId_qry = await this.conn.query(`SELECT id_board FROM itsa_boards WHERE name LIKE ${forumBoardName}`);
		if (forumBoardId_qry.length === 0) {
			throw new Error(`Could not find board with name ${forumBoardName}`);
		}
		const forumBoardId = forumBoardId_qry[0].id_board;

		return this.put_boardIdPair(forumBoardId, discordBoardId);
	}

	async put_boardIdPair(forumBoardId, discordBoardId) {
		const qry = await this.conn.query('INSERT INTO discordmirror_boards(forum_boardId, discord_boardId) '
            + `VALUES (${forumBoardId}, "${discordBoardId}");`);
		if (qry.constructor.name !== 'OkPacket') {
			throw new Error(`Insert (${forumBoardId}, "${discordBoardId}") into sync board table failed.`);
		}
		return qry;
	}

	/* Functions on: discordmirror_topics */
	async create_syncTopicTable() {
		return await this.conn.query('CREATE TABLE discordmirror_topics('
            + 'discord_topicId VARCHAR(30) UNIQUE NOT NULL, '
            + 'forum_topicId MEDIUMINT(8) UNSIGNED PRIMARY KEY);');
	}

	async get_forumTopicId_fromDiscord(discordTopicId) {
		const qry = await this.conn.query(`SELECT forum_topicId FROM discordmirror_topics WHERE discord_topicId LIKE '${discordTopicId}'`);
		if (qry.length === 0) {
			throw new Error(`Could not find topic corresponding to Discord thread ${discordTopicId} in \`discordmirror_topics\``);
		}
		return qry[0].forum_topicId;
	}

	async get_discordTopicId_fromForum(forumTopicId) {
		const qry = await this.conn.query(`SELECT discord_topicId FROM discordmirror_topics WHERE forum_topicId = ${forumTopicId}`);
		if (qry.length === 0) {
			throw new Error(`Could not find Discord thread corresponding to topic ${forumTopicId} in \`discordmirror_topics\``);
		}
		return qry[0].discord_topicId;
	}

	async get_forumTopicId_fromFirstMsg(forumMsgId) {
		const qry = await this.conn.query(`SELECT id_topic FROM itsa_topics WHERE id_first_msg=${forumMsgId};`);
		if (qry.length === 0) {
			throw new Error('Could not get topic id.');
		}
		return qry[0].id_topic;
	}

	async get_forumTopicId_fromLastMsg(forumMsgId) {
		const qry = await this.conn.query(`SELECT id_topic FROM itsa_topics WHERE id_last_msg=${forumMsgId};`);
		if (qry.length === 0) {
			throw new Error('Could not get topic id.');
		}
		return qry[0].id_topic;
	}

	async get_topicTitle_fromForumTopic(forumTopicId) {
		const qry = await this.conn.query('SELECT subject FROM itsa_messages WHERE id_msg IN '
			+ `(SELECT id_first_msg FROM itsa_topics WHERE id_topic=${forumTopicId});`);
		if (qry.length === 0) {
			throw new Error('Could not get topic title.');
		}
		return `Re: ${qry[0].id_topic}`;
	}

	async check_discordTopicMembership(discordChannelId) {
		const qry = await this.conn.query('SELECT EXISTS '
			+ `( SELECT 1 FROM discordmirror_topics WHERE discord_topicId LIKE '${discordChannelId}')`
			+ 'AS isMember;');
		// returns 0 for no, 1 for yes
		return qry[0].isMember;
	}

	async put_topicIdPair(forumTopicId, discordTopicId) {
		const qry = await this.conn.query('INSERT INTO discordmirror_topics (discord_topicId, forum_topicId) '
            + `VALUES (${discordTopicId}, ${forumTopicId}); `);
		if (qry.constructor.name !== 'OkPacket') {
			throw new Error('Database new topic link INSERT failed.');
		}
		return qry;
	}

	async put_newTopic(forumBoardId, startMsgId) {
		const qry = await this.conn.query('INSERT INTO itsa_topics'
            + '(id_board, id_first_msg, id_last_msg, id_member_started) '
            + `VALUES (${forumBoardId}, ${startMsgId}, ${startMsgId}, ${myForumId}); `);
		if (qry.constructor.name !== 'OkPacket') {
			throw new Error('Database new topic INSERT failed.');
		}
		return qry;
	}

	async update_forumTopic_wLatestMsg(forumTopicId, latestMsgId) {
		const qry = await this.conn.query('UPDATE itsa_topics '
			+ `SET id_last_msg = ${latestMsgId}, num_replies = num_replies + 1 `
			+ `WHERE id_topic = ${forumTopicId};`);
		if (qry.constructor.name !== 'OkPacket') {
			throw new Error('Database topic UPDATE failed.');
		}
		return qry;
	}

	async update_forumTopic_deleteLatestMsg(forumTopicId, latestMsgId) {
		// latestMsgId is going to be deleted.
		const predecessorMsg = await this.get_precedingMsg(latestMsgId);

		const qry = await this.conn.query('UPDATE itsa_topics '
			+ `SET id_last_msg = ${predecessorMsg}, num_replies = num_replies - 1 `
			+ `WHERE id_topic = ${forumTopicId};`);
		if (qry.constructor.name !== 'OkPacket') {
			throw new Error('Database topic UPDATE failed.');
		}
		return qry;
	}

	/* Functions on: discordmirror_messages */
	async create_syncMsgTable() {
		return await this.conn.query('CREATE TABLE discordmirror_messages('
            + 'discord_messageId VARCHAR(30) UNIQUE NOT NULL, '
            + 'forum_messageId int(10) UNSIGNED PRIMARY KEY);');
	}

	async get_nextUnusedMsgId() {
		const msgId_qry = await this.conn.query('SELECT auto_increment FROM information_schema.tables WHERE TABLE_NAME LIKE \'itsa_messages\';');
		if (msgId_qry.length === 0) {
			throw new Error('Could not get next message id.');
		}
		return msgId_qry[0].auto_increment;
	}

	async get_forumMsgId_fromDiscord(discordMsgId) {
		const qry = await this.conn.query(`SELECT forum_messageId FROM discordmirror_messages WHERE discord_messageId LIKE '${discordMsgId}'`);
		if (qry.length === 0) {
			throw new Error(`Could not find message corresponding to Discord message ${discordMsgId} in \`discordmirror_messages\``);
		}
		return qry[0].forum_messageId;
	}

	async get_discordMsgId_fromForum(forumMsgId) {
		const qry = await this.conn.query(`SELECT discord_messageId FROM discordmirror_messages WHERE forum_messageId = ${forumMsgId}`);
		if (qry.length === 0) {
			throw new Error(`Could not find Discord message corresponding to message ${forumMsgId} in \`discordmirror_messages\``);
		}
		return qry[0].discord_messageId;
	}

	async get_precedingMsg(forumMsgId) {
		// ASSUMES topic ids are unique even among multiple boards
		const qry = await this.conn.query('SELECT id_msg FROM itsa_messages WHERE ' +
			`poster_time < (SELECT poster_time FROM itsa_messages WHERE id_msg = ${forumMsgId} ) AND ` +
			`id_topic = (SELECT id_topic FROM itsa_messages WHERE id_msg = ${forumMsgId}) ` +
			'ORDER BY poster_time DESC LIMIT 1; ');
		if (qry.length === 0) {
			throw new Error(`Could not find preceding message in same topic as message ${forumMsgId}.`);
		}
		return qry[0].id_msg;
	}

	async check_discordMsgMembership(discordMsgId) {
		const qry = await this.conn.query('SELECT EXISTS '
			+ `( SELECT 1 FROM discordmirror_messages WHERE discord_messageId LIKE '${discordMsgId}')`
			+ 'AS isMember;');
		// returns 0 for no, 1 for yes
		return qry[0].isMember;
	}

	async put_msgIdPair(forumMsgId, discordMsgId) {
		const qry = await this.conn.query('INSERT INTO discordmirror_messages (discord_messageId, forum_messageId) '
            + `VALUES (${discordMsgId}, ${forumMsgId}); `);
		if (qry.constructor.name !== 'OkPacket') {
			throw new Error('Database new message link INSERT failed.');
		}
		return qry;
	}

	async delete_msgIdPair(forumMsgId, discordMsgId) {
		const qry = await this.conn.query('DELETE FROM discordmirror_messages '
            + `WHERE discord_messageId LIKE '${discordMsgId}' AND forum_messageID = ${forumMsgId}; `);
		if (qry.constructor.name !== 'OkPacket') {
			throw new Error('Database message link DELETE failed.');
		}
		return qry;
	}

	async put_newMsg(forumTopicId, forumBoardId, author, title, content) {
		const qry = await this.conn.query('INSERT INTO itsa_messages '
            + '(id_topic, id_board, poster_time, id_member, subject, poster_name, poster_email, body) '
            + `VALUES (${forumTopicId}, ${forumBoardId}, UNIX_TIMESTAMP(), `
            + `${myForumId}, ` + this.conn.escape(title) + ', ' + this.conn.escape(author) + ', '
			+ this.conn.escape(myEmail) + ', ' + this.conn.escape(content) + '); ');
		if (qry.constructor.name !== 'OkPacket') {
			throw new Error('Database new message INSERT failed.');
		}
		return qry;
	}

	async put_newMsg_setId(msgId, forumTopicId, forumBoardId, author, title, content) {
		const qry = await this.conn.query('INSERT INTO itsa_messages '
            + '(id_msg, id_topic, id_board, poster_time, id_member, subject, poster_name, poster_email, body) '
            + `VALUES (${msgId}, ${forumTopicId}, ${forumBoardId}, UNIX_TIMESTAMP(), `
            + `${myForumId}, ` + this.conn.escape(title) + ', ' + this.conn.escape(author) + ', '
			+ this.conn.escape(myEmail) + ', ' + this.conn.escape(content) + '); ');
		if (qry.constructor.name !== 'OkPacket') {
			throw new Error('Database new message INSERT failed.');
		}
		return qry;
	}

	async update_forumMsg(msgId, updaterName, content) {
		// ASSUMES THE PERSON EDITING IS ALWAYS THE SAME AS THE ORIGINAL AUTHOR
		const qry = await this.conn.query('UPDATE itsa_messages '
			+ 'SET body = ' + this.conn.escape(content) + ', modified_time = UNIX_TIMESTAMP(), modified_name = '
			+ this.conn.escape(updaterName) + ` WHERE id_msg = ${msgId};`);
		if (qry.constructor.name !== 'OkPacket') {
			throw new Error('Database message UPDATE failed.');
		}
		return qry;
	}

	async delete_forumMsg(msgId) {
		// ASSUMES YOU HAVE ALREADY CHECKED IT IS NOT A TOPIC STARTER
		const qry = await this.conn.query('DELETE FROM itsa_messages '
			+ `WHERE id_msg=${msgId}; `);
		if (qry.constructor.name !== 'OkPacket') {
			throw new Error('Database message DELETE failed.');
		}
		return qry;
	}
}
exports.SMFConnection = SMFConnection;