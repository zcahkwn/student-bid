/*
  # Force recreate submit_student_bid_secure function

  1. Problem Resolution
    - Completely removes all versions of submit_student_bid_secure function
    - Creates new version that uses opportunities.capacity instead of non-existent c.capacity_default
    - Ensures no references to capacity_default column anywhere

  2. Function Logic
    - Validates student enrollment and token availability
    - Checks for existing bids
    - Validates opportunity capacity using opportunities.capacity
    - Creates bid and updates enrollment atomically
    - Returns success/failure with appropriate messages

  3. Security
    - Maintains all existing validation logic
    - Ensures atomic operations with proper error handling
*/

-- Drop ALL possible versions of the function with different signatures
DROP FUNCTION IF EXISTS submit_student_bid_secure(uuid, uuid, integer);
DROP FUNCTION IF EXISTS submit_student_bid_secure(p_student_id uuid, p_opportunity_id uuid, p_bid_amount integer);
DROP FUNCTION IF EXISTS public.submit_student_bid_secure(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.submit_student_bid_secure(p_student_id uuid, p_opportunity_id uuid, p_bid_amount integer);

-- Force drop any remaining versions by name only
DO $$
DECLARE
    func_record RECORD;
BEGIN
    FOR func_record IN 
        SELECT proname, oidvectortypes(proargtypes) as args
        FROM pg_proc 
        WHERE proname = 'submit_student_bid_secure'
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || func_record.proname || '(' || func_record.args || ') CASCADE';
    END LOOP;
END $$;

-- Create the correct function that uses opportunities.capacity
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
  v_existing_bid_count integer;
  v_current_bid_count integer;
  v_bid_id uuid;
BEGIN
  -- Get opportunity details including capacity
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
  
  -- Get student enrollment
  SELECT *
  INTO v_enrollment_record
  FROM student_enrollments 
  WHERE user_id = p_student_id AND class_id = v_opportunity_record.class_id;
  
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
  SELECT COUNT(*)
  INTO v_existing_bid_count
  FROM bids 
  WHERE student_id = p_student_id AND opportunity_id = p_opportunity_id;
  
  IF v_existing_bid_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Student has already placed a bid for this opportunity'
    );
  END IF;
  
  -- Check current bid count against capacity
  SELECT COUNT(*)
  INTO v_current_bid_count
  FROM bids 
  WHERE opportunity_id = p_opportunity_id AND bid_status = 'placed';
  
  -- Use opportunity capacity for validation
  IF v_current_bid_count >= COALESCE(v_opportunity_record.capacity, 7) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Opportunity is at full capacity'
    );
  END IF;
  
  -- Create the bid
  INSERT INTO bids (student_id, opportunity_id, bid_amount, bid_status, validation_status)
  VALUES (p_student_id, p_opportunity_id, p_bid_amount, 'placed', 'validated')
  RETURNING id INTO v_bid_id;
  
  -- Update student enrollment (reduce tokens)
  UPDATE student_enrollments 
  SET 
    tokens_remaining = tokens_remaining - 1,
    token_status = CASE 
      WHEN tokens_remaining - 1 <= 0 THEN 'used'::character varying
      ELSE token_status 
    END,
    updated_at = NOW()
  WHERE user_id = p_student_id AND class_id = v_opportunity_record.class_id;
  
  -- Return success
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