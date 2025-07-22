/*
  # Fix capacity column reference in submit_student_bid_secure function

  1. Updates
    - Fix column reference from c.capacity_default to c.capacity in the RPC function
    - This matches the actual column name in the classes table from the database schema

  2. Security
    - Maintains all existing security checks and validation logic
    - No changes to RLS policies or permissions
*/

CREATE OR REPLACE FUNCTION submit_student_bid_secure(
  p_student_id UUID,
  p_opportunity_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_class_id UUID;
  v_tokens_remaining INTEGER;
  v_existing_bid_id UUID;
  v_new_bid_id UUID;
  v_capacity INTEGER;
BEGIN
  -- Get the class_id and capacity for this opportunity
  SELECT o.class_id, c.capacity INTO v_class_id, v_capacity
  FROM opportunities o
  JOIN classes c ON c.id = o.class_id
  WHERE o.id = p_opportunity_id;
  
  IF v_class_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Opportunity not found'
    );
  END IF;
  
  -- Check if student is enrolled in this class and has tokens
  SELECT tokens_remaining INTO v_tokens_remaining
  FROM student_enrollments
  WHERE user_id = p_student_id AND class_id = v_class_id;
  
  IF v_tokens_remaining IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Student not enrolled in this class'
    );
  END IF;
  
  IF v_tokens_remaining <= 0 THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'No tokens remaining'
    );
  END IF;
  
  -- Check if student already has a bid for this opportunity
  SELECT id INTO v_existing_bid_id
  FROM bids
  WHERE student_id = p_student_id AND opportunity_id = p_opportunity_id;
  
  IF v_existing_bid_id IS NOT NULL THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Student has already placed a bid for this opportunity'
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
    token_status = 'used'
  WHERE user_id = p_student_id AND class_id = v_class_id;
  
  -- Log the token usage
  INSERT INTO token_history (student_id, opportunity_id, amount, type, description)
  VALUES (p_student_id, p_opportunity_id, -1, 'bid', 'Token used for bid submission');
  
  RETURN json_build_object(
    'success', true,
    'bid_id', v_new_bid_id,
    'tokens_remaining', v_tokens_remaining - 1,
    'timestamp', NOW()
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error_message', SQLERRM
    );
END;
$$;