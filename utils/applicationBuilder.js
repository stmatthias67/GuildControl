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
  ChannelSelectMenuBuilder,
  ChannelType,
} = require('discord.js');

const COLOR = {
  primary: 0x2b6cb0,
  success: 0x2f9e44,
  danger: 0xe03131,
  warning: 0xf08c00,
  neutral: 0x4a4a4a,
};

const MAX_QUESTIONS_PER_PAGE = 5;

const CLOSE_REASON_PRESETS = [
  { value: 'too_many', label: 'Zu viele Bewerbungen / Team voll' },
  { value: 'technical_error', label: 'Technischer Fehler' },
  { value: 'paused', label: 'Bewerbungen vorübergehend pausiert' },
  { value: 'custom', label: 'Eigenen Grund eingeben...' },
];

// ---------------------------------------------------------------------------
// SETUP: Übersicht
// ---------------------------------------------------------------------------

function buildApplicationOverviewEmbed(config) {
  const formsList = (config.forms || []).length
    ? config.forms
        .map(f => `${f.active ? '🟢' : '⚪'} **${f.label}** (\`${f.formId}\`) – ${f.questions.length} Frage(n)`)
        .join('\n')
    : '_Noch keine Formulare angelegt._';

  return new EmbedBuilder()
    .setColor(COLOR.primary)
    .setTitle('📋 Bewerbungs-Setup')
    .setDescription(
      'Verwalte hier Bewerbungsformulare, den Review-Channel, Reviewer-Rollen und das Sperrfenster für Terminabsagen.'
    )
    .addFields(
      { name: 'Review-Channel', value: config.reviewChannelId ? `<#${config.reviewChannelId}>` : '_Nicht gesetzt_', inline: true },
      { name: 'Reviewer-Rollen', value: config.reviewerRoleKeys?.length ? config.reviewerRoleKeys.join(', ') : '_Nicht gesetzt_', inline: true },
      { name: 'Absage-Sperrfenster', value: `${config.cancelLockMinutes} Min. vor Termin`, inline: true },
      { name: 'Formulare', value: formsList },
    )
    .setFooter({ text: config.setupDone ? 'Status: Eingerichtet ✅' : 'Status: Noch nicht abgeschlossen ⚠️' });
}

function buildApplicationOverviewComponents(config) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('applicationsetup-channel').setLabel('Review-Channel').setStyle(ButtonStyle.Primary).setEmoji('📨'),
    new ButtonBuilder().setCustomId('applicationsetup-reviewers').setLabel('Reviewer-Rollen').setStyle(ButtonStyle.Primary).setEmoji('🛂'),
    new ButtonBuilder().setCustomId('applicationsetup-locktime').setLabel('Sperrfenster').setStyle(ButtonStyle.Primary).setEmoji('⏱️'),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('applicationsetup-forms').setLabel('Formulare verwalten').setStyle(ButtonStyle.Secondary).setEmoji('🗂️'),
    new ButtonBuilder().setCustomId('applicationsetup-formnew').setLabel('Neues Formular').setStyle(ButtonStyle.Secondary).setEmoji('➕'),
    new ButtonBuilder().setCustomId('applicationsetup-templates').setLabel('Vorlagen').setStyle(ButtonStyle.Secondary).setEmoji('📑'),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('applicationsetup-complete').setLabel('Setup abschließen').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId('setup-menu-back').setLabel('Zurück').setStyle(ButtonStyle.Secondary).setEmoji('↩️'),
  );

  return [row1, row2, row3];
}

// ---------------------------------------------------------------------------
// SETUP: Formular-Liste & Detail
// ---------------------------------------------------------------------------

function buildFormListEmbed(config) {
  const embed = new EmbedBuilder()
    .setColor(COLOR.primary)
    .setTitle('🗂️ Formulare verwalten')
    .setDescription(
      (config.forms || []).length
        ? 'Wähle ein Formular aus, um es zu bearbeiten.'
        : 'Es gibt noch keine Formulare. Erstelle eines über "Neues Formular".'
    );
  return embed;
}

function buildFormListComponents(config) {
  const rows = [];
  const forms = config.forms || [];

  if (forms.length) {
    const select = new StringSelectMenuBuilder()
      .setCustomId('applicationsetup-formselect')
      .setPlaceholder('Formular bearbeiten...')
      .addOptions(
        forms.slice(0, 25).map(f => ({
          label: f.label.slice(0, 100),
          value: f.formId,
          description: `${f.questions.length} Frage(n) · ${formStatusLabel(f)}`,
          emoji: f.emoji || '📋',
        }))
      );
    rows.push(new ActionRowBuilder().addComponents(select));

    // Schnell-Toggle-Buttons (aktivieren/deaktivieren/öffnen/schließen) pro Formular, max 4 Formulare pro Zeile à 5 Buttons gesamt
    const toggleButtons = forms.slice(0, 5).map(f =>
      new ButtonBuilder()
        .setCustomId(`applicationsetup-quicktoggle-${f.formId}`)
        .setLabel(f.label.slice(0, 30))
        .setStyle(f.active && !f.closed ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setEmoji(f.closed ? '🔒' : f.active ? '🟢' : '⚪')
    );
    for (let i = 0; i < toggleButtons.length; i += 5) {
      rows.push(new ActionRowBuilder().addComponents(toggleButtons.slice(i, i + 5)));
    }
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('applicationsetup-formnew').setLabel('Neues Formular').setStyle(ButtonStyle.Secondary).setEmoji('➕'),
      new ButtonBuilder().setCustomId('applicationsetup-overview').setLabel('Zurück').setStyle(ButtonStyle.Secondary).setEmoji('↩️'),
    )
  );

  return rows;
}

function formStatusLabel(form) {
  if (form.closed) return '🔒 Geschlossen';
  return form.active ? '🟢 Aktiv' : '⚪ Inaktiv';
}

function buildFormDetailEmbed(form) {
  const questionsList = form.questions.length
    ? form.questions
        .sort((a, b) => a.page - b.page)
        .map((q, i) => `**${i + 1}.** (Seite ${q.page}) ${q.label} ${q.required ? '*(Pflicht)*' : '_(optional)_'} – ${q.style === 'paragraph' ? 'Absatz' : 'Kurztext'}`)
        .join('\n')
    : '_Noch keine Fragen._';

  const pages = new Set(form.questions.map(q => q.page)).size;

  const embed = new EmbedBuilder()
    .setColor(form.closed ? COLOR.danger : form.active ? COLOR.success : COLOR.neutral)
    .setTitle(`📋 ${form.label}`)
    .setDescription(form.description || '_Keine Beschreibung_')
    .addFields(
      { name: 'Status', value: formStatusLabel(form), inline: true },
      { name: 'Button-Channel', value: form.buttonChannelId ? `<#${form.buttonChannelId}>` : '_Nicht gesetzt_', inline: true },
      { name: 'Test-Rolle bei Erfolg', value: form.targetTestRoleKey || '_Nicht gesetzt_', inline: true },
      { name: `Fragen (${form.questions.length}, ${pages} Modal-Seite(n))`, value: questionsList },
    );

  if (form.closed && form.closedReason) {
    embed.addFields({ name: 'Schließungs-Grund (für Bewerber sichtbar)', value: form.closedReason });
  }

  return embed;
}

function buildFormDetailComponents(form) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`applicationsetup-formedit-${form.formId}`).setLabel('Name/Beschreibung').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
    new ButtonBuilder().setCustomId(`applicationsetup-formchannel-${form.formId}`).setLabel('Button-Channel').setStyle(ButtonStyle.Primary).setEmoji('📨'),
    new ButtonBuilder().setCustomId(`applicationsetup-formrole-${form.formId}`).setLabel('Test-Rolle').setStyle(ButtonStyle.Primary).setEmoji('🏷️'),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`applicationsetup-formquestionadd-${form.formId}`).setLabel('Frage hinzufügen').setStyle(ButtonStyle.Secondary).setEmoji('➕'),
    new ButtonBuilder().setCustomId(`applicationsetup-formquestionremove-${form.formId}`).setLabel('Frage entfernen').setStyle(ButtonStyle.Secondary).setEmoji('➖'),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`applicationsetup-formtoggle-${form.formId}`)
      .setLabel(form.active ? 'Deaktivieren' : 'Aktivieren')
      .setStyle(form.active ? ButtonStyle.Danger : ButtonStyle.Success)
      .setEmoji(form.active ? '🔴' : '🟢'),
    new ButtonBuilder()
      .setCustomId(`applicationsetup-formclose-${form.formId}`)
      .setLabel(form.closed ? 'Wieder öffnen' : 'Schließen (Bereich voll/Fehler)')
      .setStyle(form.closed ? ButtonStyle.Success : ButtonStyle.Danger)
      .setEmoji(form.closed ? '🔓' : '🔒'),
  );

  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`applicationsetup-formdelete-${form.formId}`).setLabel('Formular löschen').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
    new ButtonBuilder().setCustomId('applicationsetup-forms').setLabel('Zurück').setStyle(ButtonStyle.Secondary).setEmoji('↩️'),
  );

  return [row1, row2, row3, row4];
}

// ---------------------------------------------------------------------------
// SETUP: Modals
// ---------------------------------------------------------------------------

function buildFormNameModal() {
  return new ModalBuilder()
    .setCustomId('applicationsetup-modal-formnew')
    .setTitle('Neues Bewerbungsformular')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('label')
          .setLabel('Name des Formulars')
          .setPlaceholder('z.B. Supporter-Bewerbung')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(80)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('description')
          .setLabel('Beschreibung (optional)')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(300)
          .setRequired(false)
      ),
    );
}

function buildFormEditModal(form) {
  return new ModalBuilder()
    .setCustomId(`applicationsetup-modal-formedit-${form.formId}`)
    .setTitle('Formular bearbeiten')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('label')
          .setLabel('Name des Formulars')
          .setStyle(TextInputStyle.Short)
          .setValue(form.label)
          .setMaxLength(80)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('description')
          .setLabel('Beschreibung')
          .setStyle(TextInputStyle.Paragraph)
          .setValue(form.description || '')
          .setMaxLength(300)
          .setRequired(false)
      ),
    );
}

function buildQuestionAddModal(formId) {
  return new ModalBuilder()
    .setCustomId(`applicationsetup-modal-questionadd-${formId}`)
    .setTitle('Frage hinzufügen')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('label')
          .setLabel('Fragetext')
          .setPlaceholder('z.B. Warum möchtest du Supporter werden?')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(200)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('style')
          .setLabel('Typ: "kurz" oder "absatz"')
          .setPlaceholder('kurz')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(10)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('required')
          .setLabel('Pflichtfrage? "ja" oder "nein"')
          .setPlaceholder('ja')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(5)
          .setRequired(true)
      ),
    );
}

function buildQuestionRemoveModal(formId) {
  return new ModalBuilder()
    .setCustomId(`applicationsetup-modal-questionremove-${formId}`)
    .setTitle('Frage entfernen')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('index')
          .setLabel('Nummer der zu löschenden Frage (siehe Liste)')
          .setPlaceholder('z.B. 1')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(3)
          .setRequired(true)
      ),
    );
}

function buildLockMinutesModal(current) {
  return new ModalBuilder()
    .setCustomId('applicationsetup-modal-locktime')
    .setTitle('Absage-Sperrfenster')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('minutes')
          .setLabel('Minuten vor Termin (Absage-Sperre)') // gekürzt, < 45 Zeichen
          .setPlaceholder('25')
          .setValue(String(current ?? 25))
          .setStyle(TextInputStyle.Short)
          .setMaxLength(4)
          .setRequired(true)
      ),
    );
}

function buildProposeSlotsModal(applicationId) {
  return new ModalBuilder()
    .setCustomId(`application-modal-proposeslots-${applicationId}`)
    .setTitle('Termine vorschlagen')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('slots')
          .setLabel('Termine (TT.MM.JJJJ HH:MM, 1 pro Zeile)') // 43 Zeichen, < 45
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

  // pending review nach Gespräch (interview_done) wird im Interview-Channel entschieden, nicht hier
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

//---------------------------------------------------------------------------
//Unsotiert
//---------------------------------------------------------------------------

function buildTemplateListEmbed() {
  return new EmbedBuilder()
    .setColor(COLOR.primary)
    .setTitle('📑 Formular-Vorlagen')
    .setDescription('Wähle eine Vorlage, um sofort ein fertiges Formular mit Standard-Fragen zu erstellen. Du kannst es danach beliebig anpassen.');
}

function buildTemplateListComponents(templates) {
  const select = new StringSelectMenuBuilder()
    .setCustomId('applicationsetup-templateselect')
    .setPlaceholder('Vorlage auswählen...')
    .addOptions(
      templates.map(t => ({
        label: t.label,
        value: t.templateId,
        description: t.description.slice(0, 100),
        emoji: t.emoji,
      }))
    );

  return [
    new ActionRowBuilder().addComponents(select),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('applicationsetup-overview').setLabel('Zurück').setStyle(ButtonStyle.Secondary).setEmoji('↩️'),
    ),
  ];
}

function buildCloseReasonSelectRow(formId) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`applicationsetup-closereasonselect-${formId}`)
    .setPlaceholder('Grund auswählen...')
    .addOptions(CLOSE_REASON_PRESETS.map(r => ({ label: r.label, value: r.value })));

  return [new ActionRowBuilder().addComponents(select)];
}

function buildCloseReasonCustomModal(formId) {
  return new ModalBuilder()
    .setCustomId(`applicationsetup-modal-closereason-${formId}`)
    .setTitle('Grund für Schließung')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Grund (wird Bewerbern angezeigt)')
          .setPlaceholder('z.B. Das Team ist aktuell voll besetzt.')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(200)
          .setRequired(true)
      ),
    );
}



module.exports = {
  COLOR,
  MAX_QUESTIONS_PER_PAGE,

  buildApplicationOverviewEmbed,
  buildApplicationOverviewComponents,

  buildFormListEmbed,
  buildFormListComponents,
  buildFormDetailEmbed,
  buildFormDetailComponents,

  buildFormNameModal,
  buildFormEditModal,
  buildQuestionAddModal,
  buildQuestionRemoveModal,
  buildLockMinutesModal,
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
  
  formStatusLabel,
  CLOSE_REASON_PRESETS,
  buildTemplateListEmbed,
  buildTemplateListComponents,
  buildCloseReasonSelectRow,
  buildCloseReasonCustomModal,
};