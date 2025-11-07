import 'dotenv/config';

import cors from 'cors';
import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import Razorpay from 'razorpay';
import { OAuth2Client } from 'google-auth-library';
import crypto from 'node:crypto';
import path from 'node:path';

import {
  getOrCreateUser,
  loadUser,
  recordPayment,
  activatePlan,
  adjustWallet,
  consumeTrialMinutes,
  setTrialInfo
} from './utils/userStore';
import {
  LOW_BALANCE_THRESHOLD_PAISE,
  MIN_WALLET_TOPUP_PAISE,
  PLANS,
  PlanId,
  TRIAL_DURATION_MS,
  TRIAL_MINUTES,
  WALLET_COST_PER_MINUTE_PAISE
} from '../shared/pricing';
import type { UserAccount } from './types';

const {
  RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET,
  GOOGLE_CLIENT_ID,
  SESSION_SECRET,
  SERVER_PORT = '4000',
  CLIENT_ORIGIN = 'http://localhost:3000',
  DEV_BYPASS_LOGIN = 'false',
  DEV_BYPASS_USER_ID = 'dev-user',
  DEV_BYPASS_NAME = 'Dev User',
  DEV_BYPASS_EMAIL = 'dev@example.com',
  DEV_BYPASS_ALLOWED_ORIGINS = 'http://localhost:3000'
} = process.env;

if (!SESSION_SECRET) {
  throw new Error('SESSION_SECRET env variable is required');
}
if (!GOOGLE_CLIENT_ID) {
  throw new Error('GOOGLE_CLIENT_ID env variable is required');
}
if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
  throw new Error('Razorpay credentials are required');
}

const app = express();

const staticDist = process.env.STATIC_DIST ? path.resolve(process.env.STATIC_DIST) : null;

app.use(cors({
  origin: CLIENT_ORIGIN.split(',').map((v) => v.trim()),
  credentials: true
}));
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      secure: false,
      httpOnly: true,
      sameSite: 'lax'
    }
  })
);

const oauthClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET
});

const requireAuth: express.RequestHandler = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

const publicUser = (user: UserAccount) => ({
  userId: user.userId,
  email: user.email,
  name: user.name,
  picture: user.picture,
  walletBalancePaise: user.walletBalancePaise,
  trial: user.trial,
  activePlan: user.activePlan,
  lowBalance: user.walletBalancePaise < LOW_BALANCE_THRESHOLD_PAISE,
  paymentHistory: user.paymentHistory
});

const allowedDevOrigins = DEV_BYPASS_ALLOWED_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

const isLocalRequest = (req: express.Request) => {
  const address = req.ip ?? req.socket.remoteAddress ?? '';
  if (!address) return false;
  const normalized = address.startsWith('::ffff:') ? address.substring(7) : address;
  return normalized === '127.0.0.1' || normalized === '::1';
};

if (DEV_BYPASS_LOGIN === 'true') {
  app.post('/auth/dev-login', async (req, res) => {
    if (!isLocalRequest(req)) {
      return res.status(403).json({ error: 'Dev login allowed only from localhost' });
    }

    const origin = req.get('origin');
    if (origin && allowedDevOrigins.length > 0) {
      const matchesOrigin = allowedDevOrigins.some((allowed) => allowed === origin);
      if (!matchesOrigin) {
        return res.status(403).json({ error: 'Origin not permitted for dev login' });
      }
    }

    const { userId, name, email } = req.body as {
      userId?: string;
      name?: string;
      email?: string;
    };

    const resolvedUserId = (userId ?? DEV_BYPASS_USER_ID)?.trim();
    if (!resolvedUserId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    req.session.userId = resolvedUserId;
    const user = await getOrCreateUser(resolvedUserId, {
      name: name ?? DEV_BYPASS_NAME,
      email: email ?? DEV_BYPASS_EMAIL
    });

    res.json({
      user: publicUser(user),
      plans: Object.values(PLANS),
      razorpayKeyId: RAZORPAY_KEY_ID
    });
  });
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/auth/google', async (req, res) => {
  const { credential } = req.body as { credential?: string };
  if (!credential) {
    return res.status(400).json({ error: 'Missing credential' });
  }
  try {
    const ticket = await oauthClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.sub) {
      return res.status(400).json({ error: 'Invalid token payload' });
    }
    const userId = payload.sub;
    req.session.userId = userId;
    const user = await getOrCreateUser(userId, {
      email: payload.email ?? undefined,
      name: payload.name ?? undefined,
      picture: payload.picture ?? undefined
    });
    res.json({
      user: publicUser(user),
      plans: Object.values(PLANS),
      razorpayKeyId: RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error('Google auth failed', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
});

app.post('/auth/logout', requireAuth, (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Failed to destroy session', err);
    }
  });
  res.clearCookie('connect.sid');
  res.json({ ok: true });
});

app.get('/status', requireAuth, async (req, res) => {
  const user = await loadUser(req.session.userId!);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (user.trial && user.trial.expiresAt < Date.now()) {
    user.trial.active = false;
  }
  res.json({
    user: publicUser(user),
    plans: Object.values(PLANS),
    razorpayKeyId: RAZORPAY_KEY_ID
  });
});

app.post('/subscription/start-trial', requireAuth, async (req, res) => {
  const user = await loadUser(req.session.userId!);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (user.trial) {
    if (user.trial.active && user.trial.expiresAt > Date.now()) {
      return res.json({ trial: user.trial, message: 'Trial already active' });
    }
    return res.status(403).json({ error: 'Trial already used' });
  }

  const now = Date.now();
  const trial = {
    startedAt: now,
    expiresAt: now + TRIAL_DURATION_MS,
    consumedMinutes: 0,
    active: true,
    maxMinutes: TRIAL_MINUTES
  };
  await setTrialInfo(req.session.userId!, trial);
  res.json({ trial });
});

app.post('/subscription/create-order', requireAuth, async (req, res) => {
  const { intent, planId, amountInPaise } = req.body as {
    intent: 'plan' | 'wallet';
    planId?: PlanId;
    amountInPaise?: number;
  };

  try {
    if (intent === 'plan') {
      if (!planId || !PLANS[planId]) {
        return res.status(400).json({ error: 'Invalid plan' });
      }
      const plan = PLANS[planId];
      const order = await razorpay.orders.create({
        amount: plan.priceInPaise,
        currency: 'INR',
        receipt: `plan_${plan.id}_${Date.now()}`,
        notes: {
          planId: plan.id,
          userId: req.session.userId
        }
      });
      return res.json({ order });
    }

    if (intent === 'wallet') {
      if (!amountInPaise || amountInPaise < MIN_WALLET_TOPUP_PAISE) {
        return res.status(400).json({ error: `Minimum wallet recharge is ₹${MIN_WALLET_TOPUP_PAISE / 100}` });
      }
      const order = await razorpay.orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt: `wallet_${Date.now()}`,
        notes: {
          userId: req.session.userId
        }
      });
      return res.json({ order });
    }

    return res.status(400).json({ error: 'Invalid intent' });
  } catch (error) {
    console.error('Failed to create Razorpay order', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

app.post('/subscription/confirm', requireAuth, async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    intent,
    planId,
    amountInPaise
  } = req.body as {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
    intent: 'plan' | 'wallet';
    planId?: PlanId;
    amountInPaise?: number;
  };

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing Razorpay confirmation data' });
  }

  const expectedSignature = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expectedSignature !== razorpay_signature) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    if (intent === 'plan') {
      if (!planId || !PLANS[planId]) {
        return res.status(400).json({ error: 'Invalid plan' });
      }
      const plan = PLANS[planId];
      const now = Date.now();
      await activatePlan(req.session.userId!, {
        planId: plan.id,
        activatedAt: now,
        expiresAt: now + 30 * 24 * 60 * 60 * 1000,
        remainingMinutes: plan.minutesIncluded
      });
      await recordPayment(req.session.userId!, {
        type: 'plan',
        amountInPaise: plan.priceInPaise,
        planId: plan.id,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id
      });
    } else if (intent === 'wallet') {
      if (!amountInPaise) {
        return res.status(400).json({ error: 'Missing top-up amount' });
      }
      await adjustWallet(req.session.userId!, amountInPaise);
      await recordPayment(req.session.userId!, {
        type: 'wallet',
        amountInPaise,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id
      });
    } else {
      return res.status(400).json({ error: 'Invalid intent' });
    }

    const user = await loadUser(req.session.userId!);
    res.json({ user: user ? publicUser(user) : null });
  } catch (error) {
    console.error('Failed to confirm subscription', error);
    res.status(500).json({ error: 'Failed to confirm payment' });
  }
});

app.post('/usage/consume', requireAuth, async (req, res) => {
  const { minutes } = req.body as { minutes?: number };
  const usageMinutes = Number(minutes);

  if (!Number.isFinite(usageMinutes) || usageMinutes <= 0) {
    return res.status(400).json({ error: 'Invalid minutes value' });
  }

  const user = await loadUser(req.session.userId!);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  try {
    if (user.activePlan && user.activePlan.remainingMinutes >= usageMinutes) {
      await activatePlan(req.session.userId!, {
        ...user.activePlan,
        remainingMinutes: user.activePlan.remainingMinutes - usageMinutes
      });
      const updated = await loadUser(req.session.userId!);
      return res.json({ source: 'plan', user: updated ? publicUser(updated) : null });
    }

    if (user.trial && user.trial.active && user.trial.expiresAt > Date.now()) {
      if (user.trial.consumedMinutes + usageMinutes <= user.trial.maxMinutes) {
        await consumeTrialMinutes(req.session.userId!, usageMinutes);
        const updated = await loadUser(req.session.userId!);
        return res.json({ source: 'trial', user: updated ? publicUser(updated) : null });
      }
    }

    const costPaise = Math.ceil(usageMinutes) * WALLET_COST_PER_MINUTE_PAISE;
    if (user.walletBalancePaise >= costPaise) {
      await adjustWallet(req.session.userId!, -costPaise);
      const updated = await loadUser(req.session.userId!);
      return res.json({ source: 'wallet', user: updated ? publicUser(updated) : null, debitedPaise: costPaise });
    }

    return res.status(402).json({ error: 'Insufficient balance', requiredPaise: costPaise });
  } catch (error) {
    console.error('Usage consumption failed', error);
    res.status(400).json({ error: (error as Error).message });
  }
});

if (staticDist) {
  app.use(express.static(staticDist));
  app.get('*', (req, res, next) => {
    const pathLower = req.path.toLowerCase();
    if (
      pathLower.startsWith('/auth') ||
      pathLower.startsWith('/subscription') ||
      pathLower.startsWith('/usage') ||
      pathLower.startsWith('/status') ||
      pathLower.startsWith('/health')
    ) {
      return next();
    }

    return res.sendFile(path.join(staticDist, 'index.html'));
  });
}

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const port = Number(process.env.PORT ?? SERVER_PORT ?? 8080);
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

