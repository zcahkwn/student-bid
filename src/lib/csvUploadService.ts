import { supabase } from '@/lib/supabase'
import { createOrGetUser, enrollUserInClass } from '@/lib/userService'

export interface CSVUploadResult {
  success: boolean
  recordsProcessed: number
  errors: string[]
  duplicatesSkipped: number
  message: string
  replacedCount?: number // New field to track replaced students
}

interface StudentCSVData {
  name: string
  email: string
  student_number: string // Required field
  class_id: string
}

// Validate CSV file format
const validateCSVFile = (file: File): string | null => {
  // Check file extension
  if (!file.name.toLowerCase().endsWith('.csv')) {
    return 'File must be a CSV file (.csv extension)'
  }
  
  // Check file size (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    return 'File size must be less than 5MB'
  }
  
  return null
}

// Parse CSV content and validate structure
const parseCSVContent = (csvText: string): { data: any[], errors: string[] } => {
  const errors: string[] = []
  const lines = csvText.trim().split('\n')
  
  if (lines.length < 2) {
    errors.push('CSV file must contain at least a header row and one data row')
    return { data: [], errors }
  }
  
  // Parse header row
  const headerRow = lines[0].split(',').map(col => col.trim().toLowerCase())
  
  // Check for required columns - now both email AND student number are required
  const requiredColumns = ['name', 'email', 'student number']
  const nameIndex = headerRow.findIndex(col => 
    col === 'name' || col === 'student name'
  )
  const emailIndex = headerRow.findIndex(col => 
    col === 'email' || col === 'email address'
  )
  const studentNumberIndex = headerRow.findIndex(col => 
    col === 'student number' || col === 'student_number' || col === 'id' || col === 'student id'
  )
  
  const missingColumns = []
  if (nameIndex === -1) missingColumns.push('Name')
  if (emailIndex === -1) missingColumns.push('Email')
  if (studentNumberIndex === -1) missingColumns.push('Student Number')
  
  if (missingColumns.length > 0) {
    errors.push(`Missing required columns: ${missingColumns.join(', ')}. All three fields (Name, Email, Student Number) are required for login.`)
    return { data: [], errors }
  }
  
  // Parse data rows
  const data: any[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue // Skip empty lines
    
    const columns = line.split(',').map(col => col.trim())
    
    if (columns.length <= Math.max(nameIndex, emailIndex, studentNumberIndex)) {
      errors.push(`Row ${i + 1}: Insufficient columns`)
      continue
    }
    
    const name = columns[nameIndex]?.trim()
    const email = columns[emailIndex]?.trim()
    const studentNumber = columns[studentNumberIndex]?.trim()
    
    // Validate required fields - all three are now required
    if (!name) {
      errors.push(`Row ${i + 1}: Name is required`)
      continue
    }
    
    if (!email) {
      errors.push(`Row ${i + 1}: Email is required`)
      continue
    }
    
    if (!studentNumber) {
      errors.push(`Row ${i + 1}: Student Number is required for login`)
      continue
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      errors.push(`Row ${i + 1}: Invalid email format: ${email}`)
      continue
    }
    
    data.push({
      name,
      email: email.toLowerCase(),
      student_number: studentNumber, // Store as string
      row: i + 1
    })
  }
  
  return { data, errors }
}

// Remove all existing enrollments from the specific class ONLY
const removeExistingEnrollments = async (classId: string): Promise<{ removedCount: number, errors: string[] }> => {
  try {
    const { data: existingEnrollments, error: countError } = await supabase
      .from('student_enrollments')
      .select('user_id')
      .eq('class_id', classId)

    if (countError) {
      throw new Error(`Failed to count existing enrollments: ${countError.message}`)
    }

    const existingCount = existingEnrollments?.length || 0

    const { error: deleteError } = await supabase
      .from('student_enrollments')
      .delete()
      .eq('class_id', classId)

    if (deleteError) {
      throw new Error(`Failed to remove existing enrollments: ${deleteError.message}`)
    }

    return { removedCount: existingCount, errors: [] }
  } catch (error) {
    console.error('Error removing existing enrollments:', error)
    return {
      removedCount: 0,
      errors: [error instanceof Error ? error.message : 'Unknown error removing existing enrollments']
    }
  }
}

// Check for duplicates within the new CSV data (within the same class)
const checkForInternalDuplicates = (students: any[]): { cleanStudents: any[], duplicates: string[] } => {
  const seenEmails = new Set<string>()
  const seenStudentNumbers = new Set<string>()
  const cleanStudents: any[] = []
  const duplicates: string[] = []
  
  students.forEach(student => {
    const emailLower = student.email.toLowerCase()
    const studentNumberLower = student.student_number.toLowerCase()
    
    const isDuplicateEmail = seenEmails.has(emailLower)
    const isDuplicateStudentNumber = seenStudentNumbers.has(studentNumberLower)
    
    if (isDuplicateEmail || isDuplicateStudentNumber) {
      duplicates.push(`Row ${student.row}: ${student.name} (Email: ${student.email}, Student #: ${student.student_number})`)
    } else {
      seenEmails.add(emailLower)
      seenStudentNumbers.add(studentNumberLower)
      cleanStudents.push(student)
    }
  })
  
  return { cleanStudents, duplicates }
}

// Upload students to Supabase using normalized schema
const uploadStudentsToSupabaseNormalized = async (
  students: any[],
  classId: string
): Promise<{ success: number, errors: string[] }> => {
  const errors: string[] = []
  let successCount = 0

  try {
    for (const studentData of students) {
      try {
        const user = await createOrGetUser({
          name: studentData.name,
          email: studentData.email,
          studentNumber: studentData.student_number
        })

        await enrollUserInClass({
          userId: user.id,
          classId: classId,
          tokensRemaining: 1,
          tokenStatus: 'unused',
          biddingResult: 'pending'
        })

        successCount++
      } catch (studentError) {
        console.error(`Error processing student ${studentData.name}:`, studentError)
        errors.push(`Failed to process ${studentData.name}: ${studentError instanceof Error ? studentError.message : 'Unknown error'}`)
      }
    }
  } catch (error) {
    console.error('Unexpected error during upload:', error)
    errors.push(`Unexpected error during upload: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }

  return { success: successCount, errors }
}

// Main CSV upload function - replaces existing enrollments for the specific class only
export const uploadCSVToSupabase = async (
  file: File,
  classId: string
): Promise<CSVUploadResult> => {
  const result: CSVUploadResult = {
    success: false,
    recordsProcessed: 0,
    errors: [],
    duplicatesSkipped: 0,
    message: '',
    replacedCount: 0
  }

  try {
    
    // Step 1: Validate file
    const fileValidationError = validateCSVFile(file)
    if (fileValidationError) {
      result.errors.push(fileValidationError)
      result.message = 'File validation failed'
      return result
    }
    
    // Step 2: Read and parse CSV content
    const csvText = await file.text()
    const { data: parsedData, errors: parseErrors } = parseCSVContent(csvText)
    
    if (parseErrors.length > 0) {
      result.errors.push(...parseErrors)
    }

    if (parsedData.length === 0) {
      result.message = 'No valid student data found in CSV file. Remember: Name, Email, and Student Number are all required.'
      return result
    }
    const { cleanStudents, duplicates } = checkForInternalDuplicates(parsedData)
    result.duplicatesSkipped = duplicates.length

    if (duplicates.length > 0) {
      result.errors.push(`Found ${duplicates.length} duplicate entries within the CSV file:`)
      result.errors.push(...duplicates)
    }

    if (cleanStudents.length === 0) {
      result.message = 'No valid unique students found in the CSV file after removing duplicates'
      return result
    }

    const { removedCount, errors: removeErrors } = await removeExistingEnrollments(classId)
    result.replacedCount = removedCount

    if (removeErrors.length > 0) {
      result.errors.push(...removeErrors)
      result.message = 'Failed to remove existing enrollments'
      return result
    }
    const { success: uploadedCount, errors: uploadErrors } = await uploadStudentsToSupabaseNormalized(cleanStudents, classId)

    if (uploadErrors.length > 0) {
      result.errors.push(...uploadErrors)
    }

    result.recordsProcessed = uploadedCount
    result.success = uploadedCount > 0

    if (result.success) {
      if (result.replacedCount > 0) {
        result.message = `Successfully uploaded ${uploadedCount} students for this class`
      } else {
        result.message = `Successfully uploaded ${uploadedCount} students to this class`
      }

      if (result.duplicatesSkipped > 0) {
        result.message += ` (${result.duplicatesSkipped} duplicates within CSV were skipped)`
      }
    } else {
      result.message = 'Failed to upload any students'
    }
    
  } catch (error) {
    console.error('CSV upload error:', error)
    result.errors.push(`Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    result.message = 'CSV upload failed due to unexpected error'
  }

  return result
}
