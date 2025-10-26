import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertTriangle, Trash2 } from "lucide-react";
import { Student } from "@/types";
import { removeStudentFromClass } from "@/lib/userService";
import { useToast } from "@/hooks/use-toast";

interface RemoveStudentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: Student | null;
  classId: string;
  onStudentRemoved: () => void;
}

const RemoveStudentDialog = ({
  open,
  onOpenChange,
  student,
  classId,
  onStudentRemoved
}: RemoveStudentDialogProps) => {
  const [isRemoving, setIsRemoving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { toast } = useToast();

  const handleConfirmRemove = async () => {
    if (!student) return;

    setIsRemoving(true);
    setErrorMessage(null);

    try {
      const result = await removeStudentFromClass(student.id, classId);

      if (!result.success) {
        if (result.hasBids) {
          setErrorMessage("Student cannot be removed since they have already placed a bid");
        } else {
          setErrorMessage(result.error || "Failed to remove student");
        }
        return;
      }

      const removalMessage = result.userDeleted
        ? `${student.name} has been removed from the class and their account has been deleted`
        : `${student.name} has been removed from the class`;

      toast({
        title: "Student Removed",
        description: removalMessage,
      });

      onStudentRemoved();
      onOpenChange(false);
    } catch (error) {
      console.error('Error removing student:', error);
      setErrorMessage(error instanceof Error ? error.message : "An unexpected error occurred");
    } finally {
      setIsRemoving(false);
    }
  };

  const handleCancel = () => {
    setErrorMessage(null);
    onOpenChange(false);
  };

  if (!student) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-destructive" />
            Remove Student
          </DialogTitle>
          <DialogDescription>
            This action will remove the student from this class.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <p className="text-sm">
              <span className="font-medium">Name:</span> {student.name}
            </p>
            <p className="text-sm">
              <span className="font-medium">Email:</span> {student.email}
            </p>
            <p className="text-sm">
              <span className="font-medium">Student Number:</span> {student.studentNumber || 'N/A'}
            </p>
          </div>

          {errorMessage ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Are you sure you want to remove this student from the class? This action cannot be undone.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isRemoving}
          >
            {errorMessage ? "Close" : "Cancel"}
          </Button>
          {!errorMessage && (
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmRemove}
              disabled={isRemoving}
            >
              {isRemoving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removing...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remove Student
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RemoveStudentDialog;
