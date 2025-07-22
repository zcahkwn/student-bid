/*
  # Fix RPC function to remove capacity_default reference

  1. Changes
    - Remove all references to c.capacity_default
    - Use o.capacity from opportunities table instead
    - Keep all other functionality intact

  2. Security
    - Maintains all existing RLS and validation checks
*/

-- Drop the existing function
DROP FUNCTION IF EXISTS submit_student_bid_secure(uuid, uuid);

-- Create the corrected function without capacity_default references
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
  v_opportunity_record record;
  v_existing_bid_id uuid;
  v_new_bid_id uuid;
  v_result jsonb;
BEGIN
  -- Get opportunity details including class_id and capacity
  SELECT id, class_id, capacity, status, opens_at, closes_at, event_date
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
  SELECT user_id, class_id, tokens_remaining, token_status, bidding_result
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
  
  -- Check if student has already bid on this opportunity
  SELECT id INTO v_existing_bid_id
  FROM bids 
  WHERE student_id = p_student_id AND opportunity_id = p_opportunity_id;
  
  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Student has already bid on this opportunity'
    );
  END IF;
  
  -- Create the bid
  INSERT INTO bids (
    student_id,
    opportunity_id,
    bid_amount,
    is_winner,
    bid_status,
    submission_timestamp,
    validation_status
  ) VALUES (
    p_student_id,
    p_opportunity_id,
    1,
    false,
    'placed',
    now(),
    'validated'
  ) RETURNING id INTO v_new_bid_id;
  
  -- Update student enrollment (decrease tokens, mark as used)
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
  
  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'bid_id', v_new_bid_id,
    'timestamp', extract(epoch from now()),
    'tokens_remaining', v_enrollment_record.tokens_remaining - 1
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Database error: ' || SQLERRM
    );
END;
$$;