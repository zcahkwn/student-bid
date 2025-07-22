/*
  # Add bidding closes date to opportunities

  1. New Column
    - `bidding_closes_at` (timestamptz) - When bidding closes for this opportunity
  
  2. Updates
    - Set default bidding closes time to 1 hour before event for existing records
    - Add index for performance
*/

-- Add the bidding_closes_at column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'opportunities' AND column_name = 'bidding_closes_at'
  ) THEN
    ALTER TABLE opportunities ADD COLUMN bidding_closes_at timestamptz;
  END IF;
END $$;

-- Update existing records to set bidding_closes_at to 1 hour before the event
UPDATE opportunities 
SET bidding_closes_at = (event_date::date + interval '1 day' - interval '1 hour')::timestamptz
WHERE bidding_closes_at IS NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_opportunities_bidding_closes_at 
ON opportunities(bidding_closes_at);