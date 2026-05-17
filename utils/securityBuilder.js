'use strict';

/**
 * securityBuilder.js
 * Baut alle Embeds & Discord-Komponenten für das Security Setup.
 * Äquivalent zu setupBuilder.js / ticketHandler buildOverviewEmbed etc.
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  RoleSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

/** Formatiert Boolean → Status-Emoji + Text */
const fmtStatus  = (v) => v ? "✅ Aktiv" : "❌ Inaktiv";
/** Formatiert Channel-ID → Mention oder Nicht gesetzt */
const fmtChannel = (id) => id ? `<#${id}>` : "`Nicht gesetzt`";
/** Formatiert Role-ID → Mention oder keiner */
const fmtRole    = (id) => id ? `<@&${id}>` : "`Nicht gesetzt`";
/** Formatiert Rollen-Array */
const fmtRoles   = (ids) => ids?.length ? ids.map(id => `<@&${id}>`).join(", ") : "`Keine`";

/** Punishment leserlich formatieren */
function fmtPunishment(p) {
  if (!p) return "`Keine`";
  const types = { warn: "⚠️ Verwarnung", mute: "🔇 Mute", kick: "👢 Kick", ban: "🔨 Ban" };
  const label = types[p.type] || p.type;
  if (p.type === "mute" && p.duration > 0) return `${label} (${p.duration} Min.)`;
  return label;
}

// ── ÜBERSICHT ─────────────────────────────────────────────────────────────────

/**
 * Haupt-Übersicht des Security Setups.
 * Zeigt alle Feature-Status auf einen Blick.
 */
function buildOverviewEmbed(cfg) {
  const systemStatus = cfg.enabled ? "🟢 **Aktiv**" : "🔴 **Inaktiv**";
  const lockdownBadge = cfg.lockdown?.active ? " 🚨 **LOCKDOWN AKTIV**" : "";

  return new EmbedBuilder()
    .setTitle(`🛡️ Security Setup – Übersicht${lockdownBadge}`)
    .setColor(cfg.lockdown?.active ? 0xed4245 : cfg.enabled ? 0x57f287 : 0x5865f2)
    .addFields(
      {
        name: "System",
        value: `${systemStatus}\nLog-Kanal: ${fmtChannel(cfg.logChannelId)}`,
        inline: false
      },
      {
        name: "🤖 AutoMod",
        value: [
          `Spam:    ${fmtStatus(cfg.spam?.enabled)}`,
          `Links:   ${fmtStatus(cfg.links?.enabled)}`,
          `Mentions:${fmtStatus(cfg.mentions?.enabled)}`,
          `Caps:    ${fmtStatus(cfg.caps?.enabled)}`,
        ].join("\n"),
        inline: true
      },
      {
        name: "🔧 Systeme",
        value: [
          `Verification: ${fmtStatus(cfg.verification?.enabled)}`,
          `Anti-Raid:    ${fmtStatus(cfg.antiRaid?.enabled)}`,
          `Lockdown:     ${cfg.lockdown?.active ? "🔴 Aktiv" : "⬛ Inaktiv"}`,
        ].join("\n"),
        inline: true
      },
      {
        name: "👮 Rollen",
        value: [
          `Mute-Rolle:     ${fmtRole(cfg.roles?.muteRoleId)}`,
          `Bypass:         ${fmtRoles(cfg.roles?.bypassRoleIds)}`,
          `Lockdown-Berechtigung: ${fmtRoles(cfg.roles?.lockdownRoleIds)}`,
        ].join("\n"),
        inline: false
      },
      {
        name: "Status",
        value: cfg.setupDone ? "✅ Setup abgeschlossen" : "⚠️ Setup noch nicht abgeschlossen",
        inline: false
      }
    )
    .setTimestamp();
}

function buildOverviewComponents(cfg) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("securitysetup-menu")
    .setPlaceholder("Bereich auswählen...")
    .addOptions([
      new StringSelectMenuOptionBuilder()
        .setLabel("Allgemein")
        .setDescription("System aktivieren & Log-Kanal setzen")
        .setValue("general")
        .setEmoji("⚙️"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Spam Schutz")
        .setDescription("Anti-Spam konfigurieren")
        .setValue("spam")
        .setEmoji("📨"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Link Schutz")
        .setDescription("Links & Invite-Filter")
        .setValue("links")
        .setEmoji("🔗"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Mention Spam")
        .setDescription("Massen-Mentions blockieren")
        .setValue("mentions")
        .setEmoji("📢"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Caps Schutz")
        .setDescription("GROSSSCHRIFT-Filter")
        .setValue("caps")
        .setEmoji("🔡"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Verification System")
        .setDescription("Neues-Mitglied Verifikation")
        .setValue("verification")
        .setEmoji("✅"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Anti Raid")
        .setDescription("Raid-Erkennung & Gegenmaßnahmen")
        .setValue("antiraid")
        .setEmoji("🚨"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Security Rollen")
        .setDescription("Bypass & Lockdown-Rollen")
        .setValue("roles")
        .setEmoji("👮"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Lockdown")
        .setDescription("Server-Lockdown aktivieren / deaktivieren")
        .setValue("lockdown")
        .setEmoji("🔒"),
    ]);

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("securitysetup-toggle-system")
      .setLabel(cfg.enabled ? "System deaktivieren" : "System aktivieren")
      .setStyle(cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("securitysetup-back-main")
      .setLabel("← Zurück zum Setup")
      .setStyle(ButtonStyle.Secondary)
  );

  return [
    new ActionRowBuilder().addComponents(menu),
    buttons
  ];
}

// ── ALLGEMEIN ─────────────────────────────────────────────────────────────────

function buildGeneralEmbed(cfg) {
  return new EmbedBuilder()
    .setTitle("⚙️ Security – Allgemein")
    .setColor(0x5865f2)
    .setDescription("Aktiviere das Security System und wähle den Log-Kanal.")
    .addFields(
      { name: "System", value: fmtStatus(cfg.enabled), inline: true },
      { name: "Log-Kanal", value: fmtChannel(cfg.logChannelId), inline: true },
    );
}

function buildGeneralComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("securitysetup-set-logchannel")
        .setPlaceholder("📋 Log-Kanal auswählen...")
        .setChannelTypes(ChannelType.GuildText)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("securitysetup-back-overview")
        .setLabel("← Zurück zur Übersicht")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

// ── SPAM ─────────────────────────────────────────────────────────────────────

function buildSpamEmbed(cfg) {
  const s = cfg.spam;
  return new EmbedBuilder()
    .setTitle("📨 Spam Schutz")
    .setColor(0xfee75c)
    .setDescription("Blockiert User die zu viele Nachrichten in kurzer Zeit senden.")
    .addFields(
      { name: "Status",      value: fmtStatus(s.enabled),                    inline: true },
      { name: "Max. Nachrichten", value: `\`${s.maxMessages}\` Nachrichten`, inline: true },
      { name: "Zeitfenster", value: `\`${s.interval}\` Sekunden`,            inline: true },
      { name: "Bestrafung",  value: fmtPunishment(s.punishment),             inline: true },
    );
}

function buildSpamComponents(cfg) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("securitysetup-spam-toggle")
        .setLabel(cfg.spam.enabled ? "Deaktivieren" : "Aktivieren")
        .setStyle(cfg.spam.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("securitysetup-spam-settings")
        .setLabel("⚙️ Einstellungen")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("securitysetup-spam-punishment")
        .setLabel("⚖️ Bestrafung")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("securitysetup-back-overview")
        .setLabel("← Zurück")
        .setStyle(ButtonStyle.Secondary),
    )
  ];
}

// ── LINKS ─────────────────────────────────────────────────────────────────────

function buildLinksEmbed(cfg) {
  const l = cfg.links;
  return new EmbedBuilder()
    .setTitle("🔗 Link Schutz")
    .setColor(0xfee75c)
    .setDescription("Blockiert unerwünschte Links und Discord-Invites.")
    .addFields(
      { name: "Status",            value: fmtStatus(l.enabled),      inline: true },
      { name: "Invite-Filter",     value: fmtStatus(l.blockInvites), inline: true },
      { name: "Erlaubte Domains",  value: l.allowedDomains?.length ? l.allowedDomains.map(d => `\`${d}\``).join(", ") : "`Alle blockiert`", inline: false },
      { name: "Bestrafung",        value: fmtPunishment(l.punishment), inline: true },
    );
}

function buildLinksComponents(cfg) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("securitysetup-links-toggle")
        .setLabel(cfg.links.enabled ? "Deaktivieren" : "Aktivieren")
        .setStyle(cfg.links.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("securitysetup-links-toggleinvites")
        .setLabel(cfg.links.blockInvites ? "✅ Invite-Filter" : "❌ Invite-Filter")
        .setStyle(cfg.links.blockInvites ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("securitysetup-links-domains")
        .setLabel("🌐 Erlaubte Domains")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("securitysetup-links-punishment")
        .setLabel("⚖️ Bestrafung")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("securitysetup-back-overview")
        .setLabel("← Zurück")
        .setStyle(ButtonStyle.Secondary),
    )
  ];
}

// ── MENTIONS ──────────────────────────────────────────────────────────────────

function buildMentionsEmbed(cfg) {
  const m = cfg.mentions;
  return new EmbedBuilder()
    .setTitle("📢 Mention Spam Schutz")
    .setColor(0xfee75c)
    .setDescription("Blockiert Nachrichten mit zu vielen @-Mentions.")
    .addFields(
      { name: "Status",         value: fmtStatus(m.enabled),          inline: true },
      { name: "Max. Mentions",  value: `\`${m.maxMentions}\` Mentions`, inline: true },
      { name: "Bestrafung",     value: fmtPunishment(m.punishment),   inline: true },
    );
}

function buildMentionsComponents(cfg) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("securitysetup-mentions-toggle")
        .setLabel(cfg.mentions.enabled ? "Deaktivieren" : "Aktivieren")
        .setStyle(cfg.mentions.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("securitysetup-mentions-settings")
        .setLabel("⚙️ Max. Mentions setzen")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("securitysetup-mentions-punishment")
        .setLabel("⚖️ Bestrafung")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("securitysetup-back-overview")
        .setLabel("← Zurück")
        .setStyle(ButtonStyle.Secondary),
    )
  ];
}

// ── CAPS ──────────────────────────────────────────────────────────────────────

function buildCapsEmbed(cfg) {
  const c = cfg.caps;
  return new EmbedBuilder()
    .setTitle("🔡 Caps Schutz")
    .setColor(0xfee75c)
    .setDescription("Löscht Nachrichten die zu viele Großbuchstaben enthalten.")
    .addFields(
      { name: "Status",       value: fmtStatus(c.enabled),             inline: true },
      { name: "Caps %",       value: `Ab \`${c.percentage}%\` Großbuchstaben`, inline: true },
      { name: "Min. Länge",   value: `\`${c.minLength}\` Zeichen`,     inline: true },
      { name: "Bestrafung",   value: fmtPunishment(c.punishment),      inline: true },
    );
}

function buildCapsComponents(cfg) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("securitysetup-caps-toggle")
        .setLabel(cfg.caps.enabled ? "Deaktivieren" : "Aktivieren")
        .setStyle(cfg.caps.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("securitysetup-caps-settings")
        .setLabel("⚙️ Einstellungen")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("securitysetup-caps-punishment")
        .setLabel("⚖️ Bestrafung")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("securitysetup-back-overview")
        .setLabel("← Zurück")
        .setStyle(ButtonStyle.Secondary),
    )
  ];
}

// ── VERIFICATION ──────────────────────────────────────────────────────────────

function buildVerificationEmbed(cfg) {
  const v = cfg.verification;
  const types = { button: "🔘 Button", captcha: "🔐 Captcha", reaction: "👍 Reaction" };
  return new EmbedBuilder()
    .setTitle("✅ Verification System")
    .setColor(0x57f287)
    .setDescription("Neue Mitglieder müssen sich verifizieren bevor sie den Server nutzen können.")
    .addFields(
      { name: "Status",             value: fmtStatus(v.enabled),         inline: true },
      { name: "Typ",                value: types[v.type] || v.type,       inline: true },
      { name: "Verify-Kanal",       value: fmtChannel(v.channelId),      inline: true },
      { name: "Verified-Rolle",     value: fmtRole(v.verifiedRoleId),    inline: true },
      { name: "Unverified-Rolle",   value: fmtRole(v.unverifiedRoleId),  inline: true },
    );
}

function buildVerificationComponents(cfg) {
  const typeMenu = new StringSelectMenuBuilder()
    .setCustomId("securitysetup-verification-type")
    .setPlaceholder("Verifikations-Typ wählen...")
    .addOptions([
      new StringSelectMenuOptionBuilder().setLabel("Button").setDescription("Klick-Button zur Verifikation").setValue("button").setEmoji("🔘").setDefault(cfg.verification.type === "button"),
      new StringSelectMenuOptionBuilder().setLabel("Reaction").setDescription("Emoji-Reaction zur Verifikation").setValue("reaction").setEmoji("👍").setDefault(cfg.verification.type === "reaction"),
    ]);

  return [
    new ActionRowBuilder().addComponents(typeMenu),
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("securitysetup-verification-channel")
        .setPlaceholder("Verify-Kanal wählen...")
        .setChannelTypes(ChannelType.GuildText)
    ),
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId("securitysetup-verification-verifiedrole")
        .setPlaceholder("✅ Verified-Rolle wählen...")
    ),
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId("securitysetup-verification-unverifiedrole")
        .setPlaceholder("❓ Unverified-Rolle wählen (optional)...")
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("securitysetup-verification-toggle")
        .setLabel(cfg.verification.enabled ? "Deaktivieren" : "Aktivieren")
        .setStyle(cfg.verification.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("securitysetup-verification-sendpanel")
        .setLabel("📤 Verify-Panel senden")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("securitysetup-back-overview")
        .setLabel("← Zurück")
        .setStyle(ButtonStyle.Secondary),
    )
  ];
}

// ── ANTI RAID ─────────────────────────────────────────────────────────────────

function buildAntiRaidEmbed(cfg) {
  const r = cfg.antiRaid;
  const actions = { kick: "👢 Kick", ban: "🔨 Ban", lockdown: "🔒 Lockdown" };
  return new EmbedBuilder()
    .setTitle("🚨 Anti Raid")
    .setColor(0xed4245)
    .setDescription("Erkennt und stoppt koordinierte Raid-Angriffe automatisch.")
    .addFields(
      { name: "Status",         value: fmtStatus(r.enabled),                               inline: true },
      { name: "Join-Schwelle",  value: `\`${r.joinThreshold}\` Joins / \`${r.joinInterval}\`s`, inline: true },
      { name: "Aktion",         value: actions[r.action] || r.action,                      inline: true },
      { name: "Auto-Lockdown",  value: fmtStatus(r.autoLockdown),                          inline: true },
    );
}

function buildAntiRaidComponents(cfg) {
  const actionMenu = new StringSelectMenuBuilder()
    .setCustomId("securitysetup-antiraid-action")
    .setPlaceholder("Raid-Aktion wählen...")
    .addOptions([
      new StringSelectMenuOptionBuilder().setLabel("Kick").setDescription("Alle Raider werden gekickt").setValue("kick").setEmoji("👢").setDefault(cfg.antiRaid.action === "kick"),
      new StringSelectMenuOptionBuilder().setLabel("Ban").setDescription("Alle Raider werden gebannt").setValue("ban").setEmoji("🔨").setDefault(cfg.antiRaid.action === "ban"),
      new StringSelectMenuOptionBuilder().setLabel("Lockdown").setDescription("Automatischer Server-Lockdown").setValue("lockdown").setEmoji("🔒").setDefault(cfg.antiRaid.action === "lockdown"),
    ]);

  return [
    new ActionRowBuilder().addComponents(actionMenu),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("securitysetup-antiraid-toggle")
        .setLabel(cfg.antiRaid.enabled ? "Deaktivieren" : "Aktivieren")
        .setStyle(cfg.antiRaid.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("securitysetup-antiraid-settings")
        .setLabel("⚙️ Schwellen setzen")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("securitysetup-antiraid-togglelockdown")
        .setLabel(cfg.antiRaid.autoLockdown ? "✅ Auto-Lockdown" : "❌ Auto-Lockdown")
        .setStyle(cfg.antiRaid.autoLockdown ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("securitysetup-back-overview")
        .setLabel("← Zurück")
        .setStyle(ButtonStyle.Secondary),
    )
  ];
}

// ── ROLLEN ────────────────────────────────────────────────────────────────────

function buildRolesEmbed(cfg) {
  return new EmbedBuilder()
    .setTitle("👮 Security Rollen")
    .setColor(0x5865f2)
    .setDescription("Konfiguriere welche Rollen vom AutoMod ausgenommen sind und wer den Lockdown aktivieren darf.")
    .addFields(
      { name: "🔇 Mute-Rolle",              value: fmtRole(cfg.roles?.muteRoleId),        inline: false },
      { name: "🛡️ AutoMod Bypass",          value: fmtRoles(cfg.roles?.bypassRoleIds),   inline: false },
      { name: "🔒 Lockdown-Berechtigung",   value: fmtRoles(cfg.roles?.lockdownRoleIds), inline: false },
    );
}

function buildRolesComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId("securitysetup-roles-muterole")
        .setPlaceholder("🔇 Mute-Rolle wählen...")
    ),
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId("securitysetup-roles-bypass")
        .setPlaceholder("🛡️ AutoMod Bypass-Rollen wählen (mehrere möglich)...")
        .setMinValues(1)
        .setMaxValues(10)
    ),
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId("securitysetup-roles-lockdown")
        .setPlaceholder("🔒 Lockdown-Berechtigung-Rollen wählen...")
        .setMinValues(1)
        .setMaxValues(10)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("securitysetup-back-overview")
        .setLabel("← Zurück")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

// ── LOCKDOWN ──────────────────────────────────────────────────────────────────

function buildLockdownEmbed(cfg) {
  const ld = cfg.lockdown;
  const isActive = ld?.active;

  let statusText = isActive ? "🔴 **LOCKDOWN AKTIV**" : "⬛ Kein Lockdown";
  if (isActive) {
    if (ld.activatedAt) statusText += `\nSeit: <t:${Math.floor(new Date(ld.activatedAt).getTime() / 1000)}:R>`;
    if (ld.activatedBy) statusText += `\nVon: <@${ld.activatedBy}>`;
    if (ld.reason) statusText += `\nGrund: ${ld.reason}`;
  }

  return new EmbedBuilder()
    .setTitle("🔒 Server Lockdown")
    .setColor(isActive ? 0xed4245 : 0x5865f2)
    .setDescription(
      isActive
        ? "⚠️ Der Server befindet sich im **Lockdown-Modus**. Alle öffentlichen Channels sind gesperrt."
        : "Aktiviere den Lockdown um alle öffentlichen Channels sofort zu sperren.\n\n⚠️ **Diese Aktion betrifft den gesamten Server!**"
    )
    .addFields({ name: "Status", value: statusText, inline: false });
}

function buildLockdownComponents(cfg) {
  const isActive = cfg.lockdown?.active;
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("securitysetup-lockdown-activate")
        .setLabel(isActive ? "🔓 Lockdown aufheben" : "🔒 Lockdown aktivieren")
        .setStyle(isActive ? ButtonStyle.Success : ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("securitysetup-back-overview")
        .setLabel("← Zurück")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

// ── MODALS ───────────────────────────────────────────────────────────────────

function buildSpamSettingsModal(cfg) {
  return new ModalBuilder()
    .setCustomId("securitysetup-modal-spam")
    .setTitle("Spam Schutz – Einstellungen")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("spam_max")
          .setLabel(`Max. Nachrichten (aktuell: ${cfg.spam.maxMessages})`)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("z.B. 5")
          .setRequired(true)
          .setMinLength(1).setMaxLength(2)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("spam_interval")
          .setLabel(`Zeitfenster in Sekunden (aktuell: ${cfg.spam.interval}s)`)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("z.B. 5")
          .setRequired(true)
          .setMinLength(1).setMaxLength(3)
      )
    );
}

function buildMentionSettingsModal(cfg) {
  return new ModalBuilder()
    .setCustomId("securitysetup-modal-mentions")
    .setTitle("Mention Spam – Einstellungen")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("mention_max")
          .setLabel(`Max. Mentions pro Nachricht (aktuell: ${cfg.mentions.maxMentions})`)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("z.B. 5")
          .setRequired(true)
          .setMinLength(1).setMaxLength(2)
      )
    );
}

function buildCapsSettingsModal(cfg) {
  return new ModalBuilder()
    .setCustomId("securitysetup-modal-caps")
    .setTitle("Caps Schutz – Einstellungen")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("caps_percentage")
          .setLabel(`Caps % (aktuell: ${cfg.caps.percentage}%)`)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("z.B. 70")
          .setRequired(true)
          .setMinLength(1).setMaxLength(3)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("caps_minlength")
          .setLabel(`Min. Nachrichtenlänge (aktuell: ${cfg.caps.minLength} Zeichen)`)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("z.B. 10")
          .setRequired(true)
          .setMinLength(1).setMaxLength(3)
      )
    );
}

function buildAntiRaidSettingsModal(cfg) {
  return new ModalBuilder()
    .setCustomId("securitysetup-modal-antiraid")
    .setTitle("Anti Raid – Schwellen")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("raid_threshold")
          .setLabel(`Joins um Raid auszulösen (aktuell: ${cfg.antiRaid.joinThreshold})`)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("z.B. 10")
          .setRequired(true)
          .setMinLength(1).setMaxLength(3)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("raid_interval")
          .setLabel(`Zeitfenster in Sekunden (aktuell: ${cfg.antiRaid.joinInterval}s)`)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("z.B. 10")
          .setRequired(true)
          .setMinLength(1).setMaxLength(3)
      )
    );
}

function buildPunishmentModal(feature, cfg) {
  const current = cfg[feature]?.punishment;
  return new ModalBuilder()
    .setCustomId(`securitysetup-modal-punishment-${feature}`)
    .setTitle(`Bestrafung – ${feature}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("punishment_type")
          .setLabel(`Typ: warn / mute / kick / ban (aktuell: ${current?.type ?? "warn"})`)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("warn")
          .setRequired(true)
          .setMaxLength(4)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("punishment_duration")
          .setLabel("Mute-Dauer in Minuten (nur bei mute, sonst 0)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("10")
          .setRequired(false)
          .setMaxLength(4)
      )
    );
}

function buildLockdownModal() {
  return new ModalBuilder()
    .setCustomId("securitysetup-modal-lockdown")
    .setTitle("🔒 Lockdown aktivieren")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("lockdown_reason")
          .setLabel("Grund für den Lockdown")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("z.B. Raid-Angriff erkannt")
          .setRequired(false)
          .setMaxLength(200)
      )
    );
}

function buildDomainsModal(cfg) {
  return new ModalBuilder()
    .setCustomId("securitysetup-modal-domains")
    .setTitle("Erlaubte Domains")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("allowed_domains")
          .setLabel("Erlaubte Domains (eine pro Zeile)")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("discord.gg\nyoutube.com\ntwitch.tv")
          .setRequired(false)
          .setValue(cfg.links.allowedDomains?.join("\n") ?? "")
          .setMaxLength(500)
      )
    );
}

module.exports = {
  // Übersicht
  buildOverviewEmbed,
  buildOverviewComponents,
  // Allgemein
  buildGeneralEmbed,
  buildGeneralComponents,
  // AutoMod
  buildSpamEmbed, buildSpamComponents,
  buildLinksEmbed, buildLinksComponents,
  buildMentionsEmbed, buildMentionsComponents,
  buildCapsEmbed, buildCapsComponents,
  // Systeme
  buildVerificationEmbed, buildVerificationComponents,
  buildAntiRaidEmbed, buildAntiRaidComponents,
  // Rollen & Lockdown
  buildRolesEmbed, buildRolesComponents,
  buildLockdownEmbed, buildLockdownComponents,
  // Modals
  buildSpamSettingsModal,
  buildMentionSettingsModal,
  buildCapsSettingsModal,
  buildAntiRaidSettingsModal,
  buildPunishmentModal,
  buildLockdownModal,
  buildDomainsModal,
  // Helpers (für securityManager)
  fmtPunishment,
};
