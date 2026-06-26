'use strict';

const { Schema, model, models } = require('mongoose');

const SupportCaseSchema = new Schema({
  guildId:   { type: String, required: true },
  userId:    { type: String, required: true }, // Hilfesuchender
  caseId:    { type: String, required: true, unique: true },

  status: {
    type: String,
    enum: ['open', 'claimed', 'closed', 'cancelled'],
    default: 'open',
  },

  notifyMessageId:   { type: String, default: null }, // die Nachricht im Notify-Channel (wird editiert statt neu gepostet)
  notifyChannelId:   { type: String, default: null },

  claimedBy:    { type: String, default: null }, // userId des Supporters, der übernommen hat
  voiceChannelId: { type: String, default: null }, // erstellter Support-Voice-Channel
  panelMessageId: { type: String, default: null }, // Admin-Panel-Nachricht im Voice-Channel

  closeReason:    { type: String, default: null },
  cancelReason:   { type: String, default: null },

  escalatedToRoleKey: { type: String, default: null }, // zuletzt gerufene Rolle (für Anzeige im Panel)

  createdAt: { type: Date, default: Date.now },
  claimedAt: { type: Date, default: null },
  closedAt:  { type: Date, default: null },
});

const SupportCase =
  models.SupportCase || model('SupportCase', SupportCaseSchema, 'supportCase');

module.exports = SupportCase;