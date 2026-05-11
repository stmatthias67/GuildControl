const GuildConfig = require("../models/GuildConfig");
const roleSetup = require("./roleSetup");

module.exports = {
  name: "interactionCreate",
  async execute(interaction, client) {

    if (
      !interaction.isButton() &&
      !interaction.isStringSelectMenu() &&
      !interaction.isRoleSelectMenu()
    ) return;

    // 📋 Setup Menu (StringSelectMenu)
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "setup-menu") {
        const value = interaction.values[0];

        // 👑 Rollen Setup
        if (value === "roles") {
          return roleSetup(interaction);
        }

        // 🎫 Ticket Setup
        if (value === "tickets") {
          return interaction.update({
            content: "🎫 Ticket Setup kommt jetzt als nächstes!",
            embeds: [],
            components: []
          });
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
    if (interaction.customId === "setup-roles") {
      return roleSetup(interaction);
    }
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

        // 💾 DB Config
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