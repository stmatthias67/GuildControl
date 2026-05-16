const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} = require("discord.js");

const TicketConfig          = require("../models/TicketConfig");
const { DEFAULT_CATEGORIES } = require("../utils/ticketManager");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticket-setup")
    .setDescription("Ticket System konfigurieren")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    // Config laden oder anlegen
    let cfg = await TicketConfig.findOne({ guildId: interaction.guild.id });
    if (!cfg) {
      cfg = await TicketConfig.create({ guildId: interaction.guild.id });
    }

    await interaction.reply({
      embeds: [buildOverviewEmbed(cfg)],
      components: buildOverviewComponents(),
      ephemeral: true
    });
  }
};

// ── Übersicht Embed ──────────────────────────────────────────────────────────
function buildOverviewEmbed(cfg) {
  const cats = cfg.categories.length
    ? cfg.categories.map(c => `${c.emoji} ${c.label}`).join("\n")
    : "_(keine ausgewählt)_";

  return new EmbedBuilder()
    .setTitle("🎫 Ticket System Setup")
    .setDescription("Konfiguriere das Ticket-System Schritt für Schritt.")
    .addFields(
      {
        name: "📌 Kanäle",
        value:
          `Erstell-Kanal: ${cfg.createChannelId ? `<#${cfg.createChannelId}>` : "_(nicht gesetzt)_"}\n` +
          `Log-Kanal: ${cfg.logChannelId ? `<#${cfg.logChannelId}>` : "_(nicht gesetzt)_"}\n` +
          `Claim-Kanal: ${cfg.claimChannelId ? `<#${cfg.claimChannelId}>` : "_(optional, nicht gesetzt)_"}`,
        inline: false
      },
      {
        name: "🎟️ Kategorien",
        value: cats,
        inline: false
      },
      {
        name: "👮 Support-Rollen",
        value: cfg.supportRoleIds.length
          ? cfg.supportRoleIds.map(r => `<@&${r}>`).join(", ")
          : "_(keine gesetzt)_",
        inline: false
      },
      {
        name: "✅ Setup-Status",
        value: cfg.setupDone ? "🟢 Abgeschlossen" : "🔴 Nicht abgeschlossen",
        inline: false
      }
    )
    .setColor(0x5865f2)
    .setTimestamp();
}

// ── Übersicht Buttons ────────────────────────────────────────────────────────
function buildOverviewComponents() {
  const menuRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("ticketsetup-menu")
      .setPlaceholder("Schritt auswählen…")
      .addOptions([
        new StringSelectMenuOptionBuilder()
          .setLabel("1️⃣  Kanäle konfigurieren")
          .setDescription("Erstell-, Log- & Claim-Kanal festlegen")
          .setValue("channels")
          .setEmoji("📌"),
        new StringSelectMenuOptionBuilder()
          .setLabel("2️⃣  Kategorien auswählen")
          .setDescription("Welche Ticket-Arten soll es geben?")
          .setValue("categories")
          .setEmoji("🎟️"),
        new StringSelectMenuOptionBuilder()
          .setLabel("3️⃣  Rollen konfigurieren")
          .setDescription("Support- & Admin-Rollen festlegen")
          .setValue("roles")
          .setEmoji("👮"),
        new StringSelectMenuOptionBuilder()
          .setLabel("4️⃣  Ticket-Panel senden")
          .setDescription("Erstell-Nachricht in den konfigurierten Kanal senden")
          .setValue("sendpanel")
          .setEmoji("📤")
      ])
  );

  const btnRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticketsetup-finish")
      .setLabel("✅ Setup abschließen")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("ticketsetup-reset")
      .setLabel("🗑️ Zurücksetzen")
      .setStyle(ButtonStyle.Danger)
  );

  return [menuRow, btnRow];
}

// Exportiere Hilfsfunktionen für den Handler
module.exports.buildOverviewEmbed      = buildOverviewEmbed;
module.exports.buildOverviewComponents = buildOverviewComponents;
