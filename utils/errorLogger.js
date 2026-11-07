'use strict';

/**
 * errorLogger.js
 * Zentrale Stelle für schwerwiegende Fehler (Crashes, unbehandelte Exceptions,
 * fehlgeschlagene DB-Verbindung). Schreibt in eine lokale Logdatei, zusätzlich
 * zur normalen Konsolen-Ausgabe (die bleibt unverändert bestehen).
 *
 * Log-Datei: logs/errors.log (eine Zeile pro Eintrag, JSON-formatiert für
 * spätere maschinelle Auswertung, aber auch von Hand lesbar).
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'errors.log');

// Verzeichnis einmalig sicherstellen
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function formatError(err) {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack };
  }
  return { message: String(err) };
}

/**
 * Schreibt einen schwerwiegenden Fehler in die Logdatei.
 * @param {string} category - z.B. "uncaughtException", "db-connection", "router"
 * @param {Error|string} err - der Fehler selbst
 * @param {object} context - optionale Zusatzinfos (z.B. customId, guildId)
 */
function logCriticalError(category, err, context = {}) {
  try {
    ensureLogDir();

    const entry = {
      timestamp: new Date().toISOString(),
      category,
      ...formatError(err),
      context,
    };

    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf8');
  } catch (writeErr) {
    // Falls das Schreiben selbst fehlschlägt (z.B. Speicher voll, Rechte-Problem),
    // soll das NICHT den Bot zum Absturz bringen — nur in der Konsole vermerken.
    console.error('[errorLogger] Konnte Fehler nicht in Logdatei schreiben:', writeErr);
  }
}

// Discord-Fehlercodes, die im Normalbetrieb vorkommen und bewusst ignoriert werden:
// 10003 Unknown Channel, 10007 Unknown Member, 10008 Unknown Message, 10011 Unknown Role,
// 10013 Unknown User, 10062 Unknown Interaction, 40060 schon bestätigt, 50007 DMs gesperrt.
const EXPECTED_DISCORD_CODES = new Set([10003, 10007, 10008, 10011, 10013, 10062, 40060, 50007]);

/**
 * Ersatz für stummes `.catch(() => null)`: liefert weiter `null`, loggt aber.
 * Erwartbare Discord-Fehler → console.warn, alles andere → console.error + errors.log.
 * @param {string} context - z.B. "ticketHandler.deferUpdate"
 */
function logCatch(context) {
  return (err) => {
    if (EXPECTED_DISCORD_CODES.has(err?.code)) {
      console.warn(`[${context}] ignoriert (${err.code}): ${err.message}`);
    } else {
      console.error(`[${context}]`, err);
      logCriticalError(context, err);
    }
    return null;
  };
}

module.exports = { logCriticalError, logCatch, LOG_FILE };
