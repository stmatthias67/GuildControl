'use strict';

/**
 * voiceStateUpdate.js
 * 1) Erkennt Beitritt zum Interview-Voice-Channel (Bewerbungssystem)
 * 2) Erkennt Beitritt zum Support-Warteraum (Voice-Setup-System) -> Sound-Sequenz + Support-Fall erstellen
 * 3) Erkennt Verlassen des Warteraums -> offenen Support-Fall automatisch abbrechen
 */

const Application = require('../models/Application');
const { handleApplicantJoinedInterview } = require('../interactions/applicationHandler');

const VoiceConfig = require('../models/VoiceConfig');
const GuildConfig = require('../models/GuildConfig');
const SupportCase = require('../models/SupportCase');

const { playSoundInChannel, playSequenceInChannel } = require('../utils/voicePlayback');
const { generateCaseId, buildSupportCaseText, buildSupportCaseComponents } = require('../utils/voiceBuilder');
const { handleUserLeftWaitingRoom } = require('../interactions/supportCaseHandler');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isWithinSupportWindow(config, now = new Date()) {
  const dayOfWeek = now.getDay();
  const minuteOfDay = now.getHours() * 60 + now.getMinutes();

  return config.supportWindows.some(w =>
    w.dayOfWeek === dayOfWeek && minuteOfDay >= w.startMinute && minuteOfDay < w.endMinute
  );
}

// ---------------------------------------------------------------------------
// Beitritt zum Warteraum
// ---------------------------------------------------------------------------

async function handleWaitingRoomJoin(newState) {
  const voiceConfig = await VoiceConfig.findOne({ guildId: newState.guild.id });
  if (!voiceConfig || !voiceConfig.waitingRoomChannelId || voiceConfig.waitingRoomChannelId !== newState.channelId) {
    return;
  }

  console.log(`[Voice] ${newState.member.user.tag} ist dem Warteraum beigetreten.`);
  console.log(`[Voice] isVoiceLibAvailable: ${require('../utils/voicePlayback').isVoiceLibAvailable()}`);
  console.log(`[Voice] withinWindow: ${withinWindow}`);
  console.log(`[Voice] notifyChannelId: ${voiceConfig.notifyChannelId}`);
  console.log(`[Voice] notifyRoleKeys: ${JSON.stringify(voiceConfig.notifyRoleKeys)}`);

  const channel = newState.channel;
  const withinWindow = isWithinSupportWindow(voiceConfig);

  if (withinWindow) {
    // Sound-Sequenz: Sprache -> 3x Loop-Musik -> Sprache erneut
    await playSequenceInChannel(channel, {
      intro: voiceConfig.soundFileInsideWindow,
      loopFile: voiceConfig.soundFileLoopMusic,
      loopCount: 3,
      outro: voiceConfig.soundFileInsideWindow,
    });

    if (voiceConfig.notifyChannelId && voiceConfig.notifyRoleKeys?.length) {
      try {
        const guildConfig = await GuildConfig.findOne({ guildId: newState.guild.id });
        const roleIds = voiceConfig.notifyRoleKeys
          .map(key => guildConfig?.roles?.[key])
          .filter(Boolean);

        if (roleIds.length) {
          const notifyChannel = await newState.client.channels.fetch(voiceConfig.notifyChannelId);
          const caseId = generateCaseId();
          const createdAtUnix = Math.floor(Date.now() / 1000);

          const text = buildSupportCaseText({
            roleIds,
            userId: newState.member.id,
            caseId,
            createdAtUnix,
          });
          const components = buildSupportCaseComponents(caseId, false);

          const sent = await notifyChannel.send({ content: text, components });

          await SupportCase.create({
            guildId: newState.guild.id,
            userId: newState.member.id,
            caseId,
            notifyMessageId: sent.id,
            notifyChannelId: notifyChannel.id,
          });
        } else {
          console.warn('[Voice] Keine gültigen Rollen-IDs für notifyRoleKeys gefunden – Benachrichtigung übersprungen.');
        }
      } catch (err) {
        console.error('[voiceStateUpdate] Fehler bei Support-Benachrichtigung:', err);
      }
    } else {
      console.warn('[Voice] notifyChannelId oder notifyRoleKeys nicht konfiguriert – keine Benachrichtigung gesendet.');
    }
  } else {
    // Außerhalb der Zeiten: nur Hinweis-Sound, KEINE Benachrichtigung, KEIN Support-Fall
    await playSoundInChannel(channel, voiceConfig.soundFileOutsideWindow);
  }
}

// ---------------------------------------------------------------------------
// Verlassen des Warteraums -> offenen Support-Fall abbrechen
// ---------------------------------------------------------------------------

async function checkWaitingRoomLeave(oldState, newState) {
  const voiceConfig = await VoiceConfig.findOne({ guildId: oldState.guild.id });
  if (!voiceConfig?.waitingRoomChannelId) return;
  if (oldState.channelId !== voiceConfig.waitingRoomChannelId) return;
  if (newState.channelId === voiceConfig.waitingRoomChannelId) return; // kein echtes Verlassen

  await handleUserLeftWaitingRoom(oldState.guild.id, oldState.member.id);
}

// ---------------------------------------------------------------------------
// Haupt-Event
// ---------------------------------------------------------------------------

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState) {
    // Bots (inkl. uns selbst) immer ignorieren
    if (newState.member?.user?.bot) return;

    // Warteraum-Verlassen prüfen, unabhängig davon, ob ein neuer Channel betreten wurde
    await checkWaitingRoomLeave(oldState, newState);

    if (!newState.channelId || oldState.channelId === newState.channelId) return;

    // 1) Interview-Channel-Check (Bewerbungssystem)
    const application = await Application.findOne({
      interviewChannelId: newState.channelId,
      status: 'scheduled',
      userId: newState.member.id,
    });
    if (application) {
      await handleApplicantJoinedInterview(newState.client, application);
      return;
    }

    // 2) Warteraum-Check (Voice-Setup-System)
    await handleWaitingRoomJoin(newState);
  },
};