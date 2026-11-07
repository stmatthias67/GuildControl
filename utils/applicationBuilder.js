'use strict';

/**
 * applicationBuilder.js
 * Alle Embeds, Buttons, Select Menus und Modals für das Bewerbungs-/Interview-System.
 * Analog zu rankBuilder.js.
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const { COLORS: COLOR } = require('./uiTheme');

const MAX_QUESTIONS_PER_PAGE = 5;

// ---------------------------------------------------------------------------
// LIVE: Anpassbare Nachrichten (Texte kommen aus dem Web)
// ---------------------------------------------------------------------------

function renderTemplatedMessage(form, slotKey, fallbackText) {
  const template = form?.messages?.[slotKey];
  const text = template?.text?.trim() || fallbackText;

  if (template?.imageUrl) {
    const embed = new EmbedBuilder().setColor(COLOR.primary).setDescription(text).setImage(template.imageUrl);
    return { embeds: [embed] };
  }
  return { content: text };
}

// ---------------------------------------------------------------------------
// LIVE: Modals
// ---------------------------------------------------------------------------

function buildProposeSlotsModal(applicationId) {
  return new ModalBuilder()
    .setCustomId(`application-modal-proposeslots-${applicationId}`)
    .setTitle('Termine vorschlagen')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('slots')
          .setLabel('Termine (TT.MM.JJJJ HH:MM, 1 pro Zeile)')
          .setPlaceholder('21.06.2026 18:00\n22.06.2026 19:30\n23.06.2026 20:00')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(300)
          .setRequired(true)
      ),
    );
}

// ---------------------------------------------------------------------------
// LIVE: Bewerbungs-Button im Channel
// ---------------------------------------------------------------------------

function buildApplyButtonEmbed(form) {
  return new EmbedBuilder()
    .setColor(COLOR.primary)
    .setTitle(`${form.emoji || '📋'} ${form.label}`)
    .setDescription(form.description || 'Klicke unten, um dich zu bewerben.');
}

function buildApplyButtonComponents(form) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`application-apply-${form.formId}`)
        .setLabel('Jetzt bewerben')
        .setStyle(ButtonStyle.Success)
        .setEmoji('📝')
    ),
  ];
}

function buildApplicationModal(form, page, applicationDraftId) {
  const pageQuestions = form.questions.filter(q => q.page === page).slice(0, MAX_QUESTIONS_PER_PAGE);

  const modal = new ModalBuilder()
    .setCustomId(`application-modal-apply-${form.formId}-${page}-${applicationDraftId}`)
    .setTitle(`${form.label} (Seite ${page})`);

  for (const q of pageQuestions) {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(q.id)
          .setLabel(q.label.slice(0, 45))
          .setStyle(q.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
          .setMaxLength(q.maxLength || 200)
          .setRequired(q.required !== false)
      )
    );
  }

  return modal;
}

function getTotalPages(form) {
  if (!form.questions.length) return 0;
  return Math.max(...form.questions.map(q => q.page));
}

// ---------------------------------------------------------------------------
// LIVE: Review-Embed im Review-Channel
// ---------------------------------------------------------------------------

function buildReviewEmbed(application) {
  const answersText = application.answers.length
    ? application.answers.map(a => `**${a.label}**\n${a.value}`).join('\n\n')
    : '_Keine Antworten_';

  const statusColorMap = {
    pending: COLOR.warning,
    denied: COLOR.danger,
    scheduling: COLOR.primary,
    scheduled: COLOR.primary,
    cancelled: COLOR.warning,
    interview_done: COLOR.warning,
    hired: COLOR.success,
    rejected: COLOR.danger,
    no_show: COLOR.danger,
  };

  const statusLabelMap = {
    pending: '⏳ Wartet auf Review',
    denied: '🔴 Abgelehnt',
    scheduling: '📅 Wartet auf Terminwahl',
    scheduled: '✅ Termin vereinbart',
    cancelled: '⚠️ Termin abgesagt',
    interview_done: '🎤 Gespräch geführt – wartet auf Entscheidung',
    hired: '🟢 Eingestellt',
    rejected: '🔴 Nach Gespräch abgelehnt',
    no_show: '🚫 Nicht erschienen',
  };

  const embed = new EmbedBuilder()
    .setColor(statusColorMap[application.status] || COLOR.neutral)
    .setTitle(`📋 ${application.formLabel}`)
    .setDescription(`Bewerber: <@${application.userId}>`)
    .addFields(
      { name: 'Status', value: statusLabelMap[application.status] || application.status },
      ...(application.answers.length ? [{ name: '\u200b', value: answersText }] : []),
    )
    .setFooter({ text: `Bewerbungs-ID: ${application._id}` })
    .setTimestamp(application.createdAt);

  if (application.chosenSlot?.datetime) {
    embed.addFields({
      name: 'Vereinbarter Termin',
      value: `<t:${Math.floor(new Date(application.chosenSlot.datetime).getTime() / 1000)}:F>`,
    });
  }

  return embed;
}

function buildReviewComponents(application) {
  if (application.status === 'pending') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`application-accept-${application._id}`).setLabel('Annehmen').setStyle(ButtonStyle.Success).setEmoji('✅'),
        new ButtonBuilder().setCustomId(`application-deny-${application._id}`).setLabel('Ablehnen').setStyle(ButtonStyle.Danger).setEmoji('❌'),
      ),
    ];
  }

  if (application.status === 'cancelled') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`application-reschedule-${application._id}`).setLabel('Neuen Termin vorschlagen').setStyle(ButtonStyle.Primary).setEmoji('📅'),
      ),
    ];
  }

  return [];
}

// ---------------------------------------------------------------------------
// LIVE: Terminwahl (DM oder Channel an Bewerber)
// ---------------------------------------------------------------------------

function buildSlotChoiceEmbed(application) {
  return new EmbedBuilder()
    .setColor(COLOR.primary)
    .setTitle('📅 Wähle deinen Interview-Termin')
    .setDescription(`Deine Bewerbung **${application.formLabel}** wurde angenommen! Bitte wähle einen der folgenden Termine:`);
}

function buildSlotChoiceComponents(application) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`application-slotchoice-${application._id}`)
    .setPlaceholder('Termin auswählen...')
    .addOptions(
      application.proposedSlots.map(s => ({
        label: new Date(s.datetime).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }),
        value: s.id,
      }))
    );
  return [new ActionRowBuilder().addComponents(select)];
}

// ---------------------------------------------------------------------------
// LIVE: Termin-Bestätigung
// ---------------------------------------------------------------------------

function buildAppointmentConfirmedEmbed(application) {
  const ts = Math.floor(new Date(application.chosenSlot.datetime).getTime() / 1000);
  return new EmbedBuilder()
    .setColor(COLOR.success)
    .setTitle('✅ Termin bestätigt')
    .setDescription(`Dein Interview-Termin für **${application.formLabel}** steht fest:\n<t:${ts}:F> (<t:${ts}:R>)`)
    .setFooter({ text: 'Du kannst diesen Termin im Bewerbungs-Channel absagen, solange das Sperrfenster nicht erreicht ist.' });
}

function buildAppointmentConfirmedComponents(application, lockMinutes) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`application-cancelappt-${application._id}`)
        .setLabel(`Termin absagen (bis ${lockMinutes} Min. vorher möglich)`)
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🚫')
    ),
  ];
}

// ---------------------------------------------------------------------------
// LIVE: Interview-Voice-Channel
// ---------------------------------------------------------------------------

function buildInterviewChannelEmbed(application) {
  return new EmbedBuilder()
    .setColor(COLOR.primary)
    .setTitle('🎤 Interview-Termin')
    .setDescription(
      `Bewerber: <@${application.userId}>\nReviewer: <@${application.reviewerId}>\n\nBitte hier dem Voice-Channel beitreten. Sobald der Bewerber beigetreten ist, erscheinen hier die Entscheidungs-Buttons.`
    );
}

function buildInterviewNoShowComponents(application) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`application-noshow-${application._id}`).setLabel('Nicht erschienen').setStyle(ButtonStyle.Danger).setEmoji('🚫'),
    ),
  ];
}

function buildInterviewDecisionComponents(application) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`application-hire-${application._id}`).setLabel('Einstellen').setStyle(ButtonStyle.Success).setEmoji('✅'),
      new ButtonBuilder().setCustomId(`application-reject-${application._id}`).setLabel('Nicht einstellen').setStyle(ButtonStyle.Danger).setEmoji('❌'),
    ),
  ];
}

module.exports = {
  renderTemplatedMessage,

  buildProposeSlotsModal,

  buildApplyButtonEmbed,
  buildApplyButtonComponents,
  buildApplicationModal,
  getTotalPages,

  buildReviewEmbed,
  buildReviewComponents,

  buildSlotChoiceEmbed,
  buildSlotChoiceComponents,

  buildAppointmentConfirmedEmbed,
  buildAppointmentConfirmedComponents,

  buildInterviewChannelEmbed,
  buildInterviewNoShowComponents,
  buildInterviewDecisionComponents,
};
