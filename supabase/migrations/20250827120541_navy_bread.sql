/*
  # Create admin_users table for secure admin authentication

  1. New Tables
    - `admin_users`
      - `id` (uuid, primary key)
      - `username` (text, unique, not null)
      - `password_hash` (text, not null) - stores securely hashed passwords
      - `created_at` (timestamp with time zone, default now())

  2. Security
    - Enable RLS on `admin_users` table
    - Add policy for anonymous users to register (INSERT)
    - Add policy for service role to authenticate (SELECT)
    - Restrict UPDATE and DELETE to authenticated admins only

  3. Important Notes
    - Password hashing must be handled by backend Edge Functions
    - Never store plain text passwords
    - Registration should be protected in production environments
*/

-- Create the admin_users table
CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Policy to allow anonymous users to register new admins
-- Note: In production, you may want to restrict this further
CREATE POLICY "Allow anonymous registration"
  ON admin_users
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Policy to allow service role to read admin data for authentication
-- This is used by Edge Functions with service role key
CREATE POLICY "Allow service role to read admin data"
  ON admin_users
  FOR SELECT
  TO service_role
  USING (true);

-- Policy to allow authenticated admins to read their own data
CREATE POLICY "Allow authenticated admins to read own data"
  ON admin_users
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = id::text);

-- Policy to allow authenticated admins to update their own data
CREATE POLICY "Allow authenticated admins to update own data"
  ON admin_users
  FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = id::text)
  WITH CHECK (auth.uid()::text = id::text);

-- Policy to prevent deletion for now (can be modified later if needed)
-- DELETE operations are not allowed by default due to RLS

-- Create index on username for faster lookups
CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users(username);

-- Create index on created_at for admin management queries
CREATE INDEX IF NOT EXISTS idx_admin_users_created_at ON admin_users(created_at);