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
} = require('discord.js');

const { ROLE_DEFINITIONS } = require('./rolePermissions');

const { COLORS: COLOR } = require('./uiTheme');

const WEEKDAY_LABELS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

function minuteToTimeString(minute) {
  const h = Math.floor(minute / 60).toString().padStart(2, '0');
  const m = (minute % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
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

// Nur noch ein Export-Objekt: vorher überschrieb das abschließende module.exports = {...}
// alle module.exports.x-Zuweisungen, dadurch fehlten die Support-Case-Builder.
module.exports = {
  WEEKDAY_LABELS,
  minuteToTimeString,
  generateCaseId,
  buildSupportCaseText,
  buildSupportCaseComponents,
  buildSupportPanelEmbed,
  buildSupportPanelComponents,
  buildCloseReasonModal,
  CANCEL_REASON_PRESETS,
  buildCancelReasonSelectRow,
  buildCancelReasonCustomModal,
  buildCallRoleSelectRow,
  ROLE_ESCALATION_ORDER: ROLE_DEFINITIONS.map(r => r.key).reverse(),
};
