```sql
CREATE OR REPLACE FUNCTION "public"."delete_class_atomic"("p_class_id" "uuid", "p_class_name" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_class_name text;
  v_start_time timestamptz := NOW();
  v_opportunity_ids uuid[];
  v_deleted_bids int;
  v_deleted_token_history int;
  v_deleted_enrollments int;
  v_deleted_opportunities int;
  v_deleted_classes int;
  v_counts jsonb; -- Declare v_counts here to be populated by actual deletions
BEGIN
  -- Validate class exists and get its name
  SELECT name INTO v_class_name
  FROM classes
  WHERE id = p_class_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Class not found',
      'class_id', p_class_id
    );
  END IF;
  
  -- Use provided name or fetched name
  v_class_name := COALESCE(p_class_name, v_class_name);
  
  -- Start transaction block (though PL/pgSQL functions are atomic by default)
  BEGIN
    -- 1. Get all opportunity IDs related to this class
    SELECT ARRAY_AGG(id) INTO v_opportunity_ids
    FROM opportunities
    WHERE class_id = p_class_id;

    -- 2. Delete bids associated with these opportunities
    --    (bids depend on opportunities, so delete before opportunities)
    IF v_opportunity_ids IS NOT NULL AND array_length(v_opportunity_ids, 1) > 0 THEN
      DELETE FROM bids WHERE opportunity_id = ANY(v_opportunity_ids);
      GET DIAGNOSTICS v_deleted_bids = ROW_COUNT;
    ELSE
      v_deleted_bids := 0;
    END IF;

    -- 3. Delete token_history associated with these opportunities
    --    (token_history depends on opportunities with ON DELETE SET NULL,
    --     explicitly deleting here for full cleanup if desired)
    IF v_opportunity_ids IS NOT NULL AND array_length(v_opportunity_ids, 1) > 0 THEN
      DELETE FROM token_history WHERE opportunity_id = ANY(v_opportunity_ids);
      GET DIAGNOSTICS v_deleted_token_history = ROW_COUNT;
    ELSE
      v_deleted_token_history := 0;
    END IF;

    -- 4. Delete student enrollments for this class
    --    (student_enrollments depend on classes)
    DELETE FROM student_enrollments WHERE class_id = p_class_id;
    GET DIAGNOSTICS v_deleted_enrollments = ROW_COUNT;

    -- 5. Delete opportunities for this class
    --    (opportunities depend on classes, delete after bids/token_history)
    DELETE FROM opportunities WHERE class_id = p_class_id;
    GET DIAGNOSTICS v_deleted_opportunities = ROW_COUNT;

    -- 6. Finally, delete the class itself
    DELETE FROM classes WHERE id = p_class_id;
    GET DIAGNOSTICS v_deleted_classes = ROW_COUNT;

    -- Populate v_counts with actual deleted records
    v_counts := jsonb_build_object(
      'students', v_deleted_enrollments, -- Assuming 'students' count refers to enrollments
      'enrollments', v_deleted_enrollments,
      'opportunities', v_deleted_opportunities,
      'bids', v_deleted_bids,
      'tokenHistory', v_deleted_token_history,
      'classes', v_deleted_classes
    );

    -- Return success response
    RETURN jsonb_build_object(
      'success', true,
      'class_id', p_class_id,
      'class_name', v_class_name,
      'deleted_counts', v_counts,
      'duration_ms', EXTRACT(MILLISECONDS FROM (NOW() - v_start_time)),
      'timestamp', NOW()
    );

  EXCEPTION
    WHEN OTHERS THEN
      -- Return error response
      RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'class_id', p_class_id,
        'class_name', v_class_name,
        'timestamp', NOW()
      );
  END;
END;
$$;
```