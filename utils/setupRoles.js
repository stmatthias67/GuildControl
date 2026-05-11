const { PermissionsBitField } = require("discord.js");
const { ROLE_DEFINITIONS } = require("./rolePermissions");

async function createRoleForKey(guild, roleKey) {
  const def = ROLE_DEFINITIONS.find((r) => r.key === roleKey);
  if (!def) throw new Error(`Keine Rollendefinition für Key: ${roleKey}`);

  const permissionsBitField =
    def.permissions.length > 0
      ? new PermissionsBitField(def.permissions)
      : new PermissionsBitField(0n);

  const role = await guild.roles.create({
    name: def.label,
    color: def.color,
    hoist: def.hoist,
    mentionable: def.mentionable,
    permissions: permissionsBitField,
    reason: `GuildControl Setup – ${def.label}`
  });

  return role;
}

async function applyPermissionsToRole(guild, roleId, roleKey) {
  const def = ROLE_DEFINITIONS.find((r) => r.key === roleKey);
  if (!def) throw new Error(`Keine Rollendefinition für Key: ${roleKey}`);

  const role = await guild.roles.fetch(roleId);
  if (!role) throw new Error(`Rolle mit ID ${roleId} nicht gefunden.`);

  const permissionsBitField =
    def.permissions.length > 0
      ? new PermissionsBitField(def.permissions)
      : new PermissionsBitField(0n);

  await role.setPermissions(permissionsBitField, `GuildControl Setup – Rechte für ${def.label}`);
  await role.setColor(def.color, `GuildControl Setup – Farbe für ${def.label}`);
  await role.setHoist(def.hoist);
  await role.setMentionable(def.mentionable);

  return role;
}

function getRoleDefinition(roleKey) {
  return ROLE_DEFINITIONS.find((r) => r.key === roleKey) || null;
}

module.exports = { createRoleForKey, applyPermissionsToRole, getRoleDefinition };
