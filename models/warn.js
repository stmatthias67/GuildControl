const mongoose = require("mongoose");

// Aktueller Warn-Zustand (aktiv/verziehen). Schema identisch in WEB lib/models/Warn.ts.
const warnSchema = new mongoose.Schema({
  guildId:      { type: String, required: true },
  userId:       { type: String, required: true },
  moderatorId:  { type: String, required: true },
  reason:       { type: String, default: "" },
  date:         { type: Date, default: Date.now },
  source:       { type: String, enum: ["bot", "dashboard", "auto"], default: "bot" },
  active:       { type: Boolean, default: true },
  pardonedBy:   { type: String, default: null },
  pardonedAt:   { type: Date, default: null },
  pardonReason: { type: String, default: "" }
});

warnSchema.index({ guildId: 1, userId: 1, date: -1 });

module.exports = mongoose.model("Warn", warnSchema, "warns");
