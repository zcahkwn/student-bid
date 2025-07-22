/*
  # Complete RPC Function Fix for Bid Submission

  1. Drop and recreate the submit_student_bid_secure function
  2. Remove all references to non-existent columns
  3. Use correct table structure from normalized schema
  4. Ensure proper bid creation and enrollment updates
*/

-- Drop the existing function completely
DROP FUNCTION IF EXISTS public.submit_student_bid_secure(uuid, uuid);

-- Create the corrected function
CREATE OR REPLACE FUNCTION public.submit_student_bid_secure(
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
  v_existing_bid_count integer;
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

  -- Check for existing bid on this opportunity
  SELECT COUNT(*) INTO v_existing_bid_count
  FROM bids
  WHERE student_id = p_student_id AND opportunity_id = p_opportunity_id;
  
  IF v_existing_bid_count > 0 THEN
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
    NOW(),
    'validated'
  ) RETURNING id INTO v_bid_id;

  -- Update student enrollment: decrease tokens and mark as used
  UPDATE student_enrollments
  SET 
    tokens_remaining = tokens_remaining - 1,
    token_status = 'used',
    updated_at = NOW()
  WHERE user_id = p_student_id AND class_id = v_class_id;

  -- Log the token usage in token_history
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
    'bid_id', v_bid_id,
    'timestamp', NOW()
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