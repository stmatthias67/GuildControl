const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');
const mongoose = require('mongoose');
const Suggestion = require('../models/Suggestion');
const { logCatch } = require('../utils/errorLogger');

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

      // shortcut: Kein konfigurierbarer Suggestion-Kanal (kommt mit den Web-Einstellungen), Standard = aktueller Kanal.
      const targetChannel = interaction.options.getChannel('kanal') ?? interaction.channel;

      if (!targetChannel.isTextBased?.()) {
        return interaction.editReply({ content: '❌ Bitte wähle einen Textkanal.' });
      }
      // Auch der Nutzer muss dort schreiben dürfen, sonst postet der Bot stellvertretend in gesperrte Kanäle.
      if (!targetChannel.permissionsFor(author).has(PermissionFlagsBits.SendMessages)) {
        return interaction.editReply({ content: `❌ Du darfst in ${targetChannel} nicht schreiben.` });
      }
      if (!targetChannel.permissionsFor(interaction.guild.members.me).has(PermissionFlagsBits.SendMessages)) {
        return interaction.editReply({ content: `❌ Ich habe keine Schreibrechte in ${targetChannel}.` });
      }

      // Erst speichern (die DB-ID steckt in den Button-IDs), dann posten.
      const doc = await Suggestion.create({
        guildId:   interaction.guild.id,
        channelId: targetChannel.id,
        authorId:  author.id,
        content,
      });
      const suggestionId = doc._id.toString();

      let msg;
      try {
        msg = await targetChannel.send({
          embeds: [buildSuggestionEmbed(author, content, 'offen', 0, 0, suggestionId)],
          components: buildButtons(suggestionId, true),
        });
      } catch (error) {
        await doc.deleteOne().catch(logCatch('suggest.rollback'));
        throw error;
      }
      doc.messageId = msg.id;
      await doc.save();

      await interaction.editReply({
        content: `✅ Dein Vorschlag wurde in ${targetChannel} eingereicht! (ID: \`${suggestionId}\`)`,
      });
    } catch (error) {
      console.error('[suggest] Fehler:', error);
      await interaction.editReply({ content: '❌ Ein Fehler ist aufgetreten. Bitte versuche es erneut.' })
        .catch(logCatch('suggest.errorReply'));
    }
  },

  // Aufruf über interactions/router.js für customId "suggest_<up|down|accept|reject>_<suggestionId>".
  async handleButton(interaction) {
    await interaction.deferUpdate();

    try {
      const [, action, suggestionId] = interaction.customId.split('_');
      const userId = interaction.user.id;

      const UPDATES = {
        up:     { $addToSet: { upvoters: userId },   $pull: { downvoters: userId } },
        down:   { $addToSet: { downvoters: userId }, $pull: { upvoters: userId } },
        accept: { status: 'angenommen', decidedBy: userId },
        reject: { status: 'abgelehnt',  decidedBy: userId },
      };
      const update = UPDATES[action];
      if (!update || !mongoose.isValidObjectId(suggestionId)) {
        return interaction.followUp({ content: '❌ Unbekannte Aktion.', ephemeral: true });
      }

      // Nur Staff darf Annehmen/Ablehnen
      if ((action === 'accept' || action === 'reject')
          && !interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.followUp({ content: '❌ Du hast keine Berechtigung dafür.', ephemeral: true });
      }

      // Atomar und nur solange offen: verhindert Doppelstimmen und Abstimmen nach der Entscheidung.
      const doc = await Suggestion.findOneAndUpdate(
        { _id: suggestionId, guildId: interaction.guild.id, status: 'offen' },
        update,
        { new: true },
      );
      if (!doc) {
        return interaction.followUp({ content: '❌ Vorschlag nicht gefunden oder bereits entschieden.', ephemeral: true });
      }

      const author  = await interaction.client.users.fetch(doc.authorId);
      const embed   = buildSuggestionEmbed(author, doc.content, doc.status, doc.upvoters.length, doc.downvoters.length, suggestionId);
      const buttons = buildButtons(suggestionId, true);

      // Buttons bei finalen Status deaktivieren
      if (doc.status !== 'offen') {
        buttons.forEach(row =>
          row.components.forEach(btn => btn.setDisabled(true))
        );
      }

      await interaction.message.edit({ embeds: [embed], components: buttons });
    } catch (error) {
      console.error('[suggest:button] Fehler:', error);
      await interaction.followUp({ content: '❌ Fehler beim Verarbeiten.', ephemeral: true })
        .catch(logCatch('suggest.button.errorReply'));
    }
  },
};

