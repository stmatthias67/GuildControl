'use strict';

/**
 * ApplicationConfig.js
 * Guild-weite Konfiguration für das Bewerbungs-/Interview-System.
 * Analog zu RankConfig.js / TicketConfig.js.
 */

const { Schema, model, models } = require('mongoose');

// Neu: Schema für anpassbare Nachrichtenvorlagen
const MessageTemplateSchema = new Schema({
  text:     { type: String, default: null },
  imageUrl: { type: String, default: null },
}, { _id: false });

const QuestionSchema = new Schema({
  id:        { type: String, required: true },   // z.B. "q1", "q2" – stabil, wird in Modal-CustomId genutzt
  label:     { type: String, required: true },    // Frage-Text (Modal-Feldlabel)
  style:     { type: String, enum: ['short', 'paragraph'], default: 'short' },
  required:  { type: Boolean, default: true },
  maxLength: { type: Number, default: 200, min: 1, max: 4000 },
  page:      { type: Number, required: true },     // welches Modal (1, 2, 3, ...) – max 5 Fragen pro Seite
}, { _id: false });

const FormSchema = new Schema({
  formId:      { type: String, required: true },  // z.B. "supporter-bewerbung"
  label:       { type: String, required: true },  // Anzeigename
  description: { type: String, default: '' },
  emoji:       { type: String, default: '📋' },

  // Wo der "Bewerben"-Button gepostet wird
  buttonChannelId: { type: String, default: null },
  buttonMessageId: { type: String, default: null }, // damit der Button bei Änderungen aktualisiert werden kann

  // Rollen-Key aus GuildConfig.roles – wird NACH erfolgreichem Gespräch + Admin-Bestätigung vergeben
  targetTestRoleKey: { type: String, default: null },

  questions: { type: [QuestionSchema], default: [] },

  // Neu: Anpassbare Benachrichtigungstexte für die verschiedenen Phasen
  messages: {
    accepted:        { type: MessageTemplateSchema, default: () => ({}) }, // DM an Bewerber bei Annahme (vor Terminwahl)
    denied:          { type: MessageTemplateSchema, default: () => ({}) }, // DM an Bewerber bei direkter Ablehnung
    hired:           { type: MessageTemplateSchema, default: () => ({}) }, // DM an Bewerber bei finaler Einstellung
    rejectedAfter:   { type: MessageTemplateSchema, default: () => ({}) }, // DM an Bewerber bei finaler Ablehnung nach Gespräch
    reviewChannel:   { type: MessageTemplateSchema, default: () => ({}) }, // Zusatztext über dem Review-Embed im Review-Channel
  },

  active: { type: Boolean, default: false },

  //close-Reason
  closed: { type: Boolean, default: false },
  closedReason: { type: String, default: null },

}, { _id: false });

const ApplicationConfigSchema = new Schema({
  guildId: { type: String, required: true, unique: true },

  // Channel, in dem neue Bewerbungen zur Prüfung erscheinen
  reviewChannelId: { type: String, default: null },

  // Rollen-Keys aus GuildConfig.roles (NICHT native Discord-Rollen!) – dürfen Accept/Deny
  reviewerRoleKeys: { type: [String], default: [] },

  // Sperrfenster vor Termin-Start, in dem nicht mehr abgesagt werden kann (Minuten)
  cancelLockMinutes: { type: Number, default: 25, min: 0 },

  forms: { type: [FormSchema], default: [] },

  setupDone: { type: Boolean, default: false },
}, { timestamps: true });

const ApplicationConfig =
  models.ApplicationConfig || model('ApplicationConfig', ApplicationConfigSchema, 'applicationConfig');

module.exports = ApplicationConfig;
