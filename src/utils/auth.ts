import { Student, ClassConfig, User } from "@/types";
import { getUserByCredentials, getUserEnrollments, getClassStudents } from "@/lib/userService";


// Student authentication using email and student number with normalized schema
export const authenticateStudent = async (
  email: string,
  studentNumber: string
): Promise<{
  success: boolean;
  student?: Student;
  enrolledClassIds: string[];
  errorMessage?: string;
}> => {
  try {
    const user = await getUserByCredentials(email, studentNumber);

    if (!user) {
      return {
        success: false,
        enrolledClassIds: [],
        errorMessage: "No student found with these credentials"
      };
    }

    const enrollments = await getUserEnrollments(user.id);

    if (enrollments.length === 0) {
      return {
        success: false,
        enrolledClassIds: [],
        errorMessage: "Student is not enrolled in any classes"
      };
    }

    const enrolledClassIds = enrollments.map(e => e.classId);

    const foundStudent: Student = {
      id: user.id,
      name: user.name,
      email: user.email,
      studentNumber: user.studentNumber,
      enrollments: enrollments
    };

    return {
      success: true,
      student: foundStudent,
      enrolledClassIds
    };
  } catch (error) {
    console.error('Error during student authentication:', error);
    return {
      success: false,
      enrolledClassIds: [],
      errorMessage: "Authentication failed due to system error"
    };
  }
};
