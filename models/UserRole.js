const { Schema, model } = require('mongoose');

/**
 * Speichert die Website-Rollen pro Discord-User.
 * Wird beim Sync abgeglichen und Rollen werden vergeben/entzogen.
 */
const userRoleSchema = new Schema({
  userId:       { type: String, required: true },
  guildId:      { type: String, required: true },
  websiteRoles: { type: [String], default: [] },
  lastSync:     { type: Date, default: null },
}, { timestamps: true });

userRoleSchema.index({ userId: 1, guildId: 1 }, { unique: true });

module.exports = model('UserRole', userRoleSchema);
