/*
  # Remove class password column from classes table

  1. Changes
    - Remove password_hash column from classes table
    - Update any indexes or constraints that reference the password column
    - Clean up any related audit logs

  2. Security
    - This migration removes password-based class access
    - Students now authenticate using email and student number only
    - Admin access remains unchanged
*/

-- Remove the password_hash column from classes table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'classes' AND column_name = 'password_hash'
  ) THEN
    ALTER TABLE classes DROP COLUMN password_hash;
  END IF;
END $$;

-- Log the schema change
INSERT INTO dinner_table_audit (
  table_name,
  action,
  details,
  performed_by
) VALUES (
  'classes',
  'UPDATE',
  jsonb_build_object(
    'change_type', 'remove_column',
    'column_name', 'password_hash',
    'reason', 'Remove class password functionality - students now authenticate with email and student number only',
    'timestamp', now()
  ),
  null
);