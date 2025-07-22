/*
  # Add capacity_default column to classes table

  1. Schema Changes
    - Add `capacity_default` column to `classes` table
    - Set default value to 7 (matching application defaults)
    - Make it non-nullable since all classes should have a default capacity

  2. Data Migration
    - Update existing classes to have the default capacity value

  This resolves the "column c.capacity_default does not exist" error in the submit_student_bid_secure RPC function.
*/

-- Add the missing capacity_default column to the classes table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'classes' AND column_name = 'capacity_default'
  ) THEN
    ALTER TABLE classes ADD COLUMN capacity_default integer DEFAULT 7 NOT NULL;
  END IF;
END $$;

-- Update any existing classes to have the default capacity
UPDATE classes 
SET capacity_default = 7 
WHERE capacity_default IS NULL;