const {
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} = require('discord.js');

/**
 * Erstellt einen neuen Ticket-Channel für den User.
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {string} staffRoleId
 */
async function createTicket(interaction, staffRoleId) {
  const { guild, user } = interaction;

  // Prüfen ob User bereits ein offenes Ticket hat
  const existingChannel = guild.channels.cache.find(
    ch => ch.name === `ticket-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}` && ch.topic?.includes(user.id)
  );

  if (existingChannel) {
    return interaction.reply({
      content: `❌ Du hast bereits ein offenes Ticket: ${existingChannel}`,
      ephemeral: true,
    });
  }

  const staffRole = guild.roles.cache.get(staffRoleId);
  if (!staffRole) {
    return interaction.reply({
      content: '❌ Die konfigurierte Staff-Rolle wurde nicht gefunden.',
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    // Sicherer Channel-Name (nur lowercase alphanumeric)
    const safeName = user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || user.id;
    const channelName = `ticket-${safeName}`;

    // Ticket-Channel mit Permissions erstellen
    const ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      topic: `Ticket von ${user.tag} | UserID: ${user.id}`,
      permissionOverwrites: [
        {
          // @everyone: kein Zugriff
          id: guild.roles.everyone,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          // Ticket-Ersteller: Lesen & Schreiben
          id: user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
          ],
        },
        {
          // Staff-Rolle: Voller Zugriff
          id: staffRole.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ManageMessages,
          ],
        },
        {
          // Bot selbst: immer Zugriff
          id: guild.members.me.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels,
          ],
        },
      ],
    });

    // Begrüßungsnachricht im Ticket
    const welcomeEmbed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('🎫 Ticket geöffnet')
      .setDescription(
        `Willkommen ${user}, **dein Ticket wurde erstellt!**\n\n` +
        '📝 Bitte schildere dein Anliegen so detailliert wie möglich.\n' +
        '👥 Unser Team wird sich so schnell wie möglich bei dir melden.\n\n' +
        '> Zum Schließen des Tickets klicke auf **🔒 Ticket schließen**.'
      )
      .addFields(
        { name: '👤 Ersteller', value: `${user.tag}`, inline: true },
        { name: '📅 Erstellt am', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
      )
      .setThumbnail(user.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: guild.name, iconURL: guild.iconURL() });

    const controlRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_close:${user.id}`)
        .setLabel('Ticket schließen')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`ticket_claim:${user.id}`)
        .setLabel('Ticket claimen')
        .setEmoji('✋')
        .setStyle(ButtonStyle.Secondary)
    );

    await ticketChannel.send({
      content: `${user} | ${staffRole}`,
      embeds: [welcomeEmbed],
      components: [controlRow],
    });

    await interaction.editReply({
      content: `✅ Dein Ticket wurde erstellt: ${ticketChannel}`,
    });

  } catch (error) {
    console.error('[TICKET] Fehler beim Erstellen:', error);
    await interaction.editReply({
      content: '❌ Beim Erstellen des Tickets ist ein Fehler aufgetreten.',
    });
  }
}

/**
 * Schließt ein Ticket (löscht den Channel nach Bestätigung).
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {string} ticketOwnerId
 */
async function closeTicket(interaction, ticketOwnerId) {
  const confirmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_confirm_close:${ticketOwnerId}`)
      .setLabel('Ja, schließen')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('ticket_cancel_close')
      .setLabel('Abbrechen')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Secondary)
  );

  const embed = new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle('🔒 Ticket schließen?')
    .setDescription('Bist du sicher, dass du dieses Ticket schließen möchtest?\nDer Channel wird nach 5 Sekunden gelöscht.');

  await interaction.reply({ embeds: [embed], components: [confirmRow] });
}

/**
 * Bestätigt das Schließen und löscht den Channel.
 * @param {import('discord.js').ButtonInteraction} interaction
 */
async function confirmClose(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle('🔒 Ticket wird geschlossen...')
    .setDescription(`Geschlossen von **${interaction.user.tag}**.\nDieser Channel wird in 5 Sekunden gelöscht.`);

  await interaction.update({ embeds: [embed], components: [] });

  setTimeout(async () => {
    await interaction.channel.delete().catch(err =>
      console.error('[TICKET] Fehler beim Löschen des Channels:', err)
    );
  }, 5000);
}

/**
 * Claimed ein Ticket für einen Staff-Member.
 * @param {import('discord.js').ButtonInteraction} interaction
 */
async function claimTicket(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setDescription(`✋ **${interaction.user.tag}** hat dieses Ticket übernommen.`);

  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_close_claimed')
      .setLabel('Ticket schließen')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('ticket_claimed_disabled')
      .setLabel(`Geclaimed von ${interaction.user.username}`)
      .setEmoji('✋')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );

  await interaction.update({ components: [disabledRow] });
  await interaction.channel.send({ embeds: [embed] });
}

module.exports = { createTicket, closeTicket, confirmClose, claimTicket };
