const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");

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
        .setStyle(ButtonStyle.Primary),        // BLAU – Aktion/Feature
      new ButtonBuilder()
        .setCustomId("setup-finish")
        .setLabel("✅ Setup Abschließen")
        .setStyle(ButtonStyle.Success),        // GRÜN – Abschließen ✓ (war Primary)
      new ButtonBuilder()
        .setCustomId("setup-cancel")
        .setLabel("❌ Abbrechen")
        .setStyle(ButtonStyle.Danger)          // ROT – Abbrechen ✓
    );

    await interaction.reply({
      embeds: [embed],
      components: [row, buttons],
      ephemeral: true
    });
  },
};