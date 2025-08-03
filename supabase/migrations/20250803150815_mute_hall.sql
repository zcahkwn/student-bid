/*
  # Fix token history refund amount for auto-select function

  1. Function Updates
    - Update auto_select_and_refund_bids function to correctly record token refunds
    - Insert new token_history records with amount = +1 for refunds
    - Maintain proper audit trail for token transactions

  2. Token History Changes
    - Create new refund entries instead of modifying existing ones
    - Use amount = +1 to reflect tokens being added back to student balance
    - Use type = 'refund' with descriptive message
*/

-- Drop the existing function
DROP FUNCTION IF EXISTS public.auto_select_and_refund_bids(uuid);

CREATE OR REPLACE FUNCTION public.auto_select_and_refund_bids(
    p_opportunity_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER -- This is important for bypassing RLS if needed
AS $$
DECLARE
  v_class_id uuid;
  v_updated_bids integer := 0;
  v_updated_enrollments integer := 0;
  v_inserted_token_history integer := 0;
  v_bidder_user_id uuid;
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

  BEGIN
    -- Update bids table: set is_winner, bid_amount, and bid_status for all bidders
    UPDATE bids
    SET
      is_winner = TRUE,
      bid_amount = 0, -- As per previous instruction for auto-selected bids
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
    WHERE user_id IN (SELECT user_id FROM bids WHERE opportunity_id = p_opportunity_id)
      AND class_id = v_class_id;

    GET DIAGNOSTICS v_updated_enrollments = ROW_COUNT;

    -- Insert new token_history records for refunded tokens
    FOR v_bidder_user_id IN
      SELECT user_id FROM bids WHERE opportunity_id = p_opportunity_id
    LOOP
      INSERT INTO token_history (user_id, opportunity_id, amount, type, description)
      VALUES (
        v_bidder_user_id,
        p_opportunity_id,
        1, -- +1 for refund
        'refund',
        'Token refunded for auto-selected opportunity'
      );
      v_inserted_token_history := v_inserted_token_history + 1;
    END LOOP;

    -- Return success with operation counts
    RETURN jsonb_build_object(
      'success', true,
      'updated_bids', v_updated_bids,
      'updated_enrollments', v_updated_enrollments,
      'inserted_token_history', v_inserted_token_history,
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

-- Also update the bid status constraint to include 'auto_selected'
ALTER TABLE bids DROP CONSTRAINT IF EXISTS bids_bid_status_check;

ALTER TABLE bids ADD CONSTRAINT bids_bid_status_check 
CHECK (bid_status::text = ANY (ARRAY[
  'placed'::character varying, 
  'confirmed'::character varying, 
  'selected'::character varying, 
  'rejected'::character varying, 
  'auto_selected'::character varying
]::text[]));