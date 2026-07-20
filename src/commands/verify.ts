import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import BotClient from '../client';
import { Command } from '../types';
import config from '../config';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Manage the verification system')
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Configure the verification system')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Channel where the verification embed will appear')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addRoleOption((option) =>
          option
            .setName('role')
            .setDescription('Role assigned after verification')
            .setRequired(true)
        )
        .addChannelOption((option) =>
          option
            .setName('log-channel')
            .setDescription('Channel for verification logs')
            .addChannelTypes(ChannelType.GuildText)
        )
        .addStringOption((option) =>
          option
            .setName('message')
            .setDescription('Custom verification message ({user}, {server})')
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('send')
        .setDescription('Send the verification embed to the configured channel')
    )
    .addSubcommand((sub) =>
      sub
        .setName('check')
        .setDescription('Check a user\'s verification status')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('User to check')
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('servers')
        .setDescription('Show all mutual servers with a user')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('User to check')
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('revoke')
        .setDescription('Revoke a user\'s verification status')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('User to revoke')
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('show')
        .setDescription('Show the current verification configuration')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  execute: async (interaction: ChatInputCommandInteraction, client: BotClient) => {
    const sub = interaction.options.getSubcommand();

    if (sub === 'setup') {
      const channel = interaction.options.getChannel('channel')!;
      const role = interaction.options.getRole('role')!;
      const logChannel = interaction.options.getChannel('log-channel');
      const message = interaction.options.getString('message');

      const data: any = {
        verifyChannelId: channel.id,
        verifyRoleId: role.id,
        verifyEnabled: true,
      };
      if (logChannel) data.verifyLogChannelId = logChannel.id;
      if (message) data.verifyMessage = message;

      await client.prisma.guildConfig.upsert({
        where: { guildId: interaction.guildId! },
        create: {
          guildId: interaction.guildId!,
          ...data,
        },
        update: data,
      });

      const embed = client.embed('Verify Configuration Updated')
        .setColor(config.colors.success as any)
        .addFields(
          { name: 'Verify Channel', value: `${channel}`, inline: true },
          { name: 'Verify Role', value: `${role}`, inline: true }
        )
        .setTimestamp();

      if (logChannel) embed.addFields({ name: 'Log Channel', value: `${logChannel}`, inline: true });

      await interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'send') {
      const guildConfig = await client.getGuildConfig(interaction.guildId!);

      if (!guildConfig.verifyChannelId || !guildConfig.verifyRoleId) {
        await interaction.editReply({
          embeds: [client.errorEmbed('Verify system is not configured. Use `/verify setup` first.')],
        });
        return;
      }

      const channel = interaction.guild!.channels.cache.get(guildConfig.verifyChannelId);
      if (!channel || !channel.isTextBased()) {
        await interaction.editReply({
          embeds: [client.errorEmbed('Verify channel not found.')],
        });
        return;
      }

      const verifyEmbed = client.embed('Verification Required')
        .setColor(config.colors.primary as any)
        .setDescription(guildConfig.verifyMessage || 'Click the button below to verify and get access to the server.')
        .setFooter({ text: 'Kairo Verify' })
        .setTimestamp();

      const authUrl = `${config.dashboardUrl}/auth/login?guild=${interaction.guildId}`;
      const button = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setURL(authUrl)
          .setLabel('Verify')
      );

      await channel.send({ embeds: [verifyEmbed], components: [button] });

      await interaction.editReply({
        embeds: [client.successEmbed(`Verification embed sent to ${channel}`)],
      });
    }

    if (sub === 'check') {
      const targetUser = interaction.options.getUser('user')!;

      const consent = await client.prisma.userConsent.findUnique({
        where: {
          guildId_userId: {
            guildId: interaction.guildId!,
            userId: targetUser.id,
          },
        },
      });

      if (!consent) {
        await interaction.editReply({
          embeds: [
            client.embed('Verification Status')
              .setColor(config.colors.warning as any)
              .setDescription(`${targetUser.tag} (${targetUser.id}) is **not verified**.`)
              .setTimestamp(),
          ],
        });
        return;
      }

      const embed = client.embed('Verification Status')
        .setColor(consent.verified ? config.colors.success as any : config.colors.danger as any)
        .addFields(
          { name: 'User', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
          { name: 'Verified', value: consent.verified ? '✅ Yes' : '❌ No', inline: true },
          { name: 'Consent', value: consent.consentGiven ? '✅ Yes' : '❌ No', inline: true },
          { name: 'Email', value: consent.email || 'Not provided', inline: true },
          { name: 'IP Address', value: consent.ipAddress || 'Not collected', inline: true },
          { name: 'Verified At', value: consent.verifiedAt ? `<t:${Math.floor(consent.verifiedAt.getTime() / 1000)}:R>` : 'Never', inline: true }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'servers') {
      const targetUser = interaction.options.getUser('user')!;

      const mutualGuilds = client.guilds.cache.filter((guild) =>
        guild.members.cache.has(targetUser.id)
      );

      if (mutualGuilds.size === 0) {
        await interaction.editReply({
          embeds: [
            client.embed('Mutual Servers')
              .setColor(config.colors.warning as any)
              .setDescription(`${targetUser.tag} has no mutual servers with the bot.`)
              .setTimestamp(),
          ],
        });
        return;
      }

      const serverList = mutualGuilds.map(
        (guild) => `• **${guild.name}** (${guild.memberCount} members)`
      );

      const embed = client.embed('Mutual Servers')
        .setColor(config.colors.primary as any)
        .setDescription(`${targetUser.tag} is on **${mutualGuilds.size}** mutual servers:`)
        .addFields({ name: 'Servers', value: serverList.join('\n') })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'revoke') {
      const targetUser = interaction.options.getUser('user')!;

      const consent = await client.prisma.userConsent.findUnique({
        where: {
          guildId_userId: {
            guildId: interaction.guildId!,
            userId: targetUser.id,
          },
        },
      });

      if (!consent || !consent.verified) {
        await interaction.editReply({
          embeds: [client.errorEmbed(`${targetUser.tag} is not verified.`)],
        });
        return;
      }

      const guildConfig = await client.getGuildConfig(interaction.guildId!);

      if (guildConfig.verifyRoleId) {
        const member = await interaction.guild!.members.fetch(targetUser.id).catch(() => null);
        if (member && member.roles.cache.has(guildConfig.verifyRoleId)) {
          await member.roles.remove(guildConfig.verifyRoleId);
        }
      }

      await client.prisma.userConsent.delete({
        where: {
          guildId_userId: {
            guildId: interaction.guildId!,
            userId: targetUser.id,
          },
        },
      });

      const logEmbed = client.embed('Verification Revoked')
        .setColor(config.colors.danger as any)
        .addFields(
          { name: 'User', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
          { name: 'Moderator', value: `${interaction.user.tag}`, inline: true }
        )
        .setTimestamp();

      await client.sendLog(interaction.guild!, logEmbed);

      await interaction.editReply({
        embeds: [client.successEmbed(`Verification for ${targetUser.tag} has been revoked.`)],
      });
    }

    if (sub === 'show') {
      const guildConfig = await client.getGuildConfig(interaction.guildId!);

      const embed = client.embed('Verify Configuration')
        .setColor(config.colors.primary as any)
        .addFields(
          {
            name: 'Verify Channel',
            value: guildConfig.verifyChannelId ? `<#${guildConfig.verifyChannelId}>` : 'Not set',
            inline: true,
          },
          {
            name: 'Verify Role',
            value: guildConfig.verifyRoleId ? `<@&${guildConfig.verifyRoleId}>` : 'Not set',
            inline: true,
          },
          {
            name: 'Log Channel',
            value: guildConfig.verifyLogChannelId ? `<#${guildConfig.verifyLogChannelId}>` : 'Not set',
            inline: true,
          },
          {
            name: 'Enabled',
            value: guildConfig.verifyEnabled ? '✅ Yes' : '❌ No',
            inline: true,
          },
          {
            name: 'Message',
            value: guildConfig.verifyMessage.substring(0, 100) + (guildConfig.verifyMessage.length > 100 ? '...' : ''),
            inline: false,
          }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  },
};

export default command;
