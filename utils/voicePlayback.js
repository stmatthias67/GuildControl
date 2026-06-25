'use strict';

/**
 * voicePlayback.js
 * Verbindet den Bot mit einem Voice-Channel und spielt eine Sound-Datei ab.
 * Benötigt @discordjs/voice, @discordjs/opus, ffmpeg-static (npm install).
 */

let voiceLib = null;
try {
  voiceLib = require('@discordjs/voice');
} catch (err) {
  console.warn('[voicePlayback] @discordjs/voice ist nicht installiert. Audio-Wiedergabe ist deaktiviert. Führe "npm install @discordjs/voice @discordjs/opus ffmpeg-static" aus, um dieses Feature zu aktivieren.');
}

const fs = require('fs');
const path = require('path');

async function playSoundInChannel(channel, soundFilePath) {
  if (!voiceLib) {
    console.warn('[voicePlayback] Wiedergabe übersprungen – @discordjs/voice fehlt.');
    return;
  }

  const absolutePath = path.isAbsolute(soundFilePath)
    ? soundFilePath
    : path.join(process.cwd(), soundFilePath);

  if (!fs.existsSync(absolutePath)) {
    console.warn(`[voicePlayback] Sound-Datei nicht gefunden: ${absolutePath}`);
    return;
  }

  const { joinVoiceChannel, createAudioPlayer, createAudioResource, VoiceConnectionStatus, entersState } = voiceLib;

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 10_000);

    const player = createAudioPlayer();
    const resource = createAudioResource(absolutePath);

    player.play(resource);
    connection.subscribe(player);

    player.on('idle', () => connection.destroy());
    player.on('error', (err) => {
      console.error('[voicePlayback] Player-Fehler:', err);
      connection.destroy();
    });
  } catch (err) {
    console.error('[voicePlayback] Verbindung fehlgeschlagen:', err);
    connection.destroy();
  }
}

module.exports = { playSoundInChannel, isVoiceLibAvailable: () => !!voiceLib };