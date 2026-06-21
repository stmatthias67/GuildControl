'use strict';

/**
 * Application.js
 * Eine einzelne eingereichte Bewerbung samt Interview-Terminverwaltung.
 */

const { Schema, model, models } = require('mongoose');

const AnswerSchema = new Schema({
  questionId: { type: String, required: true },
  label:      { type: String, required: true },
  value:      { type: String, required: true },
}, { _id: false });

const SlotSchema = new Schema({
  id:       { type: String, required: true },  // z.B. "slot1", "slot2"
  datetime: { type: Date, required: true },
}, { _id: false });

const ApplicationSchema = new Schema({
  guildId:   { type: String, required: true },
  userId:    { type: String, required: true },
  formId:    { type: String, required: true },
  formLabel: { type: String, required: true },

  answers: { type: [AnswerSchema], default: [] },

  status: {
    type: String,
    enum: [
      'pending',         // eingereicht, wartet auf Review
      'denied',          // Bewerbung abgelehnt (vor Gespräch)
      'scheduling',      // angenommen, Reviewer hat Slots vorgeschlagen, wartet auf Wahl
      'scheduled',       // Bewerber hat Slot gewählt, Termin steht
      'cancelled',       // Termin wurde abgesagt (außerhalb Sperrfenster) – neuer Termin nötig
      'interview_done',  // Gespräch fand statt, Bewerber war da – wartet auf Admin-Entscheidung
      'hired',           // Admin hat nach Gespräch final angenommen → Test-Rolle vergeben
      'rejected',        // Admin hat nach Gespräch final abgelehnt
      'no_show',         // Bewerber ist nicht erschienen → wird geblockt
    ],
    default: 'pending',
  },

  reviewerId:      { type: String, default: null },  // wer Accept/Deny geklickt hat
  reviewMessageId: { type: String, default: null },  // Embed im Review-Channel (zum Updaten)

  proposedSlots: { type: [SlotSchema], default: [] },
  chosenSlot:    { type: SlotSchema, default: null },

  interviewChannelId: { type: String, default: null },

  decidedAt:   { type: Date, default: null },  // Accept/Deny Zeitpunkt
  interviewAt: { type: Date, default: null },  // = chosenSlot.datetime, redundant für schnelle Scheduler-Queries

}, { timestamps: true });

// Häufige Scheduler-Query: alle "scheduled" Termine, die bald starten
ApplicationSchema.index({ status: 1, interviewAt: 1 });

const Application =
  models.Application || model('Application', ApplicationSchema, 'application');

module.exports = Application;