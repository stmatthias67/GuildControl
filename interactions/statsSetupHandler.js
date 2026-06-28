'use strict';

const { PermissionFlagsBits, ChannelType } = require('discord.js');
const StatsConfig = require('../models/StatsConfig');
const { STAT_TYPES, buildStatsOverviewEmbed, buildStatsOverviewComponents, buildCategorySelectRow } = require('../utils/statsBuilder');
const { refreshStatsChannels } = require('../utils/statsUpdater');

async function getOrCreateStatsConfig(guildId) {
  let config = await StatsConfig.findOne({ guildId });
  if (!config) config = await StatsConfig.create({ guildId });
  return config;
}

function hasManageGuild(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

async function showOverview(interaction) {
  const config = await getOrCreateStatsConfig(interaction.guildId);
  const embed = buildStatsOverviewEmbed(config);
  const components = buildStatsOverviewComponents(config);

  if (interaction.deferred || interaction.replied) {
    return interaction.editReply({ content: null, embeds: [embed], components });
  }
  return interaction.update({ embeds: [embed], components });
}

async function handleStatsSetupInteraction(interaction) {
  if (!hasManageGuild(interaction)) {
    return interaction.reply({ content: '❌ Du benötigst die Berechtigung "Server verwalten".', ephemeral: true });
  }

  const id = interaction.customId;

  if (interaction.isStringSelectMenu() && id === 'statssetup-addtype') {
    const type = interaction.values[0];
    const def = STAT_TYPES[type];

    await interaction.deferUpdate();
    const config = await getOrCreateStatsConfig(interaction.guildId);

    try {
      const guild = interaction.guild;
      const channel = await guild.channels.create({
        name: def.defaultTemplate.replace('{count}', '0'),
        type: ChannelType.GuildVoice,
        parent: config.categoryId || undefined,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect] }, // niemand soll joinen, nur der Name zählt
        ],
      });

      config.channels.push({ type, channelId: channel.id, template: def.defaultTemplate });
      await config.save();

      await refreshStatsChannels(interaction.client, interaction.guildId);
    } catch (err) {
      console.error('[statsSetupHandler] Fehler beim Erstellen des Statistik-Kanals:', err);
    }

    return showOverview(interaction);
  }

  if (interaction.isStringSelectMenu() && id === 'statssetup-removetype') {
    const type = interaction.values[0];
    await interaction.deferUpdate();

    const config = await getOrCreateStatsConfig(interaction.guildId);
    const entry = config.channels.find(c => c.type === type);

    if (entry) {
      try {
        const channel = await interaction.guild.channels.fetch(entry.channelId);
        await channel.delete();
      } catch (err) {
        // Channel ggf. schon manuell gelöscht
      }
      config.channels = config.channels.filter(c => c.type !== type);
      await config.save();
    }

    return showOverview(interaction);
  }

  if (interaction.isChannelSelectMenu() && id === 'statssetup-categoryselect') {
    await interaction.deferUpdate();
    const config = await getOrCreateStatsConfig(interaction.guildId);
    config.categoryId = interaction.values[0];
    await config.save();
    return showOverview(interaction);
  }

  if (id === 'statssetup-category') {
    return interaction.update({
      content: 'Wähle die Kategorie, in der die Statistik-Kanäle liegen sollen:',
      embeds: [],
      components: [buildCategorySelectRow()],
    });
  }

  if (id === 'statssetup-refresh') {
    await interaction.deferUpdate();
    await refreshStatsChannels(interaction.client, interaction.guildId);
    return showOverview(interaction);
  }

  if (id === 'statssetup-overview') {
    return showOverview(interaction);
  }
}

module.exports = { getOrCreateStatsConfig, showOverview, handleStatsSetupInteraction };