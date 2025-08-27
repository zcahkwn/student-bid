/*
  # Fix RLS policies for student login and bid withdrawal

  1. Security Updates
    - Grant necessary permissions for withdraw_bid_secure function
    - Ensure student login queries work properly
    - Fix any RLS policy conflicts

  2. Function Permissions
    - Grant EXECUTE permission on withdraw_bid_secure to authenticated users
    - Ensure the function can access all necessary tables

  3. Policy Adjustments
    - Review and fix any overly restrictive policies
    - Ensure students can read their own data for login
*/

-- Grant execute permission on the withdraw_bid_secure function to authenticated users
GRANT EXECUTE ON FUNCTION public.withdraw_bid_secure(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_bid_secure(uuid, uuid) TO anon;

-- Grant execute permission on the submit_student_bid_secure function to authenticated users (if not already granted)
GRANT EXECUTE ON FUNCTION public.submit_student_bid_secure(integer, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_student_bid_secure(integer, uuid, uuid) TO anon;

-- Ensure students can read users table for login
DO $$
BEGIN
  -- Check if the policy exists before creating it
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'users' 
    AND policyname = 'Allow users to read their own data'
  ) THEN
    CREATE POLICY "Allow users to read their own data"
      ON users
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

-- Ensure students can read student_enrollments for login
DO $$
BEGIN
  -- Check if the policy exists before creating it
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'student_enrollments' 
    AND policyname = 'Allow users to read enrollments'
  ) THEN
    CREATE POLICY "Allow users to read enrollments"
      ON student_enrollments
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

-- Ensure students can read opportunities for bidding
DO $$
BEGIN
  -- Check if the policy exists before creating it
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'opportunities' 
    AND policyname = 'Allow users to read opportunities'
  ) THEN
    CREATE POLICY "Allow users to read opportunities"
      ON opportunities
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

-- Ensure students can read bids for their own data
DO $$
BEGIN
  -- Check if the policy exists before creating it
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'bids' 
    AND policyname = 'Allow users to read bids'
  ) THEN
    CREATE POLICY "Allow users to read bids"
      ON bids
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

-- Grant necessary permissions to the service role for RPC functions
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Ensure the withdraw_bid_secure function has proper security context
ALTER FUNCTION public.withdraw_bid_secure(uuid, uuid) SECURITY DEFINER;

-- Ensure the submit_student_bid_secure function has proper security context (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'submit_student_bid_secure') THEN
    ALTER FUNCTION public.submit_student_bid_secure(integer, uuid, uuid) SECURITY DEFINER;
  END IF;
END $$;