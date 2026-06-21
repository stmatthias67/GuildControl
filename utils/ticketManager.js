const {
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  AttachmentBuilder,
} = require('discord.js');

const TicketConfig = require("../models/TicketConfig");
const Ticket       = require("../models/Ticket");

// ── Vordefinierte Kategorien ─────────────────────────────────────────────────
const DEFAULT_CATEGORIES = [
  { id: "support",      label: "Support",                emoji: "🎫", description: "Allgemeiner Support" },
  { id: "report",       label: "User melden / Report",   emoji: "🚨", description: "Einen User melden" },
  { id: "partner",      label: "Partner Anfrage",        emoji: "🤝", description: "Partnerschaft anfragen" },
  { id: "management",   label: "Owner / Management",     emoji: "👑", description: "Owner / Management kontaktieren" }
];

// ── Nächste Ticket-Nummer ────────────────────────────────────────────────────
async function nextTicketNumber(guildId) {
  const cfg = await TicketConfig.findOneAndUpdate(
    { guildId },
    { $inc: { ticketCounter: 1 } },
    { new: true, upsert: true }
  );
  return cfg.ticketCounter;
}

// ── Ticket erstellen ─────────────────────────────────────────────────────────
async function createTicket(guild, user, categoryId) {
  const cfg = await TicketConfig.findOne({ guildId: guild.id });
  if (!cfg || !cfg.setupDone) return { error: "setup_missing" };

  // Max-Tickets-Check (Standard: 1, konfigurierbar)
  const maxTickets = cfg.maxTicketsPerUser ?? 1;
  const openTickets = await Ticket.find({ guildId: guild.id, userId: user.id, status: "open" });
  if (openTickets.length >= maxTickets) {
    return {
      error: "already_open",
      channelId: openTickets[0].channelId,
      count: openTickets.length,
      max: maxTickets
    };
  }

  const category = cfg.categories.find(c => c.id === categoryId);
  if (!category) return { error: "invalid_category" };

  const num    = await nextTicketNumber(guild.id);
  const padded = String(num).padStart(4, "0");
  const name   = `ticket-${user.username}-${padded}`;

  const notifyRoles = category.notifyRoleIds || [];

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
    },
    {
      id: guild.members.me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages,
      ]
    }
  ];

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

  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    permissionOverwrites: permOverwrites,
    topic: `${category.emoji} ${category.label} | ${user.tag} | Ticket #${padded}`
  });

  const ticket = await Ticket.create({
    guildId: guild.id,
    channelId: channel.id,
    userId: user.id,
    ticketNumber: num,
    category: categoryId,
    categoryLabel: category.label
  });

  // ── Willkommens-Embed im Ticket ───────────────────────────────────────────
  const ticketEmbed = new EmbedBuilder()
    .setTitle(`${category.emoji} ${category.label} – Ticket #${padded}`)
    .setDescription(
      `Hey ${user}! Willkommen in deinem Ticket.\n` +
      `Beschreibe dein Anliegen so genau wie möglich.\n` +
      `Ein Teammitglied wird sich so bald wie möglich um dich kümmern.`
    )
    .addFields(
      { name: "Erstellt von", value: `${user}`,                             inline: true },
      { name: "Kategorie",    value: `${category.emoji} ${category.label}`, inline: true },
      { name: "Ticket Nr.",   value: `#${padded}`,                          inline: true }
    )
    .setColor(0x5865f2)
    .setTimestamp();

  const ticketRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket-close-${channel.id}`)
      .setLabel("Ticket schließen")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger),
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

  await channel.send({ content: `${user}`, embeds: [ticketEmbed], components: [ticketRow] });

  // ── Claim-Nachricht in den Claim-Kanal ───────────────────────────────────
  if (cfg.claimChannelId) {
    const claimChannel = guild.channels.cache.get(cfg.claimChannelId);
    if (claimChannel) {
      const pings = notifyRoles.length
        ? notifyRoles.map(id => `<@&${id}>`).join(" ")
        : "";

      const claimEmbed = new EmbedBuilder()
        .setTitle(`📋 Neues Ticket – #${padded}`)
        .setDescription(`Ein neues Ticket wurde erstellt und wartet auf einen Bearbeiter.`)
        .addFields(
          { name: "Kategorie",    value: `${category.emoji} ${category.label}`, inline: true },
          { name: "Erstellt von", value: `${user}`,                             inline: true },
          { name: "Kanal",        value: `<#${channel.id}>`,                    inline: true }
        )
        .setColor(0x5865f2)
        .setTimestamp();

      const claimRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket-claim-${channel.id}`)
          .setLabel("Ticket übernehmen")
          .setEmoji("📌")
          .setStyle(ButtonStyle.Primary)
      );

      await claimChannel.send({
        content: pings || undefined,
        embeds: [claimEmbed],
        components: [claimRow]
      });
    }
  }

  // ── Log-Nachricht erstellen ───────────────────────────────────────────────
  if (cfg.logChannelId) {
    const logChannel = guild.channels.cache.get(cfg.logChannelId);
    if (logChannel) {
      const logEmbed = buildOpenLogEmbed(ticket, user, category, padded);
      const logMsg   = await logChannel.send({ embeds: [logEmbed] }).catch(console.error);
      if (logMsg) {
        ticket.logMessageId = logMsg.id;
        await ticket.save();
      }
    }
  }

  return { ticket, channel };
}

// ── Ticket schließen ─────────────────────────────────────────────────────────
async function closeTicket(guild, channel, closedBy) {
  const ticket = await Ticket.findOne({ channelId: channel.id, status: "open" });
  if (!ticket) return { error: "not_found" };

  ticket.status   = "closing";
  ticket.closedAt = new Date();
  await ticket.save();

  const cfg = await TicketConfig.findOne({ guildId: guild.id });

  const transcript  = await generateTranscript(channel);
  ticket.transcript = transcript;
  ticket.status     = "closed";
  await ticket.save();

  const closedByUser = await guild.client.users.fetch(closedBy).catch(() => null);
  const creator      = await guild.client.users.fetch(ticket.userId).catch(() => null);

  const helperIds = [...new Set([
    ticket.claimedBy,
    ...ticket.addedUsers
  ].filter(id => id && id !== ticket.userId))];

  const helpers = (await Promise.all(
    helperIds.map(id => guild.client.users.fetch(id).catch(() => null))
  )).filter(Boolean);

  if (cfg?.logChannelId && ticket.logMessageId) {
    const logChannel = guild.channels.cache.get(cfg.logChannelId);
    if (logChannel) {
      try {
        const logMsg = await logChannel.messages.fetch(ticket.logMessageId);
        const files  = [];
        if (transcript) {
          const padded = String(ticket.ticketNumber).padStart(4, "0");
          const buf    = Buffer.from(transcript, "utf-8");
          files.push(new AttachmentBuilder(buf, { name: `transcript-${padded}.txt` }));
        }
        const updatedEmbed = buildClosedLogEmbed(ticket, creator, closedByUser, helpers);
        await logMsg.edit({ embeds: [updatedEmbed] });
        if (files.length) {
          await logChannel.send({ reply: { messageReference: ticket.logMessageId }, files }).catch(() =>
            logChannel.send({ files })
          );
        }
      } catch (err) {
        console.error("[LOG] Konnte Log-Nachricht nicht updaten:", err);
      }
    }
  }

  if (cfg?.claimChannelId) {
    await disableClaimMessage(guild, cfg.claimChannelId, channel.id);
  }

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

// ── Ticket claimen ───────────────────────────────────────────────────────────
async function claimTicket(guild, channel, staffer) {
  const ticket = await Ticket.findOne({ channelId: channel.id, status: "open" });
  if (!ticket) return { error: "not_found" };
  if (ticket.claimedBy) return { error: "already_claimed", claimedBy: ticket.claimedBy };

  ticket.claimedBy = staffer.id;
  await ticket.save();

  await channel.permissionOverwrites.create(staffer, {
    ViewChannel:        true,
    SendMessages:       true,
    ReadMessageHistory: true,
    ManageMessages:     true,
    AttachFiles:        true
  });

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setDescription(`📌 ${staffer} hat dieses Ticket übernommen.`)
        .setColor(0xfee75c)
    ]
  });

  const cfg = await TicketConfig.findOne({ guildId: guild.id });
  if (cfg?.claimChannelId) {
    await disableClaimMessage(guild, cfg.claimChannelId, channel.id, staffer);
  }

  return { success: true };
}

// ── User hinzufügen ──────────────────────────────────────────────────────────
async function addUserToTicket(guild, channel, targetUser) {
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

  return { success: true };
}

// ── Claim-Button deaktivieren ─────────────────────────────────────────────────
async function disableClaimMessage(guild, claimChannelId, ticketChannelId, claimer = null) {
  try {
    const claimChannel = guild.channels.cache.get(claimChannelId);
    if (!claimChannel) return;

    const messages = await claimChannel.messages.fetch({ limit: 50 });
    const claimMsg = messages.find(m =>
      m.components?.some(row =>
        row.components?.some(btn => btn.customId === `ticket-claim-${ticketChannelId}`)
      )
    );
    if (!claimMsg) return;

    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket-claim-${ticketChannelId}`)
        .setLabel(claimer ? `Übernommen von ${claimer.username}` : "Ticket geschlossen")
        .setEmoji(claimer ? "✅" : "🔒")
        .setStyle(claimer ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(true)
    );
    await claimMsg.edit({ components: [disabledRow] });
  } catch (err) {
    console.error("[CLAIM] disableClaimMessage error:", err);
  }
}

// ── Log-Embeds ────────────────────────────────────────────────────────────────
function buildOpenLogEmbed(ticket, user, category, padded) {
  return new EmbedBuilder()
    .setTitle(`🎫 Ticket #${padded} – ${category.emoji} ${category.label}`)
    .setDescription("📂 Ticket ist geöffnet.")
    .addFields(
      { name: "Erstellt von", value: `<@${user.id}>`, inline: true },
      { name: "Kategorie",    value: `${category.emoji} ${category.label}`, inline: true },
      { name: "Status",       value: "🟢 Offen", inline: true }
    )
    .setColor(0x5865f2)
    .setTimestamp()
    .setFooter({ text: `Ticket #${padded}` });
}

function buildClosedLogEmbed(ticket, creator, closedByUser, helpers) {
  const padded = String(ticket.ticketNumber).padStart(4, "0");

  const helperText = helpers.length
    ? helpers.map(h => `<@${h.id}>`).join(", ")
    : "*Niemand hat das Ticket übernommen*";

  const closedAt  = ticket.closedAt  ? `<t:${Math.floor(ticket.closedAt.getTime()  / 1000)}:f>` : "*Unbekannt*";
  const createdAt = ticket.createdAt ? `<t:${Math.floor(ticket.createdAt.getTime() / 1000)}:f>` : "*Unbekannt*";

  return new EmbedBuilder()
    .setTitle(`🔒 Ticket #${padded} – ${ticket.categoryLabel}`)
    .setDescription("📁 Ticket wurde geschlossen.")
    .addFields(
      { name: "Ersteller",       value: creator       ? `<@${creator.id}>`       : "*Unbekannt*", inline: true },
      { name: "Geschlossen von", value: closedByUser  ? `<@${closedByUser.id}>`  : "*Unbekannt*", inline: true },
      { name: "Helfer / Team",   value: helperText, inline: false },
      { name: "Erstellt",        value: createdAt, inline: true },
      { name: "Geschlossen",     value: closedAt,  inline: true },
      { name: "Transcript",      value: "📄 Siehe Anhang", inline: false }
    )
    .setColor(0xed4245)
    .setTimestamp()
    .setFooter({ text: `Ticket #${padded}` });
}

// ── Transcript generieren ────────────────────────────────────────────────────
async function generateTranscript(channel) {
  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages) return "(Keine Nachrichten geladen)";

  const lines = [...messages.values()]
    .reverse()
    .map(m => {
      const time = m.createdAt.toISOString().replace("T", " ").slice(0, 19);
      const tag  = m.author?.tag ?? "Unbekannt";
      const text = m.content || (m.embeds.length ? "[Embed]" : "");
      return `[${time}] ${tag}: ${text}`;
    });

  return lines.join("\n");
}

// ── Exports ───────────────────────────────────────────────────────────────────
module.exports = {
  DEFAULT_CATEGORIES,
  createTicketV2:    createTicket,
  closeTicketV2:     closeTicket,
  claimTicketV2:     claimTicket,
  addUserToTicketV2: addUserToTicket,
  generateTranscript,
  nextTicketNumber
};