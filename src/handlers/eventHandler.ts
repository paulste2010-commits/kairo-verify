import fs from 'fs';
import path from 'path';
import BotClient from '../client';

export async function loadEvents(client: BotClient): Promise<void> {
  const eventsPath = path.join(__dirname, '..', 'events');
  const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith('.js') || file.endsWith('.ts'));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath).default;

    if (!event?.name || !event?.execute) {
      console.warn(`[Event] Skipping ${file} - missing name or execute`);
      continue;
    }

    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      client.on(event.name, (...args) => event.execute(...args));
    }

    console.info(`[Event] Loaded: ${event.name}`);
  }
}
