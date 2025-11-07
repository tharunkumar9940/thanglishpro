import React, { useMemo, useState } from 'react';
import { useUser } from '../contexts/UserContext';
import { useScript } from '../hooks/useScript';
import { PLANS, MIN_WALLET_TOPUP_PAISE, LOW_BALANCE_THRESHOLD_PAISE } from '../shared/pricing';
import type { PlanId, SubscriptionPlan } from '../shared/pricing';
import { apiFetch } from '../services/apiClient';
import type { PublicUser } from '../types/user';

type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
};

const RAZORPAY_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

const formatCurrency = (paise: number) => `₹${(paise / 100).toFixed(2)}`;

const minutesLabel = (minutes: number) => `${minutes} minute${minutes === 1 ? '' : 's'}`;

const PricingAndWallet: React.FC = () => {
  const { user, plans, razorpayKeyId, setUserData } = useUser();
  const { loaded: razorpayLoaded, error: razorpayLoadError } = useScript(RAZORPAY_SCRIPT_URL);
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletAmount, setWalletAmount] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const orderedPlans = useMemo(() => plans.length ? plans : Object.values(PLANS), [plans]);

  const showLowBalanceAlert = user?.walletBalancePaise !== undefined && user.walletBalancePaise < LOW_BALANCE_THRESHOLD_PAISE;

  const ensureRazorpay = () => {
    if (!razorpayLoaded || !window.Razorpay || !razorpayKeyId) {
      throw new Error('Payment system not ready yet. Please try again in a moment.');
    }
  };

  const launchCheckout = async (
    order: RazorpayOrder,
    metadata: { intent: 'plan'; planId: PlanId } | { intent: 'wallet'; amountInPaise: number }
  ) => {
    ensureRazorpay();
    const options = {
      key: razorpayKeyId!,
      amount: order.amount,
      currency: order.currency,
      name: 'Thanglish Pro',
      description: metadata.intent === 'plan' ? `${PLANS[metadata.planId].name} subscription` : 'Wallet top-up',
      order_id: order.id,
      prefill: {
        name: user?.name,
        email: user?.email
      },
      theme: {
        color: '#F59E0B'
      },
      handler: async (response: RazorpayHandlerResponse) => {
        try {
          const payload = {
            ...response,
            intent: metadata.intent,
            planId: metadata.intent === 'plan' ? metadata.planId : undefined,
            amountInPaise: metadata.intent === 'wallet' ? metadata.amountInPaise : undefined
          };
          const data = await apiFetch<{ user: PublicUser | null }>('/subscription/confirm', {
            method: 'POST',
            body: payload
          });
          if (data.user) {
            setUserData(data.user);
            setMessage('Payment successful! Your account is updated.');
          }
        } catch (err) {
          console.error('Failed to confirm payment', err);
          setMessage((err as Error).message);
        } finally {
          setLoadingPlan(null);
          setWalletLoading(false);
        }
      }
    } satisfies RazorpayOptions;

    const instance = new window.Razorpay!(options);
    instance.on?.('payment.failed', (event: { error?: { description?: string } }) => {
      setMessage(event.error?.description ?? 'Payment failed. Please try again.');
      setLoadingPlan(null);
      setWalletLoading(false);
    });
    instance.on?.('modal.closed', () => {
      setLoadingPlan(null);
      setWalletLoading(false);
    });
    instance.open();
  };

  const handlePlanPurchase = async (plan: SubscriptionPlan) => {
    try {
      setMessage(null);
      setLoadingPlan(plan.id);
      const { order } = await apiFetch<{ order: RazorpayOrder }>('/subscription/create-order', {
        method: 'POST',
        body: {
          intent: 'plan',
          planId: plan.id
        }
      });
      await launchCheckout(order, { intent: 'plan', planId: plan.id });
    } catch (err) {
      console.error('Failed to create plan order', err);
      setMessage((err as Error).message);
      setLoadingPlan(null);
    }
  };

  const handleWalletTopUp = async () => {
    const amountValue = Number(walletAmount);
    if (Number.isNaN(amountValue) || amountValue <= 0) {
      setMessage('Enter a valid top-up amount.');
      return;
    }
    const paise = Math.round(amountValue * 100);
    if (paise < MIN_WALLET_TOPUP_PAISE) {
      setMessage(`Minimum wallet recharge is ₹${(MIN_WALLET_TOPUP_PAISE / 100).toFixed(0)}.`);
      return;
    }

    try {
      setMessage(null);
      setWalletLoading(true);
      const { order } = await apiFetch<{ order: RazorpayOrder }>('/subscription/create-order', {
        method: 'POST',
        body: {
          intent: 'wallet',
          amountInPaise: paise
        }
      });
      await launchCheckout(order, { intent: 'wallet', amountInPaise: paise });
    } catch (err) {
      console.error('Failed to create wallet order', err);
      setMessage((err as Error).message);
      setWalletLoading(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <section className="mt-6 grid gap-6 md:grid-cols-2">
      <div className="bg-[#1F2937] border border-[#374151] rounded-xl p-6 shadow-lg">
        <h3 className="text-lg font-semibold text-white mb-3">Your Account</h3>
        <div className="space-y-2 text-sm text-gray-300">
          <p><span className="text-gray-400">Plan:</span> {user.activePlan ? PLANS[user.activePlan.planId].name : 'None'}</p>
          {user.activePlan && (
            <p><span className="text-gray-400">Remaining minutes:</span> {minutesLabel(user.activePlan.remainingMinutes)}</p>
          )}
          {user.trial && (
            <p><span className="text-gray-400">Trial:</span> {user.trial.active ? 'Active' : 'Expired'} · {minutesLabel(Math.max(user.trial.maxMinutes - user.trial.consumedMinutes, 0))} left</p>
          )}
          <p>
            <span className="text-gray-400">Wallet balance:</span> {formatCurrency(user.walletBalancePaise)}
            {showLowBalanceAlert && <span className="ml-2 text-amber-300">Low balance · Recharge soon</span>}
          </p>
        </div>
        {razorpayLoadError && (
          <p className="mt-3 text-xs text-red-400">Payment SDK error: {razorpayLoadError.message}</p>
        )}
        {message && (
          <div className="mt-4 rounded-lg bg-gray-800/60 px-3 py-2 text-xs text-amber-200">
            {message}
          </div>
        )}
      </div>

      <div className="bg-[#1F2937] border border-[#374151] rounded-xl p-6 shadow-lg">
        <h3 className="text-lg font-semibold text-white mb-3">Wallet Top-Up</h3>
        <p className="text-sm text-gray-300 mb-4">Fast recharge via Razorpay. Minimum recharge {formatCurrency(MIN_WALLET_TOPUP_PAISE)}.</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="number"
            min={MIN_WALLET_TOPUP_PAISE / 100}
            value={walletAmount}
            onChange={(e) => setWalletAmount(e.target.value)}
            placeholder="Amount in ₹"
            className="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm text-gray-100 focus:border-amber-400 focus:outline-none"
          />
          <button
            onClick={handleWalletTopUp}
            disabled={walletLoading || !razorpayLoaded}
            className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-gray-600 disabled:text-gray-400"
          >
            {walletLoading ? 'Processing…' : 'Recharge'}
          </button>
        </div>
      </div>

      <div className="md:col-span-2 bg-[#1F2937] border border-[#374151] rounded-xl p-6 shadow-lg">
        <h3 className="text-lg font-semibold text-white mb-4">Choose a Plan</h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {orderedPlans.map((plan) => (
            <article key={plan.id} className="rounded-xl border border-gray-700 bg-gray-900/70 p-5 shadow-md flex flex-col">
              <h4 className="text-xl font-bold text-white mb-2">{plan.name}</h4>
              <p className="text-3xl font-bold text-amber-400">₹{(plan.priceInPaise / 100).toFixed(0)}<span className="text-sm text-gray-400 font-medium">/month</span></p>
              <p className="mt-2 text-sm text-gray-300">{minutesLabel(plan.minutesIncluded)} included</p>
              <p className="mt-1 text-xs text-gray-400">{plan.targetUser}</p>
              <button
                onClick={() => handlePlanPurchase(plan)}
                disabled={loadingPlan === plan.id || !razorpayLoaded}
                className="mt-auto rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-gray-600 disabled:text-gray-400"
              >
                {loadingPlan === plan.id ? 'Processing…' : 'Subscribe'}
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PricingAndWallet;

