'use strict';

const { Schema, model, models } = require("mongoose");

const GuildConfigSchema = new Schema(
  {
    guildId: {
      type: String,
      required: true,
      unique: true
    },

    // ── Rollen ───────────────────────────────────────────────────────────────
    roles: {
      // Führung
      projektleitung:     { type: String, default: null },
      stv_projektleitung: { type: String, default: null },
      teamleitung:        { type: String, default: null },
      stv_teamleitung:    { type: String, default: null },

      // Staff
      admin:          { type: String, default: null },
      test_admin:     { type: String, default: null },
      moderator:      { type: String, default: null },
      test_moderator: { type: String, default: null },
      supporter:      { type: String, default: null },
      test_supporter: { type: String, default: null },

      // Mitglieder
      mitglied: { type: String, default: null },

      // Bots
      bot: { type: String, default: null },

      // Donater
      bronze_donater: { type: String, default: null },
      silber_donater: { type: String, default: null },
      gold_donater:   { type: String, default: null },
      platin_donater: { type: String, default: null },

      // Sonstige
      partner:       { type: String, default: null },
      nitro_booster: { type: String, default: null },
    },

    // ── Channels (Legacy) ────────────────────────────────────────────────────
    channels: {
      logs:    { type: String, default: null },
      tickets: { type: String, default: null },
    },

    // ── Systeme (Legacy) ─────────────────────────────────────────────────────
    systems: {
      moderation: { type: Boolean, default: false },
      tickets:    { type: Boolean, default: false },
      logs:       { type: Boolean, default: false },
    },

    // ── Tickets ──────────────────────────────────────────────────────────────
    tickets: {
      categoryId:    { type: String, default: null },
      logChannelId:  { type: String, default: null },
      supportRoleId: { type: String, default: null },
    },

    // ── Security ─────────────────────────────────────────────────────────────
    security: {
      enabled:      { type: Boolean, default: false },
      logChannelId: { type: String, default: null },
    },

    // ── Voice ────────────────────────────────────────────────────────────────
    voice: {
      categoryId:       { type: String, default: null },
      creatorChannelId: { type: String, default: null },
    },

    // ── Rang-System ──────────────────────────────────────────────────────────
    rank: {
      enabled:           { type: Boolean, default: false },
      announceChannelId: { type: String, default: null },
    },

    // ── Bewerbungen ──────────────────────────────────────────────────────────
    applications: {
      channelId:       { type: String, default: null },
      reviewChannelId: { type: String, default: null },
    },

    // ── Statistiken ──────────────────────────────────────────────────────────
    stats: {
      memberCountChannelId: { type: String, default: null },
      onlineCountChannelId: { type: String, default: null },
      boostCountChannelId:  { type: String, default: null },
    },
  },
  { timestamps: true }
);

const GuildConfig = models.GuildConfig || model("GuildConfig", GuildConfigSchema, "guildConfig");

module.exports = GuildConfig;