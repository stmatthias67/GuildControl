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
    key: "bronze_donater",
    label: "Bronze Donater",
    emoji: "🥉",
    color: 0xcd7f32,
    description: "Bronze-Spender – hat den Server mit einem Bronze-Beitrag unterstützt.",
    permissions: [],
    hoist: false,
    mentionable: false
  },
  {
    key: "silber_donater",
    label: "Silber Donater",
    emoji: "🥈",
    color: 0xc0c0c0,
    description: "Silber-Spender – hat den Server mit einem Silber-Beitrag unterstützt.",
    permissions: [],
    hoist: false,
    mentionable: false
  },
  {
    key: "gold_donater",
    label: "Gold Donater",
    emoji: "🥇",
    color: 0xffd700,
    description: "Gold-Spender – hat den Server großzügig unterstützt.",
    permissions: [],
    hoist: true,
    mentionable: false
  },
  {
    key: "platin_donater",
    label: "Platin Donater",
    emoji: "💎",
    color: 0xe8e8e8,
    description: "Platin-Spender – hat den Server auf höchstem Level unterstützt.",
    permissions: [],
    hoist: true,
    mentionable: false
  },
  {
    key: "partner",
    label: "Partner",
    emoji: "🤝",
    color: 0x9b59b6,
    description: "Partner-Rolle für offizielle Server-Partner.",
    permissions: [],
    hoist: true,
    mentionable: true
  },
  {
    key: "nitro_booster",
    label: "Nitro Booster",
    emoji: "💜",
    color: 0xf47fff,
    description: "Nitro-Booster – boostet aktiv den Server.",
    permissions: [],
    hoist: true,
    mentionable: false
  }
];

module.exports = { ROLE_DEFINITIONS };
