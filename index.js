require("dotenv").config();

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

const { Client, GatewayIntentBits, Collection, REST, Routes } = require("discord.js");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const setupHandler = require("./interactions/setupHandler");
const ticketHandler = require("./interactions/ticketHandler"); // ← NEU

// ── Client erstellen ─────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// ── Commands laden ──────────────────────────────────────────────────────────
client.commands = new Collection();

const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));

  if (!command?.data?.name || !command?.execute) {
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

// ── Ready Event ─────────────────────────────────────────────────────────────
client.once("ready", async () => {
  console.log(`🤖 Eingeloggt als ${client.user.tag}`);
  console.log(`📡 Verbunden mit ${client.guilds.cache.size} Server(n)`);

  // MongoDB verbinden
  if (process.env.MONGO_URI) {
    try {
      await mongoose.connect(process.env.MONGO_URI);
      console.log("✅ MongoDB verbunden");
      
      // Models laden (optional, aber gut für die Initialisierung)
      require("./models/Ticket");
      require("./models/TicketConfig");
      
    } catch (err) {
      console.error("❌ Mongo Fehler:", err);
    }
  }

  // Slash Commands registrieren
  try {
    const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
    const commandData = [...client.commands.values()].map(cmd => cmd.data.toJSON());

    await rest.put(Routes.applicationCommands(client.user.id), { body: commandData });
    console.log(`✅ ${commandData.length} Slash Command(s) registriert`);
  } catch (err) {
    console.error("❌ Fehler beim Registrieren der Slash Commands:", err);
  }
});

// ── Interaction Handler ──────────────────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {

  // =========================
  // SLASH COMMANDS
  // =========================
  if (interaction.isChatInputCommand()) {

    console.log("➡️ Command bekommen:", interaction.commandName);

    const command = client.commands.get(interaction.commandName);

    if (!command) return;

    try {

      await command.execute(interaction);

    } catch (err) {

      console.error(`❌ Fehler bei /${interaction.commandName}:`, err);

      const errorMsg = {
        content: "❌ Ein Fehler ist aufgetreten.",
        ephemeral: true
      };

      try {

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(errorMsg);
        } else {
          await interaction.reply(errorMsg);
        }

      } catch (e) {}
    }

    return;
  }

  // =========================
  // SETUP INTERACTIONS (bestehend)
  // =========================
  if (
    interaction.isButton() ||
    interaction.isStringSelectMenu() ||
    interaction.isRoleSelectMenu() ||
    interaction.isChannelSelectMenu() ||  // ← ChannelSelectMenu hinzugefügt für Ticket-Setup
    interaction.isModalSubmit()            // ← ModalSubmit hinzugefügt für Ticket-Setup
  ) {

    if (!interaction.customId) return;

    // ──────────────────────────────────────────────────────────
    // TICKET SYSTEM INTERACTIONS (NEU - PRIORITÄT 1)
    // ──────────────────────────────────────────────────────────
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
              ephemeral: true
            });
          }
        } catch (e) {}
      }
      return;
    }

    // ──────────────────────────────────────────────────────────
    // BESTEHENDES SETUP SYSTEM
    // ──────────────────────────────────────────────────────────
    const isSetupInteraction =
      interaction.customId.startsWith("setup-") ||
      interaction.customId.startsWith("role-setup-");

    if (isSetupInteraction) {
      try {
        await setupHandler.execute(interaction, client);
      } catch (err) {
        console.error("❌ Fehler im Setup-Handler:", err);
        try {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: "❌ Fehler im Setup-System.",
              ephemeral: true
            });
          }
        } catch (e) {}
      }
      return;
    }
  }
});

// ── Login ───────────────────────────────────────────────────────────────────
client.login(process.env.TOKEN);