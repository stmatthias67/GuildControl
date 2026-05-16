const GuildConfig = require("../models/GuildConfig");
const {
  startRoleSetup,
  handleRoleSetupInteraction
} = require("./roleSetup");
const { showSetupOverview: showTicketSetup, execute: handleTicketInteraction } = require("./ticketHandler");

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

    // 🔧 Role Setup Interactions
    if (interaction.customId.startsWith("role-setup-")) {
      return handleRoleSetupInteraction(interaction);
    }

    // 🎫 Ticket Interactions (Setup & Live)
    if (
      interaction.customId.startsWith("ticketsetup-") ||
      interaction.customId.startsWith("ticket-")
    ) {
      return handleTicketInteraction(interaction, client);
    }

    // 📋 Setup Menu (StringSelectMenu)
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "setup-menu") {
        const value = interaction.values[0];

        // 👑 Rollen Setup
        if (value === "roles") {
          return startRoleSetup(interaction);
        }

        // 🎫 Ticket Setup
        if (value === "tickets") {
          return showTicketSetup(interaction);
        }

        // 🛡️ Security Setup
        if (value === "security") {
          return interaction.update({
            content: "🛡️ Security Setup kommt jetzt als nächstes!",
            embeds: [],
            components: []
          });
        }
      }
    }

    // 🚀 Auto Setup
    if (interaction.customId === "setup-create-all") {
      await interaction.deferReply({ ephemeral: true });

      try {
        const roles = ["Supporter", "Mitglied"];

        for (const roleName of roles) {
          const existingRole = interaction.guild.roles.cache.find(
            r => r.name === roleName
          );

          if (!existingRole) {
            await interaction.guild.roles.create({
              name: roleName,
              reason: "GuildControl Auto Setup"
            });
          }
        }

        await GuildConfig.findOneAndUpdate(
          { guildId: interaction.guild.id },
          {
            guildId: interaction.guild.id,
            systems: {
              moderation: true,
              tickets: true,
              logs: true
            }
          },
          { upsert: true, new: true }
        );

        await interaction.editReply({
          content: "✅ GuildControl Setup erfolgreich abgeschlossen!"
        });

      } catch (error) {
        console.error(error);
        await interaction.editReply({
          content: "❌ Fehler beim Setup!"
        });
      }
    }

    // ❌ Setup abbrechen
    if (interaction.customId === "setup-cancel") {
      return interaction.update({
        content: "❌ Setup abgebrochen.",
        embeds: [],
        components: []
      });
    }

    // ✅ Setup abschließen
    if (interaction.customId === "setup-finish") {
      return interaction.update({
        content: "✅ Setup gespeichert.",
        embeds: [],
        components: []
      });
    }
  }
};