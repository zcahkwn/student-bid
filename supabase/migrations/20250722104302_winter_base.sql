/*
  # Fix bid submission RPC function

  1. Remove capacity column references that don't exist
  2. Ensure proper bid creation in bids table
  3. Update student_enrollments table correctly
  4. Add proper error handling and validation
*/

-- Drop the existing function
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
  v_opportunity_exists boolean;
BEGIN
  -- Check if opportunity exists and get class_id
  SELECT o.class_id INTO v_class_id
  FROM opportunities o
  WHERE o.id = p_opportunity_id;
  
  IF v_class_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Opportunity not found'
    );
  END IF;

  -- Check if student is enrolled in the class
  SELECT se.* INTO v_enrollment_record
  FROM student_enrollments se
  WHERE se.user_id = p_student_id 
    AND se.class_id = v_class_id;
  
  IF v_enrollment_record IS NULL THEN
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
  SELECT b.id INTO v_existing_bid_id
  FROM bids b
  WHERE b.student_id = p_student_id 
    AND b.opportunity_id = p_opportunity_id;
  
  IF v_existing_bid_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Bid already submitted for this opportunity'
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
    1, -- Default bid amount
    false, -- Not winner initially
    'placed', -- Bid status
    now(), -- Submission timestamp
    'validated' -- Validation status
  ) RETURNING id INTO v_new_bid_id;

  -- Update student enrollment (decrease tokens, mark as used)
  UPDATE student_enrollments
  SET 
    tokens_remaining = tokens_remaining - 1,
    token_status = 'used',
    updated_at = now()
  WHERE user_id = p_student_id 
    AND class_id = v_class_id;

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

  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'bid_id', v_new_bid_id,
    'timestamp', now()
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Return error details
    RETURN jsonb_build_object(
      'success', false,
      'error_message', SQLERRM
    );
END;
$$;