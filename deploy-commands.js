require("dotenv").config();
const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");

const commands = [];
const commandsPath = path.join(__dirname, "commands");

// Alle Command-Dateien holen
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));

  if (!command.data) {
    console.warn(`⚠️ ${file} hat kein "data" Objekt`);
    continue;
  }

  commands.push(command.data.toJSON());
  console.log(`✅ Geladen: /${command.data.name}`);
}

// REST Setup
const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

// DEPLOY
(async () => {
  try {
    console.log(`\n🔄 Registriere ${commands.length} Command(s)...`);

    // 👉 GUILD COMMANDS (schnell sichtbar – empfohlen für Entwicklung)
    if (process.env.GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(
          process.env.CLIENT_ID,
          process.env.GUILD_ID
        ),
        { body: commands }
      );

      console.log("✅ Guild Commands erfolgreich registriert!");
    } 
    
    // 👉 GLOBAL COMMANDS (dauert bis zu 1h)
    else {
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands }
      );

      console.log("✅ Globale Commands erfolgreich registriert!");
    }

  } catch (error) {
    console.error("❌ Fehler beim Registrieren:", error);
  }
})();