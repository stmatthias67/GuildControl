const RoleLink = require('../models/RoleLink');
const UserRole = require('../models/UserRole');

/**
 * Holt alle verknüpften Rollen eines Servers.
 */
async function getLinkedRoles(guildId) {
  return RoleLink.find({ guildId });
}

/**
 * Holt eine einzelne Verknüpfung anhand der Discord-Rollen-ID.
 */
async function getLinkByDiscordRole(guildId, discordRoleId) {
  return RoleLink.findOne({ guildId, discordRoleId });
}

/**
 * Holt eine einzelne Verknüpfung anhand der Website-Rolle.
 */
async function getLinkByWebsiteRole(guildId, websiteRole) {
  return RoleLink.findOne({ guildId, websiteRole: websiteRole.toLowerCase() });
}

/**
 * Erstellt oder überschreibt eine Rollen-Verknüpfung.
 */
async function upsertRoleLink({ guildId, discordRoleId, websiteRole, createdBy }) {
  return RoleLink.findOneAndUpdate(
    { guildId, discordRoleId },
    { websiteRole: websiteRole.toLowerCase(), createdBy },
    { upsert: true, new: true }
  );
}

/**
 * Löscht eine Verknüpfung anhand der Discord-Rollen-ID.
 */
async function deleteRoleLink(guildId, discordRoleId) {
  return RoleLink.findOneAndDelete({ guildId, discordRoleId });
}

/**
 * Holt die Website-Rollen eines Users.
 */
async function getUserRoles(userId, guildId) {
  return UserRole.findOne({ userId, guildId });
}

/**
 * Synct die Discord-Rollen eines Members anhand seiner Website-Rollen.
 * Gibt { added, removed, errors } zurück.
 */
async function syncMemberRoles(member, guildId) {
  const userRoleDoc = await UserRole.findOne({ userId: member.id, guildId });
  const links = await getLinkedRoles(guildId);

  const added = [];
  const removed = [];
  const errors = [];

  for (const link of links) {
    const discordRole = member.guild.roles.cache.get(link.discordRoleId);
    if (!discordRole) {
      errors.push(`Rolle \`${link.discordRoleId}\` nicht mehr vorhanden`);
      continue;
    }

    const userHasWebsiteRole = userRoleDoc?.websiteRoles?.includes(link.websiteRole) ?? false;
    const memberHasRole = member.roles.cache.has(link.discordRoleId);

    try {
      if (userHasWebsiteRole && !memberHasRole) {
        await member.roles.add(discordRole, 'Role-Sync');
        added.push(discordRole.name);
      } else if (!userHasWebsiteRole && memberHasRole) {
        await member.roles.remove(discordRole, 'Role-Sync');
        removed.push(discordRole.name);
      }
    } catch {
      errors.push(`Keine Berechtigung für Rolle \`${discordRole.name}\``);
    }
  }

  // lastSync updaten
  await UserRole.findOneAndUpdate(
    { userId: member.id, guildId },
    { lastSync: new Date() },
    { upsert: true, new: true }
  );

  return { added, removed, errors };
}

module.exports = {
  getLinkedRoles,
  getLinkByDiscordRole,
  getLinkByWebsiteRole,
  upsertRoleLink,
  deleteRoleLink,
  getUserRoles,
  syncMemberRoles,
};
