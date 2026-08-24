import { EnglishLevel } from '../types';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  cleanValue: string;
}

export interface ProfileFormErrors {
  displayName?: string;
  username?: string;
  dailyGoalMinutes?: string;
  general?: string;
}

export interface ProfileValidationInput {
  displayName: string;
  username: string;
  dailyGoalMinutes?: number;
  englishLevel?: EnglishLevel;
  nativeLanguage?: string;
}

export const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'support',
  'system',
  'peermate',
  'peermate_official',
  'official',
  'help',
  'moderator',
  'mod',
  'root',
  'superuser',
  'guest',
  'bot',
  'ai_tutor',
  'null',
  'undefined',
]);

/**
 * Validates a user's display name for length and acceptable characters.
 * - Min 2 characters, Max 50 characters.
 * - Allows international letters, spaces, hyphens, periods, and apostrophes.
 * - Prevents purely whitespace, HTML/script injection, or unprintable control characters.
 */
export function validateDisplayName(rawName: string): ValidationResult {
  if (!rawName || typeof rawName !== 'string') {
    return {
      isValid: false,
      error: 'Display name is required.',
      cleanValue: '',
    };
  }

  const cleanValue = rawName.trim().replace(/\s+/g, ' ');

  if (cleanValue.length < 2) {
    return {
      isValid: false,
      error: 'Display name must be at least 2 characters long.',
      cleanValue,
    };
  }

  if (cleanValue.length > 50) {
    return {
      isValid: false,
      error: 'Display name cannot exceed 50 characters.',
      cleanValue,
    };
  }

  // Check allowed characters: Letters (including Unicode letters), numbers, spaces, dots, hyphens, apostrophes
  const displayNameRegex = /^[\p{L}\p{N}\s.'’\-]+$/u;
  if (!displayNameRegex.test(cleanValue)) {
    return {
      isValid: false,
      error: 'Display name can only contain letters, numbers, spaces, dots, hyphens, and apostrophes.',
      cleanValue,
    };
  }

  // Prevent names made purely of numbers or symbols
  const hasLetter = /[\p{L}]/u.test(cleanValue);
  if (!hasLetter) {
    return {
      isValid: false,
      error: 'Display name must contain at least one letter.',
      cleanValue,
    };
  }

  return {
    isValid: true,
    cleanValue,
  };
}

/**
 * Validates a user's username/handle.
 * - Min 3 characters, Max 30 characters.
 * - Allows alphanumeric characters (a-z, 0-9) and underscores (_).
 * - Must start with a letter or number (not an underscore).
 * - Checks against reserved system keywords.
 */
export function validateUsername(rawUsername: string): ValidationResult {
  if (!rawUsername || typeof rawUsername !== 'string') {
    return {
      isValid: false,
      error: 'Username is required.',
      cleanValue: '',
    };
  }

  // Normalization: trim, lowercase, replace spaces with underscores
  const cleanValue = rawUsername.trim().toLowerCase();

  if (cleanValue.length < 3) {
    return {
      isValid: false,
      error: 'Username must be at least 3 characters long.',
      cleanValue,
    };
  }

  if (cleanValue.length > 30) {
    return {
      isValid: false,
      error: 'Username cannot exceed 30 characters.',
      cleanValue,
    };
  }

  // Must contain only lowercase letters, numbers, and underscores
  const usernameRegex = /^[a-z0-9_]+$/;
  if (!usernameRegex.test(cleanValue)) {
    return {
      isValid: false,
      error: 'Username can only contain lowercase letters, numbers, and underscores (no spaces or symbols).',
      cleanValue,
    };
  }

  // Must start with an alphanumeric character (a-z or 0-9)
  if (/^[^a-z0-9]/.test(cleanValue)) {
    return {
      isValid: false,
      error: 'Username must begin with a letter or number.',
      cleanValue,
    };
  }

  // Prevent consecutive underscores
  if (/__+/.test(cleanValue)) {
    return {
      isValid: false,
      error: 'Username cannot contain consecutive underscores.',
      cleanValue,
    };
  }

  // Check reserved names
  if (RESERVED_USERNAMES.has(cleanValue)) {
    return {
      isValid: false,
      error: `"${cleanValue}" is a reserved system handle. Please choose a different username.`,
      cleanValue,
    };
  }

  return {
    isValid: true,
    cleanValue,
  };
}

/**
 * Comprehensive profile form validator utility.
 */
export function validateProfileForm(input: ProfileValidationInput): {
  isValid: boolean;
  errors: ProfileFormErrors;
  cleanData: {
    displayName: string;
    username: string;
    dailyGoalMinutes?: number;
    englishLevel?: EnglishLevel;
    nativeLanguage?: string;
  };
} {
  const errors: ProfileFormErrors = {};

  // Validate Display Name
  const dnResult = validateDisplayName(input.displayName);
  if (!dnResult.isValid) {
    errors.displayName = dnResult.error;
  }

  // Validate Username
  const unResult = validateUsername(input.username);
  if (!unResult.isValid) {
    errors.username = unResult.error;
  }

  // Validate Daily Goal Minutes if provided
  let cleanDailyGoal = input.dailyGoalMinutes;
  if (input.dailyGoalMinutes !== undefined) {
    const goalNum = Number(input.dailyGoalMinutes);
    if (isNaN(goalNum) || goalNum < 5 || goalNum > 180) {
      errors.dailyGoalMinutes = 'Daily speaking goal must be between 5 and 180 minutes.';
    } else {
      cleanDailyGoal = Math.round(goalNum);
    }
  }

  const isValid = Object.keys(errors).length === 0;

  return {
    isValid,
    errors,
    cleanData: {
      displayName: dnResult.cleanValue,
      username: unResult.cleanValue,
      dailyGoalMinutes: cleanDailyGoal,
      englishLevel: input.englishLevel,
      nativeLanguage: input.nativeLanguage,
    },
  };
}
