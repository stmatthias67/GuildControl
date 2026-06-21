'use strict';

/**
 * RankConfig.js
 * Guild-weite Konfiguration für das Rank/Level System.
 */

const { Schema, model, models } = require('mongoose');

const RankConfigSchema = new Schema(
  {
    guildId: {
      type:     String,
      required: true,
      unique:   true,
    },

    // ── System Toggle ────────────────────────────────────────────────────────
    enabled: { type: Boolean, default: false },

    // ── XP Einstellungen ─────────────────────────────────────────────────────
    xp: {
      minPerMessage:  { type: Number, default: 15  }, // Min XP pro Nachricht
      maxPerMessage:  { type: Number, default: 25  }, // Max XP pro Nachricht
      cooldown:       { type: Number, default: 60  }, // Sekunden zwischen XP-Vergaben
      multiplier:     { type: Number, default: 1.0 }, // Globaler XP Multiplikator
    },

    // ── Level-Up Nachrichten ─────────────────────────────────────────────────
    levelUp: {
      enabled:   { type: Boolean, default: true  },
      channelId: { type: String,  default: null   }, // null = im aktuellen Channel
      message:   {
        type:    String,
        default: '🎉 {user} hat **Level {level}** erreicht!',
      },
    },

    // ── Rang-Rollen Vorlage ──────────────────────────────────────────────────
    // 'klassisch' | 'militaer' | 'fantasy' | 'gaming' | 'custom'
    templateSet: { type: String, default: 'klassisch' },

    // ── Ignorierte Channels / Rollen ─────────────────────────────────────────
    ignoredChannels: [{ type: String }],
    ignoredRoles:    [{ type: String }],

    // ── Leaderboard ──────────────────────────────────────────────────────────
    leaderboard: {
      enabled:    { type: Boolean, default: true  },
      pageSize:   { type: Number,  default: 10    },
    },
  },
  { timestamps: true }
);

const RankConfig = models.RankConfig || model('RankConfig', RankConfigSchema, 'rankConfig');

module.exports = RankConfig;
