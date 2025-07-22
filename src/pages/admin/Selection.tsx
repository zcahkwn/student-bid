import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import RealtimeSelectionProcess from "@/components/admin/RealtimeSelectionProcess";
import { ClassConfig, Student } from "@/types";
import { useToast } from "@/hooks/use-toast";

interface SelectionProps {
  currentClass: ClassConfig | null;
  onSelectionComplete: (selectedStudents: Student[], opportunityId?: string) => void;
}

const Selection = ({ currentClass, onSelectionComplete }: SelectionProps) => {
  const { toast } = useToast();

  const handleSelectionComplete = (selectedStudents: Student[], opportunityId?: string) => {
    // Store the selection results in localStorage
    const storedClassesStr = localStorage.getItem("classData");
    if (storedClassesStr) {
      try {
        const storedClasses = JSON.parse(storedClassesStr);
        const updatedClasses = storedClasses.map((c: ClassConfig) => {
          if (c.id === currentClass?.id) {
            // First update the class-level selectedStudents for backward compatibility
            const updatedClass = { ...c, selectedStudents };
            
            // If an opportunity ID is provided, update that specific opportunity
            if (opportunityId && c.bidOpportunities) {
              updatedClass.bidOpportunities = c.bidOpportunities.map(opp => {
                if (opp.id === opportunityId) {
                  return { ...opp, selectedStudents };
                }
                return opp;
              });
            }
            return updatedClass;
          }
          return c;
        });
        
        // Save updated classes back to localStorage
        localStorage.setItem("classData", JSON.stringify(updatedClasses));
        
        console.log("Selection results saved to localStorage:", { selectedStudents, opportunityId });
      } catch (error) {
        console.error("Error updating class data:", error);
      }
    }
    
    // Call the parent handler to update global state
    onSelectionComplete(selectedStudents, opportunityId);
    
    toast({
      title: "Selection saved",
      description: `The selection results have been saved and are now visible to students.`,
    });
  };

  if (!currentClass) {
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-heading font-bold mb-6">Selection Process</h1>
        <p className="text-center text-muted-foreground py-8">
          Please select a class to run the selection process
        </p>
      </div>
    );
  }

  if (!currentClass.bidOpportunities || currentClass.bidOpportunities.length === 0) {
    if (currentClass.bidders.length === 0) {
      return (
        <div className="container mx-auto p-4">
          <h1 className="text-2xl font-heading font-bold mb-6">
            Selection Process - {currentClass.className}
          </h1>
          <Card>
            <CardContent className="p-8 text-center">
              <h2 className="text-xl mb-4">No bids available</h2>
              <p className="text-muted-foreground mb-4">
                No students have placed a bid for the current reward yet.
              </p>
            </CardContent>
          </Card>
        </div>
      );
    }
  }

  return (
    <div>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-heading font-bold">
          Selection Process - {currentClass.className}
        </h1>
        <p className="text-muted-foreground">
          Monitor real-time bids and conduct random selection
        </p>
      </div>
      
      <RealtimeSelectionProcess 
        currentClass={currentClass} 
        onSelectionComplete={handleSelectionComplete} 
      />
    </div>
  );
};

export default Selection;