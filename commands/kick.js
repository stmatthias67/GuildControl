const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kickt einen Benutzer vom Server')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Der Benutzer, der gekickt werden soll')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Grund des Kicks')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  async execute(interaction) {
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason');

    if (!target) {
      return interaction.reply({ content: '❌ Dieser Benutzer wurde nicht gefunden.', ephemeral: true });
    }

    if (target.id === interaction.user.id) {
      return interaction.reply({ content: '❌ Du kannst dich nicht selbst kicken.', ephemeral: true });
    }

    if (!target.kickable) {
      return interaction.reply({
        content: '❌ Ich kann diesen Benutzer nicht kicken. Fehlende Berechtigungen oder höhere Rolle.',
        ephemeral: true,
      });
    }

    if (target.roles.highest.position >= interaction.member.roles.highest.position) {
      return interaction.reply({
        content: '❌ Du kannst diesen Benutzer nicht kicken, da er eine höhere oder gleiche Rolle hat.',
        ephemeral: true,
      });
    }

    try {
      await target.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xFF4500)
            .setTitle(`👢 Du wurdest von **${interaction.guild.name}** gekickt`)
            .addFields({ name: '📋 Grund', value: reason })
            .setTimestamp(),
        ],
      }).catch(() => null);

      await target.kick(reason);

      const embed = new EmbedBuilder()
        .setColor(0xFF4500)
        .setTitle('👢 Benutzer gekickt')
        .addFields(
          { name: '👤 Benutzer', value: `${target.user.tag} (${target.id})`, inline: true },
          { name: '🛡️ Moderator', value: `${interaction.user.tag}`, inline: true },
          { name: '📋 Grund', value: reason }
        )
        .setTimestamp()
        .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() });

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      console.error('[KICK] Fehler:', error);
      return interaction.reply({
        content: '❌ Beim Kicken des Benutzers ist ein Fehler aufgetreten.',
        ephemeral: true,
      });
    }
  },
};

