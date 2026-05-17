'use strict';

/**
 * messageCreate.js
 * Event: Wird bei jeder neuen Nachricht ausgelöst.
 *
 * Reihenfolge:
 *   1. AutoMod Checks (Security System)
 *   2. XP vergeben (Level System)
 */

const { EmbedBuilder } = require('discord.js');
const { grantXp }      = require('../utils/levelUtils');
const {
  checkSpam,
  checkLinks,
  checkMentions,
  checkCaps,
} = require('../utils/securityManager');

module.exports = {
  name: 'messageCreate',

  async execute(message) {
    // Bots & DMs ignorieren
    if (message.author.bot || !message.guild) return;

    // ── AutoMod ──────────────────────────────────────────────────────────────
    // Checks laufen sequenziell – sobald einer greift wird gestoppt.
    // So werden keine doppelten Bestrafungen vergeben.
    try {
      if (await checkSpam(message))     return;
      if (await checkLinks(message))    return;
      if (await checkMentions(message)) return;
      if (await checkCaps(message))     return;
    } catch (err) {
      console.error('[AutoMod] Fehler im AutoMod-Check:', err);
      // AutoMod-Fehler blockiert NICHT das XP-System
    }

    // ── XP System ────────────────────────────────────────────────────────────
    try {
      const { leveledUp, newLevel } = await grantXp(message.author.id, message.guild.id);

      if (!leveledUp) return;

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
