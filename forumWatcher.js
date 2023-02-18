const { SMFConnection } = require('./SMFlib.js');

class forumWatcher {
	// Parameters: forumCheckInterval; watcherId; lastTick;
    forumCheckInterval = 3000;
    watcherId = undefined;
    client = undefined;
    lastTick = new Date(Date.UTC(0, 0, 0, 0, 0, 0));

	// Interval in ms
	constructor(client, interval = 3000) {
		this.forumCheckInterval = interval;
        this.client = client;
		if (this.watcherId === undefined) {
			this.watcherId = setInterval(this.watcherFunction.bind(this), this.forumCheckInterval);
			console.log('Forum watcher now running.');
		} else {
			console.log('Forum watcher already running.');
		}
	}

	setForumCheckInterval(to) {
		this.forumCheckInterval = to;
		if (this.watcherId !== undefined) {
			clearInterval(this.watcherId);
			this.watcherId = setInterval(this.watcherFunction.bind(this), this.forumCheckInterval);
		}
	}

	async watcherFunction() {
		try {
			const db = await SMFConnection.SMFConnectionBuilder();

			// Check if there have been any updates to database since last tick.
			const latestUpdate = await db.check_latestMessageTime();
			if (latestUpdate > this.lastTick) {
				const newForumPosts = await db.get_newForumPosts_sinceTime(this.lastTick);
				for (const newPost of newForumPosts) {
					await db.get_msgToShare(this.client, newPost); // have to await so thread starts exist before thread continuations
				}

				this.lastTick = latestUpdate;
			}
			// if yes, how many of those are forum-originating.
			// Iterate through them and post them to database

			await db.end();
		} catch (err) {
			console.log('Failed to connect to db due to ', err);
		}
		console.log(3);
	}
};
exports.forumWatcher = forumWatcher;