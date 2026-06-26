'use strict';

let voiceLib = null;
try {
  voiceLib = require('@discordjs/voice');
} catch (err) {
  console.warn('[voicePlayback] @discordjs/voice ist nicht installiert. Audio-Wiedergabe ist deaktiviert.');
}

const fs = require('fs');
const path = require('path');

function resolvePath(soundFilePath) {
  return path.isAbsolute(soundFilePath) ? soundFilePath : path.join(process.cwd(), soundFilePath);
}

// Spielt eine einzelne Datei ab und wartet (per Promise), bis sie fertig ist.
function playOnce(player, soundFilePath) {
  return new Promise((resolve, reject) => {
    const absolutePath = resolvePath(soundFilePath);

    if (!fs.existsSync(absolutePath)) {
      console.warn(`[voicePlayback] Sound-Datei nicht gefunden: ${absolutePath}`);
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
  return playSequenceInChannel(channel, { intro: soundFilePath, loopFile: null, loopCount: 0, outro: null });
}

module.exports = {
  playSoundInChannel,
  playSequenceInChannel,
  isVoiceLibAvailable: () => !!voiceLib,
};