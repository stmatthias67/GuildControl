const User = require('../models/User');

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

/**
 * Gibt einen User aus der DB zurück (oder erstellt ihn).
 */
async function getOrCreateUser(userId, guildId) {
  return User.findOneAndUpdate(
    { userId, guildId },
    { $setOnInsert: { userId, guildId } },
    { upsert: true, new: true }
  );
}

/**
 * Vergibt XP an einen User (mit 60s Cooldown pro Nachricht).
 * Gibt { leveledUp, newLevel } zurück.
 */
async function grantXp(userId, guildId, amount = null) {
  const xpGain = amount ?? Math.floor(Math.random() * 11) + 15; // 15–25 XP
  const cooldown = 60 * 1000;

  const user = await getOrCreateUser(userId, guildId);

  // Cooldown prüfen
  if (user.lastMessage && Date.now() - user.lastMessage.getTime() < cooldown) {
    return { leveledUp: false, newLevel: user.level };
  }

  user.xp += xpGain;
  user.lastMessage = new Date();

  // Level-Up prüfen
  let leveledUp = false;
  while (user.xp >= totalXpForLevel(user.level + 1)) {
    user.level += 1;
    leveledUp = true;
  }

  await user.save();
  return { leveledUp, newLevel: user.level };
}

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
  return User.find({ guildId }).sort({ xp: -1 }).limit(limit);
}

/**
 * Fortschritt innerhalb des aktuellen Levels (0–1).
 */
function getLevelProgress(user) {
  const currentLevelXp = totalXpForLevel(user.level);
  const nextLevelXp = totalXpForLevel(user.level + 1);
  const progressXp = user.xp - currentLevelXp;
  const neededXp = nextLevelXp - currentLevelXp;
  return { progressXp, neededXp, percent: progressXp / neededXp };
}

/**
 * Baut einen ASCII Fortschrittsbalken.
 */
function buildProgressBar(percent, length = 14) {
  const filled = Math.round(percent * length);
  const empty = length - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}

module.exports = {
  xpForLevel,
  totalXpForLevel,
  getOrCreateUser,
  grantXp,
  getUserRank,
  getLeaderboard,
  getLevelProgress,
  buildProgressBar,
};
