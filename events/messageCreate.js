'use strict';

/**
 * messageCreate.js  — ERWEITERT
 *
 * Neu gegenüber der alten Version:
 *  - Übergibt channelId, memberRoles und member an grantXp()
 *  - Level-Up Nachricht respektiert RankConfig:
 *      • levelUp.enabled  → Nachrichten an/aus
 *      • levelUp.channelId → eigener Kanal oder aktueller Kanal
 *      • levelUp.message   → konfigurierbarer Text mit Platzhaltern
 *  - Rang-Rollen werden automatisch über checkAndAssignRankRoles() vergeben
 *    (das passiert bereits innerhalb von grantXp, braucht aber member)
 */

const { EmbedBuilder } = require('discord.js');
const { grantXp }      = require('../utils/levelUtils');
const RankConfig       = require('../models/RankConfig');
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
    try {
      if (await checkSpam(message))     return;
      if (await checkLinks(message))    return;
      if (await checkMentions(message)) return;
      if (await checkCaps(message))     return;
    } catch (err) {
      console.error('[AutoMod] Fehler im AutoMod-Check:', err);
    }

    // ── XP System ────────────────────────────────────────────────────────────
    try {
      const member      = message.member;
      const memberRoles = member?.roles?.cache?.map(r => r.id) ?? [];

      const { leveledUp, newLevel, blocked } = await grantXp(
        message.author.id,
        message.guild.id,
        {
          channelId:   message.channel.id,
          memberRoles,
          member,
        }
      );

      // Geblockt (disabled / cooldown / ignoriert) → nichts tun
      if (blocked || !leveledUp) return;

      // ── Level-Up Nachricht ────────────────────────────────────────────────
      const rankConfig = await RankConfig.findOne({ guildId: message.guild.id });

      // Nachrichten deaktiviert?
      if (rankConfig?.levelUp?.enabled === false) return;

      // Nachrichtentext mit Platzhaltern ersetzen
      const rawMsg = rankConfig?.levelUp?.message
        ?? '🎉 {user} hat **Level {level}** erreicht!';

      const levelUpText = rawMsg
        .replace(/{user}/g,     message.author.toString())
        .replace(/{username}/g, message.author.username)
        .replace(/{level}/g,    String(newLevel));

      // Embed bauen
      const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('⬆️ Level Up!')
        .setDescription(levelUpText)
        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: message.guild.name, iconURL: message.guild.iconURL() ?? undefined })
        .setTimestamp();

      // Ziel-Kanal bestimmen
      const targetChannelId = rankConfig?.levelUp?.channelId;
      const targetChannel   = targetChannelId
        ? (message.guild.channels.cache.get(targetChannelId) ?? message.channel)
        : message.channel;

      await targetChannel.send({ embeds: [embed] }).catch(() => null);

    } catch (error) {
      console.error('[XP] Fehler beim Vergeben von XP:', error);
    }
  },
};
