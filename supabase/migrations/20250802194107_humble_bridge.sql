/*
  # Create secure admin registration function

  1. New Functions
    - `create_admin_profile_secure`
      - Accepts user_id, name, email, admin_type parameters
      - Uses SECURITY DEFINER to bypass RLS
      - Only allows creation of 'admin' type users (not 'super_admin')

  2. Security
    - Function executes with elevated privileges to bypass RLS
    - Validates that only 'admin' type can be created via this function
    - Grants execute permission to authenticated users
*/

-- Create secure function to insert admin profiles
CREATE OR REPLACE FUNCTION public.create_admin_profile_secure(
  p_user_id uuid,
  p_name text,
  p_email text,
  p_admin_type text DEFAULT 'admin'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only allow creation of 'admin' type through this function
  -- 'super_admin' must be created manually
  IF p_admin_type != 'admin' THEN
    RAISE EXCEPTION 'Only admin type can be created through registration';
  END IF;

  -- Insert the admin profile with elevated privileges
  INSERT INTO public.admins (user_id, name, email, admin_type)
  VALUES (p_user_id, p_name, p_email, p_admin_type);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.create_admin_profile_secure TO authenticated;