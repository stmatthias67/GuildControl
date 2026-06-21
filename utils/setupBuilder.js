'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
  ButtonStyle,
  ChannelType,
} = require('discord.js');

// ─── Roles Step ─────────────────────────────────────────────────────────────

function buildRolesEmbed(guild, data) {
  const r = data.roles;
  const fmt = (id) => (id ? `<@&${id}>` : '`Nicht gesetzt`');
  return new EmbedBuilder()
    .setTitle('⚙️ Server Setup — Schritt 1/3: Rollen')
    .setColor(0x5865f2)
    .setDescription('Wähle für jede Rolle einen bestehenden Rang aus oder erstelle einen neuen.')
    .addFields(
      { name: '👑 Admin',      value: fmt(r.admin),     inline: true },
      { name: '🛡️ Moderator', value: fmt(r.moderator), inline: true },
      { name: '🎧 Support',    value: fmt(r.support),   inline: true },
      { name: '👤 Member',     value: fmt(r.member),    inline: true },
    )
    .setFooter({ text: `${guild.name} • Setup` })
    .setTimestamp();
}

function buildRolesComponents(guild) {
  const roles = guild.roles.cache
    .filter((r) => !r.managed && r.id !== guild.id)
    .sort((a, b) => b.position - a.position)
    .first(25);

  const makeSelect = (customId, placeholder) =>
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .addOptions(
        roles.map((r) => ({ label: r.name, value: r.id, description: `ID: ${r.id}` })),
      );

  const rows = [
    new ActionRowBuilder().addComponents(makeSelect('setup_role_admin',     '👑 Admin-Rolle wählen')),
    new ActionRowBuilder().addComponents(makeSelect('setup_role_moderator', '🛡️ Moderator-Rolle wählen')),
    new ActionRowBuilder().addComponents(makeSelect('setup_role_support',   '🎧 Support-Rolle wählen')),
    new ActionRowBuilder().addComponents(makeSelect('setup_role_member',    '👤 Member-Rolle wählen')),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('setup_role_create').setLabel('➕ Rolle erstellen').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('setup_role_perms').setLabel('🔧 Rechte setzen').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('setup_next_channels').setLabel('Weiter →').setStyle(ButtonStyle.Success),
    ),
  ];
  return rows;
}

// ─── Channels Step ───────────────────────────────────────────────────────────

function buildChannelsEmbed(guild, data) {
  const c = data.channels;
  const fmt = (id) => (id ? `<#${id}>` : '`Nicht gesetzt`');
  return new EmbedBuilder()
    .setTitle('⚙️ Server Setup — Schritt 2/3: Channels')
    .setColor(0x57f287)
    .addFields(
      { name: '📋 Log Channel',       value: fmt(c.logs),    inline: true },
      { name: '🎫 Ticket Kategorie',  value: fmt(c.tickets), inline: true },
    )
    .setFooter({ text: `${guild.name} • Setup` })
    .setTimestamp();
}

function buildChannelsComponents(guild) {
  const textChannels = guild.channels.cache
    .filter((c) => c.type === ChannelType.GuildText)
    .sort((a, b) => a.position - b.position)
    .first(25);

  const categories = guild.channels.cache
    .filter((c) => c.type === ChannelType.GuildCategory)
    .sort((a, b) => a.position - b.position)
    .first(25);

  const makeSelect = (customId, placeholder, channels) =>
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .addOptions(channels.map((c) => ({ label: c.name, value: c.id })));

  const rows = [
    new ActionRowBuilder().addComponents(
      makeSelect('setup_channel_logs', '📋 Log Channel wählen', textChannels),
    ),
    new ActionRowBuilder().addComponents(
      makeSelect('setup_channel_tickets', '🎫 Ticket Kategorie wählen', categories.size ? categories : textChannels),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('setup_channel_create_logs').setLabel('➕ Log Channel erstellen').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('setup_channel_create_tickets').setLabel('➕ Ticket Kategorie erstellen').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('setup_next_systems').setLabel('Weiter →').setStyle(ButtonStyle.Success),
    ),
  ];
  return rows;
}

// ─── Systems Step ────────────────────────────────────────────────────────────

function buildSystemsEmbed(guild, data) {
  const s = data.systems;
  const fmt = (v) => (v ? '✅ Aktiv' : '❌ Inaktiv');
  return new EmbedBuilder()
    .setTitle('⚙️ Server Setup — Schritt 3/3: Systeme')
    .setColor(0xfee75c)
    .addFields(
      { name: '🔨 Moderation', value: fmt(s.moderation), inline: true },
      { name: '🎫 Tickets',    value: fmt(s.tickets),    inline: true },
      { name: '📋 Logs',       value: fmt(s.logs),       inline: true },
    )
    .setFooter({ text: `${guild.name} • Setup` })
    .setTimestamp();
}

function buildSystemsComponents(data) {
  const s = data.systems;
  const toggle = (active) => (active ? ButtonStyle.Success : ButtonStyle.Secondary);
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('setup_toggle_moderation').setLabel(`🔨 Moderation ${s.moderation ? 'deaktivieren' : 'aktivieren'}`).setStyle(toggle(s.moderation)),
      new ButtonBuilder().setCustomId('setup_toggle_tickets').setLabel(`🎫 Tickets ${s.tickets ? 'deaktivieren' : 'aktivieren'}`).setStyle(toggle(s.tickets)),
      new ButtonBuilder().setCustomId('setup_toggle_logs').setLabel(`📋 Logs ${s.logs ? 'deaktivieren' : 'aktivieren'}`).setStyle(toggle(s.logs)),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('setup_save').setLabel('💾 Speichern & Abschließen').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('setup_cancel').setLabel('❌ Abbrechen').setStyle(ButtonStyle.Danger),
    ),
  ];
}

// ─── Role Create Modal ────────────────────────────────────────────────────────

function buildRoleCreateModal() {
  const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
  return new ModalBuilder()
    .setCustomId('setup_modal_create_role')
    .setTitle('Rolle erstellen')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('role_name')
          .setLabel('Rollenname')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('role_type')
          .setLabel('Typ (admin / moderator / support / member)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(20),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('role_color')
          .setLabel('Farbe (Hex, z.B. #5865F2) — optional')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(7),
      ),
    );
}

function buildChannelCreateModal(type) {
  const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
  return new ModalBuilder()
    .setCustomId(`setup_modal_create_channel_${type}`)
    .setTitle(`${type === 'logs' ? 'Log Channel' : 'Ticket Kategorie'} erstellen`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('channel_name')
          .setLabel('Name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100)
          .setValue(type === 'logs' ? 'server-logs' : 'tickets'),
      ),
    );
}

module.exports = {
  buildRolesEmbed,
  buildRolesComponents,
  buildChannelsEmbed,
  buildChannelsComponents,
  buildSystemsEmbed,
  buildSystemsComponents,
  buildRoleCreateModal,
  buildChannelCreateModal,
};
