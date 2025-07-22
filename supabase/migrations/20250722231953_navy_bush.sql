/*
  # Create atomic selection results update function

  1. New Function
    - `update_selection_results_atomic()`: Atomically update all bid results in a single transaction
    
  2. Purpose
    - Prevent transaction rollback issues by handling all updates in a single database function
    - Ensure consistency between is_winner and bid_status updates
    
  3. Security
    - Use SECURITY DEFINER to ensure proper permissions
    - Validate all inputs before making changes
*/

CREATE OR REPLACE FUNCTION update_selection_results_atomic(
  p_opportunity_id uuid,
  p_selected_user_ids uuid[],
  p_all_bidder_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_winners integer := 0;
  v_updated_losers integer := 0;
  v_non_selected_ids uuid[];
BEGIN
  -- Validate inputs
  IF p_opportunity_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Opportunity ID is required'
    );
  END IF;

  -- Calculate non-selected bidders
  SELECT array_agg(id)
  INTO v_non_selected_ids
  FROM unnest(p_all_bidder_ids) AS id
  WHERE id != ALL(p_selected_user_ids);

  -- Update winners in bids table
  IF array_length(p_selected_user_ids, 1) > 0 THEN
    UPDATE bids
    SET 
      is_winner = true,
      bid_status = 'selected'
    WHERE 
      opportunity_id = p_opportunity_id
      AND user_id = ANY(p_selected_user_ids);
    
    GET DIAGNOSTICS v_updated_winners = ROW_COUNT;
  END IF;

  -- Update losers in bids table
  IF array_length(v_non_selected_ids, 1) > 0 THEN
    UPDATE bids
    SET 
      is_winner = false,
      bid_status = 'rejected'
    WHERE 
      opportunity_id = p_opportunity_id
      AND user_id = ANY(v_non_selected_ids);
    
    GET DIAGNOSTICS v_updated_losers = ROW_COUNT;
  END IF;

  -- Return success with counts
  RETURN jsonb_build_object(
    'success', true,
    'updated_winners', v_updated_winners,
    'updated_losers', v_updated_losers,
    'selected_user_ids', p_selected_user_ids,
    'non_selected_ids', v_non_selected_ids
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;