/*
  # Add archive functionality to classes

  1. Schema Changes
    - Add `is_archived` column to `classes` table
    - Default value is `false` (not archived)
    - Add index for efficient filtering of archived/active classes

  2. Security
    - No changes to existing RLS policies
    - Archive status follows existing class permissions

  3. Data Migration
    - All existing classes will be marked as not archived (is_archived = false)
*/

-- Add is_archived column to classes table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'classes' AND column_name = 'is_archived'
  ) THEN
    ALTER TABLE classes ADD COLUMN is_archived boolean DEFAULT false NOT NULL;
  END IF;
END $$;

-- Add index for efficient filtering by archive status
CREATE INDEX IF NOT EXISTS idx_classes_is_archived ON classes(is_archived);

-- Add composite index for common queries (active classes ordered by creation)
CREATE INDEX IF NOT EXISTS idx_classes_active_created_at ON classes(is_archived, created_at) WHERE is_archived = false;