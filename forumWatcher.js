const { SMFConnection } = require('./SMFlib.js');

class forumWatcher {
	// Parameters: forumCheckInterval; watcherId; lastTick;
    forumCheckInterval = 3000;
    watcherId = undefined;
    client = undefined;
    lastTick = new Date(Date.UTC(0, 0, 0, 0, 0, 0));
	watcherLock = false;

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
		if (this.watcherLock === true) {
			return;
		} else {
			this.watcherLock = true;
		}
		try {
			const db = await SMFConnection.SMFConnectionBuilder();

			// Check if there have been any updates to database since last tick.
			const latestUpdate = await db.get_latestMessageTime();
			if (latestUpdate > this.lastTick) {
				const newForumPosts = await db.get_newForumPosts_sinceTime(this.lastTick);
				for (const newPost of newForumPosts) {
					await db.syncF_newMsg(this.client, newPost); // have to await so thread starts exist before thread continuations
				}

				// How to do updated posts?
				// Don't want to process text contents every time.
				// 1. Have a time updated field in discordmirror_messages; only update if update time is sooner than that
				// 2.
				const updatedForumPosts = await db.get_updatedForumPosts_sinceTime(this.lastTick);
				for (const updatedPost of updatedForumPosts) {
					// add sync time check.
					//updatedPost.modified_time

					// Small chance if someone edits their message faster than our forumCheckInterval that
					// we'll then process the post twice. But don't forsee that being too much of a problem.

					db.syncF_update(this.client, updatedPost);
				}
			}
			this.lastTick = latestUpdate;
			// if yes, how many of those are forum-originating.
			// Iterate through them and post them to database

			await db.end();
			this.watcherLock = false;
		} catch (err) {
			console.log('Failed to connect to db due to ', err);
			this.watcherLock = false;
		}
		console.log(this.watcherLock, this.lastTick);
	}
};
exports.forumWatcher = forumWatcher;