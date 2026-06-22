'use strict';

/**
 * applicationHandler.js
 * Live-Logik des Bewerbungssystems: Formular-Submit, Review, Terminwahl,
 * Stornierung, Interview-Voice-Channel, finale Entscheidung.
 */

const {
  PermissionFlagsBits,
  ChannelType,
  OverwriteType,
} = require('discord.js');

const ApplicationConfig = require('../models/ApplicationConfig');
const Application = require('../models/Application');
const BlockedApplicant = require('../models/BlockedApplicant');
const GuildConfig = require('../models/GuildConfig');

const {
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
} = require('../utils/applicationBuilder');

// In-Memory-Zwischenspeicher für laufende Mehrseiten-Bewerbungsentwürfe
// (Antworten werden erst beim letzten Modal final in die DB geschrieben)
const draftAnswers = new Map(); // draftId -> { formId, userId, guildId, answers: [] }

function makeDraftId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function hasReviewerRole(interaction, config) {
  if (!config.reviewerRoleKeys?.length) return false;
  const guildConfig = await GuildConfig.findOne({ guildId: interaction.guildId });
  if (!guildConfig?.roles) return false;

  for (const key of config.reviewerRoleKeys) {
    const roleId = guildConfig.roles[key];
    if (roleId && interaction.member.roles.cache.has(roleId)) return true;
  }
  return false;
}

async function resolveRoleId(guildId, roleKey) {
  if (!roleKey) return null;
  const guildConfig = await GuildConfig.findOne({ guildId });
  return guildConfig?.roles?.[roleKey] || null;
}

// ---------------------------------------------------------------------------
// 1. Bewerbung starten ("Jetzt bewerben"-Button)
// ---------------------------------------------------------------------------

async function handleApplyButton(interaction, formId) {
  const config = await ApplicationConfig.findOne({ guildId: interaction.guildId });
  const form = config?.forms.find(f => f.formId === formId);

  if (!form || !form.active) {
    return interaction.reply({ content: '❌ Dieses Bewerbungsformular ist nicht mehr verfügbar.', ephemeral: true });
  }

  if (form.closed) {
    return interaction.reply({
      content: `🔒 Dieser Bereich ist aktuell geschlossen.\n**Grund:** ${form.closedReason || 'Kein Grund angegeben.'}`,
      ephemeral: true,
    });
  }

  const blocked = await BlockedApplicant.findOne({ guildId: interaction.guildId, userId: interaction.user.id });
  if (blocked) {
    return interaction.reply({ content: '🚫 Du bist für Bewerbungen auf diesem Server gesperrt.', ephemeral: true });
  }

  const existing = await Application.findOne({
    guildId: interaction.guildId,
    userId: interaction.user.id,
    formId,
    status: { $in: ['pending', 'scheduling', 'scheduled', 'interview_done'] },
  });
  if (existing) {
    return interaction.reply({ content: '⚠️ Du hast bereits eine laufende Bewerbung für dieses Formular.', ephemeral: true });
  }

  if (!form.questions.length) {
    return interaction.reply({ content: '❌ Dieses Formular hat keine Fragen konfiguriert.', ephemeral: true });
  }

  const draftId = makeDraftId();
  draftAnswers.set(draftId, { formId, userId: interaction.user.id, guildId: interaction.guildId, answers: [] });

  const modal = buildApplicationModal(form, 1, draftId);
  await interaction.showModal(modal);
}

// ---------------------------------------------------------------------------
// 2. Mehrseitige Modal-Submits sammeln, am Ende Application erstellen
// ---------------------------------------------------------------------------

async function handleApplicationModalSubmit(interaction) {
  // customId-Format: application-modal-apply-{formId}-{page}-{draftId}
  const match = interaction.customId.match(/^application-modal-apply-(.+)-(\d+)-([a-z0-9]+)$/);
  if (!match) return;

  const [, formId, pageStr, draftId] = match;
  const page = parseInt(pageStr, 10);

  await interaction.deferReply({ ephemeral: true });

  const draft = draftAnswers.get(draftId);
  if (!draft) {
    return interaction.editReply({ content: '⚠️ Deine Bewerbungs-Sitzung ist abgelaufen. Bitte starte erneut über den Bewerben-Button.' });
  }

  const config = await ApplicationConfig.findOne({ guildId: interaction.guildId });
  const form = config?.forms.find(f => f.formId === formId);
  if (!form) {
    draftAnswers.delete(draftId);
    return interaction.editReply({ content: '❌ Dieses Formular existiert nicht mehr.' });
  }

  const pageQuestions = form.questions.filter(q => q.page === page);
  for (const q of pageQuestions) {
    const value = interaction.fields.getTextInputValue(q.id) || '';
    draft.answers.push({ questionId: q.id, label: q.label, value });
  }

  const totalPages = getTotalPages(form);

  if (page < totalPages) {
    // Nächste Seite anbieten
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`application-nextpage-${formId}-${page + 1}-${draftId}`)
        .setLabel(`Weiter zu Seite ${page + 1}/${totalPages}`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji('➡️')
    );
    return interaction.editReply({
      content: `Seite ${page}/${totalPages} gespeichert. Klicke auf "Weiter", um fortzufahren.`,
      components: [row],
    });
  }

  // Letzte Seite -> Bewerbung final erstellen
  draftAnswers.delete(draftId);

  const application = await Application.create({
    guildId: interaction.guildId,
    userId: draft.userId,
    formId: form.formId,
    formLabel: form.label,
    answers: draft.answers,
    status: 'pending',
  });

  await interaction.editReply({ content: '✅ Deine Bewerbung wurde eingereicht! Du wirst benachrichtigt, sobald sie geprüft wurde.' });

  // Review-Embed posten
  if (config.reviewChannelId) {
    try {
      const channel = await interaction.client.channels.fetch(config.reviewChannelId);
      const embed = buildReviewEmbed(application);
      const components = buildReviewComponents(application);
      const sent = await channel.send({ embeds: [embed], components });
      application.reviewMessageId = sent.id;
      await application.save();
    } catch (err) {
      console.error('[applicationHandler] Fehler beim Posten ins Review-Channel:', err);
    }
  }
}

// Button "Weiter zu Seite X" -> öffnet nächstes Modal
async function handleNextPageButton(interaction) {
  const match = interaction.customId.match(/^application-nextpage-(.+)-(\d+)-([a-z0-9]+)$/);
  if (!match) return;

  const [, formId, pageStr, draftId] = match;
  const page = parseInt(pageStr, 10);

  const draft = draftAnswers.get(draftId);
  if (!draft) {
    return interaction.reply({ content: '⚠️ Deine Bewerbungs-Sitzung ist abgelaufen.', ephemeral: true });
  }

  const config = await ApplicationConfig.findOne({ guildId: interaction.guildId });
  const form = config?.forms.find(f => f.formId === formId);
  if (!form) return;

  const modal = buildApplicationModal(form, page, draftId);
  await interaction.showModal(modal);
}

// ---------------------------------------------------------------------------
// 3. Review: Annehmen / Ablehnen
// ---------------------------------------------------------------------------

async function handleReviewDecision(interaction, action, applicationId) {
  const config = await ApplicationConfig.findOne({ guildId: interaction.guildId });
  if (!config || !(await hasReviewerRole(interaction, config))) {
    return interaction.reply({ content: '❌ Du bist nicht berechtigt, Bewerbungen zu bearbeiten.', ephemeral: true });
  }

  const application = await Application.findById(applicationId);
  if (!application || application.status !== 'pending') {
    return interaction.reply({ content: '⚠️ Diese Bewerbung wurde bereits bearbeitet.', ephemeral: true });
  }

  if (action === 'deny') {
    application.status = 'denied';
    application.reviewerId = interaction.user.id;
    application.decidedAt = new Date();
    await application.save();

    await interaction.update({ embeds: [buildReviewEmbed(application)], components: buildReviewComponents(application) });
    await notifyApplicant(interaction.client, application, '❌ Deine Bewerbung wurde leider abgelehnt.');
    return;
  }

  // accept -> Reviewer trägt Zeit-Slots ein
  const { buildProposeSlotsModal } = require('../utils/applicationBuilder');
  await interaction.showModal(buildProposeSlotsModal(application._id));
}

// Modal-Submit: Reviewer trägt Zeit-Slots ein
async function handleProposeSlotsSubmit(interaction, applicationId) {
  await interaction.deferUpdate();

  const application = await Application.findById(applicationId);
  if (!application) return;

  const raw = interaction.fields.getTextInputValue('slots');
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);

  const slots = [];
  for (let i = 0; i < lines.length; i++) {
    const dt = parseGermanDateTime(lines[i]);
    if (dt) {
      slots.push({ id: `slot${i + 1}`, datetime: dt });
    }
  }

  if (!slots.length) {
    return interaction.followUp({ content: '⚠️ Keine gültigen Termine erkannt. Format: TT.MM.JJJJ HH:MM (eine Zeile pro Termin).', ephemeral: true });
  }

  application.status = 'scheduling';
  application.reviewerId = interaction.user.id;
  application.decidedAt = new Date();
  application.proposedSlots = slots;
  await application.save();

  await interaction.editReply({ embeds: [buildReviewEmbed(application)], components: [] });

  // Bewerber per DM die Slots anbieten
  try {
    const user = await interaction.client.users.fetch(application.userId);
    await user.send({
      embeds: [buildSlotChoiceEmbed(application)],
      components: buildSlotChoiceComponents(application),
    });
  } catch (err) {
    console.error('[applicationHandler] Konnte Bewerber keine DM senden (Termine):', err);
  }
}

function parseGermanDateTime(str) {
  // Format: TT.MM.JJJJ HH:MM
  const match = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const [, day, month, year, hour, minute] = match.map(Number);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (isNaN(date.getTime())) return null;
  if (date.getTime() < Date.now()) return null; // keine Termine in der Vergangenheit
  return date;
}

// ---------------------------------------------------------------------------
// 4. Terminwahl durch den Bewerber
// ---------------------------------------------------------------------------

async function handleSlotChoice(interaction, applicationId) {
  const application = await Application.findById(applicationId);
  if (!application || application.status !== 'scheduling') {
    return interaction.reply({ content: '⚠️ Dieser Termin-Vorschlag ist nicht mehr aktiv.', ephemeral: true });
  }
  if (application.userId !== interaction.user.id) {
    return interaction.reply({ content: '❌ Das ist nicht deine Bewerbung.', ephemeral: true });
  }

  const slotId = interaction.values[0];
  const slot = application.proposedSlots.find(s => s.id === slotId);
  if (!slot) {
    return interaction.reply({ content: '❌ Ungültiger Termin.', ephemeral: true });
  }

  application.chosenSlot = slot;
  application.interviewAt = slot.datetime;
  application.status = 'scheduled';
  await application.save();

  const config = await ApplicationConfig.findOne({ guildId: application.guildId });

  await interaction.update({
    embeds: [buildAppointmentConfirmedEmbed(application)],
    components: buildAppointmentConfirmedComponents(application, config?.cancelLockMinutes ?? 25),
  });

  // Reviewer ebenfalls benachrichtigen
  try {
    const reviewer = await interaction.client.users.fetch(application.reviewerId);
    await reviewer.send({
      embeds: [buildAppointmentConfirmedEmbed(application)],
    });
  } catch (err) {
    console.error('[applicationHandler] Konnte Reviewer nicht benachrichtigen:', err);
  }

  // Review-Embed im Channel aktualisieren
  await updateReviewMessage(interaction.client, application);
}

// ---------------------------------------------------------------------------
// 5. Termin absagen (Bewerber oder Reviewer)
// ---------------------------------------------------------------------------

async function handleCancelAppointment(interaction, applicationId) {
  const application = await Application.findById(applicationId);
  if (!application || application.status !== 'scheduled') {
    return interaction.reply({ content: '⚠️ Dieser Termin kann nicht mehr abgesagt werden.', ephemeral: true });
  }

  const isApplicant = application.userId === interaction.user.id;
  const isReviewer = application.reviewerId === interaction.user.id;
  if (!isApplicant && !isReviewer) {
    return interaction.reply({ content: '❌ Du bist an diesem Termin nicht beteiligt.', ephemeral: true });
  }

  const config = await ApplicationConfig.findOne({ guildId: application.guildId });
  const lockMinutes = config?.cancelLockMinutes ?? 25;
  const msUntilStart = new Date(application.chosenSlot.datetime).getTime() - Date.now();

  if (msUntilStart < lockMinutes * 60 * 1000) {
    return interaction.reply({
      content: `❌ Eine Absage ist nicht mehr möglich (weniger als ${lockMinutes} Minuten vor Terminstart).`,
      ephemeral: true,
    });
  }

  application.status = 'cancelled';
  await application.save();

  await interaction.update({ content: '⚠️ Der Termin wurde abgesagt.', embeds: [], components: [] });

  // jeweils die andere Person informieren
  const otherUserId = isApplicant ? application.reviewerId : application.userId;
  try {
    const otherUser = await interaction.client.users.fetch(otherUserId);
    await otherUser.send(`⚠️ Der Interview-Termin für die Bewerbung **${application.formLabel}** wurde von <@${interaction.user.id}> abgesagt. Ein neuer Termin muss vereinbart werden.`);
  } catch (err) {
    console.error('[applicationHandler] Konnte andere Partei nicht über Absage informieren:', err);
  }

  await updateReviewMessage(interaction.client, application);
}

// Reviewer kann nach Absage erneut Slots vorschlagen
async function handleReschedule(interaction, applicationId) {
  const config = await ApplicationConfig.findOne({ guildId: interaction.guildId });
  if (!config || !(await hasReviewerRole(interaction, config))) {
    return interaction.reply({ content: '❌ Du bist nicht berechtigt.', ephemeral: true });
  }

  const application = await Application.findById(applicationId);
  if (!application || application.status !== 'cancelled') {
    return interaction.reply({ content: '⚠️ Dieser Vorgang ist nicht im richtigen Status.', ephemeral: true });
  }

  const { buildProposeSlotsModal } = require('../utils/applicationBuilder');
  await interaction.showModal(buildProposeSlotsModal(application._id));
}

// ---------------------------------------------------------------------------
// 6. Interview-Voice-Channel erstellen (vom Scheduler aufgerufen)
// ---------------------------------------------------------------------------

async function createInterviewChannel(client, application, guild) {
  try {
    const everyoneId = guild.roles.everyone.id;

    const channel = await guild.channels.create({
      name: `interview-${application.userId.slice(-4)}`,
      type: ChannelType.GuildVoice,
      permissionOverwrites: [
        { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
        { id: application.userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
        { id: application.reviewerId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
      ],
    });

    application.interviewChannelId = channel.id;
    await application.save();

    // Text-Hinweis im selben Voice-Channel (Discord erlaubt Text-Chat in Voice-Channels)
    await channel.send({
      content: `<@${application.userId}> <@${application.reviewerId}>`,
      embeds: [buildInterviewChannelEmbed(application)],
      components: buildInterviewNoShowComponents(application),
    });
  } catch (err) {
    console.error('[applicationHandler] Fehler beim Erstellen des Interview-Channels:', err);
  }
}

// ---------------------------------------------------------------------------
// 7. Bewerber tritt Voice-Channel bei -> Entscheidungs-Buttons anzeigen
// ---------------------------------------------------------------------------

async function handleApplicantJoinedInterview(client, application) {
  if (application.status !== 'scheduled') return;

  application.status = 'interview_done';
  await application.save();

  try {
    const channel = await client.channels.fetch(application.interviewChannelId);
    await channel.send({
      content: `<@${application.reviewerId}> ${application.userId === undefined ? '' : ''}Der Bewerber ist beigetreten. Bitte triff nach dem Gespräch eine Entscheidung:`,
      components: buildInterviewDecisionComponents(application),
    });
  } catch (err) {
    console.error('[applicationHandler] Fehler beim Anzeigen der Entscheidungs-Buttons:', err);
  }

  await updateReviewMessage(client, application);
}

// ---------------------------------------------------------------------------
// 8. No-Show
// ---------------------------------------------------------------------------

async function handleNoShow(interaction, applicationId) {
  const application = await Application.findById(applicationId);
  if (!application) return;

  if (application.reviewerId !== interaction.user.id) {
    return interaction.reply({ content: '❌ Nur der zuständige Reviewer kann dies markieren.', ephemeral: true });
  }

  application.status = 'no_show';
  await application.save();

  await BlockedApplicant.findOneAndUpdate(
    { guildId: application.guildId, userId: application.userId },
    { reason: 'no_show', blockedAt: new Date() },
    { upsert: true }
  );

  await interaction.update({ content: '🚫 Bewerber wurde als "nicht erschienen" markiert und für weitere Bewerbungen gesperrt.', embeds: [], components: [] });

  await updateReviewMessage(interaction.client, application);
  await cleanupInterviewChannel(interaction.client, application);
}

// ---------------------------------------------------------------------------
// 9. Finale Entscheidung nach Gespräch: Einstellen / Nicht einstellen
// ---------------------------------------------------------------------------

async function handleFinalDecision(interaction, action, applicationId) {
  const application = await Application.findById(applicationId);
  if (!application || application.status !== 'interview_done') {
    return interaction.reply({ content: '⚠️ Dieser Vorgang ist nicht im richtigen Status.', ephemeral: true });
  }

  if (application.reviewerId !== interaction.user.id) {
    return interaction.reply({ content: '❌ Nur der zuständige Reviewer kann diese Entscheidung treffen.', ephemeral: true });
  }

  const config = await ApplicationConfig.findOne({ guildId: application.guildId });
  const form = config?.forms.find(f => f.formId === application.formId);

  if (action === 'hire') {
    application.status = 'hired';
    await application.save();

    // Test-Rolle vergeben
    if (form?.targetTestRoleKey) {
      const roleId = await resolveRoleId(application.guildId, form.targetTestRoleKey);
      if (roleId) {
        try {
          const guild = await interaction.client.guilds.fetch(application.guildId);
          const member = await guild.members.fetch(application.userId);
          await member.roles.add(roleId);
        } catch (err) {
          console.error('[applicationHandler] Fehler beim Vergeben der Test-Rolle:', err);
        }
      }
    }

    await interaction.update({ content: '✅ Bewerber wurde eingestellt und hat die Test-Rolle erhalten.', embeds: [], components: [] });
    await notifyApplicant(interaction.client, application, `🎉 Herzlichen Glückwunsch! Du wurdest für **${application.formLabel}** angenommen.`);
  } else {
    application.status = 'rejected';
    await application.save();

    await interaction.update({ content: '❌ Bewerber wurde nach dem Gespräch abgelehnt.', embeds: [], components: [] });
    await notifyApplicant(interaction.client, application, `Nach dem Gespräch haben wir uns entschieden, deine Bewerbung für **${application.formLabel}** nicht weiter zu verfolgen.`);
  }

  await updateReviewMessage(interaction.client, application);
  await cleanupInterviewChannel(interaction.client, application);
}

// ---------------------------------------------------------------------------
// Helpers: Benachrichtigung, Review-Message-Update, Channel-Cleanup
// ---------------------------------------------------------------------------

async function notifyApplicant(client, application, message) {
  try {
    const user = await client.users.fetch(application.userId);
    await user.send(message);
  } catch (err) {
    console.error('[applicationHandler] Konnte Bewerber nicht benachrichtigen:', err);
  }
}

async function updateReviewMessage(client, application) {
  const config = await ApplicationConfig.findOne({ guildId: application.guildId });
  if (!config?.reviewChannelId || !application.reviewMessageId) return;

  try {
    const channel = await client.channels.fetch(config.reviewChannelId);
    const msg = await channel.messages.fetch(application.reviewMessageId);
    await msg.edit({ embeds: [buildReviewEmbed(application)], components: buildReviewComponents(application) });
  } catch (err) {
    console.error('[applicationHandler] Konnte Review-Nachricht nicht aktualisieren:', err);
  }
}

async function cleanupInterviewChannel(client, application) {
  if (!application.interviewChannelId) return;
  try {
    const channel = await client.channels.fetch(application.interviewChannelId);
    await channel.delete();
  } catch (err) {
    // Channel ggf. schon gelöscht
  }
}

module.exports = {
  handleApplyButton,
  handleApplicationModalSubmit,
  handleNextPageButton,
  handleReviewDecision,
  handleProposeSlotsSubmit,
  handleSlotChoice,
  handleCancelAppointment,
  handleReschedule,
  createInterviewChannel,
  handleApplicantJoinedInterview,
  handleNoShow,
  handleFinalDecision,
  draftAnswers,
};