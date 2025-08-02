/*
  # Create Admin Authentication System

  1. New Tables
    - `admins`
      - `user_id` (uuid, primary key, references auth.users.id)
      - `name` (text, not null)
      - `email` (text, not null, unique)
      - `admin_type` (text, not null, default 'admin')
      - `created_at` (timestamp with time zone, default now())

  2. Table Modifications
    - `classes`
      - Add `created_by_user_id` (uuid, nullable, references auth.users.id)

  3. Security
    - Enable RLS on `admins` table
    - Add policies for admin registration, profile management
    - Update `classes` table policies for admin-based access control
    - Maintain existing student access policies

  4. Admin Types
    - `admin`: Can only see/manage classes they created or unassigned classes
    - `super_admin`: Can see/manage all classes (must be manually assigned)
*/

-- Create admins table
CREATE TABLE IF NOT EXISTS public.admins (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  admin_type text NOT NULL DEFAULT 'admin' CHECK (admin_type IN ('admin', 'super_admin')),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on admins table
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

-- Add created_by_user_id column to classes table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'classes' AND column_name = 'created_by_user_id'
  ) THEN
    ALTER TABLE public.classes ADD COLUMN created_by_user_id uuid NULL;
  END IF;
END $$;

-- Add foreign key constraint for created_by_user_id
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

-- Update existing classes to have NULL for created_by_user_id (for super_admin visibility)
UPDATE public.classes
SET created_by_user_id = NULL
WHERE created_by_user_id IS NULL;

-- RLS Policies for admins table

-- Allow authenticated users to register as admin (only 'admin' type)
CREATE POLICY "Allow authenticated users to register as admin"
ON public.admins FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND admin_type = 'admin');

-- Allow admins to view their own profile
CREATE POLICY "Admins can view their own profile"
ON public.admins FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Allow super_admin to view all admin profiles
CREATE POLICY "Super admin can view all admin profiles"
ON public.admins FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admins
    WHERE admins.user_id = auth.uid() AND admins.admin_type = 'super_admin'
  )
);

-- Allow admins to update their own profile
CREATE POLICY "Admins can update their own profile"
ON public.admins FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Allow super_admin to update all admin profiles
CREATE POLICY "Super admin can update all admin profiles"
ON public.admins FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admins
    WHERE admins.user_id = auth.uid() AND admins.admin_type = 'super_admin'
  )
);

-- RLS Policies for classes table (admin access control)

-- Allow 'admin' to select classes they created or those with NULL creator
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

-- Allow 'super_admin' to select all classes
CREATE POLICY "Super admin can select all classes"
ON public.classes FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admins 
    WHERE admins.user_id = auth.uid() AND admins.admin_type = 'super_admin'
  )
);

-- Allow 'admin' to insert classes, setting created_by_user_id
CREATE POLICY "Admin can insert classes"
ON public.classes FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.admins 
    WHERE admins.user_id = auth.uid() AND admins.admin_type IN ('admin', 'super_admin')
  )
  AND created_by_user_id = auth.uid()
);

-- Allow 'admin' to update classes they created or unassigned
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

-- Allow 'super_admin' to update all classes
CREATE POLICY "Super admin can update all classes"
ON public.classes FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admins 
    WHERE admins.user_id = auth.uid() AND admins.admin_type = 'super_admin'
  )
);

-- Allow 'admin' to delete classes they created or unassigned
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

-- Allow 'super_admin' to delete all classes
CREATE POLICY "Super admin can delete all classes"
ON public.classes FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admins 
    WHERE admins.user_id = auth.uid() AND admins.admin_type = 'super_admin'
  )
);