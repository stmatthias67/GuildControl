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
} = require("discord.js");

const TicketConfig = require("../models/TicketConfig");
const GuildConfig  = require("../models/GuildConfig");
const Ticket       = require("../models/Ticket");

const {
  DEFAULT_CATEGORIES,
  createTicketV2,
  closeTicketV2,
  claimTicketV2,
  addUserToTicketV2
} = require("../utils/ticketManager");

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

/**
 * Liest alle konfigurierten Rollen aus GuildConfig (Role Setup).
 * Gibt ein Array zurück: [{ key, roleId }]
 */
async function getSetupRoles(guildId) {
  const config = await GuildConfig.findOne({ guildId });
  if (!config?.roles) return [];
  return Object.entries(config.roles)
    .filter(([, id]) => id)
    .map(([key, roleId]) => ({ key, roleId }));
}

function buildOverviewEmbed(cfg, setupRoles = []) {
  const categories = cfg.categories.length
    ? cfg.categories.map(c => {
        const notifyMention = c.notifyRoleIds?.length
          ? c.notifyRoleIds.map(id => `<@&${id}>`).join(", ")
          : null;
        return `${c.emoji} **${c.label}**${notifyMention ? ` — Ping: ${notifyMention}` : ""}`;
      }).join("\n")
    : "*Keine Kategorien konfiguriert*";

  const rolesText = setupRoles.length
    ? setupRoles.map(r => `\`${r.key}\`: <@&${r.roleId}>`).join("\n")
    : "*Keine Rollen im Role Setup konfiguriert*";

  return new EmbedBuilder()
    .setTitle("🎫 Ticket System – Übersicht")
    .setColor(cfg.setupDone ? 0x57f287 : 0x5865f2)
    .addFields(
      {
        name: "📌 Kanäle",
        value:
          `Erstellen: ${cfg.createChannelId ? `<#${cfg.createChannelId}>` : "❌ Nicht gesetzt"}\n` +
          `Log: ${cfg.logChannelId ? `<#${cfg.logChannelId}>` : "❌ Nicht gesetzt"}\n` +
          `Claim: ${cfg.claimChannelId ? `<#${cfg.claimChannelId}>` : "*(optional)*"}`,
        inline: false
      },
      { name: "🎟️ Kategorien", value: categories, inline: false },
      { name: "👮 Rollen (aus Role Setup)", value: rolesText, inline: false },
      {
        name: "Status",
        value: cfg.setupDone ? "✅ Setup abgeschlossen" : "⚠️ Setup noch nicht abgeschlossen",
        inline: false
      }
    );
}

function buildOverviewComponents() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("ticketsetup-menu")
    .setPlaceholder("Schritt auswählen...")
    .addOptions([
      new StringSelectMenuOptionBuilder()
        .setLabel("Kanäle konfigurieren")
        .setDescription("Erstell-, Log- und Claim-Kanal festlegen")
        .setValue("channels")
        .setEmoji("📌"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Kategorien konfigurieren")
        .setDescription("Ticket-Arten aktivieren oder erstellen")
        .setValue("categories")
        .setEmoji("🎟️"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Ticket-Panel senden")
        .setDescription("Panel in den Erstell-Kanal posten")
        .setValue("sendpanel")
        .setEmoji("📤")
    ]);

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticketsetup-finish")
      .setLabel("✅ Setup abschließen")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("ticketsetup-reset")
      .setLabel("🔄 Zurücksetzen")
      .setStyle(ButtonStyle.Danger)
  );

  return [new ActionRowBuilder().addComponents(menu), buttons];
}

// ── Einstiegspunkt für setup.js ───────────────────────────────────────────────

const showSetupOverview = async (interaction) => {
  const cfg        = await getOrCreateConfig(interaction.guild.id);
  const setupRoles = await getSetupRoles(interaction.guild.id);
  return interaction.update({
    embeds: [buildOverviewEmbed(cfg, setupRoles)],
    components: buildOverviewComponents()
  });
};

// ── Haupt-Handler ─────────────────────────────────────────────────────────────

const execute = async (interaction, client) => {
  const id = interaction.customId;

  // ═══════════════════════════════════════════════════════
  // SETUP FLOW
  // ═══════════════════════════════════════════════════════

  if (id === "ticketsetup-menu" && interaction.isStringSelectMenu()) {
    const value = interaction.values[0];
    if (value === "channels")   return handleSetupChannels(interaction);
    if (value === "categories") return handleSetupCategories(interaction);
    if (value === "sendpanel")  return handleSetupSendPanel(interaction);
    return;
  }

  // Kanal-Auswahl: Erstell-Kanal
  if (id === "ticketsetup-select-create" && interaction.isChannelSelectMenu()) {
    const cfg = await getOrCreateConfig(interaction.guild.id);
    cfg.createChannelId = interaction.values[0];
    await cfg.save();
    const setupRoles = await getSetupRoles(interaction.guild.id);
    return interaction.update({
      embeds: [buildOverviewEmbed(cfg, setupRoles)],
      components: buildOverviewComponents()
    });
  }

  // Kanal-Auswahl: Log-Kanal
  if (id === "ticketsetup-select-log" && interaction.isChannelSelectMenu()) {
    const cfg = await getOrCreateConfig(interaction.guild.id);
    cfg.logChannelId = interaction.values[0];
    await cfg.save();
    const setupRoles = await getSetupRoles(interaction.guild.id);
    return interaction.update({
      embeds: [buildOverviewEmbed(cfg, setupRoles)],
      components: buildOverviewComponents()
    });
  }

  // Kanal-Auswahl: Claim-Kanal
  if (id === "ticketsetup-select-claim" && interaction.isChannelSelectMenu()) {
    const cfg = await getOrCreateConfig(interaction.guild.id);
    cfg.claimChannelId = interaction.values[0];
    await cfg.save();
    const setupRoles = await getSetupRoles(interaction.guild.id);
    return interaction.update({
      embeds: [buildOverviewEmbed(cfg, setupRoles)],
      components: buildOverviewComponents()
    });
  }

  // Kategorien-Auswahl (Standard-Kategorien)
  if (id === "ticketsetup-select-categories" && interaction.isStringSelectMenu()) {
    const cfg      = await getOrCreateConfig(interaction.guild.id);
    const selected = interaction.values;
    // Bestehende custom-Kategorien behalten, Standard-Kategorien ersetzen
    const customs   = cfg.categories.filter(c => c.custom);
    const standards = DEFAULT_CATEGORIES.filter(c => selected.includes(c.id));
    cfg.categories  = [...standards, ...customs];
    await cfg.save();
    const setupRoles = await getSetupRoles(interaction.guild.id);
    return interaction.update({
      embeds: [buildOverviewEmbed(cfg, setupRoles)],
      components: buildOverviewComponents()
    });
  }

  // Custom Kategorie – Button → Modal öffnen
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

  // Custom Kategorie – Modal Submit → danach Rollen-Auswahl zeigen
  if (id === "ticketsetup-modal-customcat" && interaction.isModalSubmit()) {
    const label       = interaction.fields.getTextInputValue("cat-label");
    const description = interaction.fields.getTextInputValue("cat-description");
    const emoji       = interaction.fields.getTextInputValue("cat-emoji") || "🎫";
    const customId    = `custom-${Date.now()}`;

    const cfg = await getOrCreateConfig(interaction.guild.id);
    cfg.categories.push({ id: customId, label, description, emoji, custom: true, notifyRoleIds: [] });
    await cfg.save();

    // Rollen aus Role Setup laden
    const setupRoles = await getSetupRoles(interaction.guild.id);

    if (setupRoles.length === 0) {
      // Keine Rollen konfiguriert → direkt zurück zur Übersicht
      return interaction.update({
        embeds: [
          new EmbedBuilder()
            .setTitle("⚠️ Keine Rollen konfiguriert")
            .setDescription(
              `Kategorie **${emoji} ${label}** wurde erstellt.\n\n` +
              "Im Role Setup sind noch keine Rollen konfiguriert. Führe zuerst das **Rollen Setup** durch, um Benachrichtigungs-Rollen setzen zu können."
            )
            .setColor(0xfee75c)
        ],
        components: buildOverviewComponents()
      });
    }

    // Rollen-Auswahl für Benachrichtigung anzeigen
    const options = setupRoles.map(r => {
      const roleName = r.key.charAt(0).toUpperCase() + r.key.slice(1);
      return new StringSelectMenuOptionBuilder()
        .setLabel(roleName)
        .setDescription(`ID: ${r.roleId}`)
        .setValue(`${customId}::${r.roleId}`);
    });

    return interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle(`🎟️ Kategorie: ${emoji} ${label}`)
          .setDescription(
            "Wähle welche **Role-Setup Rollen** bei neuen Tickets in dieser Kategorie benachrichtigt werden sollen.\n\n" +
            "Nur Rollen aus dem Rollen Setup sind verfügbar."
          )
          .setColor(0x5865f2)
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("ticketsetup-customcat-roles")
            .setPlaceholder("Benachrichtigungs-Rollen auswählen (mehrere möglich)")
            .setMinValues(0)
            .setMaxValues(setupRoles.length)
            .addOptions(options)
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`ticketsetup-customcat-noroles::${customId}`)
            .setLabel("Keine Benachrichtigung")
            .setStyle(ButtonStyle.Secondary)
        )
      ]
    });
  }

  // Custom Kategorie – Rollen gespeichert
  if (id === "ticketsetup-customcat-roles" && interaction.isStringSelectMenu()) {
    const cfg = await getOrCreateConfig(interaction.guild.id);

    // Value-Format: "custom-TIMESTAMP::roleId"
    const roleIdsByCategory = {};
    for (const val of interaction.values) {
      const [catId, roleId] = val.split("::");
      if (!roleIdsByCategory[catId]) roleIdsByCategory[catId] = [];
      roleIdsByCategory[catId].push(roleId);
    }

    for (const cat of cfg.categories) {
      if (roleIdsByCategory[cat.id]) {
        cat.notifyRoleIds = roleIdsByCategory[cat.id];
      }
    }
    cfg.markModified("categories");
    await cfg.save();

    const setupRoles = await getSetupRoles(interaction.guild.id);
    return interaction.update({
      embeds: [buildOverviewEmbed(cfg, setupRoles)],
      components: buildOverviewComponents()
    });
  }

  // Custom Kategorie – Keine Benachrichtigung (Skip)
  if (id.startsWith("ticketsetup-customcat-noroles::") && interaction.isButton()) {
    const customCatId = id.replace("ticketsetup-customcat-noroles::", "");
    const cfg = await getOrCreateConfig(interaction.guild.id);
    const cat = cfg.categories.find(c => c.id === customCatId);
    if (cat) {
      cat.notifyRoleIds = [];
      cfg.markModified("categories");
      await cfg.save();
    }
    const setupRoles = await getSetupRoles(interaction.guild.id);
    return interaction.update({
      embeds: [buildOverviewEmbed(cfg, setupRoles)],
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
    const setupRoles = await getSetupRoles(interaction.guild.id);
    return interaction.update({
      embeds: [buildOverviewEmbed(cfg, setupRoles)],
      components: buildOverviewComponents()
    });
  }

  // ═══════════════════════════════════════════════════════
  // LIVE TICKET AKTIONEN
  // ═══════════════════════════════════════════════════════

  if (id === "ticket-create-menu" && interaction.isStringSelectMenu()) {
    const categoryId = interaction.values[0];
    await interaction.deferReply({ ephemeral: true });

    const result = await createTicketV2(interaction.guild, interaction.user, categoryId);

    if (result.error === "setup_missing")
      return interaction.editReply({ content: "❌ Das Ticket-System wurde noch nicht eingerichtet." });
    if (result.error === "already_open")
      return interaction.editReply({ content: `❌ Du hast bereits ein offenes Ticket: <#${result.channelId}>` });
    if (result.error === "invalid_category")
      return interaction.editReply({ content: "❌ Ungültige Kategorie." });

    return interaction.editReply({ content: `✅ Dein Ticket wurde erstellt: <#${result.channel.id}>` });
  }

  // Ticket schließen – Bestätigung anzeigen
  if (
    id.startsWith("ticket-close-") &&
    !id.startsWith("ticket-close-confirm-") &&
    !id.startsWith("ticket-close-cancel-") &&
    interaction.isButton()
  ) {
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

  if (id.startsWith("ticket-close-confirm-") && interaction.isButton()) {
    const channelId = id.replace("ticket-close-confirm-", "");
    const channel   = interaction.guild.channels.cache.get(channelId);
    if (!channel) return interaction.reply({ content: "❌ Kanal nicht gefunden.", ephemeral: true });
    await interaction.deferUpdate();
    await closeTicketV2(interaction.guild, channel, interaction.user.id);
    return;
  }

  if (id.startsWith("ticket-close-cancel-") && interaction.isButton()) {
    return interaction.update({ content: "❌ Abgebrochen.", embeds: [], components: [] });
  }

  // Ticket claimen
  if (id.startsWith("ticket-claim-") && interaction.isButton()) {
    const channelId = id.replace("ticket-claim-", "");
    const channel   = interaction.guild.channels.cache.get(channelId);
    if (!channel) return interaction.reply({ content: "❌ Kanal nicht gefunden.", ephemeral: true });

    const result = await claimTicketV2(interaction.guild, channel, interaction.user);

    if (result.error === "not_found")
      return interaction.reply({ content: "❌ Ticket nicht gefunden.", ephemeral: true });
    if (result.error === "already_claimed")
      return interaction.reply({ content: `❌ Bereits geclaimt von <@${result.claimedBy}>.`, ephemeral: true });

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setDescription(`📌 Dieses Ticket wurde von ${interaction.user} übernommen.`)
          .setColor(0xfee75c)
      ]
    });
  }

  // User hinzufügen – Button → Modal
  if (
    id.startsWith("ticket-adduser-") &&
    !id.startsWith("ticket-adduser-modal-") &&
    interaction.isButton()
  ) {
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
    const channelId  = id.replace("ticket-adduser-modal-", "");
    const userId     = interaction.fields.getTextInputValue("user-id").trim();
    await interaction.deferReply({ ephemeral: true });

    const targetUser = await interaction.guild.members.fetch(userId).catch(() => null);
    if (!targetUser) return interaction.editReply({ content: "❌ User nicht gefunden." });

    const channel = interaction.guild.channels.cache.get(channelId);
    if (!channel) return interaction.editReply({ content: "❌ Ticket-Kanal nicht gefunden." });

    const result = await addUserToTicketV2(interaction.guild, channel, targetUser.user);
    if (result.error === "already_added")
      return interaction.editReply({ content: "❌ Dieser User ist bereits im Ticket." });

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
    const setupRoles = await getSetupRoles(interaction.guild.id);
    const adminRole  = setupRoles.find(r => r.key === "admin") || setupRoles.find(r => r.key === "owner");
    const ping = adminRole
      ? `<@&${adminRole.roleId}>`
      : "*(keine Admin-Rolle im Role Setup konfiguriert)*";

    return interaction.reply({
      content: `🚨 **Higher Staff benötigt!** ${ping}\n\n${interaction.user} benötigt Hilfe in diesem Ticket.`
    });
  }
};

// ── Setup-Schritte ────────────────────────────────────────────────────────────

async function handleSetupChannels(interaction) {
  return interaction.update({
    embeds: [
      new EmbedBuilder()
        .setTitle("📌 Kanäle konfigurieren")
        .setDescription("Wähle die Kanäle für das Ticket-System.\nDer Claim-Kanal ist optional.")
        .setColor(0x5865f2)
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId("ticketsetup-select-create")
          .setPlaceholder("📌 Ticket-Erstell-Kanal auswählen")
          .addChannelTypes(ChannelType.GuildText)
      ),
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId("ticketsetup-select-log")
          .setPlaceholder("📋 Log-Kanal auswählen")
          .addChannelTypes(ChannelType.GuildText)
      ),
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId("ticketsetup-select-claim")
          .setPlaceholder("📌 Claim-Kanal auswählen (optional)")
          .addChannelTypes(ChannelType.GuildText)
      )
    ]
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

  return interaction.update({
    embeds: [
      new EmbedBuilder()
        .setTitle("🎟️ Ticket-Kategorien")
        .setDescription(
          "**Standard-Kategorien:** Wähle welche aktiv sein sollen.\n" +
          "**Custom-Kategorie:** Erstelle eine eigene — du kannst danach festlegen welche Role-Setup Rollen benachrichtigt werden."
        )
        .setColor(0x5865f2)
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("ticketsetup-select-categories")
          .setPlaceholder("🎟️ Standard-Kategorien auswählen (mehrere möglich)")
          .setMinValues(1)
          .setMaxValues(DEFAULT_CATEGORIES.length)
          .addOptions(options)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("ticketsetup-custom-category")
          .setLabel("➕ Custom Kategorie erstellen")
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  });
}

async function handleSetupSendPanel(interaction) {
  const cfg = await getOrCreateConfig(interaction.guild.id);

  if (!cfg.createChannelId) {
    return interaction.reply({
      content: "❌ Bitte konfiguriere zuerst den Erstell-Kanal.",
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
  if (!channel) return interaction.reply({ content: "❌ Erstell-Kanal nicht gefunden.", ephemeral: true });

  const options = cfg.categories.map(c =>
    new StringSelectMenuOptionBuilder()
      .setLabel(c.label)
      .setDescription(c.description)
      .setValue(c.id)
      .setEmoji(c.emoji)
  );

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("🎫 Ticket erstellen")
        .setDescription("Wähle eine Kategorie aus dem Menü um ein Ticket zu erstellen.\nUnser Team hilft dir so schnell wie möglich!")
        .setColor(0x5865f2)
        .setFooter({ text: "Du kannst nur 1 offenes Ticket gleichzeitig haben." })
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("ticket-create-menu")
          .setPlaceholder("Ticket-Art auswählen…")
          .addOptions(options)
      )
    ]
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

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getOrCreateConfig(guildId) {
  let cfg = await TicketConfig.findOne({ guildId });
  if (!cfg) cfg = await TicketConfig.create({ guildId });
  return cfg;
}

module.exports = { execute, showSetupOverview };