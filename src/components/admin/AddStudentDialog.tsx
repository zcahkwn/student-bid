import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { createOrGetUser, enrollUserInClass } from "@/lib/userService";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";

interface AddStudentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  onStudentAdded: () => void;
}

const AddStudentDialog = ({ open, onOpenChange, classId, onStudentAdded }: AddStudentDialogProps) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !email.trim() || !studentNumber.trim()) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    if (!validateEmail(email)) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: existingEnrollment } = await supabase
        .from('student_enrollments')
        .select('user_id')
        .eq('class_id', classId)
        .eq('user_id', (
          await supabase
            .from('users')
            .select('id')
            .eq('email', email.toLowerCase())
            .maybeSingle()
        )?.data?.id || '')
        .maybeSingle();

      if (existingEnrollment) {
        toast({
          title: "Student Already Enrolled",
          description: "This student is already enrolled in this class",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }

      const user = await createOrGetUser({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        studentNumber: studentNumber.trim(),
      });

      const { data: duplicateCheck } = await supabase
        .from('student_enrollments')
        .select('user_id')
        .eq('class_id', classId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (duplicateCheck) {
        toast({
          title: "Student Already Enrolled",
          description: "This student is already enrolled in this class",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }

      await enrollUserInClass({
        userId: user.id,
        classId: classId,
        tokensRemaining: 1,
        tokenStatus: 'unused',
        biddingResult: 'pending',
      });

      toast({
        title: "Student Added",
        description: `${name} has been successfully added to the class`,
      });

      setName("");
      setEmail("");
      setStudentNumber("");

      onStudentAdded();
      onOpenChange(false);
    } catch (error) {
      console.error('Error adding student:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add student. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setName("");
    setEmail("");
    setStudentNumber("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Student</DialogTitle>
          <DialogDescription>
            Add a new student to this class. Enter their information below.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">
                Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter student's full name"
                disabled={isSubmitting}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="email">
                Email <span className="text-red-500">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter student's email"
                disabled={isSubmitting}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="studentNumber">
                Student Number <span className="text-red-500">*</span>
              </Label>
              <Input
                id="studentNumber"
                value={studentNumber}
                onChange={(e) => setStudentNumber(e.target.value)}
                placeholder="Enter student number"
                disabled={isSubmitting}
                required
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add Student"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddStudentDialog;
