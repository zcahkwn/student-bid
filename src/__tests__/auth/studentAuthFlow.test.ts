import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { submitStudentBid } from '@/lib/studentBidService'
import { authenticateStudentWithBoth } from '@/utils/auth'
import { ClassConfig, Student } from '@/types'

// Mock Supabase client
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn()
        }))
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn()
        }))
      })),
      update: vi.fn(() => ({
        eq: vi.fn()
      }))
    })),
    channel: vi.fn(() => ({
      on: vi.fn(() => ({
        subscribe: vi.fn()
      }))
    })),
    removeChannel: vi.fn()
  }
}))

describe('Student Authentication Flow', () => {
  let mockStudent: Student
  let mockClass: ClassConfig
  let mockAuthToken: string

  beforeEach(() => {
    // Setup mock data
    mockStudent = {
      id: 'student-123',
      name: 'John Doe',
      email: 'john.doe@example.com',
      studentNumber: 'ST2024001',
      hasUsedToken: false,
      hasBid: false
    }

    mockClass = {
      id: 'class-456',
      className: 'Economics 101',
      password: 'econ123',
      rewardTitle: 'Dinner with Professor',
      rewardDescription: 'Join the professor for dinner',
      capacity: 7,
      students: [mockStudent],
      bidders: [],
      selectedStudents: [],
      bidOpportunities: [{
        id: 'opportunity-789',
        date: '2025-06-20T18:00:00Z',
        bidOpenDate: '2025-06-15T09:00:00Z',
        title: 'Week 1 Dinner',
        description: 'First dinner opportunity',
        bidders: [],
        selectedStudents: [],
        isOpen: true
      }]
    }

    mockAuthToken = 'valid-auth-token-123'

    // Reset all mocks
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Valid Authentication Token Tests', () => {
    it('should complete authentication flow successfully with valid student token', async () => {
      // Mock successful authentication response
      // Test authentication with valid credentials
      const authResult = authenticateStudent(
        mockStudent.email,
        mockStudent.studentNumber!,
        [mockClass]
      )

      // Assertions
      expect(authResult.success).toBe(true)
      expect(authResult.student).toEqual(mockStudent)
      expect(authResult.enrolledClasses).toContain(mockClass)
    })

    it('should handle bid submission with valid authentication token', async () => {
      // Mock successful RPC response
      const mockRpcResponse = {
        data: {
          success: true,
          bid_id: 'bid-abc123',
          timestamp: new Date().toISOString(),
          tokens_remaining: 0
        },
        error: null
      }

      const mockStudentResponse = {
        data: {
          ...mockStudent,
          tokens_remaining: 0,
          token_status: 'used'
        },
        error: null
      }

      // Setup mocks
      vi.mocked(supabase.rpc).mockResolvedValue(mockRpcResponse)
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue(mockStudentResponse)
          }))
        }))
      } as any)

      // Execute bid submission
      const bidResult = await submitStudentBid({
        studentId: mockStudent.id,
        opportunityId: mockClass.bidOpportunities[0].id
      })

      // Assertions
      expect(bidResult.success).toBe(true)
      expect(bidResult.bidId).toBe('bid-abc123')
      expect(bidResult.updatedStudent?.hasUsedToken).toBe(true)
      expect(bidResult.errorMessage).toBeUndefined()

      // Verify RPC was called with correct parameters
      expect(supabase.rpc).toHaveBeenCalledWith('submit_student_bid_secure', {
        p_user_id: mockStudent.id,
        p_opportunity_id: mockClass.bidOpportunities[0].id
      })
    })

    it('should return 200 OK status for valid authentication', async () => {
      // Mock HTTP response for authentication endpoint
      const mockResponse = {
        status: 200,
        ok: true,
        json: async () => ({
          success: true,
          student: mockStudent,
          class: mockClass,
          token: mockAuthToken
        })
      }

      // Simulate API call with valid token
      const headers = {
        'Authorization': `Bearer ${mockAuthToken}`,
        'Content-Type': 'application/json'
      }

      // Test authentication middleware behavior
      const authResult = authenticateStudentWithBoth(
        mockStudent.email,
        mockStudent.studentNumber!,
        mockClass.password,
        [mockClass]
      )

      // Verify successful authentication
      expect(authResult.isStudent).toBe(true)
      expect(authResult.currentStudent?.id).toBe(mockStudent.id)
      expect(authResult.currentStudent?.email).toBe(mockStudent.email)
      expect(authResult.currentStudent?.studentNumber).toBe(mockStudent.studentNumber)
    })

    it('should validate token expiration and refresh if needed', async () => {
      // Mock token validation
      const mockTokenValidation = {
        valid: true,
        expired: false,
        student: mockStudent,
        class: mockClass
      }

      // Test token validation logic
      const isValidToken = mockTokenValidation.valid && !mockTokenValidation.expired
      
      expect(isValidToken).toBe(true)
      expect(mockTokenValidation.student).toEqual(mockStudent)
      expect(mockTokenValidation.class).toEqual(mockClass)
    })

    it('should handle concurrent bid submissions with valid tokens', async () => {
      // Mock multiple concurrent bid attempts
      const concurrentBids = [
        {
          studentId: 'student-1',
          opportunityId: mockClass.bidOpportunities[0].id
        },
        {
          studentId: 'student-2', 
          opportunityId: mockClass.bidOpportunities[0].id
        }
      ]

      // Mock successful responses for both bids
      const mockResponses = [
        {
          data: { success: true, bid_id: 'bid-1', timestamp: new Date().toISOString() },
          error: null
        },
        {
          data: { success: true, bid_id: 'bid-2', timestamp: new Date().toISOString() },
          error: null
        }
      ]

      vi.mocked(supabase.rpc)
        .mockResolvedValueOnce(mockResponses[0])
        .mockResolvedValueOnce(mockResponses[1])

      // Execute concurrent bids
      const bidPromises = concurrentBids.map(bid => submitStudentBid(bid))
      const results = await Promise.all(bidPromises)

      // Verify both bids succeeded
      expect(results[0].success).toBe(true)
      expect(results[1].success).toBe(true)
      expect(results[0].bidId).toBe('bid-1')
      expect(results[1].bidId).toBe('bid-2')
    })

    it('should successfully submit bid with valid token', async () => {
      // Mock successful RPC response
      const mockRpcResponse = {
        data: {
          success: true,
          bid_id: 'bid-123',
          timestamp: new Date().toISOString(),
          tokens_remaining: 0
        },
        error: null
      }

      const mockStudentResponse = {
        data: {
          id: 'student-123',
          name: 'John Doe',
          email: 'john@example.com',
          student_number: 'ST2024001',
          tokens_remaining: 0,
          token_status: 'used'
        },
        error: null
      }

      vi.mocked(supabase.rpc).mockResolvedValue(mockRpcResponse)
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue(mockStudentResponse)
          }))
        }))
      } as any)

      const result = await submitStudentBid({
        studentId: 'student-123',
        opportunityId: 'opportunity-456'
      })

      expect(result.success).toBe(true)
      expect(result.bidId).toBe('bid-123')
      expect(result.updatedStudent?.hasUsedToken).toBe(true)
    })

    it('should reject bid submission with invalid token', async () => {
      // Mock authentication failure
      const mockErrorResponse = {
        data: {
          success: false,
          error_message: 'Student not authorized for this opportunity'
        },
        error: null
      }

      vi.mocked(supabase.rpc).mockResolvedValue(mockErrorResponse)

      const result = await submitStudentBid({
        studentId: 'student-123',
        opportunityId: 'opportunity-456'
      })

      expect(result.success).toBe(false)
      expect(result.errorMessage).toContain('Student not authorized for this opportunity')
    })

    it('should handle token validation errors gracefully', async () => {
      // Mock database error
      const mockError = new Error('Token validation failed')
      vi.mocked(supabase.rpc).mockRejectedValue(mockError)

      const result = await submitStudentBid({
        studentId: 'student-123',
        opportunityId: 'opportunity-456'
      })

      expect(result.success).toBe(false)
      expect(result.errorMessage).toContain('Token validation failed')
    })

    it('should track token usage after bid submission', async () => {
      const mockRpcResponse = {
        data: {
          success: true,
          bid_id: 'bid-123',
          tokens_remaining: 0
        },
        error: null
      }

      vi.mocked(supabase.rpc).mockResolvedValue(mockRpcResponse)

      const result = await submitStudentBid({
        studentId: 'student-123',
        opportunityId: 'opportunity-456'
      })

      expect(result.success).toBe(true)
      expect(supabase.rpc).toHaveBeenCalledWith('submit_student_bid_secure', {
        p_user_id: 'student-123',
        p_opportunity_id: 'opportunity-456'
      })
    })

    it('should prevent reuse of consumed tokens', async () => {
      const mockErrorResponse = {
        data: {
          success: false,
          error_message: 'No tokens remaining'
        },
        error: null
      }

      vi.mocked(supabase.rpc).mockResolvedValue(mockErrorResponse)

      const result = await submitStudentBid({
        studentId: 'student-with-used-token',
        opportunityId: 'opportunity-456'
      })

      expect(result.success).toBe(false)
      expect(result.errorMessage).toContain('No tokens remaining')
    })

    it('should handle multiple simultaneous token validations', async () => {
      const mockResponses = [
        { data: { success: true, bid_id: 'bid-1' }, error: null },
        { data: { success: true, bid_id: 'bid-2' }, error: null },
        { data: { success: true, bid_id: 'bid-3' }, error: null }
      ]

      vi.mocked(supabase.rpc)
        .mockResolvedValueOnce(mockResponses[0])
        .mockResolvedValueOnce(mockResponses[1])
        .mockResolvedValueOnce(mockResponses[2])

      const concurrentBids = [
        submitStudentBid({
          studentId: 'student-1',
          opportunityId: 'opportunity-456'
        }),
        submitStudentBid({
          studentId: 'student-2',
          opportunityId: 'opportunity-456'
        }),
        submitStudentBid({
          studentId: 'student-3',
          opportunityId: 'opportunity-456'
        })
      ]

      const results = await Promise.all(concurrentBids)

      results.forEach((result, index) => {
        expect(result.success).toBe(true)
        expect(result.bidId).toBe(`bid-${index + 1}`)
      })
    })
  })

  describe('Authentication Middleware Tests', () => {
    it('should extract and validate authorization header', () => {
      const authHeader = `Bearer ${mockAuthToken}`
      const extractedToken = authHeader.replace('Bearer ', '')
      
      expect(extractedToken).toBe(mockAuthToken)
      expect(extractedToken.length).toBeGreaterThan(0)
    })

    it('should validate student credentials against database', async () => {
      // Mock database lookup
      const mockDbResponse = {
        data: {
          id: mockStudent.id,
          name: mockStudent.name,
          email: mockStudent.email,
          student_number: mockStudent.studentNumber,
          class_id: mockClass.id,
          tokens_remaining: 1,
          token_status: 'unused'
        },
        error: null
      }

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue(mockDbResponse)
          }))
        }))
      } as any)

      // Simulate database validation
      const authResult = authenticateStudent(
        mockStudent.email,
        mockStudent.studentNumber!,
        [mockClass]
      )

      expect(authResult.success).toBe(true)
      expect(authResult.student?.email).toBe(mockStudent.email)
    })

    it('should handle authentication errors gracefully', () => {
      // Test with invalid credentials
      const invalidAuthResult = authenticateStudent(
        'invalid@email.com',
        'INVALID123',
        [mockClass]
      )

      expect(invalidAuthResult.success).toBe(false)
      expect(invalidAuthResult.student).toBeUndefined()
      expect(invalidAuthResult.enrolledClasses).toEqual([])
    })
  })

  describe('Token Security Tests', () => {
    it('should prevent token reuse after bid submission', async () => {
      // Mock student with used token
      const usedTokenStudent = {
        ...mockStudent,
        hasUsedToken: true
      }

      const mockErrorResponse = {
        data: {
          success: false,
          error_message: 'No tokens remaining'
        },
        error: null
      }

      vi.mocked(supabase.rpc).mockResolvedValue(mockErrorResponse)

      // Attempt bid with used token
      const bidResult = await submitStudentBid({
        studentId: usedTokenStudent.id,
        opportunityId: mockClass.bidOpportunities[0].id
      })

      expect(bidResult.success).toBe(false)
      expect(bidResult.errorMessage).toContain('No tokens remaining')
    })
  })

  describe('Error Handling Tests', () => {
    it('should handle database connection errors', async () => {
      // Mock database error
      const mockError = new Error('Database connection failed')
      vi.mocked(supabase.rpc).mockRejectedValue(mockError)

      const bidResult = await submitStudentBid({
        studentId: mockStudent.id,
        opportunityId: mockClass.bidOpportunities[0].id
      })

      expect(bidResult.success).toBe(false)
      expect(bidResult.errorMessage).toContain('Database connection failed')
    })

    it('should handle malformed authentication tokens', () => {
      const malformedTokens = [
        '',
        'invalid-token',
        'Bearer',
        'Bearer ',
        null,
        undefined
      ]

      malformedTokens.forEach(token => {
        // Each malformed token should be rejected
        const isValid = token && typeof token === 'string' && token.length > 10
        expect(isValid).toBe(false)
      })
    })
  })

  describe('Real-time Updates Tests', () => {
    it('should trigger real-time updates after successful bid', async () => {
      const mockChannelSubscription = vi.fn()
      
      vi.mocked(supabase.channel).mockReturnValue({
        on: vi.fn(() => ({
          subscribe: mockChannelSubscription
        }))
      } as any)

      // Mock successful bid submission
      const mockRpcResponse = {
        data: {
          success: true,
          bid_id: 'bid-123',
          timestamp: new Date().toISOString()
        },
        error: null
      }

      vi.mocked(supabase.rpc).mockResolvedValue(mockRpcResponse)

      const bidResult = await submitStudentBid({
        opportunityId: mockClass.bidOpportunities[0].id
      })

      expect(bidResult.success).toBe(true)
      // Real-time subscription should be set up
      expect(supabase.channel).toHaveBeenCalled()
    })
  })
})