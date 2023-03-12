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
	}

    async spotNewMessages() {
        console.log("Spotting!");
        try {
			const db = await SMFConnection.SMFConnectionBuilder();

            //const latestDMsg = db.get_discordMsgId_ofLatestDMsg();

            const watchedChannels = await db.get_dMirrBoards();
            for (const watchedChannel of watchedChannels) {
                const channel = await this.client.channels.fetch(watchedChannel.discord_boardId);

                const latestFMsgId = await db.get_msgId_oflatestDOriginal_inFBoard(watchedChannel.forum_boardId);
                if (latestFMsgId.length > 0) {
                    const latestDMsg = await db.get_discordMsgId_fromForum(latestFMsgId[0].id_msg);
                    console.log('Channel:', watchedChannel.discord_boardId, latestDMsg);

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
                    console.log('Topic:', watchedThread.discord_topicId, latestDMsg);

                    const newMessages = await channel.messages.fetch({after: latestDMsg});
                    for (const newMessage of newMessages.values()) {
                        if (newMessage.author.id !== clientId) {
                            await db.sync_newMsgInTopic(newMessage);
                            await message.react('🌐');
                        }
                    }
                }
            }

            db.end();
        } catch (err) {
            console.log('Failed to connect to db due to ', err);
        }
    }

}
exports.discordWatcher = discordWatcher;