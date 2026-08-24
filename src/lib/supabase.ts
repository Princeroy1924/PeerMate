import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { UserProfile, CallRecord } from '../types';

let supabaseClient: SupabaseClient | null = null;
let presenceChannel: RealtimeChannel | null = null;
let matchmakingChannel: RealtimeChannel | null = null;

export interface PresenceState {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string;
  englishLevel: string;
  status: 'online' | 'available' | 'searching' | 'in_call';
  lastSeen: number;
}

/**
 * Initializes or retrieves the client-side Supabase client.
 * Uses environment variables or runtime configuration.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseClient) return supabaseClient;

  const url =
    (import.meta as any).env?.VITE_SUPABASE_URL ||
    (window as any).__PEERMATE_CONFIG__?.supabaseUrl ||
    '';
  const anonKey =
    (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ||
    (window as any).__PEERMATE_CONFIG__?.supabaseAnonKey ||
    '';

  if (!url || !anonKey) {
    return null;
  }

  try {
    supabaseClient = createClient(url, anonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
    return supabaseClient;
  } catch (err) {
    console.warn('[SUPABASE] Failed to initialize client:', err);
    return null;
  }
}

/**
 * Initialize runtime config from server if not set via Vite env
 */
export async function initSupabaseRuntimeConfig(): Promise<SupabaseClient | null> {
  if (supabaseClient) return supabaseClient;

  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const config = await res.json();
      if (config.supabaseUrl && config.supabaseAnonKey) {
        (window as any).__PEERMATE_CONFIG__ = config;
        supabaseClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
          auth: {
            autoRefreshToken: true,
            persistSession: true,
          },
        });
        console.log('[SUPABASE] Realtime client initialized from server configuration.');
        return supabaseClient;
      }
    }
  } catch (e) {
    console.warn('[SUPABASE] Server config fetch error:', e);
  }

  return getSupabaseClient();
}

/**
 * Tracks Supabase Realtime Presence for the current user.
 * Represents: online, available, searching, in_call
 */
export async function trackUserPresence(
  user: UserProfile,
  status: 'online' | 'available' | 'searching' | 'in_call'
): Promise<void> {
  const sb = getSupabaseClient() || (await initSupabaseRuntimeConfig());
  if (!sb) {
    return;
  }

  try {
    if (!presenceChannel) {
      presenceChannel = sb.channel('peermate_global_presence', {
        config: { presence: { key: user.id } },
      });

      presenceChannel.on('presence', { event: 'sync' }, () => {
        const state = presenceChannel?.presenceState();
        console.log('[PRESENCE] State synced across active peers:', Object.keys(state || {}).length);
      });

      await presenceChannel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel?.track({
            userId: user.id,
            displayName: user.displayName,
            username: user.username,
            avatarUrl: user.avatarUrl,
            englishLevel: user.englishLevel,
            status,
            lastSeen: Date.now(),
          });
        }
      });
    } else {
      await presenceChannel.track({
        userId: user.id,
        displayName: user.displayName,
        username: user.username,
        avatarUrl: user.avatarUrl,
        englishLevel: user.englishLevel,
        status,
        lastSeen: Date.now(),
      });
    }
  } catch (err) {
    console.warn('[PRESENCE] Failed to track presence state:', err);
  }
}

/**
 * Subscribes to Realtime Broadcast for Matchmaking events
 */
export async function subscribeToMatchmakingBroadcast(
  userId: string,
  onMatch: (payload: any) => void
): Promise<() => void> {
  const sb = getSupabaseClient() || (await initSupabaseRuntimeConfig());
  if (!sb) return () => {};

  try {
    const channelName = `matchmaking_${userId}`;
    const channel = sb.channel(channelName);

    channel
      .on('broadcast', { event: 'match_found' }, (event) => {
        console.log('[MATCHMAKING] Realtime Broadcast match event received for user:', userId, event.payload);
        onMatch(event.payload);
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  } catch (err) {
    console.warn('[MATCHMAKING] Failed to subscribe to broadcast:', err);
    return () => {};
  }
}

/**
 * Saves or updates a call record in Supabase database
 */
export async function saveCallRecordToSupabase(callData: Partial<CallRecord>): Promise<void> {
  const sb = getSupabaseClient() || (await initSupabaseRuntimeConfig());
  if (!sb) return;

  try {
    const { error } = await sb.from('calls').insert({
      id: callData.id || `call_${Date.now()}`,
      caller_id: callData.callerId,
      caller_name: callData.callerName,
      caller_avatar: callData.callerAvatar,
      caller_level: callData.callerLevel,
      receiver_id: callData.receiverId,
      receiver_name: callData.receiverName,
      receiver_avatar: callData.receiverAvatar,
      receiver_level: callData.receiverLevel,
      call_type: callData.callType || 'human',
      duration_seconds: callData.durationSeconds || 0,
      status: callData.status || 'completed',
      started_at: callData.startedAt || new Date().toISOString(),
      ended_at: callData.endedAt || new Date().toISOString(),
    });

    if (error) {
      // Non-fatal if Supabase table is not yet created
      console.warn('[SUPABASE] Notice saving call record to Supabase table:', error.message);
    }
  } catch (err) {
    console.warn('[SUPABASE] Database insert exception:', err);
  }
}
