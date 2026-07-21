import express from 'express';
import path from 'path';
import fs from 'fs';
import config from '../config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const app = express();

const srcDir = path.resolve(__dirname, '../../src/dashboard');
const distDir = path.join(__dirname, 'views');
const viewsDir = fs.existsSync(srcDir) ? path.join(srcDir, 'views') : distDir;
const publicDir = fs.existsSync(srcDir) ? path.join(srcDir, 'public') : path.join(__dirname, 'public');

app.set('view engine', 'ejs');
app.set('views', viewsDir);
app.use(express.static(publicDir));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get('/', (_req, res) => {
  res.render('index', { dashboardUrl: config.dashboardUrl, inviteUrl: config.inviteUrl });
});

// OAuth2 Login - opens Discord authorization
app.get('/auth/login', (req, res) => {
  const { guild } = req.query;
  if (!guild) {
    res.status(400).render('error', { title: 'Error', message: 'Invalid link.' });
    return;
  }
  const state = Buffer.from(JSON.stringify({ guild })).toString('base64');
  const redirectUri = `${config.dashboardUrl}/auth/callback`;
  const discordUrl = `https://discord.com/api/oauth2/authorize?client_id=${config.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify+email&state=${state}`;
  res.redirect(discordUrl);
});

// OAuth2 Callback - gets user ID + email from Discord, shows consent page
app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) {
    res.status(400).render('error', { title: 'Error', message: 'Authorization failed.' });
    return;
  }

  try {
    const { guild } = JSON.parse(Buffer.from(state as string, 'base64').toString());
    const redirectUri = `${config.dashboardUrl}/auth/callback`;

    // Exchange code for token
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'authorization_code',
        code: code as string,
        redirect_uri: redirectUri,
      }),
    });
    const tokenData = await tokenRes.json() as any;
    if (!tokenData.access_token) {
      res.status(400).render('error', { title: 'Error', message: 'Could not retrieve token.' });
      return;
    }

    // Fetch user info from Discord (ID + email)
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userRes.json() as any;
    const userId = userData.id;
    const email = userData.email || null;

    if (!userId) {
      res.status(400).render('error', { title: 'Error', message: 'Could not retrieve user info.' });
      return;
    }

    // Create/update UserConsent with email
    await prisma.userConsent.upsert({
      where: { guildId_userId: { guildId: guild, userId } },
      update: { email },
      create: {
        guildId: guild,
        userId,
        email,
        consentGiven: true,
        consentText: 'Consent given via OAuth2',
        verified: true,
        verifiedAt: new Date(),
      },
    });

    // Show consent page
    let guildName = 'Server';
    let guildIcon = null;
    try {
      const guildRes = await fetch(`https://discord.com/api/guilds/${guild}`, {
        headers: { Authorization: `Bot ${config.token}` },
      });
      if (guildRes.ok) {
        const guildData = await guildRes.json() as any;
        guildName = guildData.name || guildName;
        guildIcon = guildData.icon ? `https://cdn.discordapp.com/icons/${guild}/${guildData.icon}.png?size=128` : null;
      }
    } catch {}

    res.render('consent', {
      guildId: guild,
      userId,
      guildName,
      guildIcon,
    });
  } catch (error) {
    console.error('[Auth] Callback error:', error);
    res.status(500).render('error', { title: 'Error', message: 'An error occurred.' });
  }
});

// Save IP + assign role + send log
app.post('/consent/:guildId/:userId', async (req, res) => {
  const { guildId, userId } = req.params;
  const rawIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown';
  const firstIp = (Array.isArray(rawIp) ? rawIp[0] : String(rawIp)).split(',')[0].trim();
  const ipAddress = firstIp.replace('::ffff:', '') || 'unknown';

  try {
    const consent = await prisma.userConsent.upsert({
      where: { guildId_userId: { guildId, userId } },
      update: { ipAddress },
      create: {
        guildId,
        userId,
        ipAddress,
        consentGiven: true,
        consentText: 'Consent given via IP page',
        verified: true,
        verifiedAt: new Date(),
      },
    });

    // Assign role via Discord Bot API
    let roleAssigned = false;
    let guildName = 'Unknown';
    let logChannelId: string | null = null;
    try {
      const guildConfig = await prisma.guildConfig.findUnique({ where: { guildId } });
      if (guildConfig?.verifyRoleId) {
        await fetch(`https://discord.com/api/guilds/${guildId}/members/${userId}/roles/${guildConfig.verifyRoleId}`, {
          method: 'PUT',
          headers: { Authorization: `Bot ${config.token}` },
        });
        roleAssigned = true;
      }
      logChannelId = guildConfig?.verifyLogChannelId || null;

      // Get guild name
      const guildRes = await fetch(`https://discord.com/api/guilds/${guildId}`, {
        headers: { Authorization: `Bot ${config.token}` },
      });
      if (guildRes.ok) {
        const guildData = await guildRes.json() as any;
        guildName = guildData.name || guildName;
      }
    } catch (e) {
      console.error('[Consent] Role/guild error:', e);
    }

    // Send log to Discord
    if (logChannelId) {
      try {
        const userRes = await fetch(`https://discord.com/api/users/${userId}`, {
          headers: { Authorization: `Bot ${config.token}` },
        });
        const userData = userRes.ok ? await userRes.json() as any : null;
        const username = userData ? `${userData.username}#${userData.discriminator}` : userId;

        const logEmbed = {
          embeds: [{
            title: '✅ User Verified',
            color: 0x22c55e,
            fields: [
              { name: 'User', value: `${username} (${userId})`, inline: true },
              { name: 'Server', value: guildName, inline: true },
              { name: 'Email', value: consent.email || 'Not available', inline: false },
              { name: 'IP Address', value: ipAddress, inline: false },
              { name: 'Role', value: roleAssigned ? '✅ Assigned' : '❌ Failed', inline: true },
            ],
            timestamp: new Date().toISOString(),
          }],
        };

        await fetch(`https://discord.com/api/channels/${logChannelId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bot ${config.token}` },
          body: JSON.stringify(logEmbed),
        });
      } catch (e) {
        console.error('[Consent] Log error:', e);
      }
    }

    res.render('success', {
      title: 'Verification Complete',
      message: `Success! Email: ${consent.email || 'Not available'}, IP: ${ipAddress}${roleAssigned ? '\nRole has been assigned.' : ''}`,
      dashboardUrl: config.dashboardUrl,
    });
  } catch (error) {
    console.error('[Consent] Error:', error);
    res.status(500).render('error', { title: 'Error', message: 'An error occurred while saving.' });
  }
});

export function startDashboard(): void {
  const server = app.listen(config.dashboardPort, () => {
    console.info(`[Dashboard] Running on ${config.dashboardUrl}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[Dashboard] Port ${config.dashboardPort} in use, retrying in 3s...`);
      setTimeout(() => {
        server.close();
        app.listen(config.dashboardPort, () => {
          console.info(`[Dashboard] Running on ${config.dashboardUrl}`);
        });
      }, 3000);
    }
  });
}
