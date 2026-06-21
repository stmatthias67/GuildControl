const { ChannelType } = require("discord.js");
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('user-info')
    .setDescription('Zeigt Informationen über einen Benutzer an.')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Der Benutzer, dessen Infos angezeigt werden sollen.')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const target = interaction.options.getUser('user') ?? interaction.user;
      const member = await interaction.guild.members.fetch(target.id).catch(() => null);

      if (!member) {
        return interaction.editReply({
          content: '❌ Der Benutzer konnte nicht auf diesem Server gefunden werden.',
        });
      }

      // Rollen (ohne @everyone), sortiert nach Position
      const roles = member.roles.cache
        .filter(r => r.id !== interaction.guild.id)
        .sort((a, b) => b.position - a.position)
        .map(r => r.toString());

      const rolesDisplay =
        roles.length > 0
          ? roles.length > 10
            ? roles.slice(0, 10).join(', ') + ` und ${roles.length - 10} weitere`
            : roles.join(', ')
          : '`Keine Rollen`';

      // Nachrichten-Anzahl aus der DB holen (Platzhalter – eigene DB-Logik einfügen)
      let messageCount = 0;
      try {
        // Beispiel: const doc = await MessageModel.findOne({ userId: target.id, guildId: interaction.guild.id });
        // messageCount = doc?.count ?? 0;
        messageCount = 0; // Platzhalter
      } catch {
        messageCount = 0;
      }

      const joinedAt = member.joinedAt
        ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:F>\n(<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>)`
        : '`Unbekannt`';

      const createdAt = `<t:${Math.floor(target.createdAt.getTime() / 1000)}:F>\n(<t:${Math.floor(target.createdAt.getTime() / 1000)}:R>)`;

      const embed = new EmbedBuilder()
        .setTitle(`👤 ${member.displayName}`)
        .setThumbnail(target.displayAvatarURL({ dynamic: true, size: 256 }))
        .setColor(member.displayHexColor === '#000000' ? '#5865F2' : member.displayHexColor)
        .addFields(
          {
            name: '🆔 User ID',
            value: `\`${target.id}\``,
            inline: true,
          },
          {
            name: '🏷️ Tag',
            value: `\`${target.tag}\``,
            inline: true,
          },
          {
            name: '🤖 Bot',
            value: target.bot ? '`Ja`' : '`Nein`',
            inline: true,
          },
          {
            name: '📅 Account erstellt',
            value: createdAt,
            inline: true,
          },
          {
            name: '📥 Server beigetreten',
            value: joinedAt,
            inline: true,
          },
          {
            name: '💬 Nachrichten',
            value: `\`${messageCount.toLocaleString('de-DE')}\``,
            inline: true,
          },
          {
            name: `🎭 Rollen [${roles.length}]`,
            value: rolesDisplay,
            inline: false,
          }
        )
        .setFooter({
          text: `Angefragt von ${interaction.user.tag}`,
          iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('[user-info] Fehler:', error);
      await interaction.editReply({
        content: '❌ Ein Fehler ist aufgetreten. Bitte versuche es erneut.',
      });
    }
  },
};

