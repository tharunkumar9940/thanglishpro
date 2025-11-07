export type PlanId = 'editor-basic' | 'creator-pro' | 'editor-max' | 'studio-agency';

export interface SubscriptionPlan {
  id: PlanId;
  name: string;
  minutesIncluded: number;
  priceInPaise: number;
  targetUser: string;
}

export const PLANS: Record<PlanId, SubscriptionPlan> = {
  'editor-basic': {
    id: 'editor-basic',
    name: 'Editor Basic',
    minutesIncluded: 200,
    priceInPaise: 29900,
    targetUser: 'Students / beginners'
  },
  'creator-pro': {
    id: 'creator-pro',
    name: 'Creator Pro',
    minutesIncluded: 500,
    priceInPaise: 59900,
    targetUser: 'Freelancers handling 20–40 reels/month'
  },
  'editor-max': {
    id: 'editor-max',
    name: 'Editor Max',
    minutesIncluded: 1200,
    priceInPaise: 99900,
    targetUser: 'Mid-level freelancers'
  },
  'studio-agency': {
    id: 'studio-agency',
    name: 'Studio/Agency',
    minutesIncluded: 2400,
    priceInPaise: 149900,
    targetUser: 'Teams / Instagram agencies'
  }
};

export const LOW_BALANCE_THRESHOLD_PAISE = 2000;
export const MIN_WALLET_TOPUP_PAISE = 10000;
export const TRIAL_DURATION_MS = 2 * 24 * 60 * 60 * 1000;
export const TRIAL_MINUTES = 60;
export const WALLET_COST_PER_MINUTE_PAISE = 100;

