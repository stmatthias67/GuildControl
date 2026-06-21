'use strict';

/**
 * BlockedApplicant.js
 * User, die wegen No-Show beim Interview gesperrt sind und sich
 * nicht erneut bewerben dürfen.
 */

const { Schema, model, models } = require('mongoose');

const BlockedApplicantSchema = new Schema({
  guildId:   { type: String, required: true },
  userId:    { type: String, required: true },
  reason:    { type: String, enum: ['no_show'], default: 'no_show' },
  blockedAt: { type: Date, default: Date.now },
});

// Ein User kann pro Guild nur einmal geblockt sein
BlockedApplicantSchema.index({ guildId: 1, userId: 1 }, { unique: true });

const BlockedApplicant =
  models.BlockedApplicant || model('BlockedApplicant', BlockedApplicantSchema, 'blockedApplicant');

module.exports = BlockedApplicant;