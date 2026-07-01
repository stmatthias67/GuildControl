require("dotenv").config();

process.on("unhandledRejection", (err) => {
  console.error(err);
  logCriticalError('unhandledRejection', err);
});
process.on("uncaughtException", (err) => {
  console.error(err);
  logCriticalError('uncaughtException', err);
});


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

const { routeComponentInteraction } = require("./interactions/router");
const { initApplicationScheduler } = require("./utils/applicationScheduler");

const { initStatsUpdater } = require('./utils/statsUpdater');
require('./models/StatsConfig');

const { logCriticalError } = require('./utils/errorLogger');
// ─────────────────────────────────────────────────────────────
// MongoDB verbinden
// ─────────────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB verbunden"))
  .catch((err) => {
    console.error("❌ Mongo Fehler:", err);
    logCriticalError('db-connection-failed', err);
  });

mongoose.connection.on("error", (err) => {
  console.error("🔴 DB ERROR", err);
  logCriticalError('db-connection-error', err);
});

mongoose.connection.on("connected", () => console.log("🟢 DB CONNECTED"));
mongoose.connection.on("error", (err) => console.error("🔴 DB ERROR", err));
mongoose.connection.on("disconnected", () => console.log("🟠 DB DISCONNECTED"));

// Models laden
require("./models/Ticket");
require("./models/TicketConfig");
require("./models/SecurityConfig");
require("./models/RankConfig");

require("./models/ApplicationConfig");
require("./models/Application");
require("./models/BlockedApplicant");

require("./models/VoiceConfig");
require("./models/SupportCase");

// ─────────────────────────────────────────────────────────────
// Client erstellen
// ─────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// ─────────────────────────────────────────────────────────────
// Commands laden
// ─────────────────────────────────────────────────────────────
client.commands = new Collection();
const commandsPath = path.join(__dirname, "commands");

if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter((f) => f.endsWith(".js"));
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
  const eventFiles = fs.readdirSync(eventsPath).filter((f) => f.endsWith(".js"));
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
    const commandData = [...client.commands.values()].map((cmd) => cmd.data.toJSON());
    await rest.put(Routes.applicationCommands(client.user.id), { body: commandData });
    console.log(`✅ ${commandData.length} Slash Command(s) registriert`);
  } catch (err) {
    console.error("❌ Fehler beim Registrieren der Slash Commands:", err);
  }

  initApplicationScheduler(client);
  initStatsUpdater(client);
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
          await interaction.reply({ content: "❌ Ein Fehler ist aufgetreten.", ephemeral: true });
        } else {
          await interaction.followUp({ content: "❌ Ein Fehler ist aufgetreten.", ephemeral: true });
        }
      } catch (e) {
        console.error("❌ Fehler beim Error Reply:", e);
      }
    }
    return;
  }

  // ── Buttons / Menus / Modals: zentral über den Router ─────────────────────
  if (
    interaction.isButton() ||
    interaction.isStringSelectMenu() ||
    interaction.isRoleSelectMenu() ||
    interaction.isChannelSelectMenu() ||
    interaction.isModalSubmit()
  ) {
    await routeComponentInteraction(interaction, client);
  }
});

// ─────────────────────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────────────────────
client.login(process.env.TOKEN);