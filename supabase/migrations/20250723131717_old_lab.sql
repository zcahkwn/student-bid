
CREATE OR REPLACE FUNCTION public.reset_opportunity_selection(p_opportunity_id UUID)
RETURNS VOID AS $$
DECLARE
    v_class_id UUID;
BEGIN
    -- Get the class_id associated with the opportunity
    SELECT class_id INTO v_class_id
    FROM opportunities
    WHERE id = p_opportunity_id;

    IF v_class_id IS NULL THEN
        RAISE EXCEPTION 'Opportunity with ID % not found.', p_opportunity_id;
    END IF;

    -- Update bids: Set is_winner to false for all bids on this opportunity
    UPDATE bids
    SET is_winner = FALSE
    WHERE opportunity_id = p_opportunity_id;

    -- Update student_enrollments: Set bidding_result to 'pending' for students who bid on this opportunity
    -- We need to join with bids to identify the relevant students
    UPDATE student_enrollments se
    SET bidding_result = 'pending'
    FROM bids b
    WHERE se.user_id = b.user_id
      AND se.class_id = v_class_id
      AND b.opportunity_id = p_opportunity_id;

END;
$$ LANGUAGE plpgsql;
