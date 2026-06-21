require("dotenv").config();

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

const {
  Client,
  GatewayIntentBits,
  Collection,
  REST,
  Routes,
} = require("discord.js");

const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

const setupHandler = require("./interactions/setupHandler");
const ticketHandler = require("./interactions/ticketHandler");
const { handleVerifyButton } = require("./interactions/securitySetupHandler");

// ─────────────────────────────────────────────────────────────
// MongoDB verbinden
// ─────────────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB verbunden"))
  .catch((err) => console.error("❌ Mongo Fehler:", err));

//Ob Mango überhaupt verbuinden ist
mongoose.connection.on("connected", () => {
  console.log("🟢 DB CONNECTED");
});

mongoose.connection.on("error", (err) => {
  console.error("🔴 DB ERROR", err);
});

mongoose.connection.on("disconnected", () => {
  console.log("🟠 DB DISCONNECTED");
});

// Models laden
require("./models/Ticket");
require("./models/TicketConfig");
require("./models/SecurityConfig"); // ← NEU

// ─────────────────────────────────────────────────────────────
// Client erstellen
// ─────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers, // Für guildMemberAdd + AutoMod Bypass-Check
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// ─────────────────────────────────────────────────────────────
// Commands laden
// ─────────────────────────────────────────────────────────────
client.commands = new Collection();
const commandsPath = path.join(__dirname, "commands");

if (fs.existsSync(commandsPath)) {
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((f) => f.endsWith(".js"));
  for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if (!command?.data?.name || !command?.execute) {
      console.warn(`⚠️ ${file} hat keinen gültigen Command`);
      continue;
    }
    client.commands.set(command.data.name, command);
    console.log(`✅ [CMD] /${command.data.name} geladen`);
  }
}

// ─────────────────────────────────────────────────────────────
// Events laden
// ─────────────────────────────────────────────────────────────
const eventsPath = path.join(__dirname, "events");

if (fs.existsSync(eventsPath)) {
  const eventFiles = fs
    .readdirSync(eventsPath)
    .filter((f) => f.endsWith(".js"));
  for (const file of eventFiles) {
    const event = require(path.join(eventsPath, file));
    if (!event?.name || !event?.execute) {
      console.warn(`⚠️ ${file} ist kein gültiges Event`);
      continue;
    }
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
    console.log(`📡 [EVT] ${event.name} geladen`);
  }
}

// ─────────────────────────────────────────────────────────────
// Ready Event
// ─────────────────────────────────────────────────────────────
client.once("ready", async () => {
  console.log(`🤖 Eingeloggt als ${client.user.tag}`);
  console.log(`📡 Verbunden mit ${client.guilds.cache.size} Server(n)`);

  try {
    const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
    const commandData = [...client.commands.values()].map((cmd) =>
      cmd.data.toJSON(),
    );
    await rest.put(Routes.applicationCommands(client.user.id), {
      body: commandData,
    });
    console.log(`✅ ${commandData.length} Slash Command(s) registriert`);
  } catch (err) {
    console.error("❌ Fehler beim Registrieren der Slash Commands:", err);
  }
});

// ─────────────────────────────────────────────────────────────
// Interaction Handler
// ─────────────────────────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {
  console.log("[INTERACTION]", interaction.customId, interaction.type);
  // ── Slash Commands ──────────────────────────────────────────────────────────
  if (interaction.isChatInputCommand()) {
    console.log("➡️ Command bekommen:", interaction.commandName);
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`❌ Fehler bei /${interaction.commandName}:`, err);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "❌ Ein Fehler ist aufgetreten.",
            ephemeral: true,
          });
        } else {
          await interaction.followUp({
            content: "❌ Ein Fehler ist aufgetreten.",
            ephemeral: true,
          });
        }
      } catch (e) {
        console.error("❌ Fehler beim Error Reply:", e);
      }
    }
    return;
  }

  // ── Buttons / Menus / Modals ────────────────────────────────────────────────
  if (
    interaction.isButton() ||
    interaction.isStringSelectMenu() ||
    interaction.isRoleSelectMenu() ||
    interaction.isChannelSelectMenu() ||
    interaction.isModalSubmit()
  ) {
    if (!interaction.customId) return;

    // ── Verify Button (Security – kein Setup-Präfix) ──────────────────────────
    if (interaction.customId === "securitysetup-verify-button") {
      try {
        await handleVerifyButton(interaction);
      } catch (err) {
        console.error("❌ Fehler im Verify-Handler:", err);
      }
      return;
    }

    // ── Ticket System ─────────────────────────────────────────────────────────
    if (
      interaction.customId.startsWith("ticket-") ||
      interaction.customId.startsWith("ticketsetup-")
    ) {
      try {
        await ticketHandler.execute(interaction, client);
      } catch (err) {
        console.error("❌ Fehler im Ticket-Handler:", err);
        try {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: "❌ Fehler im Ticket-System.",
              ephemeral: true,
            });
          }
        } catch (e) {
          console.error(e);
        }
      }
      return;
    }

    // ── Setup System (inkl. Security) ─────────────────────────────────────────
    const isSetupInteraction =
      interaction.customId.startsWith("setup-") ||
      interaction.customId.startsWith("role-setup-") ||
      interaction.customId.startsWith("securitysetup-") ||
      interaction.customId.startsWith("ranksetup-");

    if (isSetupInteraction) {
      try {
        await setupHandler.execute(interaction, client);
      } catch (err) {
        console.error("❌ Fehler im Setup-Handler:", err);
        try {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: "❌ Fehler im Setup-System.",
              ephemeral: true,
            });
          } ////////////////////und so sieht es in setupHandler.js aus: 'use strict';

          /**
           * setupHandler.js  — ERWEITERT
           *
           * Neu:
           *  - rank → showRankSetup(interaction)
           *  - ranksetup-* → handleRankSetupInteraction(interaction)
           *
           * Präfixe:
           *   role-setup-*       → roleSetup.js
           *   ticketsetup-*      → ticketHandler.js
           *   ticket-*           → ticketHandler.js
           *   securitysetup-*    → securitySetupHandler.js
           *   ranksetup-*        → rankSetupHandler.js        ← NEU
           *   setup-*            → Haupt-Setup (dieses File)
           */

          const GuildConfig = require("./models/GuildConfig");
          const {
            startRoleSetup,
            handleRoleSetupInteraction,
          } = require("./roleSetup");
          const {
            showSetupOverview: showTicketSetup,
            execute: handleTicketInteraction,
          } = require("./ticketHandler");
          const {
            showSetupOverview: showSecuritySetup,
            execute: handleSecurityInteraction,
          } = require("./securitySetupHandler");
          const {
            showRankSetup,
            handleRankSetupInteraction,
          } = require("./rankSetupHandler"); // ← NEU

          module.exports = {
            name: "interactionCreate",

            async execute(interaction, client) {
              if (
                !interaction.isButton() &&
                !interaction.isStringSelectMenu() &&
                !interaction.isRoleSelectMenu() &&
                !interaction.isChannelSelectMenu() &&
                !interaction.isModalSubmit()
              )
                return;

              const id = interaction.customId;

              // ── Role Setup ────────────────────────────────────────────────────────────
              if (id.startsWith("role-setup-")) {
                return handleRoleSetupInteraction(interaction);
              }

              // ── Ticket System ─────────────────────────────────────────────────────────
              if (id.startsWith("ticketsetup-") || id.startsWith("ticket-")) {
                return handleTicketInteraction(interaction, client);
              }

              // ── Security System ───────────────────────────────────────────────────────
              if (id.startsWith("securitysetup-")) {
                return handleSecurityInteraction(interaction, client);
              }

              // ── Rank Setup ────────────────────────────────────────────────────────────
              if (id.startsWith("ranksetup-")) {
                return handleRankSetupInteraction(interaction);
              }

              // ── Setup Haupt-Menü ──────────────────────────────────────────────────────
              if (interaction.isStringSelectMenu() && id === "setup-menu") {
                const value = interaction.values[0];

                if (value === "roles") {
                  return startRoleSetup(interaction);
                }

                if (value === "tickets") {
                  return showTicketSetup(interaction);
                }

                if (value === "security") {
                  return showSecuritySetup(interaction);
                }

                if (value === "rank") {
                  return showRankSetup(interaction); // ← NEU
                }

                // Platzhalter für noch nicht implementierte Systeme
                const placeholders = {
                  voice: "🔊 Voice Setup",
                  applications: "📋 Bewerbungs Setup",
                  stats: "📊 Statistik Setup",
                };

                if (placeholders[value]) {
                  return interaction.reply({
                    content: `${placeholders[value]} wird bald verfügbar sein!`,
                    ephemeral: true,
                  });
                }
              }

              // ── Auto Setup ────────────────────────────────────────────────────────────
              if (id === "setup-create-all") {
                await interaction.deferReply({ ephemeral: true });

                try {
                  const roles = ["Supporter", "Mitglied"];
                  for (const roleName of roles) {
                    const exists = interaction.guild.roles.cache.find(
                      (r) => r.name === roleName,
                    );
                    if (!exists) {
                      await interaction.guild.roles.create({
                        name: roleName,
                        reason: "GuildControl Auto Setup",
                      });
                    }
                  }

                  await GuildConfig.findOneAndUpdate(
                    { guildId: interaction.guild.id },
                    {
                      guildId: interaction.guild.id,
                      systems: { moderation: true, tickets: true, logs: true },
                    },
                    { upsert: true, new: true },
                  );

                  await interaction.editReply({
                    content:
                      "✅ GuildControl Auto-Setup erfolgreich abgeschlossen!",
                  });
                } catch (err) {
                  console.error("[Setup] Auto Setup Fehler:", err);
                  await interaction.editReply({
                    content: "❌ Fehler beim Auto-Setup!",
                  });
                }

                return;
              }

              // ── Setup abbrechen ───────────────────────────────────────────────────────
              if (id === "setup-cancel") {
                return interaction.update({
                  content: "❌ Setup abgebrochen.",
                  embeds: [],
                  components: [],
                });
              }

              // ── Setup abschließen ─────────────────────────────────────────────────────
              if (id === "setup-finish") {
                return interaction.update({
                  content: "✅ Setup gespeichert.",
                  embeds: [],
                  components: [],
                });
              }
            },
          };
        } catch (e) {
          console.error(e);
        }
      }
      return;
    }
  }
});

// ─────────────────────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────────────────────
client.login(process.env.TOKEN);
