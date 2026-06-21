const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUserRank, getLevelProgress, buildProgressBar } = require('../utils/levelUtils');

// Farbe je nach Level
function getLevelColor(level) {
  if (level >= 50) return 0xFFD700; // Gold
  if (level >= 25) return 0xC0C0C0; // Silber
  if (level >= 10) return 0xCD7F32; // Bronze
  return 0x5865F2;                  // Standard Blau
}

// Badge je nach Level
function getLevelBadge(level) {
  if (level >= 50) return '👑';
  if (level >= 25) return '💎';
  if (level >= 10) return '🥇';
  if (level >= 5)  return '🥈';
  return '🥉';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Zeigt deinen aktuellen Rang und Level an')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Rang eines anderen Users anzeigen')
        .setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();

    const target = interaction.options.getUser('user') ?? interaction.user;
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    const { user, rank } = await getUserRank(target.id, interaction.guild.id);

    if (!user || user.xp === 0) {
      return interaction.editReply({
        content: `❌ **${target.username}** hat noch keine XP gesammelt.`,
      });
    }

    const { progressXp, neededXp, percent } = getLevelProgress(user);
    const bar = buildProgressBar(percent);
    const badge = getLevelBadge(user.level);
    const color = getLevelColor(user.level);
    const displayName = member?.displayName ?? target.username;

    const embed = new EmbedBuilder()
      .setColor(color)
      .setAuthor({
        name: `${badge} ${displayName}`,
        iconURL: target.displayAvatarURL({ dynamic: true, size: 128 }),
      })
      .setTitle('📊 Rang-Übersicht')
      .addFields(
        {
          name: '🏆 Rang',
          value: `**#${rank}** auf dem Server`,
          inline: true,
        },
        {
          name: '⭐ Level',
          value: `**${user.level}**`,
          inline: true,
        },
        {
          name: '✨ Gesamt XP',
          value: `**${user.xp.toLocaleString('de-DE')}** XP`,
          inline: true,
        },
        {
          name: `📈 Fortschritt zu Level ${user.level + 1}`,
          value: [
            `${bar} **${Math.round(percent * 100)}%**`,
            `\`${progressXp.toLocaleString('de-DE')} / ${neededXp.toLocaleString('de-DE')} XP\``,
          ].join('\n'),
        }
      )
      .setThumbnail(target.displayAvatarURL({ dynamic: true, size: 256 }))
      .setFooter({
        text: `${interaction.guild.name} • Level System`,
        iconURL: interaction.guild.iconURL(),
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

