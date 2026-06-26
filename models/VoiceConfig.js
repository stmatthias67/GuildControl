'use strict';

/**
 * VoiceConfig.js
 * Konfiguration für das Voice-/Support-Warteraum-System.
 */

const { Schema, model, models } = require('mongoose');

const SupportTimeWindowSchema = new Schema({
  // 0 = Sonntag ... 6 = Samstag (JS Date.getDay()-Konvention)
  dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
  startMinute: { type: Number, required: true, min: 0, max: 1439 }, // Minuten seit Mitternacht
  endMinute:   { type: Number, required: true, min: 0, max: 1439 },
}, { _id: false });

const VoiceConfigSchema = new Schema({
  guildId: { type: String, required: true, unique: true },

  // ── Warteraum ──────────────────────────────────────────────────────────────
  // Warteraum-Channel, dessen Beitritt den Bot triggert
  waitingRoomChannelId: { type: String, default: null },

  // Rollen-Keys aus GuildConfig.roles, die bei Beitritt innerhalb der Supportzeit benachrichtigt werden
  notifyRoleKeys: { type: [String], default: [] },

  // Text-Channel, in dem die Benachrichtigung an Support-Rollen gepostet wird
  notifyChannelId: { type: String, default: null },

  // Kategorie, in der pro Support-Fall ein eigener Voice-Channel erstellt wird
  supportCaseCategoryId: { type: String, default: null },

  // ── Supportzeiten ────────────────────────────────────────────────────────
  // Wöchentlich wiederkehrende Supportzeiten. Standard: Mo-Sa 10:00-22:00.
  // Hinweis: wird zukünftig nur noch über die Website verwaltet (Discord-UI ist read-only).
  supportWindows: {
    type: [SupportTimeWindowSchema],
    default: () => ([
      { dayOfWeek: 1, startMinute: 600, endMinute: 1320 }, // Montag 10:00–22:00
      { dayOfWeek: 2, startMinute: 600, endMinute: 1320 }, // Dienstag
      { dayOfWeek: 3, startMinute: 600, endMinute: 1320 }, // Mittwoch
      { dayOfWeek: 4, startMinute: 600, endMinute: 1320 }, // Donnerstag
      { dayOfWeek: 5, startMinute: 600, endMinute: 1320 }, // Freitag
      { dayOfWeek: 6, startMinute: 600, endMinute: 1320 }, // Samstag
    ]),
  },

  // ── Sounds ───────────────────────────────────────────────────────────────
  // Wird gesprochen/gespielt, wenn jemand WÄHREND der Supportzeit joint (Intro + Outro der Sequenz)
  soundFileInsideWindow: { type: String, default: 'assets/sounds/support_welcome_active.mp3' },

  // Wird gespielt, wenn jemand AUSSERHALB der Supportzeit joint
  soundFileOutsideWindow: { type: String, default: 'assets/sounds/support_welcome_outside_hours.mp3' },

  // Hintergrundmusik-Loop, der zwischen Intro und Outro 3x abgespielt wird
  soundFileLoopMusic: { type: String, default: 'assets/sounds/support_waiting_loop.mp3' },

  // Text, der angezeigt/gesprochen wird, wenn jemand außerhalb der Zeiten joint
  outsideWindowMessage: {
    type: String,
    default: 'Du bist außerhalb der Supportzeiten. Bitte versuche es während unserer regulären Zeiten erneut.',
  },

  setupDone: { type: Boolean, default: false },
}, { timestamps: true });

const VoiceConfig =
  models.VoiceConfig || model('VoiceConfig', VoiceConfigSchema, 'voiceConfig');

module.exports = VoiceConfig;