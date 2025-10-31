/*
  # Fix update_selection_results_atomic Function
  
  1. Issue Identified
    - The existing function uses `RETURNING 1 INTO variable` which only captures one row
    - This means the count variables are always 0 or 1, not the actual count of updated rows
    - The function doesn't use GET DIAGNOSTICS to properly count affected rows
    
  2. Function Updates
    - Use GET DIAGNOSTICS ROW_COUNT to properly count updated rows
    - Add SECURITY DEFINER and search_path for security
    - Add detailed logging information in the return value
    - Improve error handling
    
  3. Security
    - Function uses SECURITY DEFINER to bypass RLS
    - SET search_path = public, pg_temp for security
    - Maintains atomic transaction behavior
*/

-- Drop and recreate the function with proper row counting
DROP FUNCTION IF EXISTS public.update_selection_results_atomic(uuid, uuid[], uuid[]);

CREATE OR REPLACE FUNCTION public.update_selection_results_atomic(
  p_opportunity_id uuid,
  p_selected_user_ids uuid[],
  p_all_bidder_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_class_id uuid;
  v_selected_count integer := 0;
  v_rejected_count integer := 0;
  v_enrollment_won_count integer := 0;
  v_enrollment_lost_count integer := 0;
BEGIN
  -- Get the class_id for the given opportunity
  SELECT class_id INTO v_class_id
  FROM opportunities
  WHERE id = p_opportunity_id;

  IF v_class_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error_message', 'Opportunity not found.',
      'opportunity_id', p_opportunity_id
    );
  END IF;

  -- 1. Update bids for selected students
  UPDATE bids
  SET
    is_winner = TRUE,
    bid_status = 'selected'
  WHERE
    opportunity_id = p_opportunity_id 
    AND user_id = ANY(p_selected_user_ids);
  
  GET DIAGNOSTICS v_selected_count = ROW_COUNT;

  -- 2. Update bids for non-selected students (who placed a bid on this opportunity)
  UPDATE bids
  SET
    is_winner = FALSE,
    bid_status = 'rejected'
  WHERE
    opportunity_id = p_opportunity_id 
    AND user_id = ANY(p_all_bidder_ids) 
    AND NOT (user_id = ANY(p_selected_user_ids));
  
  GET DIAGNOSTICS v_rejected_count = ROW_COUNT;

  -- 3. Update student_enrollments for selected students
  UPDATE student_enrollments
  SET
    bidding_result = 'won',
    updated_at = now()
  WHERE
    user_id = ANY(p_selected_user_ids) 
    AND class_id = v_class_id;
  
  GET DIAGNOSTICS v_enrollment_won_count = ROW_COUNT;

  -- 4. Update student_enrollments for non-selected students (who placed a bid on this opportunity)
  UPDATE student_enrollments
  SET
    bidding_result = 'lost',
    updated_at = now()
  WHERE
    user_id = ANY(p_all_bidder_ids) 
    AND NOT (user_id = ANY(p_selected_user_ids)) 
    AND class_id = v_class_id;
  
  GET DIAGNOSTICS v_enrollment_lost_count = ROW_COUNT;

  -- Return success with detailed counts
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Selection results updated successfully.',
    'opportunity_id', p_opportunity_id,
    'class_id', v_class_id,
    'updated_bids_selected', v_selected_count,
    'updated_bids_rejected', v_rejected_count,
    'updated_enrollments_won', v_enrollment_won_count,
    'updated_enrollments_lost', v_enrollment_lost_count,
    'total_selected', array_length(p_selected_user_ids, 1),
    'total_bidders', array_length(p_all_bidder_ids, 1)
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error_message', SQLERRM,
      'error_detail', SQLSTATE,
      'opportunity_id', p_opportunity_id
    );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.update_selection_results_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_selection_results_atomic TO anon;
