'use strict';

/**
 * uiTheme.js
 * Zentrales, einheitliches Design-Schema für alle Setup-Systeme.
 *
 * Farb-Konvention (laut Matthias' Vorgabe):
 *   GRÜN  = abschließen / aktivieren / bestätigen
 *   ROT   = abbrechen / zurücksetzen / deaktivieren / löschen
 *   BLAU  = allgemeine Einstellungen / neutrale Aktionen
 *   GRAU  = Navigation (Zurück, Übersicht)
 *   GELB  = Warnung / Platzhalter / noch nicht verfügbar
 *
 * Neue Setup-Dateien IMMER aus dieser Datei importieren, nie eigene
 * Hex-Codes oder Emojis hart codieren.
 */

const { ButtonStyle } = require('discord.js');

// ── Farben (Discord-Brand-Palette als gemeinsame Basis) ──────────────────────
const COLORS = {
  primary: 0x5865f2,  // Blau – Einstellungen / Übersicht / neutral
  success: 0x57f287,  // Grün – abschließen / aktivieren / bestätigen
  danger: 0xed4245,   // Rot – abbrechen / zurücksetzen / löschen / deaktivieren
  warning: 0xfee75c,  // Gelb – Warnung / Platzhalter
  neutral: 0x4a4a4a,  // Grau – informativ, neutral
};

// ── Button-Styles, passend zur Farb-Konvention ────────────────────────────────
const BUTTON_STYLE = {
  confirm: ButtonStyle.Success,   // Grün
  cancel: ButtonStyle.Danger,     // Rot
  primary: ButtonStyle.Primary,   // Blau
  navigation: ButtonStyle.Secondary, // Grau
};

// ── Einheitliche Emoji-Bedeutungen ───────────────────────────────────────────
// Eine Bedeutung -> immer dasselbe Symbol, projektweit.
const ICONS = {
  // Status / Ergebnis
  success: '✅',
  error: '❌',
  warning: '⚠️',
  active: '🟢',
  inactive: '⚪',
  locked: '🔒',
  unlocked: '🔓',

  // Aktionen
  add: '➕',
  remove: '➖',
  edit: '✏️',
  delete: '🗑️',
  reset: '🔄',
  save: '💾',
  back: '↩️',
  forward: '➡️',

  // Navigation / Struktur
  settings: '⚙️',
  overview: '🗂️',
  channel: '📨',
  category: '🎟️',
  role: '🛂',
  notification: '📣',
  time: '🕒',

  // System-spezifische Icons (eine Quelle der Wahrheit, statt Streuung)
  ticket: '🎫',
  security: '🛡️',
  voice: '🔊',
  rank: '📈',
  application: '📋',
  stats: '📊',
  roles: '👑',
};

module.exports = { COLORS, BUTTON_STYLE, ICONS };