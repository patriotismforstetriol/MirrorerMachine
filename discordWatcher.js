const { SMFConnection } = require('./SMFlib.js');
const { clientId } = require('./config.json');

// Unlike forumWatcher, discordWatcher doesn't need a setInterval() waiting/checking loop.
// Discord sends event notifications for MessageCreate, MessageUpdate, and MessageDelete
// while the bot is running. To cover messages that come when the bot is offline, discordWatcher
// has a more involved constructor.
class discordWatcher {
    client = undefined;

	// Interval in ms
	constructor(client, lastTick = Math.floor(Date.now() / 1000)) {
        this.client = client;

        // Check for stuff that happened since last time
        this.spotNewMessages();
        this.spotDeletedAndUpdatedMessages(lastTick);
	}

    async spotNewMessages() {
        try {
			const db = await SMFConnection.SMFConnectionBuilder();

            //const latestDMsg = db.get_discordMsgId_ofLatestDMsg();

            const watchedChannels = await db.get_dMirrBoards();
            for (const watchedChannel of watchedChannels) {
                const channel = await this.client.channels.fetch(watchedChannel.discord_boardId);

                const latestFMsgId = await db.get_msgId_oflatestDOriginal_inFBoard(watchedChannel.forum_boardId);
                if (latestFMsgId.length > 0) {
                    const latestDMsg = await db.get_discordMsgId_fromForum(latestFMsgId[0].id_msg);

                    const newMessages = await channel.messages.fetch({after: latestDMsg});
                    for (const newMessage of newMessages.values()) {
                        if (newMessage.author.id !== clientId) {
                            await db.sync_newTopic(newMessage);
                            await message.react('🌐');
                        }
                    }
                }
            }

            const watchedThreads = await db.get_dMirrTopics();
            for (const watchedThread of watchedThreads) {
                let channel;
                try {
                    //Try statement because of possibility of something weird going on with deletions
                    channel = await this.client.channels.fetch(watchedThread.discord_topicId);
                } catch (err) {
                    console.log('D->F: Failed to check topic', watchedThread.forum_topicId, 'for new messages on startup.');
                    continue;
                }

                const latestFMsgId = await db.get_msgId_oflatestDOriginal_inFTopic(watchedThread.forum_topicId);
                if (latestFMsgId.length > 0) {
                    const latestDMsg = await db.get_discordMsgId_fromForum(latestFMsgId[0].id_msg);

                    const newMessages = await channel.messages.fetch({after: latestDMsg});
                    for (const newMessage of newMessages.values()) {
                        if (newMessage.author.id !== clientId) {
                            await db.sync_newMsgInTopic(newMessage);
                            await newMessage.react('🌐');
                        }
                    }
                }
            }

            db.end();
        } catch (err) {
            console.log('Failed to connect to db due to ', err);
        }
    }

    async spotDeletedAndUpdatedMessages(sinceTime) {
        try {
			const db = await SMFConnection.SMFConnectionBuilder();

            const extantMessages = await db.get_allMsgIds_ofDOriginals();
            for (const extantMsg of extantMessages) {
                try {
                    // Try to fetch Discord equivalent
                    let dmsg;
                    dmsg = await db.get_discordMessage_fromFIds(this.client, extantMsg.id_msg, extantMsg.id_topic, extantMsg.id_board);
                    if (dmsg === undefined) {
                        throw new Error('Not enough information to even delete this lost message');
                    } else if (dmsg.discordMsg === undefined) {
                        console.log(`D->F: Deleting msg ${extantMsg.id_msg} of ${extantMsg.id_topic} because msg not found in Discord.`);
                        // Fetch failed. We assume the message has been deleted, so should be cleared from the database
                        db.delete_msgIdPair(extantMsg.id_msg, dmsg.discordMsgId);
                        db.delete_forumMsg(extantMsg.id_msg);
                        if (dmsg.isTopicStarter) {
                            db.delete_topicIdPair(extantMsg.id_topic, dmsg.discordMsgId);
                            db.delete_forumTopic(extantMsg.id_topic);
                            db.delete_messagesInForumTopic(extantMsg.id_topic);
                        } else {
                            try {
                                // If this does not raise an error, then the message is the last in the topic
                                const topicId = await db.get_forumTopicId_fromLastMsg(extantMsg.id_msg);
                                // so the last message in topic field must be updated.
                                db.update_forumTopic_deleteLatestMsg(topicId, extantMsg.id_msg);

                            } catch (err) {
                                // This is not a latest message
                            }
                        }
                    } else if (dmsg.discordMsg.editedAt !== null &&
                        Math.floor(dmsg.discordMsg.editedAt.getTime() / 1000) >= sinceTime) {
                            // Otherwise, check if it was updated

                            //dmsg.discordMsg.reactions.cache.get('🌐').remove().catch((err) => console.log('->', err));
                            await dmsg.discordMsg.react('⏳');
                            db.sync_updateMsg(dmsg.discordMsg);
                            dmsg.discordMsg.reactions.cache.get('⏳').remove().catch((err) => console.log('->', err));
                            await dmsg.discordMsg.react('🌐');
                    }
                } catch (err) {
                    console.log('Error in checking message', extantMsg.id_msg, ':', err);
                }
            }

            db.update_DsyncTime();
            db.end();
        } catch (err) {
            console.log('Failed to connect to db due to ', err);
        }
    }

}
exports.discordWatcher = discordWatcher;