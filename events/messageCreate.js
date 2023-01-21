const { Events } = require('discord.js');

module.exports = {
	name: Events.MessageCreate,
	async execute(message) {
		if (message.author.bot) return;

		if (message.content.length <= 81) {
			// if message length <= 81: start a thread with that message as both title and content
			await message.startThread({
				name: message.content,
			}).catch(console.error);

		} else {
			// if message is longer than that but the first line is in the right length:
			// first line is the title
			const firstLine = message.content.split(/\n(.*)/s);

			if (firstLine.length === 0 || firstLine[0] === undefined) return;

			if (firstLine[0].length <= 81) {
				await message.startThread({
					name: firstLine[0],
				}).catch(console.error);
			} else {
				// Otherwise cropped portion of post text is the title
				await message.startThread({
					name: `${(firstLine[0]).substring(0, 77)}...`,
				}).catch(console.error);
			}
		}

	},
};