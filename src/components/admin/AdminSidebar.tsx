import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ClassConfig } from "@/types";
import { cn } from "@/lib/utils";
import { 
  Plus,
  ChevronRight,
  BookOpen
} from "lucide-react";

interface AdminSidebarProps {
  classes: ClassConfig[];
  currentClass: ClassConfig | null;
  onSelectClass: (classId: string) => void;
  onCreateClass: () => void;
  isCollapsed?: boolean;
}

const AdminSidebar = ({ 
  classes, 
  currentClass, 
  onSelectClass, 
  onCreateClass,
  isCollapsed = false 
}: AdminSidebarProps) => {
  const [hoveredClass, setHoveredClass] = useState<string | null>(null);

  return (
    <div className={cn(
      "fixed left-0 top-16 h-[calc(100vh-64px)] bg-white border-r border-gray-200 shadow-sm transition-all duration-300 z-40",
      isCollapsed ? "w-16" : "w-80"
    )}>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            {!isCollapsed && (
              <h2 className="text-lg font-heading font-semibold text-gray-900">
                Classes
              </h2>
            )}
            <Button
              onClick={onCreateClass}
              size={isCollapsed ? "icon" : "sm"}
              className="bg-academy-blue hover:bg-academy-blue/90"
            >
              <Plus className="w-4 h-4" />
              {!isCollapsed && <span className="ml-2">New Class</span>}
            </Button>
          </div>
        </div>

        {/* Classes List */}
        <ScrollArea className="flex-1 p-2">
          <div className="space-y-2">
            {classes.length === 0 ? (
              <div className={cn(
                "text-center py-8",
                isCollapsed && "px-2"
              )}>
                {!isCollapsed ? (
                  <>
                    <BookOpen className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                    <p className="text-sm text-gray-500 mb-3">No classes yet</p>
                    <Button 
                      onClick={onCreateClass}
                      size="sm"
                      variant="outline"
                    >
                      Create First Class
                    </Button>
                  </>
                ) : (
                  <BookOpen className="w-6 h-6 mx-auto text-gray-400" />
                )}
              </div>
            ) : (
              classes.map((classItem) => (
                <Card
                  key={classItem.id}
                  className={cn(
                    "cursor-pointer transition-all duration-200 hover:shadow-md",
                    currentClass?.id === classItem.id 
                      ? "border-academy-blue bg-academy-blue/5 shadow-sm" 
                      : "border-gray-200 hover:border-gray-300",
                    isCollapsed && "p-2"
                  )}
                  onClick={() => onSelectClass(classItem.id)}
                  onMouseEnter={() => setHoveredClass(classItem.id)}
                  onMouseLeave={() => setHoveredClass(null)}
                >
                  {isCollapsed ? (
                    <div className="flex items-center justify-center p-2">
                      <div className="w-8 h-8 rounded-full bg-academy-blue/10 flex items-center justify-center">
                        <span className="text-sm font-semibold text-academy-blue">
                          {classItem.className.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base font-semibold text-gray-900 truncate">
                            {classItem.className}
                          </CardTitle>
                          {currentClass?.id === classItem.id && (
                            <ChevronRight className="w-4 h-4 text-academy-blue" />
                          )}
                        </div>
                      </CardHeader>
                    </>
                  )}
                </Card>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        {!isCollapsed && (
          <div className="p-4 border-t border-gray-100">
            <div className="text-xs text-gray-500 text-center">
              {classes.length} {classes.length === 1 ? 'class' : 'classes'} total
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminSidebar;