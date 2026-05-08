const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');

const HEX_REGEX = /^#([0-9A-Fa-f]{6})$/;

/**
 * Prüft ob ein String eine gültige HEX-Farbe ist.
 * @param {string} str
 * @returns {boolean}
 */
function isValidHex(str) {
  return HEX_REGEX.test(str);
}

/**
 * Prüft ob ein String eine gültige URL ist.
 * @param {string} str
 * @returns {boolean}
 */
function isValidUrl(str) {
  try {
    const url = new URL(str);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Erstellt ein vollständig angepasstes Embed.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(sub =>
      sub
        .setName('erstellen')
        .setDescription('Öffnet einen Editor zum Erstellen eines Embeds.')
        .addChannelOption(o =>
          o.setName('kanal').setDescription('Zielkanal (Standard: aktueller Kanal).').setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('schnell')
        .setDescription('Erstellt ein einfaches Embed direkt per Optionen.')
        .addStringOption(o =>
          o.setName('titel').setDescription('Titel des Embeds.').setRequired(true).setMaxLength(256)
        )
        .addStringOption(o =>
          o.setName('beschreibung').setDescription('Beschreibung des Embeds.').setRequired(true).setMaxLength(4096)
        )
        .addStringOption(o =>
          o.setName('farbe').setDescription('HEX-Farbe (z.B. #5865F2). Standard: #5865F2.').setRequired(false)
        )
        .addStringOption(o =>
          o.setName('bild').setDescription('Bild-URL (https://).').setRequired(false)
        )
        .addStringOption(o =>
          o.setName('thumbnail').setDescription('Thumbnail-URL (https://).').setRequired(false)
        )
        .addStringOption(o =>
          o.setName('footer').setDescription('Footer-Text.').setRequired(false).setMaxLength(2048)
        )
        .addBooleanOption(o =>
          o.setName('timestamp').setDescription('Zeitstempel anzeigen?').setRequired(false)
        )
        .addChannelOption(o =>
          o.setName('kanal').setDescription('Zielkanal (Standard: aktueller Kanal).').setRequired(false)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'schnell') {
      await interaction.deferReply({ ephemeral: true });
      await handleSchnell(interaction);
    } else if (sub === 'erstellen') {
      await handleModal(interaction);
    }
  },

  // ── Modal-Handler (in interactionCreate aufrufen) ─────────────────────
  // if (interaction.isModalSubmit() && interaction.customId.startsWith('embed_modal_')) {
  //   const cmd = client.commands.get('embed');
  //   if (cmd?.handleModal) await cmd.handleModal(interaction);
  // }
  async handleModal(interaction) {
    try {
      const targetChannel = interaction.options.getChannel('kanal') ?? interaction.channel;

      const modal = new ModalBuilder()
        .setCustomId(`embed_modal_${interaction.id}_${targetChannel.id}`)
        .setTitle('📝 Embed erstellen');

      const titleInput = new TextInputBuilder()
        .setCustomId('embed_title')
        .setLabel('Titel')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(256)
        .setPlaceholder('Mein tolles Embed');

      const descInput = new TextInputBuilder()
        .setCustomId('embed_description')
        .setLabel('Beschreibung (Markdown erlaubt)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(4000)
        .setPlaceholder('**Fett**, *kursiv*, `code`, > Zitat ...');

      const colorInput = new TextInputBuilder()
        .setCustomId('embed_color')
        .setLabel('Farbe (HEX, z.B. #FF5733)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(7)
        .setPlaceholder('#5865F2');

      const imageInput = new TextInputBuilder()
        .setCustomId('embed_image')
        .setLabel('Bild-URL (optional, https://...)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(512)
        .setPlaceholder('https://example.com/image.png');

      const footerInput = new TextInputBuilder()
        .setCustomId('embed_footer')
        .setLabel('Footer-Text (optional)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(2048)
        .setPlaceholder('Dein Footer-Text');

      modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(descInput),
        new ActionRowBuilder().addComponents(colorInput),
        new ActionRowBuilder().addComponents(imageInput),
        new ActionRowBuilder().addComponents(footerInput),
      );

      await interaction.showModal(modal);
    } catch (error) {
      console.error('[embed:modal] Fehler:', error);
      if (!interaction.replied) {
        await interaction.reply({ content: '❌ Modal konnte nicht geöffnet werden.', ephemeral: true });
      }
    }
  },

  async onModalSubmit(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const [, , , channelId] = interaction.customId.split('_');
      const targetChannel = interaction.guild.channels.cache.get(channelId) ?? interaction.channel;

      if (!targetChannel.permissionsFor(interaction.guild.members.me).has(PermissionFlagsBits.SendMessages)) {
        return interaction.editReply({ content: `❌ Keine Schreibrechte in ${targetChannel}.` });
      }

      const title       = interaction.fields.getTextInputValue('embed_title');
      const description = interaction.fields.getTextInputValue('embed_description');
      const rawColor    = interaction.fields.getTextInputValue('embed_color')?.trim() || '#5865F2';
      const imageUrl    = interaction.fields.getTextInputValue('embed_image')?.trim() || null;
      const footerText  = interaction.fields.getTextInputValue('embed_footer')?.trim() || null;

      const errors = [];
      if (rawColor && !isValidHex(rawColor)) errors.push('• Ungültige HEX-Farbe (Format: `#RRGGBB`).');
      if (imageUrl && !isValidUrl(imageUrl)) errors.push('• Ungültige Bild-URL (muss mit `https://` beginnen).');

      if (errors.length > 0) {
        return interaction.editReply({ content: `❌ Fehler:\n${errors.join('\n')}` });
      }

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(rawColor || '#5865F2')
        .setTimestamp();

      if (imageUrl)    embed.setImage(imageUrl);
      if (footerText)  embed.setFooter({ text: footerText });

      await targetChannel.send({ embeds: [embed] });

      await interaction.editReply({ content: `✅ Embed wurde in ${targetChannel} gesendet!` });
    } catch (error) {
      console.error('[embed:modalSubmit] Fehler:', error);
      await interaction.editReply({ content: '❌ Ein Fehler ist aufgetreten.' });
    }
  },
};

// ── Schnell-Subcommand (interne Hilfsfunktion) ────────────────────────────
async function handleSchnell(interaction) {
  try {
    const title       = interaction.options.getString('titel');
    const description = interaction.options.getString('beschreibung');
    const rawColor    = interaction.options.getString('farbe')?.trim() ?? '#5865F2';
    const imageUrl    = interaction.options.getString('bild')?.trim() ?? null;
    const thumbUrl    = interaction.options.getString('thumbnail')?.trim() ?? null;
    const footerText  = interaction.options.getString('footer')?.trim() ?? null;
    const withTs      = interaction.options.getBoolean('timestamp') ?? true;
    const targetChannel = interaction.options.getChannel('kanal') ?? interaction.channel;

    // Validierungen
    const errors = [];
    if (!isValidHex(rawColor)) errors.push(`• Ungültige Farbe: \`${rawColor}\` (Format: \`#RRGGBB\`).`);
    if (imageUrl && !isValidUrl(imageUrl)) errors.push('• Ungültige Bild-URL.');
    if (thumbUrl && !isValidUrl(thumbUrl)) errors.push('• Ungültige Thumbnail-URL.');

    if (errors.length > 0) {
      return interaction.editReply({ content: `❌ Eingabefehler:\n${errors.join('\n')}` });
    }

    if (!targetChannel.permissionsFor(interaction.guild.members.me).has(PermissionFlagsBits.SendMessages)) {
      return interaction.editReply({ content: `❌ Keine Schreibrechte in ${targetChannel}.` });
    }

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(rawColor);

    if (imageUrl)   embed.setImage(imageUrl);
    if (thumbUrl)   embed.setThumbnail(thumbUrl);
    if (footerText) embed.setFooter({ text: footerText });
    if (withTs)     embed.setTimestamp();

    await targetChannel.send({ embeds: [embed] });

    await interaction.editReply({ content: `✅ Embed wurde in ${targetChannel} gesendet!` });
  } catch (error) {
    console.error('[embed:schnell] Fehler:', error);
    await interaction.editReply({ content: '❌ Ein Fehler ist aufgetreten. Bitte versuche es erneut.' });
  }
}

