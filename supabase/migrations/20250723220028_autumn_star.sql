-- Fix RPC function overload error by removing the text[] version
-- and ensuring only the uuid[] version exists

-- Drop the text[] version of the function if it exists
DROP FUNCTION IF EXISTS public.update_selection_results_atomic(
  p_opportunity_id uuid,
  p_selected_user_ids text[],
  p_all_bidder_ids text[]
);

-- Ensure the uuid[] version exists and is correct
CREATE OR REPLACE FUNCTION public.update_selection_results_atomic(
  p_opportunity_id uuid,
  p_selected_user_ids uuid[],
  p_all_bidder_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_class_id uuid;
  v_result jsonb;
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

  -- Start transaction
  BEGIN
    -- Update bids table: set is_winner = true for selected students
    UPDATE bids 
    SET is_winner = CASE 
      WHEN user_id = ANY(p_selected_user_ids) THEN true 
      ELSE false 
    END
    WHERE opportunity_id = p_opportunity_id
    AND user_id = ANY(p_all_bidder_ids);
    
    GET DIAGNOSTICS v_updated_bids = ROW_COUNT;

    -- Update student_enrollments table: set bidding_result based on selection
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

    -- Build success response
    v_result := jsonb_build_object(
      'success', true,
      'updated_bids', v_updated_bids,
      'updated_enrollments', v_updated_enrollments,
      'selected_count', array_length(p_selected_user_ids, 1),
      'total_bidders', array_length(p_all_bidder_ids, 1)
    );

    RETURN v_result;

  EXCEPTION WHEN OTHERS THEN
    -- Rollback is automatic in functions
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'error_code', SQLSTATE
    );
  END;
END;
$$;

-- Also fix the reset function to avoid similar issues
DROP FUNCTION IF EXISTS public.reset_opportunity_selection(p_opportunity_id text);

CREATE OR REPLACE FUNCTION public.reset_opportunity_selection(
  p_opportunity_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_class_id uuid;
  v_reset_count integer := 0;
  v_result jsonb;
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
    -- Reset all bids for this opportunity
    UPDATE bids 
    SET is_winner = false
    WHERE opportunity_id = p_opportunity_id;

    -- Reset all student enrollments for this class
    UPDATE student_enrollments 
    SET 
      bidding_result = 'pending'::character varying,
      updated_at = now()
    WHERE class_id = v_class_id;
    
    GET DIAGNOSTICS v_reset_count = ROW_COUNT;

    v_result := jsonb_build_object(
      'success', true,
      'reset_count', v_reset_count
    );

    RETURN v_result;

  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'error_code', SQLSTATE
    );
  END;
END;
$$;