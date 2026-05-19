'use strict';

/**
 * LevelRole.js
 * Speichert die Rang-Rollen eines Servers (Bronze, Silber, Gold …).
 * Pro Guild können beliebig viele Rang-Rollen existieren.
 */

const { Schema, model, models } = require('mongoose');

// ── Vorlage-Definitionen ─────────────────────────────────────────────────────
// Werden auch im rankBuilder verwendet – hier zentral definiert.

const TEMPLATES = {
  klassisch: [
    { key: 'bronze',  label: 'Bronze',  emoji: '🥉', color: '#CD7F32', defaultLevel: 5  },
    { key: 'silber',  label: 'Silber',  emoji: '🥈', color: '#C0C0C0', defaultLevel: 15 },
    { key: 'gold',    label: 'Gold',    emoji: '🥇', color: '#FFD700', defaultLevel: 30 },
    { key: 'platin',  label: 'Platin',  emoji: '💎', color: '#E5E4E2', defaultLevel: 50 },
    { key: 'diamant', label: 'Diamant', emoji: '💠', color: '#B9F2FF', defaultLevel: 75 },
    { key: 'legende', label: 'Legende', emoji: '👑', color: '#FF6B6B', defaultLevel: 100},
  ],
  militaer: [
    { key: 'rekrut',    label: 'Rekrut',    emoji: '🪖', color: '#8B7355', defaultLevel: 5  },
    { key: 'soldat',    label: 'Soldat',    emoji: '⚔️', color: '#6B8E23', defaultLevel: 15 },
    { key: 'korporal', label: 'Korporal',  emoji: '🎖️', color: '#4682B4', defaultLevel: 30 },
    { key: 'sergeant',  label: 'Sergeant',  emoji: '🏅', color: '#DAA520', defaultLevel: 50 },
    { key: 'leutnant',  label: 'Leutnant',  emoji: '⭐', color: '#C0C0C0', defaultLevel: 75 },
    { key: 'general',   label: 'General',   emoji: '🌟', color: '#FFD700', defaultLevel: 100},
  ],
  fantasy: [
    { key: 'lehrling',    label: 'Lehrling',    emoji: '📚', color: '#8FBC8F', defaultLevel: 5  },
    { key: 'abenteurer',  label: 'Abenteurer',  emoji: '🗺️', color: '#20B2AA', defaultLevel: 15 },
    { key: 'ritter',      label: 'Ritter',      emoji: '🛡️', color: '#4169E1', defaultLevel: 30 },
    { key: 'magier',      label: 'Magier',      emoji: '🔮', color: '#9400D3', defaultLevel: 50 },
    { key: 'meister',     label: 'Meister',     emoji: '⚡', color: '#FF8C00', defaultLevel: 75 },
    { key: 'legende',     label: 'Legende',     emoji: '🐉', color: '#DC143C', defaultLevel: 100},
  ],
  gaming: [
    { key: 'noob',    label: 'Noob',    emoji: '🎮', color: '#808080', defaultLevel: 5  },
    { key: 'casual',  label: 'Casual',  emoji: '🕹️', color: '#32CD32', defaultLevel: 15 },
    { key: 'gamer',   label: 'Gamer',   emoji: '💻', color: '#00CED1', defaultLevel: 30 },
    { key: 'pro',     label: 'Pro',     emoji: '🏆', color: '#FFD700', defaultLevel: 50 },
    { key: 'elite',   label: 'Elite',   emoji: '💜', color: '#9B59B6', defaultLevel: 75 },
    { key: 'god',     label: 'God',     emoji: '👾', color: '#FF0000', defaultLevel: 100},
  ],
};

// ── Schema ───────────────────────────────────────────────────────────────────

const LevelRoleSchema = new Schema(
  {
    guildId:       { type: String, required: true },

    // Template-Slot Key (z.B. "bronze", "silber") – eindeutig pro Guild
    rankKey:       { type: String, required: true },

    // Anzeige
    rankLabel:     { type: String, required: true }, // z.B. "Bronze"
    rankEmoji:     { type: String, required: true }, // z.B. "🥉"
    rankColor:     { type: String, required: true }, // z.B. "#CD7F32"

    // Discord Rolle
    roleId:        { type: String, default: null  }, // null = noch nicht gesetzt

    // Ab welchem Level wird diese Rolle vergeben
    levelRequired: { type: Number, default: 1     },

    // Wurde die Rolle automatisch vom Bot erstellt?
    autoCreated:   { type: Boolean, default: false },

    // Welches Vorlage-Set wurde verwendet
    templateSet:   { type: String, default: 'klassisch' },
  },
  { timestamps: true }
);

// Eindeutiger Index: pro Guild nur einen Eintrag pro rankKey
LevelRoleSchema.index({ guildId: 1, rankKey: 1 }, { unique: true });

const LevelRole = models.LevelRole || model('LevelRole', LevelRoleSchema, 'levelRoles');

module.exports = LevelRole;
module.exports.TEMPLATES = TEMPLATES;
