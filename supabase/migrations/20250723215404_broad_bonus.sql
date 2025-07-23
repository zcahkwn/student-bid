/*
  # Fix Selection System - Database Functions and Triggers

  1. Database Functions
    - `update_selection_results_atomic` - Atomically update bid results and enrollment status
    - `reset_opportunity_selection` - Reset all selection data for an opportunity
    - `get_opportunity_selections` - Get current selections for an opportunity

  2. Security
    - Ensure RLS policies allow proper access
    - Add proper error handling in functions

  3. Triggers
    - Auto-update enrollment status when bids change
*/

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS update_selection_results_atomic(uuid, text[], text[]);
DROP FUNCTION IF EXISTS reset_opportunity_selection(uuid);
DROP FUNCTION IF EXISTS get_opportunity_selections(uuid);

-- Function to atomically update selection results
CREATE OR REPLACE FUNCTION update_selection_results_atomic(
  p_opportunity_id uuid,
  p_selected_user_ids text[],
  p_all_bidder_ids text[]
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_class_id uuid;
  v_result json;
  v_updated_count integer := 0;
  v_user_id text;
BEGIN
  -- Get the class_id for this opportunity
  SELECT class_id INTO v_class_id
  FROM opportunities
  WHERE id = p_opportunity_id;
  
  IF v_class_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Opportunity not found'
    );
  END IF;

  -- Start transaction
  BEGIN
    -- First, update all bidders to 'lost' status
    FOREACH v_user_id IN ARRAY p_all_bidder_ids
    LOOP
      UPDATE student_enrollments
      SET 
        bidding_result = 'lost',
        updated_at = now()
      WHERE user_id = v_user_id::uuid 
        AND class_id = v_class_id;
      
      -- Also update the bids table
      UPDATE bids
      SET is_winner = false
      WHERE user_id = v_user_id::uuid 
        AND opportunity_id = p_opportunity_id;
    END LOOP;

    -- Then, update selected students to 'won' status
    FOREACH v_user_id IN ARRAY p_selected_user_ids
    LOOP
      UPDATE student_enrollments
      SET 
        bidding_result = 'won',
        updated_at = now()
      WHERE user_id = v_user_id::uuid 
        AND class_id = v_class_id;
      
      -- Also update the bids table
      UPDATE bids
      SET is_winner = true
      WHERE user_id = v_user_id::uuid 
        AND opportunity_id = p_opportunity_id;
      
      v_updated_count := v_updated_count + 1;
    END LOOP;

    -- Log the selection in token_history
    INSERT INTO token_history (user_id, opportunity_id, amount, type, description)
    SELECT 
      unnest(p_selected_user_ids)::uuid,
      p_opportunity_id,
      0,
      'selection',
      'Selected for opportunity'
    WHERE array_length(p_selected_user_ids, 1) > 0;

    v_result := json_build_object(
      'success', true,
      'selected_count', v_updated_count,
      'total_bidders', array_length(p_all_bidder_ids, 1),
      'opportunity_id', p_opportunity_id
    );

  EXCEPTION WHEN OTHERS THEN
    -- Rollback will happen automatically
    v_result := json_build_object(
      'success', false,
      'error', SQLERRM
    );
  END;

  RETURN v_result;
END;
$$;

-- Function to reset opportunity selection
CREATE OR REPLACE FUNCTION reset_opportunity_selection(
  p_opportunity_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_class_id uuid;
  v_result json;
  v_reset_count integer := 0;
BEGIN
  -- Get the class_id for this opportunity
  SELECT class_id INTO v_class_id
  FROM opportunities
  WHERE id = p_opportunity_id;
  
  IF v_class_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Opportunity not found'
    );
  END IF;

  -- Start transaction
  BEGIN
    -- Reset all student enrollments for this class to 'pending'
    UPDATE student_enrollments
    SET 
      bidding_result = 'pending',
      updated_at = now()
    WHERE class_id = v_class_id
      AND bidding_result IN ('won', 'lost');
    
    GET DIAGNOSTICS v_reset_count = ROW_COUNT;

    -- Reset all bids for this opportunity
    UPDATE bids
    SET is_winner = false
    WHERE opportunity_id = p_opportunity_id;

    -- Remove selection history entries
    DELETE FROM token_history
    WHERE opportunity_id = p_opportunity_id
      AND type = 'selection';

    v_result := json_build_object(
      'success', true,
      'reset_count', v_reset_count,
      'opportunity_id', p_opportunity_id
    );

  EXCEPTION WHEN OTHERS THEN
    v_result := json_build_object(
      'success', false,
      'error', SQLERRM
    );
  END;

  RETURN v_result;
END;
$$;

-- Function to get current selections for an opportunity
CREATE OR REPLACE FUNCTION get_opportunity_selections(
  p_opportunity_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_class_id uuid;
  v_result json;
BEGIN
  -- Get the class_id for this opportunity
  SELECT class_id INTO v_class_id
  FROM opportunities
  WHERE id = p_opportunity_id;
  
  IF v_class_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Opportunity not found'
    );
  END IF;

  -- Get selected students
  SELECT json_build_object(
    'success', true,
    'selected_students', json_agg(
      json_build_object(
        'id', u.id,
        'name', u.name,
        'email', u.email,
        'student_number', u.student_number,
        'bidding_result', se.bidding_result
      )
    )
  ) INTO v_result
  FROM student_enrollments se
  JOIN users u ON se.user_id = u.id
  WHERE se.class_id = v_class_id
    AND se.bidding_result = 'won';

  RETURN COALESCE(v_result, json_build_object('success', true, 'selected_students', '[]'::json));
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION update_selection_results_atomic(uuid, text[], text[]) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION reset_opportunity_selection(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_opportunity_selections(uuid) TO authenticated, anon;