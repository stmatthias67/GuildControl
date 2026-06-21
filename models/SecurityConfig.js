'use strict';

/**
 * SecurityConfig.js
 * Mongoose Model für alle Security-Einstellungen pro Guild.
 * Wird vom Security Setup befüllt und vom securityManager gelesen.
 */

const { Schema, model, models } = require("mongoose");

// ── Punishment Schema ─────────────────────────────────────────────────────────
const PunishmentSchema = new Schema({
  type:     { type: String, enum: ["warn", "mute", "kick", "ban"], default: "warn" },
  duration: { type: Number, default: 10 }, // Minuten (für mute), 0 = permanent
}, { _id: false });

// ── AutoMod Feature Schema ────────────────────────────────────────────────────
const AutoModFeatureSchema = new Schema({
  enabled:    { type: Boolean, default: false },
  punishment: { type: PunishmentSchema, default: () => ({}) },
}, { _id: false });

// ── Spam Schutz ───────────────────────────────────────────────────────────────
const SpamSchema = new Schema({
  enabled:        { type: Boolean, default: false },
  maxMessages:    { type: Number, default: 5 },   // max Nachrichten
  interval:       { type: Number, default: 5 },   // in Sekunden
  punishment:     { type: PunishmentSchema, default: () => ({}) },
}, { _id: false });

// ── Link Schutz ───────────────────────────────────────────────────────────────
const LinkSchema = new Schema({
  enabled:        { type: Boolean, default: false },
  allowedDomains: { type: [String], default: [] }, // z.B. ["discord.gg"]
  blockInvites:   { type: Boolean, default: true },
  punishment:     { type: PunishmentSchema, default: () => ({}) },
}, { _id: false });

// ── Mention Spam ──────────────────────────────────────────────────────────────
const MentionSchema = new Schema({
  enabled:     { type: Boolean, default: false },
  maxMentions: { type: Number, default: 5 },   // max Mentions pro Nachricht
  punishment:  { type: PunishmentSchema, default: () => ({}) },
}, { _id: false });

// ── Caps Schutz ───────────────────────────────────────────────────────────────
const CapsSchema = new Schema({
  enabled:    { type: Boolean, default: false },
  percentage: { type: Number, default: 70 },  // % Caps die getriggert werden
  minLength:  { type: Number, default: 10 },  // Mindestlänge der Nachricht
  punishment: { type: PunishmentSchema, default: () => ({}) },
}, { _id: false });

// ── Verification System ───────────────────────────────────────────────────────
const VerificationSchema = new Schema({
  enabled:         { type: Boolean, default: false },
  type:            { type: String, enum: ["button", "captcha", "reaction"], default: "button" },
  channelId:       { type: String, default: null },
  verifiedRoleId:  { type: String, default: null },
  unverifiedRoleId:{ type: String, default: null },
  message:         { type: String, default: "Klicke auf den Button um dich zu verifizieren." },
}, { _id: false });

// ── Anti Raid ─────────────────────────────────────────────────────────────────
const AntiRaidSchema = new Schema({
  enabled:         { type: Boolean, default: false },
  joinThreshold:   { type: Number, default: 10 }, // Joins innerhalb von...
  joinInterval:    { type: Number, default: 10 }, // ...Sekunden
  action:          { type: String, enum: ["kick", "ban", "lockdown"], default: "kick" },
  // Automatischer Lockdown
  autoLockdown:    { type: Boolean, default: false },
}, { _id: false });

// ── Lockdown ──────────────────────────────────────────────────────────────────
const LockdownSchema = new Schema({
  active:           { type: Boolean, default: false },
  activatedAt:      { type: Date, default: null },
  activatedBy:      { type: String, default: null }, // User ID
  reason:           { type: String, default: null },
  // Channels die beim Lockdown gesperrt werden (leer = alle öffentlichen)
  lockedChannelIds: { type: [String], default: [] },
}, { _id: false });

// ── Security Rollen ───────────────────────────────────────────────────────────
const SecurityRolesSchema = new Schema({
  // Diese Rollen sind vom AutoMod ausgenommen
  bypassRoleIds:   { type: [String], default: [] },
  // Diese Rollen können den Lockdown aktivieren
  lockdownRoleIds: { type: [String], default: [] },
  // Mute-Rolle (für Bestrafungen)
  muteRoleId:      { type: String, default: null },
}, { _id: false });

// ── Haupt-Schema ──────────────────────────────────────────────────────────────
const SecurityConfigSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true },

    // System-Status
    enabled: { type: Boolean, default: false },

    // Log-Kanal für alle Security-Events
    logChannelId: { type: String, default: null },

    // ── AutoMod Features ─────────────────────────────────────────────────────
    spam:     { type: SpamSchema,   default: () => ({}) },
    links:    { type: LinkSchema,   default: () => ({}) },
    mentions: { type: MentionSchema, default: () => ({}) },
    caps:     { type: CapsSchema,   default: () => ({}) },

    // ── Systeme ───────────────────────────────────────────────────────────────
    verification: { type: VerificationSchema, default: () => ({}) },
    antiRaid:     { type: AntiRaidSchema,     default: () => ({}) },

    // ── Lockdown Status ───────────────────────────────────────────────────────
    lockdown: { type: LockdownSchema, default: () => ({}) },

    // ── Security Rollen ───────────────────────────────────────────────────────
    roles: { type: SecurityRolesSchema, default: () => ({}) },

    // ── Setup Status ──────────────────────────────────────────────────────────
    setupDone: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const SecurityConfig = models.SecurityConfig || model("SecurityConfig", SecurityConfigSchema, "securityConfig");

module.exports = SecurityConfig;
