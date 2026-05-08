const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getLeaderboard, getLevelProgress, buildProgressBar } = require('../utils/levelUtils');

// Medaillen für die Top 3
const MEDALS = ['🥇', '🥈', '🥉'];

function getRankIcon(index) {
  return MEDALS[index] ?? `**\`#${index + 1}\`**`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Zeigt die Top 10 User dieses Servers'),

  async execute(interaction) {
    await interaction.deferReply();

    const topUsers = await getLeaderboard(interaction.guild.id, 10);

    if (!topUsers.length) {
      return interaction.editReply({
        content: '❌ Noch keine XP auf diesem Server gesammelt.',
      });
    }

    // Member-Tags aus Discord laden (gecacht oder gefetcht)
    const memberMap = new Map();
    await Promise.all(
      topUsers.map(async (u) => {
        const member = await interaction.guild.members.fetch(u.userId).catch(() => null);
        memberMap.set(u.userId, member);
      })
    );

    // Leaderboard-Einträge zusammenbauen
    const entries = topUsers.map((u, i) => {
      const member = memberMap.get(u.userId);
      const displayName = member?.displayName ?? `Unbekannt (${u.userId.slice(0, 6)}…)`;
      const { progressXp, neededXp, percent } = getLevelProgress(u);
      const bar = buildProgressBar(percent, 10);

      return [
        `${getRankIcon(i)} **${displayName}**`,
        `> Level **${u.level}** • ${u.xp.toLocaleString('de-DE')} XP`,
        `> ${bar} \`${progressXp}/${neededXp}\``,
      ].join('\n');
    });

    // Auf Felder aufteilen (Discord-Limit: 1024 Zeichen pro Field)
    const CHUNK_SIZE = 5;
    const fields = [];
    for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
      fields.push({
        name: i === 0 ? '🏆 Rangliste' : '​', // Zero-Width-Space für folgende Felder
        value: entries.slice(i, i + CHUNK_SIZE).join('\n\n'),
      });
    }

    // Eigenen Rang des aufrufenden Users ermitteln
    const ownRank = await require('../models/User').countDocuments({
      guildId: interaction.guild.id,
      xp: { $gt: (await require('../models/User').findOne({ userId: interaction.user.id, guildId: interaction.guild.id }))?.xp ?? 0 },
    }).catch(() => null);

    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle(`🏆 Leaderboard — ${interaction.guild.name}`)
      .setDescription(`Die aktivsten Mitglieder des Servers.\n*Letzte ${topUsers.length} Plätze werden angezeigt.*`)
      .addFields(fields)
      .setThumbnail(interaction.guild.iconURL({ dynamic: true, size: 256 }))
      .setFooter({
        text: ownRank !== null
          ? `Dein Rang: #${ownRank + 1} • ${interaction.guild.name}`
          : interaction.guild.name,
        iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

