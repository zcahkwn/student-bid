-- Fix RLS policy for token_history table to allow trigger operations
-- This allows the restore_tokens_on_opportunity_deletion trigger to insert records

-- First, drop the existing restrictive policies
DROP POLICY IF EXISTS "Allow authenticated users to manage token history" ON public.token_history;
DROP POLICY IF EXISTS "Allow authenticated users to view token history" ON public.token_history;

-- Create new policies that work with both user sessions and trigger functions
CREATE POLICY "Allow authenticated users to select token history" 
ON public.token_history 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Allow authenticated users to insert token history" 
ON public.token_history 
FOR INSERT 
TO authenticated, anon 
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update token history" 
ON public.token_history 
FOR UPDATE 
TO authenticated 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete token history" 
ON public.token_history 
FOR DELETE 
TO authenticated 
USING (true);

-- Alternative approach: Create a more permissive policy for system operations
-- This allows both authenticated users and system triggers to manage token history
CREATE POLICY "Allow system operations on token history" 
ON public.token_history 
FOR ALL 
USING (true) 
WITH CHECK (true);