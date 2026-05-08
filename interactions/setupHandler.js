'use strict';

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { getSession, deleteSession } = require('../utils/sessionManager');
const {
  buildRolesEmbed,    buildRolesComponents,
  buildChannelsEmbed, buildChannelsComponents,
  buildSystemsEmbed,  buildSystemsComponents,
  buildRoleCreateModal, buildChannelCreateModal,
} = require('../utils/setupBuilder');
const GuildConfig = require('./GuildConfig');

// Default permission sets per role type
const ROLE_PERMISSIONS = {
  admin:     [PermissionFlagsBits.Administrator],
  moderator: [PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers],
  support:   [PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages],
  member:    [],
};

// ─── Guard ───────────────────────────────────────────────────────────────────

async function guardSession(interaction) {
  const session = getSession(interaction.guild.id);
  if (!session) {
    await interaction.reply({ content: '⚠️ Kein aktives Setup. Starte es mit `/setup`.', ephemeral: true });
    return null;
  }
  if (session.userId !== interaction.user.id) {
    await interaction.reply({ content: '⚠️ Nur derjenige, der das Setup gestartet hat, darf es bedienen.', ephemeral: true });
    return null;
  }
  return session;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

async function handleSetupInteraction(interaction) {
  const id = interaction.customId;

  // ── Select Menus ──────────────────────────────────────────────────────────

  if (interaction.isStringSelectMenu()) {
    const session = await guardSession(interaction);
    if (!session) return;

    const value = interaction.values[0];
    const { guild } = interaction;

    if (id === 'setup_role_admin')     session.data.roles.admin     = value;
    if (id === 'setup_role_moderator') session.data.roles.moderator = value;
    if (id === 'setup_role_support')   session.data.roles.support   = value;
    if (id === 'setup_role_member')    session.data.roles.member    = value;

    if (id === 'setup_channel_logs')    session.data.channels.logs    = value;
    if (id === 'setup_channel_tickets') session.data.channels.tickets = value;

    // Re-render appropriate step
    if (id.startsWith('setup_role_')) {
      await interaction.update({
        embeds: [buildRolesEmbed(guild, session.data)],
        components: buildRolesComponents(guild),
      });
    } else {
      await interaction.update({
        embeds: [buildChannelsEmbed(guild, session.data)],
        components: buildChannelsComponents(guild),
      });
    }
    return;
  }

  // ── Buttons ───────────────────────────────────────────────────────────────

  if (interaction.isButton()) {
    const session = await guardSession(interaction);
    if (!session) return;
    const { guild } = interaction;

    // Create role modal
    if (id === 'setup_role_create') {
      return interaction.showModal(buildRoleCreateModal());
    }

    // Set default permissions for existing roles
    if (id === 'setup_role_perms') {
      await interaction.deferReply({ ephemeral: true });
      const results = [];
      for (const [type, roleId] of Object.entries(session.data.roles)) {
        if (!roleId) continue;
        const role = guild.roles.cache.get(roleId);
        if (!role) continue;
        try {
          await role.setPermissions(ROLE_PERMISSIONS[type]);
          results.push(`✅ <@&${roleId}> (${type})`);
        } catch {
          results.push(`❌ <@&${roleId}> (${type}) — fehlgeschlagen`);
        }
      }
      return interaction.editReply({
        content: results.length ? `Rechte gesetzt:\n${results.join('\n')}` : 'Keine Rollen konfiguriert.',
      });
    }

    // Create log/ticket channel
    if (id === 'setup_channel_create_logs') {
      return interaction.showModal(buildChannelCreateModal('logs'));
    }
    if (id === 'setup_channel_create_tickets') {
      return interaction.showModal(buildChannelCreateModal('tickets'));
    }

    // Navigation
    if (id === 'setup_next_channels') {
      return interaction.update({
        embeds: [buildChannelsEmbed(guild, session.data)],
        components: buildChannelsComponents(guild),
      });
    }
    if (id === 'setup_next_systems') {
      return interaction.update({
        embeds: [buildSystemsEmbed(guild, session.data)],
        components: buildSystemsComponents(session.data),
      });
    }

    // Toggle systems
    if (id === 'setup_toggle_moderation') {
      session.data.systems.moderation = !session.data.systems.moderation;
      return interaction.update({
        embeds: [buildSystemsEmbed(guild, session.data)],
        components: buildSystemsComponents(session.data),
      });
    }
    if (id === 'setup_toggle_tickets') {
      session.data.systems.tickets = !session.data.systems.tickets;
      return interaction.update({
        embeds: [buildSystemsEmbed(guild, session.data)],
        components: buildSystemsComponents(session.data),
      });
    }
    if (id === 'setup_toggle_logs') {
      session.data.systems.logs = !session.data.systems.logs;
      return interaction.update({
        embeds: [buildSystemsEmbed(guild, session.data)],
        components: buildSystemsComponents(session.data),
      });
    }

    // Cancel
    if (id === 'setup_cancel') {
      deleteSession(guild.id);
      return interaction.update({ content: '❌ Setup abgebrochen.', embeds: [], components: [] });
    }

    // Save
    if (id === 'setup_save') {
      await interaction.deferUpdate();
      try {
        await GuildConfig.findOneAndUpdate(
          { guildId: guild.id },
          {
            guildId: guild.id,
            roles:    session.data.roles,
            channels: session.data.channels,
            systems:  session.data.systems,
          },
          { upsert: true, new: true },
        );
        deleteSession(guild.id);
        return interaction.editReply({
          content: '✅ Setup erfolgreich gespeichert!',
          embeds: [],
          components: [],
        });
      } catch (err) {
        console.error('[Setup] MongoDB save error:', err);
        return interaction.editReply({
          content: '❌ Fehler beim Speichern. Bitte versuche es erneut.',
          embeds: [],
          components: [],
        });
      }
    }
  }

  // ── Modals ────────────────────────────────────────────────────────────────

  if (interaction.isModalSubmit()) {
    const session = await guardSession(interaction);
    if (!session) return;
    const { guild } = interaction;

    // Create role modal
    if (id === 'setup_modal_create_role') {
      await interaction.deferReply({ ephemeral: true });
      const name  = interaction.fields.getTextInputValue('role_name').trim();
      const type  = interaction.fields.getTextInputValue('role_type').trim().toLowerCase();
      const color = interaction.fields.getTextInputValue('role_color').trim() || null;

      if (!['admin', 'moderator', 'support', 'member'].includes(type)) {
        return interaction.editReply({ content: '❌ Ungültiger Typ. Erlaubt: admin, moderator, support, member.' });
      }

      try {
        const role = await guild.roles.create({
          name,
          color: color || 0x99aab5,
          permissions: ROLE_PERMISSIONS[type],
          reason: 'Setup-System',
        });
        session.data.roles[type] = role.id;
        await interaction.editReply({ content: `✅ Rolle <@&${role.id}> als **${type}** erstellt und zugewiesen.` });
      } catch (err) {
        console.error('[Setup] Role create error:', err);
        await interaction.editReply({ content: '❌ Fehler beim Erstellen der Rolle.' });
      }
      return;
    }

    // Create channel modals
    if (id.startsWith('setup_modal_create_channel_')) {
      const type = id.replace('setup_modal_create_channel_', ''); // 'logs' | 'tickets'
      await interaction.deferReply({ ephemeral: true });
      const name = interaction.fields.getTextInputValue('channel_name').trim();

      try {
        let channel;
        if (type === 'tickets') {
          channel = await guild.channels.create({
            name,
            type: ChannelType.GuildCategory,
            reason: 'Setup-System',
          });
        } else {
          channel = await guild.channels.create({
            name,
            type: ChannelType.GuildText,
            reason: 'Setup-System',
          });
        }
        session.data.channels[type] = channel.id;
        await interaction.editReply({ content: `✅ ${type === 'logs' ? 'Log Channel' : 'Ticket Kategorie'} <#${channel.id}> erstellt.` });
      } catch (err) {
        console.error('[Setup] Channel create error:', err);
        await interaction.editReply({ content: '❌ Fehler beim Erstellen des Channels.' });
      }
    }
  }
}

module.exports = { handleSetupInteraction };
