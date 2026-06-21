'use strict';

// In-memory store: guildId -> { userId, step, data }
const sessions = new Map();

const SESSION_TTL = 10 * 60 * 1000; // 10 min

function createSession(guildId, userId) {
  const session = {
    userId,
    step: 'roles',
    data: {
      roles:    { admin: null, moderator: null, support: null, member: null },
      channels: { logs: null, tickets: null },
      systems:  { moderation: false, tickets: false, logs: false },
    },
    expiresAt: Date.now() + SESSION_TTL,
  };
  sessions.set(guildId, session);
  return session;
}

function getSession(guildId) {
  const session = sessions.get(guildId);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(guildId);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL; // refresh
  return session;
}

function deleteSession(guildId) {
  sessions.delete(guildId);
}

module.exports = { createSession, getSession, deleteSession };
