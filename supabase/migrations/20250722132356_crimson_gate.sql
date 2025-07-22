/*
  # Fix update_opportunity_on_bid_change function

  1. Database Function Update
    - Remove reference to non-existent `capacity_default` column from `classes` table
    - Use only the `capacity` column from `opportunities` table
    - Simplify the query by removing unnecessary JOIN with classes table

  2. Changes Made
    - Modified the capacity retrieval query to use only `o.capacity` from opportunities table
    - Removed the JOIN with classes table that was causing the error
    - Function now directly uses the capacity value from the specific opportunity
*/

CREATE OR REPLACE FUNCTION update_opportunity_on_bid_change()
RETURNS TRIGGER AS $$
DECLARE
  v_bid_count integer;
  v_capacity integer;
BEGIN
  -- Get current bid count for the opportunity
  SELECT COUNT(*) INTO v_bid_count
  FROM bids
  WHERE opportunity_id = COALESCE(NEW.opportunity_id, OLD.opportunity_id)
    AND bid_status IN ('placed', 'confirmed');
  
  -- Get opportunity capacity directly from opportunities table
  SELECT o.capacity INTO v_capacity
  FROM opportunities o
  WHERE o.id = COALESCE(NEW.opportunity_id, OLD.opportunity_id);
  
  -- Update opportunity status if needed
  -- This could trigger additional business logic based on bid counts
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;