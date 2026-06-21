'use strict';

/**
 * rankBuilder.js
 * Baut alle Embeds & Discord-Komponenten für das Rank Setup System.
 * Analog zu setupBuilder.js – selbes Pattern, selbe Konventionen.
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const { TEMPLATES } = require('../models/LevelRole');

// ─── Farb-Konstanten ──────────────────────────────────────────────────────────
const COLOR_MAIN    = 0x5865F2; // Blurple – Übersicht
const COLOR_SUCCESS = 0x57F287; // Grün
const COLOR_WARNING = 0xFEE75C; // Gelb
const COLOR_DANGER  = 0xED4245; // Rot
const COLOR_RANK    = 0xFFD700; // Gold – Rang-Rollen Screen

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

/** Gibt einen formatierten Wert oder einen Fallback-String zurück. */
const fmt = {
  bool:    (v)  => v ? '✅ Aktiv'       : '❌ Inaktiv',
  channel: (id) => id ? `<#${id}>`      : '`Nicht gesetzt`',
  role:    (id) => id ? `<@&${id}>`     : '`Nicht gesetzt`',
  num:     (v)  => v !== undefined && v !== null ? `\`${v}\`` : '`–`',
  str:     (v)  => v ? `\`${v}\``       : '`Nicht gesetzt`',
};

// ═════════════════════════════════════════════════════════════════════════════
// 1. ÜBERSICHT EMBED
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Haupt-Übersicht des Rank Setups.
 * @param {object} rankConfig  – RankConfig Dokument aus MongoDB
 * @param {object} guild       – Discord Guild
 */
function buildOverviewEmbed(rankConfig, guild) {
  const cfg = rankConfig ?? {};
  const xp  = cfg.xp ?? {};
  const lu  = cfg.levelUp ?? {};
  const lb  = cfg.leaderboard ?? {};

  return new EmbedBuilder()
    .setTitle('📈 Rank Setup — Übersicht')
    .setColor(COLOR_MAIN)
    .setDescription(
      `Konfiguriere das Level & XP System für **${guild.name}**.\n` +
      `Klicke auf einen Button um die jeweiligen Einstellungen zu öffnen.`
    )
    .addFields(
      {
        name:   '⚡ System Status',
        value:  fmt.bool(cfg.enabled),
        inline: true,
      },
      {
        name:   '📢 Level-Up Kanal',
        value:  fmt.channel(lu.channelId),
        inline: true,
      },
      {
        name:   '🔔 Level-Up Nachrichten',
        value:  fmt.bool(lu.enabled),
        inline: true,
      },
      {
        name:   '🎯 XP pro Nachricht',
        value:  `\`${xp.minPerMessage ?? 15}–${xp.maxPerMessage ?? 25}\` XP`,
        inline: true,
      },
      {
        name:   '⏱️ Cooldown',
        value:  `\`${xp.cooldown ?? 60}s\``,
        inline: true,
      },
      {
        name:   '✖️ Multiplikator',
        value:  `\`x${xp.multiplier ?? 1.0}\``,
        inline: true,
      },
      {
        name:   '🚫 Ignorierte Kanäle',
        value:  (cfg.ignoredChannels?.length ?? 0) > 0
                  ? cfg.ignoredChannels.map(id => `<#${id}>`).join(', ')
                  : '`Keine`',
        inline: true,
      },
      {
        name:   '🚫 Ignorierte Rollen',
        value:  (cfg.ignoredRoles?.length ?? 0) > 0
                  ? cfg.ignoredRoles.map(id => `<@&${id}>`).join(', ')
                  : '`Keine`',
        inline: true,
      },
      {
        name:   '🏆 Vorlage',
        value:  fmt.str(cfg.templateSet ?? 'klassisch'),
        inline: true,
      },
    )
    .setFooter({ text: `GuildControl • Rank Setup • ${guild.name}` })
    .setTimestamp();
}

/**
 * Buttons für die Übersicht.
 * Row 1: Toggle | Grundeinstellungen | Level-Up
 * Row 2: Ignorierte Kanäle | Ignorierte Rollen | Rang-Rollen | Leaderboard | Reset
 */

function buildOverviewComponents(rankConfig) {
  const enabled = rankConfig?.enabled ?? false;

  const row1 = new ActionRowBuilder().addComponents(
    // Toggle: GRÜN wenn aktivierbar, ROT wenn deaktivierbar
    new ButtonBuilder()
      .setCustomId('ranksetup-toggle')
      .setLabel(enabled ? '🔴 XP System deaktivieren' : '🟢 XP System aktivieren')
      .setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('ranksetup-grundeinstellungen')
      .setLabel('⚙️ Grundeinstellungen')
      .setStyle(ButtonStyle.Primary),          // BLAU – Einstellung ✓
    new ButtonBuilder()
      .setCustomId('ranksetup-levelup')
      .setLabel('📢 Level-Up Nachricht')
      .setStyle(ButtonStyle.Primary),          // BLAU – Einstellung ✓
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ranksetup-ignored-channels')
      .setLabel('🚫 Ignorierte Kanäle')
      .setStyle(ButtonStyle.Primary),          // BLAU – Einstellung ✓
    new ButtonBuilder()
      .setCustomId('ranksetup-ignored-roles')
      .setLabel('🚫 Ignorierte Rollen')
      .setStyle(ButtonStyle.Primary),          // BLAU – Einstellung ✓
    new ButtonBuilder()
      .setCustomId('ranksetup-rangrollen')
      .setLabel('🏆 Rang-Rollen')
      .setStyle(ButtonStyle.Primary),          // BLAU – Einstellung ✓
    new ButtonBuilder()
      .setCustomId('ranksetup-leaderboard')
      .setLabel('📊 Leaderboard')
      .setStyle(ButtonStyle.Primary),          // BLAU – Einstellung ✓
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ranksetup-reset')
      .setLabel('🗑️ Alle Daten zurücksetzen')
      .setStyle(ButtonStyle.Danger),           // ROT – Destruktive Aktion ✓
    new ButtonBuilder()
      .setCustomId('setup-finish')
      .setLabel('✅ Setup abschließen')
      .setStyle(ButtonStyle.Success),          // GRÜN – Abschließen ✓
    new ButtonBuilder()
      .setCustomId('ranksetup-back-main')
      .setLabel('← Zurück zum Setup')
      .setStyle(ButtonStyle.Secondary),        // GRAU – Navigation ✓
  );

  return [row1, row2, row3];
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. GRUNDEINSTELLUNGEN MODAL
// ═════════════════════════════════════════════════════════════════════════════

function buildGrundeinstellungenModal(rankConfig) {
  const xp = rankConfig?.xp ?? {};
  return new ModalBuilder()
    .setCustomId('ranksetup-modal-grundeinstellungen')
    .setTitle('⚙️ Grundeinstellungen')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('xp_min')
          .setLabel('Min XP pro Nachricht (Standard: 15)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(4)
          .setValue(String(xp.minPerMessage ?? 15)),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('xp_max')
          .setLabel('Max XP pro Nachricht (Standard: 25)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(4)
          .setValue(String(xp.maxPerMessage ?? 25)),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('xp_cooldown')
          .setLabel('Cooldown in Sekunden (Standard: 60)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(5)
          .setValue(String(xp.cooldown ?? 60)),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('xp_multiplier')
          .setLabel('XP Multiplikator (z.B. 1.5 = 150%)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(5)
          .setValue(String(xp.multiplier ?? 1.0)),
      ),
    );
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. LEVEL-UP SCREEN
// ═════════════════════════════════════════════════════════════════════════════

function buildLevelUpEmbed(rankConfig, guild) {
  const lu = rankConfig?.levelUp ?? {};
  return new EmbedBuilder()
    .setTitle('📢 Level-Up Nachrichten')
    .setColor(COLOR_SUCCESS)
    .setDescription('Konfiguriere wo und wie Level-Up Nachrichten gesendet werden.')
    .addFields(
      { name: 'Status',   value: fmt.bool(lu.enabled),       inline: true },
      { name: 'Kanal',    value: fmt.channel(lu.channelId),  inline: true },
      { name: 'Nachricht', value: `\`${lu.message ?? '🎉 {user} hat **Level {level}** erreicht!'}\``, inline: false },
    )
    .addFields({
      name: '💡 Platzhalter',
      value: '`{user}` → Erwähnung\n`{level}` → Neues Level\n`{username}` → Username',
      inline: false,
    })
    .setFooter({ text: 'GuildControl • Rank Setup' })
    .setTimestamp();
}

function buildLevelUpComponents(rankConfig) {
  const lu = rankConfig?.levelUp ?? {};
  return [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('ranksetup-levelup-channel')
        .setPlaceholder('📢 Level-Up Kanal auswählen (leer = aktueller Kanal)')
        .setChannelTypes(ChannelType.GuildText)
        .setMinValues(0)
        .setMaxValues(1),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ranksetup-levelup-toggle')
        .setLabel(lu.enabled !== false ? '🔕 Nachrichten deaktivieren' : '🔔 Nachrichten aktivieren')
        .setStyle(lu.enabled !== false ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('ranksetup-levelup-message')
        .setLabel('✏️ Nachricht bearbeiten')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('ranksetup-back')
        .setLabel('← Zurück')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function buildLevelUpMessageModal(rankConfig) {
  const lu = rankConfig?.levelUp ?? {};
  return new ModalBuilder()
    .setCustomId('ranksetup-modal-levelup-message')
    .setTitle('✏️ Level-Up Nachricht')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('levelup_message')
          .setLabel('Nachrichtentext ({user}, {level}, {username})')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(500)
          .setValue(lu.message ?? '🎉 {user} hat **Level {level}** erreicht!'),
      ),
    );
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. IGNORIERTE KANÄLE
// ═════════════════════════════════════════════════════════════════════════════

function buildIgnoredChannelsEmbed(rankConfig, guild) {
  const list = rankConfig?.ignoredChannels ?? [];
  return new EmbedBuilder()
    .setTitle('🚫 Ignorierte Kanäle')
    .setColor(COLOR_WARNING)
    .setDescription(
      'In diesen Kanälen wird **kein XP** vergeben.\n' +
      'Wähle einen Kanal aus dem Menü um ihn hinzuzufügen oder zu entfernen.'
    )
    .addFields({
      name:  `Aktuelle Liste (${list.length})`,
      value: list.length > 0 ? list.map(id => `<#${id}>`).join('\n') : '`Keine`',
    })
    .setFooter({ text: 'GuildControl • Rank Setup' })
    .setTimestamp();
}

function buildIgnoredChannelsComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('ranksetup-ignored-channels-add')
        .setPlaceholder('➕ Kanal zur Ignorierliste hinzufügen')
        .setChannelTypes(ChannelType.GuildText)
        .setMinValues(1)
        .setMaxValues(5),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ranksetup-ignored-channels-clear')
        .setLabel('🗑️ Liste leeren')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('ranksetup-back')
        .setLabel('← Zurück')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. IGNORIERTE ROLLEN
// ═════════════════════════════════════════════════════════════════════════════

function buildIgnoredRolesEmbed(rankConfig) {
  const list = rankConfig?.ignoredRoles ?? [];
  return new EmbedBuilder()
    .setTitle('🚫 Ignorierte Rollen')
    .setColor(COLOR_WARNING)
    .setDescription(
      'Mitglieder mit diesen Rollen erhalten **kein XP**.\n' +
      'Wähle eine Rolle aus dem Menü um sie hinzuzufügen oder zu entfernen.'
    )
    .addFields({
      name:  `Aktuelle Liste (${list.length})`,
      value: list.length > 0 ? list.map(id => `<@&${id}>`).join('\n') : '`Keine`',
    })
    .setFooter({ text: 'GuildControl • Rank Setup' })
    .setTimestamp();
}

function buildIgnoredRolesComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId('ranksetup-ignored-roles-add')
        .setPlaceholder('➕ Rolle zur Ignorierliste hinzufügen')
        .setMinValues(1)
        .setMaxValues(5),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ranksetup-ignored-roles-clear')
        .setLabel('🗑️ Liste leeren')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('ranksetup-back')
        .setLabel('← Zurück')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. RANG-ROLLEN SCREEN
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Baut das Rang-Rollen Übersichts-Embed.
 * @param {string}      templateSet  – 'klassisch' | 'militaer' | 'fantasy' | 'gaming'
 * @param {LevelRole[]} levelRoles   – Gespeicherte LevelRole-Dokumente
 */
function buildRangRollenEmbed(templateSet, levelRoles) {
  const slots  = TEMPLATES[templateSet] ?? TEMPLATES.klassisch;
  const saved  = Object.fromEntries((levelRoles ?? []).map(r => [r.rankKey, r]));

  const lines = slots.map(slot => {
    const entry    = saved[slot.key];
    const roleStr  = entry?.roleId ? `<@&${entry.roleId}>` : '`Nicht gesetzt`';
    const created  = entry?.autoCreated ? ' _(auto)_' : '';
    const lvlStr   = `Ab Level \`${entry?.levelRequired ?? slot.defaultLevel}\``;
    return `${slot.emoji} **${slot.label}** — ${lvlStr} → ${roleStr}${created}`;
  });

  return new EmbedBuilder()
    .setTitle('🏆 Rang-Rollen Konfiguration')
    .setColor(COLOR_RANK)
    .setDescription(
      'Weise jedem Rang eine Discord-Rolle zu.\n' +
      'Du kannst bestehende Rollen auswählen oder sie automatisch erstellen lassen.\n\n' +
      lines.join('\n')
    )
    .setFooter({ text: 'GuildControl • Rank Setup • Rang-Rollen' })
    .setTimestamp();
}

/**
 * Template-Select + Vorlage-Buttons
 */
function buildRangRollenOverviewComponents(templateSet = 'klassisch') {
  const templateOptions = [
    { label: '🏅 Klassisch',         value: 'klassisch', description: 'Bronze, Silber, Gold, Platin, Diamant, Legende' },
    { label: '⚔️  Militär',           value: 'militaer',  description: 'Rekrut, Soldat, Korporal, Sergeant, Leutnant, General' },
    { label: '🧙 Fantasy',           value: 'fantasy',   description: 'Lehrling, Abenteurer, Ritter, Magier, Meister, Legende' },
    { label: '🎮 Gaming',            value: 'gaming',    description: 'Noob, Casual, Gamer, Pro, Elite, God' },
  ];

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ranksetup-rangrollen-template')
      .setPlaceholder('🎨 Vorlage auswählen')
      .addOptions(
        templateOptions.map(o =>
          new StringSelectMenuOptionBuilder()
            .setLabel(o.label)
            .setValue(o.value)
            .setDescription(o.description)
            .setDefault(o.value === templateSet)
        )
      )
  );

  const slots = TEMPLATES[templateSet] ?? TEMPLATES.klassisch;

  // Pro Rang ein Button (max. 5 pro Row → 2 Rows à 3)
  const chunkSize = 3;
  const buttonRows = [];
  for (let i = 0; i < slots.length; i += chunkSize) {
    const chunk = slots.slice(i, i + chunkSize);
    buttonRows.push(
      new ActionRowBuilder().addComponents(
        chunk.map(slot =>
          new ButtonBuilder()
            .setCustomId(`ranksetup-rangrollen-configure:${slot.key}`)
            .setLabel(`${slot.emoji} ${slot.label}`)
            .setStyle(ButtonStyle.Primary)
        )
      )
    );
  }

  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ranksetup-back')
      .setLabel('← Zurück')
      .setStyle(ButtonStyle.Secondary),
  );

  return [selectRow, ...buttonRows, backRow];
}

/**
 * Einzelner Rang Konfigurations-Screen.
 * @param {object} slot      – TEMPLATES-Eintrag
 * @param {object} savedRole – LevelRole Dokument (oder null)
 */
function buildRangSlotEmbed(slot, savedRole) {
  const roleStr  = savedRole?.roleId ? `<@&${savedRole.roleId}>` : '`Noch nicht gesetzt`';
  const lvl      = savedRole?.levelRequired ?? slot.defaultLevel;
  const created  = savedRole?.autoCreated ? '\n✅ Wurde automatisch vom Bot erstellt' : '';

  return new EmbedBuilder()
    .setTitle(`${slot.emoji} ${slot.label} konfigurieren`)
    .setColor(parseInt(slot.color.replace('#', ''), 16))
    .setDescription(
      `**Rang:** ${slot.emoji} ${slot.label}\n` +
      `**Farbe:** \`${slot.color}\`\n` +
      `**Ab Level:** \`${lvl}\`\n` +
      `**Zugewiesene Rolle:** ${roleStr}${created}`
    )
    .addFields({
      name:  '💡 Optionen',
      value: '• **Rolle wählen** – Bestehende Rolle aus dem Server zuweisen\n' +
             '• **Rolle erstellen** – Bot erstellt Rolle automatisch mit Rang-Farbe\n' +
             '• **Level setzen** – Ab welchem Level dieser Rang vergeben wird',
      inline: false,
    })
    .setFooter({ text: 'GuildControl • Rang-Rollen' })
    .setTimestamp();
}

function buildRangSlotComponents(slotKey, savedRole) {
  return [
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(`ranksetup-rangrollen-select:${slotKey}`)
        .setPlaceholder('🔗 Bestehende Rolle zuweisen')
        .setMinValues(1)
        .setMaxValues(1),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ranksetup-rangrollen-create:${slotKey}`)
        .setLabel('✨ Rolle automatisch erstellen')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`ranksetup-rangrollen-level:${slotKey}`)
        .setLabel('🎯 Level-Schwelle setzen')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`ranksetup-rangrollen-remove:${slotKey}`)
        .setLabel('🗑️ Entfernen')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!savedRole?.roleId),
      new ButtonBuilder()
        .setCustomId('ranksetup-rangrollen-back')
        .setLabel('← Zurück')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function buildRangLevelModal(slot, savedRole) {
  return new ModalBuilder()
    .setCustomId(`ranksetup-modal-ranglevel:${slot.key}`)
    .setTitle(`🎯 Level-Schwelle: ${slot.label}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('level_required')
          .setLabel(`Ab welchem Level erhält man "${slot.label}"?`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(4)
          .setValue(String(savedRole?.levelRequired ?? slot.defaultLevel)),
      ),
    );
}

// ═════════════════════════════════════════════════════════════════════════════
// 7. LEADERBOARD EINSTELLUNGEN
// ═════════════════════════════════════════════════════════════════════════════

function buildLeaderboardEmbed(rankConfig) {
  const lb = rankConfig?.leaderboard ?? {};
  return new EmbedBuilder()
    .setTitle('📊 Leaderboard Einstellungen')
    .setColor(COLOR_MAIN)
    .addFields(
      { name: 'Status',    value: fmt.bool(lb.enabled ?? true), inline: true },
      { name: 'Einträge',  value: fmt.num(lb.pageSize ?? 10),   inline: true },
    )
    .setFooter({ text: 'GuildControl • Rank Setup' })
    .setTimestamp();
}

function buildLeaderboardComponents(rankConfig) {
  const lb = rankConfig?.leaderboard ?? {};
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ranksetup-leaderboard-toggle')
        .setLabel(lb.enabled !== false ? '❌ Leaderboard deaktivieren' : '✅ Leaderboard aktivieren')
        .setStyle(lb.enabled !== false ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('ranksetup-leaderboard-pagesize')
        .setLabel('🔢 Einträge konfigurieren')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('ranksetup-back')
        .setLabel('← Zurück')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function buildLeaderboardPageSizeModal(rankConfig) {
  const lb = rankConfig?.leaderboard ?? {};
  return new ModalBuilder()
    .setCustomId('ranksetup-modal-leaderboard-pagesize')
    .setTitle('🔢 Leaderboard Einträge')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('page_size')
          .setLabel('Anzahl Einträge pro Seite (1–25)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(2)
          .setValue(String(lb.pageSize ?? 10)),
      ),
    );
}

// ═════════════════════════════════════════════════════════════════════════════
// 8. RESET BESTÄTIGUNG
// ═════════════════════════════════════════════════════════════════════════════

function buildResetEmbed() {
  return new EmbedBuilder()
    .setTitle('⚠️ Rank System zurücksetzen?')
    .setColor(COLOR_DANGER)
    .setDescription(
      '**Achtung!** Diese Aktion löscht:\n' +
      '• Alle Rank-Einstellungen\n' +
      '• Alle Rang-Rollen Zuweisungen\n\n' +
      '❌ **XP & Level der User werden NICHT gelöscht.**\n\n' +
      'Bist du sicher?'
    )
    .setFooter({ text: 'GuildControl • Rank Setup • Reset' })
    .setTimestamp();
}

function buildResetComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ranksetup-reset-confirm')
        .setLabel('🗑️ Ja, alles zurücksetzen')
        .setStyle(ButtonStyle.Danger),         // ROT – Destruktiv ✓
      new ButtonBuilder()
        .setCustomId('ranksetup-back')
        .setLabel('← Abbrechen')
        .setStyle(ButtonStyle.Secondary),      // GRAU – Zurück/Abbrechen aus Untermenü ✓
    ),
  ];
}

// ═════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═════════════════════════════════════════════════════════════════════════════

module.exports = {
  // Übersicht
  buildOverviewEmbed,
  buildOverviewComponents,

  // Grundeinstellungen
  buildGrundeinstellungenModal,

  // Level-Up
  buildLevelUpEmbed,
  buildLevelUpComponents,
  buildLevelUpMessageModal,

  // Ignorierte Kanäle
  buildIgnoredChannelsEmbed,
  buildIgnoredChannelsComponents,

  // Ignorierte Rollen
  buildIgnoredRolesEmbed,
  buildIgnoredRolesComponents,

  // Rang-Rollen
  buildRangRollenEmbed,
  buildRangRollenOverviewComponents,
  buildRangSlotEmbed,
  buildRangSlotComponents,
  buildRangLevelModal,

  // Leaderboard
  buildLeaderboardEmbed,
  buildLeaderboardComponents,
  buildLeaderboardPageSizeModal,

  // Reset
  buildResetEmbed,
  buildResetComponents,

  // Interne Hilfsfunktionen (für Handler)
  TEMPLATES,
};
