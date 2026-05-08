const { ChannelType } = require("discord.js");
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const os = require('os');
const process = require('process');

/**
 * Formatiert Millisekunden in ein lesbares Uptime-Format.
 * @param {number} ms
 * @returns {string}
 */
function formatUptime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return parts.join(' ');
}

/**
 * Formatiert Bytes in MB.
 * @param {number} bytes
 * @returns {string}
 */
function toMB(bytes) {
  return (bytes / 1024 / 1024).toFixed(2);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Zeigt Bot- und Systemstatistiken an.'),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const client = interaction.client;
      const memUsage = process.memoryUsage();
      const totalGuilds = client.guilds.cache.size;
      const totalUsers = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
      const totalChannels = client.channels.cache.size;
      const uptime = formatUptime(client.uptime ?? 0);
      const ping = client.ws.ping;

      // RAM
      const usedRam = toMB(memUsage.heapUsed);
      const totalRam = toMB(memUsage.heapTotal);
      const rssRam = toMB(memUsage.rss);

      // System
      const cpuModel = os.cpus()[0]?.model ?? 'Unbekannt';
      const platform = `${os.type()} (${os.arch()})`;
      const nodeVersion = process.version;
      const discordJsVersion = require('discord.js').version;

      const pingEmoji = ping < 100 ? '🟢' : ping < 200 ? '🟡' : '🔴';

      const embed = new EmbedBuilder()
        .setTitle('📊 Bot Statistiken')
        .setColor('#5865F2')
        .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .addFields(
          // Bot-Statistiken
          {
            name: '🤖 Bot',
            value: [
              `Name: \`${client.user.tag}\``,
              `ID: \`${client.user.id}\``,
              `Uptime: \`${uptime}\``,
              `${pingEmoji} Ping: \`${ping}ms\``,
            ].join('\n'),
            inline: true,
          },
          {
            name: '🌐 Reichweite',
            value: [
              `Server: \`${totalGuilds.toLocaleString('de-DE')}\``,
              `Nutzer: \`${totalUsers.toLocaleString('de-DE')}\``,
              `Kanäle: \`${totalChannels.toLocaleString('de-DE')}\``,
            ].join('\n'),
            inline: true,
          },
          {
            name: '\u200b',
            value: '\u200b',
            inline: true,
          },
          // System-Statistiken
          {
            name: '💾 Speicher (RAM)',
            value: [
              `Heap benutzt: \`${usedRam} MB\``,
              `Heap gesamt: \`${totalRam} MB\``,
              `RSS: \`${rssRam} MB\``,
            ].join('\n'),
            inline: true,
          },
          {
            name: '🖥️ System',
            value: [
              `Plattform: \`${platform}\``,
              `CPU: \`${cpuModel.slice(0, 30)}\``,
            ].join('\n'),
            inline: true,
          },
          {
            name: '⚙️ Versionen',
            value: [
              `Node.js: \`${nodeVersion}\``,
              `discord.js: \`v${discordJsVersion}\``,
            ].join('\n'),
            inline: true,
          }
        )
        .setFooter({
          text: `Angefragt von ${interaction.user.tag}`,
          iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('[stats] Fehler:', error);
      await interaction.editReply({
        content: '❌ Ein Fehler ist aufgetreten. Bitte versuche es erneut.',
      });
    }
  },
};

