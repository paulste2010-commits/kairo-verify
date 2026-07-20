import {
  Events,
  Interaction,
  Collection,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import BotClient from '../client';
import { Event } from '../types';
import config from '../config';

const event: Event = {
  name: Events.InteractionCreate,
  execute: async (interaction: Interaction) => {
    const client = interaction.client as unknown as BotClient;

    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      const { cooldowns } = client;
      if (!cooldowns.has(command.data.name)) {
        cooldowns.set(command.data.name, new Collection());
      }
      const now = Date.now();
      const timestamps = cooldowns.get(command.data.name)!;
      const cooldownAmount = (command.cooldown || 3) * 1000;

      if (timestamps.has(interaction.user.id)) {
        const expirationTime = timestamps.get(interaction.user.id)! + cooldownAmount;
        const timeLeft = (expirationTime - now) / 1000;
        await interaction.reply({
          content: `Please wait ${timeLeft.toFixed(1)}s before using \`${command.data.name}\` again.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      timestamps.set(interaction.user.id, now);
      setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

      try {
        await interaction.deferReply({ ephemeral: true });
        await command.execute(interaction, client);
      } catch (error) {
        console.error(`[Command] Error executing ${command.data.name}:`, error);
        try {
          if (interaction.deferred) {
            await interaction.editReply({ content: 'An error occurred.' });
          } else if (!interaction.replied) {
            await interaction.reply({ content: 'An error occurred.', flags: MessageFlags.Ephemeral });
          }
        } catch {}
      }
    }
  },
};

export default event;
