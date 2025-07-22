/*
  # Fix submit_student_bid_secure function to use correct table names

  1. Updates
    - Replace references to 'students' table with 'users' table
    - Update column references to match normalized schema
    - Fix any other table/column mismatches

  2. Security
    - Maintains existing RLS and security checks
    - Preserves bid validation logic
*/

-- Drop the existing function if it exists
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
  v_tokens_remaining integer;
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
  
  -- Check if student is enrolled in this class and has tokens
  SELECT tokens_remaining INTO v_tokens_remaining
  FROM student_enrollments
  WHERE user_id = p_student_id AND class_id = v_class_id;
  
  IF v_tokens_remaining IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Student not enrolled in this class'
    );
  END IF;
  
  IF v_tokens_remaining <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'No tokens remaining'
    );
  END IF;
  
  -- Check if student has already bid on this opportunity
  IF EXISTS (
    SELECT 1 FROM bids 
    WHERE student_id = p_student_id AND opportunity_id = p_opportunity_id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Student has already bid on this opportunity'
    );
  END IF;
  
  -- Insert the bid
  INSERT INTO bids (student_id, opportunity_id, bid_amount, bid_status, validation_status)
  VALUES (p_student_id, p_opportunity_id, 1, 'placed', 'validated')
  RETURNING id INTO v_bid_id;
  
  -- Update student enrollment to use token
  UPDATE student_enrollments
  SET 
    tokens_remaining = tokens_remaining - 1,
    token_status = 'used',
    updated_at = now()
  WHERE user_id = p_student_id AND class_id = v_class_id;
  
  -- Log token usage
  INSERT INTO token_history (student_id, opportunity_id, amount, type, description)
  VALUES (p_student_id, p_opportunity_id, -1, 'bid', 'Token used for bid submission');
  
  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'bid_id', v_bid_id,
    'timestamp', now(),
    'tokens_remaining', v_tokens_remaining - 1
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