const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bannt einen Benutzer vom Server')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Der Benutzer, der gebannt werden soll')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Grund des Bans')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('delete_days')
        .setDescription('Nachrichten der letzten X Tage löschen (0–7)')
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    const target = interaction.options.getMember('user');
    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    const deleteDays = interaction.options.getInteger('delete_days') ?? 0;

    if (!targetUser) {
      return interaction.reply({ content: '❌ Dieser Benutzer wurde nicht gefunden.', ephemeral: true });
    }

    if (targetUser.id === interaction.user.id) {
      return interaction.reply({ content: '❌ Du kannst dich nicht selbst bannen.', ephemeral: true });
    }

    if (targetUser.id === interaction.client.user.id) {
      return interaction.reply({ content: '❌ Ich kann mich nicht selbst bannen.', ephemeral: true });
    }

    if (target) {
      if (!target.bannable) {
        return interaction.reply({
          content: '❌ Ich kann diesen Benutzer nicht bannen. Fehlende Berechtigungen oder höhere Rolle.',
          ephemeral: true,
        });
      }

      if (target.roles.highest.position >= interaction.member.roles.highest.position) {
        return interaction.reply({
          content: '❌ Du kannst diesen Benutzer nicht bannen, da er eine höhere oder gleiche Rolle hat.',
          ephemeral: true,
        });
      }

      await target.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle(`🔨 Du wurdest von **${interaction.guild.name}** gebannt`)
            .addFields({ name: '📋 Grund', value: reason })
            .setTimestamp(),
        ],
      }).catch(() => null);
    }

    try {
      await interaction.guild.members.ban(targetUser.id, {
        reason,
        deleteMessageDays: deleteDays,
      });

      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('🔨 Benutzer gebannt')
        .addFields(
          { name: '👤 Benutzer', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
          { name: '🛡️ Moderator', value: `${interaction.user.tag}`, inline: true },
          { name: '🗑️ Nachrichten gelöscht', value: `${deleteDays} Tag(e)`, inline: true },
          { name: '📋 Grund', value: reason }
        )
        .setTimestamp()
        .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() });

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      console.error('[BAN] Fehler:', error);
      return interaction.reply({
        content: '❌ Beim Bannen des Benutzers ist ein Fehler aufgetreten.',
        ephemeral: true,
      });
    }
  },
};

