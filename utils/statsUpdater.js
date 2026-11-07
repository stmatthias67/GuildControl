'use strict';

/**
 * statsUpdater.js
 * Synchronisiert die Statistik-Kanäle mit der Website-Konfiguration:
 * - enabled: true, kein channelId  -> Kanal wird erstellt, channelId zurückgeschrieben
 * - enabled: false, channelId vorhanden -> Kanal wird gelöscht, channelId auf null gesetzt
 * - enabled: true, channelId vorhanden -> Name wird bei Bedarf aktualisiert (namePrefix + {count})
 *
 * Discord erlaubt nur 2 Kanal-Umbenennungen pro 10 Minuten pro Kanal —
 * daher läuft der reguläre Update-Tick alle 10 Minuten, nicht öfter.
 * Der Webhook-Handler kann zusätzlich einen sofortigen Sync auslösen (für
 * Erstellen/Löschen, das nicht unter das Umbenennungs-Rate-Limit fällt).
 */

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const StatsConfig = require('../models/StatsConfig');
const { logCatch } = require('./errorLogger');

const UPDATE_INTERVAL_MS = 10 * 60 * 1000; // 10 Minuten, wegen Discord Rate-Limit für Umbenennungen
let intervalHandle = null;

function computeValue(type, guild) {
  switch (type) {
    case 'members':
      return guild.members.cache.filter(m => !m.user.bot).size;
    case 'bots':
      return guild.members.cache.filter(m => m.user.bot).size;
    case 'boosts':
      return guild.premiumSubscriptionCount || 0;
    case 'online':
      return guild.members.cache.filter(m => m.presence?.status && m.presence.status !== 'offline').size;
    case 'channels':
      return guild.channels.cache.size;
    case 'roles':
      return guild.roles.cache.size;
    default:
      return 0;
  }
}

function buildChannelName(entry, guild) {
  const value = computeValue(entry.type, guild);
  return `${entry.namePrefix}${value.toLocaleString('de-DE')}`;
}

/**
 * Erstellt/löscht Kanäle je nach enabled-Status. Schreibt geänderte channelId
 * direkt in die Datenbank zurück. Gibt zurück, ob sich etwas geändert hat.
 */
async function syncChannelExistence(client, guildId) {
  const config = await StatsConfig.findOne({ guildId });
  if (!config) return false;

  let guild;
  try {
    guild = await client.guilds.fetch(guildId);
  } catch (err) {
    console.error('[statsUpdater] Guild nicht gefunden:', guildId, err.message);
    return false;
  }

  let changed = false;

  for (const entry of config.channels) {
    if (entry.enabled && !entry.channelId) {
      // War aus, ist jetzt an -> Kanal erstellen
      try {
        const newChannel = await guild.channels.create({
          name: buildChannelName(entry, guild),
          type: ChannelType.GuildVoice,
          parent: config.categoryId || null,
          permissionOverwrites: [
            {
              id: guild.roles.everyone.id,
              deny: [PermissionFlagsBits.Connect],
            },
          ],
        });
        entry.channelId = newChannel.id;
        changed = true;
        console.log(`[statsUpdater] Kanal erstellt für "${entry.type}": ${newChannel.id}`);
      } catch (err) {
        console.error(`[statsUpdater] Fehler beim Erstellen von "${entry.type}":`, err.message);
      }
    } else if (!entry.enabled && entry.channelId) {
      // War an, ist jetzt aus -> Kanal löschen
      try {
        const channel = await guild.channels.fetch(entry.channelId).catch(logCatch('statsUpdater.fetch'));
        if (channel) await channel.delete();
      } catch (err) {
        console.error(`[statsUpdater] Fehler beim Löschen von "${entry.type}":`, err.message);
      }
      entry.channelId = null;
      changed = true;
    }
  }

  if (changed) {
    await StatsConfig.updateOne(
      { guildId },
      { $set: { channels: config.channels } }
    );
  }

  return changed;
}

/**
 * Aktualisiert nur die Kanal-Namen (Rate-Limit-behaftet, daher separat und seltener).
 */
async function refreshStatsChannelNames(client, guildId) {
  const config = await StatsConfig.findOne({ guildId });
  if (!config || !config.channels.length) return;

  try {
    const guild = await client.guilds.fetch(guildId);
    await guild.members.fetch().catch(logCatch('statsUpdater.fetch'));

    for (const entry of config.channels) {
      if (!entry.enabled || !entry.channelId) continue;
      try {
        const channel = await guild.channels.fetch(entry.channelId);
        if (!channel) continue;

        const newName = buildChannelName(entry, guild);
        if (channel.name !== newName) {
          await channel.setName(newName);
        }
      } catch (err) {
        console.error(`[statsUpdater] Fehler beim Aktualisieren von "${entry.type}":`, err.message);
      }
    }
  } catch (err) {
    console.error('[statsUpdater] Fehler beim Laden der Guild:', err.message);
  }
}

/**
 * Vollständiger Sync für eine einzelne Guild: erst Erstellen/Löschen, dann Namen.
 * Wird vom Webhook-Handler aufgerufen für sofortige Reaktion.
 */
async function fullSyncGuild(client, guildId) {
  await syncChannelExistence(client, guildId);
  await refreshStatsChannelNames(client, guildId);
}

async function refreshAllGuilds(client) {
  const configs = await StatsConfig.find({});
  for (const config of configs) {
    await fullSyncGuild(client, config.guildId);
  }
}

function initStatsUpdater(client) {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    refreshAllGuilds(client).catch(err => console.error('[statsUpdater] Tick-Fehler:', err));
  }, UPDATE_INTERVAL_MS);
  console.log('[statsUpdater] Gestartet (Intervall: 10 Min, wegen Discord Rate-Limit)');
}

module.exports = {
  initStatsUpdater,
  fullSyncGuild,
  syncChannelExistence,
  refreshStatsChannelNames,
};
