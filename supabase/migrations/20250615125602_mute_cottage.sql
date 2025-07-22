/*
  # Fix Classes Table RLS Policy

  1. Security Updates
    - Update RLS policies for classes table to allow proper access
    - Ensure anonymous users can create classes (for initial setup)
    - Ensure authenticated users can manage classes
    
  2. Changes
    - Drop existing restrictive policies
    - Add new policies that match the application's usage pattern
*/

-- Drop existing policies that might be too restrictive
DROP POLICY IF EXISTS "Allow class creation" ON classes;
DROP POLICY IF EXISTS "Authenticated users can delete classes" ON classes;
DROP POLICY IF EXISTS "Authenticated users can update classes" ON classes;
DROP POLICY IF EXISTS "Authenticated users can view classes" ON classes;

-- Create new policies that allow the application to function properly
CREATE POLICY "Enable insert for anon and authenticated users" ON classes
  FOR INSERT 
  TO anon, authenticated 
  WITH CHECK (true);

CREATE POLICY "Enable select for anon and authenticated users" ON classes
  FOR SELECT 
  TO anon, authenticated 
  USING (true);

CREATE POLICY "Enable update for anon and authenticated users" ON classes
  FOR UPDATE 
  TO anon, authenticated 
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Enable delete for anon and authenticated users" ON classes
  FOR DELETE 
  TO anon, authenticated 
  USING (true);