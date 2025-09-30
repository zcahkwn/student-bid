import { supabase } from '@/lib/supabase'
import { ClassConfig, Student, BidOpportunity } from '@/types'
import { getClassStudents } from '@/lib/userService'

interface CreateClassData {
  name: string
  capacity?: number
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
      rewardTitle: "Bidding Opportunities",
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

// Atomic class deletion with comprehensive cascading
export const deleteClassAtomic = async (classId: string): Promise<ClassDeletionResult> => {
  const timestamp = new Date().toISOString()

  try {
    const { data: rpcResult, error: rpcError } = await supabase.rpc('delete_class_atomic', {
      p_class_id: classId,
      p_class_name: ''
    })

    if (rpcError) {
      throw new Error(`Failed to delete class: ${rpcError.message}`)
    }

    if (!rpcResult || !rpcResult.success) {
      throw new Error(rpcResult?.error || 'Class deletion failed')
    }
    
    const deletedCounts = {
      students: rpcResult.deleted_counts?.students || 0,
      enrollments: rpcResult.deleted_counts?.students || 0,
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
    console.error('Class deletion failed:', error)

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
  classId: string,
  selectedStudentIds: string[],
  allBidderIds: string[]
): Promise<void> => {
  try {
    
    const { data: rpcResult, error: rpcError } = await supabase.rpc('update_selection_results_atomic', {
      p_opportunity_id: opportunityId,
      p_selected_user_ids: selectedStudentIds,
      p_all_bidder_ids: allBidderIds
    })

    if (rpcError) {
      throw new Error(`Failed to update selection results: ${rpcError.message}`)
    }
  } catch (error) {
    console.error('Error updating selection results:', error)
    throw error
  }
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

// Auto-select all bidders and refund their tokens
export const autoSelectAndRefundBids = async (opportunityId: string): Promise<void> => {
  try {
    const { data: result, error } = await supabase.rpc('auto_select_and_refund_bids', {
      p_opportunity_id: opportunityId
    });

    if (error) {
      throw new Error(`Failed to auto-select and refund: ${error.message}`);
    }

    if (!result || !result.success) {
      throw new Error(result?.error || 'Auto-select and refund failed');
    }
  } catch (error) {
    console.error('Error in auto-select and refund:', error);
    throw error;
  }
}

// Fetch all classes from Supabase with real-time bid data
export const fetchClasses = async (isArchivedFilter?: boolean): Promise<ClassConfig[]> => {
  try {
    let query = supabase
      .from('classes')
      .select('id, name, is_archived, created_at')
      .order('created_at', { ascending: false })

    // Apply archive filter if specified
    if (isArchivedFilter !== undefined) {
      query = query.eq('is_archived', isArchivedFilter)
    }

    const { data: classesData, error: classesError } = await query

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
          hasBid: true,
          bidStatus: bid.bid_status // Include the specific bid status
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
            isSelected: true,
            bidStatus: bid.bid_status // Include the specific bid status
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
        rewardTitle: "Bidding Opportunities",
        capacity: 7,
        isArchived: classRecord.is_archived || false,
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

// Update class archive status
export const updateClassArchiveStatus = async (classId: string, isArchived: boolean): Promise<void> => {
  try {
    const { error } = await supabase
      .from('classes')
      .update({ is_archived: isArchived })
      .eq('id', classId)

    if (error) {
      throw new Error(`Failed to update class archive status: ${error.message}`)
    }
  } catch (error) {
    console.error('Error updating class archive status:', error)
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
    const { data: existingOpportunity, error: checkError } = await supabase
      .from('opportunities')
      .update(updateData)
      .eq('id', opportunityId)
      .select()

    if (checkError) {
      throw new Error(`Failed to update opportunity: ${checkError.message}`);
    }

    return !!(existingOpportunity && existingOpportunity.length > 0);

  } catch (error) {
    console.error('Error updating opportunity:', error);
    throw error;
  }
}

// Reset selection for a specific opportunity
export const resetOpportunitySelection = async (opportunityId: string): Promise<void> => {
  try {
    if (!opportunityId) {
      throw new Error('Opportunity ID is required');
    }

    const { data: rpcResult, error } = await supabase.rpc('reset_opportunity_selection', {
      p_opportunity_id: opportunityId
    });

    if (error) {
      throw new Error(`Failed to reset selection: ${error.message}`);
    }

    if (!rpcResult || !rpcResult.success) {
      throw new Error(rpcResult?.error || 'Selection reset failed');
    }
  } catch (error) {
    console.error('Error resetting opportunity selection:', error);
    throw error;
  }
};

// Delete a bidding opportunity
export const deleteBidOpportunity = async (opportunityId: string): Promise<void> => {
  try {
    const { data: existingOpportunity, error: checkError } = await supabase
      .from('opportunities')
      .select('id, title, description')
      .eq('id', opportunityId)
      .single()

    if (checkError) {
      if (checkError.code === 'PGRST116') {
        return
      }
      throw new Error(`Failed to check opportunity existence: ${checkError.message}`)
    }

    if (!existingOpportunity) {
      return
    }

    const { error } = await supabase
      .from('opportunities')
      .delete()
      .eq('id', opportunityId)

    if (error) {
      throw new Error(`Failed to delete opportunity: ${error.message}`)
    }
  } catch (error) {
    console.error('Error deleting opportunity:', error)
    throw error
  }
}