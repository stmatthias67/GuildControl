'use strict';

/**
 * verifyHandler.js
 * Verify-Button "✅ Verifizieren" (customId "securitysetup-verify-button").
 * Die customId bleibt so, weil bestehende Panels in Discord sie schon tragen.
 * Gibt die Verified-Rolle und entfernt ggf. die Unverified-Rolle.
 */

const SecurityConfig = require('../models/SecurityConfig');
const { logCatch } = require('../utils/errorLogger');

async function handleVerifyButton(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const cfg = await SecurityConfig.findOne({ guildId: interaction.guild.id });
    if (!cfg?.verification?.enabled || !cfg.verification.verifiedRoleId) {
      return interaction.editReply({ content: '❌ Verification ist nicht konfiguriert.' });
    }

    const member = interaction.member;

    if (member.roles.cache.has(cfg.verification.verifiedRoleId)) {
      return interaction.editReply({ content: '✅ Du bist bereits verifiziert!' });
    }

    const added = await member.roles.add(cfg.verification.verifiedRoleId, 'Verification').catch(logCatch('verifyHandler.add'));
    if (!added) {
      return interaction.editReply({ content: '❌ Verifikation fehlgeschlagen. Bitte melde dich beim Team.' });
    }

    if (cfg.verification.unverifiedRoleId) {
      await member.roles.remove(cfg.verification.unverifiedRoleId, 'Verification').catch(logCatch('verifyHandler.remove'));
    }

    await interaction.editReply({
      content: '✅ Du wurdest erfolgreich verifiziert! Willkommen auf dem Server.'
    });

  } catch (err) {
    console.error('[Security] handleVerifyButton:', err);
    await interaction.editReply({ content: '❌ Fehler bei der Verifikation.' }).catch(logCatch('verifyHandler.editReply'));
  }
}

module.exports = { handleVerifyButton };
