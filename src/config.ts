import dotenv from 'dotenv';
dotenv.config();

const config = {
  token: process.env.DISCORD_TOKEN || '',
  clientId: process.env.CLIENT_ID || '',
  clientSecret: process.env.CLIENT_SECRET || '',
  devGuildId: process.env.DEV_GUILD_ID || '',
  dashboardPort: parseInt(process.env.PORT || process.env.DASHBOARD_PORT || '3001'),
  dashboardSecret: process.env.DASHBOARD_SECRET || 'change-me',
  dashboardUrl: process.env.DASHBOARD_URL || 'http://localhost:3001',
  inviteUrl: `https://discord.com/oauth2/authorize?client_id=${process.env.CLIENT_ID || ''}&permissions=8&scope=bot+applications.commands+identify+email`,
  colors: {
    primary: '#5865F2',
    success: '#57F287',
    warning: '#FEE75C',
    danger: '#ED4245',
    blurple: '#5865F2',
  },
};

export default config;
