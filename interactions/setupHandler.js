const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function buildMainSetupMenu() {
  const embed = new EmbedBuilder()
    .setTitle('⚙️ GuildControl Setup')
    .setDescription('Wähle ein System zum Konfigurieren oder starte den Auto-Setup.')
    .setColor(0x5865f2);

  const menu = new StringSelectMenuBuilder()
    .setCustomId('setup-menu')
    .setPlaceholder('System auswählen...')
    .addOptions([
      new StringSelectMenuOptionBuilder().setLabel('Rollen Setup').setDescription('Team Rollen konfigurieren').setValue('roles').setEmoji('👑'),
      new StringSelectMenuOptionBuilder().setLabel('Ticket Setup').setDescription('Ticket System konfigurieren').setValue('tickets').setEmoji('🎫'),
      new StringSelectMenuOptionBuilder().setLabel('Security Setup').setDescription('Security System konfigurieren').setValue('security').setEmoji('🛡️'),
      new StringSelectMenuOptionBuilder().setLabel('Voice Setup').setDescription('Voice System konfigurieren').setValue('voice').setEmoji('🔊'),
      new StringSelectMenuOptionBuilder().setLabel('Rank Setup').setDescription('Level System konfigurieren').setValue('rank').setEmoji('📈'),
      new StringSelectMenuOptionBuilder().setLabel('Bewerbungs Setup').setDescription('Bewerbungssystem konfigurieren').setValue('applications').setEmoji('📋'),
      new StringSelectMenuOptionBuilder().setLabel('Statistik Setup').setDescription('Server Statistiken erstellen').setValue('stats').setEmoji('📊'),
    ]);

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('setup-create-all').setLabel('🚀 Auto Setup').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('setup-finish').setLabel('✅ Setup Abschließen').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('setup-cancel').setLabel('❌ Abbrechen').setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu), buttons] };
}

module.exports = {
  name: 'interactionCreate',
  buildMainSetupMenu, // exportiert, falls andere Handler es ebenfalls brauchen (z.B. statt eigener Kopien)

  async execute(interaction) {
    if (!interaction.isStringSelectMenu() && !interaction.isButton()) return;

    const id = interaction.customId;

    // ── FIX: Zurück-Button zum Hauptmenü, von JEDEM Setup-System aus erreichbar ──
    if (interaction.isButton() && id === 'setup-menu-back') {
      const { embeds, components } = buildMainSetupMenu();
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({ content: null, embeds, components });
      }
      return interaction.update({ embeds, components });
    }

    // ── Setup Haupt-Menü (Dropdown-Auswahl) ──────────────────────────────────
    if (interaction.isStringSelectMenu() && id === 'setup-menu') {
      const value = interaction.values[0];

      if (value === 'roles') {
        const { startRoleSetup } = require('./roleSetup');
        return startRoleSetup(interaction);
      }

      if (value === 'tickets') {
        await interaction.deferUpdate();
        const { showSetupOverview } = require('./ticketHandler');
        return showSetupOverview(interaction);
      }

      if (value === 'security') {
        await interaction.deferUpdate();
        const { showSetupOverview } = require('./securitySetupHandler');
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

      if (value === 'stats') {
        const { showOverview } = require('./statsSetupHandler');
        return showOverview(interaction);
      }

        return interaction.update({ embeds: [embed], components: [] });
      }
    }
  }
};