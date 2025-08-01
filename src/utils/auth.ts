import { Student, ClassConfig, User } from "@/types";
import { getUserByCredentials, getUserEnrollments, getClassStudents } from "@/lib/userService";


// Student authentication using email and student number with normalized schema
export const authenticateStudent = async (
  email: string,
  studentNumber: string,
  classes: ClassConfig[]
): Promise<{ 
  success: boolean; 
  student?: Student; 
  enrolledClasses: ClassConfig[];
  errorMessage?: string;
}> => {
  try {
    // Get user by credentials from the normalized schema
    const user = await getUserByCredentials(email, studentNumber);
    
    if (!user) {
      return {
        success: false,
        enrolledClasses: [],
        errorMessage: "No student found with these credentials"
      };
    }

    // Get user's enrollments
    const enrollments = await getUserEnrollments(user.id);
    
    if (enrollments.length === 0) {
      return {
        success: false,
        enrolledClasses: [],
        errorMessage: "Student is not enrolled in any classes"
      };
    }

    // Find the classes the user is enrolled in
    const enrolledClasses: ClassConfig[] = [];
    
    for (const enrollment of enrollments) {
      const classConfig = classes.find(c => c.id === enrollment.classId);
      if (classConfig) {
        // Create a student object for this specific class enrollment
        const studentForClass: Student = {
          id: user.id,
          name: user.name,
          email: user.email,
          studentNumber: user.studentNumber,
          hasUsedToken: enrollment.tokensRemaining <= 0,
          hasBid: enrollment.tokenStatus === 'used',
          tokensRemaining: enrollment.tokensRemaining,
          tokenStatus: enrollment.tokenStatus,
          biddingResult: enrollment.biddingResult
        };
        
        // Update the class config with the student's enrollment-specific data
        const updatedClassConfig = {
          ...classConfig,
          students: classConfig.students.map(s => 
            s.id === user.id ? studentForClass : s
          )
        };
        
        enrolledClasses.push(updatedClassConfig);
      }
    }

    if (enrolledClasses.length === 0) {
      return {
        success: false,
        enrolledClasses: [],
        errorMessage: "Student's enrolled classes are not available"
      };
    }

    // Use the first enrollment for the primary student object
    const foundStudent: Student = {
      id: user.id,
      name: user.name,
      email: user.email,
      studentNumber: user.studentNumber,
      // Token-related fields are now undefined for the main student object
      // They must be looked up from specific class enrollments
      enrollments: enrollments
    };

    return {
      success: true,
      student: foundStudent,
      enrolledClasses
    };
  } catch (error) {
    console.error('Error during student authentication:', error);
    return {
      success: false,
      enrolledClasses: [],
      errorMessage: "Authentication failed due to system error"
    };
  }
};
