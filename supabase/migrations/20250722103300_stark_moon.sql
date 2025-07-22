/*
  # Fix RPC function capacity column references

  1. Updates
    - Replace all references to `capacity_default` with `capacity`
    - Ensure all table references match the actual schema
    - Fix any remaining column name mismatches

  2. Security
    - Maintains all existing security checks
    - Preserves token validation logic
*/

-- Drop and recreate the function with correct column references
DROP FUNCTION IF EXISTS submit_student_bid_secure(uuid, uuid);

CREATE OR REPLACE FUNCTION submit_student_bid_secure(
  p_student_id uuid,
  p_opportunity_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_class_id uuid;
  v_tokens_remaining integer;
  v_existing_bid_id uuid;
  v_new_bid_id uuid;
  v_capacity integer;
BEGIN
  -- Get opportunity details and class info
  SELECT o.class_id, c.capacity
  INTO v_class_id, v_capacity
  FROM opportunities o
  JOIN classes c ON c.id = o.class_id
  WHERE o.id = p_opportunity_id;
  
  IF v_class_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Opportunity not found'
    );
  END IF;
  
  -- Check if student is enrolled in this class and get token status
  SELECT tokens_remaining
  INTO v_tokens_remaining
  FROM student_enrollments
  WHERE user_id = p_student_id AND class_id = v_class_id;
  
  IF v_tokens_remaining IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Student not enrolled in this class'
    );
  END IF;
  
  -- Check if student has tokens available
  IF v_tokens_remaining <= 0 THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'No tokens remaining'
    );
  END IF;
  
  -- Check for existing bid
  SELECT id INTO v_existing_bid_id
  FROM bids
  WHERE student_id = p_student_id AND opportunity_id = p_opportunity_id;
  
  IF v_existing_bid_id IS NOT NULL THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Bid already exists for this opportunity'
    );
  END IF;
  
  -- Create the bid
  INSERT INTO bids (student_id, opportunity_id, bid_amount, is_winner, bid_status, validation_status)
  VALUES (p_student_id, p_opportunity_id, 1, false, 'placed', 'validated')
  RETURNING id INTO v_new_bid_id;
  
  -- Update student enrollment to use token
  UPDATE student_enrollments
  SET 
    tokens_remaining = tokens_remaining - 1,
    token_status = 'used',
    updated_at = now()
  WHERE user_id = p_student_id AND class_id = v_class_id;
  
  -- Log token usage
  INSERT INTO token_history (student_id, opportunity_id, amount, type, description)
  VALUES (p_student_id, p_opportunity_id, -1, 'bid', 'Token used for bid submission');
  
  RETURN json_build_object(
    'success', true,
    'bid_id', v_new_bid_id,
    'timestamp', now(),
    'tokens_remaining', v_tokens_remaining - 1
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error_message', SQLERRM
    );
END;
$$;