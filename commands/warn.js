const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const Warn = require('../models/warn');
const ModerationEvent = require('../models/ModerationEvent');
const { logCatch } = require('../utils/errorLogger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Verwarnt einen Benutzer')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Der Benutzer, der verwarnt werden soll')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Grund der Verwarnung')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason');

    if (!target) {
      return interaction.reply({
        content: '❌ Dieser Benutzer wurde nicht gefunden.',
        ephemeral: true,
      });
    }

    if (target.id === interaction.user.id) {
      return interaction.reply({
        content: '❌ Du kannst dich nicht selbst verwarnen.',
        ephemeral: true,
      });
    }

    if (target.roles.highest.position >= interaction.member.roles.highest.position) {
      return interaction.reply({
        content: '❌ Du kannst diesen Benutzer nicht verwarnen, da er eine höhere oder gleiche Rolle hat.',
        ephemeral: true,
      });
    }

    try {
      // Erst speichern, dann antworten. Der Warn bleibt gültig, auch wenn Antwort oder DM scheitern.
      const warn = await Warn.create({
        guildId: interaction.guild.id,
        userId: target.id,
        moderatorId: interaction.user.id,
        reason,
      });
      // Warn ist schon gespeichert: ein Event-Fehler darf ihn nicht als gescheitert melden (sonst Doppel-Warn).
      await ModerationEvent.create({
        guildId: interaction.guild.id,
        type: 'warn',
        actorId: interaction.user.id,
        targetId: target.id,
        reason,
        meta: { warnId: warn._id.toString() },
      }).catch(logCatch('warn.event'));

      const embed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('⚠️ Verwarnung ausgesprochen')
        .addFields(
          { name: '👤 Benutzer', value: `${target.user.tag} (${target.id})`, inline: true },
          { name: '🛡️ Moderator', value: `${interaction.user.tag}`, inline: true },
          { name: '📋 Grund', value: reason }
        )
        .setTimestamp()
        .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() });

      await interaction.reply({ embeds: [embed] });

      await target.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle(`⚠️ Du wurdest in **${interaction.guild.name}** verwarnt`)
            .addFields({ name: '📋 Grund', value: reason })
            .setTimestamp(),
        ],
      }).catch(logCatch('warn.dm'));

    } catch (error) {
      console.error('[WARN] Fehler:', error);
      if (interaction.replied) return;
      return interaction.reply({
        content: '❌ Beim Ausführen der Verwarnung ist ein Fehler aufgetreten.',
        ephemeral: true,
      }).catch(logCatch('warn.errorReply'));
    }
  },
};

