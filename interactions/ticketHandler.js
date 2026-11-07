/**
 * ticketHandler.js
 * Verarbeitet alle Button-, SelectMenu- und Modal-Interaktionen
 * für Live-Tickets (eingestellt wird im Web-Dashboard).
 *
 * CustomId-Präfixe:
 *   ticket-*        → Live-Ticket Aktionen
 *
 * Optimiert für: Keine Timeouts, keine "This interaction failed", MongoDB Timeout Schutz
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

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
  createTicketV2,
  closeTicketV2,
  claimTicketV2,
  addUserToTicketV2
} = require("../utils/ticketManager");
const { logCatch } = require('../utils/errorLogger');

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

// ── Haupt-Handler ─────────────────────────────────────────────────────────────

const execute = async (interaction, client) => {
  const id = interaction.customId;

  // ═══════════════════════════════════════════════════════════════════════════
  // LIVE TICKET AKTIONEN
  // ═══════════════════════════════════════════════════════════════════════════

  if (id === "ticket-create-menu" && interaction.isStringSelectMenu()) {
    console.log(`[TICKET CREATE] User: ${interaction.user.id}, Guild: ${interaction.guild.id}`);
    try {
      // update() statt deferReply → SelectMenu wird automatisch zurückgesetzt
      // sodass der User direkt wieder klicken kann
      await interaction.deferUpdate().catch(logCatch('ticketHandler.deferUpdate'));
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
      await interaction.followUp({ content: msg, ephemeral: true }).catch(logCatch('ticketHandler.followUp'));
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
      if (!interaction.replied) await interaction.reply({ content: "❌ Fehler.", ephemeral: true }).catch(logCatch('ticketHandler.reply'));
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
      try { await interaction.editReply({ content: "❌ Fehler beim Schließen.", embeds: [], components: [] }); } catch (e) { logCatch('ticketHandler.editReply')(e); }
    }
    return;
  }

  if (id.startsWith("ticket-close-cancel-") && interaction.isButton()) {
    try { await interaction.update({ content: "❌ Abgebrochen.", embeds: [], components: [] }); }
    catch { if (!interaction.replied) await interaction.reply({ content: "❌ Abgebrochen.", ephemeral: true }).catch(logCatch('ticketHandler.reply')); }
    return;
  }

  if (id.startsWith("ticket-claim-") && interaction.isButton()) {
    console.log(`[TICKET CLAIM] User: ${interaction.user.id}`);
    try {
      await interaction.deferUpdate().catch(logCatch('ticketHandler.deferUpdate'));
      const channelId = id.replace("ticket-claim-", "");
      const channel   = interaction.guild.channels.cache.get(channelId);
      if (!channel) { await interaction.followUp({ content: "❌ Ticket-Kanal nicht gefunden.", ephemeral: true }); return; }

      const result = await claimTicketV2(interaction.guild, channel, interaction.user);
      if (result.error === "not_found")      { await interaction.followUp({ content: "❌ Ticket nicht gefunden.", ephemeral: true }); return; }
      if (result.error === "already_claimed"){ await interaction.followUp({ content: `❌ Bereits geclaimt von <@${result.claimedBy}>.`, ephemeral: true }); return; }

      await interaction.followUp({ content: `✅ Du hast Ticket <#${channel.id}> übernommen.`, ephemeral: true });
    } catch (error) {
      console.error("[TICKET CLAIM] Error:", error);
      await interaction.followUp({ content: "❌ Fehler beim Claimen.", ephemeral: true }).catch(logCatch('ticketHandler.followUp'));
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
      if (!interaction.replied) await interaction.reply({ content: "❌ Fehler.", ephemeral: true }).catch(logCatch('ticketHandler.reply'));
    }
    return;
  }

  if (id.startsWith("ticket-adduser-modal-") && interaction.isModalSubmit()) {
    try {
      const channelId  = id.replace("ticket-adduser-modal-", "");
      const userId     = interaction.fields.getTextInputValue("user-id").trim();
      await interaction.deferReply({ ephemeral: true });

      const targetUser = await interaction.guild.members.fetch(userId).catch(logCatch('ticketHandler.fetch'));
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
      } catch (e) { logCatch('ticketHandler.reply')(e); }
    }
    return;
  }

  if (id.startsWith("ticket-escalate-") && interaction.isButton()) {
    try {
      const setupRoles = await getSetupRoles(interaction.guild.id);
      const member     = await interaction.guild.members.fetch(interaction.user.id).catch(logCatch('ticketHandler.fetch'));

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
      const ticket  = await Ticket.findOne({ channelId: channel.id, status: "open" }).catch(logCatch('ticketHandler.findOne'));

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
      if (!interaction.replied) await interaction.reply({ content: "❌ Fehler beim Eskalieren.", ephemeral: true }).catch(logCatch('ticketHandler.reply'));
    }
    return;
  }
};

module.exports = { execute };