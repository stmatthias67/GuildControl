const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const EMOJI_MAP = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

const DURATION_MAP = {
  '5m':  5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h':  60 * 60 * 1000,
  '6h':  6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Erstellt eine Umfrage mit bis zu 10 Optionen.')
    .addStringOption(o =>
      o.setName('frage').setDescription('Die Frage der Umfrage.').setRequired(true).setMaxLength(256)
    )
    .addStringOption(o =>
      o.setName('optionen')
        .setDescription('Optionen, getrennt durch | (z.B. Ja | Nein | Vielleicht). Min. 2, Max. 10.')
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('dauer')
        .setDescription('Wie lange läuft die Umfrage?')
        .setRequired(false)
        .addChoices(
          { name: '5 Minuten',  value: '5m'  },
          { name: '15 Minuten', value: '15m' },
          { name: '30 Minuten', value: '30m' },
          { name: '1 Stunde',   value: '1h'  },
          { name: '6 Stunden',  value: '6h'  },
          { name: '12 Stunden', value: '12h' },
          { name: '24 Stunden', value: '24h' },
        )
    )
    .addChannelOption(o =>
      o.setName('kanal')
        .setDescription('Zielkanal (Standard: aktueller Kanal).')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const question    = interaction.options.getString('frage');
      const rawOptions  = interaction.options.getString('optionen');
      const durationKey = interaction.options.getString('dauer') ?? null;
      const targetChannel = interaction.options.getChannel('kanal') ?? interaction.channel;

      // Optionen parsen & validieren
      const options = rawOptions.split('|').map(o => o.trim()).filter(o => o.length > 0);

      if (options.length < 2) {
        return interaction.editReply({ content: '❌ Bitte gib mindestens **2 Optionen** an, getrennt durch `|`.' });
      }
      if (options.length > 10) {
        return interaction.editReply({ content: '❌ Maximal **10 Optionen** sind erlaubt.' });
      }

      // Schreibrechte prüfen
      if (!targetChannel.permissionsFor(interaction.guild.members.me).has(PermissionFlagsBits.SendMessages)) {
        return interaction.editReply({ content: `❌ Ich habe keine Schreibrechte in ${targetChannel}.` });
      }

      const endsAt   = durationKey ? Date.now() + DURATION_MAP[durationKey] : null;
      const endsText = endsAt ? `\n⏱️ Endet: <t:${Math.floor(endsAt / 1000)}:R>` : '';

      const optionLines = options.map((opt, i) => `${EMOJI_MAP[i]} **${opt}**`).join('\n');

      const embed = new EmbedBuilder()
        .setTitle(`📊 ${question}`)
        .setDescription(`${optionLines}${endsText}`)
        .setColor('#5865F2')
        .setFooter({
          text: `Umfrage von ${interaction.user.tag}`,
          iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
        })
        .setTimestamp();

      const pollMessage = await targetChannel.send({ embeds: [embed] });

      // Reactions hinzufügen (sequenziell, um Rate Limits zu vermeiden)
      for (let i = 0; i < options.length; i++) {
        await pollMessage.react(EMOJI_MAP[i]);
      }

      // Automatisches Auswerten nach Ablauf
      if (endsAt) {
        const delay = endsAt - Date.now();
        setTimeout(async () => {
          try {
            const fetched = await targetChannel.messages.fetch(pollMessage.id).catch(() => null);
            if (!fetched) return;

            const results = options.map((opt, i) => {
              const reaction = fetched.reactions.cache.get(EMOJI_MAP[i]);
              const count    = (reaction?.count ?? 1) - 1; // Bot-Reaction abziehen
              return { label: opt, emoji: EMOJI_MAP[i], count };
            });

            const total     = results.reduce((sum, r) => sum + r.count, 0);
            const winner    = results.reduce((a, b) => (b.count > a.count ? b : a));
            const maxBar    = 20;

            const resultLines = results.map(r => {
              const pct   = total > 0 ? Math.round((r.count / total) * 100) : 0;
              const bars  = Math.round((pct / 100) * maxBar);
              const bar   = '█'.repeat(bars) + '░'.repeat(maxBar - bars);
              return `${r.emoji} **${r.label}**\n\`${bar}\` ${pct}% (${r.count} Stimmen)`;
            }).join('\n\n');

            const resultEmbed = new EmbedBuilder()
              .setTitle(`📊 Ergebnis: ${question}`)
              .setDescription(
                total === 0
                  ? '😔 Niemand hat abgestimmt.'
                  : `${resultLines}\n\n🏆 Gewinner: **${winner.label}** mit **${winner.count}** Stimme(n)`
              )
              .setColor('#57F287')
              .setFooter({ text: `${total} Stimmen gesamt` })
              .setTimestamp();

            await fetched.edit({ embeds: [resultEmbed] });
          } catch (err) {
            console.error('[poll] Auswertungs-Fehler:', err);
          }
        }, delay);
      }

      await interaction.editReply({
        content: `✅ Umfrage wurde in ${targetChannel} gepostet!${endsAt ? ` Sie endet <t:${Math.floor(endsAt / 1000)}:R>.` : ''}`,
      });
    } catch (error) {
      console.error('[poll] Fehler:', error);
      await interaction.editReply({ content: '❌ Ein Fehler ist aufgetreten. Bitte versuche es erneut.' });
    }
  },
};

