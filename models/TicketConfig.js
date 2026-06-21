const mongoose = require("mongoose");

const ticketConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },

  // Kanäle
  createChannelId: { type: String, default: null },
  logChannelId:    { type: String, default: null },
  claimChannelId:  { type: String, default: null },

  // Wie viele offene Tickets ein User gleichzeitig haben darf (Standard: 1)
  maxTicketsPerUser: { type: Number, default: 1, min: 1, max: 10 },

  // Rollen werden NICHT mehr hier gespeichert — kommen aus GuildConfig (Role Setup)

  // Aktivierte Kategorien
  categories: {
    type: [
      {
        id:            String,
        label:         String,
        description:   String,
        emoji:         String,
        custom:        { type: Boolean, default: false },
        // Rollen (aus Role Setup) die bei neuen Tickets in dieser Kategorie gepingt werden
        notifyRoleIds: { type: [String], default: [] }
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

ticketConfigSchema.pre("save", function() {
  this.updatedAt = new Date();
});

module.exports = mongoose.model("TicketConfig", ticketConfigSchema);