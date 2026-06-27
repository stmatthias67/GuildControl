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

  return [selectRow, buttonRow];
}

async function startRoleSetup(interaction) {
  const guildId = interaction.guild.id;
  const config = await GuildConfig.findOne({ guildId });
  const firstKey = ROLE_DEFINITIONS[0].key;
  const savedRoleId = config?.roles?.[firstKey] || null;

  roleSessions.set(guildId, {
    stepIndex: 0,
    selectedRoleId: savedRoleId
  });

  const embed = buildRoleEmbed(
    0,
    savedRoleId,
    interaction.guild
  );

  const components = buildRoleComponents(
    0,
    savedRoleId
  );

  await interaction.update({
    embeds: [embed],
    components
  });
}

async function handleRoleSetupInteraction(interaction) {
  const guildId = interaction.guild.id;
  const [action, stepStr] = interaction.customId.split(":");
  const stepIndex = parseInt(stepStr, 10);
  const session = roleSessions.get(guildId) || { stepIndex, selectedRoleId: null };

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
