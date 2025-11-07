import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PlanId } from '../../shared/pricing';
import { ActivePlan, TrialInfo, UserAccount } from '../types';

const DATA_PATH = path.resolve(process.cwd(), 'server/data/users.json');

let chain = Promise.resolve();

const withLock = async <T>(fn: () => Promise<T>): Promise<T> => {
  const run = chain.then(fn);
  chain = run.catch(() => undefined);
  return run;
};

const ensureDataFile = async () => {
  try {
    await fs.access(DATA_PATH);
  } catch {
    await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
    await fs.writeFile(DATA_PATH, JSON.stringify({}, null, 2), 'utf8');
  }
};

const readAllUsers = async (): Promise<Record<string, UserAccount>> => {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_PATH, 'utf8');
  if (!raw.trim()) return {};
  return JSON.parse(raw);
};

const writeAllUsers = async (data: Record<string, UserAccount>) => {
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
};

const now = () => Date.now();

export const getOrCreateUser = async (
  userId: string,
  profile?: Pick<UserAccount, 'email' | 'name' | 'picture'>
): Promise<UserAccount> =>
  withLock(async () => {
    const users = await readAllUsers();
    const existing = users[userId];
    if (existing) {
      if (profile) {
        existing.email = profile.email ?? existing.email;
        existing.name = profile.name ?? existing.name;
        existing.picture = profile.picture ?? existing.picture;
        existing.updatedAt = now();
        users[userId] = existing;
        await writeAllUsers(users);
      }
      return existing;
    }

    const fresh: UserAccount = {
      userId,
      walletBalancePaise: 0,
      trial: undefined,
      activePlan: undefined,
      paymentHistory: [],
      createdAt: now(),
      updatedAt: now(),
      ...profile
    };
    users[userId] = fresh;
    await writeAllUsers(users);
    return fresh;
  });

export const updateUser = async (
  userId: string,
  mutator: (user: UserAccount) => void
): Promise<UserAccount> =>
  withLock(async () => {
    const users = await readAllUsers();
    const existing = users[userId];
    if (!existing) {
      throw new Error(`User ${userId} not found`);
    }
    mutator(existing);
    existing.updatedAt = now();
    users[userId] = existing;
    await writeAllUsers(users);
    return existing;
  });

export const recordPayment = async (
  userId: string,
  data: {
    type: 'plan' | 'wallet';
    amountInPaise: number;
    planId?: PlanId;
    razorpayOrderId: string;
    razorpayPaymentId: string;
  }
) =>
  updateUser(userId, (user) => {
    user.paymentHistory.unshift({
      ...data,
      createdAt: now()
    });
    user.paymentHistory = user.paymentHistory.slice(0, 50);
  });

export const activatePlan = async (
  userId: string,
  activePlan: ActivePlan
) =>
  updateUser(userId, (user) => {
    user.activePlan = activePlan;
  });

export const setTrialInfo = async (userId: string, trial: TrialInfo) =>
  updateUser(userId, (user) => {
    user.trial = trial;
  });

export const adjustWallet = async (userId: string, deltaPaise: number) =>
  updateUser(userId, (user) => {
    const next = user.walletBalancePaise + deltaPaise;
    if (next < 0) {
      throw new Error('Insufficient wallet balance');
    }
    user.walletBalancePaise = next;
  });

export const clearTrial = async (userId: string) =>
  updateUser(userId, (user) => {
    user.trial = undefined;
  });

export const ensureActivePlanMinutes = async (userId: string, minutes: number) =>
  updateUser(userId, (user) => {
    if (!user.activePlan) {
      throw new Error('No active plan');
    }
    if (user.activePlan.remainingMinutes < minutes) {
      throw new Error('Insufficient plan minutes');
    }
    user.activePlan.remainingMinutes -= minutes;
  });

export const consumeTrialMinutes = async (userId: string, minutes: number) =>
  updateUser(userId, (user) => {
    if (!user.trial || !user.trial.active) {
      throw new Error('Trial inactive');
    }
    if (user.trial.expiresAt < now()) {
      user.trial.active = false;
      throw new Error('Trial expired');
    }
    if (user.trial.consumedMinutes + minutes > user.trial.maxMinutes) {
      throw new Error('Trial minutes exceeded');
    }
    user.trial.consumedMinutes += minutes;
  });

export const loadUser = async (userId: string) => {
  const users = await withLock(readAllUsers);
  return users[userId];
};

