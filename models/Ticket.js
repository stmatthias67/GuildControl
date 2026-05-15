const mongoose = require("mongoose");

const ticketSchema = new mongoose.Schema({
  guildId:      { type: String, required: true },
  channelId:    { type: String, required: true, unique: true },
  userId:       { type: String, required: true },   // Ersteller
  ticketNumber: { type: Number, required: true },
  category:     { type: String, required: true },   // category id
  categoryLabel:{ type: String, required: true },

  // Claim
  claimedBy:    { type: String, default: null },

  // Zusätzliche User
  addedUsers:   { type: [String], default: [] },

  status: {
    type: String,
    enum: ["open", "closing", "closed"],
    default: "open"
  },

  // Transcript (HTML-String oder Plain-Text)
  transcript: { type: String, default: null },

  createdAt: { type: Date, default: Date.now },
  closedAt:  { type: Date, default: null }
});

module.exports = mongoose.model("Ticket", ticketSchema);
