const { EmbedBuilder } = require('discord.js');
const { grantXp } = require('../utils/levelUtils');

module.exports = {
  name: 'messageCreate',

  async execute(message) {
    // Bots & DMs ignorieren
    if (message.author.bot || !message.guild) return;

    try {
      const { leveledUp, newLevel } = await grantXp(message.author.id, message.guild.id);

      if (!leveledUp) return;

      // Level-Up Nachricht
      const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('⬆️ Level Up!')
        .setDescription(
          `Herzlichen Glückwunsch ${message.author}! 🎉\n` +
          `Du hast **Level ${newLevel}** erreicht!`
        )
        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: message.guild.name, iconURL: message.guild.iconURL() })
        .setTimestamp();

      await message.channel.send({ embeds: [embed] }).catch(() => null);

    } catch (error) {
      console.error('[XP] Fehler beim Vergeben von XP:', error);
    }
  },
};
