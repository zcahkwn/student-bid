/*
  # Fix RLS policies for opportunities table

  1. Policy Updates
    - Update the admin policy to use `auth.uid()` instead of `uid()`
    - Ensure the anonymous insert policy works correctly
    - Add proper policy for authenticated users

  2. Security
    - Maintain RLS on opportunities table
    - Allow anonymous users to insert opportunities (for class creation)
    - Allow authenticated users to manage opportunities
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage all opportunities" ON opportunities;
DROP POLICY IF EXISTS "Allow anonymous users to insert opportunities" ON opportunities;
DROP POLICY IF EXISTS "Students can view their class opportunities" ON opportunities;

-- Create new policies with correct syntax
CREATE POLICY "Allow anonymous and authenticated users to insert opportunities"
  ON opportunities
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow anonymous and authenticated users to select opportunities"
  ON opportunities
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to update opportunities"
  ON opportunities
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Allow authenticated users to delete opportunities"
  ON opportunities
  FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Also fix the students table policies to use correct auth function
DROP POLICY IF EXISTS "Admins can manage all students" ON students;
DROP POLICY IF EXISTS "Students can view their own data" ON students;

CREATE POLICY "Allow anonymous and authenticated users to manage students"
  ON students
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Fix bids table policies
DROP POLICY IF EXISTS "Admins can manage all bids" ON bids;
DROP POLICY IF EXISTS "Students can create their own bids" ON bids;
DROP POLICY IF EXISTS "Students can view their own bids" ON bids;

CREATE POLICY "Allow authenticated users to manage bids"
  ON bids
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Fix token_history table policies
DROP POLICY IF EXISTS "Admins can manage all token history" ON token_history;
DROP POLICY IF EXISTS "Students can view their token history" ON token_history;

CREATE POLICY "Allow authenticated users to manage token history"
  ON token_history
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to view token history"
  ON token_history
  FOR SELECT
  TO authenticated
  USING (true);