const mongoose = require("mongoose");

// Unveränderliches Protokoll aller Moderationsaktionen. Schema identisch in WEB lib/models/ModerationEvent.ts.
const moderationEventSchema = new mongoose.Schema({
  guildId:  { type: String, required: true },
  type:     { type: String, required: true, enum: ["warn", "pardon", "ban", "unban", "kick", "mute", "unmute", "clear"] },
  actorId:  { type: String, required: true },
  targetId: { type: String, default: null },
  reason:   { type: String, default: "" },
  source:   { type: String, enum: ["bot", "dashboard", "auto"], default: "bot" },
  meta:     { type: Object, default: {} }
}, { timestamps: { createdAt: true, updatedAt: false } });

moderationEventSchema.index({ guildId: 1, createdAt: -1 });
moderationEventSchema.index({ guildId: 1, targetId: 1, createdAt: -1 });

module.exports = mongoose.model("ModerationEvent", moderationEventSchema, "moderationevents");
