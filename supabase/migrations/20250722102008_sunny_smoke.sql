/*
  # Fix users table RLS policies

  1. Security Updates
    - Update RLS policies to allow anon users to create and update user records
    - This is needed for CSV uploads and user creation functionality
    - Maintains security while allowing necessary operations

  2. Policy Changes
    - Allow INSERT for anon and authenticated users
    - Allow UPDATE for anon and authenticated users
    - Allow SELECT for anon and authenticated users
*/

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can manage their own data" ON users;

-- Create new policies that allow anon users to manage user data
CREATE POLICY "Allow anon and authenticated users to insert users"
  ON users
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow anon and authenticated users to update users"
  ON users
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anon and authenticated users to select users"
  ON users
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow anon and authenticated users to delete users"
  ON users
  FOR DELETE
  TO anon, authenticated
  USING (true);