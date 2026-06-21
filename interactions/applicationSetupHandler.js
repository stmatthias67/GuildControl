'use strict';

/**
 * applicationSetupHandler.js
 * Setup-Flow für das Bewerbungssystem (Prefix: "applicationsetup-").
 * Analog zu rankSetupHandler.js / securitySetupHandler.js.
 */

const { PermissionFlagsBits, ChannelType } = require('discord.js');
const ApplicationConfig = require('../models/ApplicationConfig');
const GuildConfig = require('../models/GuildConfig');
const {
  buildApplicationOverviewEmbed,
  buildApplicationOverviewComponents,
  buildFormListEmbed,
  buildFormListComponents,
  buildFormDetailEmbed,
  buildFormDetailComponents,
  buildFormNameModal,
  buildFormEditModal,
  buildQuestionAddModal,
  buildQuestionRemoveModal,
  buildLockMinutesModal,
  buildApplyButtonEmbed,
  buildApplyButtonComponents,
  MAX_QUESTIONS_PER_PAGE,
} = require('../utils/applicationBuilder');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getOrCreateApplicationConfig(guildId) {
  let config = await ApplicationConfig.findOne({ guildId });
  if (!config) {
    config = await ApplicationConfig.create({ guildId });
  }
  return config;
}

function hasManageGuild(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

async function denyNoPermission(interaction) {
  await interaction.reply({ content: '❌ Du benötigst die Berechtigung "Server verwalten", um das Setup zu nutzen.', ephemeral: true });
}

function findForm(config, formId) {
  return config.forms.find(f => f.formId === formId);
}

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9äöüß\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 50);
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

async function showOverview(interaction) {
  const config = await getOrCreateApplicationConfig(interaction.guildId);
  const embed = buildApplicationOverviewEmbed(config);
  const components = buildApplicationOverviewComponents(config);

  if (interaction.replied || interaction.deferred) {
    await interaction.editReply({ embeds: [embed], components });
  } else {
    await interaction.update({ embeds: [embed], components });
  }
}

async function showFormList(interaction) {
  const config = await getOrCreateApplicationConfig(interaction.guildId);
  const embed = buildFormListEmbed(config);
  const components = buildFormListComponents(config);
  await interaction.update({ embeds: [embed], components });
}

async function showFormDetail(interaction, formId) {
  const config = await getOrCreateApplicationConfig(interaction.guildId);
  const form = findForm(config, formId);
  if (!form) {
    return interaction.update({ content: '❌ Formular nicht gefunden.', embeds: [], components: [] });
  }
  const embed = buildFormDetailEmbed(form);
  const components = buildFormDetailComponents(form);
  await interaction.update({ embeds: [embed], components });
}

// ---------------------------------------------------------------------------
// Main entry: Buttons / Select Menus
// ---------------------------------------------------------------------------

async function handleApplicationSetupInteraction(interaction) {
  if (!hasManageGuild(interaction)) return denyNoPermission(interaction);

  const id = interaction.customId;

  // --- Overview-level buttons ---
  if (id === 'applicationsetup-overview') {
    return showOverview(interaction);
  }

  if (id === 'applicationsetup-channel') {
    return interaction.update({
      content: 'Bitte wähle den Review-Channel über das Channel-Auswahlmenü unten aus.',
      embeds: [],
      components: [buildChannelSelectRow()],
    });
  }

  if (id === 'applicationsetup-reviewers') {
    const guildConfig = await GuildConfig.findOne({ guildId: interaction.guildId });
    const roleKeys = Object.keys(guildConfig?.roles?.toObject?.() || guildConfig?.roles || {});
    if (!roleKeys.length) {
      return interaction.update({
        content: '⚠️ Es sind noch keine Rollen im Rollen-Setup konfiguriert. Bitte richte zuerst das Rollen-Setup ein.',
        embeds: [],
        components: [],
      });
    }
    return interaction.update({
      content: 'Wähle die Rolle(n), die Bewerbungen annehmen/ablehnen dürfen (aus dem Rollen-Setup):',
      embeds: [],
      components: [buildRoleKeySelectRow(roleKeys, 'applicationsetup-reviewersselect')],
    });
  }

  if (id === 'applicationsetup-locktime') {
    const config = await getOrCreateApplicationConfig(interaction.guildId);
    return interaction.showModal(buildLockMinutesModal(config.cancelLockMinutes));
  }

  if (id === 'applicationsetup-forms') {
    return showFormList(interaction);
  }

  if (id === 'applicationsetup-formnew') {
    return interaction.showModal(buildFormNameModal());
  }

  if (id === 'applicationsetup-back') {
    return showOverview(interaction);
  }

  if (id === 'applicationsetup-complete') {
    const config = await getOrCreateApplicationConfig(interaction.guildId);
    config.setupDone = true;
    await config.save();
    return showOverview(interaction);
  }

  // --- Form detail buttons (dynamic formId suffix) ---
  const dynamicMatch = id.match(/^applicationsetup-(formedit|formchannel|formrole|formquestionadd|formquestionremove|formtoggle|formdelete)-(.+)$/);
  if (dynamicMatch) {
    const [, action, formId] = dynamicMatch;
    return handleFormAction(interaction, action, formId);
  }

  // --- Select menus ---
  if (interaction.isStringSelectMenu() && id === 'applicationsetup-formselect') {
    return showFormDetail(interaction, interaction.values[0]);
  }

  if (interaction.isStringSelectMenu() && id === 'applicationsetup-reviewersselect') {
    const config = await getOrCreateApplicationConfig(interaction.guildId);
    config.reviewerRoleKeys = interaction.values;
    await config.save();
    return showOverview(interaction);
  }

  if (interaction.isStringSelectMenu() && id.startsWith('applicationsetup-formroleselect-')) {
    const formId = id.replace('applicationsetup-formroleselect-', '');
    const config = await getOrCreateApplicationConfig(interaction.guildId);
    const form = findForm(config, formId);
    if (form) {
      form.targetTestRoleKey = interaction.values[0];
      await config.save();
    }
    return showFormDetail(interaction, formId);
  }

  if (interaction.isChannelSelectMenu() && id === 'applicationsetup-channelselect') {
    const config = await getOrCreateApplicationConfig(interaction.guildId);
    config.reviewChannelId = interaction.values[0];
    await config.save();
    return showOverview(interaction);
  }

  if (interaction.isChannelSelectMenu() && id.startsWith('applicationsetup-formchannelselect-')) {
    const formId = id.replace('applicationsetup-formchannelselect-', '');
    const config = await getOrCreateApplicationConfig(interaction.guildId);
    const form = findForm(config, formId);
    if (form) {
      form.buttonChannelId = interaction.values[0];
      await config.save();

      // Bewerbungs-Button im gewählten Channel posten/aktualisieren
      await postOrUpdateApplyButton(interaction.client, config, form);
      await config.save();
    }
    return showFormDetail(interaction, formId);
  }
}

async function handleFormAction(interaction, action, formId) {
  const config = await getOrCreateApplicationConfig(interaction.guildId);
  const form = findForm(config, formId);
  if (!form) {
    return interaction.update({ content: '❌ Formular nicht gefunden.', embeds: [], components: [] });
  }

  switch (action) {
    case 'formedit':
      return interaction.showModal(buildFormEditModal(form));

    case 'formchannel':
      return interaction.update({
        content: `Wähle den Channel, in dem der Bewerben-Button für **${form.label}** erscheinen soll:`,
        embeds: [],
        components: [buildChannelSelectRow(`applicationsetup-formchannelselect-${formId}`)],
      });

    case 'formrole': {
      const guildConfig = await GuildConfig.findOne({ guildId: interaction.guildId });
      const roleKeys = Object.keys(guildConfig?.roles?.toObject?.() || guildConfig?.roles || {});
      if (!roleKeys.length) {
        return interaction.update({
          content: '⚠️ Es sind noch keine Rollen im Rollen-Setup konfiguriert.',
          embeds: [],
          components: [],
        });
      }
      return interaction.update({
        content: `Wähle die Test-Rolle, die bei erfolgreicher Einstellung für **${form.label}** vergeben wird:`,
        embeds: [],
        components: [buildRoleKeySelectRow(roleKeys, `applicationsetup-formroleselect-${formId}`)],
      });
    }

    case 'formquestionadd':
      if (form.questions.length >= 25) {
        return interaction.update({ content: '⚠️ Maximal 25 Fragen pro Formular erlaubt.', embeds: [], components: [] });
      }
      return interaction.showModal(buildQuestionAddModal(formId));

    case 'formquestionremove':
      if (!form.questions.length) {
        return interaction.update({ content: '⚠️ Dieses Formular hat keine Fragen zum Entfernen.', embeds: [], components: [] });
      }
      return interaction.showModal(buildQuestionRemoveModal(formId));

    case 'formtoggle': {
      if (!form.active) {
        // Vor Aktivierung: Validierung
        if (!form.questions.length) {
          return interaction.update({ content: '⚠️ Formular braucht mindestens 1 Frage, bevor es aktiviert werden kann.', embeds: [], components: [] });
        }
        if (!form.buttonChannelId) {
          return interaction.update({ content: '⚠️ Bitte zuerst einen Button-Channel festlegen.', embeds: [], components: [] });
        }
        form.active = true;
        await config.save();
        await postOrUpdateApplyButton(interaction.client, config, form);
        await config.save();
      } else {
        form.active = false;
        await config.save();
      }
      return showFormDetail(interaction, formId);
    }

    case 'formdelete':
      config.forms = config.forms.filter(f => f.formId !== formId);
      await config.save();
      return showFormList(interaction);
  }
}

// ---------------------------------------------------------------------------
// Modal submits
// ---------------------------------------------------------------------------

async function handleApplicationSetupModalSubmit(interaction) {
  if (!hasManageGuild(interaction)) return denyNoPermission(interaction);

  const id = interaction.customId;

  if (id === 'applicationsetup-modal-formnew') {
    await interaction.deferUpdate();
    const config = await getOrCreateApplicationConfig(interaction.guildId);

    const label = interaction.fields.getTextInputValue('label').trim();
    const description = interaction.fields.getTextInputValue('description')?.trim() || '';

    let formId = slugify(label);
    if (!formId) formId = `form-${Date.now()}`;
    // Eindeutigkeit sicherstellen
    let suffix = 1;
    const baseId = formId;
    while (findForm(config, formId)) {
      formId = `${baseId}-${suffix++}`;
    }

    config.forms.push({
      formId,
      label,
      description,
      emoji: '📋',
      buttonChannelId: null,
      buttonMessageId: null,
      targetTestRoleKey: null,
      questions: [],
      active: false,
    });
    await config.save();

    return showFormDetail(interaction, formId);
  }

  if (id === 'applicationsetup-modal-locktime') {
    await interaction.deferUpdate();
    const config = await getOrCreateApplicationConfig(interaction.guildId);
    const raw = interaction.fields.getTextInputValue('minutes').trim();
    const minutes = parseInt(raw, 10);

    if (isNaN(minutes) || minutes < 0) {
      return interaction.editReply({ content: '⚠️ Ungültige Zahl. Bitte erneut versuchen.', embeds: [], components: [] });
    }

    config.cancelLockMinutes = minutes;
    await config.save();
    return showOverview(interaction);
  }

  const formEditMatch = id.match(/^applicationsetup-modal-formedit-(.+)$/);
  if (formEditMatch) {
    await interaction.deferUpdate();
    const formId = formEditMatch[1];
    const config = await getOrCreateApplicationConfig(interaction.guildId);
    const form = findForm(config, formId);
    if (form) {
      form.label = interaction.fields.getTextInputValue('label').trim();
      form.description = interaction.fields.getTextInputValue('description')?.trim() || '';
      await config.save();
    }
    return showFormDetail(interaction, formId);
  }

  const questionAddMatch = id.match(/^applicationsetup-modal-questionadd-(.+)$/);
  if (questionAddMatch) {
    await interaction.deferUpdate();
    const formId = questionAddMatch[1];
    const config = await getOrCreateApplicationConfig(interaction.guildId);
    const form = findForm(config, formId);

    if (form) {
      const label = interaction.fields.getTextInputValue('label').trim();
      const styleRaw = interaction.fields.getTextInputValue('style').trim().toLowerCase();
      const requiredRaw = interaction.fields.getTextInputValue('required').trim().toLowerCase();

      const style = styleRaw === 'absatz' ? 'paragraph' : 'short';
      const required = requiredRaw === 'ja';

      // Seite bestimmen: aktuelle letzte Seite auffüllen, sonst neue Seite
      const pages = {};
      for (const q of form.questions) {
        pages[q.page] = (pages[q.page] || 0) + 1;
      }
      let targetPage = 1;
      while ((pages[targetPage] || 0) >= MAX_QUESTIONS_PER_PAGE) {
        targetPage++;
      }

      const questionId = `q${form.questions.length + 1}_${Date.now().toString(36)}`;

      form.questions.push({
        id: questionId,
        label,
        style,
        required,
        maxLength: style === 'paragraph' ? 1000 : 200,
        page: targetPage,
      });
      await config.save();
    }
    return showFormDetail(interaction, formId);
  }

  const questionRemoveMatch = id.match(/^applicationsetup-modal-questionremove-(.+)$/);
  if (questionRemoveMatch) {
    await interaction.deferUpdate();
    const formId = questionRemoveMatch[1];
    const config = await getOrCreateApplicationConfig(interaction.guildId);
    const form = findForm(config, formId);

    if (form) {
      const raw = interaction.fields.getTextInputValue('index').trim();
      const index = parseInt(raw, 10) - 1;
      const sorted = [...form.questions].sort((a, b) => a.page - b.page);

      if (isNaN(index) || index < 0 || index >= sorted.length) {
        return interaction.editReply({ content: '⚠️ Ungültige Nummer.', embeds: [], components: [] });
      }

      const toRemove = sorted[index];
      form.questions = form.questions.filter(q => q.id !== toRemove.id);
      await config.save();
    }
    return showFormDetail(interaction, formId);
  }
}

// ---------------------------------------------------------------------------
// Shared select-menu row builders
// ---------------------------------------------------------------------------

function buildChannelSelectRow(customId = 'applicationsetup-channelselect') {
  const { ChannelSelectMenuBuilder } = require('discord.js');
  const { ActionRowBuilder } = require('discord.js');
  return new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder('Channel auswählen...')
      .addChannelTypes(ChannelType.GuildText)
  );
}

function buildRoleKeySelectRow(roleKeys, customId) {
  const { StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
  const isMulti = customId === 'applicationsetup-reviewersselect';
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder('Rolle(n) auswählen...')
    .addOptions(roleKeys.slice(0, 25).map(key => ({ label: key, value: key })));

  if (isMulti) {
    menu.setMinValues(1).setMaxValues(Math.min(roleKeys.length, 25));
  }

  return new ActionRowBuilder().addComponents(menu);
}

// ---------------------------------------------------------------------------
// Bewerben-Button posten/aktualisieren
// ---------------------------------------------------------------------------

async function postOrUpdateApplyButton(client, config, form) {
  if (!form.buttonChannelId) return;

  try {
    const channel = await client.channels.fetch(form.buttonChannelId);
    if (!channel) return;

    const embed = buildApplyButtonEmbed(form);
    const components = buildApplyButtonComponents(form);

    if (form.buttonMessageId) {
      try {
        const existing = await channel.messages.fetch(form.buttonMessageId);
        await existing.edit({ embeds: [embed], components });
        return;
      } catch {
        // Nachricht existiert nicht mehr -> neu posten
      }
    }

    const sent = await channel.send({ embeds: [embed], components });
    form.buttonMessageId = sent.id;
  } catch (err) {
    console.error('[applicationSetupHandler] Fehler beim Posten des Bewerben-Buttons:', err);
  }
}

module.exports = {
  getOrCreateApplicationConfig,
  showOverview,
  handleApplicationSetupInteraction,
  handleApplicationSetupModalSubmit,
  postOrUpdateApplyButton,
};