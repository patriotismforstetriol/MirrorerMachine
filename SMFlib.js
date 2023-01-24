// Library functions for syncing between Simple Machines Forum and Discord server
const { Message } = require('discord.js');
const mariadb = require('mariadb');
const { dbUsername, dbHostname, dbPw, myForumId, myEmail } = require('./config.json');


/* GENERAL CATEGORY */

/** Converts a Discord message's content to a thread title/subject line */
function getSubjectLine(message) {
	// Check that 'message' is a discord.js message object
	if (!(message instanceof Message)) return undefined;

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
	return subjectline;
}
exports.getSubjectLine = getSubjectLine;

/** Adds an author disclaimer to the top of a Discord message string's content */
function getForumReadyContent(messageBody, author) {
	return `[size=1][i][Message from Discord user ${author}][/i][/size]\n\n${messageBody}`;
}
exports.getForumReadyContent = getForumReadyContent;

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

	async sync_newTopic(discordMessageObject) {
		// Get board ID of board that corresponds to this channel
		const board = await this.get_forumBoardId_fromDiscord(discordMessageObject.channelId);

		// Get Mirrorer's name for the person who posted this
		const usersName = await this.get_discordMemberName(discordMessageObject.author.id);
		const msgContent = getForumReadyContent(discordMessageObject.content, usersName);
		const msgTitle = getSubjectLine();

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
		const msgContent = getForumReadyContent(discordMessageObject.content, usersName);

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
		const newBody = getForumReadyContent(discordMessageObject.content, usersName);

		await this.update_forumMsg(msgId, usersName, newBody);
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
            + 'forum_boardId SMALLINT(5) UNSIGNED PRIMARY KEY, '
            + 'FOREIGN KEY (forum_boardId) REFERENCES itsa_boards(id_board));');
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
            + 'forum_topicId MEDIUMINT(8) UNSIGNED PRIMARY KEY, '
            + 'FOREIGN KEY (forum_topicId) REFERENCES itsa_boards(id_topic));');
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

	/* Functions on: discordmirror_messages */
	async create_syncMsgTable() {
		return await this.conn.query('CREATE TABLE discordmirror_messages('
            + 'discord_messageId VARCHAR(30) UNIQUE NOT NULL, '
            + 'forum_messageId int(10) UNSIGNED PRIMARY KEY, '
            + 'FOREIGN KEY (forum_messageId) REFERENCES itsa_messages(id_msg));');
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

	async put_newMsg(forumTopicId, forumBoardId, author, title, content) {
		const qry = await this.conn.query('INSERT INTO itsa_messages '
            + '(id_topic, id_board, poster_time, id_member, subject, poster_name, poster_email, body) '
            + `VALUES (${forumTopicId}, ${forumBoardId}, UNIX_TIMESTAMP(), `
            + `${myForumId}, '${title}', '${author}', '${myEmail}', '${content}'); `);
		if (qry.constructor.name !== 'OkPacket') {
			throw new Error('Database new message INSERT failed.');
		}
		return qry;
	}

	async put_newMsg_setId(msgId, forumTopicId, forumBoardId, author, title, content) {
		const qry = await this.conn.query('INSERT INTO itsa_messages '
            + '(id_msg, id_topic, id_board, poster_time, id_member, subject, poster_name, poster_email, body) '
            + `VALUES (${msgId}, ${forumTopicId}, ${forumBoardId}, UNIX_TIMESTAMP(), `
            + `${myForumId}, '${title}', '${author}', '${myEmail}', '${content}'); `);
		if (qry.constructor.name !== 'OkPacket') {
			throw new Error('Database new message INSERT failed.');
		}
		return qry;
	}

	async update_forumMsg(msgId, updaterName, content) {
		// ASSUMES THE PERSON EDITING IS ALWAYS THE SAME AS THE ORIGINAL AUTHOR
		const qry = await this.conn.query('UPDATE itsa_messages '
			+ `SET body = '${content}', modified_time = UNIX_TIMESTAMP(), modified_name = '${updaterName}' `
			+ `WHERE id_msg = ${msgId};`);
		if (qry.constructor.name !== 'OkPacket') {
			throw new Error('Database message UPDATE failed.');
		}
		return qry;
	}
}
exports.SMFConnection = SMFConnection;