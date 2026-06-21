const { Schema, model } = require('mongoose');

const roleLinkSchema = new Schema({
  guildId:     { type: String, required: true },
  discordRoleId: { type: String, required: true },
  websiteRole: { type: String, required: true },
  createdBy:   { type: String, required: true },
}, { timestamps: true });

roleLinkSchema.index({ guildId: 1, discordRoleId: 1 }, { unique: true });
roleLinkSchema.index({ guildId: 1, websiteRole: 1 });

module.exports = model('RoleLink', roleLinkSchema);
