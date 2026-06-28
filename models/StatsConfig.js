'use strict';

const { Schema, model, models } = require('mongoose');

const StatChannelSchema = new Schema({
  type: {
    type: String,
    enum: ['members', 'bots', 'boosts', 'online', 'channels', 'roles'],
    required: true,
  },
  channelId: { type: String, required: true },
  // Anzeige-Vorlage, {count} wird durch den aktuellen Wert ersetzt
  template: { type: String, required: true }, // z.B. "👥 Mitglieder: {count}"
}, { _id: false });

const StatsConfigSchema = new Schema({
  guildId: { type: String, required: true, unique: true },

  // Kategorie, in der alle Statistik-Channels gebündelt liegen (optional)
  categoryId: { type: String, default: null },

  channels: { type: [StatChannelSchema], default: [] },

  setupDone: { type: Boolean, default: false },
}, { timestamps: true });

const StatsConfig =
  models.StatsConfig || model('StatsConfig', StatsConfigSchema, 'statsConfig');

module.exports = StatsConfig;