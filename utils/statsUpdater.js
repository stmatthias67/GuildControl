'use strict';

/**
 * statsUpdater.js
 * Aktualisiert die Namen der Statistik-Kanäle periodisch.
 * Discord erlaubt nur 2 Kanal-Umbenennungen pro 10 Minuten pro Kanal —
 * daher läuft der Updater alle 10 Minuten, nicht öfter.
 */

const StatsConfig = require('../models/StatsConfig');
const { STAT_TYPES } = require('./statsBuilder');

const UPDATE_INTERVAL_MS = 10 * 60 * 1000; // 10 Minuten, wegen Discord Rate-Limit für Kanal-Umbenennungen
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

async function refreshStatsChannels(client, guildId) {
  const config = await StatsConfig.findOne({ guildId });
  if (!config || !config.channels.length) return;

  try {
    const guild = await client.guilds.fetch(guildId);
    // Mitglieder-Cache braucht ggf. einen Fetch, falls GuildMembers-Intent aktiv ist
    await guild.members.fetch().catch(() => null);

    for (const entry of config.channels) {
      try {
        const channel = await guild.channels.fetch(entry.channelId);
        if (!channel) continue;

        const value = computeValue(entry.type, guild);
        const newName = entry.template.replace('{count}', value.toLocaleString('de-DE'));

        if (channel.name !== newName) {
          await channel.setName(newName);
        }
      } catch (err) {
        console.error(`[statsUpdater] Fehler beim Aktualisieren von Kanal-Typ "${entry.type}":`, err.message);
      }
    }
  } catch (err) {
    console.error('[statsUpdater] Fehler beim Laden der Guild:', err);
  }
}

async function refreshAllGuilds(client) {
  const configs = await StatsConfig.find({});
  for (const config of configs) {
    await refreshStatsChannels(client, config.guildId);
  }
}

function initStatsUpdater(client) {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    refreshAllGuilds(client).catch(err => console.error('[statsUpdater] Tick-Fehler:', err));
  }, UPDATE_INTERVAL_MS);
  console.log('[statsUpdater] Gestartet (Intervall: 10 Min, wegen Discord Rate-Limit)');
}

module.exports = { initStatsUpdater, refreshStatsChannels };