'use strict';

/**
 * voiceStateUpdate.js
 * 1) Erkennt Beitritt zum Interview-Voice-Channel (Bewerbungssystem)
 * 2) Erkennt Beitritt zum Support-Warteraum (Voice-Setup-System)
 */

const Application = require('../models/Application');
const { handleApplicantJoinedInterview } = require('../interactions/applicationHandler');

const VoiceConfig = require('../models/VoiceConfig');
const GuildConfig = require('../models/GuildConfig');
const { playSoundInChannel } = require('../utils/voicePlayback');
const { generateCaseId, buildSupportCaseMessage } = require('../utils/voiceBuilder');

function isWithinSupportWindow(config, now = new Date()) {
  const dayOfWeek = now.getDay();
  const minuteOfDay = now.getHours() * 60 + now.getMinutes();

  return config.supportWindows.some(w =>
    w.dayOfWeek === dayOfWeek && minuteOfDay >= w.startMinute && minuteOfDay < w.endMinute
  );
}

async function handleWaitingRoomJoin(newState) {
  const voiceConfig = await VoiceConfig.findOne({ guildId: newState.guild.id });
  if (!voiceConfig || !voiceConfig.waitingRoomChannelId || voiceConfig.waitingRoomChannelId !== newState.channelId) {
    return;
  }

  console.log(`[Voice] ${newState.member.user.tag} ist dem Warteraum beigetreten.`);

  const channel = newState.channel;
  const withinWindow = isWithinSupportWindow(voiceConfig);

  if (withinWindow) {
    await playSoundInChannel(channel, voiceConfig.soundFileInsideWindow);

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

          // Pro benachrichtigter Rolle eine eigene Subtext-Mention-Zeile oben, alle Rollen in einer Nachricht
          const rolePings = roleIds.map(id => `<@&${id}>`).join(' ');
          const message = buildSupportCaseMessage({
            roleId: roleIds[0], // primäre Rolle für die Subtext-Pingzeile
            userId: newState.member.id,
            caseId,
            createdAtUnix,
          });

          // Falls mehrere Rollen konfiguriert sind, alle zusätzlich in der ersten Zeile pingen
          const finalMessage = roleIds.length > 1
            ? message.replace(`-# <@&${roleIds[0]}>`, `-# ${rolePings}`)
            : message;

          await notifyChannel.send(finalMessage);
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
    await playSoundInChannel(channel, voiceConfig.soundFileOutsideWindow);
  }
}

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState) {
    if (newState.member?.user?.bot) return; // Bots (inkl. uns selbst) ignorieren
    if (!newState.channelId || oldState.channelId === newState.channelId) return;

    const application = await Application.findOne({
      interviewChannelId: newState.channelId,
      status: 'scheduled',
      userId: newState.member.id,
    });
    if (application) {
      await handleApplicantJoinedInterview(newState.client, application);
      return;
    }

    await handleWaitingRoomJoin(newState);
  },
};