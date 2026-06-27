'use strict';

const { PermissionFlagsBits, ChannelType, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const VoiceConfig = require('../models/VoiceConfig');
const GuildConfig = require('../models/GuildConfig');
const { ROLE_DEFINITIONS } = require('../utils/rolePermissions');
const {
  buildVoiceOverviewEmbed,
  buildVoiceOverviewComponents,
  buildSupportTimesReadOnlyEmbed,
  buildSupportTimesReadOnlyComponents,
  buildChannelSelectRow,
  buildOutsideMessageModal,
} = require('../utils/voiceBuilder');

async function getOrCreateVoiceConfig(guildId) {
  let config = await VoiceConfig.findOne({ guildId });
  if (!config) config = await VoiceConfig.create({ guildId });
  return config;
}

function hasManageGuild(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

async function getConfiguredRoleKeys(guildId) {
  const guildConfig = await GuildConfig.findOne({ guildId });
  if (!guildConfig?.roles) return [];
  const roles = guildConfig.roles;
  return ROLE_DEFINITIONS.filter(def => roles[def.key]).map(def => ({ key: def.key, label: def.label, emoji: def.emoji }));
}

async function showOverview(interaction) {
  const config = await getOrCreateVoiceConfig(interaction.guildId);
  const embed = buildVoiceOverviewEmbed(config);
  const components = buildVoiceOverviewComponents(config);
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content: null, embeds: [embed], components });
  } else {
    await interaction.update({ content: null, embeds: [embed], components });
  }
}

async function showSupportTimesReadOnly(interaction) {
  const config = await getOrCreateVoiceConfig(interaction.guildId);
  const embed = buildSupportTimesReadOnlyEmbed(config);
  const components = buildSupportTimesReadOnlyComponents();
  await interaction.update({ content: null, embeds: [embed], components });
}

function buildRoleKeySelectRow(roleOptions, customId) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder('Rolle(n) auswählen...')
    .setMinValues(1)
    .setMaxValues(Math.min(roleOptions.length, 25))
    .addOptions(roleOptions.slice(0, 25).map(r => ({ label: r.label, value: r.key, emoji: r.emoji })));
  return new ActionRowBuilder().addComponents(menu);
}

async function handleVoiceSetupInteraction(interaction) {
  if (!hasManageGuild(interaction)) {
    return interaction.reply({ content: '❌ Du benötigst die Berechtigung "Server verwalten".', ephemeral: true });
  }

  const id = interaction.customId;

  if (interaction.isStringSelectMenu() && id === 'voicesetup-notifyrolesselect') {
    const config = await getOrCreateVoiceConfig(interaction.guildId);
    config.notifyRoleKeys = interaction.values;
    await config.save();
    return showOverview(interaction);
  }

  if (interaction.isChannelSelectMenu() && id === 'voicesetup-waitingroomselect') {
    const config = await getOrCreateVoiceConfig(interaction.guildId);
    config.waitingRoomChannelId = interaction.values[0];
    await config.save();
    return showOverview(interaction);
  }

  if (interaction.isChannelSelectMenu() && id === 'voicesetup-notifychannelselect') {
    const config = await getOrCreateVoiceConfig(interaction.guildId);
    config.notifyChannelId = interaction.values[0];
    await config.save();
    return showOverview(interaction);
  }

  if (id === 'voicesetup-waitingroom') {
    return interaction.update({
      content: 'Wähle den Voice-Channel, der als Warteraum dient:',
      embeds: [],
      components: [buildChannelSelectRow('voicesetup-waitingroomselect', ChannelType.GuildVoice)],
    });
  }

  if (id === 'voicesetup-notifychannel') {
    return interaction.update({
      content: 'Wähle den Text-Channel, in dem Support-Benachrichtigungen gepostet werden:',
      embeds: [],
      components: [buildChannelSelectRow('voicesetup-notifychannelselect', ChannelType.GuildText)],
    });
  }

  if (id === 'voicesetup-notifyroles') {
    const roleOptions = await getConfiguredRoleKeys(interaction.guildId);
    if (!roleOptions.length) {
      return interaction.update({ content: '⚠️ Es sind noch keine Rollen im Rollen-Setup konfiguriert.', embeds: [], components: [] });
    }
    return interaction.update({
      content: 'Wähle die Rolle(n), die bei Warteraum-Beitritt benachrichtigt werden:',
      embeds: [],
      components: [buildRoleKeySelectRow(roleOptions, 'voicesetup-notifyrolesselect')],
    });
  }

  // ── Read-only Supportzeiten-Anzeige ──────────────────────────────────────
  if (id === 'voicesetup-supporttimes') return showSupportTimesReadOnly(interaction);

  if (id === 'voicesetup-overview') return showOverview(interaction);
}

async function handleVoiceSetupModalSubmit(interaction) {
  if (!hasManageGuild(interaction)) {
    return interaction.reply({ content: '❌ Du benötigst die Berechtigung "Server verwalten".', ephemeral: true });
  }

  const id = interaction.customId;

  if (id === 'voicesetup-modal-outsidemessage') {
    await interaction.deferUpdate();
    const config = await getOrCreateVoiceConfig(interaction.guildId);
    config.outsideWindowMessage = interaction.fields.getTextInputValue('text').trim();
    await config.save();
    return showOverview(interaction);
  }
}

module.exports = {
  getOrCreateVoiceConfig,
  showOverview,
  handleVoiceSetupInteraction,
  handleVoiceSetupModalSubmit,
};