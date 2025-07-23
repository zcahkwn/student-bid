import { supabase } from '@/lib/supabase'
import { ClassConfig, Student, BidOpportunity } from '@/types'
import { getClassBidStatistics, updateBidOpportunitiesWithCounts } from '@/lib/bidTrackingService'
import { getClassStudents } from '@/lib/userService'

interface CreateClassData {
  name: string
  capacity?: number
}

interface SupabaseClass {
  id: string
  name: string
  created_at: string
}

interface SupabaseOpportunity {
  id: string
  class_id: string
  description: string | null
  opens_at: string
  closes_at: string
  event_date: string
  capacity: number
  status: string
  draw_seed: string | null
  created_at: string
}

export interface ClassDeletionResult {
  success: boolean
  classId: string
  className: string
  deletedRecords: {
    students: number // This will be 0 since we're using the normalized schema
    enrollments: number
    opportunities: number
    bids: number
    tokenHistory: number
  }
  auditLogId?: string
  error?: string
  timestamp: string
}

// Create a new class in Supabase
export const createClass = async (classData: CreateClassData): Promise<ClassConfig> => {
  try {
    // Insert class into Supabase
    const { data: classRecord, error: classError } = await supabase
      .from('classes')
      .insert({
        name: classData.name
      })
      .select()
      .single()

    if (classError) {
      throw new Error(`Failed to create class: ${classError.message}`)
    }

    // Convert Supabase data to ClassConfig format
    const classConfig: ClassConfig = {
      id: classRecord.id,
      className: classRecord.name,
      rewardTitle: "Dinner with Professor",
      rewardDescription: "Join the professor for dinner and discussion at a local restaurant.",
      capacity: classData.capacity || 7,
      students: [],
      bidders: [],
      selectedStudents: [],
      bidOpportunities: [] // Start with empty bidding opportunities
    }

    return classConfig
  } catch (error) {
    console.error('Error creating class:', error)
    throw error
  }
}

// Validate class exists and get basic info before deletion
const validateClassForDeletion = async (classId: string): Promise<{
  valid: boolean
  className?: string
  recordCounts?: {
    enrollments: number
    opportunities: number
    bids: number
    tokenHistory: number
  }
  error?: string
}> => {
  try {
    // Check if class exists
    const { data: classData, error: classError } = await supabase
      .from('classes')
      .select('id, name')
      .eq('id', classId)
      .single()

    if (classError || !classData) {
      return {
        valid: false,
        error: 'Class not found or access denied'
      }
    }

    // Get opportunity IDs for this class first
    const { data: opportunities, error: oppError } = await supabase
      .from('opportunities')
      .select('id')
      .eq('class_id', classId)

    if (oppError) {
      return {
        valid: false,
        error: `Failed to fetch opportunities: ${oppError.message}`
      }
    }

    const opportunityIds = opportunities?.map(opp => opp.id) || []

    // Get counts of related records
    const [enrollmentsResult, opportunitiesResult, bidsResult, tokenHistoryResult] = await Promise.all([
      supabase.from('student_enrollments').select('user_id', { count: 'exact' }).eq('class_id', classId),
      supabase.from('opportunities').select('id', { count: 'exact' }).eq('class_id', classId),
      opportunityIds.length > 0 
        ? supabase.from('bids').select('id', { count: 'exact' }).in('opportunity_id', opportunityIds)
        : Promise.resolve({ count: 0 }),
      opportunityIds.length > 0
        ? supabase.from('token_history').select('id', { count: 'exact' }).in('opportunity_id', opportunityIds)
        : Promise.resolve({ count: 0 })
    ])

    return {
      valid: true,
      className: classData.name,
      recordCounts: {
        enrollments: enrollmentsResult.count || 0,
        opportunities: opportunitiesResult.count || 0,
        bids: bidsResult.count || 0,
        tokenHistory: tokenHistoryResult.count || 0
      }
    }
  } catch (error) {
    console.error('Error validating class for deletion:', error)
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Validation failed'
    }
  }
}

// Atomic class deletion with comprehensive cascading
export const deleteClassAtomic = async (classId: string): Promise<ClassDeletionResult> => {
  const timestamp = new Date().toISOString()
  
  console.log('=== STARTING CLASS DELETION DEBUG ===')
  console.log('Class ID to delete:', classId)
  console.log('Supabase client status:', !!supabase)
  
  try {
    console.log('=== CALLING DATABASE RPC FUNCTION ===')
    
    // Use the database RPC function to handle deletion atomically
    const { data: rpcResult, error: rpcError } = await supabase.rpc('delete_class_atomic', {
      p_class_id: classId
    })

    console.log('RPC function result:', rpcResult)

    if (rpcError) {
      console.error('RPC error during class deletion:', rpcError)
      throw new Error(`Failed to delete class: ${rpcError.message}`)
    }

    if (!rpcResult || !rpcResult.success) {
      console.error('RPC function returned failure:', rpcResult)
      throw new Error(rpcResult?.error || 'Class deletion failed')
    }

    console.log('=== DELETION COMPLETED SUCCESSFULLY ===')
    
    // Extract counts from the RPC result
    const deletedCounts = {
      students: rpcResult.deleted_counts?.students || 0,
      enrollments: rpcResult.deleted_counts?.students || 0, // Use students count for enrollments
      opportunities: rpcResult.deleted_counts?.opportunities || 0,
      bids: rpcResult.deleted_counts?.bids || 0,
      tokenHistory: rpcResult.deleted_counts?.token_history || 0,
    }

    return {
      success: true,
      classId: rpcResult.class_id,
      className: rpcResult.class_name,
      deletedRecords: deletedCounts,
      timestamp
    }

  } catch (error) {
    console.error('=== CLASS DELETION FAILED ===')
    console.error('Error type:', typeof error)
    console.error('Error message:', error instanceof Error ? error.message : error)
    console.error('Full error object:', error)
    
    return {
      success: false,
      classId,
      className: 'Unknown',
      deletedRecords: { students: 0, enrollments: 0, opportunities: 0, bids: 0, tokenHistory: 0 },
      error: error instanceof Error ? error.message : 'Unexpected error during deletion',
      timestamp
    }
  }
}

// Update selection results in the database after admin selection
export const updateSelectionResults = async (
  opportunityId: string,
  classId: string, // Keep this parameter, even if not directly used by RPC
  selectedStudentIds: string[],
  allBidderIds: string[]
): Promise<void> => {
  try {
    console.log('=== UPDATING SELECTION RESULTS ===')
    console.log('Opportunity ID:', opportunityId)
    console.log('Class ID:', classId)
    console.log('Selected students:', selectedStudentIds)
    console.log('All bidders:', allBidderIds)

    // Step 0: Verify bids exist for this opportunity (optional, can be removed if RPC handles this check)
    console.log('=== STEP 0: VERIFY BIDS EXIST ===')
    const { data: existingBids, error: verifyError } = await supabase
      .from('bids')
      .select('id, user_id, is_winner')
      .eq('opportunity_id', opportunityId)

    if (verifyError) {
      console.error('Error verifying existing bids:', verifyError)
      throw new Error(`Failed to verify existing bids: ${verifyError.message}`)
    }

    console.log('Existing bids found:', existingBids?.length || 0)
    console.log('Existing bids details:', existingBids)

    // Use a single RPC call to update all bids and enrollments atomically
    console.log('=== STEP 1: CALLING RPC FUNCTION TO UPDATE SELECTION RESULTS ===')
    
    const { data: rpcResult, error: rpcError } = await supabase.rpc('update_selection_results_atomic', {
      p_opportunity_id: opportunityId,
      p_selected_user_ids: selectedStudentIds,
      p_all_bidder_ids: allBidderIds
    })

    if (rpcError) {
      console.error('RPC error updating selection results:', rpcError)
      throw new Error(`Failed to update selection results: ${rpcError.message}`)
    }

    console.log('RPC function result:', rpcResult)

    // Verification logs can be simplified or removed as the RPC function guarantees atomicity
    console.log('=== SELECTION RESULTS UPDATE COMPLETED ===')
  } catch (error) {
    console.error('Error updating selection results:', error)
    throw error
  }
}

// Legacy delete function - now uses atomic deletion
const deleteClass = async (classId: string): Promise<void> => {
  const result = await deleteClassAtomic(classId)
  
  if (!result.success) {
    throw new Error(result.error || 'Class deletion failed')
  }
  
  console.log(`Successfully deleted class ${result.className} and ${
    Object.values(result.deletedRecords).reduce((a, b) => a + b, 0)
  } related records`)
}

// Create a new bidding opportunity
export const createBidOpportunity = async (
  classId: string,
  opportunityData: {
    title: string
    description: string
    event_date: string
    opens_at: string
    closes_at: string
    bidding_closes_at?: string
    capacity?: number
  }
): Promise<BidOpportunity> => {
  try {
    const { data: opportunityRecord, error } = await supabase
      .from('opportunities')
      .insert({
        class_id: classId,
        title: opportunityData.title,
        description: opportunityData.description,
        opens_at: opportunityData.opens_at,
        closes_at: opportunityData.bidding_closes_at || opportunityData.closes_at,
        event_date: new Date(opportunityData.event_date).toISOString().split('T')[0],
        capacity: opportunityData.capacity,
        status: 'open'
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create opportunity: ${error.message}`)
    }

    // Convert to BidOpportunity format
    const bidOpportunity: BidOpportunity = {
      id: opportunityRecord.id,
      date: opportunityRecord.event_date,
      bidOpenDate: opportunityRecord.opens_at,
      bidCloseDate: opportunityRecord.closes_at,
      title: opportunityRecord.title || opportunityData.title,
      description: opportunityRecord.description,
      bidders: [],
      selectedStudents: [],
      isOpen: false,
      capacity: opportunityRecord.capacity
    }

    return bidOpportunity
  } catch (error) {
    console.error('Error creating opportunity:', error)
    throw error
  }
}

// Fetch all classes from Supabase with real-time bid data
export const fetchClasses = async (): Promise<ClassConfig[]> => {
  try {
    const { data: classesData, error: classesError } = await supabase
      .from('classes')
      .select('id, name, created_at')
      .order('created_at', { ascending: false })

    if (classesError) {
      throw new Error(`Failed to fetch classes: ${classesError.message}`)
    }

    if (!classesData || classesData.length === 0) {
      return []
    }

    // Fetch all related data for each class
    const classConfigs: ClassConfig[] = []

    for (const classRecord of classesData) {
      // Fetch students using the new normalized schema
      const students = await getClassStudents(classRecord.id)

      // Fetch opportunities
      const { data: opportunitiesData, error: opportunitiesError } = await supabase
        .from('opportunities')
        .select('*')
        .eq('class_id', classRecord.id)
        .order('event_date', { ascending: true })

      if (opportunitiesError) {
        console.error(`Failed to fetch opportunities for class ${classRecord.id}:`, opportunitiesError.message)
      }

      // Create bid opportunities with real-time bid counts and selected students
      let bidOpportunities: BidOpportunity[] = []
      
      for (const opp of (opportunitiesData || [])) {
        // Fetch bids for this opportunity with user details
        const { data: bidsData, error: bidsError } = await supabase
          .from('bids')
          .select(`
            id,
            user_id,
            is_winner,
            bid_status,
            submission_timestamp,
            users!inner(id, name, email, student_number)
          `)
          .eq('opportunity_id', opp.id)
          .order('submission_timestamp', { ascending: true })

        if (bidsError) {
          console.error(`Failed to fetch bids for opportunity ${opp.id}:`, bidsError.message)
        }

        // Create bidders array from all bids
        const bidders: Student[] = (bidsData || []).map(bid => ({
          id: bid.users.id,
          name: bid.users.name,
          email: bid.users.email,
          studentNumber: bid.users.student_number,
          hasUsedToken: true, // They placed a bid, so token is used
          hasBid: true
        }))

        // Create selectedStudents array from winning bids
        const selectedStudents: Student[] = (bidsData || [])
          .filter(bid => bid.is_winner === true)
          .map(bid => ({
            id: bid.users.id,
            name: bid.users.name,
            email: bid.users.email,
            studentNumber: bid.users.student_number,
            hasUsedToken: true,
            hasBid: true,
            isSelected: true
          }))

        bidOpportunities.push({
          id: opp.id,
          date: opp.event_date,
          bidOpenDate: opp.opens_at,
          title: opp.title || `Bidding Opportunity - ${new Date(opp.event_date).toLocaleDateString()}`,
          description: opp.description,
          bidders: bidders,
          bidCloseDate: opp.closes_at,
          selectedStudents: selectedStudents,
          isOpen: opp.status === 'open',
          capacity: opp.capacity
        })
      }

      // Get students who have bid (from all opportunities)
      const studentsWhoBid = students.filter(s => s.hasBid)
      
      // Aggregate all selected students from all opportunities for class-level selectedStudents
      const allSelectedStudents: Student[] = []
      const selectedStudentIds = new Set<string>()
      
      bidOpportunities.forEach(opportunity => {
        opportunity.selectedStudents.forEach(student => {
          if (!selectedStudentIds.has(student.id)) {
            selectedStudentIds.add(student.id)
            allSelectedStudents.push(student)
          }
        })
      })

      const classConfig: ClassConfig = {
        id: classRecord.id,
        className: classRecord.name,
        rewardTitle: "Dinner with Professor",
        rewardDescription: "Join the professor for dinner and discussion at a local restaurant.",
        capacity: 7,
        students,
        bidders: studentsWhoBid,
        selectedStudents: allSelectedStudents,
        bidOpportunities
      }

      classConfigs.push(classConfig)
    }

    return classConfigs
  } catch (error) {
    console.error('Error fetching classes:', error)
    throw error
  }
}

// Update class information
export const updateClass = async (classId: string, updates: Partial<CreateClassData>): Promise<void> => {
  try {
    const updateData: any = {}
    
    if (updates.name) updateData.name = updates.name

    const { error } = await supabase
      .from('classes')
      .update(updateData)
      .eq('id', classId)

    if (error) {
      throw new Error(`Failed to update class: ${error.message}`)
    }
  } catch (error) {
    console.error('Error updating class:', error)
    throw error
  }
}

// Update bidding opportunity - FIXED VERSION
export const updateBidOpportunity = async (
  opportunityId: string, 
  updates: {
    title?: string
    description?: string
    event_date?: string
    opens_at?: string
    closes_at?: string
    capacity?: number
  }
): Promise<boolean> => {
  try {
    console.log('Starting opportunity update for ID:', opportunityId);
    console.log('Update data:', updates);
    
    // Build the update object with proper field mapping
    const updateData: any = {};
    
    if (updates.title !== undefined) {
      updateData.title = updates.title;
    }
    
    if (updates.description !== undefined) {
      updateData.description = updates.description;
    }
    
    if (updates.event_date) {
      const eventDate = new Date(updates.event_date);
      if (isNaN(eventDate.getTime())) {
        throw new Error('Invalid event date provided');
      }
      updateData.event_date = eventDate.toISOString().split('T')[0]; // YYYY-MM-DD format
    }
    
    if (updates.opens_at) {
      updateData.opens_at = updates.opens_at;
    }
    
    if (updates.closes_at) {
      updateData.closes_at = updates.closes_at;
    }
    
    if (updates.capacity !== undefined) {
      updateData.capacity = updates.capacity;
    }
    
    console.log('Final update data for Supabase:', updateData);
    
    // Perform the update
    const { data: existingOpportunity, error: checkError } = await supabase
      .from('opportunities')
      .update(updateData)
      .eq('id', opportunityId)
      .select()

    if (checkError) {
      console.error('Supabase update error:', checkError);
      throw new Error(`Failed to update opportunity: ${checkError.message}`);
    }

    if (!existingOpportunity || existingOpportunity.length === 0) {
      console.log(`No opportunity found with ID: ${opportunityId}`);
      return false;
    }

    console.log('Successfully updated opportunity in Supabase:', existingOpportunity[0]);
    return true;

  } catch (error) {
    console.error('Error updating opportunity:', error);
    throw error;
  }
}

// Delete a bidding opportunity
export const deleteBidOpportunity = async (opportunityId: string): Promise<void> => {
  try {
    console.log('=== STARTING OPPORTUNITY DELETION DEBUG ===')
    console.log('Opportunity ID to delete:', opportunityId)
    console.log('Supabase client status:', !!supabase)
    console.log('Environment variables check:', {
      url: !!import.meta.env.VITE_SUPABASE_URL,
      key: !!import.meta.env.VITE_SUPABASE_ANON_KEY
    })
    
    // Step 1: Verify the opportunity exists
    console.log('Step 1: Checking if opportunity exists...')
    const { data: existingOpportunity, error: checkError } = await supabase
      .from('opportunities')
      .select('id, title, description')
      .eq('id', opportunityId)
      .single()

    console.log('Existence check result:', {
      data: existingOpportunity,
      error: checkError
    })

    if (checkError) {
      if (checkError.code === 'PGRST116') {
        console.log('PGRST116: Record not found - opportunity may already be deleted')
        return
      }
      console.error('Error during existence check:', checkError)
      throw new Error(`Failed to check opportunity existence: ${checkError.message}`)
    }

    if (!existingOpportunity) {
      console.log('No opportunity data returned - treating as already deleted')
      return
    }

    console.log('Step 2: Opportunity found, proceeding with deletion:', existingOpportunity)
    
    // Step 2: Perform the actual deletion
    console.log('Step 3: Executing DELETE operation...')
    const { error, count } = await supabase
      .from('opportunities')
      .delete({ count: 'exact' })
      .eq('id', opportunityId)

    console.log('Delete operation result:', {
      error: error,
      count: count,
      errorCode: error?.code,
      errorMessage: error?.message,
      errorDetails: error?.details
    })

    if (error) {
      console.error('=== DELETE OPERATION FAILED ===')
      console.error('Error object:', error)
      console.error('Error code:', error.code)
      console.error('Error message:', error.message)
      console.error('Error details:', error.details)
      throw new Error(`Failed to delete opportunity: ${error.message}`)
    }

    console.log('=== DELETE OPERATION COMPLETED ===')
    console.log(`Records deleted: ${count}`)
    
    if (count === 0) {
      console.warn('WARNING: Delete operation returned 0 affected rows - opportunity may not exist')
      console.warn('This could indicate:')
      console.warn('1. Opportunity ID does not exist in database')
      console.warn('2. RLS policies are blocking the delete')
      console.warn('3. User does not have delete permissions')
    }

    console.log('=== DELETION PROCESS COMPLETED SUCCESSFULLY ===')

  } catch (error) {
    console.error('=== DELETION PROCESS FAILED ===')
    console.error('Error type:', typeof error)
    console.error('Error message:', error instanceof Error ? error.message : error)
    console.error('Full error object:', error)
    throw error
  }
}