'use strict';

/**
 * botRoleAssign.js
 * Event: Wird ausgelöst, wenn ein neuer Bot dem Server beitritt.
 * Vergibt automatisch die im Rollen-Setup konfigurierte "Bot"-Rolle.
 *
 * Eigenständige Datei, getrennt von guildMemberAdd.js (das ausschließlich
 * für Security/Verification zuständig ist), damit beide Systeme unabhängig
 * voneinander bleiben.
 */

const GuildConfig = require('../models/GuildConfig');

module.exports = {
  name: 'guildMemberAdd',

  async execute(member) {
    if (!member.guild) return;
    if (!member.user.bot) return; // nur für Bots relevant

    try {
      const guildConfig = await GuildConfig.findOne({ guildId: member.guild.id });
      const botRoleId = guildConfig?.roles?.bot;

      if (!botRoleId) return; // Bot-Rolle noch nicht im Rollen-Setup konfiguriert

      await member.roles
        .add(botRoleId, 'Automatische Bot-Rollen-Vergabe')
        .catch(err => console.error('[botRoleAssign] Konnte Bot-Rolle nicht vergeben:', err));

    } catch (err) {
      console.error('[botRoleAssign] Fehler:', err);
    }
  }
};