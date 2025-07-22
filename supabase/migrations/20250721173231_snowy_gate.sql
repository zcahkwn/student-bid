/*
  # Add title column to opportunities table

  1. Schema Changes
    - Add `title` column to `opportunities` table
    - Set default value for existing records
    - Make the column NOT NULL after setting defaults

  2. Data Migration
    - Update existing records to have a default title based on event_date
    - Ensure all records have a proper title

  This migration adds the missing title field that the frontend expects.
*/

-- Add title column to opportunities table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'opportunities' AND column_name = 'title'
  ) THEN
    -- Add the title column as nullable first
    ALTER TABLE opportunities ADD COLUMN title text;
    
    -- Update existing records with a default title based on event_date
    UPDATE opportunities 
    SET title = 'Bidding Opportunity - ' || to_char(event_date::date, 'DD/MM/YYYY')
    WHERE title IS NULL;
    
    -- Now make the column NOT NULL
    ALTER TABLE opportunities ALTER COLUMN title SET NOT NULL;
    
    -- Add a default value for future inserts
    ALTER TABLE opportunities ALTER COLUMN title SET DEFAULT 'Bidding Opportunity';
  END IF;
END $$;