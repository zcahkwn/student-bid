/*
  # Remove class password requirement from bid submission

  1. Updates
    - Update submit_student_bid_secure function to remove class password parameter
    - Remove class password validation from bid submission process
    - Maintain security by validating student enrollment in class

  2. Security
    - Verify student is enrolled in the class containing the opportunity
    - Maintain all other validation checks (token availability, opportunity status, etc.)
*/

-- Update the bid submission function to remove class password requirement
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
  v_student_class_id uuid;
  v_tokens_remaining integer;
  v_opportunity_status text;
  v_bid_id uuid;
  v_existing_bid_id uuid;
BEGIN
  -- Get the class ID for this opportunity
  SELECT class_id INTO v_class_id
  FROM opportunities
  WHERE id = p_opportunity_id;
  
  IF v_class_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Opportunity not found'
    );
  END IF;
  
  -- Verify student is enrolled in this class
  SELECT class_id INTO v_student_class_id
  FROM students
  WHERE id = p_student_id AND class_id = v_class_id;
  
  IF v_student_class_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Student not enrolled in this class'
    );
  END IF;
  
  -- Check if student has tokens remaining
  SELECT tokens_remaining INTO v_tokens_remaining
  FROM students
  WHERE id = p_student_id;
  
  IF v_tokens_remaining IS NULL OR v_tokens_remaining <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'No tokens remaining'
    );
  END IF;
  
  -- Check opportunity status
  SELECT status INTO v_opportunity_status
  FROM opportunities
  WHERE id = p_opportunity_id;
  
  IF v_opportunity_status != 'open' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Opportunity is not open for bidding'
    );
  END IF;
  
  -- Check if student already has a bid for this opportunity
  SELECT id INTO v_existing_bid_id
  FROM bids
  WHERE student_id = p_student_id AND opportunity_id = p_opportunity_id;
  
  IF v_existing_bid_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Student has already placed a bid for this opportunity'
    );
  END IF;
  
  -- Create the bid
  INSERT INTO bids (student_id, opportunity_id, bid_amount)
  VALUES (p_student_id, p_opportunity_id, 1)
  RETURNING id INTO v_bid_id;
  
  -- Update student token status
  UPDATE students
  SET 
    tokens_remaining = tokens_remaining - 1,
    token_status = CASE 
      WHEN tokens_remaining - 1 <= 0 THEN 'used'::character varying
      ELSE token_status
    END
  WHERE id = p_student_id;
  
  -- Log the token usage
  INSERT INTO token_history (student_id, opportunity_id, amount, type, description)
  VALUES (
    p_student_id,
    p_opportunity_id,
    -1,
    'bid',
    'Token used for bidding on opportunity'
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'bid_id', v_bid_id,
    'timestamp', NOW()
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'An error occurred while processing the bid: ' || SQLERRM
    );
END;
$$;