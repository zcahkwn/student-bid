/*
  # Create Simple Bid Submission RPC Function

  This function handles student bid submission with proper error handling and validation.
  It creates a bid record and updates the student's enrollment status.

  1. Validation
    - Check if student is enrolled in the class
    - Verify student has tokens available
    - Prevent duplicate bids

  2. Actions
    - Create bid record in bids table
    - Update student enrollment (decrease tokens, mark as used)
    - Log token usage in token_history table

  3. Security
    - Validates all inputs
    - Prevents unauthorized bid submissions
    - Maintains data integrity
*/

-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS submit_student_bid_secure(uuid, uuid);

-- Create the new function
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
  v_result jsonb;
BEGIN
  -- Log the function call
  RAISE NOTICE 'submit_student_bid_secure called with student_id: %, opportunity_id: %', p_student_id, p_opportunity_id;

  -- Validate inputs
  IF p_student_id IS NULL OR p_opportunity_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Student ID and Opportunity ID are required'
    );
  END IF;

  -- Get the class_id for this opportunity
  SELECT class_id INTO v_class_id
  FROM opportunities
  WHERE id = p_opportunity_id;

  IF v_class_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Opportunity not found'
    );
  END IF;

  RAISE NOTICE 'Found class_id: % for opportunity: %', v_class_id, p_opportunity_id;

  -- Check if student is enrolled in this class and get enrollment details
  SELECT * INTO v_enrollment_record
  FROM student_enrollments
  WHERE user_id = p_student_id AND class_id = v_class_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Student is not enrolled in this class'
    );
  END IF;

  RAISE NOTICE 'Student enrollment found. Tokens remaining: %', v_enrollment_record.tokens_remaining;

  -- Check if student has tokens available
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

  IF v_existing_bid_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Student has already placed a bid for this opportunity'
    );
  END IF;

  RAISE NOTICE 'All validations passed. Creating bid...';

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
    1, -- Default bid amount
    false, -- Not a winner yet
    'placed', -- Bid status
    NOW(), -- Submission timestamp
    'validated' -- Validation status
  ) RETURNING id INTO v_new_bid_id;

  RAISE NOTICE 'Bid created with ID: %', v_new_bid_id;

  -- Update student enrollment (decrease tokens and mark as used)
  UPDATE student_enrollments
  SET 
    tokens_remaining = tokens_remaining - 1,
    token_status = 'used',
    updated_at = NOW()
  WHERE user_id = p_student_id AND class_id = v_class_id;

  RAISE NOTICE 'Student enrollment updated';

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
    -1, -- Negative amount indicates token usage
    'bid',
    'Token used for bid submission'
  );

  RAISE NOTICE 'Token history logged';

  -- Return success
  v_result := jsonb_build_object(
    'success', true,
    'bid_id', v_new_bid_id,
    'message', 'Bid submitted successfully',
    'tokens_remaining', v_enrollment_record.tokens_remaining - 1,
    'timestamp', NOW()
  );

  RAISE NOTICE 'Returning result: %', v_result;
  
  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error in submit_student_bid_secure: %', SQLERRM;
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Database error: ' || SQLERRM
    );
END;
$$;