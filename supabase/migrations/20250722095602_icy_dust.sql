/*
  # Fix RLS policies for opportunity deletion

  1. Security Updates
    - Update RLS policies to allow proper deletion of opportunities
    - Ensure admin users can delete opportunities
    - Maintain security while allowing necessary operations

  2. Changes
    - Drop existing restrictive policies
    - Create new policies that allow deletion for authenticated users
    - Add proper permissions for opportunity management
*/

-- Drop existing restrictive policies that are blocking deletion
DROP POLICY IF EXISTS "Allow authenticated users to delete opportunities" ON opportunities;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to delete opportunities" ON opportunities;

-- Create new policy that allows deletion for authenticated users
CREATE POLICY "Allow authenticated users to delete opportunities"
  ON opportunities
  FOR DELETE
  TO authenticated
  USING (true);

-- Also ensure the other policies are properly set
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to insert opportunities" ON opportunities;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to select opportunities" ON opportunities;
DROP POLICY IF EXISTS "Allow authenticated users to update opportunities" ON opportunities;

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
  USING (true)
  WITH CHECK (true);