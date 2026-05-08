const { ChannelType } = require("discord.js");
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const VERIFICATION_LEVELS = {
  0: '`Keine`',
  1: '`Niedrig`',
  2: '`Mittel`',
  3: '`Hoch`',
  4: '`Sehr hoch`',
};

const BOOST_LEVELS = {
  0: '`Keine`',
  1: '`Level 1`',
  2: '`Level 2`',
  3: '`Level 3`',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('server-info')
    .setDescription('Zeigt detaillierte Informationen über diesen Server an.'),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const guild = interaction.guild;
      

      const owner = await guild.fetchOwner().catch(() => null);
      const members = guild.memberCount;
      const bots = guild.members.cache.filter(m => m.user.bot).size;
      const humans = members - bots;

      const textChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).size;
      const voiceChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size;
      const categoryChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size;
      const roles = guild.roles.cache.size - 1; // ohne @everyone
      const emojis = guild.emojis.cache.size;
      const stickers = guild.stickers.cache.size;
      const boosts = guild.premiumSubscriptionCount ?? 0;

      const createdAt = `<t:${Math.floor(guild.createdAt.getTime() / 1000)}:F>\n(<t:${Math.floor(guild.createdAt.getTime() / 1000)}:R>)`;

      const embed = new EmbedBuilder()
        .setTitle(`🏠 ${guild.name}`)
        .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
        .setImage(guild.bannerURL({ size: 1024 }) ?? null)
        .setColor('#5865F2')
        .addFields(
          {
            name: '🆔 Server ID',
            value: `\`${guild.id}\``,
            inline: true,
          },
          {
            name: '👑 Besitzer',
            value: owner ? `${owner.user.tag}\n(\`${owner.id}\`)` : '`Unbekannt`',
            inline: true,
          },
          {
            name: '📅 Erstellt am',
            value: createdAt,
            inline: true,
          },
          {
            name: '👥 Mitglieder',
            value: [
              `Gesamt: \`${members.toLocaleString('de-DE')}\``,
              `Menschen: \`${humans.toLocaleString('de-DE')}\``,
              `Bots: \`${bots.toLocaleString('de-DE')}\``,
            ].join('\n'),
            inline: true,
          },
          {
            name: '📂 Kanäle',
            value: [
              `Text: \`${textChannels}\``,
              `Voice: \`${voiceChannels}\``,
              `Kategorien: \`${categoryChannels}\``,
            ].join('\n'),
            inline: true,
          },
          {
            name: '🎭 Extras',
            value: [
              `Rollen: \`${roles}\``,
              `Emojis: \`${emojis}\``,
              `Sticker: \`${stickers}\``,
            ].join('\n'),
            inline: true,
          },
          {
            name: '🔒 Verifizierungsstufe',
            value: VERIFICATION_LEVELS[guild.verificationLevel] ?? '`Unbekannt`',
            inline: true,
          },
          {
            name: '🚀 Boost-Level',
            value: `${BOOST_LEVELS[guild.premiumTier] ?? '`Unbekannt`'} (\`${boosts}\` Boosts)`,
            inline: true,
          },
          {
            name: '📝 Beschreibung',
            value: guild.description ? `\`${guild.description}\`` : '`Keine Beschreibung`',
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
      console.error('[server-info] Fehler:', error);
      await interaction.editReply({
        content: '❌ Ein Fehler ist aufgetreten. Bitte versuche es erneut.',
      });
    }
  },
};

