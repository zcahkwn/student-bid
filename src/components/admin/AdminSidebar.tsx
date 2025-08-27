import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ClassConfig } from "@/types";
import { cn } from "@/lib/utils";
import { 
  Plus,
  ChevronRight,
  BookOpen,
  ArchiveRestore,
  Loader2
} from "lucide-react";

interface AdminSidebarProps {
  classes: ClassConfig[];
  archivedClasses: ClassConfig[];
  currentClass: ClassConfig | null;
  onSelectClass: (classId: string) => void;
  onCreateClass: () => void;
  isCollapsed?: boolean;
  viewArchivedClasses: boolean;
  onToggleArchiveView: (isArchived: boolean) => void;
  onUnarchiveClass?: (classId: string, isArchived: boolean) => void;
}

const AdminSidebar = ({ 
  classes, 
  archivedClasses,
  currentClass, 
  onSelectClass, 
  onCreateClass,
  isCollapsed = false,
  viewArchivedClasses,
  onToggleArchiveView,
  onUnarchiveClass
}: AdminSidebarProps) => {
  const [hoveredClass, setHoveredClass] = useState<string | null>(null);
  const [unarchivingClassId, setUnarchivingClassId] = useState<string | null>(null);
  
  const displayedClasses = viewArchivedClasses ? archivedClasses : classes;
  const totalActiveClasses = classes.length;
  const totalArchivedClasses = archivedClasses.length;

  const handleUnarchive = async (classId: string) => {
    if (!onUnarchiveClass) return;
    
    setUnarchivingClassId(classId);
    try {
      await onUnarchiveClass(classId, false);
    } finally {
      setUnarchivingClassId(null);
    }
  };
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
                {viewArchivedClasses ? "Archived Classes" : "Active Classes"}
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
        
        {/* Archive Toggle */}
        {!isCollapsed && (
          <div className="px-4 pb-2">
            <div className="flex gap-2">
              <Button
                variant={!viewArchivedClasses ? "default" : "outline"}
                size="sm"
                onClick={() => onToggleArchiveView(false)}
                className="flex-1 text-xs"
              >
                Active ({totalActiveClasses})
              </Button>
              <Button
                variant={viewArchivedClasses ? "default" : "outline"}
                size="sm"
                onClick={() => onToggleArchiveView(true)}
                className="flex-1 text-xs"
              >
                Archive ({totalArchivedClasses})
              </Button>
            </div>
          </div>
        )}

        {/* Classes List */}
        <ScrollArea className="flex-1 p-2">
          <div className="space-y-2">
            {displayedClasses.length === 0 ? (
              <div className={cn(
                "text-center py-8",
                isCollapsed && "px-2"
              )}>
                {!isCollapsed ? (
                  <>
                    <BookOpen className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                    <p className="text-sm text-gray-500 mb-3">
                      {viewArchivedClasses 
                        ? "No archived classes" 
                        : "No active classes"
                      }</p>
                    {!viewArchivedClasses && (
                      <Button 
                        onClick={onCreateClass}
                        size="sm"
                        variant="outline"
                      >
                        Create First Class
                      </Button>
                    )}
                  </>
                ) : (
                  <BookOpen className="w-6 h-6 mx-auto text-gray-400" />
                )}
              </div>
            ) : (
              displayedClasses.map((classItem) => (
                <Card
                  key={classItem.id}
                  className={cn(
                    "cursor-pointer transition-all duration-200 hover:shadow-md",
                    currentClass?.id === classItem.id 
                      ? "border-academy-blue bg-academy-blue/5 shadow-sm" 
                      : "border-gray-200 hover:border-gray-300",
                    viewArchivedClasses && "opacity-75",
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
                          <div className="flex items-center gap-2">
                            {viewArchivedClasses && (
                              <>
                                <Badge variant="secondary" className="text-xs">
                                  Archived
                                </Badge>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUnarchive(classItem.id);
                                  }}
                                  disabled={unarchivingClassId === classItem.id || viewArchivedClasses}
                                  className="h-6 px-2 text-xs"
                                >
                                  {unarchivingClassId === classItem.id ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : viewArchivedClasses ? (
                                    <ArchiveRestore className="w-3 h-3" />
                                  ) : (
                                    <ArchiveRestore className="w-3 h-3" />
                                  )}
                                </Button>
                              </>
                            )}
                          </div>
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
              {/* {displayedClasses.length} {viewArchivedClasses ? 'archived' : 'active'} {displayedClasses.length === 1 ? 'class' : 'classes'}
              <br /> */}
              {totalActiveClasses} active classes • {totalArchivedClasses} archived classes
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminSidebar;