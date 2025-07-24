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
