'use strict';

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ChannelType,
} = require('discord.js');
const { COLORS, ICONS } = require('./uiTheme');

// Verfügbare Statistik-Typen, jeweils mit Standard-Vorlage und Berechnungslogik
const STAT_TYPES = {
  members: { label: 'Mitglieder (gesamt)', emoji: '👥', defaultTemplate: '👥 Mitglieder: {count}' },
  bots: { label: 'Bots', emoji: '🤖', defaultTemplate: '🤖 Bots: {count}' },
  boosts: { label: 'Server-Boosts', emoji: '🚀', defaultTemplate: '🚀 Boosts: {count}' },
  online: { label: 'Online-Mitglieder', emoji: '🟢', defaultTemplate: '🟢 Online: {count}' },
  channels: { label: 'Kanäle (gesamt)', emoji: '📺', defaultTemplate: '📺 Kanäle: {count}' },
  roles: { label: 'Rollen (gesamt)', emoji: '🏷️', defaultTemplate: '🏷️ Rollen: {count}' },
};

function buildStatsOverviewEmbed(config) {
  const activeLines = config.channels.length
    ? config.channels.map(c => {
        const def = STAT_TYPES[c.type];
        return `${def?.emoji || '📊'} **${def?.label || c.type}** → <#${c.channelId}>`;
      }).join('\n')
    : '_Noch keine Statistik-Kanäle eingerichtet._';

  return new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('📊 Statistik-Setup')
    .setDescription(
      'Erstelle Live-Kanäle, deren Name automatisch aktualisiert wird (z.B. "👥 Mitglieder: 482").\n\nAktive Statistik-Kanäle:\n\n' + activeLines
    )
    .addFields({ name: 'Kategorie', value: config.categoryId ? `<#${config.categoryId}>` : '_Nicht gesetzt (Kanäle liegen außerhalb einer Kategorie)_' });
}

function buildStatsOverviewComponents(config) {
  const availableTypes = Object.keys(STAT_TYPES).filter(
    type => !config.channels.some(c => c.type === type)
  );

  const rows = [];

  if (availableTypes.length) {
    const select = new StringSelectMenuBuilder()
      .setCustomId('statssetup-addtype')
      .setPlaceholder('Statistik-Kanal hinzufügen...')
      .addOptions(availableTypes.map(type => ({
        label: STAT_TYPES[type].label,
        value: type,
        emoji: STAT_TYPES[type].emoji,
      })));
    rows.push(new ActionRowBuilder().addComponents(select));
  }

  if (config.channels.length) {
    const removeSelect = new StringSelectMenuBuilder()
      .setCustomId('statssetup-removetype')
      .setPlaceholder('Statistik-Kanal entfernen...')
      .addOptions(config.channels.map(c => ({
        label: STAT_TYPES[c.type]?.label || c.type,
        value: c.type,
        emoji: STAT_TYPES[c.type]?.emoji || '📊',
      })));
    rows.push(new ActionRowBuilder().addComponents(removeSelect));
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('statssetup-category').setLabel('Kategorie wählen').setStyle(ButtonStyle.Secondary).setEmoji(ICONS.category),
      new ButtonBuilder().setCustomId('statssetup-refresh').setLabel('Jetzt aktualisieren').setStyle(ButtonStyle.Secondary).setEmoji(ICONS.reset),
      new ButtonBuilder().setCustomId('setup-menu-back').setLabel('Zurück').setStyle(ButtonStyle.Secondary).setEmoji(ICONS.back),
    )
  );

  return rows;
}

function buildCategorySelectRow() {
  const { ChannelSelectMenuBuilder } = require('discord.js');
  return new ActionRowBuilder().addComponents(
    new (require('discord.js').ChannelSelectMenuBuilder)()
      .setCustomId('statssetup-categoryselect')
      .setPlaceholder('Kategorie auswählen...')
      .addChannelTypes(ChannelType.GuildCategory)
  );
}

module.exports = { STAT_TYPES, buildStatsOverviewEmbed, buildStatsOverviewComponents, buildCategorySelectRow };