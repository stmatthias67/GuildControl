'use strict';

const mongoose = require('mongoose');

const guildConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  roles: {
    admin:     { type: String, default: null },
    moderator: { type: String, default: null },
    support:   { type: String, default: null },
    member:    { type: String, default: null },
  },
  channels: {
    logs:    { type: String, default: null },
    tickets: { type: String, default: null },
  },
  systems: {
    moderation: { type: Boolean, default: false },
    tickets:    { type: Boolean, default: false },
    logs:       { type: Boolean, default: false },
  },
}, { timestamps: true });

module.exports = mongoose.model('GuildConfig', guildConfigSchema, 'guildConfig');
