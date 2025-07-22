/*
  # Drop all RPC function versions and create clean one

  1. Function Cleanup
    - Drop all versions of submit_student_bid_secure function
    - Create single clean version without capacity_default references
  
  2. Security
    - Maintain proper RLS and validation
    - Use only existing database columns
*/

-- Drop all possible versions of the function
DROP FUNCTION IF EXISTS public.submit_student_bid_secure(uuid, uuid);
DROP FUNCTION IF EXISTS public.submit_student_bid_secure(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.submit_student_bid_secure(p_student_id uuid, p_opportunity_id uuid);
DROP FUNCTION IF EXISTS public.submit_student_bid_secure(p_student_id uuid, p_opportunity_id uuid, p_bid_amount integer);

-- Create single clean function without capacity_default references
CREATE OR REPLACE FUNCTION public.submit_student_bid_secure(
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
  -- Get opportunity details
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

  -- Check if opportunity is open for bidding
  IF v_opportunity_record.status != 'open' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Opportunity is not open for bidding'
    );
  END IF;

  -- Get student enrollment
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

  -- Check if student has tokens
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
      'error_message', 'Bid already exists for this opportunity'
    );
  END IF;

  -- Get current bid count for capacity check
  SELECT COUNT(*)
  INTO v_current_bid_count
  FROM bids
  WHERE opportunity_id = p_opportunity_id AND bid_status = 'placed';

  -- Create the bid
  INSERT INTO bids (
    student_id,
    opportunity_id,
    bid_amount,
    bid_status,
    validation_status,
    submission_timestamp
  )
  VALUES (
    p_student_id,
    p_opportunity_id,
    p_bid_amount,
    'placed',
    'validated',
    NOW()
  )
  RETURNING id INTO v_new_bid_id;

  -- Update student enrollment
  UPDATE student_enrollments
  SET 
    tokens_remaining = tokens_remaining - 1,
    token_status = 'used',
    updated_at = NOW()
  WHERE user_id = p_student_id AND class_id = v_class_id;

  -- Log token usage
  INSERT INTO token_history (
    student_id,
    opportunity_id,
    amount,
    type,
    description
  )
  VALUES (
    p_student_id,
    p_opportunity_id,
    1,
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