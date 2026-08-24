// PeerMate Central Payment Configuration
// Single source of truth for Manual UPI + QR Code Payment system

export const PAYMENT_CONFIG = {
  // Primary UPI ID provided by Prince (loads dynamically from environment variable or defaults)
  UPI_ID: (import.meta.env.VITE_UPI_ID || (import.meta.env as Record<string, string | undefined>).UPI_ID || 'legendxprince0-1@oksbi') as string,

  // Secondary/Alternate UPI ID (from Google Pay / ICICI handle)
  UPI_ID_ALT: 'legendxprince0-1@okicici',

  // UPI Display Name shown in payment apps (PhonePe, Google Pay, Paytm, BHIM, etc.)
  UPI_DISPLAY_NAME: (import.meta.env.VITE_UPI_DISPLAY_NAME || (import.meta.env as Record<string, string | undefined>).UPI_DISPLAY_NAME || 'Prince') as string,

  // Bank Info
  BANK_NAME: 'State Bank of India',
  BANK_ACCOUNT_HINT: 'SBI ••••7540',

  // Fixed Monthly Subscription Price in INR (Enforced by backend)
  PRO_PRICE: Number(import.meta.env.VITE_PRO_PRICE || 99),
  CURRENCY: 'INR',

  // QR Code Image Fallback URL
  QR_CODE_IMAGE_PATH: '/images/prince_upi_qr.png',

  // Plan Duration
  PLAN_DURATION_DAYS: 30,

  // Allowed file formats for payment proof screenshots
  ALLOWED_SCREENSHOT_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'],
  MAX_SCREENSHOT_SIZE_BYTES: 5 * 1024 * 1024, // 5MB

  // Admin emails who have authorization to view, approve, and reject payments
  ADMIN_EMAILS: [
    'dharam8872gemail.com@gmail.com',
    'legendxprince0-1@oksbi',
    'admin@peermate.com',
  ],
};

/**
 * Generate a standard UPI deep link for opening UPI apps directly on mobile devices
 * Format: upi://pay?pa=legendxprince0-1@oksbi&pn=Prince&am=99&cu=INR&tr=PM123456&tn=PeerMate%20Pro%20Subscription
 */
export function generateUpiIntentUrl(
  customNote?: string,
  upiId = PAYMENT_CONFIG.UPI_ID,
  transactionRef?: string
): string {
  let url = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(PAYMENT_CONFIG.UPI_DISPLAY_NAME)}&am=${PAYMENT_CONFIG.PRO_PRICE}&cu=${PAYMENT_CONFIG.CURRENCY}`;
  if (transactionRef) {
    url += `&tr=${encodeURIComponent(transactionRef)}`;
  }
  if (customNote) {
    url += `&tn=${encodeURIComponent(customNote)}`;
  } else {
    url += `&tn=${encodeURIComponent('PeerMate Pro Subscription')}`;
  }
  return url;
}

/**
 * Validates UTR / Transaction Reference Number format
 * Standard Indian banking/UPI UTRs are typically 12-digit numeric or 6-25 alphanumeric strings.
 */
export function isValidUtr(utr: string): { isValid: boolean; error?: string } {
  if (!utr || typeof utr !== 'string') {
    return { isValid: false, error: 'UTR / Transaction Reference number is required.' };
  }

  const trimmed = utr.trim();
  if (trimmed.length < 6) {
    return { isValid: false, error: 'UTR must be at least 6 characters long.' };
  }

  if (trimmed.length > 30) {
    return { isValid: false, error: 'UTR cannot exceed 30 characters.' };
  }

  // Check valid alphanumeric characters (no special characters)
  const utrPattern = /^[a-zA-Z0-9_-]+$/;
  if (!utrPattern.test(trimmed)) {
    return { isValid: false, error: 'UTR should only contain letters, numbers, hyphens, or underscores.' };
  }

  return { isValid: true };
}

/**
 * Helper to safely mask a UTR string for public/user display (e.g. "******1234")
 */
export function maskUtr(utr: string): string {
  if (!utr) return '******';
  const clean = utr.trim();
  if (clean.length <= 4) return clean;
  const lastFour = clean.slice(-4);
  return '******' + lastFour;
}

