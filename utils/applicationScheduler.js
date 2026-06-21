'use strict';

/**
 * applicationScheduler.js
 * Periodischer Check (alle 60 Sekunden):
 * - Erstellt zum Terminzeitpunkt den Interview-Voice-Channel.
 * Start via initApplicationScheduler(client) einmalig in index.js.
 */

const Application = require('../models/Application');
const { createInterviewChannel } = require('../interactions/applicationHandler');

const CHECK_INTERVAL_MS = 60 * 1000;
let intervalHandle = null;

async function checkDueInterviews(client) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - 60 * 1000); // Toleranzfenster, falls der Tick mal aussetzt

  const dueApplications = await Application.find({
    status: 'scheduled',
    interviewAt: { $lte: now, $gte: windowStart },
    interviewChannelId: null,
  });

  for (const application of dueApplications) {
    try {
      const guild = await client.guilds.fetch(application.guildId);
      await createInterviewChannel(client, application, guild);
    } catch (err) {
      console.error('[applicationScheduler] Fehler beim Erstellen des Interview-Channels:', err);
    }
  }
}

function initApplicationScheduler(client) {
  if (intervalHandle) return; // schon gestartet
  intervalHandle = setInterval(() => {
    checkDueInterviews(client).catch(err => console.error('[applicationScheduler] Tick-Fehler:', err));
  }, CHECK_INTERVAL_MS);
  console.log('[applicationScheduler] Gestartet (Intervall: 60s)');
}

function stopApplicationScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = { initApplicationScheduler, stopApplicationScheduler };