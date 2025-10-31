/*
  # Add reset_opportunity_selection Function

  1. Purpose
    - Provides admin capability to reset selection results for a bidding opportunity
    - Allows admins to clear winner selections and run selection process again
    - Resets all bid statuses and student enrollment results to pending state

  2. Function Details
    - `reset_opportunity_selection(p_opportunity_id uuid)` - Resets all bids and selections
      - Resets `is_winner` flag to FALSE for all bids
      - Resets `bid_status` to 'placed' to allow withdrawal
      - Resets `bidding_result` in student_enrollments to 'pending'
      - Returns JSONB with success status and counts

  3. Security
    - Uses SECURITY DEFINER with search_path protection
    - Grants execute permissions to authenticated users (admins)
    - Includes comprehensive error handling
*/

CREATE OR REPLACE FUNCTION public.reset_opportunity_selection(p_opportunity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_class_id uuid;
    v_updated_enrollments_count integer := 0;
    v_updated_bids_count integer := 0;
BEGIN
    -- Get the class_id associated with the opportunity
    SELECT class_id INTO v_class_id 
    FROM public.opportunities 
    WHERE id = p_opportunity_id;

    IF v_class_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Opportunity not found.'
        );
    END IF;

    -- Reset student_enrollments for students who bid on this opportunity
    -- ONLY reset bidding_result to 'pending' and update timestamp
    WITH updated_enrollments AS (
        UPDATE public.student_enrollments se
        SET
            bidding_result = 'pending',
            updated_at = now()
        FROM public.bids b
        WHERE se.user_id = b.user_id
          AND b.opportunity_id = p_opportunity_id
          AND se.class_id = v_class_id
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_updated_enrollments_count FROM updated_enrollments;

    -- Reset bid status and is_winner for bids related to this opportunity
    WITH updated_bids AS (
        UPDATE public.bids
        SET
            bid_status = 'placed',
            is_winner = FALSE,
            validation_status = 'validated',
            submission_timestamp = now()
        WHERE opportunity_id = p_opportunity_id
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_updated_bids_count FROM updated_bids;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Selection reset successfully.', 
        'reset_count', v_updated_enrollments_count, 
        'bids_reset_count', v_updated_bids_count
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', SQLERRM
        );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.reset_opportunity_selection(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_opportunity_selection(uuid) TO service_role;
