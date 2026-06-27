'use strict';

/**
 * securitySetupHandler.js
 * Verarbeitet alle Interaktionen des Security Setup Flows.
 *
 * CustomId-Präfix: securitysetup-*
 *
 * Aufgebaut nach dem gleichen Muster wie ticketHandler.js:
 *   - showSetupOverview()  → wird von setupHandler.js aufgerufen
 *   - execute()            → verarbeitet alle securitysetup-* Interaktionen
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} = require("discord.js");

const SecurityConfig = require("../models/SecurityConfig");
const {
  activateLockdown,
  liftLockdown,
  clearCache,
} = require("../utils/securityManager");

const {
  buildOverviewEmbed,
  buildOverviewComponents,
  buildGeneralEmbed,
  buildGeneralComponents,
  buildSpamEmbed,
  buildSpamComponents,
  buildLinksEmbed,
  buildLinksComponents,
  buildMentionsEmbed,
  buildMentionsComponents,
  buildCapsEmbed,
  buildCapsComponents,
  buildVerificationEmbed,
  buildVerificationComponents,
  buildAntiRaidEmbed,
  buildAntiRaidComponents,
  buildRolesEmbed,
  buildRolesComponents,
  buildLockdownEmbed,
  buildLockdownComponents,
  buildSpamSettingsModal,
  buildMentionSettingsModal,
  buildCapsSettingsModal,
  buildAntiRaidSettingsModal,
  buildPunishmentModal,
  buildLockdownModal,
  buildDomainsModal,
} = require("../utils/securityBuilder");

// ── MongoDB Helpers ───────────────────────────────────────────────────────────

const MONGO_TIMEOUT_MS = 8000;

async function withTimeout(fn, name) {
  return Promise.race([
    fn(),
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error(`MongoDB ${name} timeout`)), MONGO_TIMEOUT_MS)
    )
  ]);
}

async function getOrCreate(guildId) {
  return withTimeout(async () => {
    let cfg = await SecurityConfig.findOne({ guildId });
    if (!cfg) cfg = await SecurityConfig.create({ guildId });
    return cfg;
  }, "getOrCreate SecurityConfig");
}

// ── ADMIN-CHECK ───────────────────────────────────────────────────────────────

function isAdmin(member) {
  return member.permissions.has("Administrator") ||
    member.permissions.has("ManageGuild");
}

// ── HAUPT-EINSTIEG (wird von setupHandler aufgerufen) ─────────────────────────

/**
 * Zeigt die Security Setup Übersicht.
 * Entspricht showSetupOverview() in ticketHandler.js.
 */
async function showSetupOverview(interaction) {
  await interaction.deferReply({ ephemeral: true }).catch(() => null);

  if (!isAdmin(interaction.member)) {
    return interaction.editReply({ content: "❌ Keine Berechtigung." });
  }

  try {
    const cfg = await getOrCreate(interaction.guild.id);
    await interaction.editReply({
      embeds:     [buildOverviewEmbed(cfg)],
      components: buildOverviewComponents(cfg),
    });
  } catch (err) {
    console.error("[SecuritySetup] showSetupOverview:", err);
    await interaction.editReply({ content: "❌ Fehler beim Laden der Security Konfiguration." });
  }
}

// ── INTERACTION ROUTER ────────────────────────────────────────────────────────

async function execute(interaction, client) {
  if (!interaction.customId?.startsWith("securitysetup-")) return;

  if (!isAdmin(interaction.member)) {
    return interaction.reply({ content: "❌ Keine Berechtigung.", ephemeral: true });
  }

  const id = interaction.customId;

  // ── Modals werden nicht gedeferrt ──────────────────────────────────────────
  const modalTriggers = [
    "securitysetup-spam-settings",
    "securitysetup-mentions-settings",
    "securitysetup-caps-settings",
    "securitysetup-antiraid-settings",
    "securitysetup-lockdown-activate",
    "securitysetup-links-domains",
  ];
  const isPunishmentModal = id.startsWith("securitysetup-") && id.endsWith("-punishment") && !id.includes("modal");

  if (!interaction.isModalSubmit() && (modalTriggers.includes(id) || isPunishmentModal)) {
    return handleModalTrigger(interaction);
  }

  // ── Alle anderen → defer ──────────────────────────────────────────────────
  if (!interaction.isModalSubmit()) {
    await interaction.deferUpdate().catch(() => null);
  } else {
    await interaction.deferUpdate().catch(() => null);
  }

  try {
    const cfg = await getOrCreate(interaction.guild.id);

    // ── Zurück-Navigation ─────────────────────────────────────────────────────
    if (id === "securitysetup-back-overview") return showOverview(interaction, cfg);
    if (id === "securitysetup-back-main") return showMainSetup(interaction);

    // ── System Toggle ─────────────────────────────────────────────────────────
    if (id === "securitysetup-toggle-system") return handleToggleSystem(interaction, cfg);

    // ── Menu-Auswahl ──────────────────────────────────────────────────────────
    if (interaction.isStringSelectMenu() && id === "securitysetup-menu") {
      return handleMenuSelect(interaction, cfg);
    }

    // ── Button-Navigation (ersetzt das Dropdown-Menü) ─────────────────────────
    const navMap = {
      'securitysetup-nav-general':      'general',
      'securitysetup-nav-spam':         'spam',
      'securitysetup-nav-links':        'links',
      'securitysetup-nav-mentions':     'mentions',
      'securitysetup-nav-caps':         'caps',
      'securitysetup-nav-verification': 'verification',
      'securitysetup-nav-antiraid':     'antiraid',
      'securitysetup-nav-roles':        'roles',
      'securitysetup-nav-lockdown':     'lockdown',
    };
    if (navMap[id]) {
      return handleMenuSelect(interaction, cfg, navMap[id]);
    }

    // ── Allgemein ─────────────────────────────────────────────────────────────
    if (interaction.isChannelSelectMenu() && id === "securitysetup-set-logchannel") {
      return handleSetLogChannel(interaction, cfg);
    }

    // ── Spam ──────────────────────────────────────────────────────────────────
    if (id === "securitysetup-spam-toggle")      return handleFeatureToggle(interaction, cfg, "spam");
    if (id === "securitysetup-modal-spam" && interaction.isModalSubmit()) return handleSpamModal(interaction, cfg);

    // ── Links ─────────────────────────────────────────────────────────────────
    if (id === "securitysetup-links-toggle")         return handleFeatureToggle(interaction, cfg, "links");
    if (id === "securitysetup-links-toggleinvites")  return handleToggleInvites(interaction, cfg);
    if (id === "securitysetup-modal-domains" && interaction.isModalSubmit()) return handleDomainsModal(interaction, cfg);

    // ── Mentions ──────────────────────────────────────────────────────────────
    if (id === "securitysetup-mentions-toggle")  return handleFeatureToggle(interaction, cfg, "mentions");
    if (id === "securitysetup-modal-mentions" && interaction.isModalSubmit()) return handleMentionsModal(interaction, cfg);

    // ── Caps ──────────────────────────────────────────────────────────────────
    if (id === "securitysetup-caps-toggle")     return handleFeatureToggle(interaction, cfg, "caps");
    if (id === "securitysetup-modal-caps" && interaction.isModalSubmit()) return handleCapsModal(interaction, cfg);

    // ── Verification ──────────────────────────────────────────────────────────
    if (id === "securitysetup-verification-toggle") return handleFeatureToggle(interaction, cfg, "verification");
    if (interaction.isStringSelectMenu() && id === "securitysetup-verification-type") return handleVerificationType(interaction, cfg);
    if (interaction.isChannelSelectMenu() && id === "securitysetup-verification-channel") return handleVerificationChannel(interaction, cfg);
    if (interaction.isRoleSelectMenu()   && id === "securitysetup-verification-verifiedrole")   return handleVerificationRole(interaction, cfg, "verifiedRoleId");
    if (interaction.isRoleSelectMenu()   && id === "securitysetup-verification-unverifiedrole") return handleVerificationRole(interaction, cfg, "unverifiedRoleId");
    if (id === "securitysetup-verification-sendpanel") return handleVerificationSendPanel(interaction, cfg);

    // ── Anti Raid ─────────────────────────────────────────────────────────────
    if (id === "securitysetup-antiraid-toggle")        return handleFeatureToggle(interaction, cfg, "antiRaid");
    if (id === "securitysetup-antiraid-togglelockdown") return handleToggleAutoLockdown(interaction, cfg);
    if (interaction.isStringSelectMenu() && id === "securitysetup-antiraid-action") return handleAntiRaidAction(interaction, cfg);
    if (id === "securitysetup-modal-antiraid" && interaction.isModalSubmit()) return handleAntiRaidModal(interaction, cfg);

    // ── Rollen ────────────────────────────────────────────────────────────────
    if (interaction.isRoleSelectMenu() && id === "securitysetup-roles-muterole")   return handleMuteRole(interaction, cfg);
    if (interaction.isRoleSelectMenu() && id === "securitysetup-roles-bypass")     return handleBypassRoles(interaction, cfg);
    if (interaction.isRoleSelectMenu() && id === "securitysetup-roles-lockdown")   return handleLockdownRoles(interaction, cfg);

    // ── Lockdown ──────────────────────────────────────────────────────────────
    if (id === "securitysetup-modal-lockdown" && interaction.isModalSubmit()) return handleLockdownModal(interaction, cfg);

    // ── Punishment Modals ─────────────────────────────────────────────────────
    if (interaction.isModalSubmit() && id.startsWith("securitysetup-modal-punishment-")) {
      return handlePunishmentModal(interaction, cfg);
    }

  } catch (err) {
    console.error("[SecuritySetup] execute:", err);
    await interaction.editReply({ content: "❌ Ein Fehler ist aufgetreten.", embeds: [], components: [] }).catch(() => null);
  }
}

// ── MODAL TRIGGER HANDLER ─────────────────────────────────────────────────────

async function handleModalTrigger(interaction) {
  try {
    const cfg = await getOrCreate(interaction.guild.id);
    const id  = interaction.customId;

    if (id === "securitysetup-spam-settings")     return interaction.showModal(buildSpamSettingsModal(cfg));
    if (id === "securitysetup-mentions-settings") return interaction.showModal(buildMentionSettingsModal(cfg));
    if (id === "securitysetup-caps-settings")     return interaction.showModal(buildCapsSettingsModal(cfg));
    if (id === "securitysetup-antiraid-settings") return interaction.showModal(buildAntiRaidSettingsModal(cfg));
    if (id === "securitysetup-links-domains")     return interaction.showModal(buildDomainsModal(cfg));

    if (id === "securitysetup-lockdown-activate") {
      if (cfg.lockdown?.active) {
        // Lockdown aufheben → direkt, kein Modal
        await interaction.deferUpdate().catch(() => null);
        await liftLockdown(interaction.guild, interaction.user.id);
        clearCache(interaction.guild.id);
        const updated = await getOrCreate(interaction.guild.id);
        return interaction.editReply({
          embeds:     [buildLockdownEmbed(updated)],
          components: buildLockdownComponents(updated),
        }).catch(() => null);
      }
      return interaction.showModal(buildLockdownModal());
    }

    // Punishment Modal
    if (id.endsWith("-punishment")) {
      const feature = id.replace("securitysetup-", "").replace("-punishment", "");
      return interaction.showModal(buildPunishmentModal(feature, cfg));
    }
  } catch (err) {
    console.error("[SecuritySetup] handleModalTrigger:", err);
    await interaction.reply({ content: "❌ Fehler.", ephemeral: true }).catch(() => null);
  }
}

// ── NAVIGATION ────────────────────────────────────────────────────────────────

async function showOverview(interaction, cfg) {
  // cfg ggf. neu laden
  const fresh = cfg ?? await getOrCreate(interaction.guild.id);
  await interaction.editReply({
    embeds:     [buildOverviewEmbed(fresh)],
    components: buildOverviewComponents(fresh),
  }).catch(() => null);
}

async function showMainSetup(interaction) {
  const { buildMainSetupMenu } = require('./setupHandler');
  const { embeds, components } = buildMainSetupMenu();

  await interaction.editReply({ embeds, components }).catch(() => null);
}

// ── FEATURE HANDLERS ──────────────────────────────────────────────────────────

async function handleMenuSelect(interaction, cfg, section = null) {
  // Wenn via Button aufgerufen, section direkt nutzen;
  // wenn via StringSelectMenu, aus interaction.values lesen
  const value = section ?? interaction.values?.[0];

  switch (value) {
    case 'general':      return showGeneral(interaction, cfg);
    case 'spam':         return showSpam(interaction, cfg);
    case 'links':        return showLinks(interaction, cfg);
    case 'mentions':     return showMentions(interaction, cfg);
    case 'caps':         return showCaps(interaction, cfg);
    case 'verification': return showVerification(interaction, cfg);
    case 'antiraid':     return showAntiRaid(interaction, cfg);
    case 'roles':        return showRoles(interaction, cfg);
    case 'lockdown':     return showLockdown(interaction, cfg);
    default:
      return interaction.followUp({ content: '❌ Unbekannter Bereich.', ephemeral: true });
  }
}

async function handleToggleSystem(interaction, cfg) {
  cfg.enabled = !cfg.enabled;
  await cfg.save();
  clearCache(interaction.guild.id);
  await showOverview(interaction, cfg);
}

async function handleSetLogChannel(interaction, cfg) {
  const channelId = interaction.values[0];
  cfg.logChannelId = channelId;
  await cfg.save();
  clearCache(interaction.guild.id);
  await interaction.editReply({
    embeds:     [buildGeneralEmbed(cfg)],
    components: buildGeneralComponents(),
  }).catch(() => null);
}

// Generischer Feature-Toggle (spam, links, mentions, caps, verification, antiRaid)
async function handleFeatureToggle(interaction, cfg, feature) {
  cfg[feature].enabled = !cfg[feature].enabled;
  await cfg.save();
  clearCache(interaction.guild.id);

  const views = {
    spam:         () => ({ embeds: [buildSpamEmbed(cfg)],          components: buildSpamComponents(cfg) }),
    links:        () => ({ embeds: [buildLinksEmbed(cfg)],         components: buildLinksComponents(cfg) }),
    mentions:     () => ({ embeds: [buildMentionsEmbed(cfg)],      components: buildMentionsComponents(cfg) }),
    caps:         () => ({ embeds: [buildCapsEmbed(cfg)],          components: buildCapsComponents(cfg) }),
    verification: () => ({ embeds: [buildVerificationEmbed(cfg)], components: buildVerificationComponents(cfg) }),
    antiRaid:     () => ({ embeds: [buildAntiRaidEmbed(cfg)],      components: buildAntiRaidComponents(cfg) }),
  };
  if (views[feature]) {
    await interaction.editReply(views[feature]()).catch(() => null);
  }
}

// ── SPAM MODAL ────────────────────────────────────────────────────────────────

async function handleSpamModal(interaction, cfg) {
  const max      = parseInt(interaction.fields.getTextInputValue("spam_max"),      10);
  const interval = parseInt(interaction.fields.getTextInputValue("spam_interval"), 10);

  if (isNaN(max) || isNaN(interval) || max < 1 || interval < 1) {
    return interaction.editReply({ content: "❌ Ungültige Werte. Bitte Zahlen eingeben.", embeds: [], components: [] });
  }

  cfg.spam.maxMessages = max;
  cfg.spam.interval    = interval;
  await cfg.save();
  clearCache(interaction.guild.id);
  await interaction.editReply({ embeds: [buildSpamEmbed(cfg)], components: buildSpamComponents(cfg) }).catch(() => null);
}

// ── LINK HANDLERS ─────────────────────────────────────────────────────────────

async function handleToggleInvites(interaction, cfg) {
  cfg.links.blockInvites = !cfg.links.blockInvites;
  await cfg.save();
  clearCache(interaction.guild.id);
  await interaction.editReply({ embeds: [buildLinksEmbed(cfg)], components: buildLinksComponents(cfg) }).catch(() => null);
}

async function handleDomainsModal(interaction, cfg) {
  const raw = interaction.fields.getTextInputValue("allowed_domains");
  const domains = raw.split("\n").map(d => d.trim().toLowerCase()).filter(Boolean);
  cfg.links.allowedDomains = domains;
  await cfg.save();
  clearCache(interaction.guild.id);
  await interaction.editReply({ embeds: [buildLinksEmbed(cfg)], components: buildLinksComponents(cfg) }).catch(() => null);
}

// ── MENTIONS MODAL ────────────────────────────────────────────────────────────

async function handleMentionsModal(interaction, cfg) {
  const max = parseInt(interaction.fields.getTextInputValue("mention_max"), 10);
  if (isNaN(max) || max < 1) {
    return interaction.editReply({ content: "❌ Ungültige Zahl.", embeds: [], components: [] });
  }
  cfg.mentions.maxMentions = max;
  await cfg.save();
  clearCache(interaction.guild.id);
  await interaction.editReply({ embeds: [buildMentionsEmbed(cfg)], components: buildMentionsComponents(cfg) }).catch(() => null);
}

// ── CAPS MODAL ────────────────────────────────────────────────────────────────

async function handleCapsModal(interaction, cfg) {
  const pct = parseInt(interaction.fields.getTextInputValue("caps_percentage"), 10);
  const min = parseInt(interaction.fields.getTextInputValue("caps_minlength"),  10);
  if (isNaN(pct) || isNaN(min) || pct < 1 || pct > 100 || min < 1) {
    return interaction.editReply({ content: "❌ Ungültige Werte.", embeds: [], components: [] });
  }
  cfg.caps.percentage = pct;
  cfg.caps.minLength  = min;
  await cfg.save();
  clearCache(interaction.guild.id);
  await interaction.editReply({ embeds: [buildCapsEmbed(cfg)], components: buildCapsComponents(cfg) }).catch(() => null);
}

// ── VERIFICATION HANDLERS ─────────────────────────────────────────────────────

async function handleVerificationType(interaction, cfg) {
  cfg.verification.type = interaction.values[0];
  await cfg.save();
  clearCache(interaction.guild.id);
  await interaction.editReply({ embeds: [buildVerificationEmbed(cfg)], components: buildVerificationComponents(cfg) }).catch(() => null);
}

async function handleVerificationChannel(interaction, cfg) {
  cfg.verification.channelId = interaction.values[0];
  await cfg.save();
  clearCache(interaction.guild.id);
  await interaction.editReply({ embeds: [buildVerificationEmbed(cfg)], components: buildVerificationComponents(cfg) }).catch(() => null);
}

async function handleVerificationRole(interaction, cfg, field) {
  cfg.verification[field] = interaction.values[0];
  await cfg.save();
  clearCache(interaction.guild.id);
  await interaction.editReply({ embeds: [buildVerificationEmbed(cfg)], components: buildVerificationComponents(cfg) }).catch(() => null);
}

async function handleVerificationSendPanel(interaction, cfg) {
  const v = cfg.verification;
  if (!v.channelId || !v.verifiedRoleId) {
    return interaction.editReply({
      content: "❌ Bitte setze zuerst Verify-Kanal und Verified-Rolle.",
      embeds: [], components: buildVerificationComponents(cfg)
    });
  }

  const channel = interaction.guild.channels.cache.get(v.channelId);
  if (!channel) {
    return interaction.editReply({ content: "❌ Verify-Kanal nicht gefunden.", embeds: [], components: buildVerificationComponents(cfg) });
  }

  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

  const panelEmbed = new EmbedBuilder()
    .setTitle("✅ Server Verifikation")
    .setDescription(v.message || "Klicke auf den Button um dich zu verifizieren und Zugang zum Server zu erhalten.")
    .setColor(0x57f287)
    .setFooter({ text: interaction.guild.name })
    .setTimestamp();

  const panelRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("securitysetup-verify-button")
      .setLabel("✅ Verifizieren")
      .setStyle(ButtonStyle.Success)
  );

  await channel.send({ embeds: [panelEmbed], components: [panelRow] });
  await interaction.editReply({
    embeds: [new EmbedBuilder().setDescription(`✅ Verify-Panel wurde in <#${v.channelId}> gesendet.`).setColor(0x57f287)],
    components: []
  }).catch(() => null);
}

// ── ANTI RAID HANDLERS ────────────────────────────────────────────────────────

async function handleAntiRaidAction(interaction, cfg) {
  cfg.antiRaid.action = interaction.values[0];
  await cfg.save();
  clearCache(interaction.guild.id);
  await interaction.editReply({ embeds: [buildAntiRaidEmbed(cfg)], components: buildAntiRaidComponents(cfg) }).catch(() => null);
}

async function handleToggleAutoLockdown(interaction, cfg) {
  cfg.antiRaid.autoLockdown = !cfg.antiRaid.autoLockdown;
  await cfg.save();
  clearCache(interaction.guild.id);
  await interaction.editReply({ embeds: [buildAntiRaidEmbed(cfg)], components: buildAntiRaidComponents(cfg) }).catch(() => null);
}

async function handleAntiRaidModal(interaction, cfg) {
  const threshold = parseInt(interaction.fields.getTextInputValue("raid_threshold"), 10);
  const interval  = parseInt(interaction.fields.getTextInputValue("raid_interval"),  10);
  if (isNaN(threshold) || isNaN(interval) || threshold < 2 || interval < 1) {
    return interaction.editReply({ content: "❌ Ungültige Werte.", embeds: [], components: [] });
  }
  cfg.antiRaid.joinThreshold = threshold;
  cfg.antiRaid.joinInterval  = interval;
  await cfg.save();
  clearCache(interaction.guild.id);
  await interaction.editReply({ embeds: [buildAntiRaidEmbed(cfg)], components: buildAntiRaidComponents(cfg) }).catch(() => null);
}

// ── ROLLEN HANDLERS ───────────────────────────────────────────────────────────

async function handleMuteRole(interaction, cfg) {
  cfg.roles.muteRoleId = interaction.values[0];
  await cfg.save();
  clearCache(interaction.guild.id);
  await interaction.editReply({ embeds: [buildRolesEmbed(cfg)], components: buildRolesComponents() }).catch(() => null);
}

async function handleBypassRoles(interaction, cfg) {
  cfg.roles.bypassRoleIds = interaction.values;
  await cfg.save();
  clearCache(interaction.guild.id);
  await interaction.editReply({ embeds: [buildRolesEmbed(cfg)], components: buildRolesComponents() }).catch(() => null);
}

async function handleLockdownRoles(interaction, cfg) {
  cfg.roles.lockdownRoleIds = interaction.values;
  await cfg.save();
  clearCache(interaction.guild.id);
  await interaction.editReply({ embeds: [buildRolesEmbed(cfg)], components: buildRolesComponents() }).catch(() => null);
}

// ── LOCKDOWN MODAL ────────────────────────────────────────────────────────────

async function handleLockdownModal(interaction, cfg) {
  const reason = interaction.fields.getTextInputValue("lockdown_reason") || "Kein Grund angegeben";
  await activateLockdown(interaction.guild, interaction.user.id, reason);
  clearCache(interaction.guild.id);
  const updated = await getOrCreate(interaction.guild.id);
  await interaction.editReply({
    embeds:     [buildLockdownEmbed(updated)],
    components: buildLockdownComponents(updated),
  }).catch(() => null);
}

// ── PUNISHMENT MODAL ──────────────────────────────────────────────────────────

async function handlePunishmentModal(interaction, cfg) {
  // securitysetup-modal-punishment-spam → feature = "spam"
  const feature = interaction.customId.replace("securitysetup-modal-punishment-", "");
  const validFeatures = ["spam", "links", "mentions", "caps"];
  if (!validFeatures.includes(feature)) return;

  const typeRaw  = interaction.fields.getTextInputValue("punishment_type").toLowerCase().trim();
  const durRaw   = interaction.fields.getTextInputValue("punishment_duration");
  const duration = parseInt(durRaw, 10) || 0;

  const validTypes = ["warn", "mute", "kick", "ban"];
  if (!validTypes.includes(typeRaw)) {
    return interaction.editReply({ content: `❌ Ungültiger Typ. Erlaubt: ${validTypes.join(", ")}`, embeds: [], components: [] });
  }

  cfg[feature].punishment = { type: typeRaw, duration };
  await cfg.save();
  clearCache(interaction.guild.id);

  const views = {
    spam:     () => ({ embeds: [buildSpamEmbed(cfg)],     components: buildSpamComponents(cfg) }),
    links:    () => ({ embeds: [buildLinksEmbed(cfg)],    components: buildLinksComponents(cfg) }),
    mentions: () => ({ embeds: [buildMentionsEmbed(cfg)], components: buildMentionsComponents(cfg) }),
    caps:     () => ({ embeds: [buildCapsEmbed(cfg)],     components: buildCapsComponents(cfg) }),
  };
  await interaction.editReply(views[feature]()).catch(() => null);
}

// ─────────────────────────────────────────────────────────────────────────────
// VERIFY BUTTON HANDLER (wird in index.js separat geroutet)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wird aufgerufen wenn ein User auf "✅ Verifizieren" klickt.
 * Gibt die Verified-Rolle und entfernt ggf. die Unverified-Rolle.
 */
async function handleVerifyButton(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const cfg = await SecurityConfig.findOne({ guildId: interaction.guild.id });
    if (!cfg?.verification?.enabled || !cfg.verification.verifiedRoleId) {
      return interaction.editReply({ content: "❌ Verification ist nicht konfiguriert." });
    }

    const member = interaction.member;

    if (member.roles.cache.has(cfg.verification.verifiedRoleId)) {
      return interaction.editReply({ content: "✅ Du bist bereits verifiziert!" });
    }

    await member.roles.add(cfg.verification.verifiedRoleId, "Verification").catch(() => null);

    if (cfg.verification.unverifiedRoleId) {
      await member.roles.remove(cfg.verification.unverifiedRoleId, "Verification").catch(() => null);
    }

    await interaction.editReply({
      content: "✅ Du wurdest erfolgreich verifiziert! Willkommen auf dem Server."
    });

  } catch (err) {
    console.error("[Security] handleVerifyButton:", err);
    await interaction.editReply({ content: "❌ Fehler bei der Verifikation." });
  }
}

module.exports = {
  execute,
  showSetupOverview,
  handleVerifyButton,
};
