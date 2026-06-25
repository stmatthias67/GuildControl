'use strict';

/**
 * VoiceConfig.js
 * Konfiguration für das Voice-/Support-Warteraum-System.
 * Heute: nur Konfigurationsdaten. Audio-Playback folgt in einem späteren Schritt.
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

  // Warteraum-Channel, dessen Beitritt den Bot triggert
  waitingRoomChannelId: { type: String, default: null },

  // Rollen-Keys aus GuildConfig.roles, die bei Beitritt innerhalb der Supportzeit benachrichtigt werden
  notifyRoleKeys: { type: [String], default: [] },

  // Text-Channel, in dem die Benachrichtigung an Support-Rollen gepostet wird
  notifyChannelId: { type: String, default: null },

  // Wöchentlich wiederkehrende Supportzeiten
supportWindows: {
  type: [SupportTimeWindowSchema],
  default: () => ([
    { dayOfWeek: 1, startMinute: 600, endMinute: 1200 }, // Montag 10:00–20:00
    { dayOfWeek: 2, startMinute: 600, endMinute: 1200 }, // Dienstag
    { dayOfWeek: 3, startMinute: 600, endMinute: 1200 }, // Mittwoch
    { dayOfWeek: 4, startMinute: 600, endMinute: 1200 }, // Donnerstag
    { dayOfWeek: 5, startMinute: 600, endMinute: 1200 }, // Freitag
    { dayOfWeek: 6, startMinute: 600, endMinute: 1200 }, // Samstag
  ]),
},
  // Platzhalter-Sound-Dateien (werden später durch echte Dateien ersetzt)
  // soundFileInsideWindow: gespielt, wenn jemand WÄHREND der Supportzeit joint
  // soundFileOutsideWindow: gespielt, wenn jemand AUSSERHALB der Supportzeit joint
  soundFileInsideWindow:  { type: String, default: 'assets/sounds/support_welcome_active.mp3' },
  soundFileOutsideWindow: { type: String, default: 'assets/sounds/support_welcome_outside_hours.mp3' },

  // Text, der gesprochen/angezeigt wird, wenn jemand außerhalb der Zeiten joint
  outsideWindowMessage: {
    type: String,
    default: 'Du bist außerhalb der Supportzeiten. Bitte versuche es während unserer regulären Zeiten erneut.',
  },

  setupDone: { type: Boolean, default: false },
}, { timestamps: true });

const VoiceConfig =
  models.VoiceConfig || model('VoiceConfig', VoiceConfigSchema, 'voiceConfig');

module.exports = VoiceConfig;