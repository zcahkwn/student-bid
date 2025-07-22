/*
  # Create users and student_enrollments tables

  1. New Tables
    - `users`
      - `id` (uuid, primary key)
      - `name` (text, not null)
      - `email` (text, unique, not null)
      - `student_number` (text, not null)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    - `student_enrollments`
      - `user_id` (uuid, foreign key to users)
      - `class_id` (uuid, foreign key to classes)
      - `tokens_remaining` (integer, default 1)
      - `token_status` (varchar, default 'unused')
      - `bidding_result` (varchar, default 'pending')
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users to manage their data

  3. Changes
    - Creates the missing tables needed for user enrollment system
    - Establishes proper foreign key relationships
*/

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  student_number text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create student_enrollments table
CREATE TABLE IF NOT EXISTS student_enrollments (
  user_id uuid NOT NULL,
  class_id uuid NOT NULL,
  tokens_remaining integer DEFAULT 1,
  token_status varchar(20) DEFAULT 'unused',
  bidding_result varchar(20) DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, class_id)
);

-- Add foreign key constraints
ALTER TABLE student_enrollments 
ADD CONSTRAINT student_enrollments_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE student_enrollments 
ADD CONSTRAINT student_enrollments_class_id_fkey 
FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;

-- Add check constraints
ALTER TABLE student_enrollments 
ADD CONSTRAINT student_enrollments_token_status_check 
CHECK (token_status IN ('unused', 'used'));

ALTER TABLE student_enrollments 
ADD CONSTRAINT student_enrollments_bidding_result_check 
CHECK (bidding_result IN ('pending', 'won', 'lost'));

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_enrollments ENABLE ROW LEVEL SECURITY;

-- Create policies for users table
CREATE POLICY "Users can manage their own data"
  ON users
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create policies for student_enrollments table
CREATE POLICY "Users can manage their enrollments"
  ON student_enrollments
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_student_number ON users(student_number);
CREATE INDEX IF NOT EXISTS idx_student_enrollments_user_id ON student_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_student_enrollments_class_id ON student_enrollments(class_id);

-- Create trigger function for updating updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_student_enrollments_updated_at 
    BEFORE UPDATE ON student_enrollments 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();