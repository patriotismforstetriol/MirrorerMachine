
const { SlashCommandBuilder } = require('discord.js');
const { SMFConnection } = require('../SMFlib.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('mirrorer_linkchannel')
		.setDescription('Link a Discord channel to a board.')
        .addIntegerOption(option => option.setName('fboard')
            .setDescription('The forum board to link.')
            .setRequired(true))
        .addChannelOption(option => option.setName('dchannel')
            .setDescription('The Discord channel to link.')
			.setRequired(true)),
	async execute(interaction) {
        // parse the forum board.
        //console.log(interaction.options.getInteger('fboard'), interaction.options.getChannel('dchannel'));

        try {
			const db = await SMFConnection.SMFConnectionBuilder();

            // check if a link already exists for either of them. If so, @pop up a confirmation
            const fhaslink = await db.query('SELECT 1 FROM discordmirror_boards WHERE forum_boardId = '
                + db.conn.escape(interaction.options.getInteger('fboard')) + ';');
            if (fhaslink !== undefined && fhaslink.length !== 0) {
                interaction.reply({ content:'Forum board ' + interaction.options.getInteger('fboard') + ' already has a Discord mirror: doing nothing.',
                                    ephemeral:true });
                return;
            }

            const dhaslink = await db.query('SELECT 1 FROM discordmirror_boards WHERE discord_boardId = '
                + db.conn.escape(interaction.options.getChannel('dchannel').id) + ';');
            if (dhaslink !== undefined && dhaslink.length !== 0) {
                interaction.reply({ content:'Discord channel ' + interaction.options.getChannel('dchannel').id + ' already has a forum mirror: doing nothing.',
                                    ephemeral:true });
                return;
            }

            // Add the discordmirror link.
            await db.query('INSERT INTO discordmirror_boards(forum_boardId, discord_boardId) VALUES '
                + '(' + interaction.options.getInteger('fboard')+ ',' + interaction.options.getChannel('dchannel').id + ');');

			db.end();
			return;

		} catch (err) {
			console.log('Failed to connect to db due to ', err);
		}

    }
};