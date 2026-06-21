const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Löscht eine bestimmte Anzahl an Nachrichten im Kanal')
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Anzahl der zu löschenden Nachrichten (1–100)')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true))
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Nur Nachrichten dieses Benutzers löschen (optional)')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const amount = interaction.options.getInteger('amount');
    const filterUser = interaction.options.getUser('user');

    await interaction.deferReply({ ephemeral: true });

    try {
      let messages = await interaction.channel.messages.fetch({ limit: 100 });

      // Filter auf bestimmten User, falls angegeben
      if (filterUser) {
        messages = messages.filter(msg => msg.author.id === filterUser.id);
      }

      // Nur die gewünschte Anzahl nehmen
      messages = messages.first(amount);

      // Discord erlaubt kein Bulk-Delete für Nachrichten älter als 14 Tage
      const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
      const deletable = messages.filter(msg => msg.createdTimestamp > twoWeeksAgo);
      const skipped = messages.length - deletable.length;

      if (deletable.length === 0) {
        return interaction.editReply({
          content: '❌ Keine löschbaren Nachrichten gefunden (evtl. älter als 14 Tage).',
        });
      }

      const deleted = await interaction.channel.bulkDelete(deletable, true);

      const embed = new EmbedBuilder()
        .setColor(0x00BFFF)
        .setTitle('🧹 Nachrichten gelöscht')
        .addFields(
          { name: '🗑️ Gelöscht', value: `${deleted.size} Nachricht(en)`, inline: true },
          { name: '🛡️ Moderator', value: `${interaction.user.tag}`, inline: true },
          { name: '📌 Kanal', value: `${interaction.channel}`, inline: true }
        );

      if (filterUser) {
        embed.addFields({ name: '👤 Gefilterter User', value: filterUser.tag, inline: true });
      }

      if (skipped > 0) {
        embed.addFields({
          name: '⚠️ Übersprungen',
          value: `${skipped} Nachricht(en) älter als 14 Tage konnten nicht gelöscht werden.`,
        });
      }

      embed.setTimestamp().setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() });

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('[CLEAR] Fehler:', error);
      return interaction.editReply({
        content: '❌ Beim Löschen der Nachrichten ist ein Fehler aufgetreten.',
      });
    }
  },
};

