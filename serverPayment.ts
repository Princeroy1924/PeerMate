// PeerMate Server-Side Manual UPI Payment & Subscription Verification Engine
// Zero Razorpay dependencies. Pure manual UPI MVP with admin verification workflow.

import { createClient } from '@supabase/supabase-js';

// Types
export interface PaymentRecord {
  id: string;
  userId: string;
  userEmail?: string;
  userDisplayName?: string;
  amount: number; // Exactly 99.00
  currency: string; // 'INR'
  utr: string; // Transaction reference number (Unique)
  paymentDate: string; // YYYY-MM-DD
  screenshotPath: string; // Data URL or private storage path
  status: 'pending' | 'approved' | 'rejected';
  adminNote?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionRecord {
  id: string;
  userId: string;
  plan: 'pro';
  status: 'active' | 'expired' | 'cancelled';
  paymentId?: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogRecord {
  id: string;
  paymentId?: string;
  userId?: string;
  action: 'payment_submitted' | 'payment_approved' | 'payment_rejected' | 'subscription_activated' | 'subscription_expired';
  actorId?: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

// Global Configuration
export const SERVER_PAYMENT_CONFIG = {
  UPI_ID: process.env.UPI_ID || 'legendxprince0-1@oksbi',
  UPI_DISPLAY_NAME: process.env.UPI_DISPLAY_NAME || 'Prince',
  PRO_PRICE: 99.0, // Fixed ₹99 price
  CURRENCY: 'INR',
  QR_CODE_PATH: '/images/prince_upi_qr.png',
  PLAN_DAYS: 30,
  ADMIN_EMAILS: (process.env.ADMIN_EMAILS || 'dharam8872gemail.com@gmail.com,admin@peermate.com,legendxprince0-1@oksbi')
    .split(',')
    .map((e) => e.trim().toLowerCase()),
};

// In-memory fallback stores (for resilient operations)
const paymentsStore = new Map<string, PaymentRecord>();
const subscriptionsStore = new Map<string, SubscriptionRecord>();
const auditLogsStore: AuditLogRecord[] = [];

// Helper: Lazy Supabase Admin Client
function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Record an audit log entry for payment state transitions
 */
export async function recordAuditLog(
  action: AuditLogRecord['action'],
  data: { paymentId?: string; userId?: string; actorId?: string; metadata?: Record<string, any> }
) {
  const entry: AuditLogRecord = {
    id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    action,
    paymentId: data.paymentId,
    userId: data.userId,
    actorId: data.actorId,
    metadata: data.metadata || {},
    createdAt: new Date().toISOString(),
  };

  auditLogsStore.push(entry);
  console.log(`[PAYMENT_AUDIT] [${entry.action}] Payment: ${entry.paymentId || 'N/A'}, User: ${entry.userId || 'N/A'}, Actor: ${entry.actorId || 'system'}`);

  const supabase = getSupabaseAdmin();
  if (supabase) {
    try {
      await supabase.from('payment_audit_logs').insert({
        id: entry.id,
        payment_id: entry.paymentId,
        user_id: entry.userId,
        action: entry.action,
        actor_id: entry.actorId,
        metadata: entry.metadata,
        created_at: entry.createdAt,
      });
    } catch (err) {
      console.warn('[AUDIT_SUPABASE_SYNC_WARN]', err);
    }
  }
}

/**
 * Get Public Payment Configuration for Frontend
 */
export function getPaymentConfig() {
  return {
    upiId: SERVER_PAYMENT_CONFIG.UPI_ID,
    displayName: SERVER_PAYMENT_CONFIG.UPI_DISPLAY_NAME,
    proPrice: SERVER_PAYMENT_CONFIG.PRO_PRICE,
    currency: SERVER_PAYMENT_CONFIG.CURRENCY,
    qrCodePath: SERVER_PAYMENT_CONFIG.QR_CODE_PATH,
    planDurationDays: SERVER_PAYMENT_CONFIG.PLAN_DAYS,
  };
}

/**
 * Check if an email is an authorized admin
 */
export function isAuthorizedAdmin(email?: string): boolean {
  if (!email) return false;
  const cleanEmail = email.trim().toLowerCase();
  return SERVER_PAYMENT_CONFIG.ADMIN_EMAILS.includes(cleanEmail);
}

/**
 * Check if a user currently has an active Pro subscription based on server timestamp vs current_period_end
 * Enforces automatic locking and state transition to 'expired' when current_period_end has elapsed.
 */
export async function isUserProActive(userId: string): Promise<boolean> {
  if (!userId) return false;
  const nowMs = Date.now();

  // 1. Check in-memory subscriptions store first
  const sub = subscriptionsStore.get(userId);
  if (sub) {
    if (sub.status === 'active') {
      const endTimeMs = new Date(sub.currentPeriodEnd).getTime();
      if (endTimeMs > nowMs) {
        return true;
      } else {
        // Automatically transition to expired
        sub.status = 'expired';
        sub.updatedAt = new Date(nowMs).toISOString();
        subscriptionsStore.set(userId, sub);
        recordAuditLog('subscription_expired', {
          userId,
          paymentId: sub.paymentId,
          metadata: {
            reason: 'current_period_end_elapsed',
            currentPeriodEnd: sub.currentPeriodEnd,
            serverTime: new Date(nowMs).toISOString(),
          },
        });
      }
    }
  }

  // 2. Check Supabase 'subscriptions' table
  const supabase = getSupabaseAdmin();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        if (data.status === 'active') {
          const endTimeMs = new Date(data.current_period_end).getTime();
          if (endTimeMs > nowMs) {
            // Keep memory store synced with active DB subscription
            subscriptionsStore.set(userId, {
              id: data.id,
              userId: data.user_id,
              plan: 'pro',
              status: 'active',
              paymentId: data.payment_id,
              currentPeriodStart: data.current_period_start,
              currentPeriodEnd: data.current_period_end,
              createdAt: data.created_at,
              updatedAt: data.updated_at,
            });
            return true;
          } else {
            // Expire subscription in DB and memory
            const nowIso = new Date(nowMs).toISOString();
            await supabase
              .from('subscriptions')
              .update({ status: 'expired', updated_at: nowIso })
              .eq('id', data.id);

            // Revert profile plan to free
            await supabase
              .from('profiles')
              .update({ plan: 'free', updated_at: nowIso })
              .eq('id', userId);

            subscriptionsStore.set(userId, {
              id: data.id,
              userId: data.user_id,
              plan: 'pro',
              status: 'expired',
              paymentId: data.payment_id,
              currentPeriodStart: data.current_period_start,
              currentPeriodEnd: data.current_period_end,
              createdAt: data.created_at,
              updatedAt: nowIso,
            });

            recordAuditLog('subscription_expired', {
              userId,
              paymentId: data.payment_id,
              metadata: {
                reason: 'current_period_end_elapsed',
                currentPeriodEnd: data.current_period_end,
                serverTime: nowIso,
              },
            });
          }
        }
      }
    } catch (err) {
      console.warn('[CHECK_PRO_SUPABASE_WARN]', err);
    }
  }

  return false;
}

export interface UserSubscriptionState {
  isPro: boolean;
  status: 'active' | 'expired' | 'none';
  plan: 'pro' | 'free';
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  isExpired: boolean;
  daysRemaining: number;
  serverTime: string;
}

/**
 * Get Detailed Subscription State for a User
 * Evaluates current_period_end against the current server time.
 */
export async function getUserSubscriptionState(userId: string): Promise<UserSubscriptionState> {
  const now = new Date();
  const nowMs = now.getTime();
  const nowIso = now.toISOString();

  if (!userId) {
    return {
      isPro: false,
      status: 'none',
      plan: 'free',
      isExpired: false,
      daysRemaining: 0,
      serverTime: nowIso,
    };
  }

  // Check active in memory
  let sub = subscriptionsStore.get(userId);

  // Check Supabase if not found
  if (!sub) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!error && data) {
          sub = {
            id: data.id,
            userId: data.user_id,
            plan: 'pro',
            status: data.status,
            paymentId: data.payment_id,
            currentPeriodStart: data.current_period_start,
            currentPeriodEnd: data.current_period_end,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
          };
          subscriptionsStore.set(userId, sub);
        }
      } catch (err) {
        console.warn('[GET_SUB_STATE_SUPABASE_WARN]', err);
      }
    }
  }

  if (!sub) {
    return {
      isPro: false,
      status: 'none',
      plan: 'free',
      isExpired: false,
      daysRemaining: 0,
      serverTime: nowIso,
    };
  }

  const endMs = new Date(sub.currentPeriodEnd).getTime();
  const isTimeRemaining = endMs > nowMs;

  if (sub.status === 'active' && isTimeRemaining) {
    const msLeft = endMs - nowMs;
    const daysRemaining = Math.max(1, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
    return {
      isPro: true,
      status: 'active',
      plan: 'pro',
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      isExpired: false,
      daysRemaining,
      serverTime: nowIso,
    };
  } else {
    // If status was active but timestamp expired, mark expired
    if (sub.status === 'active' && !isTimeRemaining) {
      sub.status = 'expired';
      sub.updatedAt = nowIso;
      subscriptionsStore.set(userId, sub);

      const supabase = getSupabaseAdmin();
      if (supabase) {
        try {
          await supabase.from('subscriptions').update({ status: 'expired', updated_at: nowIso }).eq('id', sub.id);
          await supabase.from('profiles').update({ plan: 'free', updated_at: nowIso }).eq('id', userId);
        } catch (e) {
          console.warn('[EXPIRE_SUB_DB_WARN]', e);
        }
      }

      recordAuditLog('subscription_expired', {
        userId,
        paymentId: sub.paymentId,
        metadata: { currentPeriodEnd: sub.currentPeriodEnd, serverTime: nowIso },
      });
    }

    return {
      isPro: false,
      status: 'expired',
      plan: 'free',
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      isExpired: true,
      daysRemaining: 0,
      serverTime: nowIso,
    };
  }
}

/**
 * Submit a Manual UPI Payment Record
 * Enforces:
 * - Fixed amount ₹99 (validates input amount if provided, rejects anything other than 99)
 * - Currency 'INR'
 * - Valid UTR format (min 6 alphanumeric characters)
 * - Duplicate UTR uniqueness check against 'payments' table & memory store
 * - Required screenshot evidence
 * - Initial status: 'pending' (NEVER 'approved')
 * - Pro features remain strictly locked until authorized admin verification
 */
export async function submitUpiPayment(params: {
  userId: string;
  userEmail?: string;
  userDisplayName?: string;
  utr: string;
  paymentDate: string;
  screenshotBase64: string;
  amount?: number | string;
  currency?: string;
}) {
  const { userId, userEmail, userDisplayName, utr, paymentDate, screenshotBase64, amount, currency } = params;

  if (!userId) {
    throw new Error('Authentication is required to submit a payment.');
  }

  // 1. Validate Amount (Must be 99)
  if (amount !== undefined && amount !== null) {
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount !== SERVER_PAYMENT_CONFIG.PRO_PRICE) {
      throw new Error(`Invalid payment amount. PeerMate Pro subscription requires exactly ₹${SERVER_PAYMENT_CONFIG.PRO_PRICE}.`);
    }
  }

  // 2. Validate Currency (Must be INR)
  if (currency !== undefined && currency !== null) {
    if (String(currency).trim().toUpperCase() !== SERVER_PAYMENT_CONFIG.CURRENCY) {
      throw new Error(`Invalid currency. Currency must be ${SERVER_PAYMENT_CONFIG.CURRENCY}.`);
    }
  }

  // 3. Validate UTR format
  if (!utr || typeof utr !== 'string' || utr.trim().length < 6) {
    throw new Error('A valid UTR / Transaction Reference Number (minimum 6 characters) is required.');
  }

  const cleanUtr = utr.trim().toUpperCase();

  // 4. Validate Payment Date
  if (!paymentDate) {
    throw new Error('Payment date is required.');
  }

  // 5. Validate Screenshot
  if (!screenshotBase64 || typeof screenshotBase64 !== 'string') {
    throw new Error('A payment receipt screenshot is required for manual verification.');
  }

  // Validate screenshot MIME type
  if (
    !screenshotBase64.startsWith('data:image/jpeg') &&
    !screenshotBase64.startsWith('data:image/png') &&
    !screenshotBase64.startsWith('data:image/webp') &&
    !screenshotBase64.startsWith('data:image/jpg') &&
    !screenshotBase64.startsWith('http://') &&
    !screenshotBase64.startsWith('https://')
  ) {
    throw new Error('Screenshot must be a valid image file (JPG, PNG, or WebP).');
  }

  // 6. Check for duplicate UTR in memory paymentsStore
  for (const p of paymentsStore.values()) {
    if (p.utr.toUpperCase() === cleanUtr) {
      throw new Error('This transaction reference has already been submitted.');
    }
  }

  // 7. Check for duplicate UTR in Supabase 'payments' table
  const supabase = getSupabaseAdmin();
  if (supabase) {
    try {
      const { data } = await supabase.from('payments').select('id, utr').eq('utr', cleanUtr).maybeSingle();
      if (data) {
        throw new Error('This transaction reference has already been submitted.');
      }
    } catch (err: any) {
      if (err.message && err.message.includes('This transaction reference has already been submitted')) {
        throw err;
      }
      console.warn('[SUPABASE_CHECK_UTR_WARN]', err);
    }
  }

  const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const now = new Date().toISOString();

  // 8. Save payment record with status 'pending' (Pro is NOT activated)
  const payment: PaymentRecord = {
    id: paymentId,
    userId,
    userEmail: userEmail || 'learner@peermate.com',
    userDisplayName: userDisplayName || 'PeerMate Learner',
    amount: SERVER_PAYMENT_CONFIG.PRO_PRICE, // Exactly 99
    currency: SERVER_PAYMENT_CONFIG.CURRENCY, // Exactly INR
    utr: cleanUtr,
    paymentDate,
    screenshotPath: screenshotBase64,
    status: 'pending', // Strictly PENDING
    createdAt: now,
    updatedAt: now,
  };

  // Save to memory store
  paymentsStore.set(paymentId, payment);

  // Sync to Supabase 'payments' table
  if (supabase) {
    try {
      await supabase.from('payments').insert({
        id: payment.id,
        user_id: payment.userId,
        amount: payment.amount,
        currency: payment.currency,
        utr: payment.utr,
        payment_date: payment.paymentDate,
        screenshot_path: payment.screenshotPath,
        status: 'pending',
        created_at: payment.createdAt,
        updated_at: payment.updatedAt,
      });
    } catch (err) {
      console.warn('[SUPABASE_INSERT_PAYMENT_WARN]', err);
    }
  }

  // Record audit log
  await recordAuditLog('payment_submitted', {
    paymentId: payment.id,
    userId: payment.userId,
    actorId: userId,
    metadata: { utr: cleanUtr, amount: payment.amount, currency: payment.currency, status: 'pending' },
  });

  return {
    success: true,
    payment: {
      id: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      utr: payment.utr,
      paymentDate: payment.paymentDate,
      createdAt: payment.createdAt,
    },
    message: 'Payment submitted successfully! Your payment is pending verification.',
  };
}

/**
 * Generate a new intent-based Payment Session in the payments table
 * Creates a unique transaction reference and constructs the UPI deep link URI
 */
export async function createPaymentIntent(params: {
  userId: string;
  userEmail?: string;
  userDisplayName?: string;
  amount?: number | string;
  currency?: string;
  notes?: string;
}) {
  const { userId, userEmail, userDisplayName, notes } = params;

  if (!userId) {
    throw new Error('Authentication is required to initiate an intent payment session.');
  }

  const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const trRef = `PM${Date.now().toString().slice(-6)}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const now = new Date().toISOString();
  const paymentDate = now.split('T')[0];

  const upiId = SERVER_PAYMENT_CONFIG.UPI_ID;
  const payeeName = SERVER_PAYMENT_CONFIG.UPI_DISPLAY_NAME;
  const amount = SERVER_PAYMENT_CONFIG.PRO_PRICE;
  const currency = SERVER_PAYMENT_CONFIG.CURRENCY;
  const note = notes || 'PeerMate Pro Subscription';

  const intentUri = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName)}&am=${amount}&cu=${currency}&tr=${trRef}&tn=${encodeURIComponent(note)}`;

  // Store in memory payments store
  const payment: PaymentRecord = {
    id: paymentId,
    userId,
    userEmail: userEmail || 'learner@peermate.com',
    userDisplayName: userDisplayName || 'PeerMate Learner',
    amount,
    currency,
    utr: trRef,
    paymentDate,
    screenshotPath: '',
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  paymentsStore.set(paymentId, payment);

  // Sync to Supabase 'payments' table if configured
  const supabase = getSupabaseAdmin();
  if (supabase) {
    try {
      await supabase.from('payments').insert({
        id: payment.id,
        user_id: payment.userId,
        amount: payment.amount,
        currency: payment.currency,
        utr: payment.utr,
        payment_date: payment.paymentDate,
        screenshot_path: '',
        status: 'pending',
        created_at: payment.createdAt,
        updated_at: payment.updatedAt,
      });
    } catch (err) {
      console.warn('[SUPABASE_INSERT_PAYMENT_INTENT_WARN]', err);
    }
  }

  await recordAuditLog('payment_submitted', {
    paymentId,
    userId,
    actorId: userId,
    metadata: {
      action: 'intent_session_created',
      trRef,
      amount,
      intentUri,
    },
  });

  return {
    success: true,
    paymentSession: {
      id: paymentId,
      transactionRef: trRef,
      amount,
      currency,
      status: payment.status,
      intentUri,
      upiId,
      payeeName,
      createdAt: now,
    },
    upiIntentUrl: intentUri,
  };
}

/**
 * Get the status of a specific payment session / payment ID for polling
 */
export async function getPaymentSessionStatus(paymentId: string, userId: string) {
  if (!paymentId) throw new Error('Payment ID is required');

  let payment = paymentsStore.get(paymentId);

  // If not found in memory, try DB
  if (!payment) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      try {
        const { data, error } = await supabase.from('payments').select('*').eq('id', paymentId).maybeSingle();
        if (!error && data) {
          payment = {
            id: data.id,
            userId: data.user_id,
            amount: Number(data.amount) || 99,
            currency: data.currency || 'INR',
            utr: data.utr,
            paymentDate: data.payment_date || data.paymentDate,
            screenshotPath: data.screenshot_path || '',
            status: data.status,
            adminNote: data.admin_note,
            verifiedBy: data.verified_by,
            verifiedAt: data.verified_at,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
          };
          paymentsStore.set(paymentId, payment);
        }
      } catch (err) {
        console.warn('[GET_PAYMENT_SESSION_STATUS_WARN]', err);
      }
    }
  }

  const isPro = await isUserProActive(userId);
  const status = payment?.status || (isPro ? 'approved' : 'pending');

  return {
    paymentId,
    status,
    isPro,
    payment: payment || null,
  };
}

/**
 * Attach or update UTR / screenshot proof for an existing payment session
 */
export async function attachPaymentProof(params: {
  paymentId: string;
  userId: string;
  utr?: string;
  paymentDate?: string;
  screenshotBase64?: string;
}) {
  const { paymentId, userId, utr, paymentDate, screenshotBase64 } = params;
  let payment = paymentsStore.get(paymentId);

  if (!payment) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { data } = await supabase.from('payments').select('*').eq('id', paymentId).maybeSingle();
      if (data) {
        payment = {
          id: data.id,
          userId: data.user_id,
          amount: Number(data.amount) || 99,
          currency: data.currency || 'INR',
          utr: data.utr,
          paymentDate: data.payment_date || data.paymentDate,
          screenshotPath: data.screenshot_path || '',
          status: data.status,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        };
        paymentsStore.set(paymentId, payment);
      }
    }
  }

  if (!payment) {
    throw new Error('Payment session not found.');
  }

  if (payment.userId !== userId) {
    throw new Error('Unauthorized to modify this payment session.');
  }

  const now = new Date().toISOString();
  if (utr && utr.trim().length >= 6) {
    payment.utr = utr.trim().toUpperCase();
  }
  if (paymentDate) {
    payment.paymentDate = paymentDate;
  }
  if (screenshotBase64) {
    payment.screenshotPath = screenshotBase64;
  }
  payment.updatedAt = now;
  paymentsStore.set(paymentId, payment);

  const supabase = getSupabaseAdmin();
  if (supabase) {
    try {
      await supabase.from('payments').update({
        utr: payment.utr,
        payment_date: payment.paymentDate,
        screenshot_path: payment.screenshotPath,
        updated_at: now,
      }).eq('id', paymentId);
    } catch (err) {
      console.warn('[SUPABASE_UPDATE_PAYMENT_PROOF_WARN]', err);
    }
  }

  return {
    success: true,
    payment,
    message: 'Proof attached to payment session successfully.',
  };
}

/**
 * Get Payment History for a User
 */
export async function getUserPayments(userId: string): Promise<PaymentRecord[]> {
  if (!userId) return [];

  const userPayments: PaymentRecord[] = [];

  for (const p of paymentsStore.values()) {
    if (p.userId === userId) {
      userPayments.push(p);
    }
  }

  const supabase = getSupabaseAdmin();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        // Merge without duplicates
        const seen = new Set(userPayments.map((p) => p.id));
        for (const item of data) {
          if (!seen.has(item.id)) {
            userPayments.push({
              id: item.id,
              userId: item.user_id,
              amount: item.amount,
              currency: item.currency,
              utr: item.utr,
              paymentDate: item.payment_date,
              screenshotPath: item.screenshot_path,
              status: item.status,
              adminNote: item.admin_note,
              verifiedBy: item.verified_by,
              verifiedAt: item.verified_at,
              createdAt: item.created_at,
              updatedAt: item.updated_at,
            });
          }
        }
      }
    } catch (err) {
      console.warn('[GET_USER_PAYMENTS_SUPABASE_WARN]', err);
    }
  }

  // Sort latest first
  return userPayments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Get all payments for Admin Verification Screen
 */
export async function getAdminPaymentsList(adminEmail: string, statusFilter?: string) {
  if (!isAuthorizedAdmin(adminEmail)) {
    throw new Error('Unauthorized: Admin authorization is required to access payment verification.');
  }

  let list: PaymentRecord[] = Array.from(paymentsStore.values());

  const supabase = getSupabaseAdmin();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        const seen = new Set(list.map((p) => p.id));
        for (const item of data) {
          if (!seen.has(item.id)) {
            list.push({
              id: item.id,
              userId: item.user_id,
              amount: item.amount,
              currency: item.currency,
              utr: item.utr,
              paymentDate: item.payment_date,
              screenshotPath: item.screenshot_path,
              status: item.status,
              adminNote: item.admin_note,
              verifiedBy: item.verified_by,
              verifiedAt: item.verified_at,
              createdAt: item.created_at,
              updatedAt: item.updated_at,
            });
          }
        }
      }
    } catch (err) {
      console.warn('[ADMIN_GET_PAYMENTS_SUPABASE_WARN]', err);
    }
  }

  if (statusFilter && statusFilter !== 'all') {
    list = list.filter((p) => p.status === statusFilter);
  }

  return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Admin Verification Action: [APPROVE] or [REJECT]
 */
export async function adminVerifyPayment(params: {
  adminUserId: string;
  adminEmail: string;
  paymentId: string;
  action: 'approve' | 'reject';
  adminNote?: string;
}) {
  const { adminUserId, adminEmail, paymentId, action, adminNote } = params;

  if (!isAuthorizedAdmin(adminEmail)) {
    throw new Error('Unauthorized: You do not have permission to verify payments.');
  }

  if (!paymentId) {
    throw new Error('Payment ID is required.');
  }

  if (action !== 'approve' && action !== 'reject') {
    throw new Error('Invalid verification action. Must be "approve" or "reject".');
  }

  // Find payment
  let payment = paymentsStore.get(paymentId);

  const supabase = getSupabaseAdmin();
  if (!payment && supabase) {
    try {
      const { data, error } = await supabase.from('payments').select('*').eq('id', paymentId).single();
      if (!error && data) {
        payment = {
          id: data.id,
          userId: data.user_id,
          amount: data.amount,
          currency: data.currency,
          utr: data.utr,
          paymentDate: data.payment_date,
          screenshotPath: data.screenshot_path,
          status: data.status,
          adminNote: data.admin_note,
          verifiedBy: data.verified_by,
          verifiedAt: data.verified_at,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        };
      }
    } catch (err) {
      console.warn('[FETCH_PAYMENT_FOR_VERIFY_WARN]', err);
    }
  }

  if (!payment) {
    throw new Error(`Payment record with ID "${paymentId}" was not found.`);
  }

  if (payment.status !== 'pending') {
    throw new Error(`Payment has already been marked as "${payment.status}". Cannot modify finalized status.`);
  }

  const now = new Date().toISOString();

  if (action === 'approve') {
    // 1. Update Payment status to APPROVED
    payment.status = 'approved';
    payment.verifiedBy = adminEmail;
    payment.verifiedAt = now;
    payment.adminNote = adminNote || 'Payment confirmed and verified by admin.';
    payment.updatedAt = now;
    paymentsStore.set(payment.id, payment);

    // 2. Calculate 30-day Pro period
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + SERVER_PAYMENT_CONFIG.PLAN_DAYS * 24 * 60 * 60 * 1000);

    const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const subscription: SubscriptionRecord = {
      id: subscriptionId,
      userId: payment.userId,
      plan: 'pro',
      status: 'active',
      paymentId: payment.id,
      currentPeriodStart: startDate.toISOString(),
      currentPeriodEnd: endDate.toISOString(),
      createdAt: now,
      updatedAt: now,
    };

    subscriptionsStore.set(payment.userId, subscription);

    // 3. Supabase update
    if (supabase) {
      try {
        await supabase
          .from('payments')
          .update({
            status: 'approved',
            verified_by: adminEmail,
            verified_at: now,
            admin_note: payment.adminNote,
            updated_at: now,
          })
          .eq('id', payment.id);

        await supabase.from('subscriptions').upsert({
          id: subscription.id,
          user_id: payment.userId,
          plan: 'pro',
          status: 'active',
          payment_id: payment.id,
          current_period_start: subscription.currentPeriodStart,
          current_period_end: subscription.currentPeriodEnd,
          created_at: subscription.createdAt,
          updated_at: subscription.updatedAt,
        });

        // Update profile plan
        await supabase
          .from('profiles')
          .update({
            plan: 'pro',
            plan_expires_at: subscription.currentPeriodEnd,
            updated_at: now,
          })
          .eq('id', payment.userId);
      } catch (err) {
        console.warn('[SUPABASE_APPROVE_SYNC_WARN]', err);
      }
    }

    // 4. Audit Log
    await recordAuditLog('payment_approved', {
      paymentId: payment.id,
      userId: payment.userId,
      actorId: adminEmail,
      metadata: { utr: payment.utr, amount: payment.amount },
    });

    await recordAuditLog('subscription_activated', {
      paymentId: payment.id,
      userId: payment.userId,
      actorId: adminEmail,
      metadata: { currentPeriodEnd: subscription.currentPeriodEnd },
    });

    return {
      success: true,
      payment,
      subscription,
      message: `Payment ${payment.utr} approved successfully. PeerMate Pro activated for 30 days.`,
    };
  } else {
    // REJECT
    payment.status = 'rejected';
    payment.verifiedBy = adminEmail;
    payment.verifiedAt = now;
    payment.adminNote = adminNote || 'Payment could not be verified. Please check your UTR or receipt.';
    payment.updatedAt = now;
    paymentsStore.set(payment.id, payment);

    if (supabase) {
      try {
        await supabase
          .from('payments')
          .update({
            status: 'rejected',
            verified_by: adminEmail,
            verified_at: now,
            admin_note: payment.adminNote,
            updated_at: now,
          })
          .eq('id', payment.id);
      } catch (err) {
        console.warn('[SUPABASE_REJECT_SYNC_WARN]', err);
      }
    }

    await recordAuditLog('payment_rejected', {
      paymentId: payment.id,
      userId: payment.userId,
      actorId: adminEmail,
      metadata: { utr: payment.utr, adminNote: payment.adminNote },
    });

    return {
      success: true,
      payment,
      message: `Payment ${payment.utr} has been rejected.`,
    };
  }
}
