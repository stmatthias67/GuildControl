const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

const TIME_UNITS = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

function parseDuration(input) {
  const match = input.match(/^(\d+)([smhd])$/);
  if (!match) return null;
  const value = parseInt(match[1]);
  const unit = match[2];
  return value * TIME_UNITS[unit];
}

function formatDuration(ms) {
  const d = Math.floor(ms / TIME_UNITS.d);
  const h = Math.floor((ms % TIME_UNITS.d) / TIME_UNITS.h);
  const m = Math.floor((ms % TIME_UNITS.h) / TIME_UNITS.m);
  const s = Math.floor((ms % TIME_UNITS.m) / TIME_UNITS.s);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s) parts.push(`${s}s`);
  return parts.join(' ') || '0s';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Mutet einen Benutzer für eine bestimmte Zeit (Timeout)')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Der Benutzer, der gemutet werden soll')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('time')
        .setDescription('Dauer des Mutes (z. B. 10m, 2h, 1d)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Grund des Mutes')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const target = interaction.options.getMember('user');
    const timeInput = interaction.options.getString('time');
    const reason = interaction.options.getString('reason');

    if (!target) {
      return interaction.reply({ content: '❌ Dieser Benutzer wurde nicht gefunden.', ephemeral: true });
    }

    if (target.id === interaction.user.id) {
      return interaction.reply({ content: '❌ Du kannst dich nicht selbst muten.', ephemeral: true });
    }

    if (target.roles.highest.position >= interaction.member.roles.highest.position) {
      return interaction.reply({
        content: '❌ Du kannst diesen Benutzer nicht muten, da er eine höhere oder gleiche Rolle hat.',
        ephemeral: true,
      });
    }

    const durationMs = parseDuration(timeInput);
    if (!durationMs) {
      return interaction.reply({
        content: '❌ Ungültiges Zeitformat. Verwende z. B. `10s`, `5m`, `2h`, `1d`.',
        ephemeral: true,
      });
    }

    const MAX_TIMEOUT = 28 * 24 * 60 * 60 * 1000;
    if (durationMs > MAX_TIMEOUT) {
      return interaction.reply({
        content: '❌ Der Timeout darf maximal **28 Tage** betragen.',
        ephemeral: true,
      });
    }

    try {
      await target.timeout(durationMs, reason);

      const embed = new EmbedBuilder()
        .setColor(0xFF6600)
        .setTitle('🔇 Benutzer gemutet')
        .addFields(
          { name: '👤 Benutzer', value: `${target.user.tag} (${target.id})`, inline: true },
          { name: '🛡️ Moderator', value: `${interaction.user.tag}`, inline: true },
          { name: '⏱️ Dauer', value: formatDuration(durationMs), inline: true },
          { name: '📋 Grund', value: reason }
        )
        .setTimestamp()
        .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() });

      await interaction.reply({ embeds: [embed] });

      await target.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xFF6600)
            .setTitle(`🔇 Du wurdest in **${interaction.guild.name}** gemutet`)
            .addFields(
              { name: '⏱️ Dauer', value: formatDuration(durationMs), inline: true },
              { name: '📋 Grund', value: reason }
            )
            .setTimestamp(),
        ],
      }).catch(() => null);

    } catch (error) {
      console.error('[MUTE] Fehler:', error);
      return interaction.reply({
        content: '❌ Beim Muten des Benutzers ist ein Fehler aufgetreten.',
        ephemeral: true,
      });
    }
  },
};

