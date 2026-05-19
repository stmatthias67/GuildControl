'use strict';

/**
 * rankSetupHandler.js
 * Verarbeitet alle Interaktionen des Rank Setup Systems.
 * Präfix: ranksetup-*
 *
 * Flow:
 *   setupHandler.js → showRankSetup() → Übersicht
 *   Buttons/Selects/Modals → handleRankSetupInteraction()
 */

const RankConfig = require('../models/RankConfig');
const LevelRole  = require('../models/LevelRole');
const { TEMPLATES } = require('../models/LevelRole');

const {
  buildOverviewEmbed,
  buildOverviewComponents,
  buildGrundeinstellungenModal,
  buildLevelUpEmbed,
  buildLevelUpComponents,
  buildLevelUpMessageModal,
  buildIgnoredChannelsEmbed,
  buildIgnoredChannelsComponents,
  buildIgnoredRolesEmbed,
  buildIgnoredRolesComponents,
  buildRangRollenEmbed,
  buildRangRollenOverviewComponents,
  buildRangSlotEmbed,
  buildRangSlotComponents,
  buildRangLevelModal,
  buildLeaderboardEmbed,
  buildLeaderboardComponents,
  buildLeaderboardPageSizeModal,
  buildResetEmbed,
  buildResetComponents,
} = require('../utils/rankBuilder');

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

/**
 * Holt oder erstellt eine RankConfig für die Guild.
 */
async function getOrCreateRankConfig(guildId) {
  return RankConfig.findOneAndUpdate(
    { guildId },
    { $setOnInsert: { guildId } },
    { upsert: true, new: true }
  );
}

/**
 * Zeigt die Übersicht (wird auch von setupHandler aufgerufen).
 */
async function showRankSetup(interaction) {
  const guildId    = interaction.guild.id;
  const rankConfig = await getOrCreateRankConfig(guildId);

  const embed      = buildOverviewEmbed(rankConfig, interaction.guild);
  const components = buildOverviewComponents(rankConfig);

  // Beim ersten Aufruf kommt es von einem Select Menu → update
  // Bei Zurück-Buttons ebenfalls → update
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply({ embeds: [embed], components });
  }
  return interaction.update({ embeds: [embed], components });
}

/**
 * Zeigt die Rang-Rollen Übersicht.
 */
async function showRangRollen(interaction, templateSet = null) {
  const guildId    = interaction.guild.id;
  const rankConfig = await getOrCreateRankConfig(guildId);
  const template   = templateSet ?? rankConfig.templateSet ?? 'klassisch';
  const levelRoles = await LevelRole.find({ guildId });

  const embed      = buildRangRollenEmbed(template, levelRoles);
  const components = buildRangRollenOverviewComponents(template);

  return interaction.update({ embeds: [embed], components });
}

/**
 * Zeigt den Konfigurations-Screen für einen einzelnen Rang-Slot.
 */
async function showRangSlot(interaction, slotKey) {
  const guildId  = interaction.guild.id;
  const rankConfig = await getOrCreateRankConfig(guildId);
  const template = rankConfig.templateSet ?? 'klassisch';
  const slots    = TEMPLATES[template] ?? TEMPLATES.klassisch;
  const slot     = slots.find(s => s.key === slotKey);

  if (!slot) {
    return interaction.reply({ content: '❌ Rang nicht gefunden.', ephemeral: true });
  }

  const savedRole = await LevelRole.findOne({ guildId, rankKey: slotKey });

  const embed      = buildRangSlotEmbed(slot, savedRole);
  const components = buildRangSlotComponents(slotKey, savedRole);

  return interaction.update({ embeds: [embed], components });
}

// ═════════════════════════════════════════════════════════════════════════════
// HAUPT-HANDLER
// ═════════════════════════════════════════════════════════════════════════════

async function handleRankSetupInteraction(interaction) {
  const id      = interaction.customId;
  const guildId = interaction.guild.id;

  // ── Zurück zur Übersicht ───────────────────────────────────────────────────
  if (id === 'ranksetup-back') {
    return showRankSetup(interaction);
  }

  // ── Zurück zur Rang-Rollen Übersicht ──────────────────────────────────────
  if (id === 'ranksetup-rangrollen-back') {
    return showRangRollen(interaction);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOGGLE: XP SYSTEM AN/AUS
  // ═══════════════════════════════════════════════════════════════════════════
  if (id === 'ranksetup-toggle') {
    const rankConfig = await getOrCreateRankConfig(guildId);
    rankConfig.enabled = !rankConfig.enabled;
    await rankConfig.save();

    const embed      = buildOverviewEmbed(rankConfig, interaction.guild);
    const components = buildOverviewComponents(rankConfig);

    return interaction.update({ embeds: [embed], components });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GRUNDEINSTELLUNGEN
  // ═══════════════════════════════════════════════════════════════════════════
  if (id === 'ranksetup-grundeinstellungen') {
    const rankConfig = await getOrCreateRankConfig(guildId);
    const modal      = buildGrundeinstellungenModal(rankConfig);
    return interaction.showModal(modal);
  }

  if (id === 'ranksetup-modal-grundeinstellungen') {
    const xpMin  = parseInt(interaction.fields.getTextInputValue('xp_min'),        10);
    const xpMax  = parseInt(interaction.fields.getTextInputValue('xp_max'),        10);
    const cd     = parseInt(interaction.fields.getTextInputValue('xp_cooldown'),   10);
    const mult   = parseFloat(interaction.fields.getTextInputValue('xp_multiplier'));

    // Validierung
    if (isNaN(xpMin) || isNaN(xpMax) || isNaN(cd) || isNaN(mult)) {
      return interaction.reply({ content: '❌ Ungültige Eingabe. Bitte nur Zahlen eingeben.', ephemeral: true });
    }
    if (xpMin < 1 || xpMax < xpMin) {
      return interaction.reply({ content: '❌ Min XP muss kleiner als Max XP sein.', ephemeral: true });
    }
    if (cd < 0) {
      return interaction.reply({ content: '❌ Cooldown kann nicht negativ sein.', ephemeral: true });
    }
    if (mult <= 0) {
      return interaction.reply({ content: '❌ Multiplikator muss größer als 0 sein.', ephemeral: true });
    }

    const rankConfig = await RankConfig.findOneAndUpdate(
      { guildId },
      {
        $set: {
          'xp.minPerMessage': xpMin,
          'xp.maxPerMessage': xpMax,
          'xp.cooldown':      cd,
          'xp.multiplier':    mult,
        },
      },
      { upsert: true, new: true }
    );

    const embed      = buildOverviewEmbed(rankConfig, interaction.guild);
    const components = buildOverviewComponents(rankConfig);

    return interaction.update({ embeds: [embed], components });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL-UP NACHRICHTEN
  // ═══════════════════════════════════════════════════════════════════════════
  if (id === 'ranksetup-levelup') {
    const rankConfig = await getOrCreateRankConfig(guildId);
    const embed      = buildLevelUpEmbed(rankConfig, interaction.guild);
    const components = buildLevelUpComponents(rankConfig);
    return interaction.update({ embeds: [embed], components });
  }

  // Level-Up Kanal auswählen (ChannelSelectMenu)
  if (id === 'ranksetup-levelup-channel') {
    const channelId  = interaction.values[0] ?? null;
    const rankConfig = await RankConfig.findOneAndUpdate(
      { guildId },
      { $set: { 'levelUp.channelId': channelId } },
      { upsert: true, new: true }
    );

    const embed      = buildLevelUpEmbed(rankConfig, interaction.guild);
    const components = buildLevelUpComponents(rankConfig);
    return interaction.update({ embeds: [embed], components });
  }

  // Level-Up Nachrichten Toggle
  if (id === 'ranksetup-levelup-toggle') {
    const rankConfig = await getOrCreateRankConfig(guildId);
    rankConfig.levelUp.enabled = !rankConfig.levelUp.enabled;
    await rankConfig.save();

    const embed      = buildLevelUpEmbed(rankConfig, interaction.guild);
    const components = buildLevelUpComponents(rankConfig);
    return interaction.update({ embeds: [embed], components });
  }

  // Level-Up Nachricht Modal öffnen
  if (id === 'ranksetup-levelup-message') {
    const rankConfig = await getOrCreateRankConfig(guildId);
    const modal      = buildLevelUpMessageModal(rankConfig);
    return interaction.showModal(modal);
  }

  // Level-Up Nachricht Modal Submit
  if (id === 'ranksetup-modal-levelup-message') {
    const message    = interaction.fields.getTextInputValue('levelup_message');
    const rankConfig = await RankConfig.findOneAndUpdate(
      { guildId },
      { $set: { 'levelUp.message': message } },
      { upsert: true, new: true }
    );

    const embed      = buildLevelUpEmbed(rankConfig, interaction.guild);
    const components = buildLevelUpComponents(rankConfig);
    return interaction.update({ embeds: [embed], components });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // IGNORIERTE KANÄLE
  // ═══════════════════════════════════════════════════════════════════════════
  if (id === 'ranksetup-ignored-channels') {
    const rankConfig = await getOrCreateRankConfig(guildId);
    const embed      = buildIgnoredChannelsEmbed(rankConfig, interaction.guild);
    const components = buildIgnoredChannelsComponents();
    return interaction.update({ embeds: [embed], components });
  }

  // Kanal zur Ignorierliste hinzufügen
  if (id === 'ranksetup-ignored-channels-add') {
    const newIds     = interaction.values;
    const rankConfig = await RankConfig.findOneAndUpdate(
      { guildId },
      { $addToSet: { ignoredChannels: { $each: newIds } } },
      { upsert: true, new: true }
    );

    const embed      = buildIgnoredChannelsEmbed(rankConfig, interaction.guild);
    const components = buildIgnoredChannelsComponents();
    return interaction.update({ embeds: [embed], components });
  }

  // Ignorierliste leeren
  if (id === 'ranksetup-ignored-channels-clear') {
    const rankConfig = await RankConfig.findOneAndUpdate(
      { guildId },
      { $set: { ignoredChannels: [] } },
      { upsert: true, new: true }
    );

    const embed      = buildIgnoredChannelsEmbed(rankConfig, interaction.guild);
    const components = buildIgnoredChannelsComponents();
    return interaction.update({ embeds: [embed], components });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // IGNORIERTE ROLLEN
  // ═══════════════════════════════════════════════════════════════════════════
  if (id === 'ranksetup-ignored-roles') {
    const rankConfig = await getOrCreateRankConfig(guildId);
    const embed      = buildIgnoredRolesEmbed(rankConfig);
    const components = buildIgnoredRolesComponents();
    return interaction.update({ embeds: [embed], components });
  }

  // Rolle zur Ignorierliste hinzufügen
  if (id === 'ranksetup-ignored-roles-add') {
    const newIds     = interaction.values;
    const rankConfig = await RankConfig.findOneAndUpdate(
      { guildId },
      { $addToSet: { ignoredRoles: { $each: newIds } } },
      { upsert: true, new: true }
    );

    const embed      = buildIgnoredRolesEmbed(rankConfig);
    const components = buildIgnoredRolesComponents();
    return interaction.update({ embeds: [embed], components });
  }

  // Ignorierliste leeren
  if (id === 'ranksetup-ignored-roles-clear') {
    const rankConfig = await RankConfig.findOneAndUpdate(
      { guildId },
      { $set: { ignoredRoles: [] } },
      { upsert: true, new: true }
    );

    const embed      = buildIgnoredRolesEmbed(rankConfig);
    const components = buildIgnoredRolesComponents();
    return interaction.update({ embeds: [embed], components });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RANG-ROLLEN
  // ═══════════════════════════════════════════════════════════════════════════

  // Rang-Rollen Übersicht öffnen
  if (id === 'ranksetup-rangrollen') {
    return showRangRollen(interaction);
  }

  // Vorlage wechseln
  if (id === 'ranksetup-rangrollen-template') {
    const template = interaction.values[0];
    await RankConfig.findOneAndUpdate(
      { guildId },
      { $set: { templateSet: template } },
      { upsert: true, new: true }
    );
    return showRangRollen(interaction, template);
  }

  // Einzelnen Rang öffnen (Button: ranksetup-rangrollen-configure:bronze)
  if (id.startsWith('ranksetup-rangrollen-configure:')) {
    const slotKey = id.split(':')[1];
    return showRangSlot(interaction, slotKey);
  }

  // Bestehende Rolle zuweisen (RoleSelectMenu: ranksetup-rangrollen-select:bronze)
  if (id.startsWith('ranksetup-rangrollen-select:')) {
    const slotKey  = id.split(':')[1];
    const roleId   = interaction.values[0];
    const rankConfig = await getOrCreateRankConfig(guildId);
    const template = rankConfig.templateSet ?? 'klassisch';
    const slots    = TEMPLATES[template] ?? TEMPLATES.klassisch;
    const slot     = slots.find(s => s.key === slotKey);

    if (!slot) {
      return interaction.reply({ content: '❌ Rang nicht gefunden.', ephemeral: true });
    }

    await LevelRole.findOneAndUpdate(
      { guildId, rankKey: slotKey },
      {
        $set: {
          rankLabel:     slot.label,
          rankEmoji:     slot.emoji,
          rankColor:     slot.color,
          roleId,
          templateSet:   template,
          autoCreated:   false,
        },
      },
      { upsert: true, new: true }
    );

    const savedRole = await LevelRole.findOne({ guildId, rankKey: slotKey });
    const embed      = buildRangSlotEmbed(slot, savedRole);
    const components = buildRangSlotComponents(slotKey, savedRole);
    return interaction.update({ embeds: [embed], components });
  }

  // Rolle automatisch erstellen (ranksetup-rangrollen-create:bronze)
  if (id.startsWith('ranksetup-rangrollen-create:')) {
    const slotKey    = id.split(':')[1];
    const rankConfig = await getOrCreateRankConfig(guildId);
    const template   = rankConfig.templateSet ?? 'klassisch';
    const slots      = TEMPLATES[template] ?? TEMPLATES.klassisch;
    const slot       = slots.find(s => s.key === slotKey);

    if (!slot) {
      return interaction.reply({ content: '❌ Rang nicht gefunden.', ephemeral: true });
    }

    await interaction.deferUpdate();

    try {
      // Prüfen ob Rolle schon existiert (gleicher Name)
      const existingRole = interaction.guild.roles.cache.find(r => r.name === `${slot.emoji} ${slot.label}`);
      let role = existingRole;

      if (!role) {
        role = await interaction.guild.roles.create({
          name:   `${slot.emoji} ${slot.label}`,
          color:  slot.color,
          reason: `GuildControl Rank Setup – ${slot.label}`,
        });
      }

      // In DB speichern
      const savedRole = await LevelRole.findOneAndUpdate(
        { guildId, rankKey: slotKey },
        {
          $set: {
            rankLabel:   slot.label,
            rankEmoji:   slot.emoji,
            rankColor:   slot.color,
            roleId:      role.id,
            templateSet: template,
            autoCreated: !existingRole, // nur true wenn wirklich neu erstellt
          },
        },
        { upsert: true, new: true }
      );

      const embed      = buildRangSlotEmbed(slot, savedRole);
      const components = buildRangSlotComponents(slotKey, savedRole);

      return interaction.editReply({ embeds: [embed], components });

    } catch (err) {
      console.error('[RankSetup] Fehler beim Erstellen der Rang-Rolle:', err);
      return interaction.editReply({
        content:    `❌ Fehler beim Erstellen der Rolle: \`${err.message}\``,
        embeds:     [],
        components: [],
      });
    }
  }

  // Level-Schwelle Modal öffnen (ranksetup-rangrollen-level:bronze)
  if (id.startsWith('ranksetup-rangrollen-level:')) {
    const slotKey    = id.split(':')[1];
    const rankConfig = await getOrCreateRankConfig(guildId);
    const template   = rankConfig.templateSet ?? 'klassisch';
    const slots      = TEMPLATES[template] ?? TEMPLATES.klassisch;
    const slot       = slots.find(s => s.key === slotKey);

    if (!slot) {
      return interaction.reply({ content: '❌ Rang nicht gefunden.', ephemeral: true });
    }

    const savedRole = await LevelRole.findOne({ guildId, rankKey: slotKey });
    const modal     = buildRangLevelModal(slot, savedRole);
    return interaction.showModal(modal);
  }

  // Level-Schwelle Modal Submit (ranksetup-modal-ranglevel:bronze)
  if (id.startsWith('ranksetup-modal-ranglevel:')) {
    const slotKey      = id.split(':')[1];
    const levelRequired = parseInt(interaction.fields.getTextInputValue('level_required'), 10);

    if (isNaN(levelRequired) || levelRequired < 1) {
      return interaction.reply({ content: '❌ Bitte eine gültige Zahl (≥ 1) eingeben.', ephemeral: true });
    }

    await LevelRole.findOneAndUpdate(
      { guildId, rankKey: slotKey },
      { $set: { levelRequired } },
      { upsert: true, new: true }
    );

    const rankConfig = await getOrCreateRankConfig(guildId);
    const template   = rankConfig.templateSet ?? 'klassisch';
    const slots      = TEMPLATES[template] ?? TEMPLATES.klassisch;
    const slot       = slots.find(s => s.key === slotKey);
    const savedRole  = await LevelRole.findOne({ guildId, rankKey: slotKey });

    const embed      = buildRangSlotEmbed(slot, savedRole);
    const components = buildRangSlotComponents(slotKey, savedRole);
    return interaction.update({ embeds: [embed], components });
  }

  // Rang-Zuweisung entfernen (ranksetup-rangrollen-remove:bronze)
  if (id.startsWith('ranksetup-rangrollen-remove:')) {
    const slotKey = id.split(':')[1];

    await LevelRole.findOneAndDelete({ guildId, rankKey: slotKey });

    const rankConfig = await getOrCreateRankConfig(guildId);
    const template   = rankConfig.templateSet ?? 'klassisch';
    const slots      = TEMPLATES[template] ?? TEMPLATES.klassisch;
    const slot       = slots.find(s => s.key === slotKey);

    const embed      = buildRangSlotEmbed(slot, null);
    const components = buildRangSlotComponents(slotKey, null);
    return interaction.update({ embeds: [embed], components });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEADERBOARD
  // ═══════════════════════════════════════════════════════════════════════════
  if (id === 'ranksetup-leaderboard') {
    const rankConfig = await getOrCreateRankConfig(guildId);
    const embed      = buildLeaderboardEmbed(rankConfig);
    const components = buildLeaderboardComponents(rankConfig);
    return interaction.update({ embeds: [embed], components });
  }

  if (id === 'ranksetup-leaderboard-toggle') {
    const rankConfig = await getOrCreateRankConfig(guildId);
    rankConfig.leaderboard.enabled = !(rankConfig.leaderboard.enabled ?? true);
    await rankConfig.save();

    const embed      = buildLeaderboardEmbed(rankConfig);
    const components = buildLeaderboardComponents(rankConfig);
    return interaction.update({ embeds: [embed], components });
  }

  if (id === 'ranksetup-leaderboard-pagesize') {
    const rankConfig = await getOrCreateRankConfig(guildId);
    const modal      = buildLeaderboardPageSizeModal(rankConfig);
    return interaction.showModal(modal);
  }

  if (id === 'ranksetup-modal-leaderboard-pagesize') {
    const size = parseInt(interaction.fields.getTextInputValue('page_size'), 10);

    if (isNaN(size) || size < 1 || size > 25) {
      return interaction.reply({ content: '❌ Bitte eine Zahl zwischen 1 und 25 eingeben.', ephemeral: true });
    }

    const rankConfig = await RankConfig.findOneAndUpdate(
      { guildId },
      { $set: { 'leaderboard.pageSize': size } },
      { upsert: true, new: true }
    );

    const embed      = buildLeaderboardEmbed(rankConfig);
    const components = buildLeaderboardComponents(rankConfig);
    return interaction.update({ embeds: [embed], components });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESET
  // ═══════════════════════════════════════════════════════════════════════════
  if (id === 'ranksetup-reset') {
    const embed      = buildResetEmbed();
    const components = buildResetComponents();
    return interaction.update({ embeds: [embed], components });
  }

  if (id === 'ranksetup-reset-confirm') {
    await interaction.deferUpdate();
    try {
      // RankConfig löschen & neu anlegen (leer)
      await RankConfig.findOneAndDelete({ guildId });
      // Rang-Rollen Zuweisungen löschen (Discord-Rollen selbst bleiben)
      await LevelRole.deleteMany({ guildId });

      const rankConfig = await getOrCreateRankConfig(guildId);
      const embed      = buildOverviewEmbed(rankConfig, interaction.guild);
      const components = buildOverviewComponents(rankConfig);

      return interaction.editReply({ embeds: [embed], components });

    } catch (err) {
      console.error('[RankSetup] Fehler beim Reset:', err);
      return interaction.editReply({
        content:    '❌ Fehler beim Zurücksetzen.',
        embeds:     [],
        components: [],
      });
    }
  }
}

module.exports = { showRankSetup, handleRankSetupInteraction };
