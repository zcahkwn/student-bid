/*
  # Clean up all bid submission RPC functions

  1. Drop all existing bid submission functions
  2. Create a single clean function without capacity_default references
  3. Use only columns that exist in the database schema
*/

-- Drop all existing bid submission functions
DROP FUNCTION IF EXISTS submit_student_bid_secure(uuid, uuid, integer);
DROP FUNCTION IF EXISTS submit_student_bid(uuid, uuid, integer);
DROP FUNCTION IF EXISTS submit_bid_secure(uuid, uuid, integer);

-- Create clean RPC function without capacity_default
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
  v_tokens_remaining integer;
  v_existing_bid_count integer;
  v_opportunity_status text;
  v_bid_id uuid;
BEGIN
  -- Get opportunity details and validate
  SELECT o.class_id, o.status
  INTO v_class_id, v_opportunity_status
  FROM opportunities o
  WHERE o.id = p_opportunity_id;

  IF v_class_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'Opportunity not found');
  END IF;

  IF v_opportunity_status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'Bidding is not currently open for this opportunity');
  END IF;

  -- Check student enrollment and tokens
  SELECT se.tokens_remaining
  INTO v_tokens_remaining
  FROM student_enrollments se
  WHERE se.user_id = p_student_id AND se.class_id = v_class_id;

  IF v_tokens_remaining IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'Student not enrolled in this class');
  END IF;

  IF v_tokens_remaining < p_bid_amount THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'Insufficient tokens remaining');
  END IF;

  -- Check for existing bid
  SELECT COUNT(*)
  INTO v_existing_bid_count
  FROM bids b
  WHERE b.student_id = p_student_id AND b.opportunity_id = p_opportunity_id;

  IF v_existing_bid_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'You have already placed a bid for this opportunity');
  END IF;

  -- Create the bid
  INSERT INTO bids (
    student_id,
    opportunity_id,
    bid_amount,
    bid_status,
    validation_status
  ) VALUES (
    p_student_id,
    p_opportunity_id,
    p_bid_amount,
    'placed',
    'validated'
  ) RETURNING id INTO v_bid_id;

  -- Update student enrollment
  UPDATE student_enrollments
  SET 
    tokens_remaining = tokens_remaining - p_bid_amount,
    token_status = CASE 
      WHEN tokens_remaining - p_bid_amount <= 0 THEN 'used'
      ELSE token_status
    END,
    updated_at = now()
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
    'Token used for bid submission'
  );

  RETURN jsonb_build_object(
    'success', true,
    'bid_id', v_bid_id,
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