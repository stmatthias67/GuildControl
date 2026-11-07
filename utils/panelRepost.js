'use strict';

/**
 * panelRepost.js
 * Zentrale Funktionen, um öffentliche Panels (Ticket-Erstellen-Nachricht,
 * Bewerbungs-"Bewerben"-Buttons) auf Anforderung NEU zu posten:
 * alte Nachricht löschen (falls vorhanden), neue Nachricht senden, IDs speichern.
 *
 * Bewusst KEIN automatisches Editieren der bestehenden Nachricht bei jeder
 * Config-Änderung — der Admin muss aktiv über die Website/den Bot auf
 * "Panel neu posten" klicken, damit im Kanal sichtbar eine frische Nachricht
 * erscheint (wie bei vielen bekannten Ticket-Bots üblich).
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const TicketConfig = require('../models/TicketConfig');
const ApplicationConfig = require('../models/ApplicationConfig');
const SecurityConfig = require('../models/SecurityConfig');
const { logCatch } = require('./errorLogger');

/**
 * Postet das Ticket-Erstellen-Panel neu in createChannelId.
 * Löscht die vorherige Panel-Nachricht, falls noch vorhanden.
 */
async function repostTicketPanel(client, guildId) {
  const cfg = await TicketConfig.findOne({ guildId });
  if (!cfg) throw new Error('TicketConfig nicht gefunden');
  if (!cfg.createChannelId) throw new Error('Kein Erstell-Kanal konfiguriert');
  if (!cfg.categories || cfg.categories.length === 0) {
    throw new Error('Keine Ticket-Kategorien konfiguriert');
  }

  const guild = await client.guilds.fetch(guildId);
  const channel = await guild.channels.fetch(cfg.createChannelId).catch(logCatch('panelRepost.fetch'));
  if (!channel) throw new Error('Erstell-Kanal nicht gefunden');

  // Alte Panel-Nachricht löschen, falls noch vorhanden
  if (cfg.panelChannelId && cfg.panelMessageId) {
    try {
      const oldChannel = await guild.channels.fetch(cfg.panelChannelId).catch(logCatch('panelRepost.fetch'));
      if (oldChannel) {
        const oldMessage = await oldChannel.messages.fetch(cfg.panelMessageId).catch(logCatch('panelRepost.fetch'));
        if (oldMessage) await oldMessage.delete().catch(logCatch('panelRepost.delete'));
      }
    } catch (err) {
      console.error('[panelRepost] Fehler beim Löschen des alten Ticket-Panels:', err.message);
    }
  }

  const options = cfg.categories.map((c) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(c.label)
      .setDescription(c.description || undefined)
      .setValue(c.id)
      .setEmoji(c.emoji || undefined)
  );

  const sent = await channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle('🎫 Ticket erstellen')
        .setDescription(
          'Wähle eine Kategorie aus dem Menü um ein Ticket zu erstellen.\nUnser Team hilft dir so schnell wie möglich!'
        )
        .setColor(0x5865f2)
        .setFooter({ text: `Du kannst nur ${cfg.maxTicketsPerUser} offene(s) Ticket(s) gleichzeitig haben.` }),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ticket-create-menu')
          .setPlaceholder('Ticket-Art auswählen…')
          .addOptions(options)
      ),
    ],
  });

  cfg.panelChannelId = channel.id;
  cfg.panelMessageId = sent.id;
  await cfg.save();

  return { channelId: channel.id, messageId: sent.id };
}

function buildApplyButtonEmbed(form) {
  return new EmbedBuilder()
    .setTitle(`${form.emoji || '📋'} ${form.label}`)
    .setDescription(form.description || 'Bewirb dich jetzt über den Button unten!')
    .setColor(0x9b59b6);
}

function buildApplyButtonComponents(form) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`application-apply-${form.formId}`)
        .setLabel('Jetzt bewerben')
        .setStyle(ButtonStyle.Success)
        .setEmoji('📝')
        .setDisabled(!form.active || form.closed)
    ),
  ];
}

/**
 * Postet den "Bewerben"-Button für ein einzelnes Formular neu.
 * Löscht die vorherige Nachricht, falls noch vorhanden (statt sie zu editieren).
 */
async function repostApplicationForm(client, guildId, formId) {
  const cfg = await ApplicationConfig.findOne({ guildId });
  if (!cfg) throw new Error('ApplicationConfig nicht gefunden');

  const form = cfg.forms.find((f) => f.formId === formId);
  if (!form) throw new Error(`Formular "${formId}" nicht gefunden`);
  if (!form.buttonChannelId) throw new Error('Kein Button-Kanal für dieses Formular konfiguriert');

  const guild = await client.guilds.fetch(guildId);
  const channel = await guild.channels.fetch(form.buttonChannelId).catch(logCatch('panelRepost.fetch'));
  if (!channel) throw new Error('Button-Kanal nicht gefunden');

  // Alte Nachricht löschen, falls noch vorhanden
  if (form.buttonMessageId) {
    try {
      const oldMessage = await channel.messages.fetch(form.buttonMessageId).catch(logCatch('panelRepost.fetch'));
      if (oldMessage) await oldMessage.delete().catch(logCatch('panelRepost.delete'));
    } catch (err) {
      console.error('[panelRepost] Fehler beim Löschen des alten Bewerbungs-Buttons:', err.message);
    }
  }

  const sent = await channel.send({
    embeds: [buildApplyButtonEmbed(form)],
    components: buildApplyButtonComponents(form),
  });

  form.buttonMessageId = sent.id;
  await cfg.save();

  return { channelId: channel.id, messageId: sent.id };
}

// customId bleibt aus Kompatibilität mit bereits geposteten Panels (Handler: interactions/verifyHandler.js)
const VERIFY_BUTTON_ID = 'securitysetup-verify-button';

/**
 * Postet das Verify-Panel neu in verification.channelId.
 * Die Message-ID wird nicht gespeichert (kein Schema-Feld); das alte Panel wird
 * stattdessen an seinem Button unter den letzten 50 Nachrichten des Bots erkannt.
 */
async function repostVerifyPanel(client, guildId) {
  const cfg = await SecurityConfig.findOne({ guildId });
  if (!cfg) throw new Error('SecurityConfig nicht gefunden');
  const v = cfg.verification || {};
  if (!v.enabled) throw new Error('Verifikation ist nicht aktiviert');
  if (!v.channelId || !v.verifiedRoleId) throw new Error('Kein Verify-Kanal oder keine Verified-Rolle konfiguriert');

  const guild = await client.guilds.fetch(guildId);
  const channel = await guild.channels.fetch(v.channelId).catch(logCatch('panelRepost.fetch'));
  if (!channel) throw new Error('Verify-Kanal nicht gefunden');

  // Altes Verify-Panel des Bots löschen, falls noch vorhanden
  try {
    const recent = await channel.messages.fetch({ limit: 50 }).catch(logCatch('panelRepost.fetch'));
    const old = recent?.filter((m) =>
      m.author.id === client.user.id &&
      m.components.some((row) => row.components.some((c) => c.customId === VERIFY_BUTTON_ID))
    );
    for (const m of old?.values() ?? []) await m.delete().catch(logCatch('panelRepost.delete'));
  } catch (err) {
    console.error('[panelRepost] Fehler beim Löschen des alten Verify-Panels:', err.message);
  }

  const sent = await channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle('✅ Server Verifikation')
        .setDescription(v.message || 'Klicke auf den Button um dich zu verifizieren und Zugang zum Server zu erhalten.')
        .setColor(0x57f287)
        .setFooter({ text: guild.name })
        .setTimestamp(),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(VERIFY_BUTTON_ID)
          .setLabel('✅ Verifizieren')
          .setStyle(ButtonStyle.Success)
      ),
    ],
  });

  return { channelId: channel.id, messageId: sent.id };
}

module.exports = {
  repostTicketPanel,
  repostApplicationForm,
  repostVerifyPanel,
};