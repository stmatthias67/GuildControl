const {
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} = require('discord.js');

const TicketConfig = require("../models/TicketConfig");
const Ticket       = require("../models/Ticket");

// ── Vordefinierte Kategorien ─────────────────────────────────────────────────
const DEFAULT_CATEGORIES = [
  { id: "support",      label: "Support",                emoji: "🎫", description: "Allgemeiner Support" },
  { id: "report",       label: "User melden / Report",   emoji: "🚨", description: "Einen User melden" },
  { id: "partner",      label: "Partner Anfrage",        emoji: "🤝", description: "Partnerschaft anfragen" },
  { id: "application",  label: "Bewerbung (Staff/Team)", emoji: "📋", description: "Dich beim Team bewerben" },
  { id: "management",   label: "Owner / Management",     emoji: "👑", description: "Owner / Management kontaktieren" }
];

// ═════════════════════════════════════════════════════════════════════════════
// NEUES SYSTEM (mit Datenbank & Kategorien)
// ═════════════════════════════════════════════════════════════════════════════

// ── Nächste Ticket-Nummer ────────────────────────────────────────────────────
async function nextTicketNumber(guildId) {
  const cfg = await TicketConfig.findOneAndUpdate(
    { guildId },
    { $inc: { ticketCounter: 1 } },
    { new: true, upsert: true }
  );
  return cfg.ticketCounter;
}

// ── Ticket erstellen (neues System) ─────────────────────────────────────────
async function createTicketV2(guild, user, categoryId) {
  const cfg = await TicketConfig.findOne({ guildId: guild.id });
  if (!cfg || !cfg.setupDone) return { error: "setup_missing" };

  // Cooldown: max. 1 offenes Ticket pro User
  const existing = await Ticket.findOne({ guildId: guild.id, userId: user.id, status: "open" });
  if (existing) return { error: "already_open", channelId: existing.channelId };

  const category = cfg.categories.find(c => c.id === categoryId);
  if (!category) return { error: "invalid_category" };

  const num    = await nextTicketNumber(guild.id);
  const padded = String(num).padStart(4, "0");
  const name   = `ticket-${user.username}-${padded}`;

  // Permissions aufbauen
  const permOverwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles
      ]
    }
  ];

  // Support Rollen
  // Kategorie Rollen benutzen
  const notifyRoles = category.notifyRoleIds || [];

  for (const roleId of notifyRoles) {
    permOverwrites.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.AttachFiles
      ]
    });
  }
    permOverwrites.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.AttachFiles
      ]
    });
  }

  // Admin Rollen
// Kategorie Rollen benutzen
  const notifyRoles = category.notifyRoleIds || [];

  for (const roleId of notifyRoles) {
    permOverwrites.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.AttachFiles
      ]
    });
  }
    permOverwrites.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.AttachFiles
      ]
    });
  }

  // Bot selbst
  permOverwrites.push({
    id: guild.members.me.id,
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.ManageChannels,
    ],
  });

  // Kanal erstellen
  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    permissionOverwrites: permOverwrites,
    topic: `${category.emoji} ${category.label} | ${user.tag} | Ticket #${padded}`
  });

  // DB-Eintrag
  const ticket = await Ticket.create({
    guildId: guild.id,
    channelId: channel.id,
    userId: user.id,
    ticketNumber: num,
    category: categoryId,
    categoryLabel: category.label
  });

  // Willkommens-Embed senden
  const embed = new EmbedBuilder()
    .setTitle(`${category.emoji} ${category.label} – Ticket #${padded}`)
    .setDescription(
      `Hey ${user}! Willkommen in deinem Ticket.\n` +
      `Beschreibe dein Anliegen so genau wie möglich.\n` +
      `Ein Teammitglied wird sich so bald wie möglich um dich kümmern.`
    )
    .addFields(
      { name: "Erstellt von", value: `${user}`, inline: true },
      { name: "Kategorie",    value: `${category.emoji} ${category.label}`, inline: true },
      { name: "Ticket Nr.",   value: `#${padded}`, inline: true }
    )
    .setColor(0x5865f2)
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket-close-${channel.id}`)
      .setLabel("Ticket schließen")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`ticket-claim-${channel.id}`)
      .setLabel("Ticket claimen")
      .setEmoji("📌")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`ticket-adduser-${channel.id}`)
      .setLabel("User hinzufügen")
      .setEmoji("👥")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`ticket-escalate-${channel.id}`)
      .setLabel("Higher Staff")
      .setEmoji("🚨")
      .setStyle(ButtonStyle.Secondary)
  );

  await channel.send({ content: `${user}`, embeds: [embed], components: [row] });

  // Log senden
  await sendTicketLog(guild, cfg, "created", { ticket, user, category });

  return { ticket, channel };
}

// ── Ticket schließen (neues System) ─────────────────────────────────────────
async function closeTicketV2(guild, channel, closedBy) {
  const ticket = await Ticket.findOne({ channelId: channel.id, status: "open" });
  if (!ticket) return { error: "not_found" };

  ticket.status   = "closing";
  ticket.closedAt = new Date();
  await ticket.save();

  const cfg = await TicketConfig.findOne({ guildId: guild.id });

  // Transcript generieren
  const transcript = await generateTranscript(channel);
  ticket.transcript = transcript;
  ticket.status     = "closed";
  await ticket.save();

  // Log senden
  const closedByUser = await guild.client.users.fetch(closedBy).catch(() => null);
  const creator      = await guild.client.users.fetch(ticket.userId).catch(() => null);
  await sendTicketLog(guild, cfg, "closed", { ticket, user: creator, closedBy: closedByUser, transcript });

  // Channel nach kurzer Verzögerung löschen
  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setDescription("✅ Ticket wird in 5 Sekunden gelöscht. Transcript wurde im Log-Kanal gespeichert.")
        .setColor(0x57f287)
    ]
  });

  setTimeout(async () => {
    await channel.delete("Ticket geschlossen").catch(() => null);
  }, 5000);

  return { success: true };
}

// ── Ticket claimen (neues System) ───────────────────────────────────────────
async function claimTicketV2(guild, channel, staffer) {
  const ticket = await Ticket.findOne({ channelId: channel.id, status: "open" });
  if (!ticket) return { error: "not_found" };
  if (ticket.claimedBy) return { error: "already_claimed", claimedBy: ticket.claimedBy };

  ticket.claimedBy = staffer.id;
  await ticket.save();

  const cfg = await TicketConfig.findOne({ guildId: guild.id });
  await sendTicketLog(guild, cfg, "claimed", { ticket, user: staffer });

  return { success: true };
}

// ── User hinzufügen (neues System) ──────────────────────────────────────────
async function addUserToTicketV2(guild, channel, targetUser) {
  const ticket = await Ticket.findOne({ channelId: channel.id, status: "open" });
  if (!ticket) return { error: "not_found" };

  if (ticket.addedUsers.includes(targetUser.id)) return { error: "already_added" };

  ticket.addedUsers.push(targetUser.id);
  await ticket.save();

  await channel.permissionOverwrites.create(targetUser, {
    ViewChannel:        true,
    SendMessages:       true,
    ReadMessageHistory: true,
    AttachFiles:        true
  });

  const cfg = await TicketConfig.findOne({ guildId: guild.id });
  await sendTicketLog(guild, cfg, "user_added", { ticket, user: targetUser });

  return { success: true };
}

// ── Transcript generieren ────────────────────────────────────────────────────
async function generateTranscript(channel) {
  const messages = await channel.messages
    .fetch({ limit: 100 })
    .catch(() => null);

  if (!messages) return "(Keine Nachrichten geladen)";

  const lines = [...messages.values()]
    .reverse()
    .map(m => {
      const time  = m.createdAt.toISOString().replace("T", " ").slice(0, 19);
      const tag   = m.author?.tag ?? "Unbekannt";
      const text  = m.content || (m.embeds.length ? "[Embed]" : "");
      return `[${time}] ${tag}: ${text}`;
    });

  return lines.join("\n");
}

// ── Log senden ───────────────────────────────────────────────────────────────
async function sendTicketLog(guild, cfg, action, data) {
  if (!cfg?.logChannelId) return;

  const logChannel = guild.channels.cache.get(cfg.logChannelId);
  if (!logChannel) return;

  const { ticket, user, closedBy, transcript } = data;
  const padded = String(ticket.ticketNumber).padStart(4, "0");

  const colors = { created: 0x5865f2, closed: 0xed4245, claimed: 0xfee75c, user_added: 0x57f287 };
  const titles = {
    created:    `🎫 Ticket #${padded} erstellt`,
    closed:     `🔒 Ticket #${padded} geschlossen`,
    claimed:    `📌 Ticket #${padded} geclaimt`,
    user_added: `👥 User zu Ticket #${padded} hinzugefügt`
  };

  const embed = new EmbedBuilder()
    .setTitle(titles[action] ?? `Ticket #${padded} – ${action}`)
    .setColor(colors[action] ?? 0x99aab5)
    .setTimestamp()
    .addFields(
      { name: "Kategorie",   value: ticket.categoryLabel, inline: true },
      { name: "Ticket Nr.",  value: `#${padded}`,          inline: true }
    );

  if (user)      embed.addFields({ name: "User",      value: `<@${user.id}>`,      inline: true });
  if (closedBy)  embed.addFields({ name: "Geschlossen von", value: `<@${closedBy.id}>`, inline: true });

  const files = [];

  if (action === "closed" && transcript) {
    const { AttachmentBuilder } = require("discord.js");
    const buf = Buffer.from(transcript, "utf-8");
    files.push(new AttachmentBuilder(buf, { name: `transcript-${padded}.txt` }));
    embed.addFields({ name: "Transcript", value: "📄 Siehe Anhang", inline: false });
  }

  await logChannel.send({ embeds: [embed], files }).catch(console.error);
}

// ═════════════════════════════════════════════════════════════════════════════
// ALTES SYSTEM (einfaches Ticket ohne Datenbank - für Kompatibilität)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Erstellt einen neuen Ticket-Channel für den User (ALTES SYSTEM).
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
          id: guild.roles.everyone,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
          ],
        },
        {
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
 * Schließt ein Ticket (löscht den Channel nach Bestätigung) - ALTES SYSTEM.
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
 * Bestätigt das Schließen und löscht den Channel - ALTES SYSTEM.
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
 * Claimed ein Ticket für einen Staff-Member - ALTES SYSTEM.
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

// ═════════════════════════════════════════════════════════════════════════════
// EXPORTS - beide Systeme verfügbar machen
// ═════════════════════════════════════════════════════════════════════════════
module.exports = {
  // Neues System (mit Datenbank)
  DEFAULT_CATEGORIES,
  createTicketV2,
  closeTicketV2,
  claimTicketV2,
  addUserToTicketV2,
  generateTranscript,
  sendTicketLog,
  nextTicketNumber,
  
  // Altes System (einfach, für bestehende Funktionalität)
  createTicket,
  closeTicket,
  confirmClose,
  claimTicket,
};