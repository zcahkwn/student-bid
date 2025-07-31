import { supabase } from '@/lib/supabase'
import { User, Student, StudentEnrollment } from '@/types'

interface CreateUserData {
  name: string
  email: string
  studentNumber: string
}

interface EnrollUserData {
  userId: string
  classId: string
  tokensRemaining?: number
  tokenStatus?: 'unused' | 'used'
  biddingResult?: 'pending' | 'won' | 'lost'
}

// Create or get existing user
export const createOrGetUser = async (userData: CreateUserData): Promise<User> => {
  try {
    // First try to find existing user by email
    const { data: existingUser, error: findError } = await supabase
      .from('users')
      .select('*')
      .eq('email', userData.email)
      .maybeSingle()

    if (existingUser && !findError) {
      // Update user info if needed
      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update({
          name: userData.name,
          student_number: userData.studentNumber
        })
        .eq('id', existingUser.id)
        .select()
        .single()

      if (updateError) throw updateError

      return {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        studentNumber: updatedUser.student_number,
        createdAt: updatedUser.created_at,
        updatedAt: updatedUser.updated_at
      }
    }

    // Create new user if not found
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert({
        name: userData.name,
        email: userData.email,
        student_number: userData.studentNumber
      })
      .select()
      .single()

    if (createError) throw createError

    return {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      studentNumber: newUser.student_number,
      createdAt: newUser.created_at,
      updatedAt: newUser.updated_at
    }
  } catch (error) {
    console.error('Error creating/getting user:', error)
    throw error
  }
}

// Enroll user in a class
export const enrollUserInClass = async (enrollmentData: EnrollUserData): Promise<StudentEnrollment> => {
  try {
    const { data: enrollment, error } = await supabase
      .from('student_enrollments')
      .upsert({
        user_id: enrollmentData.userId,
        class_id: enrollmentData.classId,
        tokens_remaining: enrollmentData.tokensRemaining || 1,
        token_status: enrollmentData.tokenStatus || 'unused',
        bidding_result: enrollmentData.biddingResult || 'pending'
      })
      .select()
      .single()

    if (error) throw error

    return {
      userId: enrollment.user_id,
      classId: enrollment.class_id,
      tokensRemaining: enrollment.tokens_remaining,
      tokenStatus: enrollment.token_status,
      biddingResult: enrollment.bidding_result,
      createdAt: enrollment.created_at,
      updatedAt: enrollment.updated_at
    }
  } catch (error) {
    console.error('Error enrolling user in class:', error)
    throw error
  }
}

// Get user by email and student number
export const getUserByCredentials = async (email: string, studentNumber: string): Promise<User | null> => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .eq('student_number', studentNumber)
      .maybeSingle()

    if (error || !user) return null

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      studentNumber: user.student_number,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    }
  } catch (error) {
    console.error('Error getting user by credentials:', error)
    return null
  }
}

// Get user's enrollments across all classes
export const getUserEnrollments = async (userId: string): Promise<StudentEnrollment[]> => {
  try {
    const { data: enrollments, error } = await supabase
      .from('student_enrollments')
      .select('*')
      .eq('user_id', userId)

    if (error) throw error

    return (enrollments || []).map(enrollment => ({
      userId: enrollment.user_id,
      classId: enrollment.class_id,
      tokensRemaining: enrollment.tokens_remaining,
      tokenStatus: enrollment.token_status,
      biddingResult: enrollment.bidding_result,
      createdAt: enrollment.created_at,
      updatedAt: enrollment.updated_at
    }))
  } catch (error) {
    console.error('Error getting user enrollments:', error)
    return []
  }
}

// Get all students enrolled in a specific class
export const getClassStudents = async (classId: string): Promise<Student[]> => {
  try {
    const { data: enrollments, error } = await supabase
      .from('student_enrollments')
      .select(`
        *,
        user:users(*)
      `)
      .eq('class_id', classId)

    if (error) throw error

    return (enrollments || []).map(enrollment => ({
      id: enrollment.user.id,
      name: enrollment.user.name,
      email: enrollment.user.email,
      studentNumber: enrollment.user.student_number,
      hasUsedToken: enrollment.tokens_remaining <= 0,
      hasBid: enrollment.token_status === 'used', // This is correct for class-specific students
      tokensRemaining: enrollment.tokens_remaining,
      tokenStatus: enrollment.token_status,
      biddingResult: enrollment.bidding_result
    }))
  } catch (error) {
    console.error('Error getting class students:', error)
    return []
  }
}

// Clean up orphaned users who are no longer enrolled in any classes
export const cleanupOrphanedUsers = async (): Promise<{
  success: boolean
  deletedCount: number
  errors: string[]
  message: string
}> => {
  try {
    console.log('=== STARTING ORPHANED USER CLEANUP ===')
    
    // Get all user IDs that are currently enrolled in at least one class
    const { data: enrolledUserIds, error: enrollmentError } = await supabase
      .from('student_enrollments')
      .select('user_id')
    
    if (enrollmentError) {
      console.error('Error fetching enrolled user IDs:', enrollmentError)
      return {
        success: false,
        deletedCount: 0,
        errors: [`Failed to fetch enrolled users: ${enrollmentError.message}`],
        message: 'Cleanup failed due to database error'
      }
    }
    
    // Extract unique user IDs from enrollments
    const enrolledIds = new Set((enrolledUserIds || []).map(enrollment => enrollment.user_id))
    console.log('Currently enrolled user IDs:', Array.from(enrolledIds))
    
    // Get all users from the users table
    const { data: allUsers, error: usersError } = await supabase
      .from('users')
      .select('id, name, email')
    
    if (usersError) {
      console.error('Error fetching all users:', usersError)
      return {
        success: false,
        deletedCount: 0,
        errors: [`Failed to fetch users: ${usersError.message}`],
        message: 'Cleanup failed due to database error'
      }
    }
    
    // Identify orphaned users (users not enrolled in any class)
    const orphanedUsers = (allUsers || []).filter(user => !enrolledIds.has(user.id))
    console.log('Orphaned users found:', orphanedUsers.length)
    console.log('Orphaned user details:', orphanedUsers.map(u => ({ id: u.id, name: u.name, email: u.email })))
    
    if (orphanedUsers.length === 0) {
      return {
        success: true,
        deletedCount: 0,
        errors: [],
        message: 'No orphaned users found - database is clean'
      }
    }
    
    // Delete orphaned users
    const orphanedUserIds = orphanedUsers.map(user => user.id)
    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .in('id', orphanedUserIds)
    
    if (deleteError) {
      console.error('Error deleting orphaned users:', deleteError)
      return {
        success: false,
        deletedCount: 0,
        errors: [`Failed to delete orphaned users: ${deleteError.message}`],
        message: 'Cleanup failed during user deletion'
      }
    }
    
    console.log(`Successfully deleted ${orphanedUsers.length} orphaned users`)
    
    return {
      success: true,
      deletedCount: orphanedUsers.length,
      errors: [],
      message: `Successfully removed ${orphanedUsers.length} orphaned user${orphanedUsers.length !== 1 ? 's' : ''}`
    }
    
  } catch (error) {
    console.error('Unexpected error during orphaned user cleanup:', error)
    return {
      success: false,
      deletedCount: 0,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
      message: 'Cleanup failed due to unexpected error'
    }
  }
}