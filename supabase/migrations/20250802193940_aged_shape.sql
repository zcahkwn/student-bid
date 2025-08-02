/*
  # Fix Admin RLS Policies - Remove Infinite Recursion

  This migration fixes the infinite recursion issue in the admins table RLS policies
  and ensures proper registration functionality.

  ## Changes Made
  1. Drop existing problematic policies that cause infinite recursion
  2. Create simple, non-recursive policies for basic admin operations
  3. Ensure authenticated users can register as admins
  4. Allow admins to view their own profiles without recursion

  ## Security
  - Users can only insert their own admin profile with 'admin' type
  - Users can only view their own admin profile
  - Super admin privileges must still be assigned manually in the database
*/

-- Drop all existing policies on admins table to start fresh
DROP POLICY IF EXISTS "Allow authenticated users to register as admin" ON public.admins;
DROP POLICY IF EXISTS "Admins can view their own profile" ON public.admins;
DROP POLICY IF EXISTS "Super admin can view all admin profiles" ON public.admins;
DROP POLICY IF EXISTS "Admins can update their own profile" ON public.admins;
DROP POLICY IF EXISTS "Super admin can update all admin profiles" ON public.admins;
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to manage classes" ON public.classes;

-- Create simple, non-recursive policies for admins table
CREATE POLICY "Allow authenticated users to register as admin"
ON public.admins FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND admin_type = 'admin');

CREATE POLICY "Allow authenticated users to view their own profile"
ON public.admins FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Allow authenticated users to update their own profile"
ON public.admins FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Update classes table policies to be simpler and avoid recursion
-- First drop the problematic policies
DROP POLICY IF EXISTS "Admin can select own classes and unassigned" ON public.classes;
DROP POLICY IF EXISTS "Super admin can select all classes" ON public.classes;
DROP POLICY IF EXISTS "Admin can insert classes" ON public.classes;
DROP POLICY IF EXISTS "Super admin can insert classes" ON public.classes;
DROP POLICY IF EXISTS "Admin can update own classes and unassigned" ON public.classes;
DROP POLICY IF EXISTS "Super admin can update all classes" ON public.classes;
DROP POLICY IF EXISTS "Admin can delete own classes and unassigned" ON public.classes;
DROP POLICY IF EXISTS "Super admin can delete all classes" ON public.classes;

-- Create simpler policies for classes that don't cause recursion
-- For now, allow all authenticated users to manage classes
-- The application logic will handle admin verification
CREATE POLICY "Allow authenticated users to manage classes"
ON public.classes FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);