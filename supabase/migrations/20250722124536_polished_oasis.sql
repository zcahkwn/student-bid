/*
  # Fix submit_student_bid_secure function

  1. Function Updates
    - Drop and recreate the submit_student_bid_secure function
    - Remove reference to non-existent c.capacity_default column
    - Use opportunities.capacity instead for capacity checks
    - Ensure proper error handling and validation

  2. Changes Made
    - Removed c.capacity_default reference
    - Updated capacity logic to use opportunities table
    - Maintained all existing functionality and security checks
*/

-- Drop the existing function to ensure clean recreation
DROP FUNCTION IF EXISTS submit_student_bid_secure(uuid, uuid, integer);

-- Create the corrected submit_student_bid_secure function
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
  v_tokens_remaining integer;
  v_opportunity_status text;
  v_opportunity_capacity integer;
  v_current_bids integer;
  v_existing_bid_id uuid;
  v_result json;
BEGIN
  -- Validate inputs
  IF p_student_id IS NULL OR p_opportunity_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Student ID and Opportunity ID are required'
    );
  END IF;

  IF p_bid_amount < 1 THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Bid amount must be at least 1'
    );
  END IF;

  -- Get opportunity details and validate
  SELECT o.class_id, o.status, o.capacity
  INTO v_class_id, v_opportunity_status, v_opportunity_capacity
  FROM opportunities o
  WHERE o.id = p_opportunity_id;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Opportunity not found'
    );
  END IF;

  -- Check if opportunity is open for bidding
  IF v_opportunity_status != 'open' THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Opportunity is not open for bidding'
    );
  END IF;

  -- Get student's remaining tokens for this class
  SELECT se.tokens_remaining
  INTO v_tokens_remaining
  FROM student_enrollments se
  WHERE se.user_id = p_student_id AND se.class_id = v_class_id;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Student not enrolled in this class'
    );
  END IF;

  -- Check if student has enough tokens
  IF v_tokens_remaining < p_bid_amount THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Insufficient tokens remaining'
    );
  END IF;

  -- Check if student already has a bid for this opportunity
  SELECT id INTO v_existing_bid_id
  FROM bids
  WHERE student_id = p_student_id AND opportunity_id = p_opportunity_id;

  IF FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'You have already placed a bid for this opportunity'
    );
  END IF;

  -- Count current bids for capacity check
  SELECT COUNT(*)
  INTO v_current_bids
  FROM bids
  WHERE opportunity_id = p_opportunity_id AND bid_status = 'placed';

  -- Check if opportunity has reached capacity
  IF v_current_bids >= v_opportunity_capacity THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Opportunity has reached maximum capacity'
    );
  END IF;

  -- Insert the bid
  INSERT INTO bids (student_id, opportunity_id, bid_amount, bid_status, validation_status)
  VALUES (p_student_id, p_opportunity_id, p_bid_amount, 'placed', 'validated');

  -- Update student's remaining tokens
  UPDATE student_enrollments
  SET tokens_remaining = tokens_remaining - p_bid_amount,
      updated_at = now()
  WHERE user_id = p_student_id AND class_id = v_class_id;

  -- Log the token usage
  INSERT INTO token_history (student_id, opportunity_id, amount, type, description)
  VALUES (p_student_id, p_opportunity_id, -p_bid_amount, 'bid', 'Bid placed for opportunity');

  -- Return success
  RETURN json_build_object(
    'success', true,
    'message', 'Bid submitted successfully',
    'tokens_remaining', v_tokens_remaining - p_bid_amount
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Database error: ' || SQLERRM
    );
END;
$$;