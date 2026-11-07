const mongoose = require("mongoose");

// Bot-intern (kein Gegenstück im WEB). Stimmen als ID-Listen, damit jeder nur einmal abstimmt.
const suggestionSchema = new mongoose.Schema({
  guildId:    { type: String, required: true },
  channelId:  { type: String, required: true },
  messageId:  { type: String, default: null },
  authorId:   { type: String, required: true },
  content:    { type: String, required: true },
  status:     { type: String, enum: ["offen", "angenommen", "abgelehnt"], default: "offen" },
  upvoters:   { type: [String], default: [] },
  downvoters: { type: [String], default: [] },
  decidedBy:  { type: String, default: null }
}, { timestamps: { createdAt: true, updatedAt: false } });

suggestionSchema.index({ guildId: 1, createdAt: -1 });

module.exports = mongoose.model("Suggestion", suggestionSchema, "suggestions");
