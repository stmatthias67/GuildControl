'use strict';

/**
 * securityManager.js
 * Kernlogik des Security Systems.
 * Wird von messageCreate.js und guildMemberAdd.js aufgerufen.
 *
 * Features:
 *   - checkSpam()       → Spam-Erkennung mit In-Memory-Tracking
 *   - checkLinks()      → Link + Invite-Filter
 *   - checkMentions()   → Mention-Spam
 *   - checkCaps()       → Caps-Filter
 *   - applyPunishment() → Einheitlicher Punishment-Handler
 *   - checkRaid()       → Raid-Erkennung per Join-Rate
 *   - activateLockdown()/ liftLockdown()
 *   - logSecurityEvent()→ Security Log-Channel
 */

const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const SecurityConfig = require("../models/SecurityConfig");

// ── Config-Cache (30s TTL) ────────────────────────────────────────────────────
const configCache   = new Map(); // guildId → { cfg, timestamp }
const CACHE_TTL_MS  = 30_000;

async function getConfig(guildId) {
  const cached = configCache.get(guildId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.cfg;

  let cfg = await SecurityConfig.findOne({ guildId });
  if (!cfg) cfg = await SecurityConfig.create({ guildId });
  configCache.set(guildId, { cfg, timestamp: Date.now() });
  return cfg;
}

function clearCache(guildId) {
  configCache.delete(guildId);
}

// ── Spam-Tracking (In-Memory) ─────────────────────────────────────────────────
// Map: guildId:userId → [timestamps]
const spamTracker = new Map();

function trackMessage(guildId, userId) {
  const key  = `${guildId}:${userId}`;
  const now  = Date.now();
  const prev = spamTracker.get(key) || [];
  const next = [...prev, now];
  spamTracker.set(key, next);
  return next;
}

function cleanSpamTracker(guildId, userId, intervalMs) {
  const key  = `${guildId}:${userId}`;
  const now  = Date.now();
  const prev = spamTracker.get(key) || [];
  const next = prev.filter(t => now - t < intervalMs);
  spamTracker.set(key, next);
  return next;
}

// ── Raid-Tracking (In-Memory) ─────────────────────────────────────────────────
// Map: guildId → [timestamps of joins]
const raidTracker = new Map();

function trackJoin(guildId) {
  const now  = Date.now();
  const prev = raidTracker.get(guildId) || [];
  const next = [...prev, now];
  raidTracker.set(guildId, next);
  return next;
}

function cleanRaidTracker(guildId, intervalMs) {
  const now  = Date.now();
  const prev = raidTracker.get(guildId) || [];
  const next = prev.filter(t => now - t < intervalMs * 1000);
  raidTracker.set(guildId, next);
  return next;
}

// ── Bypass-Prüfung ────────────────────────────────────────────────────────────

function hasBypass(member, cfg) {
  if (!cfg.roles?.bypassRoleIds?.length) return false;
  return cfg.roles.bypassRoleIds.some(id => member.roles.cache.has(id));
}

// ── Punishment ────────────────────────────────────────────────────────────────

/**
 * Führt die konfigurierte Bestrafung aus.
 * @param {GuildMember} member
 * @param {Object} punishment  { type: "warn"|"mute"|"kick"|"ban", duration: number }
 * @param {string} reason
 * @param {SecurityConfig} cfg
 */
async function applyPunishment(member, punishment, reason, cfg) {
  if (!punishment?.type) return;

  try {
    switch (punishment.type) {

      case "warn":
        // Nur DM – Warnsystem-Integration optional
        await member.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("⚠️ Verwarnung")
              .setDescription(`Du wurdest auf **${member.guild.name}** verwarnt.\n**Grund:** ${reason}`)
              .setColor(0xfee75c)
              .setTimestamp()
          ]
        }).catch(() => null);
        break;

      case "mute": {
        const muteRoleId = cfg.roles?.muteRoleId;
        if (!muteRoleId) break;
        await member.roles.add(muteRoleId, reason).catch(() => null);

        // Automatisch wieder entmuten nach duration Minuten
        if (punishment.duration > 0) {
          const ms = punishment.duration * 60_000;
          setTimeout(async () => {
            await member.roles.remove(muteRoleId, "AutoMod: Mute abgelaufen").catch(() => null);
          }, ms);
        }
        break;
      }

      case "kick":
        await member.kick(reason).catch(() => null);
        break;

      case "ban":
        await member.ban({ reason, deleteMessageSeconds: 60 }).catch(() => null);
        break;
    }
  } catch (err) {
    console.error("[Security] applyPunishment Fehler:", err);
  }
}

// ── Security Log ──────────────────────────────────────────────────────────────

/**
 * Sendet einen Log-Eintrag in den konfigurierten Security Log-Kanal.
 * @param {Guild} guild
 * @param {SecurityConfig} cfg
 * @param {Object} opts { title, description, color, fields }
 */
async function logSecurityEvent(guild, cfg, { title, description, color = 0xed4245, fields = [] }) {
  if (!cfg.logChannelId) return;
  const logChannel = guild.channels.cache.get(cfg.logChannelId);
  if (!logChannel) return;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();

  if (fields.length) embed.addFields(fields);

  await logChannel.send({ embeds: [embed] }).catch(() => null);
}

// ── SPAM CHECK ────────────────────────────────────────────────────────────────

/**
 * Prüft ob ein User Spam betreibt.
 * Löscht die Nachricht bei Spam-Erkennung und bestraft den User.
 * @param {Message} message
 * @returns {boolean} true wenn Spam erkannt
 */
async function checkSpam(message) {
  const cfg = await getConfig(message.guild.id);
  if (!cfg.enabled || !cfg.spam?.enabled) return false;
  if (hasBypass(message.member, cfg)) return false;

  const intervalMs = (cfg.spam.interval || 5) * 1000;
  const maxMessages = cfg.spam.maxMessages || 5;

  trackMessage(message.guild.id, message.author.id);
  const timestamps = cleanSpamTracker(message.guild.id, message.author.id, intervalMs);

  if (timestamps.length >= maxMessages) {
    // Spam erkannt!
    spamTracker.delete(`${message.guild.id}:${message.author.id}`);

    await message.delete().catch(() => null);

    await applyPunishment(message.member, cfg.spam.punishment, "AutoMod: Spam", cfg);

    await logSecurityEvent(message.guild, cfg, {
      title: "📨 Spam erkannt",
      description: `${message.author} hat in <#${message.channel.id}> Spam betrieben.`,
      color: 0xfee75c,
      fields: [
        { name: "User",      value: `${message.author} (\`${message.author.id}\`)`, inline: true },
        { name: "Kanal",     value: `<#${message.channel.id}>`,                     inline: true },
        { name: "Bestrafung",value: cfg.spam.punishment?.type ?? "keine",            inline: true },
      ]
    });

    return true;
  }
  return false;
}

// ── LINK CHECK ────────────────────────────────────────────────────────────────

const INVITE_REGEX = /discord(?:\.gg|\.com\/invite|app\.com\/invite)\/[a-zA-Z0-9-]+/gi;
const LINK_REGEX   = /https?:\/\/[^\s]+/gi;

/**
 * Prüft ob eine Nachricht unerlaubte Links enthält.
 * @param {Message} message
 * @returns {boolean} true wenn blockiert
 */
async function checkLinks(message) {
  const cfg = await getConfig(message.guild.id);
  if (!cfg.enabled || !cfg.links?.enabled) return false;
  if (hasBypass(message.member, cfg)) return false;

  const content = message.content;
  let blocked = false;
  let reason  = "";

  // Discord Invite Check
  if (cfg.links.blockInvites && INVITE_REGEX.test(content)) {
    blocked = true;
    reason  = "Discord-Invite Link";
  }

  // Allgemeine Link-Prüfung
  if (!blocked) {
    const links = content.match(LINK_REGEX) || [];
    const allowed = cfg.links.allowedDomains || [];

    if (links.length > 0 && allowed.length > 0) {
      const hasBlocked = links.some(link => {
        try {
          const url    = new URL(link);
          const domain = url.hostname.replace(/^www\./, "");
          return !allowed.some(d => domain === d || domain.endsWith(`.${d}`));
        } catch { return false; }
      });
      if (hasBlocked) { blocked = true; reason = "Nicht erlaubter Link"; }
    } else if (links.length > 0 && allowed.length === 0) {
      // Keine Whitelist → alle Links blockieren
      blocked = true;
      reason  = "Link nicht erlaubt";
    }
  }

  if (!blocked) return false;

  await message.delete().catch(() => null);
  await applyPunishment(message.member, cfg.links.punishment, `AutoMod: ${reason}`, cfg);
  await logSecurityEvent(message.guild, cfg, {
    title: "🔗 Link blockiert",
    description: `${message.author} hat einen unerlaubten Link in <#${message.channel.id}> gesendet.`,
    fields: [
      { name: "User",      value: `${message.author} (\`${message.author.id}\`)`, inline: true },
      { name: "Grund",     value: reason,                                          inline: true },
      { name: "Bestrafung",value: cfg.links.punishment?.type ?? "keine",           inline: true },
    ]
  });

  return true;
}

// ── MENTION CHECK ─────────────────────────────────────────────────────────────

/**
 * Prüft ob eine Nachricht zu viele @-Mentions enthält.
 * @param {Message} message
 * @returns {boolean} true wenn blockiert
 */
async function checkMentions(message) {
  const cfg = await getConfig(message.guild.id);
  if (!cfg.enabled || !cfg.mentions?.enabled) return false;
  if (hasBypass(message.member, cfg)) return false;

  // Zähle User-Mentions (dedupliziert)
  const mentionCount = message.mentions.users.size + message.mentions.roles.size;
  if (mentionCount < (cfg.mentions.maxMentions || 5)) return false;

  await message.delete().catch(() => null);
  await applyPunishment(message.member, cfg.mentions.punishment, "AutoMod: Mention Spam", cfg);
  await logSecurityEvent(message.guild, cfg, {
    title: "📢 Mention Spam erkannt",
    description: `${message.author} hat \`${mentionCount}\` Mentions in einer Nachricht verwendet.`,
    fields: [
      { name: "User",      value: `${message.author} (\`${message.author.id}\`)`,  inline: true },
      { name: "Kanal",     value: `<#${message.channel.id}>`,                      inline: true },
      { name: "Mentions",  value: `${mentionCount}`,                               inline: true },
      { name: "Bestrafung",value: cfg.mentions.punishment?.type ?? "keine",        inline: true },
    ]
  });

  return true;
}

// ── CAPS CHECK ────────────────────────────────────────────────────────────────

/**
 * Prüft ob eine Nachricht zu viele Großbuchstaben enthält.
 * @param {Message} message
 * @returns {boolean} true wenn blockiert
 */
async function checkCaps(message) {
  const cfg = await getConfig(message.guild.id);
  if (!cfg.enabled || !cfg.caps?.enabled) return false;
  if (hasBypass(message.member, cfg)) return false;

  const content   = message.content;
  const minLength = cfg.caps.minLength || 10;
  if (content.length < minLength) return false;

  // Nur Buchstaben zählen
  const letters    = content.replace(/[^a-zA-ZäöüÄÖÜ]/g, "");
  if (letters.length === 0) return false;

  const upperCount = (letters.match(/[A-ZÄÖÜ]/g) || []).length;
  const percentage = Math.round((upperCount / letters.length) * 100);

  if (percentage < (cfg.caps.percentage || 70)) return false;

  await message.delete().catch(() => null);
  await applyPunishment(message.member, cfg.caps.punishment, "AutoMod: Caps Spam", cfg);
  await logSecurityEvent(message.guild, cfg, {
    title: "🔡 Caps Spam erkannt",
    description: `${message.author} hat eine Nachricht mit \`${percentage}%\` Großbuchstaben gesendet.`,
    fields: [
      { name: "User",      value: `${message.author} (\`${message.author.id}\`)`, inline: true },
      { name: "Kanal",     value: `<#${message.channel.id}>`,                     inline: true },
      { name: "Caps %",    value: `${percentage}%`,                               inline: true },
      { name: "Bestrafung",value: cfg.caps.punishment?.type ?? "keine",           inline: true },
    ]
  });

  return true;
}

// ── RAID CHECK ────────────────────────────────────────────────────────────────

/**
 * Wird bei guildMemberAdd aufgerufen.
 * Erkennt Raids anhand der Join-Rate.
 * @param {GuildMember} member
 * @returns {boolean} true wenn Raid erkannt
 */
async function checkRaid(member) {
  const { guild } = member;
  const cfg = await getConfig(guild.id);
  if (!cfg.enabled || !cfg.antiRaid?.enabled) return false;

  const threshold = cfg.antiRaid.joinThreshold || 10;
  const interval  = cfg.antiRaid.joinInterval  || 10; // Sekunden

  trackJoin(guild.id);
  const joins = cleanRaidTracker(guild.id, interval);

  if (joins.length < threshold) return false;

  // Raid erkannt!
  raidTracker.delete(guild.id); // Reset

  await logSecurityEvent(guild, cfg, {
    title: "🚨 RAID ERKANNT",
    description: `**${joins.length}** Joins innerhalb von **${interval}s** erkannt!`,
    color: 0xed4245,
    fields: [
      { name: "Aktion",    value: cfg.antiRaid.action || "kick", inline: true },
      { name: "Joins",     value: `${joins.length}`,             inline: true },
      { name: "Zeitfenster", value: `${interval}s`,              inline: true },
    ]
  });

  // Aktion ausführen
  const action = cfg.antiRaid.action || "kick";

  if (action === "lockdown" || cfg.antiRaid.autoLockdown) {
    await activateLockdown(guild, guild.client.user.id, "AutoMod: Raid erkannt");
  }

  if (action === "kick") {
    await member.kick("AutoMod: Raid erkannt").catch(() => null);
  } else if (action === "ban") {
    await member.ban({ reason: "AutoMod: Raid erkannt", deleteMessageSeconds: 0 }).catch(() => null);
  }

  return true;
}

// ── LOCKDOWN ──────────────────────────────────────────────────────────────────

/**
 * Aktiviert den Server-Lockdown.
 * Sperrt alle öffentlichen Text-Channels für @everyone.
 * @param {Guild} guild
 * @param {string} activatedById  User-ID
 * @param {string} reason
 */
async function activateLockdown(guild, activatedById, reason = "Kein Grund angegeben") {
  const cfg = await getConfig(guild.id);

  // @everyone Rolle
  const everyoneRole = guild.roles.everyone;

  // Alle öffentlichen Text-Channels sperren
  const lockedIds = [];
  const channels  = guild.channels.cache.filter(
    c => c.type === 0 && c.permissionsFor(everyoneRole)?.has(PermissionFlagsBits.SendMessages)
  );

  for (const [, channel] of channels) {
    try {
      await channel.permissionOverwrites.edit(everyoneRole, {
        SendMessages: false
      });
      lockedIds.push(channel.id);
    } catch { /* Kanal ohne Berechtigung überspringen */ }
  }

  // Config updaten
  await SecurityConfig.findOneAndUpdate(
    { guildId: guild.id },
    {
      "lockdown.active":           true,
      "lockdown.activatedAt":      new Date(),
      "lockdown.activatedBy":      activatedById,
      "lockdown.reason":           reason,
      "lockdown.lockedChannelIds": lockedIds,
    },
    { upsert: true }
  );
  clearCache(guild.id);

  await logSecurityEvent(guild, cfg, {
    title: "🔒 SERVER LOCKDOWN AKTIVIERT",
    description: `Der Server wurde in den Lockdown-Modus versetzt.\n**${lockedIds.length}** Channels gesperrt.`,
    color: 0xed4245,
    fields: [
      { name: "Aktiviert von", value: `<@${activatedById}>`, inline: true },
      { name: "Grund",         value: reason,                inline: true },
    ]
  });
}

/**
 * Hebt den Server-Lockdown auf.
 * @param {Guild} guild
 * @param {string} liftedById
 */
async function liftLockdown(guild, liftedById) {
  const cfg = await SecurityConfig.findOne({ guildId: guild.id });
  if (!cfg?.lockdown?.active) return;

  const lockedIds   = cfg.lockdown.lockedChannelIds || [];
  const everyoneRole = guild.roles.everyone;

  for (const channelId of lockedIds) {
    const channel = guild.channels.cache.get(channelId);
    if (!channel) continue;
    try {
      await channel.permissionOverwrites.edit(everyoneRole, {
        SendMessages: null // Zurücksetzen auf Kategorie/Default
      });
    } catch { /* Fehler überspringen */ }
  }

  await SecurityConfig.findOneAndUpdate(
    { guildId: guild.id },
    {
      "lockdown.active":           false,
      "lockdown.activatedAt":      null,
      "lockdown.activatedBy":      null,
      "lockdown.reason":           null,
      "lockdown.lockedChannelIds": [],
    }
  );
  clearCache(guild.id);

  await logSecurityEvent(guild, cfg, {
    title: "🔓 Lockdown aufgehoben",
    description: `Der Server-Lockdown wurde aufgehoben.\n**${lockedIds.length}** Channels entsperrt.`,
    color: 0x57f287,
    fields: [
      { name: "Aufgehoben von", value: `<@${liftedById}>`, inline: true },
    ]
  });
}

module.exports = {
  getConfig,
  clearCache,
  checkSpam,
  checkLinks,
  checkMentions,
  checkCaps,
  checkRaid,
  applyPunishment,
  activateLockdown,
  liftLockdown,
  logSecurityEvent,
};
