// Library functions for syncing between Simple Machines Forum and Discord server
const { Message, Attachment } = require('discord.js');
const mariadb = require('mariadb');
const { dbUsername, dbHostname, dbPw, clientId, myForumId, myEmail } = require('./config.json');


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

	const boldItalicRegex = /\*\*\*(.*?)\*\*\*/g;
	const boldRegex = /\*\*(.*?)\*\*/g;
	const italicRegex = /(?:\*|_)(.*?)(?:\*|_)(?![^\[]*\])/g;
	const strikethroughRegex = /~~(.*?)~~/g;
	const underlineRegex = /__(.*?)__/g;
	// Multiline block quotes (>>> ) are just converted to consecutive lines of singleline (> ) quotes. As tested Feb 2023
	const lineQuoteRegex = /> (.*?)($|[\n\r])/g;
	const blockQuoteCleanupRegex = /\[\/quote\]\[quote\]/g;
	const lineCodeRegex = /`(.*?)`/g;

	// const imgRegex = /!\[(?:.*?)\]\((.*?)\)/g; // Discord does not support images
	// const urlRegex = /\[(.*?)\]\((.*?)\)/g; // Regular Discord messages don't support regular links
	// Url regex that should exclude phrasal punctuation (, .) at the end of url. Inspired by Niaz Mohammed https://stackoverflow.com/questions/1500260/detect-urls-in-text-with-javascript
	const urlRegex = /((https?|ftp|file):\/\/[-A-Za-z0-9+&@#/%?=~_|!:,.;()]+[-A-Za-z0-9+&@#\/%=~_|()])[.,):;\s]/g;
	const codeRegex = /```(?: *)\n(.*?)(?: *)\n```/g;

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

	// output = output.replace(imgRegex, '[img]$1[/img]');
	output = output.replace(urlRegex, '[iurl]$1[/iurl]');
	output = output.replace(codeRegex, '[code]$1[/code]');

	output = output.replace(boldItalicRegex, '[b][i]$1[/i][/b]');
	output = output.replace(underlineRegex, '[u]$1[/u]'); // must be before italics regex
	output = output.replace(boldRegex, '[b]$1[/b]');
	output = output.replace(italicRegex, '[i]$1[/i]');
	output = output.replace(strikethroughRegex, '[s]$1[/s]');
	output = output.replace(lineQuoteRegex, '[quote]$1[/quote]');
	output = output.replace(blockQuoteCleanupRegex, '\n');
	output = output.replace(lineCodeRegex, '[pre]$1[/pre]');

	if (realattachs.length > 0) {
		return `[size=1][i][Message from Discord user ${author}][/i][/size]\n\n${realattachs.join('\n')}\n${output}`;
	} else {
		return `[size=1][i][Message from Discord user ${author}][/i][/size]\n\n${output}`;
	}
}
exports.getForumReadyContent = getForumReadyContent;

function getDiscordReadyContent(messageContent, author) {
	// BBCode tags without discord equivalents:
	// Center; email; flash; font; ftp; glow; move; nobbc; left; right; size; subscript; superscript; tables

	// BBCode tags with Discord equivalents:
	// Bold; italics; strikethrough; underline; monospace; image; url; member link; multiline quote; multiline code;

	const boldRegex = /\[b\](.*?)\[\/b\]/g;
	const italicRegex = /\[i\](.*?)\[\/i\]/g;
	const strikethroughRegex = /\[s\](.*?)\[\/s\]/g;
	const underlineRegex = /\[u\](.*?)\[\/u\]/g;
	const lineCodeRegex = /\[pre\](.*?)\[\/pre\]/g;

	const imgRegex = /\[img(.*)\](.*?)\[\/img\]/g;
	const urlRegex = /\[url=("?)?(.*?)("?)?\](.*?)\[\/url\]/g;
	const urlRegex2 = /\[iurl\](.*?)\[\/iurl\]/g;
	const memberRegex = /\[member=(.*?)\](.*?)\[\/member\]/g;

	// Multiline block quotes (>>> ) are just converted to consecutive lines of singleline (> ) quotes. As tested Feb 2023
	const quoteRegex = /\[quote\](.*?)\[\/quote\]/gs;
	const codeRegex = /\[code\](.*?)\[\/code\]/gs;

	let output = messageContent;

	// Attachments just exist as links I believe. @ check this fact.

	output = output.replace(/<br>/g, '\n');
	output = output.replace(/&nbsp;?/g, ' ');
	output = output.replace(/&amp;?/g, '&');
	output = output.replace(/&lt;?/g, '<');
	output = output.replace(/&gt;?/g, '>');
	output = output.replace(/&quot;?/g, '"');
	output = output.replace(/&#[0]?39;?/g, '\'');

	output = output.replace(imgRegex, '$2 ');
	output = output.replace(urlRegex, '$4 ($2) ');
	output = output.replace(urlRegex2, '$1 ');
	output = output.replace(codeRegex, '```\n$1\n``` ');
	output = output.replace(quoteRegex, (match, capture1, offset, fullString) => {
		const formattedQuote = capture1.trim().replace(/[\n\r]/gs, '\n> ');
		// return fullString.slice(0,offset) + '> ' + formattedQuote + '\n' + fullString.slice(offset + match.length);
		return '> ' + formattedQuote + '\n';
	});

	output = output.replace(underlineRegex, '__$1__');
	output = output.replace(boldRegex, '**$1**');
	output = output.replace(italicRegex, '*$1*');
	output = output.replace(strikethroughRegex, '~~$1~~');
	output = output.replace(lineCodeRegex, '`$1`');
	output = output.replace(memberRegex, `@$2 (${dbHostname}/forums/index.php?action=profile;u=$1)`);

	return `*[Message from forum user ${author}]*\n\n${output}`;
}

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
		this.create_syncMemberTable().then((value) => {
			if (value.constructor.name !== 'OkPacket') {
				throw new Error('Sync member table creation failed.');
			}
		});

		this.create_syncBoardTable().then((value) => {
			if (value.constructor.name !== 'OkPacket') {
				throw new Error('Sync boards table creation failed.');
			}
		});

		this.create_syncTopicTable().then((value) => {
			if (value.constructor.name !== 'OkPacket') {
				throw new Error('Sync topic table creation failed.');
			}
		});

		this.create_syncMsgTable().then((value) => {
			if (value.constructor.name !== 'OkPacket') {
				throw new Error('Sync messages table creation failed.');
			}
		});

		this.create_unsyncedDeletionsTable().then((value) => {
			if (value.constructor.name !== 'OkPacket') {
				throw new Error('Unsynced deletions table creation failed.');
			}
		});

		this.create_lastSyncsTable().then((value) => {
			if (value.constructor.name !== 'OkPacket') {
				throw new Error('Last sync times table creation failed.');
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

		this.update_boardStats(board);

		// Track them in our discord link databases too
		// Note: thread id is same as founder message id
		this.put_topicIdPair(topicId, discordMessageObject.id);
		this.put_msgIdPair(msgId, discordMessageObject.id);
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

		await this.update_boardStats(boardId);

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

		const boardId = await this.get_forumBoardId_fromDiscord(discordMessageObject.channelId);
		await this.update_boardStats(boardId);
	}

	/* Functions on: discordmirror_members */
	async create_syncMemberTable() {
		return this.conn.query('CREATE TABLE discordmirror_members('
            + 'discordid_member VARCHAR(30) PRIMARY KEY, '
            + 'discord_member_name VARCHAR(80) UNIQUE NOT NULL, '
            + 'date_registered DATE NOT NULL DEFAULT CURRENT_DATE);');
	}

	async create_unsyncedDeletionsTable() {
		return this.conn.query('CREATE TABLE discordmirror_unsynced_deletions('
            + 'forum_messageId int(10) UNSIGNED PRIMARY KEY, '
            + 'forum_topicId MEDIUMINT(8) UNSIGNED NOT NULL, '
			+ 'forum_boardId SMALLINT(5) UNSIGNED NOT NULL);'
			).then((value) => {
				if (value.constructor.name !== 'OkPacket') {
					return value;
				} else {
					return this.conn.query('CREATE TRIGGER FMsgDelete AFTER DELETE ON itsa_messages '
					+ 'FOR EACH ROW INSERT INTO discordmirror_unsynced_deletions(forum_messageId, forum_topicId, forum_boardId) '
					+ 'VALUES (old.id_msg, old.id_topic, old.id_board);');
				}
			}).then((value) => {
				if (value.constructor.name !== 'OkPacket') {
					return value;
				} else {
					return this.conn.query(`GRANT DROP ON TABLE discordmirror_unsynced_deletions TO '${dbUsername}'@'%';`); //@@ safety of this line
				}
			});
	}

	async create_lastSyncsTable() {
		return this.conn.query('CREATE TABLE discordmirror_lastsyncs('
			+ 'forum BOOLEAN PRIMARY KEY, '
			+ 'sync_time int(10) UNSIGNED DEFAULT 0);'
			).then((value) => {
				if (value.constructor.name !== 'OkPacket') {
					return value;
				} else {
					return this.conn.query('INSERT INTO discordmirror_lastsyncs(forum, sync_time) '
						+ 'VALUES (TRUE,0), (FALSE,0);');
				}
			});
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
		const qry = await this.conn.query(`SELECT discord_boardId FROM discordmirror_boards WHERE forum_boardId = ${forumBoardId};`);
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

	async update_boardStats(forumBoardId) {
		// Query duplicates finding latest message. Not sure that's good.
		const qry = await this.conn.query('UPDATE itsa_boards '
			+ `SET id_last_msg = (SELECT id_msg FROM itsa_messages WHERE id_board = ${forumBoardId} ORDER BY poster_time DESC LIMIT 1), `
			+ `id_msg_updated = (SELECT id_msg FROM itsa_messages WHERE id_board = ${forumBoardId} ORDER BY poster_time DESC LIMIT 1), `
			+ `num_topics = (SELECT COUNT(*) FROM itsa_topics WHERE id_board = ${forumBoardId}), `
			+ `num_posts = (SELECT COUNT(*) FROM itsa_messages WHERE id_board = ${forumBoardId}) `
			+ `WHERE id_board = ${forumBoardId};`);
		if (qry.constructor.name !== 'OkPacket') {
			throw new Error('Database board UPDATE failed.');
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
		return `Re: ${qry[0].subject}`;
	}

	async check_discordTopicMembership(discordChannelId) {
		const qry = await this.conn.query('SELECT EXISTS '
			+ `( SELECT 1 FROM discordmirror_topics WHERE discord_topicId LIKE '${discordChannelId}')`
			+ 'AS isMember;');
		// returns 0 for no, 1 for yes
		return qry[0].isMember;
	}

	async check_forumTopicMembership(forumTopicId) {
		const qry = await this.conn.query('SELECT EXISTS '
			+ `( SELECT 1 FROM discordmirror_topics WHERE forum_topicId = ${forumTopicId})`
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

	async delete_topicIdPair(forumTopicId, discordTopicId) {
		const qry = await this.conn.query('DELETE FROM discordmirror_topics '
            + `WHERE discord_topicId LIKE '${discordTopicId}' AND forum_topicID = ${forumTopicId}; `);
		if (qry.constructor.name !== 'OkPacket') {
			throw new Error('Database message link DELETE failed.');
		}
		return qry;
	}

	async put_newMsg(forumTopicId, forumBoardId, author, title, content) {
		const qry = await this.conn.query('INSERT INTO itsa_messages '
            + '(id_topic, id_board, discord_original, poster_time, id_member, subject, poster_name, poster_email, body) '
            + `VALUES (${forumTopicId}, ${forumBoardId}, TRUE, UNIX_TIMESTAMP(), `
            + `${myForumId}, ` + this.conn.escape(title) + ', ' + this.conn.escape(author) + ', '
			+ this.conn.escape(myEmail) + ', ' + this.conn.escape(content) + '); ');
		if (qry.constructor.name !== 'OkPacket') {
			throw new Error('Database new message INSERT failed.');
		}
		return qry;
	}

	async put_newMsg_setId(msgId, forumTopicId, forumBoardId, author, title, content) {
		const qry = await this.conn.query('INSERT INTO itsa_messages '
            + '(id_msg, id_topic, id_board, discord_original, poster_time, id_member, subject, poster_name, poster_email, body) '
            + `VALUES (${msgId}, ${forumTopicId}, ${forumBoardId}, TRUE, UNIX_TIMESTAMP(), `
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

	async get_latestMessageTime() {
		const qry = await this.conn.query('SELECT update_time FROM information_schema.tables '
			+ 'WHERE TABLE_SCHEMA = \'forums\' AND TABLE_name = \'itsa_messages\';');
		if (qry.length === 0) {
			throw new Error('Could not find latest message sent time.');
		}
		return qry[0].update_time;
	}

	async get_newForumPosts_sinceTime(time) {
		const qry = await this.conn.query('SELECT * FROM itsa_messages WHERE ' +
			`poster_time > ${time} AND ` +
			'id_msg NOT IN (SELECT forum_messageId FROM discordmirror_messages) AND ' +
			'discord_original IS FALSE ORDER BY poster_time ASC; ');
		return qry;
	}

	async get_updatedForumPosts_sinceTime(time) {
		const qry = await this.conn.query('SELECT * FROM itsa_messages WHERE ' +
			`modified_time <> 0 AND modified_time > ${time} AND ` +
			'id_msg IN (SELECT forum_messageId FROM discordmirror_messages) AND ' +
			'discord_original IS FALSE ORDER BY poster_time ASC; ');
		return qry;
	}

	/* async get_syncTime_ofForumMsg(forumMsgId) {
		const qry = await this.conn.query('SELECT sync_time FROM discordmirror_messages WHERE ' +
			`forum_messageId = ${forumMsgId};`);
		return qry;
	}*/

	async get_DHome_fromFTopic(FTopicId) {
		// Get Discord home (channel if thread needs to be started, thread if thread continuer)
		// of a forum thread

		// If we are a thread starter (that is, our thread Id doesn't exist in discordmirror_)
		const hasExistingThread = await this.check_forumTopicMembership(FTopicId);

		if (hasExistingThread) {
			// We are a thread continuer. Find discord thread.
			// This call could fail if we are trying to add this message before its thread starter.
			// Hence the try statement. If it fails we'll try again next round.
			return await this.get_discordTopicId_fromForum(FTopicId);

		} else {
			// Find the discord channel corresponding to the right board
			return await this.get_discordBoardId_fromForum(FTopicId);

		}
	}

	async syncF_newMsg(client, msg) {
		console.log('Creating msg ', msg.id_msg, 'of topic', msg.id_topic);
		// Step 1: Get DHome of msg's Topic.

		let dHome = undefined;
		// If we are a thread starter (that is, our thread Id doesn't exist in discordmirror_)
		const hasExistingThread = await this.check_forumTopicMembership(msg.id_topic);

		try {
			if (hasExistingThread) {
				// We are a thread continuer. Find discord thread.
				// This call could fail if we are trying to add this message before its thread starter.
				// Hence the try statement. If it fails we'll try again next round.
				dHome = await this.get_discordTopicId_fromForum(msg.id_topic);

			} else {
				// Find the discord channel corresponding to the right board
				dHome = await this.get_discordBoardId_fromForum(msg.id_board);
			}
		} catch (err) {
			console.log('Could not find a place to put message ', msg.id_msg);
		}

		// Step 2: post the message
		const topic = await client.channels.fetch(dHome).catch(err => console.log('Could not find thread channel due to ', err));
		const content = getDiscordReadyContent(msg.body, msg.poster_name); //@
		const dmsg = await topic.send(content);
		await this.put_msgIdPair(msg.id_msg, dmsg.id);

		// Step 3: Start thread if it was a thread starter
		if (!hasExistingThread) {
			// Make a thread corresponding to the topic
			await Promise.allSettled([
				dmsg.startThread({ name: msg.subject }).catch(console.error),
				this.put_topicIdPair(msg.id_topic, dmsg.id),
			]);
		}

		this.update_FsyncTime(msg.id_msg);
	}

	static async get_discordMessage(client, channelId, messageId) {
		const channel = await client.channels.fetch(channelId);
		if (channel === undefined || channel.constructor.name === 'Collection') {
			throw new Error(`Could not find specific channel id ${channelId}`);
		}

		const targetMsg = await channel.messages.fetch(messageId);
		if (targetMsg === undefined || targetMsg.constructor.name === 'Collection') {
			throw new Error(`Could not find specific message id ${messageId}`);
		} else {
			return targetMsg;
		}
	}

	async update_FsyncTime() {
		return await this.conn.query('UPDATE discordmirror_lastsyncs SET '
			+ 'sync_time = UNIX_TIMESTAMP() '
			+ 'WHERE forum IS TRUE;');
	}

	async update_DsyncTime() {
		return await this.conn.query('UPDATE discordmirror_lastsyncs SET '
			+ 'sync_time = UNIX_TIMESTAMP() '
			+ 'WHERE forum IS FALSE;');
	}

	async get_FLastSyncTime() {
		return await this.conn.query('SELECT sync_time FROM discordmirror_lastsyncs '
			+ 'WHERE forum IS TRUE;').then((value) => { return value[0].sync_time; } );
	}

	async get_DLastSyncTime() {
		return await this.conn.query('SELECT sync_time FROM discordmirror_lastsyncs '
			+ 'WHERE forum IS FALSE;').then((value) => { return value[0].sync_time; } );
	}

	async syncF_update(client, msg) {
		console.log('Updating msg ', msg.id_msg, 'of topic', msg.id_topic);
		// get the Discord message object, then substitute the content in that message with the updated contents
		let discordChannelId = await this.get_discordTopicId_fromForum(msg.id_topic);
		const discordMessageId = await this.get_discordMsgId_fromForum(msg.id_msg);
		if (discordChannelId === discordMessageId) {
			// then this is a thread starter so channel needs to be a discord channel, not a thread ID
			discordChannelId = await this.get_discordBoardId_fromForum(msg.id_board);
		}
		const discordMsg = await SMFConnection.get_discordMessage(client, discordChannelId, discordMessageId);

		const content = getDiscordReadyContent(msg.body, msg.poster_name);

		if (discordMsg.author.id === clientId) {
			// we can only update the message if Mirrorer is the original author.
			discordMsg.edit(content);
		} else {
			console.log(`Could not sync forum edit of Discord message ${discordChannelId}/${discordMessageId}` +
				' because the post is a Discord original.');
		}

		this.update_FsyncTime();
	}

	async get_unsyncedDeletedForumPosts() {
		return this.conn.query('SELECT * FROM discordmirror_unsynced_deletions;');
	}

	async clear_unsyncedDeletionsTable() {
		const qry = await this.conn.query('TRUNCATE discordmirror_unsynced_deletions;');
		if (qry.constructor.name !== 'OkPacket') {
			throw new Error('Database table TRUNCATE failed.');
		}
		return qry;
	}

	async get_nMsgsInTopic(forum_topicId) {
		return this.conn.query(`SELECT COUNT(*) AS count FROM itsa_messages WHERE id_topic = ${forum_topicId};`).then((value) => { return value.count; } );
	}

	async get_deletedMsgsOfSameTopic(forum_topicId) {
		return this.conn.query(`SELECT * FROM discordmirror_unsynced_deletions WHERE forum_topicId = ${forum_topicId};`);
	}

	async syncF_deleteMsg(client, msg) {
		console.log('Deleting msg', msg.forum_messageId, 'of topic', msg.forum_topicId);

		let dMsgId = undefined;
		try {
			dMsgId = await this.get_discordMsgId_fromForum(msg.forum_messageId);
		} catch (err) {
			console.log("-> Mirror of message", msg.forum_messageId, "is not known or already deleted.");
			return;
		}

		let dHome = await this.get_discordTopicId_fromForum(msg.forum_topicId);

		if (dHome === dMsgId) {
			// We are a thread starter. Find discord thread.
			// Find the discord channel corresponding to the right board
			dHome = await this.get_discordBoardId_fromForum(msg.forum_boardId);
			const dMsg = await SMFConnection.get_discordMessage(client, dHome, dMsgId);

			/*  incorrect, this is not what SMF does
			// We are a topic starter. Does the topic have any other posts?
			// If so, do not allow complete deletion.
			const topicLength = await this.get_nMsgsInTopic(msg.forum_topicId);
			if (topicLength > 0) {
				// Do not allow complete deletion:
				if (dMsg.author.id === clientId) {
					// we can only update the message if Mirrorer is the original author.
					dMsg.edit("*[Message deleted]*");
				} else {
					console.log(`Could not sync deletion of Discord message ${dHome}/${dMsgId}` +
						' because the post is a Discord original.');
				}


			} else {
				dMsg.delete();
				this.delete_topicIdPair(msg.forum_topicId, dMsgId);

			}*/
			const deletedInSameThread = await this.get_deletedMsgsOfSameTopic(msg.forum_topicId);
			for (const deletedMsg of deletedInSameThread) {
				let deletedDMsgId = undefined;
				try {
					deletedDMsgId = await this.get_discordMsgId_fromForum(deletedMsg.forum_messageId);

					// Deleting it in Discord is unecessary: it will already be gone
					//const deletedDMsg = await SMFConnection.get_discordMessage(client, dHome, deletedDMsgId);
					//deletedDMsg.delete();
					this.delete_msgIdPair(deletedMsg.forum_messageId, deletedDMsgId);
				} catch (err) {
					console.log("-> Mirror of message ", deletedMsg.forum_messageId, "tbat should be in same topic is not known or already deleted.");
				}

			}

			// Then delete me.
			dMsg.delete();
			this.delete_topicIdPair(msg.forum_topicId, dMsgId);

		} else {
			// Thread continuer
			const dMsg = await SMFConnection.get_discordMessage(client, dHome, dMsgId);
			dMsg.delete();
		}

		this.delete_msgIdPair(msg.forum_messageId, dMsgId);

		this.update_FsyncTime();

	}
}
exports.SMFConnection = SMFConnection;