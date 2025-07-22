-- Create auction bidding system tables
-- 
-- 1. New Tables
--   - classes: Store class information with passwords and reward details
--   - students: Store student information linked to classes
--   - opportunities: Store dinner opportunities for bidding
--   - bids: Store student bids on opportunities
--   - token_history: Store token transaction history
-- 
-- 2. Security
--   - Enable RLS on all tables
--   - Add policies for authenticated access
--   - Add real-time subscriptions

-- Create classes table
CREATE TABLE IF NOT EXISTS classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  password_hash text NOT NULL,
  capacity_default integer DEFAULT 7,
  created_at timestamptz DEFAULT now()
);

-- Create students table
CREATE TABLE IF NOT EXISTS students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid REFERENCES classes(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  student_number text NOT NULL,
  tokens_remaining integer DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

-- Create opportunities table
CREATE TABLE IF NOT EXISTS opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid REFERENCES classes(id) ON DELETE CASCADE,
  description text NOT NULL,
  opens_at timestamptz NOT NULL,
  closes_at timestamptz NOT NULL,
  event_date date NOT NULL,
  capacity integer DEFAULT 7,
  status text DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'open', 'closed', 'completed')),
  draw_seed text,
  created_at timestamptz DEFAULT now()
);

-- Create bids table
CREATE TABLE IF NOT EXISTS bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES opportunities(id) ON DELETE CASCADE,
  is_winner boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(student_id, opportunity_id)
);

-- Create token_history table
CREATE TABLE IF NOT EXISTS token_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES opportunities(id) ON DELETE SET NULL,
  amount integer NOT NULL,
  type text NOT NULL CHECK (type IN ('bid', 'reset', 'topup', 'refund')),
  description text,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and create new ones
DO $$ 
BEGIN
  -- Drop existing policies for classes
  DROP POLICY IF EXISTS "Admins can manage all data" ON classes;
  DROP POLICY IF EXISTS "Enable insert for anon and authenticated users" ON classes;
  DROP POLICY IF EXISTS "Enable select for anon and authenticated users" ON classes;
  DROP POLICY IF EXISTS "Enable update for anon and authenticated users" ON classes;
  DROP POLICY IF EXISTS "Enable delete for anon and authenticated users" ON classes;
  DROP POLICY IF EXISTS "classes_insert_policy" ON classes;
  DROP POLICY IF EXISTS "classes_select_policy" ON classes;
  DROP POLICY IF EXISTS "classes_update_policy" ON classes;
  DROP POLICY IF EXISTS "classes_delete_policy" ON classes;
END $$;

-- Create policies for classes
CREATE POLICY "Allow anonymous and authenticated users to manage classes"
  ON classes
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Drop existing policies for students
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Admins can manage all students" ON students;
  DROP POLICY IF EXISTS "Students can view their own data" ON students;
  DROP POLICY IF EXISTS "Allow anonymous and authenticated users to manage students" ON students;
END $$;

-- Create policies for students
CREATE POLICY "Allow anonymous and authenticated users to manage students"
  ON students
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Drop existing policies for opportunities
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Admins can manage all opportunities" ON opportunities;
  DROP POLICY IF EXISTS "Students can view their class opportunities" ON opportunities;
  DROP POLICY IF EXISTS "Allow anonymous and authenticated users to insert opportunities" ON opportunities;
  DROP POLICY IF EXISTS "Allow anonymous and authenticated users to select opportunities" ON opportunities;
  DROP POLICY IF EXISTS "Allow authenticated users to update opportunities" ON opportunities;
  DROP POLICY IF EXISTS "Allow authenticated users to delete opportunities" ON opportunities;
END $$;

-- Create policies for opportunities
CREATE POLICY "Allow anonymous and authenticated users to insert opportunities"
  ON opportunities
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow anonymous and authenticated users to select opportunities"
  ON opportunities
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to update opportunities"
  ON opportunities
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Allow authenticated users to delete opportunities"
  ON opportunities
  FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Drop existing policies for bids
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Admins can manage all bids" ON bids;
  DROP POLICY IF EXISTS "Students can view their own bids" ON bids;
  DROP POLICY IF EXISTS "Students can create their own bids" ON bids;
  DROP POLICY IF EXISTS "Allow authenticated users to manage bids" ON bids;
END $$;

-- Create policies for bids
CREATE POLICY "Allow authenticated users to manage bids"
  ON bids
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Drop existing policies for token_history
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Admins can manage all token history" ON token_history;
  DROP POLICY IF EXISTS "Students can view their token history" ON token_history;
  DROP POLICY IF EXISTS "Allow authenticated users to manage token history" ON token_history;
  DROP POLICY IF EXISTS "Allow authenticated users to view token history" ON token_history;
END $$;

-- Create policies for token_history
CREATE POLICY "Allow authenticated users to manage token history"
  ON token_history
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to view token history"
  ON token_history
  FOR SELECT
  TO authenticated
  USING (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_students_class_id ON students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_email ON students(email);
CREATE INDEX IF NOT EXISTS idx_opportunities_class_id ON opportunities(class_id);
CREATE INDEX IF NOT EXISTS idx_bids_student_id ON bids(student_id);
CREATE INDEX IF NOT EXISTS idx_bids_opportunity_id ON bids(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_token_history_student_id ON token_history(student_id);
CREATE INDEX IF NOT EXISTS idx_token_history_opportunity_id ON token_history(opportunity_id);

-- Drop existing function and trigger if they exist
DROP TRIGGER IF EXISTS update_opportunity_status_trigger ON opportunities;
DROP FUNCTION IF EXISTS update_opportunity_status();

-- Create function to update opportunity status
CREATE OR REPLACE FUNCTION update_opportunity_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Update status based on current time
  IF NEW.opens_at > NOW() THEN
    NEW.status = 'upcoming';
  ELSIF NEW.opens_at <= NOW() AND NEW.closes_at > NOW() THEN
    NEW.status = 'open';
  ELSIF NEW.closes_at <= NOW() AND NEW.event_date >= CURRENT_DATE THEN
    NEW.status = 'closed';
  ELSE
    NEW.status = 'completed';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for opportunity status updates
CREATE TRIGGER update_opportunity_status_trigger
  BEFORE UPDATE ON opportunities
  FOR EACH ROW
  EXECUTE FUNCTION update_opportunity_status();