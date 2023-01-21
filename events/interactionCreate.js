const { Events } = require('discord.js');
const { pool } = require('../dbtest');
const { myDiscordAdmin, guildRegisteredRole } = require('../config.json');

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
				const proposedName = interaction.fields.getTextInputValue('nametaginput');
				try {
					// connect to database
					const conn = await pool.getConnection();
					await conn.query('USE forums;');

					// Check the user has not already set their name. For now name changes will be manual.
					const existingName = await conn.query(`SELECT discord_member_name FROM discordmirror_members WHERE discordid_member LIKE '${interaction.user.id}';`);
					if (existingName[0] !== undefined) {
						await interaction.editReply(`You requested I set your name as "${proposedName}", but your name is already set as "${existingName[0]['discord_member_name']}"! I am not currently permitted to change names. Contact my administrator <@${myDiscordAdmin}> to request a manual name change.`);
					} else {

						// check proposed name is unique among discord mirror users
						const rows = await conn.query(`SELECT discordid_member FROM discordmirror_members WHERE discord_member_name LIKE '${proposedName}';`);

						if (rows[0] === undefined) {
							// Add name and user to mirror database
							const insert = await conn.query(`INSERT INTO discordmirror_members (discordid_member, discord_member_name) VALUES ('${interaction.user.id}', '${proposedName}');`);
							if (insert.constructor.name !== 'OkPacket') {
								throw new Error('Database INSERT failed.');
							}
							// Give user main access role
							interaction.member.roles.add(guildRegisteredRole);
							await interaction.editReply(`"${proposedName}" has been set as your name. You now have access to the entire Discord server.`);
						} else {
							// Prompt user to try again with a different name
							await interaction.editReply(`The name "${proposedName}" is not available. Names need to be unique among members of this Discord server mirror! Please try the \\nameme command again with a different name.`);
						}

					}
					conn.end();
				} catch (err) {
					console.log('Failed to connect to db due to ', err);
					await interaction.editReply('Failed to connect to my database!');
				}
			}
		}
	},
};
