/*
  # Replace submit_student_bid_secure function

  1. Function Updates
    - Drop existing submit_student_bid_secure function completely
    - Create new version that uses opportunities.capacity instead of classes.capacity_default
    - Maintain all existing business logic and security checks
  
  2. Schema Alignment
    - Ensure function matches current database schema
    - Remove any references to non-existent columns
*/

-- Drop the existing function completely (all overloads)
DROP FUNCTION IF EXISTS submit_student_bid_secure(uuid, uuid, integer);
DROP FUNCTION IF EXISTS submit_student_bid_secure(text, text, integer);
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
  v_existing_bid_count integer;
  v_bid_id uuid;
  v_result json;
BEGIN
  -- Get opportunity details including capacity from opportunities table
  SELECT o.id, o.class_id, o.capacity, o.status, o.opens_at, o.closes_at
  INTO v_opportunity_record
  FROM opportunities o
  WHERE o.id = p_opportunity_id;

  -- Check if opportunity exists
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Opportunity not found'
    );
  END IF;

  -- Check if opportunity is open for bidding
  IF v_opportunity_record.status != 'open' THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Opportunity is not open for bidding'
    );
  END IF;

  -- Check if bidding window is open
  IF NOW() < v_opportunity_record.opens_at OR NOW() > v_opportunity_record.closes_at THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Bidding window is not currently open'
    );
  END IF;

  -- Get student enrollment
  SELECT se.user_id, se.class_id, se.tokens_remaining, se.token_status
  INTO v_enrollment_record
  FROM student_enrollments se
  WHERE se.user_id = p_student_id AND se.class_id = v_opportunity_record.class_id;

  -- Check if student is enrolled
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Student is not enrolled in this class'
    );
  END IF;

  -- Check if student has tokens
  IF v_enrollment_record.tokens_remaining < p_bid_amount THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Insufficient tokens remaining'
    );
  END IF;

  -- Check if student already has a bid for this opportunity
  SELECT COUNT(*)
  INTO v_existing_bid_count
  FROM bids b
  WHERE b.student_id = p_student_id AND b.opportunity_id = p_opportunity_id;

  IF v_existing_bid_count > 0 THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Student has already placed a bid for this opportunity'
    );
  END IF;

  -- Check if opportunity has reached capacity
  SELECT COUNT(*)
  INTO v_existing_bid_count
  FROM bids b
  WHERE b.opportunity_id = p_opportunity_id AND b.bid_status = 'placed';

  IF v_existing_bid_count >= v_opportunity_record.capacity THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Opportunity has reached maximum capacity'
    );
  END IF;

  -- Create the bid
  INSERT INTO bids (student_id, opportunity_id, bid_amount, bid_status, validation_status)
  VALUES (p_student_id, p_opportunity_id, p_bid_amount, 'placed', 'validated')
  RETURNING id INTO v_bid_id;

  -- Update student enrollment (reduce tokens)
  UPDATE student_enrollments
  SET 
    tokens_remaining = tokens_remaining - p_bid_amount,
    token_status = CASE 
      WHEN tokens_remaining - p_bid_amount <= 0 THEN 'used'
      ELSE token_status
    END,
    updated_at = NOW()
  WHERE user_id = p_student_id AND class_id = v_opportunity_record.class_id;

  -- Log token usage
  INSERT INTO token_history (student_id, opportunity_id, amount, type, description)
  VALUES (p_student_id, p_opportunity_id, -p_bid_amount, 'bid', 'Token used for bid submission');

  -- Return success
  RETURN json_build_object(
    'success', true,
    'bid_id', v_bid_id,
    'message', 'Bid submitted successfully'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Database error: ' || SQLERRM
    );
END;
$$;