const Warn = require("../models/Warn");
const mongoose = require("mongoose");

const warnSchema = new mongoose.Schema({
  guildId: String,
  userId: String,
  moderatorId: String,
  reason: String,
  date: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Warn", warnSchema);