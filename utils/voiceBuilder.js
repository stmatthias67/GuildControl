'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
} = require('discord.js');

const { ROLE_DEFINITIONS } = require('./rolePermissions');

const COLOR = { primary: 0x2b6cb0, success: 0x2f9e44, danger: 0xe03131, neutral: 0x4a4a4a };

const WEEKDAY_LABELS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

function minuteToTimeString(minute) {
  const h = Math.floor(minute / 60).toString().padStart(2, '0');
  const m = (minute % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function buildVoiceOverviewEmbed(config) {
  const windowsText = config.supportWindows.length
    ? config.supportWindows
        .map(w => `**${WEEKDAY_LABELS[w.dayOfWeek]}**: ${minuteToTimeString(w.startMinute)} – ${minuteToTimeString(w.endMinute)}`)
        .join('\n')
    : '_Keine Supportzeiten festgelegt (Standard: nie aktiv)_';

  return new EmbedBuilder()
    .setColor(COLOR.primary)
    .setTitle('🔊 Voice-/Support-Setup')
    .setDescription('Konfiguriere den Support-Warteraum. Hinweis: Audio-Wiedergabe wird in einem späteren Schritt aktiviert – heute werden nur die Einstellungen gespeichert.')
    .addFields(
      { name: 'Warteraum-Channel', value: config.waitingRoomChannelId ? `<#${config.waitingRoomChannelId}>` : '_Nicht gesetzt_', inline: true },
      { name: 'Benachrichtigungs-Channel', value: config.notifyChannelId ? `<#${config.notifyChannelId}>` : '_Nicht gesetzt_', inline: true },
      { name: 'Benachrichtigte Rollen', value: config.notifyRoleKeys?.length ? config.notifyRoleKeys.join(', ') : '_Nicht gesetzt_', inline: true },
      { name: 'Supportzeiten', value: windowsText },
      { name: 'Sound (innerhalb Zeiten)', value: `\`${config.soundFileInsideWindow}\``, inline: true },
      { name: 'Sound (außerhalb Zeiten)', value: `\`${config.soundFileOutsideWindow}\``, inline: true },
    )
    .setFooter({ text: config.setupDone ? 'Status: Eingerichtet ✅' : 'Status: Noch nicht abgeschlossen ⚠️' });
}

function buildVoiceOverviewComponents(config) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('voicesetup-waitingroom').setLabel('Warteraum-Channel').setStyle(ButtonStyle.Primary).setEmoji('🚪'),
    new ButtonBuilder().setCustomId('voicesetup-notifychannel').setLabel('Benachrichtigungs-Channel').setStyle(ButtonStyle.Primary).setEmoji('📨'),
    new ButtonBuilder().setCustomId('voicesetup-notifyroles').setLabel('Benachrichtigte Rollen').setStyle(ButtonStyle.Primary).setEmoji('🛂'),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('voicesetup-supporttimes').setLabel('Supportzeiten').setStyle(ButtonStyle.Secondary).setEmoji('🕒'),
    new ButtonBuilder().setCustomId('voicesetup-outsidemessage').setLabel('Außerhalb-Zeiten-Text').setStyle(ButtonStyle.Secondary).setEmoji('💬'),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('voicesetup-complete').setLabel('Setup abschließen').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId('setup-menu-back').setLabel('Zurück').setStyle(ButtonStyle.Secondary).setEmoji('↩️'),
  );

  return [row1, row2, row3];
}

function buildSupportTimesReadOnlyEmbed(config) {
  const windowsText = config.supportWindows.length
    ? config.supportWindows
        .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
        .map(w => `**${WEEKDAY_LABELS[w.dayOfWeek]}**: ${minuteToTimeString(w.startMinute)} – ${minuteToTimeString(w.endMinute)} Uhr`)
        .join('\n')
    : '_Keine Supportzeiten festgelegt._';

  return new EmbedBuilder()
    .setColor(COLOR.primary)
    .setTitle('🕒 Supportzeiten')
    .setDescription(windowsText)
    .setFooter({ text: '⚠️ Supportzeiten werden zukünftig nur noch über die Website einstellbar sein.' });
}

function buildSupportTimesReadOnlyComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('voicesetup-overview').setLabel('Zurück').setStyle(ButtonStyle.Secondary).setEmoji('↩️'),
    ),
  ];
}

function buildWindowListEmbed(config) {
  const windowsText = config.supportWindows.length
    ? config.supportWindows
        .map((w, i) => `**${i + 1}.** ${WEEKDAY_LABELS[w.dayOfWeek]}: ${minuteToTimeString(w.startMinute)} – ${minuteToTimeString(w.endMinute)}`)
        .join('\n')
    : '_Keine Supportzeiten festgelegt._';

  return new EmbedBuilder()
    .setColor(COLOR.primary)
    .setTitle('🕒 Supportzeiten')
    .setDescription(windowsText);
}

function buildWindowListComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('voicesetup-windowadd').setLabel('Zeitfenster hinzufügen').setStyle(ButtonStyle.Secondary).setEmoji('➕'),
      new ButtonBuilder().setCustomId('voicesetup-windowremove').setLabel('Zeitfenster entfernen').setStyle(ButtonStyle.Secondary).setEmoji('➖'),
      new ButtonBuilder().setCustomId('voicesetup-overview').setLabel('Zurück').setStyle(ButtonStyle.Secondary).setEmoji('↩️'),
    ),
  ];
}

function buildChannelSelectRow(customId, channelType = ChannelType.GuildVoice) {
  return new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder().setCustomId(customId).setPlaceholder('Channel auswählen...').addChannelTypes(channelType)
  );
}

function buildWindowAddModal() {
  return new ModalBuilder()
    .setCustomId('voicesetup-modal-windowadd')
    .setTitle('Supportzeit hinzufügen')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('day')
          .setLabel('Wochentag (Mo, Di, Mi, Do, Fr, Sa, So)')
          .setPlaceholder('Mo')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(2)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('start')
          .setLabel('Startzeit (HH:MM)')
          .setPlaceholder('18:00')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(5)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('end')
          .setLabel('Endzeit (HH:MM)')
          .setPlaceholder('22:00')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(5)
          .setRequired(true)
      ),
    );
}

function buildWindowRemoveModal() {
  return new ModalBuilder()
    .setCustomId('voicesetup-modal-windowremove')
    .setTitle('Supportzeit entfernen')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('index')
          .setLabel('Nummer des zu löschenden Eintrags')
          .setPlaceholder('1')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(3)
          .setRequired(true)
      ),
    );
}

function buildOutsideMessageModal(current) {
  return new ModalBuilder()
    .setCustomId('voicesetup-modal-outsidemessage')
    .setTitle('Text außerhalb der Supportzeiten')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('text')
          .setLabel('Text bei Beitritt außerhalb der Zeiten')
          .setStyle(TextInputStyle.Paragraph)
          .setValue(current || '')
          .setMaxLength(300)
          .setRequired(true)
      ),
    );
}

function generateCaseId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let id = '';
  for (let i = 0; i < 10; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return `S-${id}`;
}

function buildSupportCaseText({ roleIds, userId, caseId, createdAtUnix, claimedBy = null }) {
  const rolePings = roleIds.map(id => `<@&${id}>`).join(' ');
  const lines = [
    `-# ${rolePings}`,
    `## 🆘 Ein neuer Support Fall`,
    '',
    `<@!${userId}> braucht Hilfe!`,
    `- 🆔 **CaseID:** \`#${caseId}\``,
    `- 🕒 **Erstellt am:** <t:${createdAtUnix}:f>`,
    `- 👤 **Nutzer:** <@${userId}>`,
  ];

  if (claimedBy) {
    lines.push(`- ✅ **Übernommen von:** <@${claimedBy}>`);
  }

  lines.push(` -# <@${userId}>`);
  return lines.join('\n');
}

function buildSupportCaseComponents(caseId, claimed = false) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`supportcase-claim-${caseId}`)
        .setLabel(claimed ? 'Bereits übernommen' : 'Fall übernehmen')
        .setStyle(claimed ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setEmoji('🙋')
        .setDisabled(claimed),
    ),
  ];
}

// ---------------------------------------------------------------------------
// Support-Fall: Admin-Panel im Voice-Channel
// ---------------------------------------------------------------------------

function buildSupportPanelEmbed(supportCase) {
  return new EmbedBuilder()
    .setColor(COLOR.primary)
    .setTitle('🛠️ Support-Fall Admin-Panel')
    .setDescription(`Fall \`#${supportCase.caseId}\` – Nutzer: <@${supportCase.userId}>`)
    .addFields(
      { name: 'Übernommen von', value: `<@${supportCase.claimedBy}>`, inline: true },
      { name: 'Status', value: supportCase.status, inline: true },
    );
}

function buildSupportPanelComponents(caseId) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`supportcase-close-${caseId}`).setLabel('Fall abschließen').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId(`supportcase-cancel-${caseId}`).setLabel('Fall abbrechen').setStyle(ButtonStyle.Danger).setEmoji('🚫'),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`supportcase-escalate-${caseId}`).setLabel('Rang höher rufen').setStyle(ButtonStyle.Primary).setEmoji('⬆️'),
    new ButtonBuilder().setCustomId(`supportcase-callrole-${caseId}`).setLabel('Bestimmten Rang rufen').setStyle(ButtonStyle.Secondary).setEmoji('📣'),
  );

  return [row1, row2];
}

function buildCloseReasonModal(caseId) {
  return new ModalBuilder()
    .setCustomId(`supportcase-modal-close-${caseId}`)
    .setTitle('Fall abschließen')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Grund / Lösung')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(300)
          .setRequired(true)
      ),
    );
}

const CANCEL_REASON_PRESETS = [
  { value: 'mistake', label: 'Aus Versehen erstellt' },
  { value: 'left', label: 'Nutzer hat verlassen' },
  { value: 'duplicate', label: 'Doppelter Fall' },
  { value: 'other', label: 'Anderer Grund...' },
];

function buildCancelReasonSelectRow(caseId) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`supportcase-cancelreasonselect-${caseId}`)
    .setPlaceholder('Grund auswählen...')
    .addOptions(CANCEL_REASON_PRESETS.map(r => ({ label: r.label, value: r.value })));
  return [new ActionRowBuilder().addComponents(select)];
}

function buildCancelReasonCustomModal(caseId) {
  return new ModalBuilder()
    .setCustomId(`supportcase-modal-cancelreason-${caseId}`)
    .setTitle('Grund für Abbruch')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Grund')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(200)
          .setRequired(true)
      ),
    );
}

function buildCallRoleSelectRow(roleOptions, caseId) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`supportcase-callroleselect-${caseId}`)
    .setPlaceholder('Rolle auswählen...')
    .addOptions(roleOptions.slice(0, 25).map(r => ({ label: r.label, value: r.key, emoji: r.emoji })));
  return [new ActionRowBuilder().addComponents(select)];
}

module.exports.generateCaseId = generateCaseId;
module.exports.buildSupportCaseText = buildSupportCaseText;
module.exports.buildSupportCaseComponents = buildSupportCaseComponents;
module.exports.buildSupportPanelEmbed = buildSupportPanelEmbed;
module.exports.buildSupportPanelComponents = buildSupportPanelComponents;
module.exports.buildCloseReasonModal = buildCloseReasonModal;
module.exports.CANCEL_REASON_PRESETS = CANCEL_REASON_PRESETS;
module.exports.buildCancelReasonSelectRow = buildCancelReasonSelectRow;
module.exports.buildCancelReasonCustomModal = buildCancelReasonCustomModal;
module.exports.buildCallRoleSelectRow = buildCallRoleSelectRow;
module.exports.ROLE_ESCALATION_ORDER = ROLE_DEFINITIONS.map(r => r.key).reverse(); 

const DAY_MAP = { mo: 1, di: 2, mi: 3, do: 4, fr: 5, sa: 6, so: 0 };

module.exports = {
  WEEKDAY_LABELS,
  DAY_MAP,
  minuteToTimeString,
  buildVoiceOverviewEmbed,
  buildVoiceOverviewComponents,
  buildSupportTimesReadOnlyEmbed,
  buildSupportTimesReadOnlyComponents,
  buildChannelSelectRow,
  buildOutsideMessageModal,
  generateCaseId,
  buildSupportCaseMessage,
};
