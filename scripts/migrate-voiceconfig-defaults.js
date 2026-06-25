'use strict';

/**
 * Einmaliges Migrationsskript:
 * Setzt bei bestehenden VoiceConfig-Dokumenten die neuen Sound-Pfade und
 * Standard-Supportzeiten, falls noch alte Platzhalter-Werte oder leere
 * Arrays vorhanden sind.
 *
 * Ausführen mit: node scripts/migrate-voiceconfig-defaults.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const VoiceConfig = require('../models/VoiceConfig');

const DEFAULT_SUPPORT_WINDOWS = [
  { dayOfWeek: 1, startMinute: 600, endMinute: 1200 },
  { dayOfWeek: 2, startMinute: 600, endMinute: 1200 },
  { dayOfWeek: 3, startMinute: 600, endMinute: 1200 },
  { dayOfWeek: 4, startMinute: 600, endMinute: 1200 },
  { dayOfWeek: 5, startMinute: 600, endMinute: 1200 },
  { dayOfWeek: 6, startMinute: 600, endMinute: 1200 },
];

const NEW_SOUND_INSIDE = 'assets/sounds/support_welcome_active.mp3';
const NEW_SOUND_OUTSIDE = 'assets/sounds/support_welcome_outside_hours.mp3';

async function migrate() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ MongoDB verbunden');

  const configs = await VoiceConfig.find({});
  console.log(`Gefunden: ${configs.length} VoiceConfig-Dokument(e)`);

  let updated = 0;

  for (const config of configs) {
    let changed = false;

    if (!config.supportWindows || config.supportWindows.length === 0) {
      config.supportWindows = DEFAULT_SUPPORT_WINDOWS;
      changed = true;
    }

    if (!config.soundFileInsideWindow || config.soundFileInsideWindow.includes('PLACEHOLDER')) {
      config.soundFileInsideWindow = NEW_SOUND_INSIDE;
      changed = true;
    }

    if (!config.soundFileOutsideWindow || config.soundFileOutsideWindow.includes('PLACEHOLDER')) {
      config.soundFileOutsideWindow = NEW_SOUND_OUTSIDE;
      changed = true;
    }

    if (changed) {
      await config.save();
      updated++;
      console.log(`✅ Guild ${config.guildId} aktualisiert`);
    }
  }

  console.log(`Fertig. ${updated} von ${configs.length} Dokument(en) aktualisiert.`);
  await mongoose.disconnect();
}

migrate().catch(err => {
  console.error('❌ Migration fehlgeschlagen:', err);
  process.exit(1);
});