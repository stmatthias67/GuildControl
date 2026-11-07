'use strict';

let voiceLib = null;
try {
  voiceLib = require('@discordjs/voice');
} catch (err) {
  console.warn('[voicePlayback] @discordjs/voice ist nicht installiert. Audio-Wiedergabe ist deaktiviert.');
}

const fs = require('fs');
const path = require('path');
const { logCriticalError } = require('./errorLogger');

// Sicherheit: Der Sound-Pfad kommt aus der DB (vom Web gesetzt) und geht an ffmpeg.
// Erlaubt sind nur "<name>" oder "assets/sounds/<name>" mit festem Muster, keine URLs/Pfade.
const SOUNDS_DIR = path.resolve(__dirname, '..', 'assets', 'sounds');
const SOUND_NAME_RE = /^[A-Za-z0-9_-]{1,64}\.(mp3|ogg|wav|opus)$/;
const DEFAULT_SOUNDS = {
  inside:  'support_welcome_active.mp3',
  outside: 'support_welcome_outside_hours.mp3',
  loop:    'support_waiting_loop.mp3',
};

function toSafePath(value) {
  if (typeof value !== 'string') return null;
  const name = path.basename(value);
  if (value !== name && value !== `assets/sounds/${name}`) return null;
  if (!SOUND_NAME_RE.test(name)) return null;
  const full = path.resolve(SOUNDS_DIR, name);
  if (path.dirname(full) !== SOUNDS_DIR || !fs.existsSync(full)) return null;
  return full;
}

/**
 * Liefert den absoluten Pfad eines erlaubten Sounds in assets/sounds,
 * sonst (geloggt) den Standard-Sound des Slots, sonst null (Sound wird übersprungen).
 */
function safeSoundPath(value, slot) {
  if (!value) return null;
  const ok = toSafePath(value);
  if (ok) return ok;
  console.warn(`[voicePlayback] Ungültiger Sound-Pfad (${slot}) abgelehnt, nutze Standard: ${String(value).slice(0, 200)}`);
  logCriticalError('voicePlayback.invalidSound', new Error('Ungültiger Sound-Pfad abgelehnt'), { slot, value: String(value).slice(0, 200) });
  return toSafePath(DEFAULT_SOUNDS[slot]);
}

// Spielt eine einzelne Datei ab und wartet (per Promise), bis sie fertig ist.
// absolutePath ist bereits über safeSoundPath geprüft.
function playOnce(player, absolutePath) {
  return new Promise((resolve) => {
    if (!absolutePath) {
      console.warn('[voicePlayback] Kein gültiger Sound vorhanden, übersprungen.');
      return resolve(); // überspringen statt die ganze Sequenz abzubrechen
    }

    const { createAudioResource } = voiceLib;
    const resource = createAudioResource(absolutePath);

    const onIdle = () => {
      player.off('error', onError);
      resolve();
    };
    const onError = (err) => {
      player.off('idle', onIdle);
      console.error('[voicePlayback] Player-Fehler:', err);
      resolve(); // Sequenz trotzdem fortsetzen
    };

    player.once('idle', onIdle);
    player.once('error', onError);
    player.play(resource);
  });
}

// Verbindet sich einmalig und spielt: intro -> loopFile x loopCount -> outro, dann trennt die Verbindung.
async function playSequenceInChannel(channel, { intro, loopFile, loopCount = 1, outro }) {
  return playResolved(channel, {
    intro: safeSoundPath(intro, 'inside'),
    loopFile: safeSoundPath(loopFile, 'loop'),
    loopCount,
    outro: safeSoundPath(outro, 'inside'),
  });
}

// Erwartet bereits über safeSoundPath geprüfte absolute Pfade (oder null).
async function playResolved(channel, { intro, loopFile, loopCount, outro }) {
  if (!voiceLib) {
    console.warn('[voicePlayback] Wiedergabe übersprungen – @discordjs/voice fehlt.');
    return;
  }

  const { joinVoiceChannel, createAudioPlayer, VoiceConnectionStatus, entersState } = voiceLib;

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 10_000);

    const player = createAudioPlayer();
    connection.subscribe(player);

    if (intro) await playOnce(player, intro);

    for (let i = 0; i < loopCount; i++) {
      if (loopFile) await playOnce(player, loopFile);
    }

    if (outro) await playOnce(player, outro);
  } catch (err) {
    console.error('[voicePlayback] Verbindung fehlgeschlagen:', err);
  } finally {
    connection.destroy();
  }
}

// Beibehalten für Fälle, in denen nur EIN Sound gebraucht wird (z.B. außerhalb der Zeiten)
async function playSoundInChannel(channel, soundFilePath) {
  return playResolved(channel, { intro: safeSoundPath(soundFilePath, 'outside'), loopFile: null, loopCount: 0, outro: null });
}

module.exports = {
  playSoundInChannel,
  playSequenceInChannel,
  safeSoundPath,
  isVoiceLibAvailable: () => !!voiceLib,
};