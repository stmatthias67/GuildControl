'use strict';

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const SupportCase = require('../models/SupportCase');
const VoiceConfig = require('../models/VoiceConfig');
const GuildConfig = require('../models/GuildConfig');
const { ROLE_DEFINITIONS } = require('../utils/rolePermissions');

const {
  buildSupportCaseText,
  buildSupportCaseComponents,
  buildSupportPanelEmbed,
  buildSupportPanelComponents,
  buildCloseReasonModal,
  CANCEL_REASON_PRESETS,
  buildCancelReasonSelectRow,
  buildCancelReasonCustomModal,
  buildCallRoleSelectRow,
  ROLE_ESCALATION_ORDER,
} = require('../utils/voiceBuilder');

function resolveRoleId(guildConfig, roleKey) {
  return guildConfig?.roles?.[roleKey] || null;
}

async function getConfiguredRoleKeys(guildId) {
  const guildConfig = await GuildConfig.findOne({ guildId });
  if (!guildConfig?.roles) return [];
  return ROLE_DEFINITIONS.filter(def => guildConfig.roles[def.key]).map(def => ({ key: def.key, label: def.label, emoji: def.emoji }));
}

// ---------------------------------------------------------------------------
// "Fall übernehmen"-Button
// ---------------------------------------------------------------------------

async function handleClaimCase(interaction, caseId) {
  const supportCase = await SupportCase.findOne({ caseId });
  if (!supportCase || supportCase.status !== 'open') {
    return interaction.reply({ content: '⚠️ Dieser Fall ist nicht mehr verfügbar.', ephemeral: true });
  }

  const voiceConfig = await VoiceConfig.findOne({ guildId: interaction.guildId });
  if (!voiceConfig?.supportCaseCategoryId) {
    return interaction.reply({ content: '⚠️ Es ist keine Kategorie für Support-Voice-Channels im Setup festgelegt.', ephemeral: true });
  }

  await interaction.deferUpdate();

  supportCase.status = 'claimed';
  supportCase.claimedBy = interaction.user.id;
  supportCase.claimedAt = new Date();

  try {
    const guild = interaction.guild;
    const everyoneId = guild.roles.everyone.id;

    const channel = await guild.channels.create({
      name: `support-${supportCase.caseId.toLowerCase()}`,
      type: ChannelType.GuildVoice,
      parent: voiceConfig.supportCaseCategoryId,
      permissionOverwrites: [
        { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
        { id: supportCase.userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
      ],
    });

    supportCase.voiceChannelId = channel.id;
    await supportCase.save();

    // Nutzer aus dem Warteraum in den neuen Channel verschieben (falls noch dort)
    try {
      const member = await guild.members.fetch(supportCase.userId);
      if (member.voice.channelId === voiceConfig.waitingRoomChannelId) {
        await member.voice.setChannel(channel.id);
      }
    } catch (err) {
      console.warn('[supportCaseHandler] Konnte Nutzer nicht automatisch verschieben:', err.message);
    }

    // Admin-Panel im neuen Channel posten
    const panelEmbed = buildSupportPanelEmbed(supportCase);
    const panelComponents = buildSupportPanelComponents(supportCase.caseId);
    const panelMsg = await channel.send({
      content: `<@${supportCase.userId}> <@${interaction.user.id}>`,
      embeds: [panelEmbed],
      components: panelComponents,
    });
    supportCase.panelMessageId = panelMsg.id;
    await supportCase.save();
  } catch (err) {
    console.error('[supportCaseHandler] Fehler beim Erstellen des Support-Channels:', err);
  }

  // Notify-Nachricht editieren (NICHT neu posten) — Button deaktivieren, "Übernommen von" ergänzen
  await updateNotifyMessage(interaction.client, supportCase);
}

// ---------------------------------------------------------------------------
// Notify-Nachricht aktualisieren (immer EDIT, nie neue Nachricht)
// ---------------------------------------------------------------------------

async function updateNotifyMessage(client, supportCase) {
  if (!supportCase.notifyChannelId || !supportCase.notifyMessageId) return;

  try {
    const channel = await client.channels.fetch(supportCase.notifyChannelId);
    const msg = await channel.messages.fetch(supportCase.notifyMessageId);

    const guildConfig = await GuildConfig.findOne({ guildId: supportCase.guildId });
    const voiceConfig = await VoiceConfig.findOne({ guildId: supportCase.guildId });
    const roleIds = (voiceConfig?.notifyRoleKeys || [])
      .map(key => resolveRoleId(guildConfig, key))
      .filter(Boolean);

    const text = buildSupportCaseText({
      roleIds,
      userId: supportCase.userId,
      caseId: supportCase.caseId,
      createdAtUnix: Math.floor(new Date(supportCase.createdAt).getTime() / 1000),
      claimedBy: supportCase.claimedBy,
    });

    const components = buildSupportCaseComponents(supportCase.caseId, supportCase.status !== 'open');

    await msg.edit({ content: text, components });
  } catch (err) {
    console.error('[supportCaseHandler] Konnte Notify-Nachricht nicht aktualisieren:', err);
  }
}

// ---------------------------------------------------------------------------
// Admin-Panel: Fall abschließen
// ---------------------------------------------------------------------------

async function handlePanelClose(interaction, caseId) {
  return interaction.showModal(buildCloseReasonModal(caseId));
}

async function handleCloseModalSubmit(interaction, caseId) {
  await interaction.deferUpdate();
  const supportCase = await SupportCase.findOne({ caseId });
  if (!supportCase) return;

  supportCase.status = 'closed';
  supportCase.closeReason = interaction.fields.getTextInputValue('reason').trim();
  supportCase.closedAt = new Date();
  await supportCase.save();

  await interaction.followUp({ content: `✅ Fall abgeschlossen. Grund: ${supportCase.closeReason}`, ephemeral: false });
  await cleanupVoiceChannel(interaction.client, supportCase, 10_000); // 10s Verzögerung, damit alle die Nachricht lesen können
}

// ---------------------------------------------------------------------------
// Admin-Panel: Fall abbrechen
// ---------------------------------------------------------------------------

async function handlePanelCancel(interaction, caseId) {
  return interaction.update({
    content: 'Wähle einen Grund für den Abbruch:',
    embeds: [],
    components: buildCancelReasonSelectRow(caseId),
  });
}

async function handleCancelReasonSelect(interaction, caseId) {
  const presetValue = interaction.values[0];

  if (presetValue === 'other') {
    return interaction.showModal(buildCancelReasonCustomModal(caseId));
  }

  const preset = CANCEL_REASON_PRESETS.find(r => r.value === presetValue);
  await finalizeCancellation(interaction, caseId, preset?.label || 'Unbekannter Grund');
}

async function handleCancelReasonModalSubmit(interaction, caseId) {
  const reason = interaction.fields.getTextInputValue('reason').trim();
  await finalizeCancellation(interaction, caseId, reason, true);
}

async function finalizeCancellation(interaction, caseId, reason, isModal = false) {
  if (isModal) await interaction.deferUpdate(); else await interaction.deferUpdate();

  const supportCase = await SupportCase.findOne({ caseId });
  if (!supportCase) return;

  supportCase.status = 'cancelled';
  supportCase.cancelReason = reason;
  supportCase.closedAt = new Date();
  await supportCase.save();

  await interaction.followUp({ content: `🚫 Fall abgebrochen. Grund: ${reason}`, ephemeral: false });
  await cleanupVoiceChannel(interaction.client, supportCase, 8_000);
  await updateNotifyMessage(interaction.client, supportCase);
}

// ---------------------------------------------------------------------------
// Admin-Panel: Rang höher rufen
// ---------------------------------------------------------------------------

async function handleEscalate(interaction, caseId) {
  const supportCase = await SupportCase.findOne({ caseId });
  if (!supportCase) return;

  const guild = interaction.guild;
  const guildConfig = await GuildConfig.findOne({ guildId: interaction.guildId });

  // Höchste anwesende Rolle im Voice-Channel ermitteln
  const channel = await guild.channels.fetch(supportCase.voiceChannelId);
  const membersInChannel = [...channel.members.values()];

  let highestIndex = -1; // Index in ROLE_ESCALATION_ORDER (niedrig->hoch)
  for (const member of membersInChannel) {
    for (let i = 0; i < ROLE_ESCALATION_ORDER.length; i++) {
      const roleKey = ROLE_ESCALATION_ORDER[i];
      const roleId = guildConfig?.roles?.[roleKey];
      if (roleId && member.roles.cache.has(roleId) && i > highestIndex) {
        highestIndex = i;
      }
    }
  }

  const nextIndex = highestIndex + 1;
  if (nextIndex >= ROLE_ESCALATION_ORDER.length) {
    return interaction.reply({ content: '⚠️ Es gibt keinen höheren Rang mehr zum Rufen.', ephemeral: true });
  }

  const nextRoleKey = ROLE_ESCALATION_ORDER[nextIndex];
  const nextRoleId = guildConfig?.roles?.[nextRoleKey];

  if (!nextRoleId) {
    return interaction.reply({ content: `⚠️ Die Rolle "${nextRoleKey}" ist im Rollen-Setup noch nicht konfiguriert.`, ephemeral: true });
  }

  await interaction.deferUpdate();
  await channel.send(`📣 <@&${nextRoleId}> wurde zu diesem Support-Fall gerufen.`);

  supportCase.escalatedToRoleKey = nextRoleKey;
  await supportCase.save();
}

// ---------------------------------------------------------------------------
// Admin-Panel: Bestimmten Rang rufen
// ---------------------------------------------------------------------------

async function handleCallSpecificRole(interaction, caseId) {
  const roleOptions = await getConfiguredRoleKeys(interaction.guildId);
  if (!roleOptions.length) {
    return interaction.reply({ content: '⚠️ Es sind noch keine Rollen im Rollen-Setup konfiguriert.', ephemeral: true });
  }
  return interaction.reply({
    content: 'Wähle die Rolle, die gerufen werden soll:',
    components: buildCallRoleSelectRow(roleOptions, caseId),
    ephemeral: true,
  });
}

async function handleCallRoleSelect(interaction, caseId) {
  const roleKey = interaction.values[0];
  const guildConfig = await GuildConfig.findOne({ guildId: interaction.guildId });
  const roleId = resolveRoleId(guildConfig, roleKey);

  const supportCase = await SupportCase.findOne({ caseId });
  if (!supportCase || !roleId) {
    return interaction.update({ content: '⚠️ Rolle konnte nicht aufgelöst werden.', components: [] });
  }

  const channel = await interaction.guild.channels.fetch(supportCase.voiceChannelId);
  await channel.send(`📣 <@&${roleId}> wurde zu diesem Support-Fall gerufen.`);

  supportCase.escalatedToRoleKey = roleKey;
  await supportCase.save();

  await interaction.update({ content: `✅ <@&${roleId}> wurde benachrichtigt.`, components: [] });
}

// ---------------------------------------------------------------------------
// Voice-Channel nach Abschluss/Abbruch löschen
// ---------------------------------------------------------------------------

async function cleanupVoiceChannel(client, supportCase, delayMs = 0) {
  if (!supportCase.voiceChannelId) return;

  setTimeout(async () => {
    try {
      const channel = await client.channels.fetch(supportCase.voiceChannelId);
      await channel.delete();
    } catch (err) {
      // Channel ggf. schon gelöscht
    }
  }, delayMs);
}

// ---------------------------------------------------------------------------
// Voice-State-Tracking: Nutzer verlässt Warteraum -> Fall abbrechen
// ---------------------------------------------------------------------------

async function handleUserLeftWaitingRoom(guildId, userId) {
  const supportCase = await SupportCase.findOne({ guildId, userId, status: 'open' });
  if (!supportCase) return;

  supportCase.status = 'cancelled';
  supportCase.cancelReason = 'Nutzer hat den Warteraum verlassen';
  supportCase.closedAt = new Date();
  await supportCase.save();
}

module.exports = {
  handleClaimCase,
  handlePanelClose,
  handleCloseModalSubmit,
  handlePanelCancel,
  handleCancelReasonSelect,
  handleCancelReasonModalSubmit,
  handleEscalate,
  handleCallSpecificRole,
  handleCallRoleSelect,
  handleUserLeftWaitingRoom,
  updateNotifyMessage,
};