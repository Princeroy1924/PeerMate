import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;

/**
 * Returns a lazy-initialized Supabase client if credentials are configured.
 * Uses service role key if available for administrative auth operations,
 * or anon key as standard client.
 */
export function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)?.trim();

  if (!url || !key) {
    return null;
  }

  if (!supabaseClient) {
    try {
      supabaseClient = createClient(url, key, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      });
      console.log('✅ Supabase Auth client initialized successfully.');
    } catch (err) {
      console.warn('⚠️ Failed to initialize Supabase client:', err);
      return null;
    }
  }

  return supabaseClient;
}

/**
 * Password validation rules
 */
export interface PasswordValidationResult {
  valid: boolean;
  error?: string;
}

export function validatePassword(password: string): PasswordValidationResult {
  if (!password) {
    return { valid: false, error: 'Password is required.' };
  }
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long.' };
  }
  if (password.length > 72) {
    return { valid: false, error: 'Password cannot exceed 72 characters.' };
  }
  return { valid: true };
}

/**
 * Email validation rules
 */
export function validateEmail(email: string): { valid: boolean; error?: string } {
  if (!email || !email.trim()) {
    return { valid: false, error: 'Email address is required.' };
  }
  const normalized = email.trim().toLowerCase();
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(normalized)) {
    return { valid: false, error: 'Please enter a valid email address (e.g. name@domain.com).' };
  }
  return { valid: true };
}

/**
 * Display name validation for backend
 */
export function validateDisplayName(name: string): { valid: boolean; error?: string; cleanValue?: string } {
  if (!name || !name.trim()) {
    return { valid: false, error: 'Display name is required.' };
  }
  const clean = name.trim().replace(/\s+/g, ' ');
  if (clean.length < 2) {
    return { valid: false, error: 'Display name must be at least 2 characters long.' };
  }
  if (clean.length > 50) {
    return { valid: false, error: 'Display name cannot exceed 50 characters.' };
  }
  const displayNameRegex = /^[\p{L}\p{N}\s.'’\-]+$/u;
  if (!displayNameRegex.test(clean)) {
    return {
      valid: false,
      error: 'Display name can only contain letters, numbers, spaces, dots, hyphens, and apostrophes.',
    };
  }
  if (!/[\p{L}]/u.test(clean)) {
    return { valid: false, error: 'Display name must contain at least one letter.' };
  }
  return { valid: true, cleanValue: clean };
}

/**
 * Username validation for backend
 */
export function validateUsername(username: string): { valid: boolean; error?: string; cleanValue?: string } {
  if (!username || !username.trim()) {
    return { valid: false, error: 'Username is required.' };
  }
  const clean = username.trim().toLowerCase();
  if (clean.length < 3) {
    return { valid: false, error: 'Username must be at least 3 characters long.' };
  }
  if (clean.length > 30) {
    return { valid: false, error: 'Username cannot exceed 30 characters.' };
  }
  const usernameRegex = /^[a-z0-9_]+$/;
  if (!usernameRegex.test(clean)) {
    return {
      valid: false,
      error: 'Username can only contain lowercase alphanumeric characters and underscores (no spaces or symbols).',
    };
  }
  if (/^[^a-z0-9]/.test(clean)) {
    return { valid: false, error: 'Username must start with a letter or number.' };
  }
  if (/__+/.test(clean)) {
    return { valid: false, error: 'Username cannot contain consecutive underscores.' };
  }
  const reserved = ['admin', 'administrator', 'support', 'system', 'peermate', 'official', 'help', 'root'];
  if (reserved.includes(clean)) {
    return { valid: false, error: `"${clean}" is a reserved system username. Please choose another one.` };
  }
  return { valid: true, cleanValue: clean };
}

/**
 * Updates user metadata in Supabase
 */
export async function updateSupabaseUserMetadata(
  userId: string,
  metadata: Record<string, any>
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { success: false, error: 'Supabase client not configured.' };
  }
  try {
    const { data, error } = await supabase.auth.admin.updateUserById(userId, {
      user_metadata: metadata,
    });
    if (error) {
      // Fallback: If not service_role key, admin won't work, so log notice
      console.warn('Supabase admin updateUserById failed (service role key required):', error.message);
      return { success: false, error: formatSupabaseAuthError(error) };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update Supabase profile' };
  }
}

/**
 * Resends verification / confirmation email via Supabase Auth
 */
export async function resendSupabaseVerificationEmail(
  email: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    return {
      success: true,
      message: 'Verification email simulated (local demo environment).',
    };
  }
  try {
    const { data, error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim().toLowerCase(),
    });
    if (error) {
      return { success: false, error: formatSupabaseAuthError(error) };
    }
    return { success: true, message: 'Verification link resent to your email address.' };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to resend verification email.' };
  }
}

/**
 * Maps Supabase error responses to user-friendly messages
 */
export function formatSupabaseAuthError(error: any): string {
  if (!error) return 'An unexpected authentication error occurred. Please try again.';

  const message = (error.message || error.error_description || error.msg || '').toString();
  const code = (error.code || error.status || '').toString().toLowerCase();

  // Check common Supabase Auth error patterns
  if (
    message.includes('User already registered') ||
    message.includes('already exists') ||
    code === 'user_already_exists'
  ) {
    return 'An account with this email address already exists. Please sign in instead.';
  }

  if (
    message.includes('Invalid login credentials') ||
    message.includes('invalid_grant') ||
    code === 'invalid_credentials'
  ) {
    return 'Incorrect email or password. Please verify your credentials and try again.';
  }

  if (message.includes('Password should be at least 6 characters') || code === 'weak_password') {
    return 'Password is too weak. Please use at least 6 characters.';
  }

  if (message.includes('Email not confirmed') || code === 'email_not_confirmed') {
    return 'Please check your email inbox and confirm your address before signing in.';
  }

  if (
    message.includes('rate limit') ||
    message.includes('over_email_send_rate_limit') ||
    code === '429'
  ) {
    return 'Too many auth requests in a short period. Please wait 60 seconds and try again.';
  }

  if (message.includes('invalid format') || message.includes('valid email')) {
    return 'Please provide a valid email address.';
  }

  if (message.includes('Signup requires a valid password')) {
    return 'Please enter a valid password for your account.';
  }

  return message || 'Authentication failed. Please check your credentials and try again.';
}
