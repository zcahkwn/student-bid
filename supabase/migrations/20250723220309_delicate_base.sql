/*
  # Remove duplicate RPC functions to resolve overload conflict

  1. Drop Functions
    - Remove the text[] version of update_selection_results_atomic
    - Remove the text[] version of reset_opportunity_selection (if exists)
    - Keep only the uuid[] versions which are the correct ones for handling user IDs

  2. Security
    - Maintain existing security policies
    - Ensure functions work with authenticated users
*/
DROP FUNCTION reset_opportunity_selection(uuid);

-- Drop the text[] version of update_selection_results_atomic if it exists
DROP FUNCTION IF EXISTS public.update_selection_results_atomic(
  p_opportunity_id uuid,
  p_selected_user_ids text[],
  p_all_bidder_ids text[]
);

-- Drop the text[] version of reset_opportunity_selection if it exists
DROP FUNCTION IF EXISTS public.reset_opportunity_selection(
  p_opportunity_id uuid,
  p_user_ids text[]
);

-- Ensure we have the correct uuid[] version of update_selection_results_atomic
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
    -- Update bids table: set is_winner for selected students
    UPDATE bids 
    SET is_winner = (user_id = ANY(p_selected_user_ids))
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

-- Ensure we have the correct uuid[] version of reset_opportunity_selection
CREATE OR REPLACE FUNCTION public.reset_opportunity_selection(
  p_opportunity_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_class_id uuid;
  v_reset_bids integer := 0;
  v_reset_enrollments integer := 0;
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
    -- Reset all bids for this opportunity
    UPDATE bids 
    SET is_winner = false
    WHERE opportunity_id = p_opportunity_id;
    
    GET DIAGNOSTICS v_reset_bids = ROW_COUNT;

    -- Reset all student enrollments for this class
    UPDATE student_enrollments 
    SET 
      bidding_result = 'pending'::character varying,
      updated_at = now()
    WHERE class_id = v_class_id;
    
    GET DIAGNOSTICS v_reset_enrollments = ROW_COUNT;

    -- Return success with counts
    RETURN jsonb_build_object(
      'success', true,
      'reset_count', v_reset_enrollments,
      'reset_bids', v_reset_bids,
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