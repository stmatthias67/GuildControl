'use strict';

/**
 * webhookServer.js
 * Kleiner interner HTTP-Server, den die Website aufruft, damit der Bot
 * sofort reagiert statt bis zu 10 Minuten auf den nächsten Polling-Tick
 * zu warten (Config-Sync) bzw. um Panels aktiv neu zu posten.
 *
 * Absicherung: jede Anfrage muss den Header
 *   Authorization: Bearer <BOT_WEBHOOK_SECRET>
 * mitschicken, sonst wird sie abgelehnt.
 */

const express = require('express');
const { fullSyncGuild } = require('./statsUpdater');
const { repostTicketPanel, repostApplicationForm, repostVerifyPanel } = require('./panelRepost');

function verifySecret(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const expected = `Bearer ${process.env.BOT_WEBHOOK_SECRET}`;

  if (!process.env.BOT_WEBHOOK_SECRET) {
    console.error('[webhook] BOT_WEBHOOK_SECRET ist nicht gesetzt — Webhook wird komplett abgelehnt.');
    return res.status(500).json({ error: 'Server nicht konfiguriert' });
  }

  if (auth !== expected) {
    console.warn('[webhook] Unauthorisierter Zugriffsversuch auf', req.path);
    return res.status(401).json({ error: 'Ungültiges oder fehlendes Secret' });
  }

  next();
}

function startWebhookServer(client) {
  const app = express();
  app.use(express.json());

  // Health-Check, unabhängig vom Secret, damit Wispbyte/Uptime-Monitore pingen können
  app.get('/webhook/health', (req, res) => {
    res.json({ status: 'ok', botReady: client.isReady() });
  });

  // ── Automatischer Config-Sync (z.B. Stats-Kanäle an/aus) ──
  app.post('/webhook/config-update', verifySecret, async (req, res) => {
    const { guildId, type } = req.body || {};

    if (!guildId || !type) {
      return res.status(400).json({ error: 'guildId und type sind erforderlich' });
    }

    console.log(`[webhook] Sync angefordert: guildId=${guildId}, type=${type}`);

    try {
      switch (type) {
        case 'stats':
          await fullSyncGuild(client, guildId);
          break;

        default:
          return res.status(400).json({ error: `Unbekannter type: ${type}` });
      }

      res.json({ success: true, guildId, type });
    } catch (err) {
      console.error(`[webhook] Fehler beim Sync (${type}, ${guildId}):`, err);
      res.status(500).json({ error: 'Sync fehlgeschlagen' });
    }
  });

  // ── Manuelles "Panel neu posten" — nur auf explizite Anfrage, kein Auto-Sync ──
  app.post('/webhook/repost-panel', verifySecret, async (req, res) => {
    const { guildId, panelType, formId } = req.body || {};

    if (!guildId || !panelType) {
      return res.status(400).json({ error: 'guildId und panelType sind erforderlich' });
    }

    console.log(`[webhook] Panel-Repost angefordert: guildId=${guildId}, panelType=${panelType}, formId=${formId || '-'}`);

    try {
      let result;

      switch (panelType) {
        case 'ticket':
          result = await repostTicketPanel(client, guildId);
          break;

        case 'application':
          if (!formId) {
            return res.status(400).json({ error: 'formId ist für panelType "application" erforderlich' });
          }
          result = await repostApplicationForm(client, guildId, formId);
          break;

        case 'verify':
          result = await repostVerifyPanel(client, guildId);
          break;

        default:
          return res.status(400).json({ error: `Unbekannter panelType: ${panelType}` });
      }

      res.json({ success: true, guildId, panelType, ...result });
    } catch (err) {
      console.error(`[webhook] Fehler beim Repost (${panelType}, ${guildId}):`, err);
      res.status(500).json({ error: err.message || 'Repost fehlgeschlagen' });
    }
  });

  const port = process.env.WEBHOOK_PORT || 15355;
  app.listen(port, '0.0.0.0', () => {
    console.log(`[webhook] Webhook-Server läuft auf 0.0.0.0:${port}`);
  });
}

module.exports = { startWebhookServer };