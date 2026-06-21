'use strict';

/**
 * levelUtils.js  — ERWEITERT
 *
 * Neu gegenüber der alten Version:
 *  - grantXp()         liest RankConfig (enabled, xp settings, ignoredChannels,
 *                      ignoredRoles, multiplier, cooldown)
 *  - checkAndAssignRankRoles() weist Level-Rollen automatisch zu / entzieht sie
 *  - Alle bestehenden Exports bleiben kompatibel
 */

const User       = require('../models/User');
const RankConfig = require('../models/RankConfig');
const LevelRole  = require('../models/LevelRole');

// ─── Formeln ──────────────────────────────────────────────────────────────────

/** XP-Schwelle für ein bestimmtes Level */
function xpForLevel(level) {
  return 100 * level * level + 50 * level + 100;
}

/** Gesamte XP-Schwelle bis zum Erreichen von `level` */
function totalXpForLevel(level) {
  let total = 0;
  for (let i = 0; i < level; i++) total += xpForLevel(i);
  return total;
}

// ─── DB-Hilfsfunktionen ───────────────────────────────────────────────────────

/**
 * Gibt einen User aus der DB zurück oder erstellt ihn.
 */
async function getOrCreateUser(userId, guildId) {
  return User.findOneAndUpdate(
    { userId, guildId },
    { $setOnInsert: { userId, guildId } },
    { upsert: true, new: true }
  );
}

// ─── Rang-Rollen Vergabe ──────────────────────────────────────────────────────

/**
 * Prüft nach einem Level-Up, welche Rang-Rollen der User bekommen/verlieren soll.
 * Gibt { added, removed } zurück (Arrays von Rollen-IDs).
 *
 * @param {GuildMember} member   – Discord GuildMember
 * @param {number}      level    – Aktuelles Level des Users
 * @param {string}      guildId
 */
async function checkAndAssignRankRoles(member, level, guildId) {
  if (!member) return { added: [], removed: [] };

  const levelRoles = await LevelRole.find({ guildId }).sort({ levelRequired: 1 });
  if (!levelRoles.length) return { added: [], removed: [] };

  const added   = [];
  const removed = [];

  for (const lr of levelRoles) {
    if (!lr.roleId) continue;

    const role = member.guild.roles.cache.get(lr.roleId);
    if (!role) continue;

    const hasRole   = member.roles.cache.has(lr.roleId);
    const shouldHave = level >= lr.levelRequired;

    if (shouldHave && !hasRole) {
      await member.roles.add(role, `GuildControl – Level ${level} erreicht (${lr.rankLabel})`).catch(() => null);
      added.push(lr.roleId);
    } else if (!shouldHave && hasRole) {
      // Rang-Rolle entziehen wenn User darunter fällt (z.B. nach Reset)
      await member.roles.remove(role, 'GuildControl – Level-Rang Korrektur').catch(() => null);
      removed.push(lr.roleId);
    }
  }

  return { added, removed };
}

// ─── XP Vergabe ───────────────────────────────────────────────────────────────

/**
 * Vergibt XP an einen User.
 *
 * Neu:
 *  - Liest RankConfig für: enabled, xp settings, ignoredChannels, ignoredRoles
 *  - Berücksichtigt Multiplikator
 *  - Gibt { leveledUp, newLevel, xpGained, blocked } zurück
 *    (blocked = true wenn ignoriert / disabled / cooldown)
 *
 * @param {string}       userId
 * @param {string}       guildId
 * @param {object|null}  options
 * @param {number|null}  options.amount       – Fixer XP-Betrag (überschreibt Random)
 * @param {string|null}  options.channelId    – Kanal-ID der Nachricht (für Ignore-Check)
 * @param {string[]}     options.memberRoles  – Rollen-IDs des Mitglieds (für Ignore-Check)
 * @param {GuildMember|null} options.member   – Für automatische Rang-Rollen Vergabe
 */
async function grantXp(userId, guildId, options = {}) {
  const {
    amount      = null,
    channelId   = null,
    memberRoles = [],
    member      = null,
  } = (typeof options === 'object' && options !== null && !Array.isArray(options))
    ? options
    : {};

  // ── RankConfig laden ───────────────────────────────────────────────────────
  const rankConfig = await RankConfig.findOne({ guildId });

  // System deaktiviert
  if (rankConfig && !rankConfig.enabled) {
    return { leveledUp: false, newLevel: 0, xpGained: 0, blocked: true, reason: 'disabled' };
  }

  // Ignorierter Kanal
  if (channelId && rankConfig?.ignoredChannels?.includes(channelId)) {
    return { leveledUp: false, newLevel: 0, xpGained: 0, blocked: true, reason: 'ignoredChannel' };
  }

  // Ignorierte Rolle
  if (memberRoles.length && rankConfig?.ignoredRoles?.some(r => memberRoles.includes(r))) {
    return { leveledUp: false, newLevel: 0, xpGained: 0, blocked: true, reason: 'ignoredRole' };
  }

  // ── XP-Einstellungen ──────────────────────────────────────────────────────
  const xpCfg       = rankConfig?.xp ?? {};
  const minXp       = xpCfg.minPerMessage  ?? 15;
  const maxXp       = xpCfg.maxPerMessage  ?? 25;
  const cooldownMs  = (xpCfg.cooldown      ?? 60) * 1000;
  const multiplier  = xpCfg.multiplier     ?? 1.0;

  // ── User laden ────────────────────────────────────────────────────────────
  const user = await getOrCreateUser(userId, guildId);

  // Cooldown prüfen
  if (user.lastMessage && Date.now() - user.lastMessage.getTime() < cooldownMs) {
    return { leveledUp: false, newLevel: user.level, xpGained: 0, blocked: true, reason: 'cooldown' };
  }

  // ── XP berechnen ─────────────────────────────────────────────────────────
  const baseXp  = amount ?? Math.floor(Math.random() * (maxXp - minXp + 1)) + minXp;
  const xpGain  = Math.floor(baseXp * multiplier);

  user.xp          += xpGain;
  user.lastMessage  = new Date();

  // ── Level-Up prüfen ───────────────────────────────────────────────────────
  let leveledUp = false;
  while (user.xp >= totalXpForLevel(user.level + 1)) {
    user.level += 1;
    leveledUp   = true;
  }

  await user.save();

  // ── Rang-Rollen automatisch vergeben ─────────────────────────────────────
  if (leveledUp && member) {
    await checkAndAssignRankRoles(member, user.level, guildId).catch(err => {
      console.error('[levelUtils] Fehler bei Rang-Rollen Vergabe:', err);
    });
  }

  return { leveledUp, newLevel: user.level, xpGained: xpGain, blocked: false };
}

// ─── Leaderboard / Rang ───────────────────────────────────────────────────────

/**
 * Holt Rang eines Users (Position im Leaderboard).
 */
async function getUserRank(userId, guildId) {
  const user = await User.findOne({ userId, guildId });
  if (!user) return { user: null, rank: null };

  const rank = await User.countDocuments({
    guildId,
    xp: { $gt: user.xp },
  });

  return { user, rank: rank + 1 };
}

/**
 * Holt Top-N User des Servers.
 */
async function getLeaderboard(guildId, limit = 10) {
  // Limit aus RankConfig lesen falls verfügbar
  const rankConfig  = await RankConfig.findOne({ guildId });
  const resolvedLim = rankConfig?.leaderboard?.pageSize ?? limit;
  return User.find({ guildId }).sort({ xp: -1 }).limit(resolvedLim);
}

// ─── Fortschritts-Helfer ──────────────────────────────────────────────────────

/**
 * Fortschritt innerhalb des aktuellen Levels (0–1).
 */
function getLevelProgress(user) {
  const currentLevelXp = totalXpForLevel(user.level);
  const nextLevelXp    = totalXpForLevel(user.level + 1);
  const progressXp     = user.xp - currentLevelXp;
  const neededXp       = nextLevelXp - currentLevelXp;
  return { progressXp, neededXp, percent: progressXp / neededXp };
}

/**
 * Baut einen ASCII Fortschrittsbalken.
 */
function buildProgressBar(percent, length = 14) {
  const filled = Math.round(percent * length);
  const empty  = length - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  // Formeln
  xpForLevel,
  totalXpForLevel,

  // DB
  getOrCreateUser,

  // XP
  grantXp,

  // Rang-Rollen
  checkAndAssignRankRoles,

  // Leaderboard
  getUserRank,
  getLeaderboard,

  // Fortschritt
  getLevelProgress,
  buildProgressBar,
};
