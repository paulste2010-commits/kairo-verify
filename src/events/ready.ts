import { Events } from 'discord.js';
import BotClient from '../client';
import { Event } from '../types';

const event: Event = {
  name: Events.ClientReady,
  once: true,
  execute: async (client: BotClient) => {
    console.info(`[Bot] Logged in as ${client.user?.tag}`);
    console.info(`[Bot] Serving ${client.guilds.cache.size} guilds`);
    console.info(`[Bot] ${client.commands.size} commands loaded`);

    client.user?.setActivity({
      name: 'Verify System',
      type: 3,
    });
  },
};

export default event;
