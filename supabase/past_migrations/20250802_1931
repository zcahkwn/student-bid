/*
  # Create withdraw_bid_secure RPC function

  1. New Functions
    - `withdraw_bid_secure` - Securely withdraws a student's bid and restores their token
  
  2. Security
    - Function uses SECURITY DEFINER to bypass RLS for necessary operations
    - Validates user has actually placed a bid before allowing withdrawal
    - Ensures atomic operations across multiple tables
  
  3. Operations
    - Removes bid from bids table
    - Removes token history entry for the bid
    - Restores student's token in student_enrollments table
    - Resets bidding result to pending
*/

CREATE OR REPLACE FUNCTION public.withdraw_bid_secure(
    p_user_id uuid,
    p_opportunity_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_class_id uuid;
  v_bid_id uuid;
  v_token_history_id uuid;
  v_deleted_bids integer := 0;
  v_deleted_history integer := 0;
  v_updated_enrollments integer := 0;
BEGIN
  -- Get the class_id for this opportunity
  SELECT class_id INTO v_class_id
  FROM opportunities
  WHERE id = p_opportunity_id;
  
  IF v_class_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Opportunity not found'
    );
  END IF;

  -- Check if the user has actually placed a bid for this opportunity
  SELECT id INTO v_bid_id
  FROM bids
  WHERE user_id = p_user_id AND opportunity_id = p_opportunity_id;
  
  IF v_bid_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No bid found for this user and opportunity'
    );
  END IF;

  -- Start transaction operations
  BEGIN
    -- Delete the bid from bids table
    DELETE FROM bids 
    WHERE user_id = p_user_id AND opportunity_id = p_opportunity_id;
    
    GET DIAGNOSTICS v_deleted_bids = ROW_COUNT;

    -- Delete the token history entry for this bid
    DELETE FROM token_history 
    WHERE user_id = p_user_id 
      AND opportunity_id = p_opportunity_id 
      AND type = 'bid';
    
    GET DIAGNOSTICS v_deleted_history = ROW_COUNT;

    -- Restore the student's token in student_enrollments
    UPDATE student_enrollments 
    SET 
      tokens_remaining = 1,
      token_status = 'unused'::character varying,
      bidding_result = 'pending'::character varying,
      updated_at = now()
    WHERE user_id = p_user_id AND class_id = v_class_id;
    
    GET DIAGNOSTICS v_updated_enrollments = ROW_COUNT;

    -- Verify that we actually updated an enrollment record
    IF v_updated_enrollments = 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Student enrollment not found for this class'
      );
    END IF;

    -- Return success with operation counts
    RETURN jsonb_build_object(
      'success', true,
      'deleted_bids', v_deleted_bids,
      'deleted_history', v_deleted_history,
      'updated_enrollments', v_updated_enrollments,
      'opportunity_id', p_opportunity_id,
      'class_id', v_class_id,
      'user_id', p_user_id
    );

  EXCEPTION WHEN OTHERS THEN
    -- Rollback happens automatically
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'sqlstate', SQLSTATE
    );
  END;
END;
$$;