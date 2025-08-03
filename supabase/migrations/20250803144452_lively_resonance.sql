/*
  # Create auto_select_and_refund_bids RPC function

  1. New Functions
    - `auto_select_and_refund_bids` - Automatically selects all bidders and refunds their tokens
  
  2. Security
    - Function uses SECURITY DEFINER to bypass RLS for necessary operations
    - Validates opportunity exists before processing
    - Ensures atomic operations across multiple tables
  
  3. Operations
    - Updates bids table: sets is_winner=TRUE, bid_amount=0, bid_status='selected automatically'
    - Updates student_enrollments table: restores tokens_remaining=1, token_status='unused', bidding_result='pending'
    - Updates token_history table: sets amount=0 for bid entries and adds refund description
*/

CREATE OR REPLACE FUNCTION public.auto_select_and_refund_bids(
    p_opportunity_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_class_id uuid;
  v_updated_bids integer := 0;
  v_updated_enrollments integer := 0;
  v_updated_history integer := 0;
  v_bidder_ids uuid[];
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

  -- Get all bidder user IDs for this opportunity
  SELECT array_agg(user_id) INTO v_bidder_ids
  FROM bids
  WHERE opportunity_id = p_opportunity_id;

  IF v_bidder_ids IS NULL OR array_length(v_bidder_ids, 1) = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No bids found for this opportunity'
    );
  END IF;

  -- Start transaction operations
  BEGIN
    -- Update bids table: set all bidders as winners with automatic selection
    UPDATE bids 
    SET 
      is_winner = TRUE,
      bid_amount = 0,
      bid_status = 'selected automatically'::character varying
    WHERE opportunity_id = p_opportunity_id;
    
    GET DIAGNOSTICS v_updated_bids = ROW_COUNT;

    -- Update student_enrollments table: restore tokens and reset bidding result
    UPDATE student_enrollments 
    SET 
      tokens_remaining = 1,
      token_status = 'unused'::character varying,
      bidding_result = 'pending'::character varying,
      updated_at = now()
    WHERE class_id = v_class_id 
      AND user_id = ANY(v_bidder_ids);
    
    GET DIAGNOSTICS v_updated_enrollments = ROW_COUNT;

    -- Update token_history table: set bid amount to 0 and add refund description
    UPDATE token_history 
    SET 
      amount = 0,
      description = COALESCE(description, '') || ' - Token refunded due to automatic selection'
    WHERE opportunity_id = p_opportunity_id 
      AND user_id = ANY(v_bidder_ids)
      AND type = 'bid';
    
    GET DIAGNOSTICS v_updated_history = ROW_COUNT;

    -- Return success with operation counts
    RETURN jsonb_build_object(
      'success', true,
      'updated_bids', v_updated_bids,
      'updated_enrollments', v_updated_enrollments,
      'updated_history', v_updated_history,
      'opportunity_id', p_opportunity_id,
      'class_id', v_class_id,
      'bidder_count', array_length(v_bidder_ids, 1)
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

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.auto_select_and_refund_bids TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_select_and_refund_bids TO anon;