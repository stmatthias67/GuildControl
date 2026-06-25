'use strict';

/**
 * Einmaliges Reset-Skript:
 * Überschreibt ZWANGSWEISE die supportWindows aller VoiceConfig-Dokumente
 * mit den neuen Standardzeiten Mo-Sa 10:00-22:00, unabhängig vom aktuellen Inhalt.
 *
 * Ausführen mit: node scripts/reset-voiceconfig-supporttimes.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const VoiceConfig = require('../models/VoiceConfig');

const NEW_SUPPORT_WINDOWS = [
  { dayOfWeek: 1, startMinute: 600, endMinute: 1320 }, // Montag 10:00–22:00
  { dayOfWeek: 2, startMinute: 600, endMinute: 1320 },
  { dayOfWeek: 3, startMinute: 600, endMinute: 1320 },
  { dayOfWeek: 4, startMinute: 600, endMinute: 1320 },
  { dayOfWeek: 5, startMinute: 600, endMinute: 1320 },
  { dayOfWeek: 6, startMinute: 600, endMinute: 1320 }, // Samstag
];

async function reset() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ MongoDB verbunden');

  const configs = await VoiceConfig.find({});
  console.log(`Gefunden: ${configs.length} VoiceConfig-Dokument(e)`);

  for (const config of configs) {
    config.supportWindows = NEW_SUPPORT_WINDOWS;
    await config.save();
    console.log(`✅ Guild ${config.guildId}: Supportzeiten auf Mo-Sa 10:00-22:00 zurückgesetzt`);
  }

  console.log('Fertig.');
  await mongoose.disconnect();
}

reset().catch(err => {
  console.error('❌ Reset fehlgeschlagen:', err);
  process.exit(1);
});