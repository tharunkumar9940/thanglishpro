import type { PlanId, SubscriptionPlan } from '../shared/pricing';

export interface TrialInfo {
  startedAt: number;
  expiresAt: number;
  consumedMinutes: number;
  active: boolean;
  maxMinutes: number;
}

export interface ActivePlan {
  planId: PlanId;
  activatedAt: number;
  expiresAt: number | null;
  remainingMinutes: number;
}

export interface PaymentRecord {
  type: 'plan' | 'wallet';
  razorpayOrderId: string;
  razorpayPaymentId: string;
  amountInPaise: number;
  planId?: PlanId;
  createdAt: number;
}

export interface PublicUser {
  userId: string;
  email?: string;
  name?: string;
  picture?: string;
  walletBalancePaise: number;
  trial?: TrialInfo;
  activePlan?: ActivePlan;
  lowBalance: boolean;
  paymentHistory: PaymentRecord[];
}

export interface StatusResponse {
  user: PublicUser | null;
  plans: SubscriptionPlan[];
  razorpayKeyId: string;
}

export interface UsageResponse {
  source: 'plan' | 'trial' | 'wallet';
  user: PublicUser | null;
  debitedPaise?: number;
  requiredPaise?: number;
}

