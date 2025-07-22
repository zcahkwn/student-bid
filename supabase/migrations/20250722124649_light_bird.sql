/*
  # Clean up and fix submit_student_bid_secure function

  1. Function Management
    - Drop all existing versions of submit_student_bid_secure function
    - Create a new correct version that doesn't reference capacity_default
    - Ensure the function uses the correct schema (opportunities.capacity)

  2. Security
    - Maintain existing security checks
    - Ensure proper error handling

  3. Changes
    - Remove any reference to non-existent c.capacity_default column
    - Use opportunities.capacity for capacity validation
    - Clean up any function overloads that might be causing conflicts
*/

-- Drop all existing versions of the function (with different parameter signatures)
DROP FUNCTION IF EXISTS submit_student_bid_secure(uuid, uuid, integer);
DROP FUNCTION IF EXISTS submit_student_bid_secure(p_student_id uuid, p_opportunity_id uuid, p_bid_amount integer);
DROP FUNCTION IF EXISTS submit_student_bid_secure(text, text, integer);
DROP FUNCTION IF EXISTS submit_student_bid_secure(p_student_id text, p_opportunity_id text, p_bid_amount integer);

-- Create the correct function
CREATE OR REPLACE FUNCTION submit_student_bid_secure(
  p_student_id uuid,
  p_opportunity_id uuid,
  p_bid_amount integer DEFAULT 1
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
  v_current_bid_count integer;
BEGIN
  -- Validate inputs
  IF p_student_id IS NULL OR p_opportunity_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Student ID and Opportunity ID are required'
    );
  END IF;

  IF p_bid_amount <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Bid amount must be positive'
    );
  END IF;

  -- Get opportunity details
  SELECT id, class_id, capacity, status, opens_at, closes_at
  INTO v_opportunity_record
  FROM opportunities
  WHERE id = p_opportunity_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Opportunity not found'
    );
  END IF;

  -- Check if opportunity is open for bidding
  IF v_opportunity_record.status != 'open' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Opportunity is not open for bidding'
    );
  END IF;

  -- Check if bidding window is open
  IF NOW() < v_opportunity_record.opens_at OR NOW() > v_opportunity_record.closes_at THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Bidding window is not currently open'
    );
  END IF;

  v_class_id := v_opportunity_record.class_id;

  -- Get student enrollment
  SELECT user_id, class_id, tokens_remaining, token_status, bidding_result
  INTO v_enrollment_record
  FROM student_enrollments
  WHERE user_id = p_student_id AND class_id = v_class_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Student is not enrolled in this class'
    );
  END IF;

  -- Check if student has tokens
  IF v_enrollment_record.tokens_remaining < p_bid_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Insufficient tokens remaining'
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

  -- Check capacity (using opportunities.capacity, not the non-existent capacity_default)
  SELECT COUNT(*) INTO v_current_bid_count
  FROM bids
  WHERE opportunity_id = p_opportunity_id AND bid_status = 'placed';

  IF v_current_bid_count >= v_opportunity_record.capacity THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Opportunity has reached maximum capacity'
    );
  END IF;

  -- Create the bid
  INSERT INTO bids (
    student_id,
    opportunity_id,
    bid_amount,
    bid_status,
    validation_status,
    submission_timestamp
  ) VALUES (
    p_student_id,
    p_opportunity_id,
    p_bid_amount,
    'placed',
    'validated',
    NOW()
  ) RETURNING id INTO v_new_bid_id;

  -- Update student enrollment (deduct tokens)
  UPDATE student_enrollments
  SET 
    tokens_remaining = tokens_remaining - p_bid_amount,
    token_status = CASE 
      WHEN tokens_remaining - p_bid_amount <= 0 THEN 'used'
      ELSE token_status
    END,
    updated_at = NOW()
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
    -p_bid_amount,
    'bid',
    'Token used for bid on opportunity: ' || v_opportunity_record.id
  );

  -- Return success
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