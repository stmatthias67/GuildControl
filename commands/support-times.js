'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const VoiceConfig = require('../models/VoiceConfig');
const { WEEKDAY_LABELS, minuteToTimeString } = require('../utils/voiceBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('support-times')
    .setDescription('Zeigt die aktuellen Support-Zeiten an.'),

  async execute(interaction) {
    const config = await VoiceConfig.findOne({ guildId: interaction.guildId });

    const windows = config?.supportWindows?.length
      ? config.supportWindows
      : [];

    const text = windows.length
      ? windows
          .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
          .map(w => `**${WEEKDAY_LABELS[w.dayOfWeek]}**: ${minuteToTimeString(w.startMinute)} – ${minuteToTimeString(w.endMinute)} Uhr`)
          .join('\n')
      : '_Es sind noch keine Support-Zeiten festgelegt._';

    const embed = new EmbedBuilder()
      .setColor(0x2b6cb0)
      .setTitle('🕒 Support-Zeiten')
      .setDescription(text)
      .setFooter({ text: 'Support-Zeiten werden zukünftig nur noch über die Website verwaltet.' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};