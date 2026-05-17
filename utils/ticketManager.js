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
  { id: "application",  label: "Bewerbung (Staff/Team)", emoji: "📋", description: "Dich beim Team bewerben" },
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

  const existing = await Ticket.findOne({ guildId: guild.id, userId: user.id, status: "open" });
  if (existing) return { error: "already_open", channelId: existing.channelId };

  const category = cfg.categories.find(c => c.id === categoryId);
  if (!category) return { error: "invalid_category" };

  const num    = await nextTicketNumber(guild.id);
  const padded = String(num).padStart(4, "0");
  const name   = `ticket-${user.username}-${padded}`;

  const notifyRoles = category.notifyRoleIds || [];

  // Permissions: User sieht Kanal, Rollen auch, Bot auch — kein Claimer-Zugang hier
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

  // ── Willkommens-Embed im Ticket (OHNE Claim-Button) ──────────────────────
  const ticketEmbed = new EmbedBuilder()
    .setTitle(`${category.emoji} ${category.label} – Ticket #${padded}`)
    .setDescription(
      `Hey ${user}! Willkommen in deinem Ticket.\n` +
      `Beschreibe dein Anliegen so genau wie möglich.\n` +
      `Ein Teammitglied wird sich so bald wie möglich um dich kümmern.`
    )
    .addFields(
      { name: "Erstellt von", value: `${user}`,                          inline: true },
      { name: "Kategorie",    value: `${category.emoji} ${category.label}`, inline: true },
      { name: "Ticket Nr.",   value: `#${padded}`,                        inline: true }
    )
    .setColor(0x5865f2)
    .setTimestamp();

  // Nur Close, AddUser, Escalate — KEIN Claim-Button
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

  // ── Claim-Nachricht in den Claim-Kanal senden ─────────────────────────────
  if (cfg.claimChannelId) {
    const claimChannel = guild.channels.cache.get(cfg.claimChannelId);
    if (claimChannel) {
      // Rollen-Pings aufbauen
      const pings = notifyRoles.length
        ? notifyRoles.map(id => `<@&${id}>`).join(" ")
        : "";

      const claimEmbed = new EmbedBuilder()
        .setTitle(`📋 Neues Ticket – #${padded}`)
        .setDescription(`Ein neues Ticket wurde erstellt und wartet auf einen Bearbeiter.`)
        .addFields(
          { name: "Kategorie",  value: `${category.emoji} ${category.label}`, inline: true },
          { name: "Erstellt von", value: `${user}`,                           inline: true },
          { name: "Kanal",      value: `<#${channel.id}>`,                    inline: true }
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

  await sendTicketLog(guild, cfg, "created", { ticket, user, category });

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
  await sendTicketLog(guild, cfg, "closed", { ticket, user: creator, closedBy: closedByUser, transcript });

  // Claim-Nachricht im Claim-Kanal deaktivieren (Buttons disablen)
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

  // Staffer zum Ticket-Kanal hinzufügen
  await channel.permissionOverwrites.create(staffer, {
    ViewChannel:        true,
    SendMessages:       true,
    ReadMessageHistory: true,
    ManageMessages:     true,
    AttachFiles:        true
  });

  // Willkommens-Nachricht im Ticket
  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setDescription(`📌 ${staffer} hat dieses Ticket übernommen.`)
        .setColor(0xfee75c)
    ]
  });

  const cfg = await TicketConfig.findOne({ guildId: guild.id });

  // Claim-Nachricht im Claim-Kanal deaktivieren
  if (cfg?.claimChannelId) {
    await disableClaimMessage(guild, cfg.claimChannelId, channel.id, staffer);
  }

  await sendTicketLog(guild, cfg, "claimed", { ticket, user: staffer });

  return { success: true };
}

/**
 * Sucht die Claim-Nachricht für einen bestimmten Ticket-Kanal im Claim-Kanal
 * und deaktiviert den Button (disabled).
 */
async function disableClaimMessage(guild, claimChannelId, ticketChannelId, claimer = null) {
  try {
    const claimChannel = guild.channels.cache.get(claimChannelId);
    if (!claimChannel) return;

    // Letzte 50 Nachrichten im Claim-Kanal durchsuchen
    const messages = await claimChannel.messages.fetch({ limit: 50 });
    const claimMsg = messages.find(m => {
      if (!m.components?.length) return false;
      // Prüfe ob einer der Buttons die ticketChannelId enthält
      return m.components.some(row =>
        row.components?.some(btn => btn.customId === `ticket-claim-${ticketChannelId}`)
      );
    });

    if (!claimMsg) return;

    // Button als disabled neu bauen
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

  const cfg = await TicketConfig.findOne({ guildId: guild.id });
  await sendTicketLog(guild, cfg, "user_added", { ticket, user: targetUser });

  return { success: true };
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
      { name: "Kategorie",  value: ticket.categoryLabel, inline: true },
      { name: "Ticket Nr.", value: `#${padded}`,          inline: true }
    );

  if (user)     embed.addFields({ name: "User",              value: `<@${user.id}>`,     inline: true });
  if (closedBy) embed.addFields({ name: "Geschlossen von",   value: `<@${closedBy.id}>`, inline: true });

  const files = [];
  if (action === "closed" && transcript) {
    const buf = Buffer.from(transcript, "utf-8");
    files.push(new AttachmentBuilder(buf, { name: `transcript-${padded}.txt` }));
    embed.addFields({ name: "Transcript", value: "📄 Siehe Anhang", inline: false });
  }

  await logChannel.send({ embeds: [embed], files }).catch(console.error);
}

// ── Exports ───────────────────────────────────────────────────────────────────
module.exports = {
  DEFAULT_CATEGORIES,
  createTicketV2:   createTicket,
  closeTicketV2:    closeTicket,
  claimTicketV2:    claimTicket,
  addUserToTicketV2: addUserToTicket,
  generateTranscript,
  sendTicketLog,
  nextTicketNumber
};