require("dotenv").config();

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

const { Client, GatewayIntentBits, Collection } = require("discord.js");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

// ── Client erstellen ─────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
});

// ── Commands laden ──────────────────────────────────────────────────────────
client.commands = new Collection();

const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));

  if (!command?.data?.name) {
    console.warn(`⚠️ ${file} hat keinen gültigen Command`);
    continue;
  }

  client.commands.set(command.data.name, command);
  console.log(`✅ [CMD] /${command.data.name} geladen`);
}

// ── Events laden ────────────────────────────────────────────────────────────
const eventsPath = path.join(__dirname, "events");

if (fs.existsSync(eventsPath)) {
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith(".js"));

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

// ── MongoDB verbinden ───────────────────────────────────────────────────────
if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB verbunden"))
    .catch(err => console.error("❌ Mongo Fehler:", err));
}

// ── Ready Event (Fallback) ──────────────────────────────────────────────────
client.once("ready", () => {
  console.log(`🤖 Eingeloggt als ${client.user.tag}`);
  console.log(`📡 Verbunden mit ${client.guilds.cache.size} Server(n)`);
});

// ── Interaction Handler (Fallback) ──────────────────────────────────────────

client.on("interactionCreate", async interaction => {
  if (interaction.isChatInputCommand()) {
    console.log("➡️ Command bekommen:", interaction.commandName);

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`❌ Fehler bei /${interaction.commandName}:`, error);
    }
  }

  // 🔥 NEU: Setup Interactions (Buttons, Selects)
  else if (interaction.isButton() || interaction.isStringSelectMenu()) {
    try {
      const setupHandler = require("./interactions/setupHandler");
      await setupHandler(interaction);
    } catch (err) {
      console.error("❌ Setup Interaction Fehler:", err);
    }
  }
});

// ── Login ───────────────────────────────────────────────────────────────────
client.login(process.env.TOKEN);