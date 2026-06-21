'use strict';

/**
 * voiceStateUpdate.js
 * Erkennt, wenn der Bewerber dem Interview-Voice-Channel beitritt.
 */

const Application = require('../models/Application');
const { handleApplicantJoinedInterview } = require('../interactions/applicationHandler');

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState) {
    // Nur relevant, wenn jemand einem neuen Channel beigetreten ist
    if (!newState.channelId || oldState.channelId === newState.channelId) return;

    const application = await Application.findOne({
      interviewChannelId: newState.channelId,
      status: 'scheduled',
      userId: newState.member.id,
    });

    if (!application) return;

    await handleApplicantJoinedInterview(newState.client, application);
  },
};