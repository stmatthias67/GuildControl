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
        const roleMentions = voiceConfig.notifyRoleKeys
          .map(key => guildConfig?.roles?.[key])
          .filter(Boolean)
          .map(roleId => `<@&${roleId}>`)
          .join(' ');

        if (roleMentions) {
          const notifyChannel = await newState.client.channels.fetch(voiceConfig.notifyChannelId);
          await notifyChannel.send(
            `${roleMentions} 🔔 <@${newState.member.id}> ist im Support-Warteraum (<#${channel.id}>).`
          );
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