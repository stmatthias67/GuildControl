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
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const TicketConfig    = require("../models/TicketConfig");
const GuildConfig     = require("../models/GuildConfig");
const Ticket          = require("../models/Ticket");
const { ROLE_DEFINITIONS } = require("../utils/rolePermissions");

// ── Rollen-Hierarchie (höchste zuerst, aus ROLE_DEFINITIONS) ─────────────────
// Nur Staff-Rollen die für Higher-Staff relevant sind
const STAFF_HIERARCHY = [
  "projektleitung",
  "stv_projektleitung",
  "teamleitung",
  "stv_teamleitung",
  "admin",
  "test_admin",
  "moderator",
  "test_moderator",
  "supporter",
  "test_supporter"
];

/**
 * Gibt den höchsten Rollen-Key zurück den ein Member im Setup hat.
 * setupRoles: [{ key, roleId }]
 * memberRoles: Collection von Discord-Rollen des Members
 */
function getHighestStaffKey(member, setupRoles) {
  for (const key of STAFF_HIERARCHY) {
    const entry = setupRoles.find(r => r.key === key);
    if (entry && member.roles.cache.has(entry.roleId)) {
      return key;
    }
  }
  return null; // kein Staff
}

/**
 * Gibt den nächst höheren Staff-Key zurück, der über currentKey liegt.
 * Überspringt "test_*"-Varianten wenn der User selbst kein Test-Staff ist —
 * also: test_admin eskaliert zu admin, admin eskaliert zu teamleitung, etc.
 * Wenn der Caller selbst ein Test-Staff ist, wird die vollständige Rolle gerufen.
 * Wenn der Caller schon ein vollständiger Staff ist (z.B. admin), wird die nächste
 * Führungsrolle gerufen (teamleitung etc.).
 */
function getNextEscalationKey(currentKey) {
  const idx = STAFF_HIERARCHY.indexOf(currentKey);
  if (idx <= 0) return null; // Projektleitung → niemand höher

  // Suche die nächste HÖHERE Rolle (niedrigerer Index = höher)
  for (let i = idx - 1; i >= 0; i--) {
    const key = STAFF_HIERARCHY[i];
    // Wenn aktueller User ein Test-Staff ist → rufe die vollständige Variante
    if (currentKey.startsWith("test_")) {
      const fullKey = currentKey.replace("test_", "");
      return fullKey;
    }
    // Wenn aktueller User vollständiger Staff ist → rufe nächste Führungsebene
    // Überspringe test_* Zwischenstufen
    if (!key.startsWith("test_")) {
      return key;
    }
  }
  return null;
}

const {
  DEFAULT_CATEGORIES,
  createTicketV2,
  closeTicketV2,
  claimTicketV2,
  addUserToTicketV2
} = require("../utils/ticketManager");

// ── Konfiguration ─────────────────────────────────────────────────────────────
const MONGO_TIMEOUT_MS = 8000;
const MAX_RETRIES      = 2;

// ── MongoDB Timeout Wrapper ───────────────────────────────────────────────────
async function withMongoTimeout(operation, operationName, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await Promise.race([
        operation(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`MongoDB ${operationName} timeout`)), MONGO_TIMEOUT_MS)
        )
      ]);
    } catch (error) {
      console.error(`[MONGO ERROR] ${operationName} - Attempt ${attempt}/${retries}:`, error.message);
      if (attempt === retries) throw error;
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

// ── Setup Roles Cache ─────────────────────────────────────────────────────────
const setupRolesCache = new Map();
const CACHE_TTL = 30000;

async function getSetupRoles(guildId) {
  const cached = setupRolesCache.get(guildId);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) return cached.data;
  try {
    const config = await withMongoTimeout(() => GuildConfig.findOne({ guildId }), "findOne GuildConfig");
    const roles = config?.roles
      ? Object.entries(config.roles).filter(([, id]) => id).map(([key, roleId]) => ({ key, roleId }))
      : [];
    setupRolesCache.set(guildId, { data: roles, timestamp: Date.now() });
    return roles;
  } catch (error) {
    console.error("[MONGO ERROR] getSetupRoles failed:", error);
    return [];
  }
}

function clearSetupRolesCache(guildId) {
  setupRolesCache.delete(guildId);
}

async function getOrCreateConfig(guildId) {
  return withMongoTimeout(async () => {
    let cfg = await TicketConfig.findOne({ guildId });
    if (!cfg) cfg = await TicketConfig.create({ guildId });
    return cfg;
  }, "getOrCreateConfig");
}

// ── Übersichts-Embed & Komponenten ───────────────────────────────────────────

function buildOverviewEmbed(cfg, setupRoles = []) {
  const categories = cfg.categories.length
    ? cfg.categories.map(c => {
        const notifyMention = c.notifyRoleIds?.length
          ? c.notifyRoleIds.map(id => `<@&${id}>`).join(", ")
          : "*keine*";
        return `${c.emoji} **${c.label}** — Ping: ${notifyMention}`;
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
      { name: "🎟️ Kategorien & Benachrichtigungs-Rollen", value: categories, inline: false },
      { name: "👮 Verfügbare Rollen (Role Setup)", value: rolesText, inline: false },
      {
        name: "Status",
        value: cfg.setupDone ? "✅ Setup abgeschlossen" : "⚠️ Setup noch nicht abgeschlossen",
        inline: false
      }
    );
}

function buildOverviewComponents() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticketsetup-channels")
      .setLabel("Kanäle konfigurieren")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("📌"),
    new ButtonBuilder()
      .setCustomId("ticketsetup-categories")
      .setLabel("Kategorien konfigurieren")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🎟️"),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticketsetup-editroles")
      .setLabel("Benachrichtigungs-Rollen")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("👮"),
    new ButtonBuilder()
      .setCustomId("ticketsetup-maxtickets")
      .setLabel("Max. Tickets pro User")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🔢"),
    new ButtonBuilder()
      .setCustomId("ticketsetup-sendpanel")
      .setLabel("Ticket-Panel senden")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("📤"),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticketsetup-reset")
      .setLabel("Zurücksetzen")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🔄"),
    new ButtonBuilder()
      .setCustomId("setup-menu-back")
      .setLabel("Zurück")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("↩️"),
  );

  return [row1, row2, row3];
}

// ── Einstiegspunkt für setupHandler.js ───────────────────────────────────────

const showSetupOverview = async (interaction) => {
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate().catch(() => {});
    }
    const cfg        = await getOrCreateConfig(interaction.guild.id);
    const setupRoles = await getSetupRoles(interaction.guild.id);
    await interaction.editReply({
      embeds: [buildOverviewEmbed(cfg, setupRoles)],
      components: buildOverviewComponents()
    }).catch(() => {});
  } catch (error) {
    console.error("[SETUP ERROR] showSetupOverview:", error);
    const msg = "❌ Fehler beim Laden des Setups.";
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: msg, embeds: [], components: [] }).catch(() => {});
    } else {
      await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
    }
  }
};

// ── Haupt-Handler ─────────────────────────────────────────────────────────────

const execute = async (interaction, client) => {
  const id = interaction.customId;

  // ═══════════════════════════════════════════════════════════════════════════
  // SETUP FLOW
  // ═══════════════════════════════════════════════════════════════════════════

  if (id === "ticketsetup-channels") {
    try {
      await interaction.deferUpdate().catch(() => {});
      return handleSetupChannels(interaction);
    } catch (error) {
      console.error("[SETUP ERROR] ticketsetup  -channels:", error);
    }
    return;
  }

  if (id === "ticketsetup-categories") {
    try {
      await interaction.deferUpdate().catch(() => {});
      return handleSetupCategories(interaction);
    } catch (error) {
      console.error("[SETUP ERROR] ticketsetup-categories:", error);
    }
    return;
  }

  if (id === "ticketsetup-editroles") {
    try {
      await interaction.deferUpdate().catch(() => {});
      return handleEditRoles(interaction);
    } catch (error) {
      console.error("[SETUP ERROR] ticketsetup-editroles:", error);
    }
    return;
  }

  if (id === "ticketsetup-maxtickets") {
    try {
      await interaction.deferUpdate().catch(() => {});
      return handleSetupMaxTickets(interaction);
    } catch (error) {
      console.error("[SETUP ERROR] ticketsetup-maxtickets:", error);
    }
    return;
  }

  if (id === "ticketsetup-sendpanel") {
    try {
      await interaction.deferUpdate().catch(() => {});
      return handleSetupSendPanel(interaction);
    } catch (error) {
      console.error("[SETUP ERROR] ticketsetup-sendpanel:", error);
    }
    return;
  }

  // ── Kanäle: jeder Kanal wird einzeln gespeichert und zeigt danach die Übersicht ──

  if (id === "ticketsetup-select-create" && interaction.isChannelSelectMenu()) {
    try {
      await interaction.deferUpdate().catch(() => {});
      const cfg = await getOrCreateConfig(interaction.guild.id);
      cfg.createChannelId = interaction.values[0];
      await cfg.save();
      const setupRoles = await getSetupRoles(interaction.guild.id);
      // Kanal-Ansicht neu laden (mit aktualisierten Vorauswahlen)
      await handleSetupChannels(interaction, cfg);
    } catch (error) {
      console.error("[SETUP ERROR] ticketsetup-select-create:", error);
      await interaction.editReply({ content: "❌ Fehler beim Speichern.", embeds: [], components: [] }).catch(() => {});
    }
    return;
  }

  if (id === "ticketsetup-select-log" && interaction.isChannelSelectMenu()) {
    try {
      await interaction.deferUpdate().catch(() => {});
      const cfg = await getOrCreateConfig(interaction.guild.id);
      cfg.logChannelId = interaction.values[0];
      await cfg.save();
      await handleSetupChannels(interaction, cfg);
    } catch (error) {
      console.error("[SETUP ERROR] ticketsetup-select-log:", error);
      await interaction.editReply({ content: "❌ Fehler beim Speichern.", embeds: [], components: [] }).catch(() => {});
    }
    return;
  }

  if (id === "ticketsetup-select-claim" && interaction.isChannelSelectMenu()) {
    try {
      await interaction.deferUpdate().catch(() => {});
      const cfg = await getOrCreateConfig(interaction.guild.id);
      cfg.claimChannelId = interaction.values[0];
      await cfg.save();
      await handleSetupChannels(interaction, cfg);
    } catch (error) {
      console.error("[SETUP ERROR] ticketsetup-select-claim:", error);
      await interaction.editReply({ content: "❌ Fehler beim Speichern.", embeds: [], components: [] }).catch(() => {});
    }
    return;
  }

  // Zurück zur Übersicht-Button aus der Kanal-Ansicht
  if (id === "ticketsetup-channels-back" && interaction.isButton()) {
    try {
      await interaction.deferUpdate().catch(() => {});
      const cfg        = await getOrCreateConfig(interaction.guild.id);
      const setupRoles = await getSetupRoles(interaction.guild.id);
      await interaction.editReply({
        embeds: [buildOverviewEmbed(cfg, setupRoles)],
        components: buildOverviewComponents()
      }).catch(() => {});
    } catch (error) {
      console.error("[SETUP ERROR] ticketsetup-channels-back:", error);
    }
    return;
  }

  // ── Kategorien: vorausgewählt, danach Rollen-Flow ────────────────────────

  if (id === "ticketsetup-select-categories" && interaction.isStringSelectMenu()) {
    try {
      await interaction.deferUpdate().catch(() => {});
      const cfg      = await getOrCreateConfig(interaction.guild.id);
      const selected = interaction.values;

      // Bestehende notifyRoleIds für bereits konfigurierte Kategorien erhalten
      const existing = {};
      for (const c of cfg.categories) existing[c.id] = c.notifyRoleIds || [];

      cfg.categories = DEFAULT_CATEGORIES
        .filter(c => selected.includes(c.id))
        .map(c => ({ ...c, notifyRoleIds: existing[c.id] ?? [] }));
      await cfg.save();

      const setupRoles = await getSetupRoles(interaction.guild.id);
      if (setupRoles.length === 0) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle("⚠️ Keine Rollen konfiguriert")
              .setDescription(
                "Kategorien wurden gespeichert.\n\n" +
                "Im **Rollen Setup** sind noch keine Rollen konfiguriert — ohne Rollen werden bei neuen Tickets keine Mitarbeiter benachrichtigt.\n" +
                "Du kannst die Rollen später über **\"Benachrichtigungs-Rollen bearbeiten\"** zuweisen."
              )
              .setColor(0xfee75c)
          ],
          components: buildOverviewComponents()
        }).catch(() => {});
        return;
      }

      // Rollen-Zuweisung Schritt für Schritt starten
      await showCategoryRoleStep(interaction, cfg.categories, 0, setupRoles);
    } catch (error) {
      console.error("[SETUP ERROR] ticketsetup-select-categories:", error);
      await interaction.editReply({ content: "❌ Fehler beim Speichern der Kategorien.", embeds: [], components: [] }).catch(() => {});
    }
    return;
  }

  // ── Rollen-Zuweisung pro Kategorie (Select) ──────────────────────────────

  if (id.startsWith("ticketsetup-catroles-") && !id.startsWith("ticketsetup-catroles-skip-") && interaction.isStringSelectMenu()) {
    try {
      await interaction.deferUpdate().catch(() => {});
      const stepIndex  = parseInt(id.replace("ticketsetup-catroles-", ""), 10);
      const cfg        = await getOrCreateConfig(interaction.guild.id);
      const setupRoles = await getSetupRoles(interaction.guild.id);

      if (cfg.categories[stepIndex]) {
        cfg.categories[stepIndex].notifyRoleIds = interaction.values;
        cfg.markModified("categories");
        await cfg.save();
      }

      const nextIndex = stepIndex + 1;
      if (nextIndex < cfg.categories.length) {
        await showCategoryRoleStep(interaction, cfg.categories, nextIndex, setupRoles);
      } else {
        clearSetupRolesCache(interaction.guild.id);
        const finalRoles = await getSetupRoles(interaction.guild.id);
        await interaction.editReply({
          embeds: [buildOverviewEmbed(cfg, finalRoles)],
          components: buildOverviewComponents()
        }).catch(() => {});
      }
    } catch (error) {
      console.error("[SETUP ERROR] ticketsetup-catroles:", error);
      await interaction.editReply({ content: "❌ Fehler beim Speichern der Rollen.", embeds: [], components: [] }).catch(() => {});
    }
    return;
  }

  // ── Rollen-Zuweisung: Skip ───────────────────────────────────────────────

  if (id.startsWith("ticketsetup-catroles-skip-") && interaction.isButton()) {
    try {
      await interaction.deferUpdate().catch(() => {});
      const stepIndex  = parseInt(id.replace("ticketsetup-catroles-skip-", ""), 10);
      const cfg        = await getOrCreateConfig(interaction.guild.id);
      const setupRoles = await getSetupRoles(interaction.guild.id);

      if (cfg.categories[stepIndex]) {
        cfg.categories[stepIndex].notifyRoleIds = [];
        cfg.markModified("categories");
        await cfg.save();
      }

      const nextIndex = stepIndex + 1;
      if (nextIndex < cfg.categories.length) {
        await showCategoryRoleStep(interaction, cfg.categories, nextIndex, setupRoles);
      } else {
        clearSetupRolesCache(interaction.guild.id);
        const finalRoles = await getSetupRoles(interaction.guild.id);
        await interaction.editReply({
          embeds: [buildOverviewEmbed(cfg, finalRoles)],
          components: buildOverviewComponents()
        }).catch(() => {});
      }
    } catch (error) {
      console.error("[SETUP ERROR] ticketsetup-catroles-skip:", error);
      await interaction.editReply({ content: "❌ Fehler beim Überspringen.", embeds: [], components: [] }).catch(() => {});
    }
    return;
  }

  // Zurück zur Übersicht (aus Kategorien, Rollen-Flow, Panel)
  if (id === "ticketsetup-back-overview" && interaction.isButton()) {
    try {
      await interaction.deferUpdate().catch(() => {});
      const cfg        = await getOrCreateConfig(interaction.guild.id);
      const setupRoles = await getSetupRoles(interaction.guild.id);
      await interaction.editReply({
        embeds: [buildOverviewEmbed(cfg, setupRoles)],
        components: buildOverviewComponents()
      }).catch(() => {});
    } catch (error) {
      console.error("[SETUP ERROR] ticketsetup-back-overview:", error);
    }
    return;
  }

  // ── Panel senden ──────────────────────────────────────────────────────────

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

  // ── Setup abschließen ─────────────────────────────────────────────────────

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
      await interaction.editReply({ content: "❌ Fehler beim Abschließen.", embeds: [], components: [] }).catch(() => {});
    }
    return;
  }

  // ── Setup zurücksetzen ────────────────────────────────────────────────────

  if (id === "ticketsetup-reset") {
    try {
      await interaction.deferUpdate().catch(() => {});
      await withMongoTimeout(async () => {
        await TicketConfig.findOneAndUpdate(
          { guildId: interaction.guild.id },
          { createChannelId: null, logChannelId: null, claimChannelId: null, categories: [], setupDone: false }
        );
      }, "resetConfig");
      clearSetupRolesCache(interaction.guild.id);
      const cfg        = await getOrCreateConfig(interaction.guild.id);
      const setupRoles = await getSetupRoles(interaction.guild.id);
      await interaction.editReply({
        embeds: [buildOverviewEmbed(cfg, setupRoles)],
        components: buildOverviewComponents()
      }).catch(() => {});
    } catch (error) {
      console.error("[SETUP ERROR] ticketsetup-reset:", error);
      await interaction.editReply({ content: "❌ Fehler beim Zurücksetzen.", embeds: [], components: [] }).catch(() => {});
    }
    return;
  }

  // Max Tickets Modal Submit
  if (id === "ticketsetup-modal-maxtickets" && interaction.isModalSubmit()) {
    try {
      await interaction.deferUpdate().catch(() => {});
      const raw = interaction.fields.getTextInputValue("max-tickets-value").trim();
      const val = parseInt(raw, 10);
      if (isNaN(val) || val < 1 || val > 10) {
        await interaction.editReply({ content: "❌ Bitte gib eine Zahl zwischen 1 und 10 ein.", embeds: [], components: buildOverviewComponents() }).catch(() => {});
        return;
      }
      const cfg = await getOrCreateConfig(interaction.guild.id);
      cfg.maxTicketsPerUser = val;
      await cfg.save();
      const setupRoles = await getSetupRoles(interaction.guild.id);
      await interaction.editReply({
        embeds: [buildOverviewEmbed(cfg, setupRoles)],
        components: buildOverviewComponents()
      }).catch(() => {});
    } catch (error) {
      console.error("[SETUP ERROR] ticketsetup-modal-maxtickets:", error);
      await interaction.editReply({ content: "❌ Fehler beim Speichern.", embeds: [], components: [] }).catch(() => {});
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIVE TICKET AKTIONEN
  // ═══════════════════════════════════════════════════════════════════════════

  if (id === "ticket-create-menu" && interaction.isStringSelectMenu()) {
    console.log(`[TICKET CREATE] User: ${interaction.user.id}, Guild: ${interaction.guild.id}`);
    try {
      // update() statt deferReply → SelectMenu wird automatisch zurückgesetzt
      // sodass der User direkt wieder klicken kann
      await interaction.deferUpdate().catch(() => {});
      const categoryId = interaction.values[0];
      const result     = await createTicketV2(interaction.guild, interaction.user, categoryId);

      if (result.error === "setup_missing") {
        await interaction.followUp({ content: "❌ Das Ticket-System wurde noch nicht eingerichtet.", ephemeral: true });
        return;
      }
      if (result.error === "already_open") {
        const msg = result.max > 1
          ? `❌ Du hast bereits **${result.count}/${result.max}** offene Tickets. Schließe ein Ticket bevor du ein neues erstellst.`
          : `❌ Du hast bereits ein offenes Ticket: <#${result.channelId}>`;
        await interaction.followUp({ content: msg, ephemeral: true });
        return;
      }
      if (result.error === "invalid_category") {
        await interaction.followUp({ content: "❌ Ungültige Kategorie.", ephemeral: true });
        return;
      }
      if (result.error) {
        await interaction.followUp({ content: `❌ Fehler: ${result.error}`, ephemeral: true });
        return;
      }

      await interaction.followUp({ content: `✅ Dein Ticket wurde erstellt: <#${result.channel.id}>`, ephemeral: true });
    } catch (error) {
      console.error("[TICKET CREATE] Error:", error);
      const msg = error.message?.includes("buffering timed out")
        ? "❌ Datenbankverbindung timeout. Bitte erneut versuchen."
        : "❌ Fehler beim Erstellen des Tickets.";
      await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
    }
    return;
  }

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
            new ButtonBuilder().setCustomId(`ticket-close-confirm-${channelId}`).setLabel("Ja, schließen").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`ticket-close-cancel-${channelId}`).setLabel("Abbrechen").setStyle(ButtonStyle.Secondary)
          )
        ],
        ephemeral: true
      });
    } catch (error) {
      console.error("[TICKET CLOSE] Error showing confirmation:", error);
      if (!interaction.replied) await interaction.reply({ content: "❌ Fehler.", ephemeral: true }).catch(() => {});
    }
    return;
  }

  if (id.startsWith("ticket-close-confirm-") && interaction.isButton()) {
    try {
      const channelId = id.replace("ticket-close-confirm-", "");
      const channel   = interaction.guild.channels.cache.get(channelId);
      if (!channel) { await interaction.reply({ content: "❌ Kanal nicht gefunden.", ephemeral: true }); return; }
      await interaction.deferUpdate();
      await closeTicketV2(interaction.guild, channel, interaction.user.id);
    } catch (error) {
      console.error("[TICKET CLOSE] Error closing:", error);
      try { await interaction.editReply({ content: "❌ Fehler beim Schließen.", embeds: [], components: [] }); } catch {}
    }
    return;
  }

  if (id.startsWith("ticket-close-cancel-") && interaction.isButton()) {
    try { await interaction.update({ content: "❌ Abgebrochen.", embeds: [], components: [] }); }
    catch { if (!interaction.replied) await interaction.reply({ content: "❌ Abgebrochen.", ephemeral: true }).catch(() => {}); }
    return;
  }

  if (id.startsWith("ticket-claim-") && interaction.isButton()) {
    console.log(`[TICKET CLAIM] User: ${interaction.user.id}`);
    try {
      await interaction.deferUpdate().catch(() => {});
      const channelId = id.replace("ticket-claim-", "");
      const channel   = interaction.guild.channels.cache.get(channelId);
      if (!channel) { await interaction.followUp({ content: "❌ Ticket-Kanal nicht gefunden.", ephemeral: true }); return; }

      const result = await claimTicketV2(interaction.guild, channel, interaction.user);
      if (result.error === "not_found")      { await interaction.followUp({ content: "❌ Ticket nicht gefunden.", ephemeral: true }); return; }
      if (result.error === "already_claimed"){ await interaction.followUp({ content: `❌ Bereits geclaimt von <@${result.claimedBy}>.`, ephemeral: true }); return; }

      await interaction.followUp({ content: `✅ Du hast Ticket <#${channel.id}> übernommen.`, ephemeral: true });
    } catch (error) {
      console.error("[TICKET CLAIM] Error:", error);
      await interaction.followUp({ content: "❌ Fehler beim Claimen.", ephemeral: true }).catch(() => {});
    }
    return;
  }

  if (id.startsWith("ticket-adduser-") && !id.startsWith("ticket-adduser-modal-") && interaction.isButton()) {
    try {
      const channelId = id.replace("ticket-adduser-", "");
      const modal = new ModalBuilder()
        .setCustomId(`ticket-adduser-modal-${channelId}`)
        .setTitle("User zum Ticket hinzufügen");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("user-id").setLabel("User ID").setStyle(TextInputStyle.Short).setPlaceholder("123456789012345678").setRequired(true)
        )
      );
      await interaction.showModal(modal);
    } catch (error) {
      console.error("[TICKET ADDUSER] Error showing modal:", error);
      if (!interaction.replied) await interaction.reply({ content: "❌ Fehler.", ephemeral: true }).catch(() => {});
    }
    return;
  }

  if (id.startsWith("ticket-adduser-modal-") && interaction.isModalSubmit()) {
    try {
      const channelId  = id.replace("ticket-adduser-modal-", "");
      const userId     = interaction.fields.getTextInputValue("user-id").trim();
      await interaction.deferReply({ ephemeral: true });

      const targetUser = await interaction.guild.members.fetch(userId).catch(() => null);
      if (!targetUser) { await interaction.editReply({ content: "❌ User nicht gefunden." }); return; }

      const channel = interaction.guild.channels.cache.get(channelId);
      if (!channel)  { await interaction.editReply({ content: "❌ Ticket-Kanal nicht gefunden." }); return; }

      const result = await addUserToTicketV2(interaction.guild, channel, targetUser.user);
      if (result.error === "already_added") { await interaction.editReply({ content: "❌ Dieser User ist bereits im Ticket." }); return; }

      await channel.send({
        embeds: [new EmbedBuilder().setDescription(`👥 ${targetUser} wurde von ${interaction.user} zum Ticket hinzugefügt.`).setColor(0x57f287)]
      });
      await interaction.editReply({ content: `✅ ${targetUser} wurde hinzugefügt.` });
    } catch (error) {
      console.error("[TICKET ADDUSER] Error:", error);
      try {
        if (interaction.deferred) await interaction.editReply({ content: "❌ Fehler beim Hinzufügen." });
        else await interaction.reply({ content: "❌ Fehler beim Hinzufügen.", ephemeral: true });
      } catch {}
    }
    return;
  }

  if (id.startsWith("ticket-escalate-") && interaction.isButton()) {
    try {
      const setupRoles = await getSetupRoles(interaction.guild.id);
      const member     = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

      if (!member) {
        await interaction.reply({ content: "❌ Dein Member konnte nicht geladen werden.", ephemeral: true });
        return;
      }

      // Prüfen ob der User überhaupt Staff ist
      const callerKey = getHighestStaffKey(member, setupRoles);
      if (!callerKey) {
        await interaction.reply({
          content: "❌ Du bist kein Staff-Mitglied und kannst keinen Higher Staff rufen.",
          ephemeral: true
        });
        return;
      }

      // Nächst höhere Eskalationsstufe bestimmen
      const nextKey = getNextEscalationKey(callerKey);
      if (!nextKey) {
        await interaction.reply({
          content: "❌ Du bist bereits auf der höchsten Staff-Ebene. Es gibt niemanden höheren zu rufen.",
          ephemeral: true
        });
        return;
      }

      const nextRole = setupRoles.find(r => r.key === nextKey);
      if (!nextRole) {
        await interaction.reply({
          content: `❌ Die nächste Eskalationsstufe (**${nextKey}**) ist im Role Setup nicht konfiguriert.`,
          ephemeral: true
        });
        return;
      }

      // Aktuelle Ticket-Info für den Kontext
      const channel = interaction.channel;
      const ticket  = await Ticket.findOne({ channelId: channel.id, status: "open" }).catch(() => null);

      const callerDef = ROLE_DEFINITIONS.find(r => r.key === callerKey);
      const nextDef   = ROLE_DEFINITIONS.find(r => r.key === nextKey);

      const callerLabel = callerDef?.label ?? callerKey;
      const nextLabel   = nextDef?.label   ?? nextKey;

      await interaction.reply({
        content:
          `🚨 **Higher Staff benötigt!** <@&${nextRole.roleId}>

` +
          `${interaction.user} (${callerLabel}) benötigt Unterstützung in diesem Ticket.
` +
          `Angeforderte Ebene: **${nextLabel}**`
      });

    } catch (error) {
      console.error("[TICKET ESCALATE] Error:", error);
      if (!interaction.replied) await interaction.reply({ content: "❌ Fehler beim Eskalieren.", ephemeral: true }).catch(() => {});
    }
    return;
  }
};

// ── Setup-Schritte ────────────────────────────────────────────────────────────

/**
 * Zeigt die Kanal-Konfiguration mit bereits gespeicherten Werten vorausgewählt.
 * cfg kann optional übergeben werden (wenn schon geladen).
 */
async function handleSetupChannels(interaction, cfg = null) {
  try {
    if (!cfg) cfg = await getOrCreateConfig(interaction.guild.id);

    // ChannelSelectMenu unterstützt setDefaultChannels() ab discord.js v14.11+
    // Vorausgewählte Kanäle werden als defaultValues gesetzt
    const createMenu = new ChannelSelectMenuBuilder()
      .setCustomId("ticketsetup-select-create")
      .setPlaceholder("📌 Ticket-Erstell-Kanal auswählen")
      .addChannelTypes(ChannelType.GuildText);
    if (cfg.createChannelId) createMenu.setDefaultChannels([cfg.createChannelId]);

    const logMenu = new ChannelSelectMenuBuilder()
      .setCustomId("ticketsetup-select-log")
      .setPlaceholder("📋 Log-Kanal auswählen")
      .addChannelTypes(ChannelType.GuildText);
    if (cfg.logChannelId) logMenu.setDefaultChannels([cfg.logChannelId]);

    const claimMenu = new ChannelSelectMenuBuilder()
      .setCustomId("ticketsetup-select-claim")
      .setPlaceholder("📌 Claim-Kanal auswählen (optional)")
      .addChannelTypes(ChannelType.GuildText);
    if (cfg.claimChannelId) claimMenu.setDefaultChannels([cfg.claimChannelId]);

    const statusLines = [
      `Erstell-Kanal: ${cfg.createChannelId ? `✅ <#${cfg.createChannelId}>` : "❌ Nicht gesetzt"}`,
      `Log-Kanal:     ${cfg.logChannelId    ? `✅ <#${cfg.logChannelId}>`    : "❌ Nicht gesetzt"}`,
      `Claim-Kanal:   ${cfg.claimChannelId  ? `✅ <#${cfg.claimChannelId}>` : "*(optional, nicht gesetzt)*"}`
    ].join("\n");

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("📌 Kanäle konfigurieren")
          .setDescription("Wähle die Kanäle für das Ticket-System.\nDer Claim-Kanal ist optional.\n\n**Aktuell:**\n" + statusLines)
          .setColor(0x5865f2)
      ],
      components: [
        new ActionRowBuilder().addComponents(createMenu),
        new ActionRowBuilder().addComponents(logMenu),
        new ActionRowBuilder().addComponents(claimMenu),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("ticketsetup-channels-back")
            .setLabel("← Zurück zur Übersicht")
            .setStyle(ButtonStyle.Secondary)
        )
      ]
    });
  } catch (error) {
    console.error("[SETUP ERROR] handleSetupChannels:", error);
    await interaction.editReply({ content: "❌ Fehler beim Laden der Kanal-Auswahl.", embeds: [], components: [] }).catch(() => {});
  }
}

/**
 * Zeigt die Kategorien-Auswahl mit bereits aktiven Kategorien vorausgewählt.
 */
async function handleSetupCategories(interaction) {
  try {
    const cfg = await getOrCreateConfig(interaction.guild.id);
    const activeIds = new Set(cfg.categories.map(c => c.id));

    const options = DEFAULT_CATEGORIES.map(c =>
      new StringSelectMenuOptionBuilder()
        .setLabel(c.label)
        .setDescription(c.description)
        .setValue(c.id)
        .setEmoji(c.emoji)
        .setDefault(activeIds.has(c.id)) // ← vorausgewählt wenn bereits aktiv
    );

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🎟️ Ticket-Kategorien")
          .setDescription(
            "Wähle welche Ticket-Arten aktiv sein sollen.\n\n" +
            "⚠️ Bereits zugewiesene Benachrichtigungs-Rollen bleiben für wiedergewählte Kategorien erhalten."
          )
          .setColor(0x5865f2)
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("ticketsetup-select-categories")
            .setPlaceholder("🎟️ Kategorien auswählen (mehrere möglich)")
            .setMinValues(1)
            .setMaxValues(DEFAULT_CATEGORIES.length)
            .addOptions(options)
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("ticketsetup-back-overview")
            .setLabel("← Zurück zur Übersicht")
            .setStyle(ButtonStyle.Secondary)
        )
      ]
    });
  } catch (error) {
    console.error("[SETUP ERROR] handleSetupCategories:", error);
    await interaction.editReply({ content: "❌ Fehler beim Laden der Kategorien.", embeds: [], components: [] }).catch(() => {});
  }
}

/**
 * Direkt den Rollen-Bearbeitungs-Flow starten (ohne Kategorien neu wählen).
 * Startet beim ersten Schritt mit den bereits gespeicherten Kategorien.
 */
async function handleEditRoles(interaction) {
  try {
    const cfg        = await getOrCreateConfig(interaction.guild.id);
    const setupRoles = await getSetupRoles(interaction.guild.id);

    if (cfg.categories.length === 0) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("⚠️ Keine Kategorien konfiguriert")
            .setDescription("Konfiguriere zuerst die Kategorien, bevor du Rollen zuweist.")
            .setColor(0xfee75c)
        ],
        components: buildOverviewComponents()
      }).catch(() => {});
      return;
    }

    if (setupRoles.length === 0) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("⚠️ Keine Rollen konfiguriert")
            .setDescription("Im **Rollen Setup** sind noch keine Rollen konfiguriert.")
            .setColor(0xfee75c)
        ],
        components: buildOverviewComponents()
      }).catch(() => {});
      return;
    }

    await showCategoryRoleStep(interaction, cfg.categories, 0, setupRoles);
  } catch (error) {
    console.error("[SETUP ERROR] handleEditRoles:", error);
    await interaction.editReply({ content: "❌ Fehler beim Laden der Rollen-Bearbeitung.", embeds: [], components: [] }).catch(() => {});
  }
}

async function handleSetupSendPanel(interaction) {
  try {
    const cfg = await getOrCreateConfig(interaction.guild.id);
    if (!cfg.createChannelId || !cfg.logChannelId || cfg.categories.length === 0) {
      await interaction.editReply({
        content: "❌ Bitte konfiguriere zuerst Kanäle und mindestens eine Kategorie, bevor du das Panel sendest.",
        embeds: [],
        components: buildOverviewComponents(),
      });
      return;
    }
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("📤 Ticket-Panel senden")
          .setDescription(`Das Panel wird in <#${cfg.createChannelId}> gesendet.`)
          .setColor(0x5865f2)
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("ticketsetup-confirm-sendpanel").setLabel("Panel jetzt senden").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId("ticketsetup-back-overview").setLabel("← Zurück zur Übersicht").setStyle(ButtonStyle.Secondary)
        )
      ]
    });
  } catch (error) {
    console.error("[SETUP ERROR] handleSetupSendPanel:", error);
    await interaction.editReply({ content: "❌ Fehler.", embeds: [], components: [] }).catch(() => {});
  }
}

async function sendTicketPanel(interaction) {
  try {
    const cfg = await getOrCreateConfig(interaction.guild.id);
    if (!cfg.createChannelId || cfg.categories.length === 0) {
      await interaction.editReply({ content: "❌ Erstell-Kanal oder Kategorien fehlen.", embeds: [], components: buildOverviewComponents() });
      return;
    }
    const channel = interaction.guild.channels.cache.get(cfg.createChannelId);
    if (!channel) { await interaction.editReply({ content: "❌ Erstell-Kanal nicht gefunden.", embeds: [], components: buildOverviewComponents() }); return; }

    const options = cfg.categories.map(c =>
      new StringSelectMenuOptionBuilder().setLabel(c.label).setDescription(c.description).setValue(c.id).setEmoji(c.emoji)
    );

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("🎫 Ticket erstellen")
          .setDescription("Wähle eine Kategorie aus dem Menü um ein Ticket zu erstellen.\nUnser Team hilft dir so schnell wie möglich!")
          .setColor(0x5865f2)
          .setFooter({ text: "Du kannst nur 1 offenes Ticket gleichzeitig haben." })
      ],
      components: [new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId("ticket-create-menu").setPlaceholder("Ticket-Art auswählen…").addOptions(options)
      )]
    });

    await interaction.editReply({
      embeds: [new EmbedBuilder().setDescription(`✅ Panel wurde erfolgreich in <#${cfg.createChannelId}> gesendet.`).setColor(0x57f287)],
      components: []
    });
  } catch (error) {
    console.error("[SETUP ERROR] sendTicketPanel:", error);
    await interaction.editReply({ content: "❌ Fehler beim Senden des Panels.", embeds: [], components: buildOverviewComponents() }).catch(() => {});
  }
}

// ── Rollen-Zuweisung pro Kategorie ───────────────────────────────────────────

/**
 * Zeigt den Rollen-Auswahl-Schritt für eine Kategorie.
 * Bereits zugewiesene Rollen werden vorausgewählt (setDefaultValues).
 */
async function showCategoryRoleStep(interaction, categories, stepIndex, setupRoles) {
  const cat   = categories[stepIndex];
  const total = categories.length;
  const existingRoleIds = new Set(cat.notifyRoleIds || []);

  const options = setupRoles.map(r => {
    const label = r.key.charAt(0).toUpperCase() + r.key.slice(1);
    return new StringSelectMenuOptionBuilder()
      .setLabel(label)
      .setDescription(`<@&${r.roleId}>`)
      .setValue(r.roleId)
      .setDefault(existingRoleIds.has(r.roleId)); // ← vorausgewählt wenn bereits gesetzt
  });

  const currentRoles = existingRoleIds.size
    ? [...existingRoleIds].map(id => `<@&${id}>`).join(", ")
    : "*keine*";

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setTitle(`👮 Rollen für ${cat.emoji} ${cat.label} (${stepIndex + 1}/${total})`)
        .setDescription(
          `Wähle welche **Role-Setup Rollen** bei neuen **${cat.label}**-Tickets im Claim-Kanal benachrichtigt werden.\n\n` +
          `**Aktuell:** ${currentRoles}\n\n` +
          "Du kannst mehrere Rollen wählen oder den Schritt überspringen."
        )
        .setColor(0x5865f2)
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`ticketsetup-catroles-${stepIndex}`)
          .setPlaceholder("Rollen auswählen...")
          .setMinValues(1)
          .setMaxValues(setupRoles.length)
          .addOptions(options)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticketsetup-catroles-skip-${stepIndex}`)
          .setLabel("Keine Benachrichtigung / überspringen")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("ticketsetup-back-overview")
          .setLabel("← Zurück zur Übersicht")
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  }).catch(() => {});
}

async function handleSetupMaxTickets(interaction) {
  try {
    const cfg = await getOrCreateConfig(interaction.guild.id);
    const current = cfg.maxTicketsPerUser ?? 1;

    const modal = new ModalBuilder()
      .setCustomId("ticketsetup-modal-maxtickets")
      .setTitle("Max. Tickets pro User");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("max-tickets-value")
          .setLabel(`Aktuelle Einstellung: ${current} — Neue Zahl (1–10)`)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("z.B. 2")
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(2)
      )
    );

    await interaction.showModal(modal);
  } catch (error) {
    console.error("[SETUP ERROR] handleSetupMaxTickets:", error);
    if (!interaction.replied) await interaction.reply({ content: "❌ Fehler.", ephemeral: true }).catch(() => {});
  }
}

module.exports = { execute, showSetupOverview };