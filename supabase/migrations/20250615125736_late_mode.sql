/*
  # Add INSERT policy for opportunities table

  1. Security Changes
    - Add policy to allow anonymous users to insert opportunities
    - This enables class creation functionality from the frontend
    
  2. Policy Details
    - Allows INSERT operations for both 'anon' and 'authenticated' roles
    - Uses 'true' condition to allow all inserts (can be refined later if needed)
*/

-- Add policy to allow anonymous users to insert opportunities
CREATE POLICY "Allow anonymous users to insert opportunities"
  ON opportunities
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);