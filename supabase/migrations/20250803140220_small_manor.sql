/*
  # Create Admin System with RLS Policies

  1. New Tables
    - `admins`
      - `user_id` (uuid, primary key, references auth.users)
      - `name` (text, not null)
      - `email` (text, unique, not null)
      - `admin_type` (text, default 'admin', check constraint)
      - `created_at` (timestamp)

  2. Table Modifications
    - Add `created_by_user_id` column to `classes` table

  3. Security
    - Enable RLS on `admins` table
    - Add policies for admin registration and profile management
    - Update `classes` table policies to work with admin system
    - Allow admins to create, view, update, and delete classes based on their role
*/

-- Create the admins table
CREATE TABLE IF NOT EXISTS public.admins (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  admin_type text NOT NULL DEFAULT 'admin' CHECK (admin_type IN ('admin', 'super_admin')),
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on admins table
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

-- Add created_by_user_id column to classes table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'classes' AND column_name = 'created_by_user_id'
  ) THEN
    ALTER TABLE public.classes ADD COLUMN created_by_user_id uuid NULL;
  END IF;
END $$;

-- Add foreign key constraint for created_by_user_id if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_classes_created_by_user'
  ) THEN
    ALTER TABLE public.classes
    ADD CONSTRAINT fk_classes_created_by_user
    FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- RLS Policies for admins table
CREATE POLICY "Allow authenticated users to register as admin"
ON public.admins FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND admin_type = 'admin');

CREATE POLICY "Admins can view their own profile"
ON public.admins FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Super admin can view all admin profiles"
ON public.admins FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.admins
  WHERE admins.user_id = auth.uid() AND admins.admin_type = 'super_admin'
));

CREATE POLICY "Admins can update their own profile"
ON public.admins FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Super admin can update all admin profiles"
ON public.admins FOR UPDATE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.admins
  WHERE admins.user_id = auth.uid() AND admins.admin_type = 'super_admin'
));

-- Drop existing classes policies that might conflict
DROP POLICY IF EXISTS "Enable delete for anon and authenticated users" ON public.classes;
DROP POLICY IF EXISTS "Enable insert for anon and authenticated users" ON public.classes;
DROP POLICY IF EXISTS "Enable select for anon and authenticated users" ON public.classes;
DROP POLICY IF EXISTS "Enable update for anon and authenticated users" ON public.classes;

-- New RLS Policies for classes table
-- Allow students to view classes they are enrolled in
CREATE POLICY "Students can view enrolled classes"
ON public.classes FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.student_enrollments
  WHERE student_enrollments.class_id = classes.id 
  AND student_enrollments.user_id = auth.uid()
));

-- Allow admins to view classes they created or unassigned classes
CREATE POLICY "Admin can select own classes and unassigned"
ON public.classes FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admins
    WHERE admins.user_id = auth.uid() AND admins.admin_type = 'admin'
  )
  AND (classes.created_by_user_id = auth.uid() OR classes.created_by_user_id IS NULL)
);

-- Allow super_admin to view all classes
CREATE POLICY "Super admin can select all classes"
ON public.classes FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.admins
  WHERE admins.user_id = auth.uid() AND admins.admin_type = 'super_admin'
));

-- Allow admins to create classes
CREATE POLICY "Admin can insert classes"
ON public.classes FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.admins
    WHERE admins.user_id = auth.uid() AND admins.admin_type IN ('admin', 'super_admin')
  )
);

-- Allow admins to update classes they created or unassigned classes
CREATE POLICY "Admin can update own classes and unassigned"
ON public.classes FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admins
    WHERE admins.user_id = auth.uid() AND admins.admin_type = 'admin'
  )
  AND (classes.created_by_user_id = auth.uid() OR classes.created_by_user_id IS NULL)
);

-- Allow super_admin to update all classes
CREATE POLICY "Super admin can update all classes"
ON public.classes FOR UPDATE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.admins
  WHERE admins.user_id = auth.uid() AND admins.admin_type = 'super_admin'
));

-- Allow admins to delete classes they created or unassigned classes
CREATE POLICY "Admin can delete own classes and unassigned"
ON public.classes FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admins
    WHERE admins.user_id = auth.uid() AND admins.admin_type = 'admin'
  )
  AND (classes.created_by_user_id = auth.uid() OR classes.created_by_user_id IS NULL)
);

-- Allow super_admin to delete all classes
CREATE POLICY "Super admin can delete all classes"
ON public.classes FOR DELETE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.admins
  WHERE admins.user_id = auth.uid() AND admins.admin_type = 'super_admin'
));