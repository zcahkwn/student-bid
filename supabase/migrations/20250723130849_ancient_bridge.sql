CREATE OR REPLACE FUNCTION public.update_selection_results_atomic(
  p_opportunity_id UUID,
  p_selected_user_ids UUID[],
  p_all_bidder_ids UUID[]
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_class_id UUID;
  v_updated_winners INTEGER := 0;
  v_updated_losers INTEGER := 0;
  v_updated_bids INTEGER := 0;
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
  
  -- Update bids table: set is_winner = true for selected students
  UPDATE bids
  SET is_winner = true
  WHERE opportunity_id = p_opportunity_id
    AND user_id = ANY(p_selected_user_ids);
  
  GET DIAGNOSTICS v_updated_bids = ROW_COUNT;
  
  -- Update bids table: set is_winner = false for non-selected students
  UPDATE bids
  SET is_winner = false
  WHERE opportunity_id = p_opportunity_id
    AND user_id = ANY(p_all_bidder_ids)
    AND user_id != ALL(p_selected_user_ids);
  
  -- Update student_enrollments: set bidding_result = 'won' for winners
  UPDATE student_enrollments
  SET 
    bidding_result = 'won',
    updated_at = NOW()
  WHERE class_id = v_class_id
    AND user_id = ANY(p_selected_user_ids);
  
  GET DIAGNOSTICS v_updated_winners = ROW_COUNT;
  
  -- Update student_enrollments: set bidding_result = 'lost' for losers
  UPDATE student_enrollments
  SET 
    bidding_result = 'lost',
    updated_at = NOW()
  WHERE class_id = v_class_id
    AND user_id = ANY(p_all_bidder_ids)
    AND user_id != ALL(p_selected_user_ids);
  
  GET DIAGNOSTICS v_updated_losers = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'updated_winners', v_updated_winners,
    'updated_losers', v_updated_losers,
    'updated_bids', v_updated_bids,
    'class_id', v_class_id
  );
END;
$function$;