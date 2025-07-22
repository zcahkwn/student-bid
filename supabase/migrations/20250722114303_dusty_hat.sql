/*
  # Fix bid submission RPC function

  1. Database Function Updates
    - Drop and recreate submit_student_bid_secure function
    - Use correct column names from actual schema
    - Fix table references to match normalized schema
    - Ensure proper bid creation and enrollment updates

  2. Security
    - Maintain RLS validation
    - Prevent duplicate bids
    - Validate token availability

  3. Data Updates
    - Create bid record in bids table
    - Update student_enrollments table
    - Log token usage in token_history
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
  v_bid_id uuid;
  v_result jsonb;
BEGIN
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

  -- Check if student is enrolled in this class and get enrollment details
  SELECT * INTO v_enrollment_record
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

  -- Check for duplicate bid
  IF EXISTS (
    SELECT 1 FROM bids 
    WHERE student_id = p_student_id AND opportunity_id = p_opportunity_id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Bid already submitted for this opportunity'
    );
  END IF;

  -- Generate new bid ID
  v_bid_id := gen_random_uuid();

  -- Insert the bid
  INSERT INTO bids (
    id,
    student_id,
    opportunity_id,
    bid_amount,
    is_winner,
    bid_status,
    submission_timestamp,
    validation_status,
    created_at
  ) VALUES (
    v_bid_id,
    p_student_id,
    p_opportunity_id,
    1,
    false,
    'placed',
    now(),
    'validated',
    now()
  );

  -- Update student enrollment: decrease tokens and mark as used
  UPDATE student_enrollments
  SET 
    tokens_remaining = tokens_remaining - 1,
    token_status = 'used',
    updated_at = now()
  WHERE user_id = p_student_id AND class_id = v_class_id;

  -- Log token usage in token_history
  INSERT INTO token_history (
    id,
    student_id,
    opportunity_id,
    amount,
    type,
    description,
    created_at
  ) VALUES (
    gen_random_uuid(),
    p_student_id,
    p_opportunity_id,
    -1,
    'bid',
    'Token used for bid submission',
    now()
  );

  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'bid_id', v_bid_id,
    'timestamp', now(),
    'tokens_remaining', v_enrollment_record.tokens_remaining - 1
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Log the error and return failure
    RAISE LOG 'Error in submit_student_bid_secure: %', SQLERRM;
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'An error occurred while processing the bid: ' || SQLERRM
    );
END;
$$;