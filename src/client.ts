import {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  Guild,
} from 'discord.js';
import { PrismaClient } from '@prisma/client';
import config from './config';
import { Command } from './types';

class BotClient extends Client {
  public commands: Collection<string, Command> = new Collection();
  public cooldowns: Collection<string, Collection<string, number>> = new Collection();
  public prisma: PrismaClient;
  public config = config;
  public startTime: number = Date.now();

  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [
        Partials.Message,
        Partials.Channel,
        Partials.GuildMember,
      ],
    });

    this.prisma = new PrismaClient();
  }

  public async start(): Promise<void> {
    await this.loadHandlers();
    await this.prisma.$connect();
    await this.login(config.token);
  }

  private async loadHandlers(): Promise<void> {
    const { loadCommands } = await import('./handlers/commandHandler');
    const { loadEvents } = await import('./handlers/eventHandler');

    await loadCommands(this);
    await loadEvents(this);

    console.info(`[Handlers] Loaded commands: ${this.commands.size}`);
  }

  public embed(title?: string): EmbedBuilder {
    const embed = new EmbedBuilder();
    if (title) embed.setTitle(title);
    return embed;
  }

  public errorEmbed(description: string): EmbedBuilder {
    return this.embed('Error').setDescription(description).setColor(config.colors.danger as any);
  }

  public successEmbed(description: string): EmbedBuilder {
    return this.embed('Success').setDescription(description).setColor(config.colors.success as any);
  }

  public async sendLog(guild: Guild, embed: EmbedBuilder): Promise<void> {
    const guildConfig = await this.prisma.guildConfig.findUnique({
      where: { guildId: guild.id },
    });

    if (!guildConfig?.verifyLogChannelId) return;

    const channel = guild.channels.cache.get(guildConfig.verifyLogChannelId);
    if (!channel || !channel.isTextBased()) return;

    await channel.send({ embeds: [embed] });
  }

  public async getGuildConfig(guildId: string) {
    let guildConfig = await this.prisma.guildConfig.findUnique({
      where: { guildId },
    });

    if (!guildConfig) {
      guildConfig = await this.prisma.guildConfig.create({
        data: { guildId },
      });
    }

    return guildConfig;
  }
}

export default BotClient;
