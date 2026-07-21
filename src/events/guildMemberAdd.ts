import { Events, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
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

      const welcomeEmbed = client.embed()
        .setColor(config.colors.primary as any)
        .setTitle(`Welcome to ${member.guild.name}!`)
        .setDescription(
          `Hey ${member}, glad to have you here!\n\n` +
          `To access all channels, please verify your account by clicking the button below.`
        )
        .addFields(
          { name: '\u200b', value: '**How it works:**', inline: false },
          { name: '\u2714\ufe0f Step 1', value: 'Click the **Verify** button', inline: true },
          { name: '\u2714\ufe0f Step 2', value: 'Log in with Discord', inline: true },
          { name: '\u2714\ufe0f Step 3', value: 'Get your role instantly', inline: true },
        )
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
        .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL({ size: 64 }) })
        .setFooter({ text: `${member.guild.name} • Verification System`, iconURL: member.guild.iconURL({ size: 64 }) || undefined })
        .setTimestamp();

      const button = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setURL(`${config.dashboardUrl}/auth/login?guild=${member.guild.id}`)
          .setLabel('Verify Now')
          .setEmoji('\u2714\ufe0f')
      );

      await channel.send({
        content: `${member}`,
        embeds: [welcomeEmbed],
        components: [button],
      });
    } catch (error) {
      console.error('[Event] Error in guildMemberAdd:', error);
    }
  },
};

export default event;
