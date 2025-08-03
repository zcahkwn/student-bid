/*
  # Revert Admin Authentication System

  This migration reverts the admin authentication system changes by:
  1. Dropping the admin-related function
  2. Dropping admin table policies
  3. Dropping the admins table
  4. Removing created_by_user_id column from classes
  5. Restoring simple RLS policies for classes table

  ## Changes Reverted
  - Removes create_admin_profile_secure function
  - Removes admins table and all related policies
  - Removes created_by_user_id column from classes table
  - Restores original classes table RLS policies
*/

-- Step 1: Drop the admin registration function
DROP FUNCTION IF EXISTS public.create_admin_profile_secure(uuid, text, text, text);

-- Step 2: Drop all policies on admins table before dropping the table
DROP POLICY IF EXISTS "Allow authenticated users to register as admin" ON public.admins;
DROP POLICY IF EXISTS "Allow authenticated users to view their own profile" ON public.admins;
DROP POLICY IF EXISTS "Allow authenticated users to update their own profile" ON public.admins;

-- Step 3: Drop the admins table entirely
DROP TABLE IF EXISTS public.admins CASCADE;

-- Step 4: Remove the created_by_user_id column from classes table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'classes' AND column_name = 'created_by_user_id'
  ) THEN
    ALTER TABLE public.classes DROP COLUMN created_by_user_id;
  END IF;
END $$;

-- Step 5: Drop current classes policies and restore original simple policies
DROP POLICY IF EXISTS "Allow authenticated users to manage classes" ON public.classes;

-- Create simple policies that allow both anon and authenticated users to manage classes
-- This matches the pattern used in other tables like users and student_enrollments
CREATE POLICY "Enable select for anon and authenticated users"
ON public.classes FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Enable insert for anon and authenticated users"
ON public.classes FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Enable update for anon and authenticated users"
ON public.classes FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Enable delete for anon and authenticated users"
ON public.classes FOR DELETE
TO anon, authenticated
USING (true);