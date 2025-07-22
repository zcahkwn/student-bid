/*
  # Fix RLS policy for classes table

  1. Security Changes
    - Update RLS policy on `classes` table to allow INSERT operations for anonymous users
    - Keep existing restrictions for other operations
    - This allows the frontend to create new classes while maintaining security for other operations

  2. Changes Made
    - Drop existing restrictive policy
    - Create separate policies for different operations
    - Allow INSERT for anonymous users (class creation from frontend)
    - Require authentication for SELECT, UPDATE, DELETE operations
*/

-- Drop the existing overly restrictive policy
DROP POLICY IF EXISTS "Admins can manage all data" ON classes;

-- Create separate policies for different operations
CREATE POLICY "Allow class creation"
  ON classes
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view classes"
  ON classes
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update classes"
  ON classes
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete classes"
  ON classes
  FOR DELETE
  TO authenticated
  USING (true);