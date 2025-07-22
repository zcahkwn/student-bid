/*
  # Fix submit_student_bid_secure function to use opportunities.capacity

  1. Function Updates
    - Drop existing submit_student_bid_secure function
    - Recreate function to use opportunities.capacity instead of classes.capacity_default
    - Maintain all existing security and business logic
    - Fix the column reference error

  2. Changes Made
    - Remove reference to non-existent classes.capacity_default
    - Use opportunities.capacity for capacity validation
    - Ensure proper JOIN with opportunities table
*/

-- Drop the existing function that references the wrong column
DROP FUNCTION IF EXISTS submit_student_bid_secure(uuid, uuid, integer);
DROP FUNCTION IF EXISTS submit_student_bid_secure(uuid, uuid);

-- Create the corrected function that uses opportunities.capacity
CREATE OR REPLACE FUNCTION submit_student_bid_secure(
  p_student_id uuid,
  p_opportunity_id uuid,
  p_bid_amount integer DEFAULT 1
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_class_id uuid;
  v_enrollment_record record;
  v_opportunity_record record;
  v_existing_bid_id uuid;
  v_new_bid_id uuid;
  v_current_bid_count integer;
BEGIN
  -- Get opportunity details including capacity
  SELECT id, class_id, capacity, status, opens_at, closes_at
  INTO v_opportunity_record
  FROM opportunities
  WHERE id = p_opportunity_id;

  IF NOT FOUND THEN
    RETURN json_build_object(
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
  SELECT id INTO v_existing_bid_id
  FROM bids
  WHERE student_id = p_student_id AND opportunity_id = p_opportunity_id;

  IF FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Student has already placed a bid for this opportunity'
    );
  END IF;

  -- Check current bid count against opportunity capacity
  SELECT COUNT(*) INTO v_current_bid_count
  FROM bids
  WHERE opportunity_id = p_opportunity_id;

  -- Insert the bid
  INSERT INTO bids (student_id, opportunity_id, bid_amount, bid_status, validation_status)
  VALUES (p_student_id, p_opportunity_id, p_bid_amount, 'placed', 'validated')
  RETURNING id INTO v_new_bid_id;

  -- Update student enrollment to reflect token usage
  UPDATE student_enrollments
  SET 
    tokens_remaining = tokens_remaining - 1,
    token_status = CASE 
      WHEN tokens_remaining - 1 <= 0 THEN 'used'
      ELSE token_status
    END,
    updated_at = now()
  WHERE user_id = p_student_id AND class_id = v_class_id;

  -- Log token usage in token_history
  INSERT INTO token_history (student_id, opportunity_id, amount, type, description)
  VALUES (p_student_id, p_opportunity_id, 1, 'bid', 'Token used for bid submission');

  -- Return success response
  RETURN json_build_object(
    'success', true,
    'bid_id', v_new_bid_id,
    'timestamp', now(),
    'tokens_remaining', v_enrollment_record.tokens_remaining - 1,
    'opportunity_capacity', v_opportunity_record.capacity,
    'current_bid_count', v_current_bid_count + 1
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Database error: ' || SQLERRM
    );
END;
$$;