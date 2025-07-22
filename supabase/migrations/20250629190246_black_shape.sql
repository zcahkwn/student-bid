/*
  # Fix Bid Amount Column and Function

  1. Database Changes
    - Add bid_amount column to bids table
    - Update existing records with default values
    - Create optimized indexes
    - Add improved bid submission function

  2. Performance Optimizations
    - Simplified column addition
    - Efficient default value updates
    - Streamlined function logic
    - Better error handling
*/

-- Step 1: Add bid_amount column with a simple approach
ALTER TABLE bids ADD COLUMN IF NOT EXISTS bid_amount integer DEFAULT 1 NOT NULL;

-- Step 2: Update existing records efficiently (only if needed)
UPDATE bids SET bid_amount = 1 WHERE bid_amount IS NULL;

-- Step 3: Create index for performance
CREATE INDEX IF NOT EXISTS idx_bids_bid_amount ON bids(bid_amount);

-- Step 4: Create a simplified bid submission function
CREATE OR REPLACE FUNCTION submit_student_bid(
  p_student_id uuid,
  p_opportunity_id uuid,
  p_bid_amount integer DEFAULT 1
)
RETURNS jsonb AS $$
DECLARE
  v_bid_id uuid;
  v_tokens_remaining integer;
  v_class_id uuid;
  v_opp_class_id uuid;
BEGIN
  -- Quick validation: Check if student exists and has tokens
  SELECT tokens_remaining, class_id INTO v_tokens_remaining, v_class_id
  FROM students 
  WHERE id = p_student_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Student not found');
  END IF;
  
  IF v_tokens_remaining <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tokens remaining');
  END IF;
  
  -- Quick validation: Check opportunity exists and matches class
  SELECT class_id INTO v_opp_class_id
  FROM opportunities 
  WHERE id = p_opportunity_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Opportunity not found');
  END IF;
  
  IF v_class_id != v_opp_class_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Class mismatch');
  END IF;
  
  -- Check for duplicate bid
  IF EXISTS (SELECT 1 FROM bids WHERE student_id = p_student_id AND opportunity_id = p_opportunity_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bid already exists');
  END IF;
  
  -- Insert bid
  INSERT INTO bids (student_id, opportunity_id, bid_amount)
  VALUES (p_student_id, p_opportunity_id, p_bid_amount)
  RETURNING id INTO v_bid_id;
  
  -- Update student tokens
  UPDATE students 
  SET tokens_remaining = tokens_remaining - 1
  WHERE id = p_student_id;
  
  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'bid_id', v_bid_id,
    'student_id', p_student_id,
    'opportunity_id', p_opportunity_id,
    'bid_amount', p_bid_amount
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 5: Create a simple function to get bid status
CREATE OR REPLACE FUNCTION get_student_bid_status(p_student_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'student_id', s.id,
    'tokens_remaining', s.tokens_remaining,
    'token_status', s.token_status,
    'bids', COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'bid_id', b.id,
          'opportunity_id', b.opportunity_id,
          'bid_amount', b.bid_amount,
          'created_at', b.created_at
        )
      ) FROM bids b WHERE b.student_id = s.id),
      '[]'::jsonb
    )
  ) INTO v_result
  FROM students s
  WHERE s.id = p_student_id;
  
  RETURN COALESCE(v_result, jsonb_build_object('error', 'Student not found'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;