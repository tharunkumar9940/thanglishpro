import type { PlanId } from '../shared/pricing';

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

export interface UserAccount {
  userId: string;
  email?: string;
  name?: string;
  picture?: string;
  walletBalancePaise: number;
  trial?: TrialInfo;
  activePlan?: ActivePlan;
  paymentHistory: PaymentRecord[];
  createdAt: number;
  updatedAt: number;
}

export interface SessionUser {
  userId: string;
}

