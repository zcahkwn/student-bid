-- Fix for get_class_deletion_counts function
-- This removes any references to student_id and uses the correct schema
CREATE OR REPLACE FUNCTION get_class_deletion_counts(p_class_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_students integer := 0;
  v_opportunities integer := 0;
  v_bids integer := 0;
  v_token_history integer := 0;
BEGIN
  -- Count students (via student_enrollments)
  SELECT COUNT(DISTINCT user_id)::integer INTO v_students
  FROM student_enrollments
  WHERE class_id = p_class_id;
  
  -- Count opportunities
  SELECT COUNT(*)::integer INTO v_opportunities
  FROM opportunities WHERE class_id = p_class_id;
  
  -- Count bids (via opportunities) - FIXED: using user_id instead of student_id
  SELECT COUNT(*)::integer INTO v_bids
  FROM bids b
  JOIN opportunities o ON b.opportunity_id = o.id
  WHERE o.class_id = p_class_id;
  
  -- Count token history (via opportunities) - FIXED: using user_id instead of student_id
  SELECT COUNT(*)::integer INTO v_token_history
  FROM token_history th
  JOIN opportunities o ON th.opportunity_id = o.id
  WHERE o.class_id = p_class_id;
  
  RETURN jsonb_build_object(
    'students', v_students,
    'opportunities', v_opportunities,
    'bids', v_bids,
    'token_history', v_token_history
  );
END;
$$;

-- Updated delete_class_atomic function without dinner_tables references
CREATE OR REPLACE FUNCTION delete_class_atomic(p_class_id uuid, p_class_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_class_name text;
  v_counts jsonb;
  v_start_time timestamptz := NOW();
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
  
  -- Get counts before deletion
  v_counts := get_class_deletion_counts(p_class_id);
  
  -- Perform atomic deletion
  -- Deleting the class will cascade to associated opportunities, bids, and student enrollments
  -- due to ON DELETE CASCADE foreign key constraints.
  DELETE FROM classes WHERE id = p_class_id;
  
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
$$;