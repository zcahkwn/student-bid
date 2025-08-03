/*
  # Fix Bid Status Check Constraint

  This migration fixes the check constraint violation by adding 'auto_selected' 
  as a valid bid_status value in the bids table.

  ## Changes Made
  1. Drop existing bids_bid_status_check constraint
  2. Recreate constraint with 'auto_selected' included as valid value
  
  ## Security
  - Maintains existing constraint validation
  - Adds support for automatic selection status
*/

-- Drop the existing constraint
ALTER TABLE public.bids DROP CONSTRAINT IF EXISTS bids_bid_status_check;

-- Recreate the constraint with 'auto_selected' included
ALTER TABLE public.bids ADD CONSTRAINT bids_bid_status_check 
CHECK (bid_status IN ('placed', 'confirmed', 'selected', 'rejected', 'auto_selected'));