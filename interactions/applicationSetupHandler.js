'use strict';

/**
 * applicationSetupHandler.js
 * Setup-Flow für das Bewerbungssystem (Prefix: "applicationsetup-").
 */

const {
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');

const ApplicationConfig = require('../models/ApplicationConfig');
const GuildConfig = require('../models/GuildConfig');
const { ROLE_DEFINITIONS } = require('../utils/rolePermissions');
const { TEMPLATES, getTemplate } = require('../utils/applicationTemplates');
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
  buildTemplateListEmbed,
  buildTemplateListComponents,
  buildCloseReasonSelectRow,
  buildCloseReasonCustomModal,
  CLOSE_REASON_PRESETS,
  MAX_QUESTIONS_PER_PAGE,
  // Neue Imports für das Nachrichten-Setup:
  buildMessageSettingsEmbed,
  buildMessageSettingsComponents,
  buildMessageEditModal,
  MESSAGE_SLOTS,
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

function generateUniqueFormId(config, label) {
  let formId = slugify(label);
  if (!formId) formId = `form-${Date.now()}`;
  let suffix = 1;
  const baseId = formId;
  while (findForm(config, formId)) {
    formId = `${baseId}-${suffix++}`;
  }
  return formId;
}

async function getConfiguredRoleKeys(guildId) {
  const guildConfig = await GuildConfig.findOne({ guildId });
  if (!guildConfig?.roles) return [];

  const roles = guildConfig.roles;
  return ROLE_DEFINITIONS
    .filter(def => roles[def.key])
    .map(def => ({ key: def.key, label: def.label, emoji: def.emoji }));
}

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

  const row = new ActionRowBuilder().addComponents(menu);

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('setup-create-all').setLabel('🚀 Auto Setup').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('setup-finish').setLabel('✅ Setup Abschließen').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('setup-cancel').setLabel('❌ Abbrechen').setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row, buttons] };
}

async function showMainSetupMenu(interaction) {
  const { embeds, components } = buildMainSetupMenu();
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content: null, embeds, components });
  } else {
    await interaction.update({ content: null, embeds, components });
  }
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

async function showOverview(interaction) {
  const config = await getOrCreateApplicationConfig(interaction.guildId);
  const embed = buildApplicationOverviewEmbed(config);
  const components = buildApplicationOverviewComponents(config);

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content: null, embeds: [embed], components });
  } else {
    await interaction.update({ content: null, embeds: [embed], components });
  }
}

async function showFormList(interaction) {
  const config = await getOrCreateApplicationConfig(interaction.guildId);
  const embed = buildFormListEmbed(config);
  const components = buildFormListComponents(config);
  await interaction.update({ content: null, embeds: [embed], components });
}

async function showFormDetail(interaction, formId) {
  const config = await getOrCreateApplicationConfig(interaction.guildId);
  const form = findForm(config, formId);
  if (!form) {
    return interaction.update({ content: '❌ Formular nicht gefunden.', embeds: [], components: [] });
  }
  const embed = buildFormDetailEmbed(form);
  const components = buildFormDetailComponents(form);
  await interaction.update({ content: null, embeds: [embed], components });
}

async function showTemplateList(interaction) {
  const embed = buildTemplateListEmbed();
  const components = buildTemplateListComponents(TEMPLATES);
  await interaction.update({ content: null, embeds: [embed], components });
}

// Neuer Screen für die Nachrichten-Einstellungen
async function showMessageSettings(interaction, formId) {
  const config = await getOrCreateApplicationConfig(interaction.guildId);
  const form = findForm(config, formId);
  if (!form) return interaction.update({ content: '❌ Formular nicht gefunden.', embeds: [], components: [] });

  const embed = buildMessageSettingsEmbed(form);
  const components = buildMessageSettingsComponents(form);
  await interaction.update({ content: null, embeds: [embed], components });
}

// ---------------------------------------------------------------------------
// Main entry: Buttons / Select Menus
// ---------------------------------------------------------------------------

async function handleApplicationSetupInteraction(interaction) {
  if (!hasManageGuild(interaction)) return denyNoPermission(interaction);

  const id = interaction.customId;

  // --- Select menus zuerst (Präfix-Überlappung vermeiden) ---
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

  // Select-Menü für Nachrichten-Slot-Auswahl
  if (interaction.isStringSelectMenu() && id.startsWith('applicationsetup-msgslotselect-')) {
    const formId = id.replace('applicationsetup-msgslotselect-', '');
    const slotKey = interaction.values[0];
    const config = await getOrCreateApplicationConfig(interaction.guildId);
    const form = findForm(config, formId);
    if (!form) return interaction.update({ content: '❌ Formular nicht gefunden.', embeds: [], components: [] });
    return interaction.showModal(buildMessageEditModal(form, slotKey));
  }

  if (interaction.isStringSelectMenu() && id === 'applicationsetup-templateselect') {
    const templateId = interaction.values[0];
    const template = getTemplate(templateId);
    if (!template) {
      return interaction.update({ content: '❌ Vorlage nicht gefunden.', embeds: [], components: [] });
    }

    const config = await getOrCreateApplicationConfig(interaction.guildId);
    const formId = generateUniqueFormId(config, template.label);

    config.forms.push({
      formId,
      label: template.label,
      description: template.description,
      emoji: template.emoji,
      buttonChannelId: null,
      buttonMessageId: null,
      targetTestRoleKey: template.targetTestRoleKey,
      closed: false,
      closedReason: null,
      active: false,
      questions: template.questions.map((q, i) => ({
        id: `q${i + 1}_${Date.now().toString(36)}`,
        label: q.label,
        style: q.style,
        required: q.required,
        maxLength: q.style === 'paragraph' ? 1000 : 200,
        page: Math.floor(i / MAX_QUESTIONS_PER_PAGE) + 1,
      })),
    });
    await config.save();

    return showFormDetail(interaction, formId);
  }

  if (interaction.isStringSelectMenu() && id.startsWith('applicationsetup-closereasonselect-')) {
    const formId = id.replace('applicationsetup-closereasonselect-', '');
    const presetValue = interaction.values[0];

    if (presetValue === 'custom') {
      return interaction.showModal(buildCloseReasonCustomModal(formId));
    }

    const preset = CLOSE_REASON_PRESETS.find(r => r.value === presetValue);
    const config = await getOrCreateApplicationConfig(interaction.guildId);
    const form = findForm(config, formId);
    if (form && preset) {
      form.closed = true;
      form.closedReason = preset.label;
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
      await postOrUpdateApplyButton(interaction.client, config, form);
      await config.save();
    }
    return showFormDetail(interaction, formId);
  }

  // --- Overview-level buttons ---
  if (id === 'applicationsetup-channel') {
    return interaction.update({
      content: 'Bitte wähle den Review-Channel über das Channel-Auswahlmenü unten aus.',
      embeds: [],
      components: [buildChannelSelectRow('applicationsetup-channelselect')],
    });
  }

  if (id === 'applicationsetup-reviewers') {
    const roleOptions = await getConfiguredRoleKeys(interaction.guildId);
    if (!roleOptions.length) {
      return interaction.update({
        content: '⚠️ Es sind noch keine Rollen im Rollen-Setup konfiguriert. Bitte richte zuerst das Rollen-Setup ein.',
        embeds: [],
        components: [],
      });
    }
    return interaction.update({
      content: 'Wähle die Rolle(n), die Bewerbungen annehmen/ablehnen dürfen (aus dem Rollen-Setup):',
      embeds: [],
      components: [buildRoleKeySelectRow(roleOptions, 'applicationsetup-reviewersselect', true)],
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

  if (id === 'applicationsetup-templates') {
    return showTemplateList(interaction);
  }

  if (id === 'applicationsetup-back' || id === 'applicationsetup-overview') {
    return showOverview(interaction);
  }

  // Button "Nachrichten anpassen"
  if (id.startsWith('applicationsetup-messages-')) {
    const formId = id.replace('applicationsetup-messages-', '');
    return showMessageSettings(interaction, formId);
  }

  // ── Zurück ins Haupt-Setup-Menü ──────────────────────────────────────────
  if (id === 'setup-menu-back') {
    return showMainSetupMenu(interaction);
  }

  // --- Quick-Toggle aus der Formular-Liste ---
  if (id.startsWith('applicationsetup-quicktoggle-')) {
    const formId = id.replace('applicationsetup-quicktoggle-', '');
    return handleFormAction(interaction, 'formtoggle', formId, true);
  }

  // --- Form detail buttons (dynamic formId suffix) ---
  const dynamicMatch = id.match(/^applicationsetup-(formedit|formchannel|formrole|formquestionadd|formquestionremove|formtoggle|formclose|formdelete)-(.+)$/);
  if (dynamicMatch) {
    const [, action, formId] = dynamicMatch;
    return handleFormAction(interaction, action, formId);
  }
}

async function handleFormAction(interaction, action, formId, backToList = false) {
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
      const roleOptions = await getConfiguredRoleKeys(interaction.guildId);
      if (!roleOptions.length) {
        return interaction.update({
          content: '⚠️ Es sind noch keine Rollen im Rollen-Setup konfiguriert.',
          embeds: [],
          components: [],
        });
      }
      return interaction.update({
        content: `Wähle die Test-Rolle, die bei erfolgreicher Einstellung für **${form.label}** vergeben wird:`,
        embeds: [],
        components: [buildRoleKeySelectRow(roleOptions, `applicationsetup-formroleselect-${formId}`, false)],
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
      return backToList ? showFormList(interaction) : showFormDetail(interaction, formId);
    }

    case 'formclose': {
      if (form.closed) {
        form.closed = false;
        form.closedReason = null;
        await config.save();
        await postOrUpdateApplyButton(interaction.client, config, form);
        await config.save();
        return showFormDetail(interaction, formId);
      }
      return interaction.update({
        content: `Wähle einen Grund für die Schließung von **${form.label}** (wird Bewerbern angezeigt):`,
        embeds: [],
        components: buildCloseReasonSelectRow(formId),
      });
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
    const formId = generateUniqueFormId(config, label);

    config.forms.push({
      formId,
      label,
      description,
      emoji: '📋',
      buttonChannelId: null,
      buttonMessageId: null,
      targetTestRoleKey: null,
      closed: false,
      closedReason: null,
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

  const closeReasonMatch = id.match(/^applicationsetup-modal-closereason-(.+)$/);
  if (closeReasonMatch) {
    await interaction.deferUpdate();
    const formId = closeReasonMatch[1];
    const config = await getOrCreateApplicationConfig(interaction.guildId);
    const form = findForm(config, formId);

    if (form) {
      const reason = interaction.fields.getTextInputValue('reason').trim();
      form.closed = true;
      form.closedReason = reason;
      await config.save();
    }
    return showFormDetail(interaction, formId);
  }

  // Submit für das Nachrichten-Edit-Modal
  const msgEditMatch = id.match(/^applicationsetup-modal-msgedit-(.+)-(accepted|denied|hired|rejectedAfter|reviewChannel)$/);
  if (msgEditMatch) {
    await interaction.deferUpdate();
    const [, formId, slotKey] = msgEditMatch;
    const config = await getOrCreateApplicationConfig(interaction.guildId);
    const form = findForm(config, formId);

    if (form) {
      const text = interaction.fields.getTextInputValue('text').trim();
      const imageUrl = interaction.fields.getTextInputValue('imageUrl').trim();

      if (!form.messages) form.messages = {};
      form.messages[slotKey] = {
        text: text || null,
        imageUrl: imageUrl || null,
      };
      await config.save();
    }
    return showMessageSettings(interaction, formId);
  }
}

// ---------------------------------------------------------------------------
// Shared select-menu row builders
// ---------------------------------------------------------------------------

function buildChannelSelectRow(customId) {
  return new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder('Channel auswählen...')
      .addChannelTypes(ChannelType.GuildText)
  );
}

function buildRoleKeySelectRow(roleOptions, customId, isMulti) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder('Rolle(n) auswählen...')
    .addOptions(roleOptions.slice(0, 25).map(r => ({ label: r.label, value: r.key, emoji: r.emoji })));

  if (isMulti) {
    menu.setMinValues(1).setMaxValues(Math.min(roleOptions.length, 25));
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
