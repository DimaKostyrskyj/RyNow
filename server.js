'use strict';

require('dotenv').config();

const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');

const app = express();

const PORT = Number(process.env.PORT || 3000);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/*
|--------------------------------------------------------------------------
| ПРОСТАЯ НАСТРОЙКА
|--------------------------------------------------------------------------
|
| CLIENT ID уже указан.
| Для запуска нужно добавить только:
|
| DISCORD_CLIENT_SECRET
| SESSION_SECRET
|
| в Vercel -> Settings -> Environment Variables.
|
*/

const DISCORD_CLIENT_ID =
  process.env.DISCORD_CLIENT_ID || '1527382406401757204';

const SITE_URL =
  process.env.SITE_URL ||
  (IS_PRODUCTION ? 'https://rynow.vercel.app' : 'http://localhost:3000');

const DISCORD_REDIRECT_URI =
  process.env.DISCORD_REDIRECT_URI ||
  `${SITE_URL}/api/auth/discord/callback`;

const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET;

app.set('trust proxy', 1);
app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000
  };
}

function oauthCookieOptions() {
  return {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'lax',
    path: '/api/auth/discord',
    maxAge: 10 * 60 * 1000
  };
}

function createSession(user) {
  return jwt.sign(
    {
      type: 'discord_user',
      user
    },
    SESSION_SECRET,
    {
      expiresIn: '7d',
      issuer: 'rynow-ai',
      audience: 'rynow-site'
    }
  );
}

function readSession(req) {
  if (!SESSION_SECRET || !req.cookies.rynow_session) return null;

  try {
    const payload = jwt.verify(
      req.cookies.rynow_session,
      SESSION_SECRET,
      {
        issuer: 'rynow-ai',
        audience: 'rynow-site'
      }
    );

    return payload.type === 'discord_user' ? payload.user : null;
  } catch {
    return null;
  }
}

app.get('/api/auth/me', (req, res) => {
  res.json({ user: readSession(req) });
});

app.get('/api/auth/discord', (req, res) => {
  if (!DISCORD_CLIENT_SECRET || !SESSION_SECRET) {
    return res.redirect('/?auth=config_error');
  }

  const nonce = crypto.randomBytes(32).toString('hex');

  const state = jwt.sign(
    {
      type: 'discord_oauth',
      nonce
    },
    SESSION_SECRET,
    {
      expiresIn: '10m',
      issuer: 'rynow-ai',
      audience: 'discord-oauth'
    }
  );

  res.cookie('rynow_oauth_nonce', nonce, oauthCookieOptions());

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    response_type: 'code',
    redirect_uri: DISCORD_REDIRECT_URI,
    scope: 'identify email',
    state,
    prompt: 'consent'
  });

  res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

app.get('/api/auth/discord/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect('/?auth=cancelled');
  }

  if (
    !code ||
    !state ||
    !SESSION_SECRET ||
    !req.cookies.rynow_oauth_nonce
  ) {
    return res.redirect('/?auth=invalid_state');
  }

  let statePayload;

  try {
    statePayload = jwt.verify(
      String(state),
      SESSION_SECRET,
      {
        issuer: 'rynow-ai',
        audience: 'discord-oauth'
      }
    );
  } catch {
    return res.redirect('/?auth=invalid_state');
  }

  if (
    statePayload.type !== 'discord_oauth' ||
    statePayload.nonce !== req.cookies.rynow_oauth_nonce
  ) {
    return res.redirect('/?auth=invalid_state');
  }

  res.clearCookie('rynow_oauth_nonce', {
    ...oauthCookieOptions(),
    maxAge: undefined
  });

  try {
    const tokenResponse = await fetch(
      'https://discord.com/api/oauth2/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: DISCORD_CLIENT_ID,
          client_secret: DISCORD_CLIENT_SECRET,
          grant_type: 'authorization_code',
          code: String(code),
          redirect_uri: DISCORD_REDIRECT_URI
        })
      }
    );

    if (!tokenResponse.ok) {
      console.error(
        'Discord token error:',
        tokenResponse.status,
        await tokenResponse.text()
      );

      return res.redirect('/?auth=discord_error');
    }

    const token = await tokenResponse.json();

    const userResponse = await fetch(
      'https://discord.com/api/users/@me',
      {
        headers: {
          Authorization: `Bearer ${token.access_token}`
        }
      }
    );

    if (!userResponse.ok) {
      console.error(
        'Discord user error:',
        userResponse.status,
        await userResponse.text()
      );

      return res.redirect('/?auth=discord_error');
    }

    const discordUser = await userResponse.json();

    const avatar = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=128`
      : null;

    const user = {
      id: discordUser.id,
      username:
        discordUser.global_name ||
        discordUser.username ||
        'Discord User',
      email: discordUser.email || null,
      avatar
    };

    res.cookie(
      'rynow_session',
      createSession(user),
      sessionCookieOptions()
    );

    return res.redirect('/?auth=success');
  } catch (error) {
    console.error('Discord callback error:', error);
    return res.redirect('/?auth=discord_error');
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('rynow_session', {
    ...sessionCookieOptions(),
    maxAge: undefined
  });

  res.json({ ok: true });
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    discordClientId: DISCORD_CLIENT_ID,
    siteUrl: SITE_URL,
    redirectUri: DISCORD_REDIRECT_URI,
    discordSecretConfigured: Boolean(DISCORD_CLIENT_SECRET),
    sessionSecretConfigured: Boolean(SESSION_SECRET)
  });
});

app.use(
  express.static(__dirname, {
    index: 'index.html',
    extensions: ['html']
  })
);

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }

  res.sendFile(path.join(__dirname, 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`RYNOW AI: http://localhost:${PORT}`);
    console.log(`Discord redirect: ${DISCORD_REDIRECT_URI}`);
  });
}


module.exports = app;
