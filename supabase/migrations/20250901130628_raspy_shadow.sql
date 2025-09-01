/*
  # Fix class deletion foreign key constraint error

  1. Database Functions
    - Create or replace `delete_class_atomic` function to properly handle cascading deletions
    - Ensures all related records are deleted in correct order to satisfy foreign key constraints
    
  2. Deletion Order
    - Delete bids and token_history first (they reference opportunities)
    - Delete opportunities (they reference classes)
    - Delete student_enrollments (they reference classes)
    - Finally delete the class itself
    
  3. Error Handling
    - Wrapped in transaction with proper error handling
    - Returns detailed success/failure information
*/

CREATE OR REPLACE FUNCTION public.delete_class_atomic(p_class_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_class_name text;
    v_deleted_enrollments integer := 0;
    v_deleted_opportunities integer := 0;
    v_deleted_bids integer := 0;
    v_deleted_token_history integer := 0;
    v_deleted_class integer := 0;
BEGIN
    -- Get class name for logging/return value
    SELECT name INTO v_class_name FROM classes WHERE id = p_class_id;

    IF v_class_name IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Class not found');
    END IF;

    -- Start a transaction block
    BEGIN
        -- Delete related records in a specific order to respect foreign key constraints
        -- 1. Delete bids and token_history associated with opportunities in this class
        DELETE FROM bids
        WHERE opportunity_id IN (SELECT id FROM opportunities WHERE class_id = p_class_id);
        GET DIAGNOSTICS v_deleted_bids = ROW_COUNT;

        DELETE FROM token_history
        WHERE opportunity_id IN (SELECT id FROM opportunities WHERE class_id = p_class_id);
        GET DIAGNOSTICS v_deleted_token_history = ROW_COUNT;

        -- 2. Delete opportunities associated with this class
        DELETE FROM opportunities
        WHERE class_id = p_class_id;
        GET DIAGNOSTICS v_deleted_opportunities = ROW_COUNT;

        -- 3. Delete student enrollments associated with this class
        DELETE FROM student_enrollments
        WHERE class_id = p_class_id;
        GET DIAGNOSTICS v_deleted_enrollments = ROW_COUNT;

        -- 4. Finally, delete the class itself
        DELETE FROM classes
        WHERE id = p_class_id;
        GET DIAGNOSTICS v_deleted_class = ROW_COUNT;

        -- Return success with counts
        RETURN jsonb_build_object(
            'success', true,
            'class_id', p_class_id,
            'class_name', v_class_name,
            'deleted_counts', jsonb_build_object(
                'enrollments', v_deleted_enrollments,
                'opportunities', v_deleted_opportunities,
                'bids', v_deleted_bids,
                'token_history', v_deleted_token_history,
                'class', v_deleted_class
            )
        );

    EXCEPTION WHEN OTHERS THEN
        -- If any error occurs, the transaction will be rolled back
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM,
            'sqlstate', SQLSTATE
        );
    END;
END;
$$;