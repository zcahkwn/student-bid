/*
  # Fix RPC function capacity_default column error

  1. Problem
    - RPC function `submit_student_bid_secure` references non-existent column `c.capacity_default`
    - Should reference `o.capacity` from opportunities table instead

  2. Solution
    - Drop existing function completely
    - Create new function with correct column references
    - Remove all references to capacity_default
    - Use proper column names from opportunities table
*/

-- Drop the existing function completely
DROP FUNCTION IF EXISTS submit_student_bid_secure(uuid, uuid);

-- Create the corrected function
CREATE OR REPLACE FUNCTION submit_student_bid_secure(
  p_student_id uuid,
  p_opportunity_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_class_id uuid;
  v_enrollment_record record;
  v_existing_bid_id uuid;
  v_new_bid_id uuid;
  v_opportunity_record record;
BEGIN
  -- Get opportunity details and class_id
  SELECT id, class_id, capacity, status
  INTO v_opportunity_record
  FROM opportunities 
  WHERE id = p_opportunity_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Opportunity not found'
    );
  END IF;
  
  v_class_id := v_opportunity_record.class_id;
  
  -- Check if student is enrolled in the class
  SELECT *
  INTO v_enrollment_record
  FROM student_enrollments
  WHERE user_id = p_student_id AND class_id = v_class_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Student not enrolled in this class'
    );
  END IF;
  
  -- Check if student has tokens remaining
  IF v_enrollment_record.tokens_remaining <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'No tokens remaining'
    );
  END IF;
  
  -- Check for existing bid
  SELECT id INTO v_existing_bid_id
  FROM bids
  WHERE student_id = p_student_id AND opportunity_id = p_opportunity_id;
  
  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Student has already placed a bid for this opportunity'
    );
  END IF;
  
  -- Insert the bid
  INSERT INTO bids (
    student_id,
    opportunity_id,
    bid_amount,
    bid_status,
    validation_status
  ) VALUES (
    p_student_id,
    p_opportunity_id,
    1,
    'placed',
    'validated'
  ) RETURNING id INTO v_new_bid_id;
  
  -- Update student enrollment
  UPDATE student_enrollments
  SET 
    tokens_remaining = tokens_remaining - 1,
    token_status = 'used',
    updated_at = now()
  WHERE user_id = p_student_id AND class_id = v_class_id;
  
  -- Log token usage
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
  
  RETURN jsonb_build_object(
    'success', true,
    'bid_id', v_new_bid_id,
    'message', 'Bid submitted successfully'
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Database error: ' || SQLERRM
    );
END;
$$;