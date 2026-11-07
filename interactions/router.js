'use strict';

/**
 * router.js
 * Zentrale Stelle für das Routing aller Button/SelectMenu/Modal-Interaktionen.
 *
 * Jeder Eintrag hat:
 * - prefix: customId-Präfix, der diesen Handler-Block auslöst
 * - handle(interaction, client): die eigentliche Verarbeitung
 * - errorLabel: Text für Logging/Nutzer-Fehlermeldung
 *
 * Neue Systeme NUR HIER eintragen, nicht mehr in index.js.
 */

const ticketHandler = require('./ticketHandler');
const { handleVerifyButton } = require('./verifyHandler');
const applicationHandler = require('./applicationHandler');
const supportCaseHandler = require('./supportCaseHandler');
const suggestCommand = require('../commands/suggest');
const embedCommand = require('../commands/embed');

const { logCriticalError } = require('../utils/errorLogger');
// ---------------------------------------------------------------------------
// Bewerbungs-Live-System: Routing-Helper (unverändert aus index.js übernommen)
// ---------------------------------------------------------------------------

async function handleApplicationLiveInteraction(interaction) {
  const id = interaction.customId;

  if (interaction.isModalSubmit()) {
    if (id.startsWith('application-modal-apply-')) {
      return applicationHandler.handleApplicationModalSubmit(interaction);
    }
    const proposeMatch = id.match(/^application-modal-proposeslots-(.+)$/);
    if (proposeMatch) {
      return applicationHandler.handleProposeSlotsSubmit(interaction, proposeMatch[1]);
    }
    return;
  }

  if (interaction.isStringSelectMenu()) {
    const slotMatch = id.match(/^application-slotchoice-(.+)$/);
    if (slotMatch) {
      return applicationHandler.handleSlotChoice(interaction, slotMatch[1]);
    }
    return;
  }

  if (id.startsWith('application-apply-')) {
    return applicationHandler.handleApplyButton(interaction, id.replace('application-apply-', ''));
  }

  if (id.startsWith('application-nextpage-')) {
    return applicationHandler.handleNextPageButton(interaction);
  }

  const acceptMatch = id.match(/^application-accept-(.+)$/);
  if (acceptMatch) return applicationHandler.handleReviewDecision(interaction, 'accept', acceptMatch[1]);

  const denyMatch = id.match(/^application-deny-(.+)$/);
  if (denyMatch) return applicationHandler.handleReviewDecision(interaction, 'deny', denyMatch[1]);

  const cancelMatch = id.match(/^application-cancelappt-(.+)$/);
  if (cancelMatch) return applicationHandler.handleCancelAppointment(interaction, cancelMatch[1]);

  const rescheduleMatch = id.match(/^application-reschedule-(.+)$/);
  if (rescheduleMatch) return applicationHandler.handleReschedule(interaction, rescheduleMatch[1]);

  const noShowMatch = id.match(/^application-noshow-(.+)$/);
  if (noShowMatch) return applicationHandler.handleNoShow(interaction, noShowMatch[1]);

  const hireMatch = id.match(/^application-hire-(.+)$/);
  if (hireMatch) return applicationHandler.handleFinalDecision(interaction, 'hire', hireMatch[1]);

  const rejectMatch = id.match(/^application-reject-(.+)$/);
  if (rejectMatch) return applicationHandler.handleFinalDecision(interaction, 'reject', rejectMatch[1]);
}

// ---------------------------------------------------------------------------
// Support-Case-System: Routing-Helper (unverändert aus index.js übernommen)
// ---------------------------------------------------------------------------

async function handleSupportCaseRouting(interaction) {
  const id = interaction.customId;

  if (interaction.isModalSubmit()) {
    const closeMatch = id.match(/^supportcase-modal-close-(.+)$/);
    if (closeMatch) return supportCaseHandler.handleCloseModalSubmit(interaction, closeMatch[1]);

    const cancelMatch = id.match(/^supportcase-modal-cancelreason-(.+)$/);
    if (cancelMatch) return supportCaseHandler.handleCancelReasonModalSubmit(interaction, cancelMatch[1]);
    return;
  }

  if (interaction.isStringSelectMenu()) {
    const cancelSelectMatch = id.match(/^supportcase-cancelreasonselect-(.+)$/);
    if (cancelSelectMatch) return supportCaseHandler.handleCancelReasonSelect(interaction, cancelSelectMatch[1]);

    const callRoleSelectMatch = id.match(/^supportcase-callroleselect-(.+)$/);
    if (callRoleSelectMatch) return supportCaseHandler.handleCallRoleSelect(interaction, callRoleSelectMatch[1]);
    return;
  }

  const claimMatch = id.match(/^supportcase-claim-(.+)$/);
  if (claimMatch) return supportCaseHandler.handleClaimCase(interaction, claimMatch[1]);

  const closeMatch = id.match(/^supportcase-close-(.+)$/);
  if (closeMatch) return supportCaseHandler.handlePanelClose(interaction, closeMatch[1]);

  const cancelMatch = id.match(/^supportcase-cancel-(.+)$/);
  if (cancelMatch) return supportCaseHandler.handlePanelCancel(interaction, cancelMatch[1]);

  const escalateMatch = id.match(/^supportcase-escalate-(.+)$/);
  if (escalateMatch) return supportCaseHandler.handleEscalate(interaction, escalateMatch[1]);

  const callroleMatch = id.match(/^supportcase-callrole-(.+)$/);
  if (callroleMatch) return supportCaseHandler.handleCallSpecificRole(interaction, callroleMatch[1]);
}

// ---------------------------------------------------------------------------
// Zentrale Routing-Tabelle
// ---------------------------------------------------------------------------
// Reihenfolge ist relevant: exakte Matches vor Präfix-Matches mit Überlappung.
// Eingestellt wird im Web-Dashboard; hier stehen nur Live-Interaktionen.

const ROUTES = [
  {
    name: 'security-verify',
    matches: (id) => id === 'securitysetup-verify-button',
    handle: (interaction) => handleVerifyButton(interaction),
    errorLabel: 'Verify-Handler',
  },
  {
    name: 'ticket',
    matches: (id) => id.startsWith('ticket-'),
    handle: (interaction, client) => ticketHandler.execute(interaction, client),
    errorLabel: 'Ticket-System',
  },
  {
    name: 'application-live',
    matches: (id) => id.startsWith('application-'),
    handle: (interaction) => handleApplicationLiveInteraction(interaction),
    errorLabel: 'Bewerbungssystem',
  },
  {
    name: 'support-case',
    matches: (id) => id.startsWith('supportcase-'),
    handle: (interaction) => handleSupportCaseRouting(interaction),
    errorLabel: 'Support-System',
  },
  {
    name: 'suggest',
    matches: (id) => id.startsWith('suggest_'),
    handle: (interaction) => suggestCommand.handleButton(interaction),
    errorLabel: 'Vorschlags-System',
  },
  {
    name: 'embed-modal',
    matches: (id) => id.startsWith('embed_modal_'),
    handle: (interaction) => embedCommand.onModalSubmit(interaction),
    errorLabel: 'Embed-Editor',
  },
];

// ---------------------------------------------------------------------------
// Einstiegspunkt, von index.js aufgerufen
// ---------------------------------------------------------------------------

async function routeComponentInteraction(interaction, client) {
  if (!interaction.customId) return false;

  const id = interaction.customId;
  const route = ROUTES.find((r) => r.matches(id));

  if (!route) return false;

  try {
    await route.handle(interaction, client);
  } catch (err) {
    console.error(`❌ Fehler im ${route.errorLabel} (route: ${route.name}, customId: ${id}):`, err);

    // NEU: zusätzlich in die Logdatei schreiben, mit Kontext
    logCriticalError('router', err, {
      route: route.name,
      customId: id,
      guildId: interaction.guildId,
      userId: interaction.user?.id,
    });

    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: `❌ Fehler im ${route.errorLabel}.`, ephemeral: true });
      }
    } catch (replyErr) {
      console.error('❌ Fehler beim Senden der Fehler-Antwort:', replyErr);
    }
  }

  return true;
}

module.exports = { routeComponentInteraction, ROUTES };