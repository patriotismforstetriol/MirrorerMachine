const { myForumWatcher, myDiscordWatcher } = require("../events/ready");
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('mirrorer_syncsincetime')
		.setDescription('Force sync all Discord and forum messages more recent than the given time.')
		.addStringOption(option => option.setName('timestamp')
			.setDescription('Unix timestamp')
			.setRequired(true)),
	async execute(interaction) {
        console.log(myForumWatcher);

        const timeString = interaction.options.getString('timestamp');
        const timestamp = Math.floor(new Date(timeString).getTime() / 1000);
        if (isNaN(timestamp)) {
            interaction.reply({ content:'Error: Invalid time format. Must be a format Javascript Date() can deal with, eg "December 17, 1995 03:24:00".', ephemeral:true });
            return;
        }

        myForumWatcher.setLastTick(timestamp);
        myDiscordWatcher.syncEverythingSince(timestamp);
        interaction.reply({ content:('Successfully syncing everything from ' + timeString + ' onwards.'), ephemeral:true });
    }
};