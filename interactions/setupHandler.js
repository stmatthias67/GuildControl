'use strict';

/**
 * setupHandler.js
 *
 * Präfixe:
 *   role-setup-*       → roleSetup.js
 *   ticketsetup-*      → ticketHandler.js
 *   ticket-*           → ticketHandler.js
 *   securitysetup-*    → securitySetupHandler.js
 *   ranksetup-*        → rankSetupHandler.js
 *   setup-*            → Haupt-Setup (dieses File)
 */

const GuildConfig = require('../models/GuildConfig');
const { startRoleSetup, handleRoleSetupInteraction }      = require('./roleSetup');
const { showSetupOverview: showTicketSetup,
        execute: handleTicketInteraction }                 = require('./ticketHandler');
const { showSetupOverview: showSecuritySetup,
        execute: handleSecurityInteraction }               = require('./securitySetupHandler');
const { showRankSetup, handleRankSetupInteraction }       = require('./rankSetupHandler');

module.exports = {
  async execute(interaction, client) {

    if (
      !interaction.isButton()            &&
      !interaction.isStringSelectMenu()  &&
      !interaction.isRoleSelectMenu()    &&
      !interaction.isChannelSelectMenu() &&
      !interaction.isModalSubmit()
    ) return;

    const id = interaction.customId;

    // ── Role Setup ────────────────────────────────────────────────────────────
    if (id.startsWith('role-setup-')) {
      return handleRoleSetupInteraction(interaction);
    }

    // ── Ticket System ─────────────────────────────────────────────────────────
    if (id.startsWith('ticketsetup-') || id.startsWith('ticket-')) {
      return handleTicketInteraction(interaction, client);
    }

    // ── Security System ───────────────────────────────────────────────────────
    if (id.startsWith('securitysetup-')) {
      return handleSecurityInteraction(interaction, client);
    }

    // ── Rank Setup ────────────────────────────────────────────────────────────
    if (id.startsWith('ranksetup-')) {
      return handleRankSetupInteraction(interaction);
    }

    // ── Setup Haupt-Menü ──────────────────────────────────────────────────────
    // FIX: Alle Untermenüs nutzen interaction.update() – keine neue Nachricht!
    if (interaction.isStringSelectMenu() && id === 'setup-menu') {
      const value = interaction.values[0];

      if (value === 'roles') {
        // startRoleSetup ruft intern interaction.update() auf ✓
        return startRoleSetup(interaction);
      }

      if (value === 'tickets') {
        // showTicketSetup erwartet eine Interaction – intern deferReply/editReply
        // Wir deferred zuerst als Update damit die Haupt-Nachricht aktualisiert wird
        await interaction.deferUpdate();
        return showTicketSetup(interaction);
      }

      if (value === 'security') {
        // showSecuritySetup → intern deferReply/editReply
        await interaction.deferUpdate();
        return showSecuritySetup(interaction);
      }

      if (value === 'rank') {
        // showRankSetup erkennt bereits deferred Interactions und nutzt update()
        return showRankSetup(interaction);
      }

      // Platzhalter für noch nicht implementierte Systeme → update() statt reply()
      const placeholders = {
        voice:        '🔊 Voice Setup',
        applications: '📋 Bewerbungs Setup',
        stats:        '📊 Statistik Setup',
      };

      if (placeholders[value]) {
        const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder,
                StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

        const embed = new EmbedBuilder()
          .setTitle(`${placeholders[value]}`)
          .setDescription('⚠️ Dieses System wird bald verfügbar sein!')
          .setColor(0xfee75c);

        // Hauptmenü-Komponenten neu aufbauen damit der User zurück kann
        const menu = new StringSelectMenuBuilder()
          .setCustomId('setup-menu')
          .setPlaceholder('System auswählen...')
          .addOptions([
            new StringSelectMenuOptionBuilder().setLabel('Rollen Setup').setValue('roles').setEmoji('👑'),
            new StringSelectMenuOptionBuilder().setLabel('Ticket Setup').setValue('tickets').setEmoji('🎫'),
            new StringSelectMenuOptionBuilder().setLabel('Security Setup').setValue('security').setEmoji('🛡️'),
            new StringSelectMenuOptionBuilder().setLabel('Voice Setup').setValue('voice').setEmoji('🔊'),
            new StringSelectMenuOptionBuilder().setLabel('Rank Setup').setValue('rank').setEmoji('📈'),
            new StringSelectMenuOptionBuilder().setLabel('Bewerbungs Setup').setValue('applications').setEmoji('📋'),
            new StringSelectMenuOptionBuilder().setLabel('Statistik Setup').setValue('stats').setEmoji('📊'),
          ]);

        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('setup-create-all').setLabel('🚀 Auto Setup').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('setup-finish').setLabel('✅ Setup Abschließen').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('setup-cancel').setLabel('❌ Abbrechen').setStyle(ButtonStyle.Danger),
        );

        return interaction.update({
          embeds: [embed],
          components: [new ActionRowBuilder().addComponents(menu), buttons],
        });
      }
    }

    // ── Auto Setup ────────────────────────────────────────────────────────────
    if (id === 'setup-create-all') {
      await interaction.deferReply({ ephemeral: true });

      try {
        const roles = ['Supporter', 'Mitglied'];
        for (const roleName of roles) {
          const exists = interaction.guild.roles.cache.find(r => r.name === roleName);
          if (!exists) {
            await interaction.guild.roles.create({
              name:   roleName,
              reason: 'GuildControl Auto Setup',
            });
          }
        }

        await GuildConfig.findOneAndUpdate(
          { guildId: interaction.guild.id },
          {
            guildId: interaction.guild.id,
            systems: { moderation: true, tickets: true, logs: true },
          },
          { upsert: true, new: true }
        );

        await interaction.editReply({ content: '✅ GuildControl Auto-Setup erfolgreich abgeschlossen!' });

      } catch (err) {
        console.error('[Setup] Auto Setup Fehler:', err);
        await interaction.editReply({ content: '❌ Fehler beim Auto-Setup!' });
      }

      return;
    }

    // ── Setup abbrechen ───────────────────────────────────────────────────────
    if (id === 'setup-cancel') {
      return interaction.update({
        content:    '❌ Setup abgebrochen.',
        embeds:     [],
        components: [],
      });
    }

    // ── Setup abschließen ─────────────────────────────────────────────────────
    if (id === 'setup-finish') {
      return interaction.update({
        content:    '✅ Setup gespeichert.',
        embeds:     [],
        components: [],
      });
    }
  },
};