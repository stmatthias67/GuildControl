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
        stats:        '📊 Statistik Setup',
      };

      if (placeholders[value]) {
        const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder,
                StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

        const embed = new EmbedBuilder()
          .setTitle(`${placeholders[value]}`)
          .setDescription('⚠️ Dieses System wird bald verfügbar sein!')
          .setColor(0xfee75c);
// ... Rest des Codes bleibt identisch
