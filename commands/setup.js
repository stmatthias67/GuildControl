const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");

const { showSetupOverview: showTicketSetup } = require("../interactions/ticketHandler");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("GuildControl Setup"),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle("⚙️ GuildControl Setup")
      .setDescription("Wähle ein System zum Konfigurieren oder starte den Auto-Setup.")
      .setColor(0x5865f2);

    const menu = new StringSelectMenuBuilder()
      .setCustomId("setup-menu")
      .setPlaceholder("System auswählen...")
      .addOptions([
        new StringSelectMenuOptionBuilder()
          .setLabel("Rollen Setup")
          .setDescription("Team Rollen konfigurieren")
          .setValue("roles")
          .setEmoji("👑"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Ticket Setup")
          .setDescription("Ticket System konfigurieren")
          .setValue("tickets")
          .setEmoji("🎫"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Security Setup")
          .setDescription("Security System konfigurieren")
          .setValue("security")
          .setEmoji("🛡️"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Voice Setup")
          .setDescription("Voice System konfigurieren")
          .setValue("voice")
          .setEmoji("🔊"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Rank Setup")
          .setDescription("Level System konfigurieren")
          .setValue("rank")
          .setEmoji("📈"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Bewerbungs Setup")
          .setDescription("Bewerbungssystem konfigurieren")
          .setValue("applications")
          .setEmoji("📋"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Statistik Setup")
          .setDescription("Server Statistiken erstellen")
          .setValue("stats")
          .setEmoji("📊")
      ]);

    const row = new ActionRowBuilder().addComponents(menu);

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("setup-create-all")
        .setLabel("🚀 Auto Setup")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("setup-finish")
        .setLabel("✅ Setup Abschließen")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("setup-cancel")
        .setLabel("❌ Abbrechen")
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({
      embeds: [embed],
      components: [row, buttons],
      ephemeral: true
    });
  },

  // Wird vom Interaction-Handler aufgerufen, wenn User "setup-menu" benutzt
  async handleSelect(interaction) {
    const value = interaction.values[0];

    if (value === "tickets") {
      return showTicketSetup(interaction);
    }

    // Weitere Systeme hier ergänzen:
    // if (value === "roles") return showRoleSetup(interaction);
    // if (value === "security") return showSecuritySetup(interaction);
  }
};