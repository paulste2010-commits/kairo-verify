import { Events, EmbedBuilder } from 'discord.js';
import BotClient from '../client';
import { Event } from '../types';
import config from '../config';

const event: Event = {
  name: Events.GuildMemberAdd,
  once: false,
  execute: async (member) => {
    try {
      const client = member.client as unknown as BotClient;
      const guildConfig = await client.getGuildConfig(member.guild.id);

      if (!guildConfig.verifyEnabled || !guildConfig.verifyChannelId) return;

      const channel = member.guild.channels.cache.get(guildConfig.verifyChannelId);
      if (!channel || !channel.isTextBased()) return;

      const existingConsent = await client.prisma.userConsent.findUnique({
        where: {
          guildId_userId: {
            guildId: member.guild.id,
            userId: member.id,
          },
        },
      });

      if (existingConsent?.verified) {
        if (guildConfig.verifyRoleId) {
          await member.roles.add(guildConfig.verifyRoleId).catch(() => null);
        }
        return;
      }

      const welcomeEmbed = client.embed('Willkommen!')
        .setColor(config.colors.primary as any)
        .setDescription(`Hallo ${member}, willkommen auf **${member.guild.name}**!\n\nUm Zugriff auf den Server zu erhalten, musst du dich verifizieren. Klicke auf den Button unten um fortzufahren.`)
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
        .setTimestamp();

      await channel.send({
        content: `${member}`,
        embeds: [welcomeEmbed],
      });
    } catch (error) {
      console.error('[Event] Error in guildMemberAdd:', error);
    }
  },
};

export default event;
