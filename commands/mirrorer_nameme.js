const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('mirrorer_nameme')
		.setDescription('Set the name that MirrorerMachine will list as the author of your messages on the web forum.'),
	async execute(interaction) {
		// interaction.user is the object representing the User who ran the command
		// interaction.member is the GuildMember object, which represents the user in the specific guild
		// await interaction.reply(`This command was run by ${interaction.user.username}, who joined on ${interaction.member.joinedAt}.`);

		const row = new ActionRowBuilder()
			.addComponents(
				new TextInputBuilder()
					.setCustomId('nametaginput')
					.setLabel('What name should Mirrorer call you?')
					.setMaxLength(80)
					.setMinLength(1)
					.setRequired(true)
					.setValue(`${interaction.user.username}`)
					.setStyle(TextInputStyle.Short),
			);

		const modal = new ModalBuilder()
			.setCustomId('namemodal')
			.setTitle('Enter Name')
			.addComponents(row);

		await interaction.showModal(modal);
	},
};
