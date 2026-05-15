const mongoose = require("mongoose");

const ticketConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },

  // Kanäle
  createChannelId: { type: String, default: null },   // Wo User Tickets erstellen
  logChannelId:    { type: String, default: null },   // Ticket Logs
  claimChannelId:  { type: String, default: null },   // Team Übersicht (optional)

  // Rollen
  supportRoleIds: { type: [String], default: [] },
  adminRoleIds:   { type: [String], default: [] },

  // Aktivierte Kategorien
  categories: {
    type: [
      {
        id:          String,   // z.B. "support", "report", oder custom UUID
        label:       String,
        description: String,
        emoji:       String,
        custom:      { type: Boolean, default: false }
      }
    ],
    default: []
  },

  // Ticket Zähler
  ticketCounter: { type: Number, default: 0 },

  // Setup abgeschlossen?
  setupDone: { type: Boolean, default: false },

  updatedAt: { type: Date, default: Date.now }
});

ticketConfigSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model("TicketConfig", ticketConfigSchema);
