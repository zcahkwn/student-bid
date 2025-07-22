/*
  # Fix RPC function to remove capacity reference and ensure proper updates

  1. Remove capacity column reference that doesn't exist
  2. Ensure bids table gets new row when student submits bid
  3. Ensure student_enrollments table gets updated when token is used
  4. Maintain all security validations
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
  v_enrollment_record RECORD;
  v_bid_id UUID;
  v_result JSON;
BEGIN
  -- Get the class_id for this opportunity
  SELECT class_id INTO v_class_id
  FROM opportunities
  WHERE id = p_opportunity_id;
  
  IF v_class_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Opportunity not found'
    );
  END IF;
  
  -- Check if student is enrolled in this class and has tokens
  SELECT * INTO v_enrollment_record
  FROM student_enrollments
  WHERE user_id = p_student_id AND class_id = v_class_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Student not enrolled in this class'
    );
  END IF;
  
  -- Check if student has tokens remaining
  IF v_enrollment_record.tokens_remaining <= 0 THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'No tokens remaining'
    );
  END IF;
  
  -- Check if student has already bid on this opportunity
  IF EXISTS (
    SELECT 1 FROM bids 
    WHERE student_id = p_student_id AND opportunity_id = p_opportunity_id
  ) THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Student has already bid on this opportunity'
    );
  END IF;
  
  -- Insert the bid into bids table
  INSERT INTO bids (
    student_id,
    opportunity_id,
    bid_amount,
    is_winner,
    bid_status,
    validation_status
  ) VALUES (
    p_student_id,
    p_opportunity_id,
    1,
    false,
    'placed',
    'validated'
  ) RETURNING id INTO v_bid_id;
  
  -- Update student enrollment: decrease tokens and mark as used
  UPDATE student_enrollments
  SET 
    tokens_remaining = tokens_remaining - 1,
    token_status = 'used',
    updated_at = now()
  WHERE user_id = p_student_id AND class_id = v_class_id;
  
  -- Log token usage in token_history
  INSERT INTO token_history (
    student_id,
    opportunity_id,
    amount,
    type,
    description
  ) VALUES (
    p_student_id,
    p_opportunity_id,
    -1,
    'bid',
    'Token used for bid submission'
  );
  
  -- Return success with bid details
  RETURN json_build_object(
    'success', true,
    'bid_id', v_bid_id,
    'timestamp', now(),
    'tokens_remaining', v_enrollment_record.tokens_remaining - 1
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Database error: ' || SQLERRM
    );
END;
$$;