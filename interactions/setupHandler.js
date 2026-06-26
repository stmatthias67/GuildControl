const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    // Falls es sich nicht um eine Komponenten-Interaktion handelt, abbrechen
    if (!interaction.isStringSelectMenu() && !interaction.isButton()) return;

    const id = interaction.customId;

    // ── Setup Haupt-Menü ──────────────────────────────────────────────────────
    // FIX: Alle Untermenüs nutzen interaction.update() – keine neue Nachricht!
    if (interaction.isStringSelectMenu() && id === 'setup-menu') {
      const value = interaction.values[0];

      if (value === 'roles') {
        const { startRoleSetup } = require('./roleSetup'); // FIX: richtiger Dateiname
        return startRoleSetup(interaction);
      }

      if (value === 'tickets') {
        await interaction.deferUpdate();
        const { showSetupOverview } = require('./ticketHandler'); // FIX: richtiger Datei- UND Funktionsname
        return showSetupOverview(interaction);
      }

      if (value === 'security') {
        await interaction.deferUpdate();
        const { showSetupOverview } = require('./securitySetupHandler'); // FIX: richtiger Funktionsname
        return showSetupOverview(interaction);
      }

      if (value === 'rank') {
        const { showRankSetup } = require('./rankSetupHandler');
        return showRankSetup(interaction);
      }

      if (value === 'applications') {
        const { showOverview } = require('./applicationSetupHandler');
        return showOverview(interaction);
      }

      if (value === 'voice') {
        const { showOverview } = require('./voiceSetupHandler');
        return showOverview(interaction);
      }

      // Platzhalter für noch nicht implementierte Systeme → update() statt reply()
      const placeholders = {
        stats: '📊 Statistik Setup',
      };

      if (placeholders[value]) {
        const embed = new EmbedBuilder()
          .setTitle(`${placeholders[value]}`)
          .setDescription('⚠️ Dieses System wird bald verfügbar sein!')
          .setColor(0xfee75c);

        return await interaction.update({ embeds: [embed], components: [] });
      }
    }
  }
};