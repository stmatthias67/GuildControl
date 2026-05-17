/**
 * ticketHandler.js
 * Verarbeitet alle Button-, SelectMenu- und Modal-Interaktionen
 * für das Ticket-System (Setup & Live-Tickets).
 *
 * CustomId-Präfixe:
 *   ticketsetup-*   → Setup-Flow
 *   ticket-*        → Live-Ticket Aktionen
 *
 * Optimiert für: Keine Timeouts, keine "This interaction failed", MongoDB Timeout Schutz
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

// ── Konfiguration ───────────────────────────────────────────────────────────
const MONGO_TIMEOUT_MS = 8000;
const MAX_RETRIES = 2;

// ── Hilfsfunktionen (mit Timeout & Retry) ───────────────────────────────────

/**
 * Führt eine MongoDB Operation mit Timeout und Retry aus
 */
async function withMongoTimeout(operation, operationName, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`MongoDB ${operationName} timeout after ${MONGO_TIMEOUT_MS}ms`)), MONGO_TIMEOUT_MS);
      });
      
      const result = await Promise.race([operation(), timeoutPromise]);
      return result;
    } catch (error) {
      console.error(`[MONGO ERROR] ${operationName} - Attempt ${attempt}/${retries}:`, error.message);
      
      if (attempt === retries) {
        throw error;
      }
      
      // Warte kurz vor Retry
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

/**
 * Liest alle konfigurierten Rollen aus GuildConfig (Role Setup) - mit Cache
 */
const setupRolesCache = new Map();
const CACHE_TTL = 30000; // 30 Sekunden

async function getSetupRoles(guildId) {
  const cached = setupRolesCache.get(guildId);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.data;
  }
  
  try {
    const config = await withMongoTimeout(
      () => GuildConfig.findOne({ guildId }),
      "findOne GuildConfig"
    );
    
    const roles = config?.roles 
      ? Object.entries(config.roles)
          .filter(([, id]) => id)
          .map(([key, roleId]) => ({ key, roleId }))
      : [];
    
    setupRolesCache.set(guildId, { data: roles, timestamp: Date.now() });
    return roles;
  } catch (error) {
    console.error("[MONGO ERROR] getSetupRoles failed:", error);
    return [];
  }
}

/**
 * Cleared Cache für eine Guild
 */
function clearSetupRolesCache(guildId) {
  setupRolesCache.delete(guildId);
}

/**
 * Holt oder erstellt TicketConfig - mit Timeout Schutz
 */
async function getOrCreateConfig(guildId) {
  return withMongoTimeout(async () => {
    let cfg = await TicketConfig.findOne({ guildId });
    if (!cfg) {
      cfg = await TicketConfig.create({ guildId });
    }
    return cfg;
  }, "getOrCreateConfig");
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
  try {
    // Sofort deferUpdate für Setup-Interaktionen
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate().catch(() => {});
    }
    
    const cfg = await getOrCreateConfig(interaction.guild.id);
    const setupRoles = await getSetupRoles(interaction.guild.id);
    
    await interaction.editReply({
      embeds: [buildOverviewEmbed(cfg, setupRoles)],
      components: buildOverviewComponents()
    }).catch(() => {});
  } catch (error) {
    console.error("[SETUP ERROR] showSetupOverview:", error);
    const errorMsg = "❌ Fehler beim Laden des Setups. Bitte versuche es später erneut.";
    
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: errorMsg, embeds: [], components: [] }).catch(() => {});
    } else {
      await interaction.reply({ content: errorMsg, ephemeral: true }).catch(() => {});
    }
  }
};

// ── Haupt-Handler ─────────────────────────────────────────────────────────────

const execute = async (interaction, client) => {
  const id = interaction.customId;
  
  // ═══════════════════════════════════════════════════════
  // SETUP FLOW
  // ═══════════════════════════════════════════════════════

  // StringSelectMenu im Setup - sofort deferUpdate
  if (id === "ticketsetup-menu" && interaction.isStringSelectMenu()) {
    try {
      await interaction.deferUpdate().catch(() => {});
      const value = interaction.values[0];
      
      if (value === "channels")   return handleSetupChannels(interaction);
      if (value === "categories") return handleSetupCategories(interaction);
      if (value === "sendpanel")  return handleSetupSendPanel(interaction);
    } catch (error) {
      console.error("[SETUP ERROR] ticketsetup-menu:", error);
    }
    return;
  }

  // Kanal-Auswahl: Erstell-Kanal
  if (id === "ticketsetup-select-create" && interaction.isChannelSelectMenu()) {
    try {
      await interaction.deferUpdate().catch(() => {});
      const cfg = await getOrCreateConfig(interaction.guild.id);
      cfg.createChannelId = interaction.values[0];
      await cfg.save();
      clearSetupRolesCache(interaction.guild.id);
      const setupRoles = await getSetupRoles(interaction.guild.id);
      await interaction.editReply({
        embeds: [buildOverviewEmbed(cfg, setupRoles)],
        components: buildOverviewComponents()
      }).catch(() => {});
    } catch (error) {
      console.error("[SETUP ERROR] ticketsetup-select-create:", error);
      await interaction.editReply({ content: "❌ Fehler beim Speichern des Kanals.", embeds: [], components: [] }).catch(() => {});
    }
    return;
  }

  // Kanal-Auswahl: Log-Kanal
  if (id === "ticketsetup-select-log" && interaction.isChannelSelectMenu()) {
    try {
      await interaction.deferUpdate().catch(() => {});
      const cfg = await getOrCreateConfig(interaction.guild.id);
      cfg.logChannelId = interaction.values[0];
      await cfg.save();
      clearSetupRolesCache(interaction.guild.id);
      const setupRoles = await getSetupRoles(interaction.guild.id);
      await interaction.editReply({
        embeds: [buildOverviewEmbed(cfg, setupRoles)],
        components: buildOverviewComponents()
      }).catch(() => {});
    } catch (error) {
      console.error("[SETUP ERROR] ticketsetup-select-log:", error);
      await interaction.editReply({ content: "❌ Fehler beim Speichern des Log-Kanals.", embeds: [], components: [] }).catch(() => {});
    }
    return;
  }

  // Kanal-Auswahl: Claim-Kanal
  if (id === "ticketsetup-select-claim" && interaction.isChannelSelectMenu()) {
    try {
      await interaction.deferUpdate().catch(() => {});
      const cfg = await getOrCreateConfig(interaction.guild.id);
      cfg.claimChannelId = interaction.values[0];
      await cfg.save();
      clearSetupRolesCache(interaction.guild.id);
      const setupRoles = await getSetupRoles(interaction.guild.id);
      await interaction.editReply({
        embeds: [buildOverviewEmbed(cfg, setupRoles)],
        components: buildOverviewComponents()
      }).catch(() => {});
    } catch (error) {
      console.error("[SETUP ERROR] ticketsetup-select-claim:", error);
      await interaction.editReply({ content: "❌ Fehler beim Speichern des Claim-Kanals.", embeds: [], components: [] }).catch(() => {});
    }
    return;
  }

  // Kategorien-Auswahl (Standard-Kategorien)
  if (id === "ticketsetup-select-categories" && interaction.isStringSelectMenu()) {
    try {
      await interaction.deferUpdate().catch(() => {});
      const cfg = await getOrCreateConfig(interaction.guild.id);
      const selected = interaction.values;
      const customs = cfg.categories.filter(c => c.custom);
      const standards = DEFAULT_CATEGORIES.filter(c => selected.includes(c.id));
      cfg.categories = [...standards, ...customs];
      await cfg.save();
      clearSetupRolesCache(interaction.guild.id);
      const setupRoles = await getSetupRoles(interaction.guild.id);
      await interaction.editReply({
        embeds: [buildOverviewEmbed(cfg, setupRoles)],
        components: buildOverviewComponents()
      }).catch(() => {});
    } catch (error) {
      console.error("[SETUP ERROR] ticketsetup-select-categories:", error);
      await interaction.editReply({ content: "❌ Fehler beim Speichern der Kategorien.", embeds: [], components: [] }).catch(() => {});
    }
    return;
  }

  // Custom Kategorie – Button → Modal öffnen
  if (id === "ticketsetup-custom-category") {
    try {
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

      await interaction.showModal(modal);
    } catch (error) {
      console.error("[SETUP ERROR] ticketsetup-custom-category:", error);
      if (!interaction.replied) {
        await interaction.reply({ content: "❌ Fehler beim Öffnen des Modals.", ephemeral: true }).catch(() => {});
      }
    }
    return;
  }

  // Custom Kategorie – Modal Submit → danach Rollen-Auswahl zeigen
  if (id === "ticketsetup-modal-customcat" && interaction.isModalSubmit()) {
    try {
      await interaction.deferUpdate().catch(() => {});
      
      const label = interaction.fields.getTextInputValue("cat-label");
      const description = interaction.fields.getTextInputValue("cat-description");
      const emoji = interaction.fields.getTextInputValue("cat-emoji") || "🎫";
      const customId = `custom-${Date.now()}`;

      const cfg = await getOrCreateConfig(interaction.guild.id);
      cfg.categories.push({ id: customId, label, description, emoji, custom: true, notifyRoleIds: [] });
      await cfg.save();
      clearSetupRolesCache(interaction.guild.id);

      const setupRoles = await getSetupRoles(interaction.guild.id);

      if (setupRoles.length === 0) {
        await interaction.editReply({
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
        }).catch(() => {});
        return;
      }

      const options = setupRoles.map(r => {
        const roleName = r.key.charAt(0).toUpperCase() + r.key.slice(1);
        return new StringSelectMenuOptionBuilder()
          .setLabel(roleName)
          .setDescription(`ID: ${r.roleId}`)
          .setValue(`${customId}::${r.roleId}`);
      });

      await interaction.editReply({
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
      }).catch(() => {});
    } catch (error) {
      console.error("[SETUP ERROR] ticketsetup-modal-customcat:", error);
      await interaction.editReply({ content: "❌ Fehler beim Erstellen der Kategorie.", embeds: [], components: [] }).catch(() => {});
    }
    return;
  }

  // Custom Kategorie – Rollen gespeichert
  if (id === "ticketsetup-customcat-roles" && interaction.isStringSelectMenu()) {
    try {
      await interaction.deferUpdate().catch(() => {});
      const cfg = await getOrCreateConfig(interaction.guild.id);

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
      clearSetupRolesCache(interaction.guild.id);
      
      const setupRoles = await getSetupRoles(interaction.guild.id);
      await interaction.editReply({
        embeds: [buildOverviewEmbed(cfg, setupRoles)],
        components: buildOverviewComponents()
      }).catch(() => {});
    } catch (error) {
      console.error("[SETUP ERROR] ticketsetup-customcat-roles:", error);
      await interaction.editReply({ content: "❌ Fehler beim Speichern der Rollen.", embeds: [], components: [] }).catch(() => {});
    }
    return;
  }

  // Custom Kategorie – Keine Benachrichtigung (Skip)
  if (id.startsWith("ticketsetup-customcat-noroles::") && interaction.isButton()) {
    try {
      await interaction.deferUpdate().catch(() => {});
      const customCatId = id.replace("ticketsetup-customcat-noroles::", "");
      const cfg = await getOrCreateConfig(interaction.guild.id);
      const cat = cfg.categories.find(c => c.id === customCatId);
      if (cat) {
        cat.notifyRoleIds = [];
        cfg.markModified("categories");
        await cfg.save();
        clearSetupRolesCache(interaction.guild.id);
      }
      const setupRoles = await getSetupRoles(interaction.guild.id);
      await interaction.editReply({
        embeds: [buildOverviewEmbed(cfg, setupRoles)],
        components: buildOverviewComponents()
      }).catch(() => {});
    } catch (error) {
      console.error("[SETUP ERROR] ticketsetup-customcat-noroles:", error);
      await interaction.editReply({ content: "❌ Fehler beim Überspringen.", embeds: [], components: [] }).catch(() => {});
    }
    return;
  }

  // Panel senden – Bestätigungs-Button
  if (id === "ticketsetup-confirm-sendpanel") {
    try {
      await interaction.deferUpdate().catch(() => {});
      await sendTicketPanel(interaction);
    } catch (error) {
      console.error("[SETUP ERROR] ticketsetup-confirm-sendpanel:", error);
      await interaction.editReply({ content: "❌ Fehler beim Senden des Panels.", embeds: [], components: [] }).catch(() => {});
    }
    return;
  }

  // Setup abschließen
  if (id === "ticketsetup-finish") {
    try {
      await interaction.deferUpdate().catch(() => {});
      const cfg = await getOrCreateConfig(interaction.guild.id);
      
      if (!cfg.createChannelId || !cfg.logChannelId || cfg.categories.length === 0) {
        await interaction.editReply({
          content: "❌ Bitte konfiguriere zuerst Kanäle und mindestens eine Kategorie.",
          embeds: [],
          components: buildOverviewComponents()
        }).catch(() => {});
        return;
      }
      
      cfg.setupDone = true;
      await cfg.save();
      clearSetupRolesCache(interaction.guild.id);
      
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("✅ Setup abgeschlossen!")
            .setDescription("Das Ticket-System ist jetzt aktiv. Sende das Panel im gewünschten Kanal.")
            .setColor(0x57f287)
        ],
        components: buildOverviewComponents()
      }).catch(() => {});
    } catch (error) {
      console.error("[SETUP ERROR] ticketsetup-finish:", error);
      await interaction.editReply({ content: "❌ Fehler beim Abschließen des Setups.", embeds: [], components: [] }).catch(() => {});
    }
    return;
  }

  // Setup zurücksetzen
  if (id === "ticketsetup-reset") {
    try {
      await interaction.deferUpdate().catch(() => {});
      
      await withMongoTimeout(async () => {
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
      }, "resetConfig");
      
      clearSetupRolesCache(interaction.guild.id);
      const cfg = await getOrCreateConfig(interaction.guild.id);
      const setupRoles = await getSetupRoles(interaction.guild.id);
      
      await interaction.editReply({
        embeds: [buildOverviewEmbed(cfg, setupRoles)],
        components: buildOverviewComponents()
      }).catch(() => {});
    } catch (error) {
      console.error("[SETUP ERROR] ticketsetup-reset:", error);
      await interaction.editReply({ content: "❌ Fehler beim Zurücksetzen des Setups.", embeds: [], components: [] }).catch(() => {});
    }
    return;
  }

  // ═══════════════════════════════════════════════════════
  // LIVE TICKET AKTIONEN
  // ═══════════════════════════════════════════════════════

  // Ticket erstellen - WICHTIG: Sofort deferReply für Timeout-Schutz
  if (id === "ticket-create-menu" && interaction.isStringSelectMenu()) {
    console.log(`[TICKET CREATE] User: ${interaction.user.id}, Guild: ${interaction.guild.id}`);
    
    try {
      // Sofort deferReply, bevor irgendwas anderes passiert
      await interaction.deferReply({ ephemeral: true });
      
      const categoryId = interaction.values[0];
      
      const result = await createTicketV2(interaction.guild, interaction.user, categoryId);

      if (result.error === "setup_missing") {
        await interaction.editReply({ content: "❌ Das Ticket-System wurde noch nicht eingerichtet." });
        return;
      }
      
      if (result.error === "already_open") {
        await interaction.editReply({ content: `❌ Du hast bereits ein offenes Ticket: <#${result.channelId}>` });
        return;
      }
      
      if (result.error === "invalid_category") {
        await interaction.editReply({ content: "❌ Ungültige Kategorie." });
        return;
      }
      
      if (result.error) {
        await interaction.editReply({ content: `❌ Fehler beim Erstellen des Tickets: ${result.error}` });
        return;
      }

      await interaction.editReply({ content: `✅ Dein Ticket wurde erstellt: <#${result.channel.id}>` });
      console.log(`[TICKET CREATE] Erfolgreich: ${result.channel.id}`);
      
    } catch (error) {
      console.error("[TICKET CREATE] Error:", error);
      const errorMsg = error.message?.includes("buffering timed out") 
        ? "❌ Datenbankverbindung timeout. Bitte versuche es gleich erneut."
        : "❌ Fehler beim Erstellen des Tickets. Bitte versuche es später erneut.";
      
      try {
        if (interaction.deferred) {
          await interaction.editReply({ content: errorMsg });
        } else {
          await interaction.reply({ content: errorMsg, ephemeral: true });
        }
      } catch (replyError) {
        console.error("[TICKET CREATE] Failed to reply:", replyError);
      }
    }
    return;
  }

  // Ticket schließen – Bestätigung anzeigen
  if (
    id.startsWith("ticket-close-") &&
    !id.startsWith("ticket-close-confirm-") &&
    !id.startsWith("ticket-close-cancel-") &&
    interaction.isButton()
  ) {
    try {
      const channelId = id.replace("ticket-close-", "");
      await interaction.reply({
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
    } catch (error) {
      console.error("[TICKET CLOSE] Error showing confirmation:", error);
      if (!interaction.replied) {
        await interaction.reply({ content: "❌ Fehler beim Öffnen der Bestätigung.", ephemeral: true }).catch(() => {});
      }
    }
    return;
  }

  // Bestätigung: Ja, schließen
  if (id.startsWith("ticket-close-confirm-") && interaction.isButton()) {
    console.log(`[TICKET CLOSE] User: ${interaction.user.id}, Channel: ${id}`);
    
    try {
      const channelId = id.replace("ticket-close-confirm-", "");
      const channel = interaction.guild.channels.cache.get(channelId);
      
      if (!channel) {
        await interaction.reply({ content: "❌ Kanal nicht gefunden.", ephemeral: true });
        return;
      }
      
      await interaction.deferUpdate();
      await closeTicketV2(interaction.guild, channel, interaction.user.id);
      console.log(`[TICKET CLOSE] Erfolgreich geschlossen: ${channelId}`);
      
    } catch (error) {
      console.error("[TICKET CLOSE] Error closing:", error);
      try {
        await interaction.editReply({ content: "❌ Fehler beim Schließen des Tickets.", embeds: [], components: [] });
      } catch (replyError) {
        console.error("[TICKET CLOSE] Failed to reply:", replyError);
      }
    }
    return;
  }

  // Bestätigung: Abbrechen
  if (id.startsWith("ticket-close-cancel-") && interaction.isButton()) {
    try {
      await interaction.update({ content: "❌ Abgebrochen.", embeds: [], components: [] });
    } catch (error) {
      console.error("[TICKET CLOSE] Error cancel:", error);
      if (!interaction.replied) {
        await interaction.reply({ content: "❌ Abgebrochen.", ephemeral: true }).catch(() => {});
      }
    }
    return;
  }

  // Ticket claimen (Button kommt aus dem Claim-Kanal)
  if (id.startsWith("ticket-claim-") && interaction.isButton()) {
    console.log(`[TICKET CLAIM] User: ${interaction.user.id}, CustomId: ${id}`);
    
    try {
      // Sofort deferUpdate, damit der Claim-Kanal-Button nicht "failed" zeigt
      await interaction.deferUpdate().catch(() => {});

      const channelId = id.replace("ticket-claim-", "");
      const channel   = interaction.guild.channels.cache.get(channelId);
      
      if (!channel) {
        await interaction.followUp({ content: "❌ Ticket-Kanal nicht gefunden.", ephemeral: true });
        return;
      }

      const result = await claimTicketV2(interaction.guild, channel, interaction.user);

      if (result.error === "not_found") {
        await interaction.followUp({ content: "❌ Ticket nicht gefunden.", ephemeral: true });
        return;
      }
      
      if (result.error === "already_claimed") {
        await interaction.followUp({ content: `❌ Bereits geclaimt von <@${result.claimedBy}>.`, ephemeral: true });
        return;
      }

      // Bestätigung nur für den Staffer ephemeral (die Nachricht im Ticket-Kanal
      // kommt bereits aus claimTicketV2 in ticketManager.js)
      await interaction.followUp({ content: `✅ Du hast Ticket <#${channel.id}> übernommen.`, ephemeral: true });
      console.log(`[TICKET CLAIM] Erfolgreich geclaimt von ${interaction.user.id}`);
      
    } catch (error) {
      console.error("[TICKET CLAIM] Error:", error);
      await interaction.followUp({ content: "❌ Fehler beim Claimen des Tickets.", ephemeral: true }).catch(() => {});
    }
    return;
  }

  // User hinzufügen – Button → Modal
  if (
    id.startsWith("ticket-adduser-") &&
    !id.startsWith("ticket-adduser-modal-") &&
    interaction.isButton()
  ) {
    try {
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
      
      await interaction.showModal(modal);
    } catch (error) {
      console.error("[TICKET ADDUSER] Error showing modal:", error);
      if (!interaction.replied) {
        await interaction.reply({ content: "❌ Fehler beim Öffnen des Modals.", ephemeral: true }).catch(() => {});
      }
    }
    return;
  }

  // User hinzufügen – Modal Submit
  if (id.startsWith("ticket-adduser-modal-") && interaction.isModalSubmit()) {
    try {
      const channelId = id.replace("ticket-adduser-modal-", "");
      const userId = interaction.fields.getTextInputValue("user-id").trim();
      
      await interaction.deferReply({ ephemeral: true });

      const targetUser = await interaction.guild.members.fetch(userId).catch(() => null);
      if (!targetUser) {
        await interaction.editReply({ content: "❌ User nicht gefunden." });
        return;
      }

      const channel = interaction.guild.channels.cache.get(channelId);
      if (!channel) {
        await interaction.editReply({ content: "❌ Ticket-Kanal nicht gefunden." });
        return;
      }

      const result = await addUserToTicketV2(interaction.guild, channel, targetUser.user);
      
      if (result.error === "already_added") {
        await interaction.editReply({ content: "❌ Dieser User ist bereits im Ticket." });
        return;
      }

      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setDescription(`👥 ${targetUser} wurde von ${interaction.user} zum Ticket hinzugefügt.`)
            .setColor(0x57f287)
        ]
      });
      
      await interaction.editReply({ content: `✅ ${targetUser} wurde hinzugefügt.` });
      
    } catch (error) {
      console.error("[TICKET ADDUSER] Error adding user:", error);
      try {
        if (interaction.deferred) {
          await interaction.editReply({ content: "❌ Fehler beim Hinzufügen des Users." });
        } else {
          await interaction.reply({ content: "❌ Fehler beim Hinzufügen des Users.", ephemeral: true });
        }
      } catch (replyError) {
        console.error("[TICKET ADDUSER] Failed to reply:", replyError);
      }
    }
    return;
  }

  // Higher Staff eskalieren
  if (id.startsWith("ticket-escalate-") && interaction.isButton()) {
    try {
      const setupRoles = await getSetupRoles(interaction.guild.id);
      const adminRole = setupRoles.find(r => r.key === "admin") || setupRoles.find(r => r.key === "owner");
      const ping = adminRole
        ? `<@&${adminRole.roleId}>`
        : "*(keine Admin-Rolle im Role Setup konfiguriert)*";

      await interaction.reply({
        content: `🚨 **Higher Staff benötigt!** ${ping}\n\n${interaction.user} benötigt Hilfe in diesem Ticket.`
      });
    } catch (error) {
      console.error("[TICKET ESCALATE] Error:", error);
      if (!interaction.replied) {
        await interaction.reply({ content: "❌ Fehler beim Eskalieren.", ephemeral: true }).catch(() => {});
      }
    }
    return;
  }
};

// ── Setup-Schritte ────────────────────────────────────────────────────────────

async function handleSetupChannels(interaction) {
  try {
    await interaction.editReply({
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
  } catch (error) {
    console.error("[SETUP ERROR] handleSetupChannels:", error);
    await interaction.editReply({ content: "❌ Fehler beim Laden der Kanal-Auswahl.", embeds: [], components: [] }).catch(() => {});
  }
}

async function handleSetupCategories(interaction) {
  try {
    const options = DEFAULT_CATEGORIES.map(c =>
      new StringSelectMenuOptionBuilder()
        .setLabel(c.label)
        .setDescription(c.description)
        .setValue(c.id)
        .setEmoji(c.emoji)
    );

    await interaction.editReply({
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
  } catch (error) {
    console.error("[SETUP ERROR] handleSetupCategories:", error);
    await interaction.editReply({ content: "❌ Fehler beim Laden der Kategorien.", embeds: [], components: [] }).catch(() => {});
  }
}

async function handleSetupSendPanel(interaction) {
  try {
    const cfg = await getOrCreateConfig(interaction.guild.id);

    if (!cfg.createChannelId) {
      await interaction.editReply({
        content: "❌ Bitte konfiguriere zuerst den Erstell-Kanal.",
        embeds: [],
        components: buildOverviewComponents()
      });
      return;
    }

    await interaction.editReply({
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
  } catch (error) {
    console.error("[SETUP ERROR] handleSetupSendPanel:", error);
    await interaction.editReply({ content: "❌ Fehler beim Vorbereiten des Panels.", embeds: [], components: [] }).catch(() => {});
  }
}

async function sendTicketPanel(interaction) {
  try {
    const cfg = await getOrCreateConfig(interaction.guild.id);

    if (!cfg.createChannelId || cfg.categories.length === 0) {
      await interaction.editReply({
        content: "❌ Erstell-Kanal oder Kategorien fehlen noch.",
        embeds: [],
        components: buildOverviewComponents()
      });
      return;
    }

    const channel = interaction.guild.channels.cache.get(cfg.createChannelId);
    if (!channel) {
      await interaction.editReply({ content: "❌ Erstell-Kanal nicht gefunden.", embeds: [], components: buildOverviewComponents() });
      return;
    }

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

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setDescription(`✅ Panel wurde erfolgreich in <#${cfg.createChannelId}> gesendet.`)
          .setColor(0x57f287)
      ],
      components: []
    });
  } catch (error) {
    console.error("[SETUP ERROR] sendTicketPanel:", error);
    await interaction.editReply({ content: "❌ Fehler beim Senden des Panels.", embeds: [], components: buildOverviewComponents() }).catch(() => {});
  }
}

module.exports = { execute, showSetupOverview };