import dotenv from 'dotenv';
dotenv.config();

import BotClient from './client';
import { startDashboard } from './dashboard/server';

const client = new BotClient();

process.on('unhandledRejection', (reason) => {
  console.error('[Bot] Unhandled rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[Bot] Uncaught exception:', error);
});

client.start().then(() => {
  startDashboard();
});
