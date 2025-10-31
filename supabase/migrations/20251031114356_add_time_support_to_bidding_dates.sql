/*
  # Add Time Support to Bidding Dates

  ## Overview
  This migration updates the opportunities table to support time-based bidding deadlines,
  not just date-based deadlines. This allows admins to set specific times when bidding closes.

  ## Changes Made

  1. Table Modifications - opportunities
    - Change `opens_at` column from date to timestamptz (if not already)
    - Change `closes_at` column from date to timestamptz (if not already)
    - Update existing date-only values to include default time (23:59:59 for closes_at, 00:00:00 for opens_at)

  ## Important Notes
  - All existing close dates will be set to end of day (23:59:59) to maintain current behavior
  - All existing open dates will be set to start of day (00:00:00)
  - Timezone aware timestamps ensure consistent behavior across timezones
  - This change is backward compatible - existing functionality continues to work

  ## Security
  - No RLS policy changes required
  - Maintains all existing access controls
*/

-- First, check if columns need to be updated
DO $$
BEGIN
  -- Update opens_at to timestamptz if it's currently date type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'opportunities' 
    AND column_name = 'opens_at' 
    AND data_type = 'date'
  ) THEN
    -- Convert existing date values to timestamptz at start of day
    ALTER TABLE opportunities 
    ALTER COLUMN opens_at TYPE timestamptz 
    USING opens_at::timestamp AT TIME ZONE 'UTC';
    
    RAISE NOTICE 'Updated opens_at column to timestamptz';
  END IF;

  -- Update closes_at to timestamptz if it's currently date type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'opportunities' 
    AND column_name = 'closes_at' 
    AND data_type = 'date'
  ) THEN
    -- Convert existing date values to timestamptz at end of day (23:59:59)
    ALTER TABLE opportunities 
    ALTER COLUMN closes_at TYPE timestamptz 
    USING (closes_at::timestamp + interval '23 hours 59 minutes 59 seconds') AT TIME ZONE 'UTC';
    
    RAISE NOTICE 'Updated closes_at column to timestamptz';
  END IF;

  -- Update event_date to remain as date (we only need day for events)
  -- No changes needed for event_date as it should remain as date type
END $$;

-- Add comment to document the change
COMMENT ON COLUMN opportunities.opens_at IS 'Timestamp when bidding opens for this opportunity (timezone aware)';
COMMENT ON COLUMN opportunities.closes_at IS 'Timestamp when bidding closes for this opportunity (timezone aware)';
COMMENT ON COLUMN opportunities.event_date IS 'Date of the actual event (date only, no time needed)';
