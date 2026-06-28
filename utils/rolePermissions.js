const { PermissionFlagsBits } = require("discord.js");

const ROLE_DEFINITIONS = [
  {
    key: "projektleitung",
    label: "Projektleitung",
    emoji: "👑",
    color: 0xffd700,
    description: "Höchste Führungsebene mit vollständigen Administrator-Rechten.",
    permissions: [PermissionFlagsBits.Administrator],
    hoist: true,
    mentionable: true
  },
  {
    key: "stv_projektleitung",
    label: "Stv. Projektleitung",
    emoji: "🌟",
    color: 0xffa500,
    description: "Stellvertretende Projektleitung – unterstützt die Projektleitung.",
    permissions: [
      PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.ModerateMembers,
      PermissionFlagsBits.ManageMessages
    ],
    hoist: true,
    mentionable: true
  },
  {
    key: "teamleitung",
    label: "Teamleitung",
    emoji: "🏆",
    color: 0xe74c3c,
    description: "Leitung des Teams mit erweiterten Verwaltungsrechten.",
    permissions: [
      PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageRoles
    ],
    hoist: true,
    mentionable: true
  },
  {
    key: "stv_teamleitung",
    label: "Stv. Teamleitung",
    emoji: "🎖️",
    color: 0xe67e22,
    description: "Stellvertretende Teamleitung – unterstützt die Teamleitung.",
    permissions: [
      PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.ManageChannels
    ],
    hoist: true,
    mentionable: true
  },
  {
    key: "admin",
    label: "Admin",
    emoji: "🔴",
    color: 0x992d22,
    description: "Administrations-Rolle mit erweiterten Moderationsrechten.",
    permissions: [
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.ModerateMembers,
      PermissionFlagsBits.ManageMessages
    ],
    hoist: true,
    mentionable: true
  },
  {
    key: "test_admin",
    label: "Test-Admin",
    emoji: "🔶",
    color: 0xe74c3c,
    description: "Test-Rolle für angehende Admins in der Probezeit.",
    permissions: [
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.ModerateMembers,
      PermissionFlagsBits.ManageMessages
    ],
    hoist: false,
    mentionable: false
  },
  {
    key: "moderator",
    label: "Moderator",
    emoji: "🛡️",
    color: 0x3498db,
    description: "Moderations-Rolle für aktive Server-Moderation.",
    permissions: [
      PermissionFlagsBits.ModerateMembers,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.ManageMessages
    ],
    hoist: true,
    mentionable: true
  },
  {
    key: "test_moderator",
    label: "Test-Moderator",
    emoji: "🔷",
    color: 0x5dade2,
    description: "Test-Rolle für angehende Moderatoren in der Probezeit.",
    permissions: [
      PermissionFlagsBits.ModerateMembers,
      PermissionFlagsBits.ManageMessages
    ],
    hoist: false,
    mentionable: false
  },
  {
    key: "supporter",
    label: "Supporter",
    emoji: "💙",
    color: 0x1abc9c,
    description: "Support-Rolle für die Betreuung von Mitgliedern.",
    permissions: [
      PermissionFlagsBits.MoveMembers,
      PermissionFlagsBits.MuteMembers,
      PermissionFlagsBits.ManageMessages
    ],
    hoist: true,
    mentionable: true
  },
  {
    key: "test_supporter",
    label: "Test-Supporter",
    emoji: "💚",
    color: 0x2ecc71,
    description: "Test-Rolle für angehende Supporter in der Probezeit.",
    permissions: [
      PermissionFlagsBits.ManageMessages
    ],
    hoist: false,
    mentionable: false
  },
  {
    key: "mitglied",
    label: "Mitglied",
    emoji: "👤",
    color: 0x95a5a6,
    description: "Standard-Mitglieder-Rolle ohne zusätzliche Rechte.",
    permissions: [],
    hoist: false,
    mentionable: false
  },
  {
    key: "bot",
    label: "Bot",
    emoji: "🤖",
    color: 0x7289da,
    description: "Wird automatisch an alle Bots vergeben, die dem Server beitreten.",
    permissions: [],
    hoist: false,
    mentionable: false
  },
];

module.exports = { ROLE_DEFINITIONS };
