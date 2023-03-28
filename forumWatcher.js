const { SMFConnection } = require('./SMFlib.js');
const { forumCheckIntervalms } = require('./config.json');

class forumWatcher {
	// Parameters: forumCheckInterval; watcherId; lastTick;
    forumCheckInterval = forumCheckIntervalms;
    watcherId = undefined;
    client = undefined;
    lastTick = 0;
	watcherLock = false;

	// Interval in ms
	constructor(interval = 3000) {
		this.forumCheckInterval = interval;
		this.lastTick = Math.floor(Date.now() / 1000);
		this.watcherLock = true; // start inactivated.
	}

	setLastTick(lastTick = Math.floor(Date.now() / 1000)) {
		this.lastTick = lastTick;
	}

	startWatching(client) {
		this.client = client;
		if (this.watcherId === undefined) {
			this.watcherId = setInterval(this.watcherFunction.bind(this), this.forumCheckInterval);
			this.watcherLock = false;
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
			//const latestUpdate = await db.get_latestMessageTime().then((value) => { return Math.floor(value.getTime() / 1000); });
			const latestUpdateClock = await db.get_latestMessageTime();
			const latestUpdate = Math.floor(latestUpdateClock.getTime() / 1000);
			if (latestUpdate > this.lastTick) {
				await Promise.allSettled([
					this.spotNewMessages(db),
					this.spotUpdatedMessages(db),
					this.spotDeletedMessages(db)
				]);
				// Note: Promise.allSettled supresses error messages.
				/*await this.spotNewMessages(db);
				await this.spotUpdatedMessages(db);
				await this.spotDeletedMessages(db);*/
			}
			this.lastTick = latestUpdate;

			await db.end();
			this.watcherLock = false;
		} catch (err) {
			console.log('Failed to connect to db due to ', err);
			this.watcherLock = false;
		}

	}

	async spotNewMessages(db) {
		const newForumPosts = await db.get_newForumPosts_sinceTime(this.lastTick);
		for (const newPost of newForumPosts) {
			await db.syncF_newMsg(this.client, newPost); // have to await so thread starts exist before thread continuations
		}
	}

	async spotUpdatedMessages(db) {
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

	async spotDeletedMessages(db) {
		const deletedForumPosts = await db.get_unsyncedDeletedForumPosts();
		for (const deletedPost of deletedForumPosts) {
			await db.syncF_deleteMsg(this.client, deletedPost);
		}
		db.clear_unsyncedDeletionsTable();
	}
};
exports.forumWatcher = forumWatcher;