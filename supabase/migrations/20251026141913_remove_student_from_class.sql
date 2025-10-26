/*
  # Add Remove Student from Class Function

  1. New Function
    - `remove_student_from_class` - Atomically removes a student from a class
      - Checks if student has placed any bids in the class
      - If student has bids, returns error and prevents removal
      - If no bids, removes the enrollment from student_enrollments
      - If student has no other enrollments, also removes the user from users table
      - Returns detailed response with success status and deletion info

  2. Security
    - Function uses SECURITY DEFINER to ensure proper permissions
    - Atomic transaction ensures data consistency
    - Prevents orphaned data by checking enrollments before user deletion

  3. Response Format
    - Returns JSONB object with:
      - success (boolean)
      - has_bids (boolean) - indicates if student has placed bids
      - user_deleted (boolean) - indicates if user record was deleted
      - enrollment_deleted (boolean) - indicates if enrollment was deleted
      - error (text) - error message if operation failed
      - student_name (text) - name of the student
*/

CREATE OR REPLACE FUNCTION public.remove_student_from_class(
  p_user_id uuid,
  p_class_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_student_name text;
  v_has_bids boolean := false;
  v_bid_count integer := 0;
  v_enrollment_exists boolean := false;
  v_other_enrollments integer := 0;
  v_user_deleted boolean := false;
  v_enrollment_deleted boolean := false;
BEGIN
  -- Check if enrollment exists
  SELECT EXISTS(
    SELECT 1 FROM student_enrollments
    WHERE user_id = p_user_id AND class_id = p_class_id
  ) INTO v_enrollment_exists;

  IF NOT v_enrollment_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Student is not enrolled in this class',
      'has_bids', false,
      'user_deleted', false,
      'enrollment_deleted', false
    );
  END IF;

  -- Get student name
  SELECT name INTO v_student_name
  FROM users
  WHERE id = p_user_id;

  -- Check if student has placed any bids in this class
  SELECT COUNT(*) INTO v_bid_count
  FROM bids b
  INNER JOIN opportunities o ON b.opportunity_id = o.id
  WHERE b.user_id = p_user_id AND o.class_id = p_class_id;

  v_has_bids := v_bid_count > 0;

  -- If student has bids, prevent removal
  IF v_has_bids THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Student cannot be removed since they have already placed a bid',
      'has_bids', true,
      'user_deleted', false,
      'enrollment_deleted', false,
      'student_name', v_student_name
    );
  END IF;

  -- Delete the enrollment
  DELETE FROM student_enrollments
  WHERE user_id = p_user_id AND class_id = p_class_id;

  v_enrollment_deleted := true;

  -- Check if user has any other enrollments
  SELECT COUNT(*) INTO v_other_enrollments
  FROM student_enrollments
  WHERE user_id = p_user_id;

  -- If no other enrollments, delete the user record
  IF v_other_enrollments = 0 THEN
    DELETE FROM users
    WHERE id = p_user_id;
    v_user_deleted := true;
  END IF;

  -- Return success response
  RETURN jsonb_build_object(
    'success', true,
    'error', null,
    'has_bids', false,
    'user_deleted', v_user_deleted,
    'enrollment_deleted', v_enrollment_deleted,
    'student_name', v_student_name
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'has_bids', false,
      'user_deleted', false,
      'enrollment_deleted', false
    );
END;
$$;
