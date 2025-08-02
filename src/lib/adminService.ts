import { supabase } from '@/lib/supabase';

export interface AdminProfile {
  user_id: string;
  name: string;
  email: string;
  admin_type: 'admin' | 'super_admin';
  created_at: string;
}

/**
 * Fetches an admin's profile from the public.admins table.
 * @param userId The auth.users ID of the admin.
 * @returns AdminProfile if found, null otherwise.
 */
export const getAdminProfile = async (userId: string): Promise<AdminProfile | null> => {
  try {
    const { data, error } = await supabase
      .from('admins')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
      console.error('Error fetching admin profile:', error);
      throw error;
    }

    return data || null;
  } catch (error) {
    console.error('Unexpected error in getAdminProfile:', error);
    return null;
  }
};

/**
 * Creates a new admin profile in the public.admins table.
 * This function is intended for new admin registrations (admin_type will be 'admin').
 * @param userId The auth.users ID of the newly signed-up user.
 * @param name The name of the admin.
 * @param email The email of the admin.
 */
export const createAdminProfile = async (userId: string, name: string, email: string): Promise<void> => {
  try {
    const { error } = await supabase.rpc('create_admin_profile_secure', {
      p_user_id: userId,
      p_name: name,
      p_email: email,
      p_admin_type: 'admin'
    });
      });

    if (error) {
      console.error('Error creating admin profile:', error);
      throw error;
    }
  } catch (error) {
    console.error('Unexpected error in createAdminProfile:', error);
    throw error;
  }
};

/**
 * Gets all admin profiles (for super_admin use)
 * @returns Array of AdminProfile objects
 */
export const getAllAdminProfiles = async (): Promise<AdminProfile[]> => {
  try {
    const { data, error } = await supabase
      .from('admins')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching all admin profiles:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Unexpected error in getAllAdminProfiles:', error);
    return [];
  }
};