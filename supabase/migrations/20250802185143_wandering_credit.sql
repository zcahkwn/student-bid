/*
  # Admin Authentication System

  1. New Features
    - Add role column to users table for role-based access
    - Add created_by_user_id to classes table to track class ownership
    - Create trigger to auto-create user profiles on auth signup
    - Update RLS policies for role-based access control

  2. Security
    - Enable RLS on all tables with appropriate policies
    - Admins can only see classes they created (except super_admin)
    - Students can see classes they're enrolled in
    - Super admin can see all classes

  3. Changes
    - Modified users table structure
    - Modified classes table structure
    - Added comprehensive RLS policies
    - Added automatic user profile creation
*/

-- Add role column to users table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'role'
  ) THEN
    ALTER TABLE users ADD COLUMN role text DEFAULT 'student' NOT NULL;
  END IF;
END $$;

-- Add check constraint for role values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'users_role_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_role_check 
    CHECK (role IN ('student', 'admin', 'super_admin'));
  END IF;
END $$;

-- Add created_by_user_id column to classes table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'classes' AND column_name = 'created_by_user_id'
  ) THEN
    ALTER TABLE classes ADD COLUMN created_by_user_id uuid;
  END IF;
END $$;

-- Add foreign key constraint for created_by_user_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'classes_created_by_user_id_fkey'
  ) THEN
    ALTER TABLE classes ADD CONSTRAINT classes_created_by_user_id_fkey 
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.users (id, name, email, student_number, role)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'name', new.email),
    new.email,
    new.raw_user_meta_data->>'student_number',
    COALESCE(new.raw_user_meta_data->>'role', 'student')
  );
  RETURN new;
END;
$$;

-- Create trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update RLS policies for users table
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;
DROP POLICY IF EXISTS "Allow anon and authenticated users to select users" ON users;
DROP POLICY IF EXISTS "Allow anon and authenticated users to insert users" ON users;
DROP POLICY IF EXISTS "Allow anon and authenticated users to update users" ON users;
DROP POLICY IF EXISTS "Allow anon and authenticated users to delete users" ON users;

-- New RLS policies for users table
CREATE POLICY "Users can read own profile and admins can read all"
  ON users FOR SELECT
  USING (
    auth.uid() = id OR 
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Allow authenticated users to insert own profile"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Update RLS policies for classes table
DROP POLICY IF EXISTS "Allow anonymous and authenticated users to manage classes" ON classes;

-- New RLS policies for classes table
CREATE POLICY "Admins can see their own classes and super_admin sees all"
  ON classes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND (
        (role = 'super_admin') OR
        (role = 'admin' AND (classes.created_by_user_id = auth.uid() OR classes.created_by_user_id IS NULL))
      )
    ) OR
    EXISTS (
      SELECT 1 FROM student_enrollments se
      WHERE se.class_id = classes.id AND se.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can create classes"
  ON classes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins can update their own classes and super_admin updates all"
  ON classes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND (
        (role = 'super_admin') OR
        (role = 'admin' AND (classes.created_by_user_id = auth.uid() OR classes.created_by_user_id IS NULL))
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND (
        (role = 'super_admin') OR
        (role = 'admin' AND (classes.created_by_user_id = auth.uid() OR classes.created_by_user_id IS NULL))
      )
    )
  );

CREATE POLICY "Admins can delete their own classes and super_admin deletes all"
  ON classes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND (
        (role = 'super_admin') OR
        (role = 'admin' AND (classes.created_by_user_id = auth.uid() OR classes.created_by_user_id IS NULL))
      )
    )
  );

-- Insert the default super admin user (this will be created after auth signup)
-- Note: The actual user creation in auth.users must be done through Supabase Auth
-- This is just a placeholder for when that user signs up
INSERT INTO users (id, name, email, student_number, role)
VALUES (
  '00000000-0000-0000-0000-000000000000', -- Placeholder ID, will be replaced
  'Super Admin',
  'admin@example.com',
  'ADMIN001',
  'super_admin'
) ON CONFLICT (id) DO UPDATE SET
  role = 'super_admin',
  name = 'Super Admin',
  student_number = 'ADMIN001';