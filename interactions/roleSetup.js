const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  RoleSelectMenuBuilder
} = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const { ROLE_DEFINITIONS } = require("../utils/rolePermissions");
const { createRoleForKey, applyPermissionsToRole } = require("../utils/setupRoles");
const { COLORS } = require('../utils/uiTheme');

// In-Memory Session Store: guildId → { stepIndex, selectedRoleId }
const roleSessions = new Map();

const TOTAL = ROLE_DEFINITIONS.length;

function buildRoleEmbed(stepIndex, selectedRoleId, guild) {
  const def = ROLE_DEFINITIONS[stepIndex];
  const progress = stepIndex + 1;
  const progressBar = buildProgressBar(progress, TOTAL);

  const permissionText =
    def.permissions.length > 0
      ? def.permissions
          .map((p) => `\`${resolvePermName(p)}\``)
          .join(", ")
      : "`Keine extra Rechte`";

  const embed = new EmbedBuilder()
    .setTitle(`${def.emoji} Rollen Setup — ${def.label}`)
    .setDescription(
      `> ${def.description}\n\n` +
        `**Rechte:**\n${permissionText}\n\n` +
        `**Aktuell ausgewählt:** ${selectedRoleId ? `<@&${selectedRoleId}>` : "`Keine`"}`
    )
    .setColor(def.color)
    .addFields(
      { name: "Fortschritt", value: progressBar, inline: false },
      { name: "Schritt", value: `${progress} / ${TOTAL}`, inline: true },
      { name: "Rolle (Key)", value: `\`${def.key}\``, inline: true }
    )
    .setFooter({ text: `GuildControl • Rollen Setup` })
    .setTimestamp();

  return embed;
}

function buildProgressBar(current, total) {
  const filled = Math.round((current / total) * 10);
  const empty = 10 - filled;
  return `${"█".repeat(filled)}${"░".repeat(empty)} ${current}/${total}`;
}

function buildRoleOverviewEmbed(config) {
  const savedRoles = config?.roles || {};

  const roleLines = ROLE_DEFINITIONS.map((def, index) => {
    const id = savedRoles[def.key];
    const status = id ? `<@&${id}>` : '`Nicht konfiguriert`';
    return `${def.emoji} **${index + 1}. ${def.label}** — ${status}`;
  }).join('\n');

  const configuredCount = ROLE_DEFINITIONS.filter(def => savedRoles[def.key]).length;

  return new EmbedBuilder()
    .setTitle('👑 Rollen Setup — Übersicht')
    .setDescription(
      `Hier siehst du den aktuellen Stand aller Team-Rollen.\n\n${roleLines}`
    )
    .addFields({ name: 'Fortschritt', value: `${configuredCount} / ${TOTAL} konfiguriert` })
    .setColor(COLORS.primary)
    .setFooter({ text: 'GuildControl • Rollen Setup' });
}

function buildRoleOverviewComponents() {
  const { StringSelectMenuBuilder } = require('discord.js');

  const select = new StringSelectMenuBuilder()
    .setCustomId('role-setup-jumpto')
    .setPlaceholder('Rolle direkt bearbeiten...')
    .addOptions(
      ROLE_DEFINITIONS.map((def, index) => ({
        label: def.label,
        value: String(index),
        emoji: def.emoji,
        description: def.description.slice(0, 100),
      }))
    );

  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('role-setup-startwizard')
      .setLabel('Setup von vorne starten')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🔁'),
    new ButtonBuilder()
      .setCustomId('setup-menu-back')
      .setLabel('Zurück')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('↩️'),
  );

  return [new ActionRowBuilder().addComponents(select), buttonRow];
}

async function showRoleOverview(interaction) {
  const guildId = interaction.guild.id;
  const config = await GuildConfig.findOne({ guildId });

  const embed = buildRoleOverviewEmbed(config);
  const components = buildRoleOverviewComponents();

  if (interaction.deferred || interaction.replied) {
    return interaction.editReply({ content: null, embeds: [embed], components });
  }
  return interaction.update({ embeds: [embed], components });
}

function resolvePermName(permFlag) {
  const map = {
    [BigInt("0x8")]: "Administrator",
    [BigInt("0x20")]: "ManageGuild",
    [BigInt("0x10")]: "ManageChannels",
    [BigInt("0x10000000")]: "ManageRoles",
    [BigInt("0x4")]: "BanMembers",
    [BigInt("0x2")]: "KickMembers",
    [BigInt("0x400000000")]: "ModerateMembers",
    [BigInt("0x2000")]: "ManageMessages",
    [BigInt("0x1000000")]: "MoveMembers",
    [BigInt("0x400000")]: "MuteMembers"
  };
  return map[permFlag] ?? String(permFlag);
}

function buildRoleComponents(stepIndex, selectedRoleId) {
  const def = ROLE_DEFINITIONS[stepIndex];

  const selectRow = new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId(`role-setup-select:${stepIndex}`)
      .setPlaceholder(`Bestehende Rolle für "${def.label}" wählen`)
      .setMinValues(1)
      .setMaxValues(1)
  );

  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`role-setup-create:${stepIndex}`)
      .setLabel("➕ Rolle erstellen")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`role-setup-permissions:${stepIndex}`)
      .setLabel("🔧 Rechte setzen")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!selectedRoleId),
    new ButtonBuilder()
      .setCustomId(`role-setup-save:${stepIndex}`)
      .setLabel("💾 Speichern")
      .setStyle(ButtonStyle.Success)
      .setDisabled(!selectedRoleId),
    new ButtonBuilder()
      .setCustomId(`role-setup-skip:${stepIndex}`)
      .setLabel("⏭️ Überspringen")
      .setStyle(ButtonStyle.Secondary)
  );

  const navRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('role-setup-overview')
        .setLabel('Zur Übersicht')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🗂️'),
    );

  return [selectRow, buttonRow, navRow];
}

// ALT: startRoleSetup sprang direkt in Schritt 0 des Assistenten.
// NEU: startRoleSetup zeigt die Übersicht. Der Assistent wird über einen
// eigenen Button ("role-setup-startwizard") oder per Sprung-Auswahl erreicht.

async function startRoleSetup(interaction) {
  return showRoleOverview(interaction);
}

// Neue Funktion für den Sprung in einen bestimmten Schritt (ersetzt die alte Direktlogik):
async function startWizardAtStep(interaction, stepIndex) {
  const guildId = interaction.guild.id;
  const config = await GuildConfig.findOne({ guildId });
  const def = ROLE_DEFINITIONS[stepIndex];
  const savedRoleId = config?.roles?.[def.key] || null;

  roleSessions.set(guildId, { stepIndex, selectedRoleId: savedRoleId });

  const embed = buildRoleEmbed(stepIndex, savedRoleId, interaction.guild);
  const components = buildRoleComponents(stepIndex, savedRoleId);

  if (interaction.deferred || interaction.replied) {
    return interaction.editReply({ content: null, embeds: [embed], components });
  }
  return interaction.update({ embeds: [embed], components });
}

async function handleRoleSetupInteraction(interaction) {
  const guildId = interaction.guild.id;
  const [action, stepStr] = interaction.customId.split(":");
  const stepIndex = parseInt(stepStr, 10);
  const session = roleSessions.get(guildId) || { stepIndex, selectedRoleId: null };

  if (id === 'role-setup-startwizard') {
    return startWizardAtStep(interaction, 0);
  }

  if (id === 'role-setup-jumpto' && interaction.isStringSelectMenu()) {
    const stepIndex = parseInt(interaction.values[0], 10);
    return startWizardAtStep(interaction, stepIndex);
  }

  if (id === 'role-setup-overview') {
    return showRoleOverview(interaction);
  }

  if (action === "role-setup-select") {
    const selected = interaction.values?.[0];
    if (!selected) {
        return interaction.reply({
          content: "❌ Keine Rolle ausgewählt.",
          ephemeral: true
        });
    }
    session.selectedRoleId = selected;
    roleSessions.set(guildId, session);

    const embed = buildRoleEmbed(stepIndex, selected, interaction.guild);
    const components = buildRoleComponents(stepIndex, selected);

    await interaction.update({ embeds: [embed], components });
    return;
  }

  if (action === "role-setup-create") {
    await interaction.deferUpdate();
    try {
      const role = await createRoleForKey(interaction.guild, ROLE_DEFINITIONS[stepIndex].key);
      session.selectedRoleId = role.id;
      roleSessions.set(guildId, session);

      const embed = buildRoleEmbed(stepIndex, role.id, interaction.guild);
      const components = buildRoleComponents(stepIndex, role.id);

      const successEmbed = new EmbedBuilder()
        .setTitle("✅ Rolle erstellt")
        .setDescription(`Die Rolle ${role} wurde automatisch erstellt und konfiguriert.`)
        .setColor(COLORS.success)
        .setFooter({ text: "GuildControl • Rollen Setup" });

      await interaction.editReply({
        embeds: [successEmbed, embed],
        components
      });
    } catch (err) {
      console.error("[roleSetup] Fehler beim Erstellen:", err);
      await interaction.editReply({
        content: `❌ Fehler beim Erstellen der Rolle: \`${err.message}\``,
        embeds: [],
        components: buildRoleComponents(stepIndex, session.selectedRoleId)
      });
    }
    return;
  }

  if (action === "role-setup-permissions") {
    await interaction.deferUpdate();
    try {
      const roleId = session.selectedRoleId;
      if (!roleId) {
        await interaction.editReply({ content: "❌ Keine Rolle ausgewählt.", embeds: [], components: [] });
        return;
      }

      await applyPermissionsToRole(interaction.guild, roleId, ROLE_DEFINITIONS[stepIndex].key);

      const embed = buildRoleEmbed(stepIndex, roleId, interaction.guild);
      const components = buildRoleComponents(stepIndex, roleId);

      const successEmbed = new EmbedBuilder()
        .setTitle("🔧 Rechte gesetzt")
        .setDescription(`Die Rechte für <@&${roleId}> wurden erfolgreich aktualisiert.`)
        .setColor(COLORS.primary)
        .setFooter({ text: "GuildControl • Rollen Setup" });

      await interaction.editReply({
        embeds: [successEmbed, embed],
        components
      });
    } catch (err) {
      console.error("[roleSetup] Fehler beim Setzen der Rechte:", err);
      await interaction.editReply({
        content: `❌ Fehler beim Setzen der Rechte: \`${err.message}\``,
        embeds: [],
        components: buildRoleComponents(stepIndex, session.selectedRoleId)
      });
    }
    return;
  }
  if (action === "role-setup-save") {

    await interaction.deferUpdate();
    const roleId = session.selectedRoleId;
    const def = ROLE_DEFINITIONS[stepIndex];

    console.log("SAVE ROLE:", roleId);
    console.log("SAVE KEY:", def.key);

    if (!roleId) {
      return interaction.editReply({
        content: "❌ Keine Rolle ausgewählt.",
        embeds: [],
        components: []
      });
    }

    try {

      await GuildConfig.findOneAndUpdate(
        { guildId: interaction.guild.id },
        {
          $set: {
            [`roles.${def.key}`]: roleId
          }
        },
        {
          upsert: true,
          new: true
        }
      );
    console.log("✅ Rolle gespeichert");

    await advanceStep(
      interaction,
      interaction.guild.id,
      stepIndex
    );

  } catch (err) {

    console.error("SAVE ERROR:", err);

    await interaction.editReply({
      content: "❌ Fehler beim Speichern.",
      embeds: [],
      components: []
    });
  }

  return;
}

  if (action === "role-setup-skip") {
    await interaction.deferUpdate();
    await advanceStep(interaction, guildId, stepIndex);
    await interaction.editReply({
      embeds: [finishEmbed],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('role-setup-overview')
            .setLabel('Zur Übersicht')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🗂️'),
        ),
      ],
    });
    return;
  }
}

async function advanceStep(interaction, guildId, currentIndex) {
  const nextIndex = currentIndex + 1;

  if (nextIndex >= TOTAL) {
    roleSessions.delete(guildId);

    const config = await GuildConfig.findOne({ guildId });
    const savedRoles = config?.roles || {};

    const roleLines = ROLE_DEFINITIONS.map((def) => {
      const id = savedRoles[def.key];
      return `${def.emoji} **${def.label}:** ${id ? `<@&${id}>` : "`Übersprungen`"}`;
    }).join("\n");

    const finishEmbed = new EmbedBuilder()
      .setTitle("🎉 Rollen Setup Abgeschlossen")
      .setDescription(
        "Alle Rollen wurden erfolgreich konfiguriert und gespeichert.\n\n" + roleLines
      )
      .setColor(COLORS.success)
      .setFooter({ text: "GuildControl • Rollen Setup" })
      .setTimestamp();

    await interaction.editReply({
      embeds: [finishEmbed],
      components: []
    });
    return;
  }

  const session = { stepIndex: nextIndex, selectedRoleId: null };
  roleSessions.set(guildId, session);

  const embed = buildRoleEmbed(nextIndex, null, interaction.guild);
  const components = buildRoleComponents(nextIndex, null);

  await interaction.editReply({ embeds: [embed], components });
}

module.exports = { startRoleSetup, handleRoleSetupInteraction };
