/*
  # Add new columns to students table

  1. New Columns
    - `token_status` (VARCHAR) - Track token usage status
    - `bidding_result` (VARCHAR) - Track bidding outcome

  2. Default Values
    - token_status: 'unused'
    - bidding_result: 'pending'

  3. Constraints
    - token_status: CHECK constraint for valid values
    - bidding_result: CHECK constraint for valid values
*/

-- Add new columns to students table
DO $$
BEGIN
  -- Add token_status column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'students' AND column_name = 'token_status'
  ) THEN
    ALTER TABLE students ADD COLUMN token_status VARCHAR(20) DEFAULT 'unused' 
    CHECK (token_status IN ('unused', 'used'));
  END IF;

  -- Add bidding_result column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'students' AND column_name = 'bidding_result'
  ) THEN
    ALTER TABLE students ADD COLUMN bidding_result VARCHAR(20) DEFAULT 'pending' 
    CHECK (bidding_result IN ('pending', 'won', 'lost'));
  END IF;
END $$;

-- Update existing records to have default values
UPDATE students 
SET token_status = 'unused' 
WHERE token_status IS NULL;

UPDATE students 
SET bidding_result = 'pending' 
WHERE bidding_result IS NULL;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_students_token_status ON students(token_status);
CREATE INDEX IF NOT EXISTS idx_students_bidding_result ON students(bidding_result);

-- Create function to automatically update token_status when tokens_remaining changes
CREATE OR REPLACE FUNCTION update_token_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Update token_status based on tokens_remaining
  IF NEW.tokens_remaining <= 0 THEN
    NEW.token_status = 'used';
  ELSE
    NEW.token_status = 'unused';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update token_status
DROP TRIGGER IF EXISTS update_student_token_status_trigger ON students;
CREATE TRIGGER update_student_token_status_trigger
  BEFORE UPDATE ON students
  FOR EACH ROW
  EXECUTE FUNCTION update_token_status();