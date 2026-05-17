'use strict';

/**
 * setupHandler.js
 * Zentraler Router für alle Setup-Interaktionen.
 *
 * Präfixe:
 *   role-setup-*       → roleSetup.js
 *   ticketsetup-*      → ticketHandler.js
 *   ticket-*           → ticketHandler.js
 *   securitysetup-*    → securitySetupHandler.js
 *   setup-*            → Haupt-Setup (dieses File)
 */

const GuildConfig = require("../models/GuildConfig");
const { startRoleSetup, handleRoleSetupInteraction } = require("./roleSetup");
const { showSetupOverview: showTicketSetup, execute: handleTicketInteraction } = require("./ticketHandler");
const { showSetupOverview: showSecuritySetup, execute: handleSecurityInteraction } = require("./securitySetupHandler");

module.exports = {
  name: "interactionCreate",

  async execute(interaction, client) {

    if (
      !interaction.isButton() &&
      !interaction.isStringSelectMenu() &&
      !interaction.isRoleSelectMenu() &&
      !interaction.isChannelSelectMenu() &&
      !interaction.isModalSubmit()
    ) return;

    const id = interaction.customId;

    // ── Role Setup ────────────────────────────────────────────────────────────
    if (id.startsWith("role-setup-")) {
      return handleRoleSetupInteraction(interaction);
    }

    // ── Ticket System (Setup + Live) ──────────────────────────────────────────
    if (id.startsWith("ticketsetup-") || id.startsWith("ticket-")) {
      return handleTicketInteraction(interaction, client);
    }

    // ── Security System ───────────────────────────────────────────────────────
    if (id.startsWith("securitysetup-")) {
      return handleSecurityInteraction(interaction, client);
    }

    // ── Setup Haupt-Menü ──────────────────────────────────────────────────────
    if (interaction.isStringSelectMenu() && id === "setup-menu") {
      const value = interaction.values[0];

      if (value === "roles") {
        return startRoleSetup(interaction);
      }

      if (value === "tickets") {
        return showTicketSetup(interaction);
      }

      if (value === "security") {
        return showSecuritySetup(interaction);
      }

      // Platzhalter für noch nicht implementierte Systeme
      const placeholders = {
        voice:        "🔊 Voice Setup",
        rank:         "📈 Rank Setup",
        applications: "📋 Bewerbungs Setup",
        stats:        "📊 Statistik Setup",
      };

      if (placeholders[value]) {
        return interaction.reply({
          content: `${placeholders[value]} wird bald verfügbar sein!`,
          ephemeral: true
        });
      }
    }

    // ── Auto Setup ────────────────────────────────────────────────────────────
    if (id === "setup-create-all") {
      await interaction.deferReply({ ephemeral: true });

      try {
        const roles = ["Supporter", "Mitglied"];
        for (const roleName of roles) {
          const exists = interaction.guild.roles.cache.find(r => r.name === roleName);
          if (!exists) {
            await interaction.guild.roles.create({
              name:   roleName,
              reason: "GuildControl Auto Setup"
            });
          }
        }

        await GuildConfig.findOneAndUpdate(
          { guildId: interaction.guild.id },
          {
            guildId: interaction.guild.id,
            systems: { moderation: true, tickets: true, logs: true }
          },
          { upsert: true, new: true }
        );

        await interaction.editReply({ content: "✅ GuildControl Auto-Setup erfolgreich abgeschlossen!" });

      } catch (err) {
        console.error("[Setup] Auto Setup Fehler:", err);
        await interaction.editReply({ content: "❌ Fehler beim Auto-Setup!" });
      }

      return;
    }

    // ── Setup abbrechen ───────────────────────────────────────────────────────
    if (id === "setup-cancel") {
      return interaction.update({
        content:    "❌ Setup abgebrochen.",
        embeds:     [],
        components: []
      });
    }

    // ── Setup abschließen ─────────────────────────────────────────────────────
    if (id === "setup-finish") {
      return interaction.update({
        content:    "✅ Setup gespeichert.",
        embeds:     [],
        components: []
      });
    }
  }
};
