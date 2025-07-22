/*
  # Add Capacity Column to Opportunities Table

  1. New Column
    - Ensure the `capacity` column exists in the opportunities table
    - Make sure it's properly used in the application
    
  2. Changes
    - Add capacity column if it doesn't exist
    - Set default value to match class default capacity
    - Update existing records
*/

-- Check if capacity column exists and add it if not
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'opportunities' AND column_name = 'capacity'
  ) THEN
    ALTER TABLE opportunities ADD COLUMN capacity integer DEFAULT 7;
  END IF;
END $$;

-- Update existing opportunities to use class default capacity if not set
UPDATE opportunities o
SET capacity = c.capacity_default
FROM classes c
WHERE o.class_id = c.id AND o.capacity IS NULL;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_opportunities_capacity ON opportunities(capacity);

-- Update the bid submission function to respect opportunity-specific capacity
CREATE OR REPLACE FUNCTION get_opportunity_capacity(p_opportunity_id uuid)
RETURNS integer AS $$
DECLARE
  v_capacity integer;
BEGIN
  SELECT COALESCE(o.capacity, c.capacity_default, 7) INTO v_capacity
  FROM opportunities o
  JOIN classes c ON o.class_id = c.id
  WHERE o.id = p_opportunity_id;
  
  RETURN v_capacity;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the opportunity creation function to include capacity
CREATE OR REPLACE FUNCTION create_opportunity_with_capacity(
  p_class_id uuid,
  p_description text,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_event_date date,
  p_capacity integer DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_opportunity_id uuid;
  v_class_capacity integer;
BEGIN
  -- Get class default capacity if no specific capacity provided
  IF p_capacity IS NULL THEN
    SELECT capacity_default INTO v_class_capacity
    FROM classes
    WHERE id = p_class_id;
    
    p_capacity := COALESCE(v_class_capacity, 7);
  END IF;
  
  -- Create the opportunity
  INSERT INTO opportunities (
    class_id,
    description,
    opens_at,
    closes_at,
    event_date,
    capacity,
    status,
    created_at
  )
  VALUES (
    p_class_id,
    p_description,
    p_opens_at,
    p_closes_at,
    p_event_date,
    p_capacity,
    'upcoming',
    NOW()
  )
  RETURNING id INTO v_opportunity_id;
  
  RETURN v_opportunity_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;