const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');

// ─── MongoDB-Platzhalter ───────────────────────────────────────────────
// Importiere hier dein Suggestion-Model, z.B.:
// const Suggestion = require('../../models/Suggestion');
//
// Schema-Beispiel (Mongoose):
// {
//   guildId:     String,
//   messageId:   String,
//   channelId:   String,
//   authorId:    String,
//   content:     String,
//   status:      { type: String, enum: ['offen', 'angenommen', 'abgelehnt'], default: 'offen' },
//   upvotes:     { type: Number, default: 0 },
//   downvotes:   { type: Number, default: 0 },
//   createdAt:   { type: Date, default: Date.now },
// }
// ──────────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  offen:       { color: '#5865F2', emoji: '🔵', label: 'Offen'      },
  angenommen:  { color: '#57F287', emoji: '✅', label: 'Angenommen' },
  abgelehnt:   { color: '#ED4245', emoji: '❌', label: 'Abgelehnt'  },
};

/**
 * Baut das Suggestion-Embed.
 */
function buildSuggestionEmbed(author, content, status, upvotes, downvotes, suggestionId) {
  const cfg   = STATUS_CONFIG[status];
  const total = upvotes + downvotes;
  const upPct = total > 0 ? Math.round((upvotes / total) * 100) : 0;

  return new EmbedBuilder()
    .setTitle('💡 Neuer Vorschlag')
    .setDescription(`> ${content}`)
    .setColor(cfg.color)
    .addFields(
      {
        name: '👤 Eingereicht von',
        value: `${author} (\`${author.id}\`)`,
        inline: true,
      },
      {
        name: `${cfg.emoji} Status`,
        value: `\`${cfg.label}\``,
        inline: true,
      },
      {
        name: '📊 Abstimmung',
        value: [
          `👍 **${upvotes}** Upvotes`,
          `👎 **${downvotes}** Downvotes`,
          `📈 Zustimmung: **${upPct}%**`,
        ].join('\n'),
        inline: true,
      }
    )
    .setThumbnail(author.displayAvatarURL({ dynamic: true }))
    .setFooter({ text: `ID: ${suggestionId}` })
    .setTimestamp();
}

/**
 * Baut die Aktions-Buttons (Upvote / Downvote / Annehmen / Ablehnen).
 */
function buildButtons(suggestionId, isStaff = false) {
  const voteRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`suggest_up_${suggestionId}`)
      .setLabel('Dafür')
      .setEmoji('👍')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`suggest_down_${suggestionId}`)
      .setLabel('Dagegen')
      .setEmoji('👎')
      .setStyle(ButtonStyle.Danger),
  );

  if (!isStaff) return [voteRow];

  const staffRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`suggest_accept_${suggestionId}`)
      .setLabel('Annehmen')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`suggest_reject_${suggestionId}`)
      .setLabel('Ablehnen')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger),
  );

  return [voteRow, staffRow];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('Reiche einen Vorschlag für den Server ein.')
    .addStringOption(o =>
      o
        .setName('vorschlag')
        .setDescription('Dein Vorschlag (max. 1000 Zeichen).')
        .setRequired(true)
        .setMaxLength(1000)
    )
    .addChannelOption(o =>
      o
        .setName('kanal')
        .setDescription('Zielkanal für den Vorschlag (Standard: konfigurierbarer Suggestion-Kanal).')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const content = interaction.options.getString('vorschlag');
      const author  = interaction.member;

      // Zielkanal: Option > konfigurierten Kanal aus DB > aktuellen Kanal
      let targetChannel = interaction.options.getChannel('kanal');
      if (!targetChannel) {
        // Beispiel: const cfg = await GuildConfig.findOne({ guildId: interaction.guild.id });
        // targetChannel = interaction.guild.channels.cache.get(cfg?.suggestionChannelId) ?? interaction.channel;
        targetChannel = interaction.channel; // Platzhalter
      }

      if (!targetChannel.permissionsFor(interaction.guild.members.me).has(PermissionFlagsBits.SendMessages)) {
        return interaction.editReply({ content: `❌ Ich habe keine Schreibrechte in ${targetChannel}.` });
      }

      // Vorschlag in DB speichern (Platzhalter)
      let suggestionId = Date.now().toString(36).toUpperCase(); // Platzhalter-ID
      // const doc = await Suggestion.create({
      //   guildId:   interaction.guild.id,
      //   channelId: targetChannel.id,
      //   authorId:  author.id,
      //   content,
      // });
      // suggestionId = doc._id.toString();

      const embed   = buildSuggestionEmbed(author, content, 'offen', 0, 0, suggestionId);
      const buttons = buildButtons(suggestionId, false);

      const msg = await targetChannel.send({ embeds: [embed], components: buttons });

      // messageId in DB speichern (Platzhalter)
      // await Suggestion.findByIdAndUpdate(suggestionId, { messageId: msg.id });

      await interaction.editReply({
        content: `✅ Dein Vorschlag wurde in ${targetChannel} eingereicht! (ID: \`${suggestionId}\`)`,
      });
    } catch (error) {
      console.error('[suggest] Fehler:', error);
      await interaction.editReply({ content: '❌ Ein Fehler ist aufgetreten. Bitte versuche es erneut.' });
    }
  },

  // ── Button-Handler (in deinem interactionCreate-Event aufrufen) ─────────
  // Beispiel-Aufruf in events/interactionCreate.js:
  //
  //   if (interaction.isButton()) {
  //     const cmd = client.commands.get('suggest');
  //     if (cmd?.handleButton) await cmd.handleButton(interaction);
  //   }
  //
  async handleButton(interaction) {
    const { customId } = interaction;
    if (!customId.startsWith('suggest_')) return;

    await interaction.deferUpdate();

    try {
      const [, action, ...idParts] = customId.split('_');
      const suggestionId = idParts.join('_');

      // DB-Abfrage (Platzhalter):
      // const doc = await Suggestion.findById(suggestionId);
      // if (!doc) return interaction.followUp({ content: '❌ Vorschlag nicht gefunden.', ephemeral: true });

      const isStaff = interaction.member.permissions.has(PermissionFlagsBits.ManageMessages);

      // Nur Staff darf Annehmen/Ablehnen
      if ((action === 'accept' || action === 'reject') && !isStaff) {
        return interaction.followUp({ content: '❌ Du hast keine Berechtigung dafür.', ephemeral: true });
      }

      let upvotes   = 0; // doc.upvotes
      let downvotes = 0; // doc.downvotes
      let status    = 'offen'; // doc.status

      if (action === 'up')     { upvotes++;   /* await doc.save(); */ }
      if (action === 'down')   { downvotes++; /* await doc.save(); */ }
      if (action === 'accept') { status = 'angenommen'; /* await doc.save(); */ }
      if (action === 'reject') { status = 'abgelehnt';  /* await doc.save(); */ }

      const author  = await interaction.guild.members.fetch('AUTHOR_ID').catch(() => interaction.member);
      const embed   = buildSuggestionEmbed(author, 'VORSCHLAG_CONTENT', status, upvotes, downvotes, suggestionId);
      const buttons = buildButtons(suggestionId, isStaff);

      // Buttons bei finalen Status deaktivieren
      if (status !== 'offen') {
        buttons.forEach(row =>
          row.components.forEach(btn => btn.setDisabled(true))
        );
      }

      await interaction.message.edit({ embeds: [embed], components: buttons });
    } catch (error) {
      console.error('[suggest:button] Fehler:', error);
      await interaction.followUp({ content: '❌ Fehler beim Verarbeiten.', ephemeral: true });
    }
  },
};

