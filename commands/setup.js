'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createSession, getSession } = require('../utils/sessionManager');
const { buildRolesEmbed, buildRolesComponents } = require('../utils/setupBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Konfiguriere diesen Server interaktiv.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction) {
    const { guild, user } = interaction;

    // Only one setup per guild at a time
    const existing = getSession(guild.id);
    if (existing && existing.userId !== user.id) {
      return interaction.reply({
        content: `⚠️ Ein Setup läuft bereits (gestartet von <@${existing.userId}>). Bitte warte, bis es abgeschlossen ist.`,
        ephemeral: true,
      });
    }

    const session = createSession(guild.id, user.id);

    await interaction.reply({
      embeds: [buildRolesEmbed(guild, session.data)],
      components: buildRolesComponents(guild),
      ephemeral: true,
    });
  },
};
