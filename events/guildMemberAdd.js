'use strict';

/**
 * guildMemberAdd.js
 * Event: Wird ausgelöst wenn ein neuer User dem Server beitritt.
 *
 * Zuständig für:
 *   1. Anti-Raid Check  → checkRaid()
 *   2. Verification     → Unverified-Rolle vergeben
 */

const SecurityConfig  = require("../models/SecurityConfig");
const { checkRaid }   = require("../utils/securityManager");

module.exports = {
  name: "guildMemberAdd",

  async execute(member) {
    if (!member.guild) return;

    try {
      // ── 1. Anti-Raid Check ─────────────────────────────────────────────────
      const raidDetected = await checkRaid(member);
      if (raidDetected) return; // Weitere Schritte bei Raid irrelevant

      // ── 2. Verification – Unverified-Rolle vergeben ────────────────────────
      const cfg = await SecurityConfig.findOne({ guildId: member.guild.id });
      if (!cfg?.enabled) return;
      if (!cfg.verification?.enabled) return;
      if (!cfg.verification.unverifiedRoleId) return;

      // Unverified-Rolle zuweisen damit neue Mitglieder den Server nicht sehen
      await member.roles
        .add(cfg.verification.unverifiedRoleId, "AutoMod: Unverified")
        .catch(err => console.error("[Security] Konnte Unverified-Rolle nicht vergeben:", err));

    } catch (err) {
      console.error("[Security] guildMemberAdd Fehler:", err);
    }
  }
};
