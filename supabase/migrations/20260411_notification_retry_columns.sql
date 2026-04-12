-- Add retry tracking columns to notifications table
-- Required by the notification process worker for exponential backoff

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error TEXT;
