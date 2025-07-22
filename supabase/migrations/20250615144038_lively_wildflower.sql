/*
  # Bid Submission RPC Function

  1. Function
    - `submit_student_bid()`: Atomic bid submission with all required updates
    
  2. Operations
    - Insert bid record
    - Update student token status
    - Update opportunity statistics
    - Handle concurrent access safely
    
  3. Error Handling
    - Transaction rollback on any failure
    - Proper error messages
    - Constraint validation
*/

-- Create the atomic bid submission function
CREATE OR REPLACE FUNCTION submit_student_bid(
  p_student_id uuid,
  p_opportunity_id uuid,
  p_bid_amount integer DEFAULT 1
)
RETURNS jsonb AS $$
DECLARE
  v_bid_id uuid;
  v_student_record record;
  v_opportunity_record record;
  v_result jsonb;
BEGIN
  -- Start transaction (implicit in function)
  
  -- Lock and validate student record
  SELECT * INTO v_student_record
  FROM students 
  WHERE id = p_student_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found: %', p_student_id;
  END IF;
  
  -- Check if student has tokens remaining
  IF v_student_record.tokens_remaining <= 0 THEN
    RAISE EXCEPTION 'Student has no tokens remaining';
  END IF;
  
  -- Lock and validate opportunity record
  SELECT * INTO v_opportunity_record
  FROM opportunities 
  WHERE id = p_opportunity_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Opportunity not found: %', p_opportunity_id;
  END IF;
  
  -- Verify student belongs to the same class as opportunity
  IF v_student_record.class_id != v_opportunity_record.class_id THEN
    RAISE EXCEPTION 'Student and opportunity must be in the same class';
  END IF;
  
  -- Check for duplicate bid
  IF EXISTS (
    SELECT 1 FROM bids 
    WHERE student_id = p_student_id AND opportunity_id = p_opportunity_id
  ) THEN
    RAISE EXCEPTION 'Student has already placed a bid for this opportunity';
  END IF;
  
  -- Insert bid record
  INSERT INTO bids (student_id, opportunity_id, bid_amount, created_at)
  VALUES (p_student_id, p_opportunity_id, p_bid_amount, NOW())
  RETURNING id INTO v_bid_id;
  
  -- Update student token status
  UPDATE students 
  SET 
    tokens_remaining = tokens_remaining - 1,
    token_status = CASE 
      WHEN tokens_remaining - 1 <= 0 THEN 'used'
      ELSE 'unused'
    END
  WHERE id = p_student_id;
  
  -- Create success result
  v_result := jsonb_build_object(
    'success', true,
    'bid_id', v_bid_id,
    'timestamp', NOW(),
    'student_id', p_student_id,
    'opportunity_id', p_opportunity_id,
    'bid_amount', p_bid_amount
  );
  
  RETURN v_result;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log error details
    RAISE EXCEPTION 'Bid submission failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get real-time bid count for an opportunity
CREATE OR REPLACE FUNCTION get_opportunity_bid_count(p_opportunity_id uuid)
RETURNS integer AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::integer
    FROM bids
    WHERE opportunity_id = p_opportunity_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get class bid statistics
CREATE OR REPLACE FUNCTION get_class_bid_stats(p_class_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_total_bids integer;
  v_last_bid_time timestamptz;
  v_active_bidders integer;
BEGIN
  -- Get total bids for the class
  SELECT COUNT(*)::integer INTO v_total_bids
  FROM bids b
  JOIN opportunities o ON b.opportunity_id = o.id
  WHERE o.class_id = p_class_id;
  
  -- Get last bid timestamp
  SELECT MAX(b.created_at) INTO v_last_bid_time
  FROM bids b
  JOIN opportunities o ON b.opportunity_id = o.id
  WHERE o.class_id = p_class_id;
  
  -- Get count of students who have placed bids
  SELECT COUNT(DISTINCT b.student_id)::integer INTO v_active_bidders
  FROM bids b
  JOIN opportunities o ON b.opportunity_id = o.id
  WHERE o.class_id = p_class_id;
  
  RETURN jsonb_build_object(
    'total_bids', v_total_bids,
    'last_bid_time', v_last_bid_time,
    'active_bidders', v_active_bidders
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;