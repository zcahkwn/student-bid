/*
  # Add title column to opportunities table

  1. Schema Changes
    - Add `title` column to `opportunities` table
    - Set it as TEXT type, nullable initially for existing records
    - Add a default value for existing records

  2. Data Migration
    - Update existing records to have a generated title based on event_date
    - This ensures backward compatibility

  3. Notes
    - New opportunities will store the admin-inputted title
    - Existing opportunities get a generated title for consistency
*/

-- Add title column to opportunities table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'opportunities' AND column_name = 'title'
  ) THEN
    ALTER TABLE opportunities ADD COLUMN title TEXT;
  END IF;
END $$;

-- Update existing records with generated titles based on event_date
UPDATE opportunities 
SET title = 'Bidding Opportunity - ' || TO_CHAR(event_date::DATE, 'Mon DD, YYYY')
WHERE title IS NULL OR title = '';

-- Add index for better query performance on title
CREATE INDEX IF NOT EXISTS idx_opportunities_title ON opportunities(title);