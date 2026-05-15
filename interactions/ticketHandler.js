/**
 * ticketHandler.js
 * Verarbeitet alle Button-, SelectMenu- und Modal-Interaktionen
 * für das Ticket-System (Setup & Live-Tickets).
 *
 * CustomId-Präfixe:
 *   ticketsetup-*   → Setup-Flow
 *   ticket-*        → Live-Ticket Aktionen
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits
} = require("discord.js");

const TicketConfig = require("../models/TicketConfig");
const Ticket       = require("../models/Ticket");

// ── IMPORT AUS DER ZUSAMMENGEFÜHRTEN ticketManager.js ────────────────────────
const {
  DEFAULT_CATEGORIES,
  createTicketV2,
  closeTicketV2,
  claimTicketV2,
  addUserToTicketV2
} = require("../utils/ticketManager");

const {
  buildOverviewEmbed,
  buildOverviewComponents
} = require("../commands/ticket-setup");

// ────────────────────────────────────────────────────────────────────────────
const execute = async (interaction, client) => {
  const id = interaction.customId;

  // ═══════════════════════════════════════════════════════
  // SETUP FLOW
  // ═══════════════════════════════════════════════════════

  // Navigations-Menü
  if (id === "ticketsetup-menu" && interaction.isStringSelectMenu()) {
    const value = interaction.values[0];
    if (value === "channels")   return handleSetupChannels(interaction);
    if (value === "categories") return handleSetupCategories(interaction);
    if (value === "roles")      return handleSetupRoles(interaction);
    if (value === "sendpanel")  return handleSetupSendPanel(interaction);
    return;
  }

  // Kanal-Auswahl: Erstell-Kanal
  if (id === "ticketsetup-select-create" && interaction.isChannelSelectMenu()) {
    const cfg = await getOrCreateConfig(interaction.guild.id);
    cfg.createChannelId = interaction.values[0];
    await cfg.save();
    return interaction.update({
      embeds: [buildOverviewEmbed(cfg)],
      components: buildOverviewComponents()
    });
  }

  // Kanal-Auswahl: Log-Kanal
  if (id === "ticketsetup-select-log" && interaction.isChannelSelectMenu()) {
    const cfg = await getOrCreateConfig(interaction.guild.id);
    cfg.logChannelId = interaction.values[0];
    await cfg.save();
    return interaction.update({
      embeds: [buildOverviewEmbed(cfg)],
      components: buildOverviewComponents()
    });
  }

  // Kanal-Auswahl: Claim-Kanal
  if (id === "ticketsetup-select-claim" && interaction.isChannelSelectMenu()) {
    const cfg = await getOrCreateConfig(interaction.guild.id);
    cfg.claimChannelId = interaction.values[0];
    await cfg.save();
    return interaction.update({
      embeds: [buildOverviewEmbed(cfg)],
      components: buildOverviewComponents()
    });
  }

  // Kategorien-Auswahl
  if (id === "ticketsetup-select-categories" && interaction.isStringSelectMenu()) {
    const cfg      = await getOrCreateConfig(interaction.guild.id);
    const selected = interaction.values; // Array von category-ids
    cfg.categories = DEFAULT_CATEGORIES.filter(c => selected.includes(c.id));
    await cfg.save();
    return interaction.update({
      embeds: [buildOverviewEmbed(cfg)],
      components: buildOverviewComponents()
    });
  }

  // Custom Kategorie anlegen – Button → Modal öffnen
  if (id === "ticketsetup-custom-category") {
    const modal = new ModalBuilder()
      .setCustomId("ticketsetup-modal-customcat")
      .setTitle("Custom Ticket Kategorie");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("cat-label")
          .setLabel("Name der Kategorie")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(32)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("cat-description")
          .setLabel("Beschreibung")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(60)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("cat-emoji")
          .setLabel("Emoji (einzelnes Zeichen, z.B. 🌟)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(4)
      )
    );

    return interaction.showModal(modal);
  }

  // Custom Kategorie Modal Submit
  if (id === "ticketsetup-modal-customcat" && interaction.isModalSubmit()) {
    const label       = interaction.fields.getTextInputValue("cat-label");
    const description = interaction.fields.getTextInputValue("cat-description");
    const emoji       = interaction.fields.getTextInputValue("cat-emoji") || "🎫";
    const customId    = `custom-${Date.now()}`;

    const cfg = await getOrCreateConfig(interaction.guild.id);
    cfg.categories.push({ id: customId, label, description, emoji, custom: true });
    await cfg.save();

    return interaction.update({
      embeds: [buildOverviewEmbed(cfg)],
      components: buildOverviewComponents()
    });
  }

  // Support-Rollen Auswahl
  if (id === "ticketsetup-select-support-roles" && interaction.isRoleSelectMenu()) {
    const cfg = await getOrCreateConfig(interaction.guild.id);
    cfg.supportRoleIds = interaction.values;
    await cfg.save();
    return interaction.update({
      embeds: [buildOverviewEmbed(cfg)],
      components: buildOverviewComponents()
    });
  }

  // Admin-Rollen Auswahl
  if (id === "ticketsetup-select-admin-roles" && interaction.isRoleSelectMenu()) {
    const cfg = await getOrCreateConfig(interaction.guild.id);
    cfg.adminRoleIds = interaction.values;
    await cfg.save();
    return interaction.update({
      embeds: [buildOverviewEmbed(cfg)],
      components: buildOverviewComponents()
    });
  }

  // Panel senden – Bestätigungs-Button
  if (id === "ticketsetup-confirm-sendpanel") {
    return sendTicketPanel(interaction);
  }

  // Setup abschließen
  if (id === "ticketsetup-finish") {
    const cfg = await getOrCreateConfig(interaction.guild.id);
    if (!cfg.createChannelId || !cfg.logChannelId || cfg.categories.length === 0) {
      return interaction.reply({
        content: "❌ Bitte konfiguriere zuerst Kanäle und mindestens eine Kategorie.",
        ephemeral: true
      });
    }
    cfg.setupDone = true;
    await cfg.save();
    return interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle("✅ Setup abgeschlossen!")
          .setDescription("Das Ticket-System ist jetzt aktiv. Sende das Panel im gewünschten Kanal.")
          .setColor(0x57f287)
      ],
      components: buildOverviewComponents()
    });
  }

  // Setup zurücksetzen
  if (id === "ticketsetup-reset") {
    await TicketConfig.findOneAndUpdate(
      { guildId: interaction.guild.id },
      {
        createChannelId: null,
        logChannelId:    null,
        claimChannelId:  null,
        supportRoleIds:  [],
        adminRoleIds:    [],
        categories:      [],
        setupDone:       false
      }
    );
    const cfg = await getOrCreateConfig(interaction.guild.id);
    return interaction.update({
      embeds: [buildOverviewEmbed(cfg)],
      components: buildOverviewComponents()
    });
  }

  // ═══════════════════════════════════════════════════════
  // LIVE TICKET AKTIONEN
  // ═══════════════════════════════════════════════════════

  // Ticket erstellen via Kategorie-Auswahl
  if (id === "ticket-create-menu" && interaction.isStringSelectMenu()) {
    const categoryId = interaction.values[0];
    await interaction.deferReply({ ephemeral: true });

    const result = await createTicket(interaction.guild, interaction.user, categoryId);

    if (result.error === "setup_missing") {
      return interaction.editReply({ content: "❌ Das Ticket-System wurde noch nicht eingerichtet." });
    }
    if (result.error === "already_open") {
      return interaction.editReply({
        content: `❌ Du hast bereits ein offenes Ticket: <#${result.channelId}>`
      });
    }
    if (result.error === "invalid_category") {
      return interaction.editReply({ content: "❌ Ungültige Kategorie." });
    }

    return interaction.editReply({
      content: `✅ Dein Ticket wurde erstellt: <#${result.channel.id}>`
    });
  }

  // Ticket schließen – Button drücken → Bestätigung zeigen
  if (id.startsWith("ticket-close-") && interaction.isButton()) {
    const channelId = id.replace("ticket-close-", "");
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🔒 Ticket schließen")
          .setDescription("Bist du sicher, dass du dieses Ticket schließen möchtest?")
          .setColor(0xed4245)
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`ticket-close-confirm-${channelId}`)
            .setLabel("Ja, schließen")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`ticket-close-cancel-${channelId}`)
            .setLabel("Abbrechen")
            .setStyle(ButtonStyle.Secondary)
        )
      ],
      ephemeral: true
    });
  }

  // Ticket schließen – Bestätigung
  if (id.startsWith("ticket-close-confirm-") && interaction.isButton()) {
    const channelId = id.replace("ticket-close-confirm-", "");
    const channel   = interaction.guild.channels.cache.get(channelId);

    if (!channel) return interaction.reply({ content: "❌ Kanal nicht gefunden.", ephemeral: true });

    await interaction.deferUpdate();
    await closeTicket(interaction.guild, channel, interaction.user.id);
    return;
  }

  // Ticket schließen – Abbrechen
  if (id.startsWith("ticket-close-cancel-") && interaction.isButton()) {
    return interaction.update({ content: "❌ Abgebrochen.", embeds: [], components: [] });
  }

  // Ticket claimen
  if (id.startsWith("ticket-claim-") && interaction.isButton()) {
    const channelId = id.replace("ticket-claim-", "");
    const channel   = interaction.guild.channels.cache.get(channelId);
    if (!channel) return interaction.reply({ content: "❌ Kanal nicht gefunden.", ephemeral: true });

    const result = await claimTicket(interaction.guild, channel, interaction.user);

    if (result.error === "not_found") {
      return interaction.reply({ content: "❌ Ticket nicht gefunden.", ephemeral: true });
    }
    if (result.error === "already_claimed") {
      return interaction.reply({
        content: `❌ Dieses Ticket wurde bereits von <@${result.claimedBy}> geclaimt.`,
        ephemeral: true
      });
    }

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setDescription(`📌 Dieses Ticket wurde von ${interaction.user} übernommen.`)
          .setColor(0xfee75c)
      ]
    });
    return;
  }

  // User hinzufügen – Button → Modal
  if (id.startsWith("ticket-adduser-") && interaction.isButton()) {
    const channelId = id.replace("ticket-adduser-", "");
    const modal = new ModalBuilder()
      .setCustomId(`ticket-adduser-modal-${channelId}`)
      .setTitle("User zum Ticket hinzufügen");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("user-id")
          .setLabel("User ID")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("123456789012345678")
          .setRequired(true)
      )
    );

    return interaction.showModal(modal);
  }

  // User hinzufügen – Modal Submit
  if (id.startsWith("ticket-adduser-modal-") && interaction.isModalSubmit()) {
    const channelId = id.replace("ticket-adduser-modal-", "");
    const userId    = interaction.fields.getTextInputValue("user-id").trim();

    await interaction.deferReply({ ephemeral: true });

    const targetUser = await interaction.guild.members.fetch(userId).catch(() => null);
    if (!targetUser) {
      return interaction.editReply({ content: "❌ User nicht gefunden. Bitte prüfe die ID." });
    }

    const channel = interaction.guild.channels.cache.get(channelId);
    if (!channel) return interaction.editReply({ content: "❌ Ticket-Kanal nicht gefunden." });

    const result = await addUserToTicket(interaction.guild, channel, targetUser.user);

    if (result.error === "already_added") {
      return interaction.editReply({ content: "❌ Dieser User ist bereits im Ticket." });
    }

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setDescription(`👥 ${targetUser} wurde von ${interaction.user} zum Ticket hinzugefügt.`)
          .setColor(0x57f287)
      ]
    });

    return interaction.editReply({ content: `✅ ${targetUser} wurde hinzugefügt.` });
  }

  // Higher Staff eskalieren
  if (id.startsWith("ticket-escalate-") && interaction.isButton()) {
    const cfg = await getOrCreateConfig(interaction.guild.id);

    const pings = cfg.adminRoleIds.length
      ? cfg.adminRoleIds.map(r => `<@&${r}>`).join(" ")
      : "*(keine Admin-Rollen konfiguriert)*";

    await interaction.reply({
      content: `🚨 **Higher Staff benötigt!** ${pings}\n\n${interaction.user} benötigt Hilfe in diesem Ticket.`
    });

    return;
  }
};

// ── Setup-Schritte ────────────────────────────────────────────────────────────

async function handleSetupChannels(interaction) {
  const row1 = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId("ticketsetup-select-create")
      .setPlaceholder("📌 Ticket-Erstell-Kanal auswählen")
      .addChannelTypes(ChannelType.GuildText)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId("ticketsetup-select-log")
      .setPlaceholder("📋 Log-Kanal auswählen")
      .addChannelTypes(ChannelType.GuildText)
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId("ticketsetup-select-claim")
      .setPlaceholder("📌 Claim-Kanal auswählen (optional)")
      .addChannelTypes(ChannelType.GuildText)
  );

  return interaction.update({
    embeds: [
      new EmbedBuilder()
        .setTitle("📌 Schritt 1 – Kanäle konfigurieren")
        .setDescription("Wähle die drei Kanäle für das Ticket-System.\nDer Claim-Kanal ist optional.")
        .setColor(0x5865f2)
    ],
    components: [row1, row2, row3]
  });
}

async function handleSetupCategories(interaction) {
  const options = DEFAULT_CATEGORIES.map(c =>
    new StringSelectMenuOptionBuilder()
      .setLabel(c.label)
      .setDescription(c.description)
      .setValue(c.id)
      .setEmoji(c.emoji)
  );

  const row1 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("ticketsetup-select-categories")
      .setPlaceholder("🎟️ Kategorien auswählen (mehrere möglich)")
      .setMinValues(1)
      .setMaxValues(DEFAULT_CATEGORIES.length)
      .addOptions(options)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticketsetup-custom-category")
      .setLabel("➕ Custom Kategorie erstellen")
      .setStyle(ButtonStyle.Secondary)
  );

  return interaction.update({
    embeds: [
      new EmbedBuilder()
        .setTitle("🎟️ Schritt 2 – Ticket-Kategorien")
        .setDescription("Wähle welche Ticket-Arten aktiv sein sollen.")
        .setColor(0x5865f2)
    ],
    components: [row1, row2]
  });
}

async function handleSetupRoles(interaction) {
  const row1 = new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId("ticketsetup-select-support-roles")
      .setPlaceholder("👮 Support-Rollen auswählen")
      .setMinValues(1)
      .setMaxValues(10)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId("ticketsetup-select-admin-roles")
      .setPlaceholder("🛡️ Admin-Rollen auswählen")
      .setMinValues(0)
      .setMaxValues(10)
  );

  return interaction.update({
    embeds: [
      new EmbedBuilder()
        .setTitle("👮 Schritt 3 – Rollen")
        .setDescription("Support-Rollen erhalten Zugriff auf alle Tickets.\nAdmin-Rollen werden bei Eskalation gepingt.")
        .setColor(0x5865f2)
    ],
    components: [row1, row2]
  });
}

async function handleSetupSendPanel(interaction) {
  const cfg = await getOrCreateConfig(interaction.guild.id);

  if (!cfg.createChannelId) {
    return interaction.reply({
      content: "❌ Bitte konfiguriere zuerst den Erstell-Kanal (Schritt 1).",
      ephemeral: true
    });
  }

  return interaction.update({
    embeds: [
      new EmbedBuilder()
        .setTitle("📤 Ticket-Panel senden")
        .setDescription(
          `Das Panel wird in <#${cfg.createChannelId}> gesendet.\n` +
          "User können dort ein Ticket erstellen."
        )
        .setColor(0x5865f2)
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("ticketsetup-confirm-sendpanel")
          .setLabel("Panel jetzt senden")
          .setStyle(ButtonStyle.Success)
      )
    ]
  });
}

async function sendTicketPanel(interaction) {
  const cfg = await getOrCreateConfig(interaction.guild.id);

  if (!cfg.createChannelId || cfg.categories.length === 0) {
    return interaction.reply({
      content: "❌ Erstell-Kanal oder Kategorien fehlen noch.",
      ephemeral: true
    });
  }

  const channel = interaction.guild.channels.cache.get(cfg.createChannelId);
  if (!channel) {
    return interaction.reply({ content: "❌ Erstell-Kanal nicht gefunden.", ephemeral: true });
  }

  const options = cfg.categories.map(c =>
    new StringSelectMenuOptionBuilder()
      .setLabel(c.label)
      .setDescription(c.description)
      .setValue(c.id)
      .setEmoji(c.emoji)
  );

  const menu = new StringSelectMenuBuilder()
    .setCustomId("ticket-create-menu")
    .setPlaceholder("Ticket-Art auswählen…")
    .addOptions(options);

  const embed = new EmbedBuilder()
    .setTitle("🎫 Ticket erstellen")
    .setDescription("Wähle eine Kategorie aus dem Menü um ein Ticket zu erstellen.\nUnser Team hilft dir so schnell wie möglich!")
    .setColor(0x5865f2)
    .setFooter({ text: "Du kannst nur 1 offenes Ticket gleichzeitig haben." });

  await channel.send({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(menu)]
  });

  return interaction.update({
    embeds: [
      new EmbedBuilder()
        .setDescription(`✅ Panel wurde erfolgreich in <#${cfg.createChannelId}> gesendet.`)
        .setColor(0x57f287)
    ],
    components: []
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────
async function getOrCreateConfig(guildId) {
  let cfg = await TicketConfig.findOne({ guildId });
  if (!cfg) cfg = await TicketConfig.create({ guildId });
  return cfg;
}

module.exports = { execute };
