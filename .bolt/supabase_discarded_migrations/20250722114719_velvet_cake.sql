/*
  # Add capacity_default column to classes table

  1. Changes
    - Add `capacity_default` column to `classes` table
    - Set default value to 7 to align with application defaults
    - Make column NOT NULL with default value

  This resolves the RPC function error: "column c.capacity_default does not exist"
*/

-- Add the missing capacity_default column to the classes table
ALTER TABLE classes 
ADD COLUMN IF NOT EXISTS capacity_default INTEGER NOT NULL DEFAULT 7;

-- Add an index for performance if needed
CREATE INDEX IF NOT EXISTS idx_classes_capacity_default 
ON classes (capacity_default);