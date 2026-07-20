import { REST, Routes } from 'discord.js';
import fs from 'fs';
import path from 'path';
import BotClient from '../client';
import config from '../config';

export async function loadCommands(client: BotClient): Promise<void> {
  const commandsPath = path.join(__dirname, '..', 'commands');
  const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js') || file.endsWith('.ts'));

  const commands: any[] = [];

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath).default;

    if (!command?.data || !command?.execute) {
      console.warn(`[Command] Skipping ${file} - missing data or execute`);
      continue;
    }

    client.commands.set(command.data.name, command);
    commands.push(command.data.toJSON());
    console.info(`[Command] Loaded: /${command.data.name}`);
  }

  const rest = new REST({ version: '10' }).setToken(config.token);

  try {
    if (config.devGuildId) {
      await rest.put(Routes.applicationGuildCommands(config.clientId, config.devGuildId), {
        body: commands,
      });
      console.info(`[Commands] Registered ${commands.length} commands to guild ${config.devGuildId}`);
    } else {
      await rest.put(Routes.applicationCommands(config.clientId), {
        body: commands,
      });
      console.info(`[Commands] Registered ${commands.length} commands globally`);
    }
  } catch (error) {
    console.error('[Commands] Failed to register:', error);
  }
}
