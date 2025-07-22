import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EnhancedStudentUpload from "@/components/admin/EnhancedStudentUpload";
import RealtimeStudentManager from "@/components/admin/RealtimeStudentManager";
import { ClassConfig, Student } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { fetchClasses } from "@/lib/classService";

interface StudentsProps {
  currentClass: ClassConfig | null;
  onUpdateStudents: (students: Student[]) => void;
}

const Students = ({ currentClass, onUpdateStudents }: StudentsProps) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();
  
  if (!currentClass) {
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-heading font-bold mb-6">Manage Students</h1>
        <p className="text-center text-muted-foreground py-8">
          Please select a class to manage students
        </p>
      </div>
    );
  }

  const handleStudentUpload = async () => {
    // Refresh the student list from the database
    setIsRefreshing(true);
    try {
      const classes = await fetchClasses();
      const updatedClass = classes.find(c => c.id === currentClass.id);
      if (updatedClass) {
        onUpdateStudents(updatedClass.students);
      }
    } catch (error) {
      console.error("Error refreshing students:", error);
      toast({
        title: "Error refreshing data",
        description: "Failed to refresh student list from database",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRefreshStudents = async () => {
    setIsRefreshing(true);
    try {
      const classes = await fetchClasses();
      const updatedClass = classes.find(c => c.id === currentClass.id);
      if (updatedClass) {
        onUpdateStudents(updatedClass.students);
        toast({
          title: "Students refreshed",
          description: "Student list has been updated from the database",
        });
      }
    } catch (error) {
      console.error("Error refreshing students:", error);
      toast({
        title: "Error refreshing data",
        description: "Failed to refresh student list from database",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-heading font-bold">
          Manage Students - {currentClass.className}
        </h1>
        <Button 
          onClick={handleRefreshStudents} 
          disabled={isRefreshing}
          variant="outline"
        >
          {isRefreshing ? "Refreshing..." : "Refresh from Database"}
        </Button>
      </div>
      
      <Tabs defaultValue="manage" className="space-y-6">
        <TabsList>
          <TabsTrigger value="manage">Manage Students</TabsTrigger>
          <TabsTrigger value="upload">Upload Students</TabsTrigger>
        </TabsList>
        
        <TabsContent value="manage">
          <RealtimeStudentManager 
            currentClass={currentClass}
            onStudentUpdate={onUpdateStudents}
          />
        </TabsContent>
        
        <TabsContent value="upload">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <EnhancedStudentUpload 
              classId={currentClass.id}
              onUpload={handleStudentUpload} 
            />
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-heading">Upload Instructions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-sm">
                  <div>
                    <h4 className="font-medium mb-2">Required CSV Format:</h4>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      <li><strong>Name</strong> - Student's full name</li>
                      <li><strong>Email</strong> - Student's email address</li>
                      <li><strong>Student Number</strong> - Required for login</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">Token Management:</h4>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      <li>Each student starts with 1 available token</li>
                      <li>Tokens are used when students submit bids</li>
                      <li>Token status updates in real-time</li>
                      <li>Admin can monitor token usage live</li>
                    </ul>
                  </div>
                  
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Students;