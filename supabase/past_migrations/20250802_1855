CREATE OR REPLACE FUNCTION public.update_selection_results_atomic(
    p_opportunity_id uuid,
    p_selected_user_ids uuid[],
    p_all_bidder_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_class_id uuid;
  v_updated_bids integer := 0;
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

  -- Start transaction (implicit in PL/pgSQL function, but good to conceptualize)
  BEGIN
    -- Update bids table: set is_winner AND bid_status for all bidders
    UPDATE bids 
    SET 
      is_winner = (user_id = ANY(p_selected_user_ids)),
      bid_status = CASE -- <--- ADDED THIS CASE STATEMENT
        WHEN user_id = ANY(p_selected_user_ids) THEN 'selected'::character varying
        ELSE 'rejected'::character varying
      END
    WHERE opportunity_id = p_opportunity_id 
      AND user_id = ANY(p_all_bidder_ids);
    
    GET DIAGNOSTICS v_updated_bids = ROW_COUNT;

    -- Update student_enrollments table: set bidding_result
    UPDATE student_enrollments 
    SET 
      bidding_result = CASE 
        WHEN user_id = ANY(p_selected_user_ids) THEN 'won'::character varying
        ELSE 'lost'::character varying
      END,
      updated_at = now()
    WHERE class_id = v_class_id 
      AND user_id = ANY(p_all_bidder_ids);
    
    GET DIAGNOSTICS v_updated_enrollments = ROW_COUNT;

    -- Return success with counts
    RETURN jsonb_build_object(
      'success', true,
      'updated_bids', v_updated_bids,
      'updated_enrollments', v_updated_enrollments,
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
