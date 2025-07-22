/*
  # Add foreign key constraint for bids table

  1. Database Changes
    - Add foreign key constraint linking `bids.user_id` to `users.id`
    - This enables Supabase to perform joins between bids and users tables

  2. Purpose
    - Fixes the "Could not find a relationship between 'bids' and 'users'" error
    - Allows the fetchClasses function to properly join bids with user data
    - Maintains referential integrity between bids and users
*/

-- Add foreign key constraint to link bids.user_id to users.id
ALTER TABLE bids
ADD CONSTRAINT fk_bids_user_id
FOREIGN KEY (user_id)
REFERENCES users(id)
ON DELETE CASCADE;