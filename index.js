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

const applicationSetupHandler = require("./interactions/applicationSetupHandler");
const applicationHandler = require("./interactions/applicationHandler");
const { initApplicationScheduler } = require("./utils/applicationScheduler");

const voiceSetupHandler = require("./interactions/voiceSetupHandler");
const supportCaseHandler = require("./interactions/supportCaseHandler");

// ─────────────────────────────────────────────────────────────
// MongoDB verbinden
// ─────────────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB verbunden"))
  .catch((err) => console.error("❌ Mongo Fehler:", err));

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

  // ── Bewerbungs-Scheduler starten ──────────────────────────────────────────
  initApplicationScheduler(client);
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

    // ── Bewerbungs-Setup (applicationsetup-*) ─────────────────────────────────
    if (interaction.customId.startsWith("applicationsetup-")) {
      try {
        if (interaction.isModalSubmit()) {
          await applicationSetupHandler.handleApplicationSetupModalSubmit(interaction);
        } else {
          await applicationSetupHandler.handleApplicationSetupInteraction(interaction);
        }
      } catch (err) {
        console.error("❌ Fehler im Bewerbungs-Setup-Handler:", err);
        try {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: "❌ Fehler im Bewerbungs-Setup.",
              ephemeral: true,
            });
          }
        } catch (e) {
          console.error(e);
        }
      }
      return;
    }

    // ── Bewerbungs-Live-System (application-*) ────────────────────────────────
    if (interaction.customId.startsWith("application-")) {
      try {
        await handleApplicationLiveInteraction(interaction, client);
      } catch (err) {
        console.error("❌ Fehler im Bewerbungs-Live-Handler:", err);
        try {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: "❌ Fehler im Bewerbungssystem.",
              ephemeral: true,
            });
          }
        } catch (e) {
          console.error(e);
        }
      }
      return;
    }

    // ── Voice-Setup (voicesetup-*) ─────────────────────────────────────────────
    if (interaction.customId.startsWith("voicesetup-")) {
      try {
        if (interaction.isModalSubmit()) {
          await voiceSetupHandler.handleVoiceSetupModalSubmit(interaction);
        } else {
          await voiceSetupHandler.handleVoiceSetupInteraction(interaction);
        }
      } catch (err) {
        console.error("❌ Fehler im Voice-Setup-Handler:", err);
        try {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: "❌ Fehler im Voice-Setup.",
              ephemeral: true,
            });
          }
        } catch (e) {
          console.error(e);
        }
      }
      return;
    }

    // ── Support-Case-System (supportcase-*) ────────────────────────────────────
    if (interaction.customId.startsWith("supportcase-")) {
      try {
        await handleSupportCaseRouting(interaction);
      } catch (err) {
        console.error("❌ Fehler im Support-Case-Handler:", err);
        try {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: "❌ Fehler im Support-System.",
              ephemeral: true,
            });
          }
        } catch (e) {
          console.error(e);
        }
      }
      return;
    }

    // ── Setup System (inkl. Security, Roles, Ranks) ───────────────────────────
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
          }
        } catch (e) {
          console.error(e);
        }
      }
      return;
    }
  }
});

// ─────────────────────────────────────────────────────────────
// Bewerbungs-Live-System: Routing-Helper
// ─────────────────────────────────────────────────────────────
async function handleApplicationLiveInteraction(interaction, client) {
  const id = interaction.customId;

  if (interaction.isModalSubmit()) {
    if (id.startsWith("application-modal-apply-")) {
      return applicationHandler.handleApplicationModalSubmit(interaction);
    }
    const proposeMatch = id.match(/^application-modal-proposeslots-(.+)$/);
    if (proposeMatch) {
      return applicationHandler.handleProposeSlotsSubmit(interaction, proposeMatch[1]);
    }
    return;
  }

  if (interaction.isStringSelectMenu()) {
    const slotMatch = id.match(/^application-slotchoice-(.+)$/);
    if (slotMatch) {
      return applicationHandler.handleSlotChoice(interaction, slotMatch[1]);
    }
    return;
  }

  if (id.startsWith("application-apply-")) {
    return applicationHandler.handleApplyButton(interaction, id.replace("application-apply-", ""));
  }

  if (id.startsWith("application-nextpage-")) {
    return applicationHandler.handleNextPageButton(interaction);
  }

  const acceptMatch = id.match(/^application-accept-(.+)$/);
  if (acceptMatch) {
    return applicationHandler.handleReviewDecision(interaction, "accept", acceptMatch[1]);
  }

  const denyMatch = id.match(/^application-deny-(.+)$/);
  if (denyMatch) {
    return applicationHandler.handleReviewDecision(interaction, "deny", denyMatch[1]);
  }

  const cancelMatch = id.match(/^application-cancelappt-(.+)$/);
  if (cancelMatch) {
    return applicationHandler.handleCancelAppointment(interaction, cancelMatch[1]);
  }

  const rescheduleMatch = id.match(/^application-reschedule-(.+)$/);
  if (rescheduleMatch) {
    return applicationHandler.handleReschedule(interaction, rescheduleMatch[1]);
  }

  const noShowMatch = id.match(/^application-noshow-(.+)$/);
  if (noShowMatch) {
    return applicationHandler.handleNoShow(interaction, noShowMatch[1]);
  }

  const hireMatch = id.match(/^application-hire-(.+)$/);
  if (hireMatch) {
    return applicationHandler.handleFinalDecision(interaction, "hire", hireMatch[1]);
  }

  const rejectMatch = id.match(/^application-reject-(.+)$/);
  if (rejectMatch) {
    return applicationHandler.handleFinalDecision(interaction, "reject", rejectMatch[1]);
  }
}

// ─────────────────────────────────────────────────────────────
// Support-Case-System: Routing-Helper
// ─────────────────────────────────────────────────────────────
async function handleSupportCaseRouting(interaction) {
  const id = interaction.customId;

  if (interaction.isModalSubmit()) {
    const closeMatch = id.match(/^supportcase-modal-close-(.+)$/);
    if (closeMatch) {
      return supportCaseHandler.handleCloseModalSubmit(interaction, closeMatch[1]);
    }

    const cancelMatch = id.match(/^supportcase-modal-cancelreason-(.+)$/);
    if (cancelMatch) {
      return supportCaseHandler.handleCancelReasonModalSubmit(interaction, cancelMatch[1]);
    }
    return;
  }

  if (interaction.isStringSelectMenu()) {
    const cancelSelectMatch = id.match(/^supportcase-cancelreasonselect-(.+)$/);
    if (cancelSelectMatch) {
      return supportCaseHandler.handleCancelReasonSelect(interaction, cancelSelectMatch[1]);
    }

    const callRoleSelectMatch = id.match(/^supportcase-callroleselect-(.+)$/);
    if (callRoleSelectMatch) {
      return supportCaseHandler.handleCallRoleSelect(interaction, callRoleSelectMatch[1]);
    }
    return;
  }

  const claimMatch = id.match(/^supportcase-claim-(.+)$/);
  if (claimMatch) {
    return supportCaseHandler.handleClaimCase(interaction, claimMatch[1]);
  }

  const closeMatch = id.match(/^supportcase-close-(.+)$/);
  if (closeMatch) {
    return supportCaseHandler.handlePanelClose(interaction, closeMatch[1]);
  }

  const cancelMatch = id.match(/^supportcase-cancel-(.+)$/);
  if (cancelMatch) {
    return supportCaseHandler.handlePanelCancel(interaction, cancelMatch[1]);
  }

  const escalateMatch = id.match(/^supportcase-escalate-(.+)$/);
  if (escalateMatch) {
    return supportCaseHandler.handleEscalate(interaction, escalateMatch[1]);
  }

  const callroleMatch = id.match(/^supportcase-callrole-(.+)$/);
  if (callroleMatch) {
    return supportCaseHandler.handleCallSpecificRole(interaction, callroleMatch[1]);
  }
}

// ─────────────────────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────────────────────
client.login(process.env.TOKEN);