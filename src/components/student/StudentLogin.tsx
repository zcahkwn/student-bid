import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ClassConfig, Student } from "@/types";
import { useNavigate } from "react-router-dom";
import { authenticateStudent } from "@/utils/auth";

interface StudentLoginProps {
  classes: ClassConfig[];
  onLogin: (success: boolean) => void;
}

const StudentLogin = ({ classes, onLogin }: StudentLoginProps) => {
  const [email, setEmail] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Use the new normalized authentication
      const authResult = await authenticateStudent(email, studentNumber, classes);
      
      if (authResult.success && authResult.student && authResult.enrolledClasses.length > 0) {
        toast({
          title: "Login successful",
          description: `Welcome, ${authResult.student.name}! Found ${authResult.enrolledClasses.length} class(es).`,
        });
        onLogin(true);
        
        // Navigate to the student dashboard with student and classes data
        navigate("/student", { 
          state: { 
            student: authResult.student,
            classes: authResult.enrolledClasses
          }
        });
      } else {
        toast({
          title: "Login failed",
          description: authResult.errorMessage || "Invalid email or student number. Please check your credentials.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Login error:', error);
      toast({
        title: "Login failed",
        description: "An error occurred during login. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl font-heading">Student Login</CardTitle>
        <CardDescription>
          Enter your email address and student number to access your classes
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your.email@example.com"
              required
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="studentNumber">Student Number</Label>
            <Input
              id="studentNumber"
              type="text"
              value={studentNumber}
              onChange={(e) => setStudentNumber(e.target.value)}
              placeholder="Enter your student number"
              required
              disabled={isLoading}
            />
          </div>
          <div className="text-sm text-muted-foreground">
            <p>You will see all classes you're enrolled in after logging in.</p>
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Logging in..." : "Login"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
};

export default StudentLogin;