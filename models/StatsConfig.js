'use strict';

const { Schema, model, models } = require('mongoose');

const StatChannelSchema = new Schema({
  type: {
    type: String,
    enum: ['members', 'bots', 'boosts', 'online', 'channels', 'roles'],
    required: true,
  },
  // Wird vom Bot gesetzt, sobald der Kanal erstellt wurde. Vorher null.
  channelId: { type: String, default: null },
  enabled: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
  // Nur der Textteil vor "{count}" — {count} wird bot-seitig automatisch angehängt
  namePrefix: { type: String, required: true },
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