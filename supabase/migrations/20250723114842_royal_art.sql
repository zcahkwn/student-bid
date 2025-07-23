-- Drop and recreate the get_class_deletion_counts function with explicit column references
DROP FUNCTION IF EXISTS get_class_deletion_counts(uuid);

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
  SELECT COUNT(DISTINCT se.user_id)::integer INTO v_students
  FROM student_enrollments se
  WHERE se.class_id = p_class_id;
  
  -- Count opportunities
  SELECT COUNT(*)::integer INTO v_opportunities
  FROM opportunities o 
  WHERE o.class_id = p_class_id;
  
  -- Count bids (via opportunities) - explicitly using user_id
  SELECT COUNT(*)::integer INTO v_bids
  FROM bids b
  INNER JOIN opportunities o ON b.opportunity_id = o.id
  WHERE o.class_id = p_class_id;
  
  -- Count token history (via opportunities) - explicitly using user_id
  SELECT COUNT(*)::integer INTO v_token_history
  FROM token_history th
  INNER JOIN opportunities o ON th.opportunity_id = o.id
  WHERE o.class_id = p_class_id;
  
  RETURN jsonb_build_object(
    'students', v_students,
    'opportunities', v_opportunities,
    'bids', v_bids,
    'token_history', v_token_history
  );
END;
$$;