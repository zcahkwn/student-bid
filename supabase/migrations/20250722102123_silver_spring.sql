/*
  # Fix RLS policies for student_enrollments table

  1. Security Updates
    - Update existing RLS policy to allow both anon and authenticated users
    - Allow INSERT, UPDATE, SELECT, and DELETE operations for CSV upload functionality
    - Use permissive policies with TRUE conditions for development/admin operations

  2. Changes Made
    - Drop existing restrictive policy
    - Create new comprehensive policy allowing anon and authenticated users
    - Enable all CRUD operations needed for student enrollment management
*/

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Users can manage their enrollments" ON student_enrollments;

-- Create a new comprehensive policy that allows both anon and authenticated users
CREATE POLICY "Allow anon and authenticated users to manage student enrollments"
  ON student_enrollments
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);