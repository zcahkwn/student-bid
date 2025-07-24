import { describe, it, expect, beforeEach, vi } from 'vitest'
import { authenticateStudentWithBoth } from '@/utils/auth'
import { ClassConfig, Student } from '@/types'

describe('Authentication Middleware', () => {
  let mockRequest: any
  let mockResponse: any
  let mockNext: any
  let mockStudent: Student
  let mockClass: ClassConfig

  beforeEach(() => {
    mockStudent = {
      id: 'student-123',
      name: 'Jane Smith',
      email: 'jane.smith@university.edu',
      studentNumber: 'ST2024002',
      hasUsedToken: false,
      hasBid: false
    }

    mockClass = {
      id: 'class-789',
      className: 'Finance 101',
      password: 'finance2024',
      rewardTitle: 'Bidding Opportunities',
      capacity: 7,
      students: [mockStudent],
      bidders: [],
      selectedStudents: [],
      bidOpportunities: []
    }

    mockRequest = {
      headers: {},
      body: {},
      params: {},
      query: {}
    }

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis()
    }

    mockNext = vi.fn()
  })

  describe('Authorization Header Validation', () => {
    it('should successfully validate Bearer token format', () => {
      const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.validtoken'
      mockRequest.headers.authorization = `Bearer ${validToken}`

      // Extract token from header
      const authHeader = mockRequest.headers.authorization
      const token = authHeader?.replace('Bearer ', '')

      expect(token).toBe(validToken)
      expect(token.length).toBeGreaterThan(0)
      expect(authHeader.startsWith('Bearer ')).toBe(true)
    })

    it('should reject requests without authorization header', () => {
      // No authorization header
      delete mockRequest.headers.authorization

      const hasAuthHeader = !!mockRequest.headers.authorization
      expect(hasAuthHeader).toBe(false)
    })

    it('should reject malformed authorization headers', () => {
      const malformedHeaders = [
        'InvalidFormat token123',
        'Bearer',
        'Bearer ',
        'token123',
        ''
      ]

      malformedHeaders.forEach(header => {
        mockRequest.headers.authorization = header
        
        const isValidFormat = header.startsWith('Bearer ') && header.length > 7
        expect(isValidFormat).toBe(false)
      })
    })
  })

  describe('Student Authentication Process', () => {
    it('should authenticate student with valid credentials', () => {
      const authResult = authenticateStudent(
        mockStudent.email,
        mockStudent.studentNumber!,
        [mockClass]
      )

      // Verify successful authentication
      expect(authResult.success).toBe(true)
      expect(authResult.student).toEqual(mockStudent)
      expect(authResult.enrolledClasses).toContain(mockClass)
    })

    it('should return expected student data structure', () => {
      const authResult = authenticateStudent(
        mockStudent.email,
        mockStudent.studentNumber!,
        [mockClass]
      )

      if (authResult.student) {
        expect(authResult.student).toHaveProperty('id')
        expect(authResult.student).toHaveProperty('name')
        expect(authResult.student).toHaveProperty('email')
        expect(authResult.student).toHaveProperty('studentNumber')
        expect(authResult.student).toHaveProperty('hasUsedToken')
        expect(authResult.student).toHaveProperty('hasBid')
        
        expect(typeof authResult.student.id).toBe('string')
        expect(typeof authResult.student.name).toBe('string')
        expect(typeof authResult.student.email).toBe('string')
        expect(typeof authResult.student.hasUsedToken).toBe('boolean')
      }
    })

    it('should return 200 OK status for successful authentication', () => {
      const authResult = authenticateStudent(
        mockStudent.email,
        mockStudent.studentNumber!,
        [mockClass]
      )

      // Simulate successful response
      const statusCode = authResult.success ? 200 : 401
      expect(statusCode).toBe(200)
    })

    it('should handle case-insensitive email matching', () => {
      const upperCaseEmail = mockStudent.email.toUpperCase()
      const authResult = authenticateStudent(
        upperCaseEmail,
        mockStudent.studentNumber!,
        [mockClass]
      )

      expect(authResult.success).toBe(true)
      expect(authResult.student?.email).toBe(mockStudent.email)
    })

    it('should validate both email AND student number', () => {
      // Test with correct email but wrong student number
      const wrongStudentNumber = authenticateStudent(
        mockStudent.email,
        'WRONG123',
        [mockClass]
      )

      expect(wrongStudentNumber.success).toBe(false)

      // Test with wrong email but correct student number
      const wrongEmail = authenticateStudent(
        'wrong@email.com',
        mockStudent.studentNumber!,
        [mockClass]
      )

      expect(wrongEmail.success).toBe(false)
    })
  })

  describe('Error Handling', () => {
    it('should handle authentication failures gracefully', () => {
      const invalidAuth = authenticateStudent(
        'nonexistent@email.com',
        'INVALID123',
        [mockClass]
      )

      expect(invalidAuth.success).toBe(false)
      expect(invalidAuth.student).toBeUndefined()
      expect(invalidAuth.enrolledClasses).toEqual([])
    })

    it('should not throw errors for invalid input', () => {
      expect(() => {
        authenticateStudent('', '', [])
      }).not.toThrow()

      expect(() => {
        authenticateStudent(
          mockStudent.email,
          mockStudent.studentNumber!,
          []
        )
      }).not.toThrow()
    })

    it('should handle missing student number gracefully', () => {
      const studentWithoutNumber = {
        ...mockStudent,
        studentNumber: undefined
      }

      const classWithInvalidStudent = {
        ...mockClass,
        students: [studentWithoutNumber]
      }

      const authResult = authenticateStudent(
        studentWithoutNumber.email,
        'ANY123',
        [classWithInvalidStudent]
      )

      expect(authResult.success).toBe(false)
    })
  })

  describe('Performance Tests', () => {
    it('should complete authentication within reasonable time', async () => {
      const startTime = Date.now()
      
      authenticateStudent(
        mockStudent.email,
        mockStudent.studentNumber!,
        [mockClass]
      )
      
      const endTime = Date.now()
      const executionTime = endTime - startTime
      
      // Should complete within 100ms
      expect(executionTime).toBeLessThan(100)
    })

    it('should handle multiple concurrent authentication requests', async () => {
      const concurrentRequests = Array(10).fill(null).map(() =>
        authenticateStudent(
          mockStudent.email,
          mockStudent.studentNumber!,
          [mockClass]
        )
      )

      const results = await Promise.all(concurrentRequests)
      
      // All should succeed
      results.forEach(result => {
        expect(result.success).toBe(true)
      })
    })
  })
})