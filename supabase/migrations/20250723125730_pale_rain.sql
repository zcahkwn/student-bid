```sql
CREATE OR REPLACE FUNCTION public.update_selection_results_atomic(
    p_opportunity_id UUID,
    p_selected_user_ids UUID[],
    p_all_bidder_ids UUID[]
)
RETURNS VOID AS $$
DECLARE
    v_class_id UUID;
BEGIN
    -- Get the class_id associated with the opportunity
    SELECT class_id INTO v_class_id
    FROM public.opportunities
    WHERE id = p_opportunity_id;

    IF v_class_id IS NULL THEN
        RAISE EXCEPTION 'Opportunity with ID % not found.', p_opportunity_id;
    END IF;

    -- Start a transaction for atomicity
    BEGIN
        -- 1. Update bids for selected users: Set is_winner to TRUE and bid_status to 'selected'
        UPDATE public.bids
        SET 
            is_winner = TRUE,
            bid_status = 'selected',
            submission_timestamp = NOW() -- Update timestamp to reflect selection
        WHERE opportunity_id = p_opportunity_id
          AND user_id = ANY(p_selected_user_ids);

        -- 2. Update bids for non-selected users: Set is_winner to FALSE and bid_status to 'rejected'
        UPDATE public.bids
        SET 
            is_winner = FALSE,
            bid_status = 'rejected',
            submission_timestamp = NOW() -- Update timestamp to reflect selection
        WHERE opportunity_id = p_opportunity_id
          AND user_id = ANY(p_all_bidder_ids)
          AND user_id <> ALL(p_selected_user_ids);

        -- 3. Update student_enrollments for selected users: Set bidding_result to 'won'
        UPDATE public.student_enrollments
        SET 
            bidding_result = 'won',
            updated_at = NOW()
        WHERE user_id = ANY(p_selected_user_ids)
          AND class_id = v_class_id;

        -- 4. Update student_enrollments for non-selected users who bid: Set bidding_result to 'lost'
        UPDATE public.student_enrollments
        SET 
            bidding_result = 'lost',
            updated_at = NOW()
        WHERE user_id = ANY(p_all_bidder_ids)
          AND user_id <> ALL(p_selected_user_ids)
          AND class_id = v_class_id;

    EXCEPTION
        WHEN OTHERS THEN
            -- Log the error and re-raise
            RAISE EXCEPTION 'Error in update_selection_results_atomic: %', SQLERRM;
    END;
END;
$$ LANGUAGE plpgsql;
```