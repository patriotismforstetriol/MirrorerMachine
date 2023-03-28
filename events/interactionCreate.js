const { Events } = require('discord.js');
const { SMFConnection } = require('../SMFlib.js');
const { guildRegisteredRole } = require('../config.json');

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
		if (interaction.isChatInputCommand()) {

			const command = interaction.client.commands.get(interaction.commandName);

			if (!command) {
				console.error(`No command matching ${interaction.commandName} was found.`);
				return;
			}

			try {
				await command.execute(interaction);
			} catch (error) {
				console.error(`Error executing ${interaction.commandName}`);
				console.error(error);
			}
		}

		if (interaction.isModalSubmit()) {
			if (interaction.customId === 'namemodal') {
				await interaction.deferReply({ ephemeral: true });
				const proposedName = await interaction.fields.getTextInputValue('nametaginput');
				try {
					// connect to database
					const db = await SMFConnection.SMFConnectionBuilder();

					const response = await db.sync_newName(proposedName, interaction.user.id);
					interaction.editReply(response);
					// give member the main interaction role
					interaction.member.roles.add(guildRegisteredRole);

					db.end();
				} catch (err) {
					console.log('Failed to connect to db due to ', err);
					await interaction.editReply('Failed to connect to my database!');
				}
			}
		}
	},
};
