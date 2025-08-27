/*
  # Fix token history refund amount for auto-select function

  1. Function Updates
    - Update `auto_select_and_refund_bids` function to correctly record token refunds
    - Insert new token_history records with amount = +1 for refunds
    - Maintain proper audit trail for token transactions

  2. Token History Changes
    - Create new refund entries instead of modifying existing ones
    - Use amount = +1 to reflect tokens being added back to student balance
    - Use type = 'refund' with descriptive message
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
  v_refund_entries integer := 0;
  v_bidder_record RECORD;
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

  -- Start transaction operations
  BEGIN
    -- Update bids table: set is_winner=TRUE and bid_status='auto_selected' for all bidders
    UPDATE bids 
    SET 
      is_winner = true,
      bid_status = 'auto_selected'::character varying
    WHERE opportunity_id = p_opportunity_id;
    
    GET DIAGNOSTICS v_updated_bids = ROW_COUNT;

    -- Update student_enrollments table: restore tokens and reset status
    UPDATE student_enrollments 
    SET 
      tokens_remaining = 1,
      token_status = 'unused'::character varying,
      bidding_result = 'pending'::character varying,
      updated_at = now()
    WHERE class_id = v_class_id 
      AND user_id IN (
        SELECT DISTINCT user_id 
        FROM bids 
        WHERE opportunity_id = p_opportunity_id
      );
    
    GET DIAGNOSTICS v_updated_enrollments = ROW_COUNT;

    -- Insert new token_history entries for refunds (amount = +1)
    FOR v_bidder_record IN 
      SELECT DISTINCT user_id 
      FROM bids 
      WHERE opportunity_id = p_opportunity_id
    LOOP
      INSERT INTO token_history (
        user_id,
        opportunity_id,
        amount,
        type,
        description,
        created_at
      ) VALUES (
        v_bidder_record.user_id,
        p_opportunity_id,
        1, -- +1 to reflect token being returned
        'refund',
        'Token refunded for automatically selected opportunity',
        now()
      );
      
      v_refund_entries := v_refund_entries + 1;
    END LOOP;

    -- Return success with counts
    RETURN jsonb_build_object(
      'success', true,
      'updated_bids', v_updated_bids,
      'updated_enrollments', v_updated_enrollments,
      'refund_entries', v_refund_entries,
      'opportunity_id', p_opportunity_id,
      'class_id', v_class_id
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