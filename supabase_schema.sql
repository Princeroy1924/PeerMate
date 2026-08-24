-- PeerMate Supabase PostgreSQL Schema & RLS Policies
-- Enables real-time 1-to-1 matchmaking, user profiles, and call history

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  english_level TEXT DEFAULT 'Intermediate',
  native_language TEXT DEFAULT 'Hindi',
  daily_goal_minutes INTEGER DEFAULT 20,
  learning_goal TEXT DEFAULT 'Conversational Fluency',
  interests TEXT[] DEFAULT ARRAY['Daily Life & Routine', 'Travel & Culture'],
  plan TEXT DEFAULT 'free',
  plan_expires_at TIMESTAMPTZ,
  current_streak INTEGER DEFAULT 1,
  total_xp INTEGER DEFAULT 100,
  status TEXT DEFAULT 'available', -- online, available, searching, in_call
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Public profiles are viewable by everyone" 
  ON public.profiles FOR SELECT 
  USING (true);

CREATE POLICY "Users can insert their own profile" 
  ON public.profiles FOR INSERT 
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile" 
  ON public.profiles FOR UPDATE 
  USING (auth.uid() = id);

-- 2. Matchmaking Queue Table
CREATE TABLE IF NOT EXISTS public.matchmaking_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id TEXT,
  english_level TEXT NOT NULL,
  media_mode TEXT DEFAULT 'audio',
  status TEXT DEFAULT 'searching', -- searching, matched, in_call, cancelled
  matched_peer_id UUID REFERENCES auth.users(id),
  room_name TEXT,
  livekit_token TEXT,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  matched_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on matchmaking_queue
ALTER TABLE public.matchmaking_queue ENABLE ROW LEVEL SECURITY;

-- Matchmaking Policies
CREATE POLICY "Users can view searching queue entries" 
  ON public.matchmaking_queue FOR SELECT 
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert themselves into matchmaking queue" 
  ON public.matchmaking_queue FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update queue entries they participate in" 
  ON public.matchmaking_queue FOR UPDATE 
  USING (auth.uid() = user_id OR auth.uid() = matched_peer_id);

CREATE POLICY "Users can delete their own queue entry" 
  ON public.matchmaking_queue FOR DELETE 
  USING (auth.uid() = user_id);

-- 3. Calls Record Table
CREATE TABLE IF NOT EXISTS public.calls (
  id TEXT PRIMARY KEY,
  caller_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  caller_name TEXT NOT NULL,
  caller_avatar TEXT,
  caller_level TEXT,
  receiver_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  receiver_name TEXT NOT NULL,
  receiver_avatar TEXT,
  receiver_level TEXT,
  call_type TEXT DEFAULT 'human', -- 'human' | 'ai'
  room_name TEXT,
  duration_seconds INTEGER DEFAULT 0,
  status TEXT DEFAULT 'completed', -- 'completed', 'missed', 'rejected', 'in_progress'
  ai_feedback_id TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on calls
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

-- Calls Policies
CREATE POLICY "Users can view their own calls" 
  ON public.calls FOR SELECT 
  USING (auth.uid() = caller_id OR auth.uid() = receiver_id);

CREATE POLICY "Authenticated users can insert calls" 
  ON public.calls FOR INSERT 
  WITH CHECK (auth.uid() = caller_id OR auth.uid() = receiver_id OR auth.uid() IS NOT NULL);

CREATE POLICY "Participants can update their calls" 
  ON public.calls FOR UPDATE 
  USING (auth.uid() = caller_id OR auth.uid() = receiver_id);

-- 4. Payments Table (Manual UPI Payments & UTR Verification)
CREATE TABLE IF NOT EXISTS public.payments (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL DEFAULT 99.00,
  currency TEXT NOT NULL DEFAULT 'INR',
  utr TEXT NOT NULL UNIQUE,
  payment_date DATE NOT NULL,
  screenshot_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note TEXT,
  verified_by TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on payments
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Payments Policies:
-- 1. Normal users can view only their own payments
CREATE POLICY "Users can view their own payments" 
  ON public.payments FOR SELECT 
  USING (auth.uid() = user_id);

-- 2. Normal users can insert their own payment submission with status 'pending' and exact amount 99.00
CREATE POLICY "Users can insert pending payment submission" 
  ON public.payments FOR INSERT 
  WITH CHECK (
    auth.uid() = user_id 
    AND status = 'pending' 
    AND amount = 99.00
  );

-- Note: Normal users CANNOT UPDATE or DELETE payments. Status transitions ('approved' / 'rejected') 
-- are strictly handled server-side via Supabase Service Role / Admin verification.

-- 5. Subscriptions Table (Pro Plan Status & Expirations)
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'pro',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
  payment_id TEXT REFERENCES public.payments(id) ON DELETE SET NULL,
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on subscriptions
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Subscriptions Policies: Normal users can ONLY read their own subscription record.
CREATE POLICY "Users can view their own subscription" 
  ON public.subscriptions FOR SELECT 
  USING (auth.uid() = user_id);

-- 6. Payment Audit Logs Table
CREATE TABLE IF NOT EXISTS public.payment_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id TEXT,
  user_id UUID,
  action TEXT NOT NULL, -- 'payment_submitted', 'payment_approved', 'payment_rejected', 'subscription_activated', 'subscription_expired'
  actor_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on audit logs (accessible only via service role)
ALTER TABLE public.payment_audit_logs ENABLE ROW LEVEL SECURITY;

-- 7. Indexes for Fast Lookups and Duplicate Prevention
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_utr ON public.payments(utr);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

-- 8. Enable Supabase Realtime on matchmaking, calls, payments, and subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE public.matchmaking_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions;


